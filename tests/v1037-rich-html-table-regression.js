'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json');assert.equal(pkg.version,'1.0.37');
const admin=read('public/admin.js'),html=read('public/admin.html'),ui=read('public/public-ui.js'),db=read('lib/db.js'),server=read('server.js'),css=read('public/styles.css');
assert.match(admin,/RICH_IMAGE_WIDTHS=Array\.from\(\{length:20\}/,'Phải có 20 mức kích thước ảnh 5%-100%');
assert.match(admin,/data-rich-table-insert/);assert.match(admin,/data-tbl="merge-right"/);assert.match(admin,/data-tbl="merge-down"/);assert.match(admin,/data-tbl="split"/);assert.match(admin,/data-tbl="caption"/);
assert.match(admin,/data-rich-link/);assert.match(admin,/insertUnorderedList/);assert.match(admin,/insertOrderedList/);assert.match(admin,/data-rich-block/);
assert.match(html,/id="newsTableBtn"/);assert.match(html,/data-news-cmd="indent"/);assert.match(html,/data-news-cmd="undo"/);
assert.match(ui,/raw\.type==='html'/);assert.match(ui,/public-rich-html/);assert.match(ui,/validImageWidth/);
assert.match(db,/item\.type === 'html'/);assert.match(db,/sanitizeRichHtml/);assert.match(db,/['"]table['"]/);assert.match(db,/colspan/);assert.match(db,/background-color/);
assert.match(server,/normalizeRichImageWidth/);assert.match(css,/\.rich-content-table/);assert.match(css,/\.rich-table-controls/);assert.match(css,/\.news-image-controls/);
// DB normalization: rich HTML table is sanitized and image width 5% is accepted.
process.env.DATA_DIR=fs.mkdtempSync('/tmp/gp-v1037-');const {Store,UPLOAD_LAYOUT}=require('../lib/db');const store=new Store();const adminUser=store.ensureAdmin('admin','Regression-Password-2026!',false);const value=JSON.stringify([{type:'html',html:'<h2 style="color:#123456">Tiêu đề</h2><table style="width:85%"><tbody><tr><th colspan="2" style="background-color:#fff8e8">A</th></tr><tr><td>B</td><td><a href="https://example.com">C</a></td></tr></tbody></table><script>alert(1)</script>'},{type:'image',image_path:`${UPLOAD_LAYOUT.richtext}/12345678-1234-4234-8234-123456789abc.png`,width:5,align:'center'}]);store.updateSettings({tree_subtitle_content:value},adminUser.id);const saved=JSON.parse(store.settings().tree_subtitle_content);assert.equal(saved[0].type,'html');assert.match(saved[0].html,/<table/);assert.doesNotMatch(saved[0].html,/<script/);assert.equal(saved[1].width,5);fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});
console.log('v1037-rich-html-table-regression: OK');
