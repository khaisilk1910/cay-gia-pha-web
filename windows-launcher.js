'use strict';

const { spawn } = require('node:child_process');

function openBrowser(url) {
  if (process.platform !== 'win32') return;
  try {
    const child = spawn('explorer.exe', [url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    console.warn(`Khong the tu dong mo trinh duyet. Hay mo thu cong: ${url}`);
  }
}

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < 22) {
  console.error(`Node.js ${process.versions.node} khong duoc ho tro. Can Node.js 22.5 tro len.`);
  process.exit(1);
}

try {
  require('node:sqlite');
} catch (error) {
  console.error('Ban Node.js nay khong co node:sqlite. Hay cai Node.js 22.5 tro len.');
  process.exit(1);
}

setTimeout(() => openBrowser('http://127.0.0.1:8787/'), 1200).unref();
require('./server.js');
