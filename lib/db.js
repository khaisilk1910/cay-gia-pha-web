'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_PARENT_DIR = path.dirname(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'family_tree.db');
const BACKUP_FORMAT = 'cay-gia-pha-web-full-backup';
const BACKUP_VERSION = 3;
const BACKUP_TABLES = Object.freeze(['settings','users','persons','branches','contributions','comments','audit_logs','page_visits']);
const MAX_BACKUP_UPLOAD_BYTES = 140 * 1024 * 1024;
const MAX_BACKUP_ROWS = 500000;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const UPLOAD_LAYOUT = Object.freeze({ logo:'Logo', qrcode:'qrcode', profiles:'profiles', gallery:'gallery', contacts:'contacts', temple:'temple', richtext:'richtext', legacy:'_legacy' });

function safeUploadSegment(value) {
  const part=String(value||'');
  if(!part || part==='.' || part==='..' || /[\u0000-\u001f\u007f/\\]/.test(part)) return false;
  return Buffer.byteLength(part,'utf8')<=240;
}
function validUploadName(name) { const value=String(name||''); return safeUploadSegment(value) && /\.(?:png|jpg|jpeg|webp)$/i.test(value); }
function normalizeUploadPath(value) {
  const raw=String(value||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
  if(!raw || raw.includes('\0')) return '';
  const parts=raw.split('/');
  if(parts.some((part)=>!safeUploadSegment(part))) return '';
  if(!validUploadName(parts[parts.length-1])) return '';
  return parts.join('/');
}
function galleryFolderTitle(folder) {
  const raw=String(folder||'').trim();
  if(!raw) return 'Thư mục ảnh';
  const generated=raw.match(/^(.+?)--[a-f0-9]{8}(?:-\d+)?$/i);
  const source=generated?generated[1]:raw;
  return source.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/(^|\s)\p{L}/gu,(m)=>m.toUpperCase()).slice(0,140)||'Thư mục ảnh';
}
function galleryPhotoTitle(filename) { return path.basename(String(filename||''),path.extname(String(filename||''))).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160)||null; }
function validUploadPath(value) { return !!normalizeUploadPath(value); }
function uploadFullPath(value) {
  const rel=normalizeUploadPath(value); if(!rel) return '';
  const full=path.resolve(UPLOAD_DIR,...rel.split('/'));
  const root=path.resolve(UPLOAD_DIR)+path.sep;
  return full.startsWith(root)?full:'';
}
function uploadUrl(value) {
  const rel=normalizeUploadPath(value);
  return rel ? `/uploads/${rel.split('/').map(encodeURIComponent).join('/')}` : null;
}
function countFilesRecursive(dir) {
  if(!fs.existsSync(dir)) return 0; let count=0;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){ const full=path.join(dir,entry.name); if(entry.isDirectory())count+=countFilesRecursive(full); else if(entry.isFile())count++; }
  return count;
}
function listImageFilesRecursive(dir, base=dir) {
  if(!fs.existsSync(dir)) return []; const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...listImageFilesRecursive(full,base));
    else if(entry.isFile()){ const rel=path.relative(base,full).split(path.sep).join('/'); if(validUploadPath(rel))out.push(rel); }
  }
  return out;
}
function slugifyFolder(value) {
  const normalized=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
  return normalized.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'album';
}
function uploadMime(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : '';
}
function validImageBuffer(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
function safeHashEqual(a,b) { const aa=Buffer.from(String(a||''),'hex'),bb=Buffer.from(String(b||''),'hex'); return aa.length===32&&bb.length===32&&crypto.timingSafeEqual(aa,bb); }

const RICH_TEXT_SIZES = new Set([10,12,14,16,18,20,24,28,32,36,42,48,56,64]);
const RICH_TEXT_FONTS = new Set(['system','segoe','arial','tahoma','verdana','georgia','times','cambria','palatino','trebuchet']);
const RICH_TEXT_ALIGNS = new Set(['left','center','right','justify']);
function normalizeRichTextContent(value, maxChars = 8000) {
  let parsed;
  try { parsed = JSON.parse(String(value || '[]')); } catch { parsed = []; }
  if (!Array.isArray(parsed)) parsed = [];
  const out = []; let total = 0;
  for (const item of parsed.slice(0, 800)) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'image') {
      const imagePath = normalizeUploadPath(item.image_path);
      if (!imagePath || !imagePath.startsWith(`${UPLOAD_LAYOUT.richtext}/`)) continue;
      out.push({ type:'image', image_path:imagePath, alt:String(item.alt||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240), width:[25,33,50,66,75,100].includes(Number(item.width))?Number(item.width):100, align:RICH_TEXT_ALIGNS.has(String(item.align||'center'))?String(item.align||'center'):'center' });
      continue;
    }
    if (total >= maxChars) continue;
    let text = String(item.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    if (!text) continue;
    text = text.slice(0, maxChars - total); total += text.length;
    const requested = Math.trunc(Number(item.size) || 16);
    const size = RICH_TEXT_SIZES.has(requested) ? requested : 16;
    const color = /^#[0-9a-f]{6}$/i.test(String(item.color || '')) ? String(item.color).toLowerCase() : '';
    const font = RICH_TEXT_FONTS.has(String(item.font || 'system')) ? String(item.font || 'system') : 'system';
    const align = RICH_TEXT_ALIGNS.has(String(item.align || 'left')) ? String(item.align || 'left') : 'left';
    const token = { type:'text', text, bold:!!item.bold, italic:!!item.italic, underline:!!item.underline, strike:!!item.strike, size, color, font, align };
    const prev = out[out.length - 1];
    if (prev?.type==='text' && prev.bold===token.bold && prev.italic===token.italic && prev.underline===token.underline && prev.strike===token.strike && prev.size===token.size && prev.color===token.color && prev.font===token.font && prev.align===token.align) prev.text += text;
    else out.push(token);
  }
  return JSON.stringify(out);
}
function normalizeFundSupportContent(value) { return normalizeRichTextContent(value, 4000); }

function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function jsonArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (typeof value === 'string' && value.trim()) {
    try { return jsonArray(JSON.parse(value)); } catch { return value.split(',').map((x) => x.trim()).filter(Boolean); }
  }
  return [];
}
function safeJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}
function extractYear(value) {
  const m = String(value || '').match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})(?:\D|$)/);
  return m ? Number(m[1]) : null;
}
function ageYearsForPerson(person, referenceDate = new Date()) {
  const birth = extractYear(person?.birth_date);
  if (!birth) return null;
  const deceased = !!person?.is_deceased || !!person?.death_date;
  const end = deceased ? extractYear(person?.death_date) : referenceDate.getFullYear();
  if (!end || end < birth) return null;
  const age = end - birth;
  return Number.isFinite(age) && age >= 0 && age <= 130 ? age : null;
}

