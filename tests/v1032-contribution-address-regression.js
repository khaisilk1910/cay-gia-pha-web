'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {DatabaseSync}=require('node:sqlite');
const ROOT=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const dbCode=read('lib/db.js'),adminHtml=read('public/admin.html'),adminJs=read('public/admin.js'),publicHtml=read('public/contributions.html'),publicJs=read('public/contributions.js'),css=read('public/styles.css');
assert.match(dbCode,/address TEXT NOT NULL DEFAULT ''/,'Bảng contributions phải có cột address');
assert.match(dbCode,/ALTER TABLE contributions ADD COLUMN address TEXT NOT NULL DEFAULT ''/,'Phải tự migrate DB cũ');
assert.match(dbCode,/const address=String\(input\?\.address/,'Phải chuẩn hóa địa chỉ nhiều dòng');
assert.match(dbCode,/INSERT INTO contributions\(id,donor_name,address,contribution_content/,'Create phải lưu address');
assert.match(dbCode,/UPDATE contributions SET donor_name=\?,address=\?/,'Update phải lưu address');
assert.match(adminHtml,/<th>Địa chỉ<\/th>/,'Bảng admin phải có cột Địa chỉ');
assert.match(adminHtml,/textarea class="input" name="address" rows="3" maxlength="3000"/,'Admin phải nhập Địa chỉ nhiều dòng');
assert.match(adminJs,/form\.elements\.address\.value=r\?\.address\|\|''/,'Modal sửa phải nạp địa chỉ');
assert.match(adminJs,/address:String\(fd\.get\('address'\)\|\|''\)/,'Lưu admin phải gửi địa chỉ');
assert.match(publicHtml,/<th>Địa chỉ<\/th>/,'Bảng công khai phải có cột Địa chỉ');
assert.match(publicJs,/data-label="Địa chỉ" class="contribution-address"/,'Dòng công khai phải hiển thị địa chỉ');
assert.match(css,/\.contribution-address[^\{]*\{/,'Phải có CSS cho địa chỉ công khai');

const oldDataDir=process.env.DATA_DIR;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'giapha-v1032-'));
process.env.DATA_DIR=tmp;
const legacyDb=new DatabaseSync(path.join(tmp,'family_tree.db'));
legacyDb.exec(`CREATE TABLE contributions (id TEXT PRIMARY KEY,donor_name TEXT NOT NULL COLLATE NOCASE,contribution_content TEXT NOT NULL DEFAULT '',amount INTEGER NOT NULL DEFAULT 0,contribution_date TEXT NOT NULL,notes TEXT,created_by TEXT,updated_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
legacyDb.close();
for(const m of ['../lib/db']){try{delete require.cache[require.resolve(m)];}catch{}}
const {Store}=require('../lib/db');
const store=new Store();
try{
  const columns=store.db.prepare('PRAGMA table_info(contributions)').all().map(r=>r.name);
  assert.ok(columns.includes('address'),'DB v1.0.31 phải được migrate thêm cột address khi mở');
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const created=store.createContribution({donor_name:'Nguyễn Văn A',address:'Số 1 đường A\nPhường B, Hà Nội',contribution_content:'Tu sửa nhà thờ',amount:123000,contribution_date:'2026-08-12',notes:'Test'},admin.id);
  assert.equal(created.address,'Số 1 đường A\nPhường B, Hà Nội','Địa chỉ phải giữ xuống dòng');
  const updated=store.updateContribution(created.id,{address:'Dòng 1\r\nDòng 2'},admin.id);
  assert.equal(updated.address,'Dòng 1\nDòng 2','CRLF phải chuẩn hóa thành LF');
  assert.equal(store.listContributions()[0].address,'Dòng 1\nDòng 2','Danh sách phải trả address');
  assert.equal(store.topContributors(5)[0].address,'Dòng 1\nDòng 2','Bảng Top phải có địa chỉ gần nhất');
} finally { try{store.close?.();}catch{} fs.rmSync(tmp,{recursive:true,force:true}); if(oldDataDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDataDir; }
console.log('v1032-contribution-address-regression: OK');
