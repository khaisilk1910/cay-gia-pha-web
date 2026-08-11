'use strict';

const crypto = require('node:crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const normalized = String(password || '').normalize('NFKC');
  const derived = crypto.scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${derived.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  try {
    const [algo, n, r, p, salt, expectedB64] = String(encoded || '').split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(expectedB64, 'base64url');
    const actual = crypto.scryptSync(String(password || '').normalize('NFKC'), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  const out = {};
  String(header).split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  });
  return out;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function safeEqualText(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = {
  randomToken,
  sha256,
  hashPassword,
  verifyPassword,
  parseCookies,
  cookie,
  safeEqualText,
};
