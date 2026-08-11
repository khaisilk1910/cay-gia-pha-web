'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const BACKUP_MAGIC = Buffer.from('CGPBAK02', 'ascii');
const ARCHIVE_MAGIC = Buffer.from('CGPDAT02', 'ascii');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const OUTER_HEADER_BYTES = BACKUP_MAGIC.length + SALT_BYTES + IV_BYTES;
const ENTRY_HEADER_BYTES = 25;
const MAX_ENTRY_PATH_BYTES = 4096;
const MAX_ENTRY_COUNT = 200000;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function validateBackupPassword(password) {
  const value = String(password ?? '');
  const length = Array.from(value).length;
  if (length < 8) throw new Error('Mật khẩu bản sao lưu cần ít nhất 8 ký tự. Nên dùng từ 12 ký tự trở lên.');
  if (length > 200) throw new Error('Mật khẩu bản sao lưu quá dài.');
  return value;
}

function deriveKey(password, salt) {
  return crypto.scryptSync(validateBackupPassword(password), salt, 32, SCRYPT_OPTIONS);
}

function encodeEntryHeader(type, pathBytes, size, mode, mtimeMs) {
  const header = Buffer.alloc(ENTRY_HEADER_BYTES);
  header[0] = type;
  header.writeUInt32BE(pathBytes.length, 1);
  header.writeBigUInt64BE(BigInt(size), 5);
  header.writeUInt32BE(Number(mode || 0) & 0o777, 13);
  header.writeBigUInt64BE(BigInt(Math.max(0, Math.trunc(Number(mtimeMs) || 0))), 17);
  return header;
}

async function* archiveDirectory(sourceDir) {
  const root = path.resolve(sourceDir);
  yield ARCHIVE_MAGIC;
  let entries = 0;

  async function* walk(current, relative) {
    const names = fs.readdirSync(current).sort((a, b) => a.localeCompare(b, 'en'));
    for (const name of names) {
      const full = path.join(current, name);
      const rel = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`Không thể sao lưu liên kết tượng trưng trong data: ${rel}`);
      if (!stat.isDirectory() && !stat.isFile()) throw new Error(`Không hỗ trợ loại tệp trong data: ${rel}`);
      entries += 1;
      if (entries > MAX_ENTRY_COUNT) throw new Error('Thư mục data có quá nhiều tệp để sao lưu.');
      const pathBytes = Buffer.from(rel, 'utf8');
      if (!pathBytes.length || pathBytes.length > MAX_ENTRY_PATH_BYTES) throw new Error(`Đường dẫn tệp sao lưu không hợp lệ: ${rel}`);
      if (stat.isDirectory()) {
        yield encodeEntryHeader(1, pathBytes, 0, stat.mode, stat.mtimeMs);
        yield pathBytes;
        yield* walk(full, rel);
      } else {
        yield encodeEntryHeader(2, pathBytes, stat.size, stat.mode, stat.mtimeMs);
        yield pathBytes;
        for await (const chunk of fs.createReadStream(full)) yield chunk;
      }
    }
  }

  yield* walk(root, '');
  yield Buffer.from([0xff]);
}

async function createEncryptedBackup(sourceDir, password, outputFile) {
  const pass = validateBackupPassword(password);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(pass, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = fs.createWriteStream(outputFile, { flags: 'wx', mode: 0o600 });
  const header = Buffer.concat([BACKUP_MAGIC, salt, iv]);

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => { if (!settled) { settled = true; reject(error); } };
      out.on('error', fail);
      cipher.on('error', fail);
      const source = Readable.from(archiveDirectory(sourceDir));
      source.on('error', fail);
      out.write(header);
      source.pipe(cipher).pipe(out, { end: false });
      cipher.on('end', () => {
        try { out.end(cipher.getAuthTag()); } catch (error) { fail(error); }
      });
      out.on('finish', () => { if (!settled) { settled = true; resolve(); } });
    });
    const stat = fs.statSync(outputFile);
    return { bytes: stat.size };
  } catch (error) {
    try { out.destroy(); } catch {}
    try { fs.rmSync(outputFile, { force: true }); } catch {}
    throw error;
  } finally {
    key.fill(0);
  }
}

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = fs.readSync(fd, buffer, offset, length - offset, position + offset);
    if (!read) throw new Error('Tệp backup bị cắt ngắn hoặc hỏng.');
    offset += read;
  }
  return buffer;
}

function normalizeArchivePath(raw) {
  const value = String(raw || '').replace(/\\/g, '/');
  if (!value || value.startsWith('/') || value.includes('\0')) throw new Error('Tệp backup chứa đường dẫn không hợp lệ.');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('Tệp backup chứa đường dẫn không an toàn.');
  return parts.join('/');
}

