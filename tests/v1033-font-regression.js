"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const forbidden=['geo','rgia'].join('');
const files=['public/styles.css','public/admin.js','public/public-ui.js','public/app.js','public/print.js','lib/db.js'];
for(const file of files) assert.equal(read(file).toLowerCase().includes(forbidden),false,`${file} không được còn font đã loại bỏ`);
const admin=read('public/admin.js');
const m=admin.match(/const FONT_OPTIONS=(\[[\s\S]*?\]);/);
assert(m,'Phải có FONT_OPTIONS dùng chung trong Admin');
const options=vm.runInNewContext(m[1]);
assert.equal(options.length,20,'Bộ chọn phải có đúng 20 font');
assert.equal(new Set(options.map(x=>x[0])).size,20,'20 font phải có key duy nhất');
const keys=options.map(x=>x[0]);
for(const required of ['system','segoe','arial','tahoma','verdana','trebuchet','calibri','candara','corbel','helvetica','roboto','noto_sans','dejavu_sans','liberation_sans','times','cambria','palatino','noto_serif','dejavu_serif','liberation_serif']) assert(keys.includes(required),`Thiếu font ${required}`);
const css=read('public/styles.css');
for(const key of keys) assert(css.includes(`data-tree-font="${key}"`),`CSS thiếu stack ${key}`);
const ui=read('public/public-ui.js');
const app=read('public/app.js');
const print=read('public/print.js');
const db=read('lib/db.js');
for(const key of keys){assert(ui.includes(key),`public-ui thiếu ${key}`);assert(app.includes(key),`app thiếu ${key}`);assert(print.includes(key),`print thiếu ${key}`);assert(db.includes(key),`db thiếu ${key}`);}
const pkg=require(path.join(root,'package.json'));
assert.equal(pkg.version,'1.0.34');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-font-v1033-'));
process.env.DATA_DIR=tmp;
const {Store}=require('../lib/db');
let store;
try{
  store=new Store();
  const adminUser=store.ensureAdmin('admin','Regression-Password-2026!',false);
  for(const key of keys){
    store.updateSettings({tree_font:key,footer_author_font:key},adminUser.id);
    assert.equal(store.getSetting('tree_font'),key);
    assert.equal(store.getSetting('footer_author_font'),key);
  }
  store.updateSettings({tree_font:forbidden,footer_author_font:forbidden},adminUser.id);
  assert.equal(store.getSetting('tree_font'),'system','Font cũ/không hợp lệ phải về system');
  assert.equal(store.getSetting('footer_author_font'),'system','Font tác giả cũ/không hợp lệ phải về system');
  const rich=JSON.stringify([{text:'Tiếng Việt: Trần Thị Ánh, Nguyễn Đức Hiếu',font:'noto_serif',size:16,align:'left'}]);
  store.updateSettings({tree_subtitle_content:rich},adminUser.id);
  const saved=JSON.parse(store.getSetting('tree_subtitle_content'));
  assert.equal(saved[0].font,'noto_serif');
  assert.match(saved[0].text,/Tiếng Việt/);
}finally{try{store?.close();}catch{}fs.rmSync(tmp,{recursive:true,force:true});}
console.log('v1.0.34 Vietnamese font regression: OK');