class Store {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    this.openDatabase();
  }

  openDatabase() {
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    this.initialize();
  }

  withTransaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        can_manage_gallery INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        csrf_token TEXT NOT NULL,
        user_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS persons (
        id TEXT PRIMARY KEY,
        family_code TEXT,
        full_name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('male','female','other')),
        birth_date TEXT,
        birth_place TEXT,
        death_date TEXT,
        death_place TEXT,
        is_deceased INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        father_id TEXT,
        mother_id TEXT,
        spouse_ids TEXT NOT NULL DEFAULT '[]',
        spouse_order_ids TEXT NOT NULL DEFAULT '[]',
        divorced_spouse_ids TEXT NOT NULL DEFAULT '[]',
        step_parent_ids TEXT NOT NULL DEFAULT '[]',
        sibling_ids TEXT NOT NULL DEFAULT '[]',
        birth_order INTEGER NOT NULL DEFAULT 1,
        is_adopted INTEGER NOT NULL DEFAULT 0,
        is_inlaw INTEGER NOT NULL DEFAULT 0,
        occupation TEXT,
        details TEXT,
        source_citations TEXT,
        image_path TEXT,
        privacy_mode TEXT NOT NULL DEFAULT 'public' CHECK(privacy_mode IN ('public','limited','private')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(father_id) REFERENCES persons(id) ON DELETE SET NULL,
        FOREIGN KEY(mother_id) REFERENCES persons(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_person_level ON persons(level, birth_order, sort_order, full_name);
      CREATE INDEX IF NOT EXISTS idx_person_parents ON persons(father_id, mother_id);
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
        root_person_id TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(root_person_id) REFERENCES persons(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_branches_sort ON branches(sort_order, name);
      CREATE INDEX IF NOT EXISTS idx_branches_root ON branches(root_person_id);
      CREATE TABLE IF NOT EXISTS contributions (
        id TEXT PRIMARY KEY,
        donor_name TEXT NOT NULL COLLATE NOCASE,
        contribution_content TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
        contribution_date TEXT NOT NULL,
        notes TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contributions_date ON contributions(contribution_date DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_contributions_amount ON contributions(amount DESC, contribution_date DESC);
      CREATE INDEX IF NOT EXISTS idx_contributions_donor ON contributions(donor_name COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        message TEXT NOT NULL,
        user_id TEXT,
        ip_hash TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        deleted_by TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(deleted_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        detail TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
      CREATE TABLE IF NOT EXISTS page_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_hash TEXT NOT NULL,
        user_id TEXT,
        visited_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_page_visits_time ON page_visits(visited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_page_visits_session ON page_visits(session_hash, visited_at DESC);
      CREATE TABLE IF NOT EXISTS gallery_albums (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        storage_folder TEXT,
        description TEXT,
        cover_photo_id TEXT,
        is_public INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gallery_albums_sort ON gallery_albums(sort_order, updated_at DESC, title);
      CREATE TABLE IF NOT EXISTS gallery_photos (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL,
        title TEXT,
        caption TEXT,
        taken_date TEXT,
        image_path TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(album_id) REFERENCES gallery_albums(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gallery_photos_album ON gallery_photos(album_id, sort_order, created_at DESC);
      CREATE TABLE IF NOT EXISTS gallery_videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        youtube_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_public INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gallery_videos_sort ON gallery_videos(sort_order, updated_at DESC, title);
      CREATE TABLE IF NOT EXISTS contact_people (
        id TEXT PRIMARY KEY,
        name_text TEXT NOT NULL,
        name_content TEXT NOT NULL DEFAULT '[]',
        phone TEXT,
        phone_content TEXT NOT NULL DEFAULT '[]',
        address_content TEXT NOT NULL DEFAULT '[]',
        image_path TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_public INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contact_people_sort ON contact_people(sort_order, updated_at DESC, name_text);
    `);

    const userColumns = new Set(this.db.prepare('PRAGMA table_info(users)').all().map((r)=>r.name));
    if (!userColumns.has('can_manage_gallery')) this.db.exec('ALTER TABLE users ADD COLUMN can_manage_gallery INTEGER NOT NULL DEFAULT 0');
    const personColumns = new Set(this.db.prepare('PRAGMA table_info(persons)').all().map((r)=>r.name));
    if (!personColumns.has('is_inlaw')) this.db.exec('ALTER TABLE persons ADD COLUMN is_inlaw INTEGER NOT NULL DEFAULT 0');
    if (!personColumns.has('spouse_order_ids')) {
      this.db.exec("ALTER TABLE persons ADD COLUMN spouse_order_ids TEXT NOT NULL DEFAULT '[]'");
      this.db.exec("UPDATE persons SET spouse_order_ids=spouse_ids WHERE spouse_ids IS NOT NULL AND spouse_ids<>'[]'");
    }
    const contactColumns = new Set(this.db.prepare('PRAGMA table_info(contact_people)').all().map((r)=>r.name));
    if (!contactColumns.has('phone_content')) this.db.exec("ALTER TABLE contact_people ADD COLUMN phone_content TEXT NOT NULL DEFAULT '[]'");
    const galleryAlbumColumns = new Set(this.db.prepare('PRAGMA table_info(gallery_albums)').all().map((r)=>r.name));
    if (!galleryAlbumColumns.has('storage_folder')) this.db.exec('ALTER TABLE gallery_albums ADD COLUMN storage_folder TEXT');
    if (!galleryAlbumColumns.has('filesystem_managed')) this.db.exec('ALTER TABLE gallery_albums ADD COLUMN filesystem_managed INTEGER NOT NULL DEFAULT 0');
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_albums_storage_folder ON gallery_albums(storage_folder) WHERE storage_folder IS NOT NULL AND storage_folder<>''");

    const defaults = {
      tree_title: 'Gia Phả Gia Đình',
      tree_subtitle: 'Theo dấu các thế hệ trong gia đình qua năm tháng.',
      tree_subtitle_content: '[]',
      clan_name: 'Gia phả mẫu',
      tree_footer_content: '[]',
      gallery_intro_content: '[]',
      gallery_footer_content: '[]',
      public_comments_enabled: '1',
      living_default_privacy: 'limited',
      accent_theme: 'heritage',
      tree_font: 'system',
      tree_title_font_size: '28',
      clan_name_font_size: '66',
      site_logo_path: '',
      fund_support_enabled: '0',
      fund_support_title: 'Ủng hộ quỹ dòng họ',
      fund_support_title_font_size: '28',
      fund_support_content: '[]',
      fund_support_qr_path: '',
      footer_author_text: '',
      footer_author_content: '[]',
      footer_author_font: 'system',
      contact_intro_content: '[]',
      contact_footer_content: '[]',
      contact_map_url: '',
      contact_map_address_content: '[]',
      contact_temple_image_path: '',
      contact_temple_image_paths: '[]',
      welcome_popup_enabled: '0',
      welcome_popup_content: '[]',
      contribution_top_count: '10',
    };
    const upsertSetting = this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    for (const [key, value] of Object.entries(defaults)) upsertSetting.run(key, value);
    const legacyTemple = this.getSetting('contact_temple_image_path','');
    const templeList = jsonArray(this.getSetting('contact_temple_image_paths','[]'));
    if (!templeList.length && legacyTemple) this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify([legacyTemple]), 'contact_temple_image_paths');
    this.ensureUploadLayout();
    this.migrateUploadLayout();
    this.syncGalleryFromFilesystem({ force:true });
  }

  ensureUploadLayout() {
    fs.mkdirSync(UPLOAD_DIR,{recursive:true});
    for(const name of [UPLOAD_LAYOUT.logo,UPLOAD_LAYOUT.qrcode,UPLOAD_LAYOUT.profiles,UPLOAD_LAYOUT.gallery,UPLOAD_LAYOUT.contacts,UPLOAD_LAYOUT.temple,UPLOAD_LAYOUT.richtext]) fs.mkdirSync(path.join(UPLOAD_DIR,name),{recursive:true});
  }
  galleryStorageFolder(title,id) { return `${slugifyFolder(title)}--${String(id||uuid()).replace(/[^a-z0-9-]/gi,'').slice(0,8)}`; }
  getGalleryAlbumRaw(id) { return this.db.prepare('SELECT * FROM gallery_albums WHERE id=?').get(id)||null; }
  galleryAlbumUploadDir(albumOrId) {
    const album=typeof albumOrId==='string'?this.getGalleryAlbumRaw(albumOrId):albumOrId;
    if(!album)return '';
    const folder=String(album.storage_folder||'');
    if(!safeUploadSegment(folder))return '';
    const rel=`${UPLOAD_LAYOUT.gallery}/${folder}`; fs.mkdirSync(path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,folder),{recursive:true}); return rel;
  }
  migrateUploadLayout() {
    this.ensureUploadLayout();
    const albums=this.db.prepare('SELECT id,title,storage_folder FROM gallery_albums ORDER BY created_at,id').all();
    const used=new Set(albums.map((a)=>String(a.storage_folder||'')).filter(Boolean));
    for(const album of albums){
      if(album.storage_folder && safeUploadSegment(album.storage_folder)){ fs.mkdirSync(path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,album.storage_folder),{recursive:true}); continue; }
      let folder=this.galleryStorageFolder(album.title,album.id),n=2; const base=folder; while(used.has(folder)){folder=`${base}-${n++}`;} used.add(folder);
      this.db.prepare('UPDATE gallery_albums SET storage_folder=? WHERE id=?').run(folder,album.id);
      fs.mkdirSync(path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,folder),{recursive:true});
    }
    const migratedSources=new Set();
    const migrate=(current,targetDir)=>{
      const oldRel=normalizeUploadPath(current); if(!oldRel)return current||'';
      if(oldRel.startsWith(`${targetDir}/`))return oldRel;
      const src=uploadFullPath(oldRel); if(!src||!fs.existsSync(src)||!fs.statSync(src).isFile())return oldRel;
      const ext=path.extname(oldRel).toLowerCase(); let filename=path.basename(oldRel);
      const targetAbs=path.join(UPLOAD_DIR,...targetDir.split('/')); fs.mkdirSync(targetAbs,{recursive:true});
      let dest=path.join(targetAbs,filename);
      if(fs.existsSync(dest)){
        const a=fs.readFileSync(src),b=fs.readFileSync(dest);
        if(!a.equals(b)){filename=`${uuid()}${ext}`;dest=path.join(targetAbs,filename);fs.copyFileSync(src,dest,fs.constants.COPYFILE_EXCL);}
      }else fs.copyFileSync(src,dest,fs.constants.COPYFILE_EXCL);
      migratedSources.add(oldRel); return `${targetDir}/${filename}`;
    };
    const logo=this.getSetting('site_logo_path',''); if(logo){const next=migrate(logo,UPLOAD_LAYOUT.logo);if(next!==logo)this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(next,'site_logo_path');}
    const qr=this.getSetting('fund_support_qr_path',''); if(qr){const next=migrate(qr,UPLOAD_LAYOUT.qrcode);if(next!==qr)this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(next,'fund_support_qr_path');}
    for(const row of this.db.prepare("SELECT id,image_path FROM persons WHERE image_path IS NOT NULL AND image_path<>''").all()){const next=migrate(row.image_path,UPLOAD_LAYOUT.profiles);if(next!==row.image_path)this.db.prepare('UPDATE persons SET image_path=? WHERE id=?').run(next,row.id);}
    for(const row of this.db.prepare("SELECT p.id,p.image_path,a.storage_folder FROM gallery_photos p JOIN gallery_albums a ON a.id=p.album_id WHERE p.image_path IS NOT NULL AND p.image_path<>''").all()){const target=`${UPLOAD_LAYOUT.gallery}/${row.storage_folder}`;const next=migrate(row.image_path,target);if(next!==row.image_path)this.db.prepare('UPDATE gallery_photos SET image_path=? WHERE id=?').run(next,row.id);}
    for(const row of this.db.prepare("SELECT id,image_path FROM contact_people WHERE image_path IS NOT NULL AND image_path<>''").all()){const next=migrate(row.image_path,UPLOAD_LAYOUT.contacts);if(next!==row.image_path)this.db.prepare('UPDATE contact_people SET image_path=? WHERE id=?').run(next,row.id);}
    const templeLegacy=this.getSetting('contact_temple_image_path','');
    const templePaths=jsonArray(this.getSetting('contact_temple_image_paths','[]'));
    const templeSource=[...new Set([...templePaths,...(templeLegacy?[templeLegacy]:[])])].slice(0,10);
    const templeMigrated=templeSource.map((rel)=>migrate(rel,UPLOAD_LAYOUT.temple)).filter(Boolean);
    if(templeMigrated.length){this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(templeMigrated),'contact_temple_image_paths');this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(templeMigrated[0]||'','contact_temple_image_path');}
    for(const rel of migratedSources){try{const full=uploadFullPath(rel);if(full&&fs.existsSync(full))fs.unlinkSync(full);}catch{}}
    for(const entry of fs.readdirSync(UPLOAD_DIR,{withFileTypes:true})){
      if(!entry.isFile()||!validUploadName(entry.name))continue;
      const src=path.join(UPLOAD_DIR,entry.name),legacyDir=path.join(UPLOAD_DIR,UPLOAD_LAYOUT.legacy),dest=path.join(legacyDir,entry.name);
      try{fs.mkdirSync(legacyDir,{recursive:true});if(!fs.existsSync(dest))fs.renameSync(src,dest);else fs.unlinkSync(src);}catch{}
    }
  }

  getSetting(key, fallback = '') {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? String(row.value) : fallback;
  }
  settings() {
    return Object.fromEntries(this.db.prepare('SELECT key,value FROM settings ORDER BY key').all().map((r) => [r.key, r.value]));
  }
  updateSettings(input, actorId) {
    const allowed = new Set(['tree_title','tree_subtitle','tree_subtitle_content','clan_name','tree_footer_content','gallery_intro_content','gallery_footer_content','public_comments_enabled','living_default_privacy','accent_theme','tree_font','tree_title_font_size','clan_name_font_size','site_logo_path','fund_support_enabled','fund_support_title','fund_support_title_font_size','fund_support_content','fund_support_qr_path','footer_author_text','footer_author_content','footer_author_font','contact_intro_content','contact_footer_content','contact_map_url','contact_map_address_content','contact_temple_image_path','contact_temple_image_paths','welcome_popup_enabled','welcome_popup_content','contribution_top_count']);
    const stmt = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    const fontKeys=new Set(['system','segoe','arial','tahoma','verdana','georgia','times','cambria','palatino','trebuchet']);
    const normalizeSetting=(key,value)=>{
      const raw=String(value??'');
      if(key==='tree_title'||key==='clan_name') return raw.trim().slice(0,160);
      if(key==='tree_subtitle') return raw.trim().slice(0,4000);
      if(key==='footer_author_text') return raw.trim().slice(0,2000);
      if(key==='fund_support_title') return raw.trim().slice(0,160);
      if(key==='fund_support_content') return normalizeFundSupportContent(raw);
      if(key==='contact_map_url') {
        const v=raw.trim().slice(0,2000); if(!v)return '';
        try { const u=new URL(v); const host=u.hostname.toLowerCase(); return (u.protocol==='https:' && (host==='google.com'||host.endsWith('.google.com')||host==='maps.app.goo.gl'||host==='goo.gl'))?v:''; } catch { return ''; }
      }
      if(['tree_subtitle_content','tree_footer_content','gallery_intro_content','gallery_footer_content','footer_author_content','contact_intro_content','contact_footer_content','contact_map_address_content','welcome_popup_content'].includes(key)) return normalizeRichTextContent(raw, 8000);
      if(key==='tree_font'||key==='footer_author_font') return fontKeys.has(raw)?raw:'system';
      if(key==='living_default_privacy') return ['public','limited','private'].includes(raw)?raw:'limited';
      if(key==='public_comments_enabled'||key==='fund_support_enabled'||key==='welcome_popup_enabled') return raw==='0'?'0':'1';
      if(key==='tree_title_font_size') return String(Math.min(64,Math.max(16,Math.trunc(Number(raw)||28))));
      if(key==='clan_name_font_size') return String(Math.min(96,Math.max(28,Math.trunc(Number(raw)||66))));
      if(key==='fund_support_title_font_size') return String(Math.min(44,Math.max(18,Math.trunc(Number(raw)||28))));
      if(key==='contribution_top_count') return ['5','10','15','20'].includes(raw)?raw:'10';
      if(key==='site_logo_path'){const rel=normalizeUploadPath(raw);if(!rel)return '';return rel.includes('/')?(rel.startsWith(`${UPLOAD_LAYOUT.logo}/`)?rel:''):`${UPLOAD_LAYOUT.logo}/${rel}`;}
      if(key==='fund_support_qr_path'){const rel=normalizeUploadPath(raw);if(!rel)return '';return rel.includes('/')?(rel.startsWith(`${UPLOAD_LAYOUT.qrcode}/`)?rel:''):`${UPLOAD_LAYOUT.qrcode}/${rel}`;}
      if(key==='contact_temple_image_path'){const rel=normalizeUploadPath(raw);if(!rel)return '';return rel.includes('/')?(rel.startsWith(`${UPLOAD_LAYOUT.temple}/`)?rel:''):`${UPLOAD_LAYOUT.temple}/${rel}`;}
      if(key==='contact_temple_image_paths'){const paths=jsonArray(raw).map(normalizeUploadPath).filter((rel)=>rel&&rel.startsWith(`${UPLOAD_LAYOUT.temple}/`)).slice(0,10);return JSON.stringify([...new Set(paths)]);}
      return raw.slice(0,2000);
    };
    const before=this.settings();
    const entries = Object.entries(input || {}).filter(([k]) => allowed.has(k)).map(([k,v])=>[k,normalizeSetting(k,v)]);
    const settingLabels={tree_title:'Tiêu đề cây',clan_name:'Tên dòng họ / gia đình',tree_subtitle:'Phụ đề',tree_subtitle_content:'Phụ đề',tree_footer_content:'Nội dung cuối trang cây',gallery_intro_content:'Giới thiệu Thư viện ảnh',gallery_footer_content:'Nội dung cuối trang Thư viện ảnh',public_comments_enabled:'Bình luận công khai',living_default_privacy:'Quyền riêng tư mặc định',tree_font:'Font hiển thị',tree_title_font_size:'Cỡ chữ tiêu đề cây',clan_name_font_size:'Cỡ chữ tên dòng họ',site_logo_path:'Logo website',fund_support_enabled:'Hiển thị kêu gọi ủng hộ',fund_support_title:'Tiêu đề kêu gọi',fund_support_title_font_size:'Cỡ chữ tiêu đề kêu gọi',fund_support_content:'Nội dung kêu gọi',fund_support_qr_path:'QR ủng hộ',footer_author_text:'Tác giả website',footer_author_content:'Tác giả website',footer_author_font:'Font tác giả',contact_intro_content:'Giới thiệu trang Liên hệ',contact_footer_content:'Nội dung cuối trang Liên hệ',contact_map_url:'Google Maps',contact_map_address_content:'Địa chỉ nhà thờ Tổ',contact_temple_image_path:'Ảnh nhà thờ Tổ',contact_temple_image_paths:'Ảnh nhà thờ Tổ',welcome_popup_enabled:'Popup chào mừng',welcome_popup_content:'Nội dung Popup chào mừng',contribution_top_count:'Số lượng Top Phương Danh Công Đức'};
    const changed=[...new Set(entries.filter(([k,v])=>String(before[k]??'')!==String(v)).map(([k])=>settingLabels[k]||k))];
    this.withTransaction(() => { for (const [k, v] of entries) stmt.run(k, v); });
    this.audit(actorId, 'settings.update', 'settings', null, changed.length?`Đã sửa: ${changed.join('; ').slice(0,900)}`:'Không có thay đổi nội dung');
    return this.settings();
  }

  ensureAdmin(username, password, generatedPassword) {
    const count = Number(this.db.prepare('SELECT COUNT(*) AS c FROM users').get().c || 0);
    if (count > 0) return null;
    const id = uuid();
    const created = nowIso();
    this.db.prepare(`INSERT INTO users(id,username,display_name,password_hash,role,is_active,must_change_password,can_manage_gallery,created_at,updated_at)
      VALUES (?,?,?,?, 'admin',1,1,1,?,?)`).run(id, username, 'Quản trị viên', hashPassword(password), created, created);
    this.audit(id, 'bootstrap.admin', 'user', id, 'Tạo tài khoản quản trị đầu tiên');
    if (generatedPassword) {
      const infoPath = path.join(DATA_DIR, 'INITIAL_ADMIN.txt');
      fs.writeFileSync(infoPath, `Tai khoan quan tri lan dau\nUsername: ${username}\nPassword: ${password}\n\nHay dang nhap va doi mat khau ngay. Sau khi doi, co the xoa file nay.\n`, { mode: 0o600 });
    }
    return { id, username, password, generatedPassword };
  }

  seedDemoIfEmpty(actorId = null) {
    const count = Number(this.db.prepare('SELECT COUNT(*) AS c FROM persons').get().c || 0);
    if (count > 0) return;
    const people = [
      { id:'demo-root', family_code:'I001', full_name:'Cụ Nguyễn Văn Minh', gender:'male', birth_date:'1918', death_date:'1997', is_deceased:1, level:1, spouse_ids:['demo-root-wife'], birth_order:1, occupation:'Nông nghiệp', details:'Nhân vật mẫu để minh họa giao diện. Hãy sửa hoặc xóa khi nhập dữ liệu thật.', source_citations:'Dữ liệu mẫu do hệ thống tạo.', privacy_mode:'public' },
      { id:'demo-root-wife', family_code:'I002', full_name:'Cụ Trần Thị An', gender:'female', birth_date:'1922', death_date:'2005', is_deceased:1, level:1, spouse_ids:['demo-root'], birth_order:1, details:'Dữ liệu mẫu.', source_citations:'Dữ liệu mẫu do hệ thống tạo.', privacy_mode:'public' },
      { id:'demo-son1', family_code:'I003', full_name:'Nguyễn Văn Hòa', gender:'male', birth_date:'1946', is_deceased:1, death_date:'2019', level:2, father_id:'demo-root', mother_id:'demo-root-wife', spouse_ids:['demo-wife1'], birth_order:1, privacy_mode:'public' },
      { id:'demo-wife1', family_code:'I004', full_name:'Lê Thị Mai', gender:'female', birth_date:'1949', level:2, spouse_ids:['demo-son1'], birth_order:1, privacy_mode:'limited' },
      { id:'demo-daughter', family_code:'I005', full_name:'Nguyễn Thị Lan', gender:'female', birth_date:'1952', level:2, father_id:'demo-root', mother_id:'demo-root-wife', birth_order:2, privacy_mode:'limited' },
      { id:'demo-grandson1', family_code:'I006', full_name:'Nguyễn Minh Đức', gender:'male', birth_date:'1974', level:3, father_id:'demo-son1', mother_id:'demo-wife1', spouse_ids:['demo-grandwife'], birth_order:1, privacy_mode:'limited' },
      { id:'demo-grandwife', family_code:'I007', full_name:'Phạm Thu Hà', gender:'female', birth_date:'1977', level:3, spouse_ids:['demo-grandson1'], birth_order:1, privacy_mode:'limited' },
      { id:'demo-great1', family_code:'I008', full_name:'Nguyễn Gia Bảo', gender:'male', birth_date:'2002', level:4, father_id:'demo-grandson1', mother_id:'demo-grandwife', birth_order:1, privacy_mode:'private' },
      { id:'demo-great2', family_code:'I009', full_name:'Nguyễn Khánh Linh', gender:'female', birth_date:'2006', level:4, father_id:'demo-grandson1', mother_id:'demo-grandwife', birth_order:2, privacy_mode:'private' }
    ];
    const insert = this.db.prepare(`INSERT INTO persons(id,family_code,full_name,gender,birth_date,birth_place,death_date,death_place,is_deceased,level,father_id,mother_id,spouse_ids,spouse_order_ids,divorced_spouse_ids,step_parent_ids,sibling_ids,birth_order,is_adopted,is_inlaw,occupation,details,source_citations,image_path,privacy_mode,sort_order,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    this.withTransaction(() => {
      for (const p of people) {
        const t = nowIso();
        insert.run(p.id,p.family_code||null,p.full_name,p.gender,p.birth_date||null,p.birth_place||null,p.death_date||null,p.death_place||null,p.is_deceased?1:0,p.level||1,p.father_id||null,p.mother_id||null,JSON.stringify(p.spouse_ids||[]),JSON.stringify(p.spouse_order_ids||p.spouse_ids||[]),JSON.stringify(p.divorced_spouse_ids||[]),JSON.stringify(p.step_parent_ids||[]),JSON.stringify(p.sibling_ids||[]),p.birth_order||1,p.is_adopted?1:0,p.is_inlaw?1:0,p.occupation||null,p.details||null,p.source_citations||null,null,p.privacy_mode||'public',0,actorId,actorId,t,t);
      }
    });
  }

  listUsers() {
    return this.db.prepare('SELECT id,username,display_name,role,is_active,must_change_password,can_manage_gallery,created_at,updated_at,last_login_at FROM users ORDER BY role, username').all().map((r)=>({...r,is_active:!!r.is_active,must_change_password:!!r.must_change_password,can_manage_gallery:!!r.can_manage_gallery}));
  }
  getUserById(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) || null; }
  getUserByUsername(username) { return this.db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username) || null; }
  createUser(input, actorId) {
    const id = uuid(); const t = nowIso();
    this.db.prepare(`INSERT INTO users(id,username,display_name,password_hash,role,is_active,must_change_password,can_manage_gallery,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?, ?,?)`)
      .run(id,input.username,input.display_name,hashPassword(input.password),input.role,input.can_manage_gallery?1:0,t,t);
    this.audit(actorId,'user.create','user',id,JSON.stringify({username:input.username,role:input.role}));
    return this.getUserById(id);
  }
  updateUser(id, input, actorId) {
    const current = this.getUserById(id); if (!current) return null;
    const next = {
      display_name: input.display_name ?? current.display_name,
      role: input.role ?? current.role,
      is_active: input.is_active == null ? current.is_active : (input.is_active ? 1 : 0),
      must_change_password: input.must_change_password == null ? current.must_change_password : (input.must_change_password ? 1 : 0),
      can_manage_gallery: input.can_manage_gallery == null ? current.can_manage_gallery : (input.can_manage_gallery ? 1 : 0),
    };
    this.db.prepare('UPDATE users SET display_name=?,role=?,is_active=?,must_change_password=?,can_manage_gallery=?,updated_at=? WHERE id=?')
      .run(next.display_name,next.role,next.is_active,next.must_change_password,next.can_manage_gallery,nowIso(),id);
    if (input.password) this.db.prepare('UPDATE users SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?').run(hashPassword(input.password),nowIso(),id);
    this.audit(actorId,'user.update','user',id,JSON.stringify({role:next.role,is_active:!!next.is_active,can_manage_gallery:!!next.can_manage_gallery}));
    return this.getUserById(id);
  }
  changeOwnPassword(id, currentPassword, newPassword, verifyFn) {
    const user = this.getUserById(id); if (!user || !verifyFn(currentPassword,user.password_hash)) return false;
    this.db.prepare('UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?').run(hashPassword(newPassword),nowIso(),id);
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    this.audit(id,'user.password_change','user',id,'Đổi mật khẩu');
    return true;
  }
  markLogin(id) { this.db.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').run(nowIso(),nowIso(),id); }

  syncGalleryFromFilesystem({ force=false } = {}) {
    const now=Date.now();
    if(!force && this._galleryFsSyncAt && now-this._galleryFsSyncAt<4000) return this._galleryFsSyncResult||{albums_added:0,photos_added:0,photos_removed:0,albums_removed:0};
    this._galleryFsSyncAt=now;
    const root=path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery); fs.mkdirSync(root,{recursive:true});
    const result={albums_added:0,photos_added:0,photos_removed:0,albums_removed:0};
    const folders=fs.readdirSync(root,{withFileTypes:true}).filter((entry)=>entry.isDirectory()&&!entry.isSymbolicLink()&&safeUploadSegment(entry.name)).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
    const seenFolders=new Set();
    const t=nowIso();
    for(const entry of folders){
      const folder=entry.name; seenFolders.add(folder);
      let album=this.db.prepare('SELECT * FROM gallery_albums WHERE storage_folder=?').get(folder);
      if(!album){
        const id=uuid(),title=galleryFolderTitle(folder);
        const maxOrder=Number(this.db.prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM gallery_albums').get()?.n||0);
        this.db.prepare('INSERT INTO gallery_albums(id,title,storage_folder,description,is_public,sort_order,created_by,updated_by,created_at,updated_at,filesystem_managed) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
          .run(id,title,folder,null,1,maxOrder+10,null,null,t,t);
        album=this.db.prepare('SELECT * FROM gallery_albums WHERE id=?').get(id); result.albums_added++;
      }
      const folderPath=path.join(root,folder);
      const files=fs.readdirSync(folderPath,{withFileTypes:true}).filter((item)=>item.isFile()&&!item.isSymbolicLink()&&validUploadName(item.name)).sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true,sensitivity:'base'}));
      const seenPaths=new Set();
      for(let index=0;index<files.length;index++){
        const file=files[index];
        const rel=`${UPLOAD_LAYOUT.gallery}/${folder}/${file.name}`;
        const normalized=normalizeUploadPath(rel); if(!normalized)continue; seenPaths.add(normalized);
        const existing=this.db.prepare('SELECT id FROM gallery_photos WHERE image_path=?').get(normalized);
        if(existing)continue;
        let stat; try{stat=fs.statSync(path.join(folderPath,file.name));}catch{continue;}
        const created=stat.mtime instanceof Date&&!Number.isNaN(stat.mtime.getTime())?stat.mtime.toISOString():t;
        const id=uuid();
        this.db.prepare('INSERT INTO gallery_photos(id,album_id,title,caption,taken_date,image_path,sort_order,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,album.id,galleryPhotoTitle(file.name),null,null,normalized,index*10,null,null,created,created);
        result.photos_added++;
      }
      const cover=this.db.prepare('SELECT id FROM gallery_photos WHERE album_id=? ORDER BY sort_order,created_at,id LIMIT 1').get(album.id);
      const currentCover=this.db.prepare('SELECT cover_photo_id FROM gallery_albums WHERE id=?').get(album.id)?.cover_photo_id;
      const validCurrent=currentCover?this.db.prepare('SELECT id FROM gallery_photos WHERE id=? AND album_id=?').get(currentCover,album.id):null;
      if(!validCurrent)this.db.prepare('UPDATE gallery_albums SET cover_photo_id=?,updated_at=? WHERE id=?').run(cover?.id||null,t,album.id);
    }
    this._galleryFsSyncResult=result; return result;
  }

  presentGalleryAlbum(row) {
    if (!row) return null;
    const coverPath = row.cover_image_path || null;
    return {
      ...row,
      is_public: !!row.is_public,
      photo_count: Number(row.photo_count || 0),
      cover_url: coverPath ? uploadUrl(coverPath) : null,
      cover_photo_id: row.cover_photo_id || null,
      created_by_name: row.created_by_name || null,
      updated_by_name: row.updated_by_name || null,
      cover_image_path: undefined,
      storage_folder: undefined,
    };
  }
  presentGalleryPhoto(row) {
    if (!row) return null;
    return {
      ...row,
      image_url: row.image_path ? uploadUrl(row.image_path) : null,
      created_by_name: row.created_by_name || null,
      updated_by_name: row.updated_by_name || null,
      image_path: undefined,
    };
  }
  listGalleryAlbums({ publicOnly = false } = {}) {
    const where = publicOnly ? 'WHERE a.is_public=1' : '';
    const rows = this.db.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM gallery_photos p WHERE p.album_id=a.id) AS photo_count,
        COALESCE(
          (SELECT image_path FROM gallery_photos cp WHERE cp.id=a.cover_photo_id AND cp.album_id=a.id LIMIT 1),
          (SELECT image_path FROM gallery_photos fp WHERE fp.album_id=a.id ORDER BY fp.sort_order,fp.created_at DESC LIMIT 1)
        ) AS cover_image_path,
        cu.display_name AS created_by_name, uu.display_name AS updated_by_name
      FROM gallery_albums a
      LEFT JOIN users cu ON cu.id=a.created_by
      LEFT JOIN users uu ON uu.id=a.updated_by
      ${where}
      ORDER BY a.sort_order, a.updated_at DESC, a.title COLLATE NOCASE
    `).all();
    return rows.map((r)=>this.presentGalleryAlbum(r));
  }
  getGalleryAlbum(id, { publicOnly = false } = {}) {
    const row = this.db.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM gallery_photos p WHERE p.album_id=a.id) AS photo_count,
        COALESCE(
          (SELECT image_path FROM gallery_photos cp WHERE cp.id=a.cover_photo_id AND cp.album_id=a.id LIMIT 1),
          (SELECT image_path FROM gallery_photos fp WHERE fp.album_id=a.id ORDER BY fp.sort_order,fp.created_at DESC LIMIT 1)
        ) AS cover_image_path,
        cu.display_name AS created_by_name, uu.display_name AS updated_by_name
      FROM gallery_albums a
      LEFT JOIN users cu ON cu.id=a.created_by
      LEFT JOIN users uu ON uu.id=a.updated_by
      WHERE a.id=? ${publicOnly ? 'AND a.is_public=1' : ''}
    `).get(id);
    return this.presentGalleryAlbum(row);
  }
  listGalleryPhotos(albumId, { publicOnly = false } = {}) {
    if (publicOnly && !this.getGalleryAlbum(albumId,{publicOnly:true})) return [];
    const rows = this.db.prepare(`
      SELECT p.*, cu.display_name AS created_by_name, uu.display_name AS updated_by_name
      FROM gallery_photos p
      LEFT JOIN users cu ON cu.id=p.created_by
      LEFT JOIN users uu ON uu.id=p.updated_by
      WHERE p.album_id=?
      ORDER BY p.sort_order, p.created_at DESC, p.id
    `).all(albumId);
    return rows.map((r)=>this.presentGalleryPhoto(r));
  }
  getGalleryPhoto(id) {
    const row = this.db.prepare(`
      SELECT p.*, cu.display_name AS created_by_name, uu.display_name AS updated_by_name
      FROM gallery_photos p
      LEFT JOIN users cu ON cu.id=p.created_by
      LEFT JOIN users uu ON uu.id=p.updated_by
      WHERE p.id=?
    `).get(id);
    return this.presentGalleryPhoto(row);
  }
  getGalleryPhotoRaw(id) { return this.db.prepare('SELECT * FROM gallery_photos WHERE id=?').get(id) || null; }
  createGalleryAlbum(input, actorId) {
    const title=String(input?.title||'').trim().slice(0,140);
    if (!title) throw new Error('Tên thư mục ảnh không được để trống.');
    const description=String(input?.description||'').trim().slice(0,2000) || null;
    const isPublic=input?.is_public===false||String(input?.is_public)==='0'?0:1;
    const sortOrder=Math.max(-9999,Math.min(9999,Math.trunc(Number(input?.sort_order)||0)));
    const id=uuid(),t=nowIso();
    let storageFolder=this.galleryStorageFolder(title,id),n=2,base=storageFolder;
    while(this.db.prepare('SELECT id FROM gallery_albums WHERE storage_folder=?').get(storageFolder)||fs.existsSync(path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,storageFolder)))storageFolder=`${base}-${n++}`;
    const folderPath=path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,storageFolder); fs.mkdirSync(folderPath,{recursive:false,mode:0o700});
    try{
      this.db.prepare('INSERT INTO gallery_albums(id,title,storage_folder,description,is_public,sort_order,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id,title,storageFolder,description,isPublic,sortOrder,actorId,actorId,t,t);
    }catch(e){try{fs.rmSync(folderPath,{recursive:true,force:true});}catch{}throw e;}
    this.audit(actorId,'gallery.album_create','gallery_album',id,JSON.stringify({title,is_public:!!isPublic,storage_folder:storageFolder}));
    return this.getGalleryAlbum(id);
  }
  updateGalleryAlbum(id,input,actorId) {
    const current=this.db.prepare('SELECT * FROM gallery_albums WHERE id=?').get(id); if(!current)return null;
    const title=input?.title==null?current.title:String(input.title).trim().slice(0,140);
    if(!title)throw new Error('Tên thư mục ảnh không được để trống.');
    const description=input?.description==null?current.description:(String(input.description||'').trim().slice(0,2000)||null);
    const isPublic=input?.is_public==null?current.is_public:(input.is_public===false||String(input.is_public)==='0'?0:1);
    const sortOrder=input?.sort_order==null?current.sort_order:Math.max(-9999,Math.min(9999,Math.trunc(Number(input.sort_order)||0)));
    let cover=input?.cover_photo_id===undefined?current.cover_photo_id:(String(input.cover_photo_id||'').trim()||null);
    if(cover){const p=this.db.prepare('SELECT id FROM gallery_photos WHERE id=? AND album_id=?').get(cover,id);if(!p)cover=null;}
    this.db.prepare('UPDATE gallery_albums SET title=?,description=?,cover_photo_id=?,is_public=?,sort_order=?,updated_by=?,updated_at=? WHERE id=?')
      .run(title,description,cover,isPublic,sortOrder,actorId,nowIso(),id);
    this.audit(actorId,'gallery.album_update','gallery_album',id,JSON.stringify({title,is_public:!!isPublic}));
    return this.getGalleryAlbum(id);
  }
  deleteGalleryAlbum(id,actorId) {
    const current=this.db.prepare('SELECT * FROM gallery_albums WHERE id=?').get(id); if(!current)return null;
    const imagePaths=this.db.prepare('SELECT image_path FROM gallery_photos WHERE album_id=?').all(id).map((r)=>r.image_path).filter(Boolean);
    this.withTransaction(()=>{this.db.prepare('DELETE FROM gallery_albums WHERE id=?').run(id);});
    this.audit(actorId,'gallery.album_delete','gallery_album',id,JSON.stringify({title:current.title,photos:imagePaths.length}));
    return { album:current, image_paths:imagePaths, storage_folder:current.storage_folder||'' };
  }
  createGalleryPhoto(input,actorId) {
    const albumId=String(input?.album_id||'').trim();
    if(!this.db.prepare('SELECT id FROM gallery_albums WHERE id=?').get(albumId))throw new Error('Không tìm thấy thư mục ảnh.');
    let imagePath=normalizeUploadPath(input?.image_path); const album=this.getGalleryAlbumRaw(albumId); const requiredPrefix=album?.storage_folder?`${UPLOAD_LAYOUT.gallery}/${album.storage_folder}/`:''; if(imagePath&&!imagePath.includes('/')&&requiredPrefix)imagePath=`${requiredPrefix}${imagePath}`; if(!imagePath||!requiredPrefix||!imagePath.startsWith(requiredPrefix))throw new Error('Tệp ảnh không nằm đúng thư mục album.');
    const title=String(input?.title||'').trim().slice(0,160)||null;
    const caption=String(input?.caption||'').trim().slice(0,2000)||null;
    const takenDate=String(input?.taken_date||'').trim().slice(0,40)||null;
    const sortOrder=Math.max(-9999,Math.min(9999,Math.trunc(Number(input?.sort_order)||0)));
    const id=uuid(),t=nowIso();
    this.db.prepare('INSERT INTO gallery_photos(id,album_id,title,caption,taken_date,image_path,sort_order,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,albumId,title,caption,takenDate,imagePath,sortOrder,actorId,actorId,t,t);
    const albumCover=this.db.prepare('SELECT cover_photo_id FROM gallery_albums WHERE id=?').get(albumId);
    if(!albumCover?.cover_photo_id)this.db.prepare('UPDATE gallery_albums SET cover_photo_id=?,updated_by=?,updated_at=? WHERE id=?').run(id,actorId,t,albumId);
    else this.db.prepare('UPDATE gallery_albums SET updated_by=?,updated_at=? WHERE id=?').run(actorId,t,albumId);
    this.audit(actorId,'gallery.photo_create','gallery_photo',id,JSON.stringify({album_id:albumId,title}));
    return this.getGalleryPhoto(id);
  }
  updateGalleryPhoto(id,input,actorId) {
    const current=this.db.prepare('SELECT * FROM gallery_photos WHERE id=?').get(id); if(!current)return null;
    const albumId=input?.album_id==null?current.album_id:String(input.album_id||'').trim();
    if(!this.db.prepare('SELECT id FROM gallery_albums WHERE id=?').get(albumId))throw new Error('Không tìm thấy thư mục ảnh.');
    const targetAlbum=this.getGalleryAlbumRaw(albumId); let imagePath=input?.image_path==null?normalizeUploadPath(current.image_path):normalizeUploadPath(input.image_path); const requiredPrefix=targetAlbum?.storage_folder?`${UPLOAD_LAYOUT.gallery}/${targetAlbum.storage_folder}/`:''; if(imagePath&&!imagePath.includes('/')&&requiredPrefix)imagePath=`${requiredPrefix}${imagePath}`; if(!imagePath||!requiredPrefix||!imagePath.startsWith(requiredPrefix))throw new Error('Tệp ảnh không nằm đúng thư mục album.');
    const title=input?.title==null?current.title:(String(input.title||'').trim().slice(0,160)||null);
    const caption=input?.caption==null?current.caption:(String(input.caption||'').trim().slice(0,2000)||null);
    const takenDate=input?.taken_date==null?current.taken_date:(String(input.taken_date||'').trim().slice(0,40)||null);
    const sortOrder=input?.sort_order==null?current.sort_order:Math.max(-9999,Math.min(9999,Math.trunc(Number(input.sort_order)||0)));
    this.db.prepare('UPDATE gallery_photos SET album_id=?,title=?,caption=?,taken_date=?,image_path=?,sort_order=?,updated_by=?,updated_at=? WHERE id=?')
      .run(albumId,title,caption,takenDate,imagePath,sortOrder,actorId,nowIso(),id);
    if(current.album_id!==albumId){
      this.db.prepare('UPDATE gallery_albums SET cover_photo_id=NULL WHERE id=? AND cover_photo_id=?').run(current.album_id,id);
      const target=this.db.prepare('SELECT cover_photo_id FROM gallery_albums WHERE id=?').get(albumId);
      if(!target?.cover_photo_id)this.db.prepare('UPDATE gallery_albums SET cover_photo_id=? WHERE id=?').run(id,albumId);
    }
    this.db.prepare('UPDATE gallery_albums SET updated_by=?,updated_at=? WHERE id IN (?,?)').run(actorId,nowIso(),current.album_id,albumId);
    this.audit(actorId,'gallery.photo_update','gallery_photo',id,JSON.stringify({album_id:albumId,title}));
    return this.getGalleryPhoto(id);
  }
  deleteGalleryPhoto(id,actorId) {
    const current=this.db.prepare('SELECT * FROM gallery_photos WHERE id=?').get(id); if(!current)return null;
    this.withTransaction(()=>{
      this.db.prepare('UPDATE gallery_albums SET cover_photo_id=NULL WHERE id=? AND cover_photo_id=?').run(current.album_id,id);
      this.db.prepare('DELETE FROM gallery_photos WHERE id=?').run(id);
      const replacement=this.db.prepare('SELECT id FROM gallery_photos WHERE album_id=? ORDER BY sort_order,created_at DESC LIMIT 1').get(current.album_id);
      if(replacement)this.db.prepare('UPDATE gallery_albums SET cover_photo_id=?,updated_by=?,updated_at=? WHERE id=? AND cover_photo_id IS NULL').run(replacement.id,actorId,nowIso(),current.album_id);
    });
    this.audit(actorId,'gallery.photo_delete','gallery_photo',id,JSON.stringify({album_id:current.album_id,title:current.title||''}));
    return current;
  }

  presentGalleryVideo(row) {
    if(!row)return null;
    return { ...row, is_public:!!row.is_public, embed_url:`https://www.youtube-nocookie.com/embed/${row.youtube_id}`, thumbnail_url:`https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg`, created_by_name:row.created_by_name||null, updated_by_name:row.updated_by_name||null };
  }
  listGalleryVideos({ publicOnly=false }={}) {
    const where=publicOnly?'WHERE v.is_public=1':'';
    const rows=this.db.prepare(`SELECT v.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM gallery_videos v LEFT JOIN users cu ON cu.id=v.created_by LEFT JOIN users uu ON uu.id=v.updated_by ${where} ORDER BY v.sort_order,v.updated_at DESC,v.title COLLATE NOCASE`).all();
    return rows.map((r)=>this.presentGalleryVideo(r));
  }
  getGalleryVideo(id) { const row=this.db.prepare(`SELECT v.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM gallery_videos v LEFT JOIN users cu ON cu.id=v.created_by LEFT JOIN users uu ON uu.id=v.updated_by WHERE v.id=?`).get(id); return this.presentGalleryVideo(row); }
  createGalleryVideo(input,actorId) {
    const title=String(input?.title||'').trim().slice(0,180); if(!title)throw new Error('Tiêu đề video không được để trống.');
    const youtubeId=String(input?.youtube_id||'').trim(); if(!/^[A-Za-z0-9_-]{11}$/.test(youtubeId))throw new Error('Link YouTube không hợp lệ.');
    const youtubeUrl=String(input?.youtube_url||'').trim().slice(0,1000); const sortOrder=Math.max(-9999,Math.min(9999,Math.trunc(Number(input?.sort_order)||0))); const isPublic=input?.is_public===false||String(input?.is_public)==='0'?0:1; const id=uuid(),t=nowIso();
    this.db.prepare('INSERT INTO gallery_videos(id,title,youtube_url,youtube_id,sort_order,is_public,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,title,youtubeUrl,youtubeId,sortOrder,isPublic,actorId,actorId,t,t);
    this.audit(actorId,'gallery.video_create','gallery_video',id,JSON.stringify({title,youtube_id:youtubeId})); return this.getGalleryVideo(id);
  }
  updateGalleryVideo(id,input,actorId) {
    const current=this.db.prepare('SELECT * FROM gallery_videos WHERE id=?').get(id); if(!current)return null;
    const title=input?.title==null?current.title:String(input.title||'').trim().slice(0,180); if(!title)throw new Error('Tiêu đề video không được để trống.');
    const youtubeId=input?.youtube_id==null?current.youtube_id:String(input.youtube_id||'').trim(); if(!/^[A-Za-z0-9_-]{11}$/.test(youtubeId))throw new Error('Link YouTube không hợp lệ.');
    const youtubeUrl=input?.youtube_url==null?current.youtube_url:String(input.youtube_url||'').trim().slice(0,1000); const sortOrder=input?.sort_order==null?current.sort_order:Math.max(-9999,Math.min(9999,Math.trunc(Number(input.sort_order)||0))); const isPublic=input?.is_public==null?current.is_public:(input.is_public===false||String(input.is_public)==='0'?0:1);
    this.db.prepare('UPDATE gallery_videos SET title=?,youtube_url=?,youtube_id=?,sort_order=?,is_public=?,updated_by=?,updated_at=? WHERE id=?').run(title,youtubeUrl,youtubeId,sortOrder,isPublic,actorId,nowIso(),id);
    this.audit(actorId,'gallery.video_update','gallery_video',id,JSON.stringify({title,youtube_id:youtubeId})); return this.getGalleryVideo(id);
  }
  deleteGalleryVideo(id,actorId) { const current=this.db.prepare('SELECT * FROM gallery_videos WHERE id=?').get(id); if(!current)return null; this.db.prepare('DELETE FROM gallery_videos WHERE id=?').run(id); this.audit(actorId,'gallery.video_delete','gallery_video',id,JSON.stringify({title:current.title})); return current; }

  presentContact(row) { if(!row)return null; return { ...row, is_public:!!row.is_public, image_url:row.image_path?uploadUrl(row.image_path):null, image_path:undefined, created_by_name:row.created_by_name||null, updated_by_name:row.updated_by_name||null }; }
  listContacts({ publicOnly=false }={}) { const where=publicOnly?'WHERE c.is_public=1':''; const rows=this.db.prepare(`SELECT c.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM contact_people c LEFT JOIN users cu ON cu.id=c.created_by LEFT JOIN users uu ON uu.id=c.updated_by ${where} ORDER BY c.sort_order,c.updated_at DESC,c.name_text COLLATE NOCASE`).all(); return rows.map((r)=>this.presentContact(r)); }
  getContact(id) { const row=this.db.prepare(`SELECT c.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM contact_people c LEFT JOIN users cu ON cu.id=c.created_by LEFT JOIN users uu ON uu.id=c.updated_by WHERE c.id=?`).get(id); return this.presentContact(row); }
  getContactRaw(id) { return this.db.prepare('SELECT * FROM contact_people WHERE id=?').get(id)||null; }
  createContact(input,actorId) {
    const nameText=String(input?.name_text||'').trim().slice(0,240); if(!nameText)throw new Error('Họ và tên không được để trống.');
    const nameContent=normalizeRichTextContent(input?.name_content||'[]',1000); const phoneContent=normalizeRichTextContent(input?.phone_content||'[]',1000); const addressContent=normalizeRichTextContent(input?.address_content||'[]',4000); const phone=String(input?.phone||'').replace(/[^0-9+().\-\s]/g,'').trim().slice(0,80)||null;
    const imagePath=input?.image_path?normalizeUploadPath(input.image_path):null; if(imagePath&&!imagePath.startsWith(`${UPLOAD_LAYOUT.contacts}/`))throw new Error('Ảnh liên hệ không nằm đúng thư mục.');
    const sortOrder=Math.max(-9999,Math.min(9999,Math.trunc(Number(input?.sort_order)||0))); const isPublic=input?.is_public===false||String(input?.is_public)==='0'?0:1; const id=uuid(),t=nowIso();
    this.db.prepare('INSERT INTO contact_people(id,name_text,name_content,phone,phone_content,address_content,image_path,sort_order,is_public,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,nameText,nameContent,phone,phoneContent,addressContent,imagePath,sortOrder,isPublic,actorId,actorId,t,t);
    this.audit(actorId,'contact.create','contact',id,JSON.stringify({name:nameText})); return this.getContact(id);
  }
  updateContact(id,input,actorId) {
    const current=this.getContactRaw(id); if(!current)return null; const nameText=input?.name_text==null?current.name_text:String(input.name_text||'').trim().slice(0,240); if(!nameText)throw new Error('Họ và tên không được để trống.');
    const nameContent=input?.name_content==null?current.name_content:normalizeRichTextContent(input.name_content,1000); const phoneContent=input?.phone_content==null?current.phone_content:normalizeRichTextContent(input.phone_content,1000); const addressContent=input?.address_content==null?current.address_content:normalizeRichTextContent(input.address_content,4000); const phone=input?.phone==null?current.phone:(String(input.phone||'').replace(/[^0-9+().\-\s]/g,'').trim().slice(0,80)||null);
    const imagePath=input?.image_path===undefined?current.image_path:(input.image_path?normalizeUploadPath(input.image_path):null); if(imagePath&&!imagePath.startsWith(`${UPLOAD_LAYOUT.contacts}/`))throw new Error('Ảnh liên hệ không nằm đúng thư mục.'); const sortOrder=input?.sort_order==null?current.sort_order:Math.max(-9999,Math.min(9999,Math.trunc(Number(input.sort_order)||0))); const isPublic=input?.is_public==null?current.is_public:(input.is_public===false||String(input.is_public)==='0'?0:1);
    this.db.prepare('UPDATE contact_people SET name_text=?,name_content=?,phone=?,phone_content=?,address_content=?,image_path=?,sort_order=?,is_public=?,updated_by=?,updated_at=? WHERE id=?').run(nameText,nameContent,phone,phoneContent,addressContent,imagePath,sortOrder,isPublic,actorId,nowIso(),id); this.audit(actorId,'contact.update','contact',id,JSON.stringify({name:nameText})); return this.getContact(id);
  }
  deleteContact(id,actorId) { const current=this.getContactRaw(id); if(!current)return null; this.db.prepare('DELETE FROM contact_people WHERE id=?').run(id); this.audit(actorId,'contact.delete','contact',id,JSON.stringify({name:current.name_text})); return current; }

  normalizeContributionInput(input,current={}) {
    const donorName=String(input?.donor_name??current.donor_name??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
    if(!donorName) throw new Error('Phương danh không được để trống.');
    const contributionContent=String(input?.contribution_content??current.contribution_content??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,2000);
    const notes=String(input?.notes??current.notes??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,3000);
    const rawAmount=input?.amount??current.amount??0; const amount=Math.trunc(Number(rawAmount));
    if(!Number.isSafeInteger(amount)||amount<0||amount>9000000000000000) throw new Error('Giá trị công đức không hợp lệ.');
    const contributionDate=String(input?.contribution_date??current.contribution_date??'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(contributionDate)) throw new Error('Ngày công đức phải theo định dạng YYYY-MM-DD.');
    const dt=new Date(`${contributionDate}T00:00:00Z`); if(Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==contributionDate) throw new Error('Ngày công đức không hợp lệ.');
    return {donor_name:donorName,contribution_content:contributionContent,amount,contribution_date:contributionDate,notes};
  }
  presentContribution(row){if(!row)return null;return {...row,amount:Number(row.amount||0)};}
  listContributions(){return this.db.prepare(`SELECT c.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM contributions c LEFT JOIN users cu ON cu.id=c.created_by LEFT JOIN users uu ON uu.id=c.updated_by ORDER BY c.contribution_date DESC,c.created_at DESC,c.donor_name COLLATE NOCASE`).all().map((r)=>this.presentContribution(r));}
  contributionYears(){return this.db.prepare("SELECT DISTINCT substr(contribution_date,1,4) AS year FROM contributions WHERE contribution_date GLOB '[0-9][0-9][0-9][0-9]-*' ORDER BY year DESC").all().map((r)=>String(r.year)).filter((y)=>/^\d{4}$/.test(y));}
  topContributors(limit=10){
    const n=[5,10,15,20].includes(Number(limit))?Number(limit):10;
    return this.db.prepare(`SELECT MIN(id) AS id, donor_name, COUNT(*) AS contribution_count, SUM(amount) AS amount, MAX(contribution_date) AS contribution_date FROM contributions GROUP BY donor_name COLLATE NOCASE ORDER BY amount DESC, contribution_date DESC, donor_name COLLATE NOCASE LIMIT ?`).all(n).map((r)=>({id:r.id,donor_name:r.donor_name,contribution_content:`Tổng ${Number(r.contribution_count||0)} lần công đức`,amount:Number(r.amount||0),contribution_date:r.contribution_date,notes:`Tổng hợp từ ${Number(r.contribution_count||0)} lần công đức`,contribution_count:Number(r.contribution_count||0)}));
  }
  contributionSummary(rows=null){const list=Array.isArray(rows)?rows:this.listContributions();const donors=new Set(list.map((r)=>String(r.donor_name||'').trim().toLocaleLowerCase('vi')).filter(Boolean));return {count:list.length,donors:donors.size,total_amount:list.reduce((sum,r)=>sum+Number(r.amount||0),0)};}
  createContribution(input,actorId){const x=this.normalizeContributionInput(input);const id=uuid(),t=nowIso();this.db.prepare('INSERT INTO contributions(id,donor_name,contribution_content,amount,contribution_date,notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,x.donor_name,x.contribution_content,x.amount,x.contribution_date,x.notes,actorId,actorId,t,t);this.audit(actorId,'contribution.create','contribution',id,JSON.stringify({donor_name:x.donor_name,amount:x.amount,date:x.contribution_date}));return this.getContribution(id);}
  getContribution(id){return this.presentContribution(this.db.prepare(`SELECT c.*,cu.display_name AS created_by_name,uu.display_name AS updated_by_name FROM contributions c LEFT JOIN users cu ON cu.id=c.created_by LEFT JOIN users uu ON uu.id=c.updated_by WHERE c.id=?`).get(id));}
  updateContribution(id,input,actorId){const current=this.db.prepare('SELECT * FROM contributions WHERE id=?').get(id);if(!current)return null;const x=this.normalizeContributionInput(input,current);this.db.prepare('UPDATE contributions SET donor_name=?,contribution_content=?,amount=?,contribution_date=?,notes=?,updated_by=?,updated_at=? WHERE id=?').run(x.donor_name,x.contribution_content,x.amount,x.contribution_date,x.notes,actorId,nowIso(),id);this.audit(actorId,'contribution.update','contribution',id,JSON.stringify({donor_name:x.donor_name,amount:x.amount,date:x.contribution_date}));return this.getContribution(id);}
  deleteContribution(id,actorId){const current=this.db.prepare('SELECT * FROM contributions WHERE id=?').get(id);if(!current)return null;this.db.prepare('DELETE FROM contributions WHERE id=?').run(id);this.audit(actorId,'contribution.delete','contribution',id,JSON.stringify({donor_name:current.donor_name,amount:Number(current.amount||0),date:current.contribution_date}));return this.presentContribution(current);}

  createSession(tokenHash, csrfToken, expiresAt, userId = null) {
    const t = nowIso();
    this.db.prepare('INSERT INTO sessions(token_hash,csrf_token,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(tokenHash,csrfToken,userId,t,expiresAt,t);
  }
  getSession(tokenHash) {
    const row = this.db.prepare(`SELECT s.*,u.username,u.display_name,u.role,u.is_active,u.must_change_password,u.can_manage_gallery FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(tokenHash);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); return null; }
    this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(nowIso(),tokenHash);
    if (row.user_id && !row.is_active) { this.db.prepare('UPDATE sessions SET user_id=NULL WHERE token_hash=?').run(tokenHash); row.user_id = null; }
    return row;
  }
  attachSessionUser(tokenHash, userId) { this.db.prepare('UPDATE sessions SET user_id=?,last_seen_at=? WHERE token_hash=?').run(userId,nowIso(),tokenHash); }
  deleteSession(tokenHash) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); }
  cleanupSessions() { this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso()); }

  rawPeople() {
    return this.db.prepare('SELECT * FROM persons ORDER BY level,CASE WHEN birth_order<=0 THEN 999 ELSE birth_order END,sort_order,full_name').all().map(this.rowToPerson);
  }
  rowToPerson(row) {
    if (!row) return null;
    return {
      ...row,
      is_deceased: !!row.is_deceased,
      is_adopted: !!row.is_adopted,
      is_inlaw: !!row.is_inlaw,
      spouse_ids: safeJson(row.spouse_ids, []),
      spouse_order_ids: safeJson(row.spouse_order_ids, []),
      divorced_spouse_ids: safeJson(row.divorced_spouse_ids, []),
      step_parent_ids: safeJson(row.step_parent_ids, []),
      sibling_ids: safeJson(row.sibling_ids, []),
    };
  }
  getPerson(id) { return this.rowToPerson(this.db.prepare('SELECT * FROM persons WHERE id=?').get(id)); }

  nextFamilyCode() {
    const rows = this.db.prepare("SELECT family_code FROM persons WHERE family_code IS NOT NULL AND TRIM(family_code) <> ''").all();
    let maxNumber = 0;
    let width = 3;
    const used = new Set();
    for (const row of rows) {
      const code = String(row.family_code || '').trim().toUpperCase();
      if (!code) continue;
      used.add(code);
      const match = /^I(\d+)$/.exec(code);
      if (!match) continue;
      maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
      width = Math.max(width, match[1].length);
    }
    let number = maxNumber + 1;
    let code;
    do {
      code = `I${String(number).padStart(Math.max(width, String(number).length), '0')}`;
      number += 1;
    } while (used.has(code));
    return code;
  }

  branchMembershipMap(people = null) {
    const all = Array.isArray(people) ? people : this.rawPeople();
    const byId = new Map(all.map((p)=>[p.id,p]));
    const rows = this.db.prepare('SELECT id,name,root_person_id,is_public,sort_order FROM branches ORDER BY sort_order,name').all();
    const result = new Map(all.map((p)=>[p.id,[]]));
    for (const branch of rows) {
      if (!byId.has(branch.root_person_id)) continue;
      const lineage = new Set([branch.root_person_id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const person of all) {
          if (lineage.has(person.id)) continue;
          if ((person.father_id && lineage.has(person.father_id)) || (person.mother_id && lineage.has(person.mother_id))) {
            lineage.add(person.id); changed = true;
          }
        }
      }
      for (const id of lineage) {
        if (!result.has(id)) result.set(id,[]);
        result.get(id).push({ id:branch.id, name:branch.name, is_public:!!branch.is_public });
      }
    }
    return result;
  }
  attachBranchMembership(people, { publicOnly = false } = {}) {
    const map = this.branchMembershipMap(this.rawPeople());
    return people.map((p)=>{
      const memberships=(map.get(p.id)||[]).filter((b)=>!publicOnly||b.is_public);
      return { ...p, branch_ids:memberships.map((b)=>b.id), branch_names:memberships.map((b)=>b.name) };
    });
  }
  listPeople({ publicOnly = false } = {}) {
    const people = this.rawPeople().map((p)=>this.presentPerson(p,publicOnly));
    return this.attachBranchMembership(people,{publicOnly});
  }
  presentPerson(person, publicOnly) {
    const p = { ...person };
    p.age_years = ageYearsForPerson(p);
    if (p.image_path) p.image_url = uploadUrl(p.image_path);
    delete p.image_path; delete p.created_by; delete p.updated_by;
    if (!publicOnly) return p;
    if (p.privacy_mode === 'private') {
      return {
        id:p.id, family_code:null, full_name:'Thành viên riêng tư', gender:p.gender, level:p.level,
        father_id:p.father_id, mother_id:p.mother_id, spouse_ids:p.spouse_ids, spouse_order_ids:p.spouse_order_ids, divorced_spouse_ids:p.divorced_spouse_ids, step_parent_ids:p.step_parent_ids,
        sibling_ids:[], birth_order:p.birth_order, is_adopted:p.is_adopted, is_inlaw:p.is_inlaw, is_deceased:p.is_deceased, age_years:p.age_years, privacy_mode:'private',
      };
    }
    if (p.privacy_mode === 'limited') {
      p.birth_date = null; p.birth_place = null; p.death_date = p.is_deceased ? p.death_date : null; p.death_place = null;
      p.occupation = null; p.details = null; p.source_citations = null; delete p.image_url;
    }
    return p;
  }

  validateRelations(personId, input) {
    const all = this.rawPeople();
    const byId = new Map(all.map((p)=>[p.id,p]));
    const ids = new Set(byId.keys());
    const arrays = ['spouse_ids','spouse_order_ids','divorced_spouse_ids','step_parent_ids','sibling_ids'];
    for (const key of arrays) {
      input[key] = jsonArray(input[key]).filter((id)=>id !== personId);
      if (input[key].some((id)=>!ids.has(id))) throw new Error(`Quan hệ ${key} chứa cá thể không tồn tại`);
    }
    // Vợ/chồng đã ly hôn vẫn là một quan hệ phối ngẫu, chỉ khác trạng thái hiển thị.
    input.spouse_ids = [...new Set([...input.spouse_ids, ...input.divorced_spouse_ids])];
    const requestedSpouseOrder = jsonArray(input.spouse_order_ids);
    input.spouse_order_ids = [...requestedSpouseOrder.filter((id)=>input.spouse_ids.includes(id)), ...input.spouse_ids.filter((id)=>!requestedSpouseOrder.includes(id))];
    for (const key of ['father_id','mother_id']) {
      if (input[key] === '') input[key] = null;
      if (input[key] && input[key] === personId) throw new Error('Một cá thể không thể là cha/mẹ của chính mình');
      if (input[key] && !ids.has(input[key])) throw new Error(`${key} không tồn tại`);
    }
    if (input.father_id && input.mother_id && input.father_id === input.mother_id) throw new Error('Cha và mẹ không thể là cùng một cá thể');
    const father=input.father_id?byId.get(input.father_id):null;
    const mother=input.mother_id?byId.get(input.mother_id):null;
    if(father && father.gender!=='male') throw new Error('Cá thể được chọn làm Cha phải có giới tính Nam');
    if(mother && mother.gender!=='female') throw new Error('Cá thể được chọn làm Mẹ phải có giới tính Nữ');
    const parentIds=new Set([input.father_id,input.mother_id].filter(Boolean));
    for(const stepId of input.step_parent_ids||[]) if(parentIds.has(stepId)) throw new Error('Cha/Mẹ kế không thể đồng thời là Cha/Mẹ huyết thống');
    for(const sid of input.spouse_ids){
      if(parentIds.has(sid)) throw new Error('Cha/Mẹ không thể đồng thời là Vợ/Chồng của cá thể');
      const spouse=byId.get(sid); if(!spouse) continue;
      if(input.gender==='male' && spouse.gender!=='female') throw new Error('Cá thể Nam chỉ có thể chọn Vợ/Chồng có giới tính Nữ');
      if(input.gender==='female' && spouse.gender!=='male') throw new Error('Cá thể Nữ chỉ có thể chọn Vợ/Chồng có giới tính Nam');
    }
    this.assertNoParentCycle(personId,input.father_id,input.mother_id);

  }
  assertNoParentCycle(personId, fatherId, motherId) {
    if (!personId) return;
    const byId = new Map(this.rawPeople().map((p)=>[p.id,p]));
    const stack = [fatherId,motherId].filter(Boolean); const seen = new Set();
    while (stack.length) {
      const id = stack.pop(); if (!id || seen.has(id)) continue; seen.add(id);
      if (id === personId) throw new Error('Quan hệ cha/mẹ tạo vòng lặp trong cây gia phả');
      const p = byId.get(id); if (p) stack.push(p.father_id,p.mother_id);
    }
  }
  normalizePersonInput(input, current = {}) {
    const full_name = String(input.full_name ?? current.full_name ?? '').trim();
    if (full_name.length < 2 || full_name.length > 160) throw new Error('Họ tên phải từ 2 đến 160 ký tự');
    const gender = ['male','female','other'].includes(input.gender) ? input.gender : (current.gender || 'other');
    const is_deceased = input.is_deceased == null ? !!current.is_deceased : !!input.is_deceased;
    const privacyFallback = is_deceased ? 'public' : this.getSetting('living_default_privacy','limited');
    const privacy_mode = ['public','limited','private'].includes(input.privacy_mode) ? input.privacy_mode : (current.privacy_mode || privacyFallback);
    const clean = (v,max=2000)=> v == null || String(v).trim()==='' ? null : String(v).trim().slice(0,max);
    return {
      family_code: clean(input.family_code ?? current.family_code, 40), full_name, gender,
      birth_date: clean(input.birth_date ?? current.birth_date, 40), birth_place: clean(input.birth_place ?? current.birth_place, 2000),
      death_date: clean(input.death_date ?? current.death_date, 40), death_place: clean(input.death_place ?? current.death_place, 2000),
      is_deceased,
      level: Math.min(50,Math.max(1,Math.trunc(Number(input.level ?? current.level ?? 1)||1))),
      father_id: input.father_id ?? current.father_id ?? null, mother_id: input.mother_id ?? current.mother_id ?? null,
      spouse_ids: jsonArray(input.spouse_ids ?? current.spouse_ids), spouse_order_ids: jsonArray(input.spouse_order_ids ?? current.spouse_order_ids ?? current.spouse_ids), divorced_spouse_ids: jsonArray(input.divorced_spouse_ids ?? current.divorced_spouse_ids),
      step_parent_ids: jsonArray(input.step_parent_ids ?? current.step_parent_ids), sibling_ids: jsonArray(input.sibling_ids ?? current.sibling_ids),
      birth_order: (input.is_inlaw == null ? !!current.is_inlaw : !!input.is_inlaw) ? 0 : Math.min(50,Math.max(1,Number(input.birth_order ?? current.birth_order ?? 1)||1)),
      is_adopted: input.is_adopted == null ? !!current.is_adopted : !!input.is_adopted,
      is_inlaw: input.is_inlaw == null ? !!current.is_inlaw : !!input.is_inlaw,
      occupation: clean(input.occupation ?? current.occupation, 180), details: clean(input.details ?? current.details, 6000),
      source_citations: clean(input.source_citations ?? current.source_citations, 8000),
      privacy_mode, sort_order: Number(input.sort_order ?? current.sort_order ?? 0)||0,
      image_path: input.image_path !== undefined ? (input.image_path ? (()=>{const rel=normalizeUploadPath(input.image_path);return rel?(rel.includes('/')?rel:`${UPLOAD_LAYOUT.profiles}/${rel}`):null;})() : null) : (current.image_path || null),
    };
  }

  inferGeneration(input, fallback = 1) {
    const byId=new Map(this.rawPeople().map((p)=>[p.id,p]));
    const parentIds=[input?.father_id,input?.mother_id].filter((id)=>id&&byId.has(id));
    if(parentIds.length) return Math.min(50,Math.max(...parentIds.map((id)=>Number(byId.get(id)?.level)||1))+1);
    const spouseIds=jsonArray(input?.spouse_ids).filter((id)=>byId.has(id));
    if(spouseIds.length) return Math.min(50,Math.max(1,...spouseIds.map((id)=>Number(byId.get(id)?.level)||1)));
    return Math.min(50,Math.max(1,Number(fallback)||1));
  }

  propagateGenerationsFrom(anchorIds, actorId=null) {
    const people=this.rawPeople();
    if(!people.length) return new Map();
    const byId=new Map(people.map((p)=>[p.id,{...p}]));
    const childrenByParent=new Map();
    for(const child of people){
      for(const pid of [child.father_id,child.mother_id]){
        if(!pid||!byId.has(pid)) continue;
        if(!childrenByParent.has(pid)) childrenByParent.set(pid,[]);
        childrenByParent.get(pid).push(child);
      }
    }
    const anchors=new Set(jsonArray(anchorIds).filter((id)=>byId.has(id)));
    if(!anchors.size) return new Map(people.map((p)=>[p.id,Number(p.level)||1]));

    // Propagate only forward from the edited person(s): spouses stay on the same
    // generation, and children are always one generation below the highest parent.
    // Following spouses as part of the same family unit also keeps children from
    // previous/later marriages internally consistent without ever rewriting ancestors.
    const desired=new Map([...anchors].map((id)=>[id,Number(byId.get(id)?.level)||1]));
    const affected=new Set(anchors);
    const queue=[...anchors];
    const queued=new Set(queue);
    const maxSteps=Math.max(20,people.length*20);let steps=0;
    const enqueue=(id)=>{if(!id||!byId.has(id)||queued.has(id))return;queue.push(id);queued.add(id);};
    while(queue.length && steps++<maxSteps){
      const id=queue.shift();queued.delete(id);
      const p=byId.get(id);if(!p)continue;
      const level=desired.get(id) ?? (Number(p.level)||1);
      if(!anchors.has(id) && Number(p.level)!==level) p.level=level;
      affected.add(id);

      for(const sid of jsonArray(p.spouse_ids)){
        if(!byId.has(sid))continue;
        const target=Math.min(50,Math.max(1,Number(level)||1));
        if(!anchors.has(sid) && desired.get(sid)!==target){desired.set(sid,target);enqueue(sid);}
        affected.add(sid);
      }
      for(const child of childrenByParent.get(id)||[]){
        const parentIds=[child.father_id,child.mother_id].filter((pid)=>pid&&byId.has(pid));
        const target=Math.min(50,Math.max(...parentIds.map((pid)=>desired.get(pid) ?? (Number(byId.get(pid)?.level)||1)))+1);
        if(!anchors.has(child.id) && desired.get(child.id)!==target){desired.set(child.id,target);enqueue(child.id);}
        affected.add(child.id);
      }
    }

    // Apply final desired values after the graph has stabilized. Anchors retain the
    // exact value entered by the administrator; downstream nodes use derived values.
    for(const [id,level] of desired){const p=byId.get(id);if(p&&!anchors.has(id))p.level=level;}
    const t=nowIso();
    this.withTransaction(()=>{
      const stmt=this.db.prepare('UPDATE persons SET level=?,updated_by=COALESCE(?,updated_by),updated_at=? WHERE id=?');
      for(const original of people){
        if(!affected.has(original.id)) continue;
        const next=anchors.has(original.id)?(desired.get(original.id) ?? (Number(original.level)||1)):(Number(byId.get(original.id)?.level)||1);
        if(Number(original.level)!==next) stmt.run(next,actorId,t,original.id);
      }
    });
    return new Map([...byId].map(([id,p])=>[id,anchors.has(id)?(desired.get(id) ?? (Number(p.level)||1)):(Number(p.level)||1)]));
  }

  recalculateGenerations(actorId=null) {
    // Compatibility helper for explicit maintenance calls: preserve every current
    // root generation, then derive descendants. This no longer resets all roots to Đời 1.
    const roots=this.rawPeople().filter((p)=>!p.father_id&&!p.mother_id).map((p)=>p.id);
    return this.propagateGenerationsFrom(roots,actorId);
  }

  createPerson(input, actorId) {
    const id = uuid(); const p = this.normalizePersonInput(input); this.validateRelations(id,p);
    p.family_code = this.nextFamilyCode();
    // Nếu client không gửi đời, vẫn tự tính theo cha/mẹ hoặc phối ngẫu.
    p.level = input?.level == null ? this.inferGeneration(p,1) : p.level;
    const t=nowIso();
    this.db.prepare(`INSERT INTO persons(id,family_code,full_name,gender,birth_date,birth_place,death_date,death_place,is_deceased,level,father_id,mother_id,spouse_ids,spouse_order_ids,divorced_spouse_ids,step_parent_ids,sibling_ids,birth_order,is_adopted,is_inlaw,occupation,details,source_citations,image_path,privacy_mode,sort_order,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,p.family_code,p.full_name,p.gender,p.birth_date,p.birth_place,p.death_date,p.death_place,p.is_deceased?1:0,p.level,p.father_id,p.mother_id,JSON.stringify(p.spouse_ids),JSON.stringify(p.spouse_order_ids),JSON.stringify(p.divorced_spouse_ids),JSON.stringify(p.step_parent_ids),JSON.stringify(p.sibling_ids),p.birth_order,p.is_adopted?1:0,p.is_inlaw?1:0,p.occupation,p.details,p.source_citations,p.image_path,p.privacy_mode,p.sort_order,actorId,actorId,t,t);
    this.ensureReciprocalSpouses(id,p.spouse_ids,p.divorced_spouse_ids,p.spouse_order_ids,actorId);
    this.propagateGenerationsFrom([id],actorId);
    this.audit(actorId,'person.create','person',id,JSON.stringify({name:p.full_name}));
    return this.presentPerson(this.getPerson(id),false);
  }
  updatePerson(id, input, actorId) {
    const current=this.getPerson(id); if(!current) return null;
    const p=this.normalizePersonInput(input,current); this.validateRelations(id,p);
    p.family_code = current.family_code || this.nextFamilyCode();
    if(input?.level == null && (input?.father_id !== undefined || input?.mother_id !== undefined)) p.level=this.inferGeneration(p,current.level||1);
    this.db.prepare(`UPDATE persons SET family_code=?,full_name=?,gender=?,birth_date=?,birth_place=?,death_date=?,death_place=?,is_deceased=?,level=?,father_id=?,mother_id=?,spouse_ids=?,spouse_order_ids=?,divorced_spouse_ids=?,step_parent_ids=?,sibling_ids=?,birth_order=?,is_adopted=?,is_inlaw=?,occupation=?,details=?,source_citations=?,image_path=?,privacy_mode=?,sort_order=?,updated_by=?,updated_at=? WHERE id=?`)
      .run(p.family_code,p.full_name,p.gender,p.birth_date,p.birth_place,p.death_date,p.death_place,p.is_deceased?1:0,p.level,p.father_id,p.mother_id,JSON.stringify(p.spouse_ids),JSON.stringify(p.spouse_order_ids),JSON.stringify(p.divorced_spouse_ids),JSON.stringify(p.step_parent_ids),JSON.stringify(p.sibling_ids),p.birth_order,p.is_adopted?1:0,p.is_inlaw?1:0,p.occupation,p.details,p.source_citations,p.image_path,p.privacy_mode,p.sort_order,actorId,nowIso(),id);
    this.ensureReciprocalSpouses(id,p.spouse_ids,p.divorced_spouse_ids,p.spouse_order_ids,actorId);
    this.propagateGenerationsFrom([id],actorId);
    this.audit(actorId,'person.update','person',id,JSON.stringify({name:p.full_name}));
    return this.presentPerson(this.getPerson(id),false);
  }
  ensureReciprocalSpouses(id, spouseIds, divorcedIds, spouseOrderIds, actorId) {
    const all=this.rawPeople();
    const preferred=jsonArray(spouseOrderIds).filter((sid)=>spouseIds.includes(sid));
    this.withTransaction(()=>{
      for (const p of all) {
        if (p.id===id) continue;
        const should = spouseIds.includes(p.id);
        let spouses=jsonArray(p.spouse_ids); let order=jsonArray(p.spouse_order_ids); let divorced=jsonArray(p.divorced_spouse_ids); let changed=false;
        if (should && !spouses.includes(id)) { spouses.push(id); changed=true; }
        if (should && !order.includes(id)) { order.push(id); changed=true; }
        if (!should && spouses.includes(id)) { spouses=spouses.filter((x)=>x!==id); divorced=divorced.filter((x)=>x!==id); order=order.filter((x)=>x!==id); changed=true; }
        const shouldDiv=divorcedIds.includes(p.id);
        if (shouldDiv && !divorced.includes(id)) { divorced.push(id); changed=true; }
        if (!shouldDiv && divorced.includes(id)) { divorced=divorced.filter((x)=>x!==id); changed=true; }
        order=[...order.filter((sid)=>spouses.includes(sid)),...spouses.filter((sid)=>!order.includes(sid))];
        if(changed) this.db.prepare('UPDATE persons SET spouse_ids=?,spouse_order_ids=?,divorced_spouse_ids=?,updated_by=?,updated_at=? WHERE id=?').run(JSON.stringify(spouses),JSON.stringify(order),JSON.stringify(divorced),actorId,nowIso(),p.id);
      }
      this.db.prepare('UPDATE persons SET spouse_order_ids=? WHERE id=?').run(JSON.stringify([...preferred,...spouseIds.filter((sid)=>!preferred.includes(sid))]),id);
    });
  }
  deletePerson(id, actorId) {
    const current=this.getPerson(id); if(!current) return false;
    const all=this.rawPeople();
    const affectedChildren=all.filter((p)=>p.father_id===id||p.mother_id===id).map((p)=>p.id);
    this.withTransaction(()=>{
      for(const p of all){ if(p.id===id) continue;
        const spouse=jsonArray(p.spouse_ids).filter((x)=>x!==id);
        const spouseOrder=jsonArray(p.spouse_order_ids).filter((x)=>x!==id&&spouse.includes(x));
        const div=jsonArray(p.divorced_spouse_ids).filter((x)=>x!==id);
        const step=jsonArray(p.step_parent_ids).filter((x)=>x!==id);
        const sib=jsonArray(p.sibling_ids).filter((x)=>x!==id);
        this.db.prepare(`UPDATE persons SET father_id=CASE WHEN father_id=? THEN NULL ELSE father_id END,mother_id=CASE WHEN mother_id=? THEN NULL ELSE mother_id END,spouse_ids=?,spouse_order_ids=?,divorced_spouse_ids=?,step_parent_ids=?,sibling_ids=?,updated_by=?,updated_at=? WHERE id=?`)
          .run(id,id,JSON.stringify(spouse),JSON.stringify(spouseOrder),JSON.stringify(div),JSON.stringify(step),JSON.stringify(sib),actorId,nowIso(),p.id);
      }
      this.db.prepare('DELETE FROM persons WHERE id=?').run(id);
    });
    if(current.image_path){ try{ const full=uploadFullPath(current.image_path); if(full)fs.unlinkSync(full); }catch{} }
    for(const childId of affectedChildren){
      const child=this.getPerson(childId); if(!child) continue;
      const next=this.inferGeneration(child,child.level||1);
      if((child.father_id||child.mother_id)&&Number(child.level)!==next){
        this.db.prepare('UPDATE persons SET level=?,updated_by=?,updated_at=? WHERE id=?').run(next,actorId,nowIso(),childId);
      }
      this.propagateGenerationsFrom([childId],actorId);
    }
    this.audit(actorId,'person.delete','person',id,JSON.stringify({name:current.full_name})); return true;
  }

  branchSlugBase(value) {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const base = normalized.replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return base || 'chi';
  }
  uniqueBranchSlug(name, currentId = null) {
    const base = this.branchSlugBase(name);
    let slug = base; let n = 2;
    const exists = (candidate) => this.db.prepare('SELECT id FROM branches WHERE slug=? AND (? IS NULL OR id<>?)').get(candidate, currentId, currentId);
    while (exists(slug)) slug = `${base}-${n++}`;
    return slug;
  }
  rowToBranch(row, publicOnly = false) {
    if (!row) return null;
    const root = this.getPerson(row.root_person_id);
    const visibleRoot = root ? this.presentPerson(root, publicOnly) : null;
    const people = root ? this.peopleForBranch(row.id, { publicOnly: false }) : [];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      root_person_id: row.root_person_id,
      root_name: visibleRoot?.full_name || 'Không rõ',
      root_birth_date: visibleRoot?.birth_date || null,
      root_level: root?.level || 1,
      description: row.description || '',
      is_public: !!row.is_public,
      sort_order: Number(row.sort_order) || 0,
      member_count: people.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  listBranches({ publicOnly = false } = {}) {
    const rows = this.db.prepare(`SELECT * FROM branches ${publicOnly ? 'WHERE is_public=1' : ''} ORDER BY sort_order,name`).all();
    return rows.map((row) => this.rowToBranch(row, publicOnly));
  }
  getBranch(idOrSlug, { publicOnly = false } = {}) {
    const row = this.db.prepare(`SELECT * FROM branches WHERE (id=? OR slug=?) ${publicOnly ? 'AND is_public=1' : ''}`).get(idOrSlug, idOrSlug);
    return this.rowToBranch(row, publicOnly);
  }
  normalizeBranchInput(input, current = {}) {
    const name = String(input.name ?? current.name ?? '').trim().slice(0, 120);
    if (name.length < 2) throw new Error('Tên Chi phải có ít nhất 2 ký tự');
    const root_person_id = String(input.root_person_id ?? current.root_person_id ?? '').trim();
    if (!root_person_id || !this.getPerson(root_person_id)) throw new Error('Vui lòng chọn cá thể gốc hợp lệ cho Chi');
    const description = String(input.description ?? current.description ?? '').trim().slice(0, 1200) || null;
    const is_public = input.is_public == null ? !!current.is_public : !!input.is_public;
    const sort_order = Math.max(-9999, Math.min(9999, Number(input.sort_order ?? current.sort_order ?? 0) || 0));
    return { name, root_person_id, description, is_public, sort_order };
  }
  createBranch(input, actorId) {
    const b = this.normalizeBranchInput(input);
    const id = uuid(); const t = nowIso(); const slug = this.uniqueBranchSlug(b.name);
    this.db.prepare(`INSERT INTO branches(id,name,slug,root_person_id,description,is_public,sort_order,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,b.name,slug,b.root_person_id,b.description,b.is_public?1:0,b.sort_order,actorId,actorId,t,t);
    this.audit(actorId,'branch.create','branch',id,JSON.stringify({name:b.name,root_person_id:b.root_person_id}));
    return this.getBranch(id);
  }
  updateBranch(id, input, actorId) {
    const row = this.db.prepare('SELECT * FROM branches WHERE id=?').get(id); if(!row) return null;
    const current = this.rowToBranch(row, false); const b = this.normalizeBranchInput(input,current);
    const slug = b.name === current.name ? current.slug : this.uniqueBranchSlug(b.name,id);
    this.db.prepare('UPDATE branches SET name=?,slug=?,root_person_id=?,description=?,is_public=?,sort_order=?,updated_by=?,updated_at=? WHERE id=?')
      .run(b.name,slug,b.root_person_id,b.description,b.is_public?1:0,b.sort_order,actorId,nowIso(),id);
    this.audit(actorId,'branch.update','branch',id,JSON.stringify({name:b.name,root_person_id:b.root_person_id}));
    return this.getBranch(id);
  }
  deleteBranch(id, actorId) {
    const row=this.db.prepare('SELECT id,name FROM branches WHERE id=?').get(id); if(!row) return false;
    this.db.prepare('DELETE FROM branches WHERE id=?').run(id);
    this.audit(actorId,'branch.delete','branch',id,JSON.stringify({name:row.name}));
    return true;
  }
  peopleForBranch(idOrSlug, { publicOnly = false } = {}) {
    const row = this.db.prepare('SELECT * FROM branches WHERE id=? OR slug=?').get(idOrSlug,idOrSlug);
    if(!row || (publicOnly && !row.is_public)) return [];
    const all=this.rawPeople(); const byId=new Map(all.map((p)=>[p.id,p]));
    if(!byId.has(row.root_person_id)) return [];
    const lineage=new Set([row.root_person_id]);
    let changed=true;
    while(changed){
      changed=false;
      for(const p of all){
        if(lineage.has(p.id)) continue;
        if((p.father_id && lineage.has(p.father_id)) || (p.mother_id && lineage.has(p.mother_id))){ lineage.add(p.id); changed=true; }
      }
    }
    const visible=new Set(lineage);
    for(const id of lineage){
      const p=byId.get(id); if(!p) continue;
      for(const sid of jsonArray(p.spouse_ids)) if(byId.has(sid)) visible.add(sid);
    }
    return this.attachBranchMembership(all.filter((p)=>visible.has(p.id)).map((p)=>this.presentPerson(p,publicOnly)),{publicOnly});
  }
  treeStats(people) {
    const rows=Array.isArray(people)?people:[];
    const levels=[...new Set(rows.map((p)=>Number(p.level)||1))];
    const bands=[{min:80,max:null},{min:60,max:80},{min:40,max:60},{min:20,max:40},{min:16,max:20},{min:0,max:16}];
    const resolveAge=(p)=>{const hasAge=p.age_years!==null&&p.age_years!==undefined&&p.age_years!=='';return hasAge&&Number.isFinite(Number(p.age_years))?Number(p.age_years):ageYearsForPerson(p);};
    const age_bands=bands.map(({min,max})=>{
      const members=rows.filter((p)=>{const age=resolveAge(p);return Number.isFinite(age)&&age>=min&&(max==null||age<max);});
      return { min,max,total:members.length,living:members.filter((p)=>!p.is_deceased).length,deceased:members.filter((p)=>p.is_deceased).length };
    });
    const unknownMembers=rows.filter((p)=>!Number.isFinite(resolveAge(p)));
    const age_unknown={ total:unknownMembers.length,living:unknownMembers.filter((p)=>!p.is_deceased).length,deceased:unknownMembers.filter((p)=>p.is_deceased).length };
    return { total:rows.length, male:rows.filter((p)=>p.gender==='male').length, female:rows.filter((p)=>p.gender==='female').length, other_gender:rows.filter((p)=>p.gender==='other').length, deceased:rows.filter((p)=>p.is_deceased).length, living:rows.filter((p)=>!p.is_deceased).length, generations:levels.length, generation_levels:levels.sort((a,b)=>a-b), age_bands, age_unknown };
  }

  addComment(displayName,message,userId,ipHash){ const id=uuid(); const t=nowIso();
    this.db.prepare('INSERT INTO comments(id,display_name,message,user_id,ip_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,displayName,message,userId||null,ipHash||null,t);
    return {id,display_name:displayName,message,user_id:userId||null,created_at:t};
  }
  listComments(includeDeleted=false,limit=200){
    const n=Math.trunc(Number(limit)||0); const useLimit=n>0;
    const sql=`SELECT c.id,c.display_name,c.message,c.user_id,c.created_at,c.deleted_at,u.display_name AS user_display_name,d.display_name AS deleted_by_name FROM comments c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN users d ON d.id=c.deleted_by ${includeDeleted?'':'WHERE c.deleted_at IS NULL'} ORDER BY c.created_at DESC${useLimit?' LIMIT ?':''}`;
    const stmt=this.db.prepare(sql); const rows=useLimit?stmt.all(n):stmt.all();
    return rows.reverse();
  }
  deleteComment(id,actorId){ const row=this.db.prepare('SELECT id FROM comments WHERE id=? AND deleted_at IS NULL').get(id); if(!row)return false;
    this.db.prepare('UPDATE comments SET deleted_at=?,deleted_by=? WHERE id=?').run(nowIso(),actorId,id); this.audit(actorId,'comment.delete','comment',id,'Xóa bình luận'); return true; }

  recordPublicVisit(sessionHash,userId=null) {
    const key=String(sessionHash||'').trim(); if(!key) return false;
    const last=this.db.prepare('SELECT visited_at FROM page_visits WHERE session_hash=? ORDER BY id DESC LIMIT 1').get(key);
    // Treat a reload within 30 minutes as the same visit/session so the counter is
    // useful and cannot be inflated by the page's own polling requests.
    if(last && (Date.now()-new Date(last.visited_at).getTime()) < 30*60_000) return false;
    this.db.prepare('INSERT INTO page_visits(session_hash,user_id,visited_at) VALUES (?,?,?)').run(key,userId||null,nowIso());
    return true;
  }

  trafficStats(onlineMinutes=5) {
    const now=new Date();
    const onlineCutoff=new Date(now.getTime()-Math.max(1,Number(onlineMinutes)||5)*60_000).toISOString();
    const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString();
    const online=this.db.prepare(`SELECT
      SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS guests,
      COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS users
      FROM sessions WHERE last_seen_at>=? AND expires_at>?`).get(onlineCutoff,now.toISOString());
    const counts=this.db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN visited_at>=? THEN 1 ELSE 0 END) AS month_count,
      SUM(CASE WHEN visited_at>=? THEN 1 ELSE 0 END) AS today_count
      FROM page_visits`).get(monthStart,todayStart);
    const guestsOnline=Number(online?.guests||0), usersOnline=Number(online?.users||0);
    return {
      online:guestsOnline+usersOnline, guests_online:guestsOnline, users_online:usersOnline,
      visits_today:Number(counts?.today_count||0), visits_month:Number(counts?.month_count||0), visits_total:Number(counts?.total||0),
      online_window_minutes:Math.max(1,Number(onlineMinutes)||5),
    };
  }

  audit(userId,action,entityType,entityId,detail){ this.db.prepare('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail,created_at) VALUES (?,?,?,?,?,?)').run(userId||null,action,entityType,entityId||null,detail||null,nowIso()); }
  listAudit(limit=200){ const n=Math.trunc(Number(limit)||0); const sql=`SELECT a.*,u.username,u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC${n>0?' LIMIT ?':''}`; const stmt=this.db.prepare(sql); return n>0?stmt.all(n):stmt.all(); }

  stats(){ const all=this.rawPeople(); const base=this.treeStats(all); return { ...base, generations:all.length?Math.max(...all.map((p)=>p.level)):0, branches:Number(this.db.prepare('SELECT COUNT(*) AS c FROM branches').get().c||0), comments:Number(this.db.prepare('SELECT COUNT(*) AS c FROM comments WHERE deleted_at IS NULL').get().c||0), contributions:Number(this.db.prepare('SELECT COUNT(*) AS c FROM contributions').get().c||0), contribution_total:Number(this.db.prepare('SELECT COALESCE(SUM(amount),0) AS c FROM contributions').get().c||0), users:Number(this.db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active=1').get().c||0) }; }

  createDataSnapshot() {
    const holder = path.join(DATA_PARENT_DIR, `.backup-snapshot-${uuid()}`);
    const snapshotData = path.join(holder, 'data');
    fs.mkdirSync(holder, { recursive: false, mode: 0o700 });
    try {
      fs.cpSync(DATA_DIR, snapshotData, {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter: (src) => {
          const rel = path.relative(DATA_DIR, src);
          if (!rel) return true;
          const galleryRel=path.join('uploads',UPLOAD_LAYOUT.gallery);
          if(rel===galleryRel || rel.startsWith(galleryRel+path.sep)) return false;
          const base = path.basename(rel);
          if (base === path.basename(DB_PATH) || base === `${path.basename(DB_PATH)}-wal` || base === `${path.basename(DB_PATH)}-shm`) return false;
          const stat = fs.lstatSync(src);
          if (stat.isSymbolicLink()) throw new Error(`Không thể sao lưu liên kết tượng trưng trong thư mục data: ${rel}`);
          return stat.isFile() || stat.isDirectory();
        },
      });
      fs.mkdirSync(snapshotData, { recursive: true, mode: 0o700 });
      const snapshotDb = path.join(snapshotData, path.basename(DB_PATH));
      const sqlPath = snapshotDb.replace(/'/g, "''");
      this.db.exec(`VACUUM INTO '${sqlPath}'`);
      return { holder, dataDir: snapshotData };
    } catch (error) {
      try { fs.rmSync(holder, { recursive: true, force: true }); } catch {}
      throw error;
    }
  }

  validateStagedDataDirectory(stagedDataDir) {
    const dir = path.resolve(stagedDataDir);
    const stagedDb = path.join(dir, path.basename(DB_PATH));
    if (!fs.existsSync(stagedDb) || !fs.statSync(stagedDb).isFile()) throw new Error('Bản sao lưu không có cơ sở dữ liệu family_tree.db.');
    if (fs.existsSync(`${stagedDb}-wal`) || fs.existsSync(`${stagedDb}-shm`)) throw new Error('Bản sao lưu chứa tệp WAL/SHM tạm không hợp lệ. Hãy tạo lại backup bằng chức năng Sao lưu của hệ thống.');
    const testDb = new DatabaseSync(stagedDb, { readOnly: true });
    try {
      const integrity = testDb.prepare('PRAGMA integrity_check').all();
      if (!integrity.length || integrity.some((row) => String(row.integrity_check || '').toLowerCase() !== 'ok')) throw new Error('Cơ sở dữ liệu trong backup không vượt qua kiểm tra toàn vẹn.');
      const adminCount = Number(testDb.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND is_active=1").get().c || 0);
      if (!adminCount) throw new Error('Bản sao lưu không có tài khoản admin đang hoạt động; từ chối khôi phục để tránh khóa hệ thống.');
      const people = Number(testDb.prepare('SELECT COUNT(*) AS c FROM persons').get().c || 0);
      const users = Number(testDb.prepare('SELECT COUNT(*) AS c FROM users').get().c || 0);
      const branches = Number(testDb.prepare('SELECT COUNT(*) AS c FROM branches').get().c || 0);
      const comments = Number(testDb.prepare('SELECT COUNT(*) AS c FROM comments').get().c || 0);
      return { people, users, branches, comments };
    } finally { testDb.close(); }
  }

  restoreDataDirectory(stagedDataDir, actorId, currentSessionHash = null) {
    const staged = path.resolve(stagedDataDir);
    const stagingParent = path.dirname(staged);
    const summary = this.validateStagedDataDirectory(staged);
    const sessionRow = currentSessionHash ? this.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(currentSessionHash) : null;
    const oldDir = path.join(DATA_PARENT_DIR, `.data-before-restore-${uuid()}`);
    const stagedGallery=path.join(staged,'uploads',UPLOAD_LAYOUT.gallery);
    const backupContainsGallery=fs.existsSync(stagedGallery);
    let oldMoved = false;
    let newMoved = false;
    let galleryPreserved = false;
    let reopened = false;
    let sessionPreserved = false;
    try {
      try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
      this.db.close();
      fs.renameSync(DATA_DIR, oldDir); oldMoved = true;
      fs.renameSync(staged, DATA_DIR); newMoved = true;
      if(!backupContainsGallery){
        const previousGallery=path.join(oldDir,'uploads',UPLOAD_LAYOUT.gallery);
        const nextUploads=path.join(DATA_DIR,'uploads'); const nextGallery=path.join(nextUploads,UPLOAD_LAYOUT.gallery);
        if(fs.existsSync(previousGallery)){ fs.mkdirSync(nextUploads,{recursive:true}); if(fs.existsSync(nextGallery))fs.rmSync(nextGallery,{recursive:true,force:true}); fs.renameSync(previousGallery,nextGallery); galleryPreserved=true; }
      }
      this.openDatabase(); reopened = true;
      this.syncGalleryFromFilesystem({force:true});
      this.db.exec('DELETE FROM sessions');
      if (sessionRow && currentSessionHash) {
        const restoredActor = this.db.prepare("SELECT id,role,is_active FROM users WHERE id=?").get(actorId);
        if (restoredActor && restoredActor.role === 'admin' && Number(restoredActor.is_active) !== 0) {
          this.db.prepare('INSERT INTO sessions(token_hash,csrf_token,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(
            sessionRow.token_hash, sessionRow.csrf_token, actorId, sessionRow.created_at, sessionRow.expires_at, nowIso(),
          );
          sessionPreserved = true;
        }
      }
      const fkIssues = this.db.prepare('PRAGMA foreign_key_check').all();
      if (fkIssues.length) throw new Error(`Dữ liệu khôi phục có ${fkIssues.length} liên kết không hợp lệ.`);
      try { this.audit(sessionPreserved ? actorId : null, 'backup.restore', 'backup', null, JSON.stringify({ mode:'data-folder', gallery:backupContainsGallery?'from-backup':'preserved-current', ...summary })); } catch {}
      fs.rmSync(oldDir, { recursive: true, force: true }); oldMoved = false;
      const uploadsDir = path.join(DATA_DIR, 'uploads');
      const uploads = countFilesRecursive(uploadsDir);
      return { ok:true, session_preserved:sessionPreserved, gallery_preserved:!backupContainsGallery, summary:{ ...summary, uploads } };
    } catch (error) {
      try { if (reopened && this.db) this.db.close(); } catch {}
      try {
        if(galleryPreserved && fs.existsSync(path.join(DATA_DIR,'uploads',UPLOAD_LAYOUT.gallery)) && fs.existsSync(oldDir)){
          const oldUploads=path.join(oldDir,'uploads'); fs.mkdirSync(oldUploads,{recursive:true}); fs.renameSync(path.join(DATA_DIR,'uploads',UPLOAD_LAYOUT.gallery),path.join(oldUploads,UPLOAD_LAYOUT.gallery));
        }
      } catch {}
      try { if (newMoved && fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive:true, force:true }); } catch {}
      try { if (oldMoved && fs.existsSync(oldDir)) fs.renameSync(oldDir, DATA_DIR); } catch {}
      try { this.openDatabase(); } catch {}
      throw error;
    } finally {
      try { if (fs.existsSync(stagingParent)) fs.rmSync(stagingParent, { recursive:true, force:true }); } catch {}
    }
  }

  exportJson(){ return this.exportFullBackup(); }

  exportFullBackup(){
    const tables={}; let totalRows=0;
    for(const table of BACKUP_TABLES){
      const rows=this.db.prepare(`SELECT * FROM ${table}`).all();
      totalRows+=rows.length; if(totalRows>MAX_BACKUP_ROWS) throw new Error('Dữ liệu quá lớn để tạo bản sao lưu bằng giao diện web.');
      tables[table]=rows;
    }
    const uploadDir=UPLOAD_DIR; const uploads=[]; let uploadBytes=0;
    if(fs.existsSync(uploadDir)){
      for(const filename of listImageFilesRecursive(uploadDir).sort()){
        const full=uploadFullPath(filename); let stat; try{stat=fs.statSync(full);}catch{continue;} if(!stat.isFile()) continue;
        uploadBytes+=stat.size; if(uploadBytes>MAX_BACKUP_UPLOAD_BYTES) throw new Error('Tổng dung lượng ảnh vượt 140 MB; hãy sao lưu thư mục data thủ công.');
        const buffer=fs.readFileSync(full); const mime=uploadMime(filename);
        if(!validImageBuffer(buffer,mime)) continue;
        uploads.push({filename,mime,size:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),data_base64:buffer.toString('base64')});
      }
    }
    return {
      format:BACKUP_FORMAT, version:BACKUP_VERSION, exported_at:nowIso(),
      app:'Cây Gia Phả Web', sessions_included:false,
      summary:{people:tables.persons.length,branches:tables.branches.length,users:tables.users.length,contributions:tables.contributions.length,comments:tables.comments.length,audit_logs:tables.audit_logs.length,page_visits:tables.page_visits.length,uploads:uploads.length,upload_bytes:uploadBytes},
      integrity:{tables_sha256:crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex')},
      tables, uploads,
    };
  }

  restoreFullBackup(payload, actorId, currentSessionHash=null){
    if(!payload || payload.format!==BACKUP_FORMAT || Number(payload.version)!==BACKUP_VERSION) throw new Error('Tệp không phải bản sao lưu đầy đủ hợp lệ của Cây Gia Phả Web v1.0.14 trở lên.');
    if(!payload.tables || typeof payload.tables!=='object') throw new Error('Bản sao lưu thiếu dữ liệu bảng.');
    const tables={}; let totalRows=0; const legacyWithoutContributions=payload.tables.contributions===undefined;
    for(const table of BACKUP_TABLES){
      let rows=payload.tables[table];
      // Bản legacy v3 (trước v1.0.30) chưa có bảng contributions. Khôi phục như danh sách rỗng.
      if(table==='contributions' && rows===undefined) rows=[];
      if(!Array.isArray(rows)) throw new Error(`Bản sao lưu thiếu bảng ${table}.`);
      totalRows+=rows.length; if(totalRows>MAX_BACKUP_ROWS) throw new Error('Bản sao lưu có quá nhiều bản ghi.');
      tables[table]=rows;
    }
    const expectedTablesHash=String(payload.integrity?.tables_sha256||'');
    const actualTablesHash=crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');
    let integrityOk=/^[a-f0-9]{64}$/i.test(expectedTablesHash) && safeHashEqual(expectedTablesHash,actualTablesHash);
    if(!integrityOk && legacyWithoutContributions){
      const legacyTables={};
      for(const table of ['settings','users','persons','branches','comments','audit_logs','page_visits']) legacyTables[table]=tables[table];
      const legacyHash=crypto.createHash('sha256').update(JSON.stringify(legacyTables)).digest('hex');
      integrityOk=safeHashEqual(expectedTablesHash,legacyHash);
    }
    if(!integrityOk) throw new Error('Dữ liệu bảng không vượt qua kiểm tra toàn vẹn của bản sao lưu.');
    const activeAdmins=tables.users.filter((u)=>String(u.role)==='admin' && Number(u.is_active)!==0);
    if(!activeAdmins.length) throw new Error('Bản sao lưu không có tài khoản admin đang hoạt động; từ chối khôi phục để tránh khóa hệ thống.');

    const uploads=Array.isArray(payload.uploads)?payload.uploads:[];
    const seen=new Set(); const decoded=[]; let uploadBytes=0;
    for(const item of uploads){
      const filename=normalizeUploadPath(item?.filename);
      if(!filename) throw new Error('Bản sao lưu chứa tên tệp ảnh không hợp lệ.');
      if(seen.has(filename)) throw new Error(`Bản sao lưu có ảnh trùng tên: ${filename}`); seen.add(filename);
      const mime=uploadMime(filename); if(item?.mime && String(item.mime)!==mime) throw new Error(`Loại ảnh không khớp: ${filename}`);
      const base64=String(item?.data_base64||''); if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error(`Dữ liệu ảnh không hợp lệ: ${filename}`);
      const buffer=Buffer.from(base64,'base64'); uploadBytes+=buffer.length;
      if(uploadBytes>MAX_BACKUP_UPLOAD_BYTES) throw new Error('Tổng dung lượng ảnh trong bản sao lưu vượt 140 MB.');
      if(Number(item?.size)!==buffer.length || !validImageBuffer(buffer,mime)) throw new Error(`Ảnh bị hỏng trong bản sao lưu: ${filename}`);
      const digest=crypto.createHash('sha256').update(buffer).digest('hex'); if(String(item?.sha256||'')!==digest) throw new Error(`Ảnh không vượt qua kiểm tra toàn vẹn: ${filename}`);
      decoded.push({filename,buffer});
    }
    const requiredUploads=new Set();
    for(const row of tables.persons){ if(row?.image_path){ const n=normalizeUploadPath(row.image_path); if(!n) throw new Error('Đường dẫn ảnh cá thể trong bản sao lưu không hợp lệ.'); requiredUploads.add(n); } }
    for(const key of ['site_logo_path','fund_support_qr_path']){const setting=tables.settings.find((r)=>r?.key===key);if(setting?.value){const n=normalizeUploadPath(setting.value);if(!n)throw new Error(`Đường dẫn ảnh cài đặt ${key} không hợp lệ.`);requiredUploads.add(n);}}
    for(const name of requiredUploads) if(!seen.has(name)) throw new Error(`Bản sao lưu thiếu tệp ảnh đang được dữ liệu sử dụng: ${name}`);

    const uploadDir=path.join(DATA_DIR,'uploads');
    const restoreDir=path.join(DATA_DIR,`.restore-uploads-${uuid()}`); const oldDir=path.join(DATA_DIR,`.old-uploads-${uuid()}`);
    fs.mkdirSync(restoreDir,{recursive:false,mode:0o700});
    try{ for(const item of decoded){const target=path.join(restoreDir,...item.filename.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,item.buffer,{flag:'wx',mode:0o600});} }
    catch(e){ fs.rmSync(restoreDir,{recursive:true,force:true}); throw e; }

    const columnsByTable=new Map();
    for(const table of BACKUP_TABLES) columnsByTable.set(table,this.db.prepare(`PRAGMA table_info(${table})`).all().map((r)=>r.name));
    const insertRows=(table,rows)=>{
      const allowed=columnsByTable.get(table); if(!allowed?.length) throw new Error(`Không đọc được cấu trúc bảng ${table}.`);
      for(const row of rows){
        if(!row || typeof row!=='object' || Array.isArray(row)) throw new Error(`Bản ghi ${table} không hợp lệ.`);
        const cols=allowed.filter((c)=>Object.prototype.hasOwnProperty.call(row,c)); if(!cols.length) throw new Error(`Bản ghi ${table} không có cột hợp lệ.`);
        const q=cols.map(()=>'?').join(','); const stmt=this.db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${q})`);
        stmt.run(...cols.map((c)=>row[c]===undefined?null:row[c]));
      }
    };

    let oldMoved=false,newMoved=false,sessionPreserved=false;
    try{
      this.db.exec('BEGIN IMMEDIATE'); this.db.exec('PRAGMA defer_foreign_keys = ON');
      if(currentSessionHash) this.db.prepare('DELETE FROM sessions WHERE token_hash<>?').run(currentSessionHash); else this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM branches; DELETE FROM contributions; DELETE FROM comments; DELETE FROM audit_logs; DELETE FROM page_visits; DELETE FROM persons; DELETE FROM users; DELETE FROM settings;');
      insertRows('settings',tables.settings); insertRows('users',tables.users); insertRows('persons',tables.persons); insertRows('branches',tables.branches); insertRows('contributions',tables.contributions); insertRows('comments',tables.comments); insertRows('audit_logs',tables.audit_logs); insertRows('page_visits',tables.page_visits);
      const adminCount=Number(this.db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND is_active=1").get().c||0); if(!adminCount) throw new Error('Khôi phục bị hủy vì không còn admin hoạt động.');
      const fkIssues=this.db.prepare('PRAGMA foreign_key_check').all(); if(fkIssues.length) throw new Error(`Bản sao lưu có ${fkIssues.length} liên kết dữ liệu không hợp lệ.`);
      if(fs.existsSync(uploadDir)){ fs.renameSync(uploadDir,oldDir); oldMoved=true; }
      fs.renameSync(restoreDir,uploadDir); newMoved=true;
      if(currentSessionHash){
        const restored=this.db.prepare('SELECT id,is_active FROM users WHERE id=?').get(actorId);
        if(restored && restored.is_active){ this.db.prepare('UPDATE sessions SET user_id=?,last_seen_at=? WHERE token_hash=?').run(actorId,nowIso(),currentSessionHash); sessionPreserved=true; }
        else this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(currentSessionHash);
      }
      this.db.exec('COMMIT');
    }catch(e){
      try{this.db.exec('ROLLBACK');}catch{}
      try{ if(newMoved && fs.existsSync(uploadDir)) fs.rmSync(uploadDir,{recursive:true,force:true}); if(oldMoved && fs.existsSync(oldDir)) fs.renameSync(oldDir,uploadDir); }catch{}
      if(fs.existsSync(restoreDir)) fs.rmSync(restoreDir,{recursive:true,force:true});
      throw e;
    }
    try{ if(oldMoved && fs.existsSync(oldDir)) fs.rmSync(oldDir,{recursive:true,force:true}); }catch{}
    try{ this.migrateUploadLayout(); }catch{}
    try{ this.audit(sessionPreserved?actorId:null,'backup.restore','backup',null,JSON.stringify({exported_at:payload.exported_at||null,people:tables.persons.length,users:tables.users.length,uploads:decoded.length})); }catch{}
    return {ok:true,session_preserved:sessionPreserved,exported_at:payload.exported_at||null,summary:{people:tables.persons.length,branches:tables.branches.length,users:tables.users.length,contributions:tables.contributions.length,comments:tables.comments.length,uploads:decoded.length,page_visits:tables.page_visits.length}};
  }

  exportGedcom(){
    const people=this.rawPeople(); const ref=new Map(people.map((p,i)=>[p.id,`@I${i+1}@`])); const lines=[];
    lines.push('0 HEAD','1 SOUR CAY_GIA_PHA_WEB','2 NAME Cay Gia Pha Web','1 GEDC','2 VERS 7.0','1 CHAR UTF-8');
    for(const p of people){ lines.push(`0 ${ref.get(p.id)} INDI`,`1 NAME ${ged(p.full_name)}`,`1 SEX ${p.gender==='male'?'M':p.gender==='female'?'F':'U'}`); if(p.birth_date){lines.push('1 BIRT',`2 DATE ${ged(p.birth_date)}`); if(p.birth_place) lines.push(`2 PLAC ${ged(p.birth_place)}`);} if(p.is_deceased||p.death_date){lines.push('1 DEAT'); if(p.death_date) lines.push(`2 DATE ${ged(p.death_date)}`); if(p.death_place) lines.push(`2 PLAC ${ged(p.death_place)}`);} if(p.occupation) lines.push(`1 OCCU ${ged(p.occupation)}`); if(p.details) lines.push(`1 NOTE ${ged(p.details)}`); }
    const famKeys=new Map(); let fi=1;
    for(const child of people){ const parents=[child.father_id,child.mother_id].filter(Boolean); if(!parents.length)continue; const key=parents.slice().sort().join('|'); if(!famKeys.has(key)) famKeys.set(key,{ref:`@F${fi++}@`,parents,children:[]}); famKeys.get(key).children.push(child.id); }
    for(const p of people){ for(const s of p.spouse_ids||[]){ const parents=[p.id,s].sort(); const key=parents.join('|'); if(!famKeys.has(key)) famKeys.set(key,{ref:`@F${fi++}@`,parents,children:[]}); } }
    for(const fam of famKeys.values()){ lines.push(`0 ${fam.ref} FAM`); const parentPeople=fam.parents.map((id)=>people.find((p)=>p.id===id)).filter(Boolean); const husband=parentPeople.find((p)=>p.gender==='male')||parentPeople[0]; const wife=parentPeople.find((p)=>p.gender==='female')||parentPeople.find((p)=>p.id!==husband?.id); if(husband) lines.push(`1 HUSB ${ref.get(husband.id)}`); if(wife) lines.push(`1 WIFE ${ref.get(wife.id)}`); for(const c of fam.children) if(ref.has(c)) lines.push(`1 CHIL ${ref.get(c)}`); }
    lines.push('0 TRLR'); return lines.join('\n')+'\n';
  }
}

function ged(value){ return String(value||'').replace(/[\r\n]+/g,' ').replace(/@/g,'@@').slice(0,1000); }

module.exports = { Store, DATA_DIR, DB_PATH, UPLOAD_DIR, UPLOAD_LAYOUT, nowIso, uuid, jsonArray, safeUploadSegment, normalizeUploadPath, uploadUrl, uploadFullPath, countFilesRecursive };
