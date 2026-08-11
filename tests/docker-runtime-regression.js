'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gia-pha-docker-test-'));
const storageRoot = path.join(tempRoot, 'persistent-storage');
const configuredDataDir = path.join(storageRoot, 'data');
process.env.DATA_DIR = configuredDataDir;

const { Store, DATA_DIR } = require('../lib/db');

let store;
try {
  assert.strictEqual(DATA_DIR, path.resolve(configuredDataDir), 'DATA_DIR must honor the environment variable');
  store = new Store();
  const admin = store.ensureAdmin('admin', 'Docker-Test-Password-123!', false);
  assert(admin && admin.id, 'test admin should be created');
  store.seedDemoIfEmpty(admin.id);
  store.updateSettings({ tree_title: 'Before restore' }, admin.id);

  const uploadsDir = path.join(DATA_DIR, 'uploads');
  fs.writeFileSync(path.join(uploadsDir, 'keep.txt'), 'backup-copy');
  const snapshot = store.createDataSnapshot();

  store.updateSettings({ tree_title: 'After snapshot' }, admin.id);
  fs.writeFileSync(path.join(uploadsDir, 'remove-after-restore.txt'), 'newer-data');

  const result = store.restoreDataDirectory(snapshot.dataDir, admin.id, null);
  assert.strictEqual(result.ok, true, 'restore should succeed when DATA_DIR is a subdirectory of a mounted parent');
  assert.strictEqual(store.getSetting('tree_title'), 'Before restore', 'database should roll back to snapshot');
  assert.strictEqual(fs.readFileSync(path.join(DATA_DIR, 'uploads', 'keep.txt'), 'utf8'), 'backup-copy');
  assert.strictEqual(fs.existsSync(path.join(DATA_DIR, 'uploads', 'remove-after-restore.txt')), false, 'files created after backup should disappear');
  assert.strictEqual(fs.existsSync(snapshot.holder), false, 'restore staging holder should be cleaned');

  console.log('docker-runtime-regression: OK');
} finally {
  try { store?.db?.close(); } catch {}
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}
