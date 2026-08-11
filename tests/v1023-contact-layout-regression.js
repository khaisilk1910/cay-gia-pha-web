'use strict';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json')),db=read('lib/db.js'),server=read('server.js'),html=read('public/contact.html'),js=read('public/contact.js'),adminHtml=read('public/admin.html'),adminJs=read('public/admin.js'),css=read('public/styles.css');
assert.equal(pkg.version,'1.0.23');
assert.match(db,/contact_intro_content: '\[\]'/);assert.match(db,/contact_footer_content: '\[\]'/);assert.match(db,/contact_temple_image_paths: '\[\]'/);assert.match(db,/slice\(0,10\)/);
assert.match(server,/contact_temple_image_data_list/);assert.match(server,/remove_contact_temple_images/);assert.match(server,/contact_temple_image_urls:templeUrls/);assert.match(server,/80 \* 1024 \* 1024/);
assert.match(html,/id="contactIntro"/);assert.match(html,/id="contactFooterSummary"/);assert.match(html,/id="contactTempleGrid"/);assert.doesNotMatch(html,/Mở Google Maps/);assert.doesNotMatch(html,/<h2>Chỉ đường<\/h2>/);
assert.match(js,/renderTempleImages\(urls\.slice\(0,10\)\)/);assert.match(js,/contact_map_address_content/);assert.match(js,/stepTempleImage/);
assert.match(adminHtml,/id="settingsFloatingSaveBtn"/);assert.match(adminJs,/contactIntroEditor/);assert.match(adminJs,/contactFooterEditor/);assert.match(adminJs,/set_contact_temple_files/);assert.match(adminJs,/multiple/);assert.match(css,/\.settings-floating-save/);assert.match(css,/\.contact-temple-grid/);assert.match(css,/\.contact-map-card\{width:100%/);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1023-'));process.env.DATA_DIR=path.join(tmp,'data');let store;
try{const {Store,UPLOAD_LAYOUT}=require('../lib/db');store=new Store();const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);const rich=JSON.stringify([{text:'Dòng 1\\nDòng 2',bold:true,italic:true,underline:false,strike:false,size:18,color:'#123456',font:'segoe',align:'center'}]);
const paths=Array.from({length:12},(_,i)=>`${UPLOAD_LAYOUT.temple}/00000000-0000-4000-8000-${String(i).padStart(12,'0')}.jpg`);store.updateSettings({contact_intro_content:rich,contact_footer_content:rich,contact_temple_image_paths:JSON.stringify(paths)},admin.id);const s=store.settings();assert.match(s.contact_intro_content,/Dòng 1/);const stored=JSON.parse(s.contact_temple_image_paths);assert.equal(stored.length,10);assert.ok(stored.every(p=>p.startsWith('temple/')));console.log('v1023-contact-layout-regression: OK');}
finally{try{store?.db?.close();}catch{}fs.rmSync(tmp,{recursive:true,force:true});}
