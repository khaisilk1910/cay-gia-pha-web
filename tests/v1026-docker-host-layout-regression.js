'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const stack = fs.readFileSync(path.join(root, 'stack-portainer-ghcr-latest.yml'), 'utf8');
const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
const entrypoint = path.join(root, 'docker-entrypoint.sh');

assert.match(stack, /image:\s*ghcr\.io\/khaisilk1910\/cay-gia-pha-web:latest/);
assert.match(stack, /pull_policy:\s*always/);
assert.doesNotMatch(stack, /\$\{IMAGE_TAG\}/);
assert.match(stack, /\/opt\/cay-gia-pha-web:\/var\/lib\/cay-gia-pha/);
assert.match(compose, /HOST_STORAGE_DIR:-\/opt\/cay-gia-pha-web/);
assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/cay-gia-pha-entrypoint"\]/);
assert.match(dockerfile, /\.image-build-id/);
assert.doesNotMatch(dockerfile, /^\s*VOLUME\s/m, 'runtime image must not create an anonymous Docker volume');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gia-pha-v1026-'));
const seed = path.join(tmp, 'seed');
const storage = path.join(tmp, 'storage');
const app = path.join(storage, 'app');
const data = path.join(storage, 'data');
fs.mkdirSync(seed, { recursive: true });
fs.writeFileSync(path.join(seed, '.image-build-id'), 'build-a\n');
fs.writeFileSync(path.join(seed, 'sentinel.txt'), 'version-a');

function runSeed() {
  const result = spawnSync('/bin/sh', [entrypoint, '/bin/sh', '-c', 'test -f sentinel.txt && test -d "$DATA_DIR/uploads"'], {
    env: { ...process.env, STORAGE_ROOT: storage, APP_DIR: app, DATA_DIR: data, APP_SEED_DIR: seed },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`entrypoint failed: ${result.stdout}\n${result.stderr}`);
}

try {
  runSeed();
  assert.strictEqual(fs.readFileSync(path.join(app, 'sentinel.txt'), 'utf8'), 'version-a');
  assert.ok(fs.existsSync(path.join(data, 'uploads')));

  fs.writeFileSync(path.join(app, 'local-note.txt'), 'keep while same image');
  runSeed();
  assert.ok(fs.existsSync(path.join(app, 'local-note.txt')), 'same build must not rewrite app directory');

  fs.writeFileSync(path.join(seed, '.image-build-id'), 'build-b\n');
  fs.writeFileSync(path.join(seed, 'sentinel.txt'), 'version-b');
  runSeed();
  assert.strictEqual(fs.readFileSync(path.join(app, 'sentinel.txt'), 'utf8'), 'version-b');
  assert.strictEqual(fs.existsSync(path.join(app, 'local-note.txt')), false, 'new image build must replace system app files');
  assert.ok(fs.existsSync(path.join(data, 'uploads')), 'data directory must survive app refresh');

  console.log('v1026-docker-host-layout-regression: OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