async function extractArchive(archiveFile, targetDataDir) {
  fs.mkdirSync(targetDataDir, { recursive: false, mode: 0o700 });
  const fd = fs.openSync(archiveFile, 'r');
  const archiveSize = fs.fstatSync(fd).size;
  const seen = new Set();
  let position = 0;
  let entries = 0;
  let ended = false;
  try {
    const magic = readExactly(fd, ARCHIVE_MAGIC.length, position); position += ARCHIVE_MAGIC.length;
    if (!magic.equals(ARCHIVE_MAGIC)) throw new Error('Nội dung bản sao lưu không đúng định dạng thư mục data.');
    while (position < archiveSize) {
      const type = readExactly(fd, 1, position)[0]; position += 1;
      if (type === 0xff) { ended = true; break; }
      if (type !== 1 && type !== 2) throw new Error('Tệp backup chứa loại mục không hợp lệ.');
      const rest = readExactly(fd, ENTRY_HEADER_BYTES - 1, position); position += ENTRY_HEADER_BYTES - 1;
      const pathLength = rest.readUInt32BE(0);
      const size = rest.readBigUInt64BE(4);
      const mode = rest.readUInt32BE(12) & 0o777;
      const mtimeMs = rest.readBigUInt64BE(16);
      if (!pathLength || pathLength > MAX_ENTRY_PATH_BYTES) throw new Error('Tệp backup chứa đường dẫn quá dài.');
      if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Tệp backup chứa tệp có kích thước không hỗ trợ.');
      const pathBytes = readExactly(fd, pathLength, position); position += pathLength;
      const rel = normalizeArchivePath(pathBytes.toString('utf8'));
      if (seen.has(rel)) throw new Error(`Tệp backup chứa mục trùng lặp: ${rel}`);
      seen.add(rel);
      entries += 1;
      if (entries > MAX_ENTRY_COUNT) throw new Error('Tệp backup có quá nhiều mục.');
      const target = path.resolve(targetDataDir, ...rel.split('/'));
      const root = path.resolve(targetDataDir);
      if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Tệp backup chứa đường dẫn vượt khỏi thư mục data.');
      const mtimeNumber = Number(mtimeMs);
      if (type === 1) {
        if (size !== 0n) throw new Error(`Thư mục trong backup có kích thước không hợp lệ: ${rel}`);
        fs.mkdirSync(target, { recursive: true, mode: mode || 0o700 });
        try { fs.chmodSync(target, mode || 0o700); } catch {}
        if (Number.isFinite(mtimeNumber) && mtimeNumber > 0) { try { fs.utimesSync(target, new Date(), new Date(mtimeNumber)); } catch {} }
        continue;
      }
      const fileSize = Number(size);
      if (position + fileSize > archiveSize) throw new Error(`Tệp backup bị thiếu dữ liệu: ${rel}`);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      if (fileSize === 0) fs.writeFileSync(target, Buffer.alloc(0), { flag: 'wx', mode: mode || 0o600 });
      else await pipeline(fs.createReadStream(archiveFile, { start: position, end: position + fileSize - 1 }), fs.createWriteStream(target, { flags: 'wx', mode: mode || 0o600 }));
      position += fileSize;
      try { fs.chmodSync(target, mode || 0o600); } catch {}
      if (Number.isFinite(mtimeNumber) && mtimeNumber > 0) { try { fs.utimesSync(target, new Date(), new Date(mtimeNumber)); } catch {} }
    }
    if (!ended) throw new Error('Tệp backup thiếu dấu kết thúc.');
    if (position !== archiveSize) throw new Error('Tệp backup có dữ liệu thừa sau phần kết thúc.');
    return { entries };
  } finally {
    fs.closeSync(fd);
  }
}

function inspectBackupFile(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < OUTER_HEADER_BYTES + TAG_BYTES + ARCHIVE_MAGIC.length + 1) return false;
  const fd = fs.openSync(filePath, 'r');
  try { return readExactly(fd, BACKUP_MAGIC.length, 0).equals(BACKUP_MAGIC); }
  finally { fs.closeSync(fd); }
}

async function decryptBackupToDirectory(backupFile, password, targetDataDir) {
  const pass = validateBackupPassword(password);
  const stat = fs.statSync(backupFile);
  if (!stat.isFile() || stat.size < OUTER_HEADER_BYTES + TAG_BYTES + ARCHIVE_MAGIC.length + 1) throw new Error('Tệp backup không hợp lệ hoặc bị cắt ngắn.');
  const fd = fs.openSync(backupFile, 'r');
  let salt, iv, tag;
  try {
    const magic = readExactly(fd, BACKUP_MAGIC.length, 0);
    if (!magic.equals(BACKUP_MAGIC)) throw new Error('Tệp này không phải bản sao lưu data mã hóa của Cây Gia Phả Web v1.0.16 trở lên.');
    salt = readExactly(fd, SALT_BYTES, BACKUP_MAGIC.length);
    iv = readExactly(fd, IV_BYTES, BACKUP_MAGIC.length + SALT_BYTES);
    tag = readExactly(fd, TAG_BYTES, stat.size - TAG_BYTES);
  } finally { fs.closeSync(fd); }

  const key = deriveKey(pass, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plainFile = `${backupFile}.plain-${crypto.randomUUID()}`;
  try {
    await pipeline(
      fs.createReadStream(backupFile, { start: OUTER_HEADER_BYTES, end: stat.size - TAG_BYTES - 1 }),
      decipher,
      fs.createWriteStream(plainFile, { flags: 'wx', mode: 0o600 }),
    );
  } catch (error) {
    try { fs.rmSync(plainFile, { force: true }); } catch {}
    const e = new Error('Mật khẩu backup không đúng hoặc tệp backup đã bị hỏng.');
    e.cause = error;
    throw e;
  } finally { key.fill(0); }

  try {
    return await extractArchive(plainFile, targetDataDir);
  } finally {
    try { fs.rmSync(plainFile, { force: true }); } catch {}
  }
}

module.exports = {
  BACKUP_MAGIC,
  ARCHIVE_MAGIC,
  OUTER_HEADER_BYTES,
  TAG_BYTES,
  validateBackupPassword,
  createEncryptedBackup,
  decryptBackupToDirectory,
  inspectBackupFile,
};
