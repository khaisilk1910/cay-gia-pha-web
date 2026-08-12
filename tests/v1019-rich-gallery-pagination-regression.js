'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const indexHtml=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const galleryHtml=fs.readFileSync(path.join(root,'public','gallery.html'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'public','admin.html'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'public','admin.js'),'utf8');
const appJs=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const galleryJs=fs.readFileSync(path.join(root,'public','gallery.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const dbCode=fs.readFileSync(path.join(root,'lib','db.js'),'utf8');

assert.match(indexHtml,/id="treeFooterContent"/,'Trang cây phải có vùng nội dung chân trang chỉnh được');
assert.match(indexHtml,/id="treeSubtitle" class="hero-subtitle public-rich-text"/,'Phụ đề cây phải render rich text');
assert.match(galleryHtml,/id="galleryIntro"/,'Gallery phải có vùng giới thiệu chỉnh được');
assert.match(galleryHtml,/id="galleryFooterContent"/,'Gallery phải có vùng chân trang chỉnh được');
for(const id of ['galleryPhotoFirstPage','galleryPhotoPrevPage','galleryPhotoPageInput','galleryPhotoNextPage','galleryPhotoLastPage']) assert.match(galleryHtml,new RegExp(`id="${id}"`),`Gallery công khai thiếu điều khiển phân trang ${id}`);
for(const id of ['galleryAdminFirstPage','galleryAdminPrevPage','galleryAdminPageInput','galleryAdminNextPage','galleryAdminLastPage']) assert.match(adminHtml,new RegExp(`id="${id}"`),`Quản trị Gallery thiếu điều khiển phân trang ${id}`);
assert.match(galleryJs,/photoPageSize:100/,'Gallery công khai phải phân trang 100 ảnh');
assert.match(adminJs,/galleryPhotoPageSize:100/,'Gallery quản trị phải phân trang 100 ảnh');
assert.match(galleryJs,/slice\(start,start\+G\.photoPageSize\)/,'Gallery công khai phải chỉ render ảnh của trang hiện tại');
assert.match(adminJs,/slice\(start,start\+S\.galleryPhotoPageSize\)/,'Gallery quản trị phải chỉ render ảnh của trang hiện tại');

for(const id of ['treeSubtitleEditor','treeFooterEditor','galleryIntroEditor','galleryFooterEditor','fundSupportEditor','footerAuthorEditor']) assert.match(adminJs,new RegExp(id),`Cài đặt thiếu trình soạn ${id}`);
assert.match(adminJs,/data-rich-color/,'Trình soạn phải có chọn màu chữ');
assert.match(adminJs,/data-rich-font/,'Trình soạn phải có chọn font');
assert.match(adminJs,/data-rich-size/,'Trình soạn phải có chọn cỡ chữ');
assert.match(adminJs,/data-rich-cmd="italic"/,'Trình soạn phải có in nghiêng');
assert.match(adminJs,/data-rich-cmd="underline"/,'Trình soạn phải có gạch chân');
assert.match(adminJs,/data-rich-cmd="strikeThrough"/,'Trình soạn phải có gạch ngang');
assert.match(adminJs,/justifyLeft/);assert.match(adminJs,/justifyCenter/);assert.match(adminJs,/justifyRight/);assert.match(adminJs,/justifyFull/);
assert.match(appJs,/renderRichText\(\$\('#treeFooterContent'\)/,'Trang cây phải áp dụng rich text cho nội dung cuối trang');
assert.match(galleryJs,/renderRich\(\$\('#galleryIntro'\)/,'Gallery phải áp dụng rich text cho phần giới thiệu');
assert.match(galleryJs,/renderRich\(\$\('#galleryFooterContent'\)/,'Gallery phải áp dụng rich text cho chân trang');
assert.match(css,/\.public-rich-line/,'CSS phải hỗ trợ hiển thị rich text nhiều dòng');
assert.match(server,/gallery_intro_content/,'Public settings phải xuất cài đặt Gallery mới');
assert.match(dbCode,/normalizeRichTextContent/,'DB phải chuẩn hóa rich text ở phía máy chủ');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1019-'));
process.env.DATA_DIR=path.join(tmp,'data');
let store;
try{
  const {Store}=require('../lib/db');
  store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  for(const key of ['tree_subtitle_content','tree_footer_content','gallery_intro_content','gallery_footer_content','footer_author_content']) assert.equal(store.getSetting(key),'[]',`${key} phải migrate tự động với mặc định an toàn`);
  const raw=JSON.stringify([
    {text:'Dòng đậm màu\n',bold:true,italic:true,underline:true,size:24,color:'#AABBCC',font:'noto_serif',align:'center'},
    {text:'\u0001Dòng hai',strike:true,size:999,color:'red',font:'bad-font',align:'bad-align'},
  ]);
  const settings=store.updateSettings({tree_subtitle_content:raw,tree_footer_content:raw,gallery_intro_content:raw,gallery_footer_content:raw,footer_author_content:raw,fund_support_content:raw},admin.id);
  for(const key of ['tree_subtitle_content','tree_footer_content','gallery_intro_content','gallery_footer_content','footer_author_content','fund_support_content']){
    const tokens=JSON.parse(settings[key]);
    assert.equal(tokens[0].bold,true);assert.equal(tokens[0].italic,true);assert.equal(tokens[0].underline,true);assert.equal(tokens[0].size,24);assert.equal(tokens[0].color,'#aabbcc');assert.equal(tokens[0].font,'noto_serif');assert.equal(tokens[0].align,'center');
    assert.equal(tokens[1].size,16,'Cỡ chữ ngoài whitelist phải về 16px');assert.equal(tokens[1].color,'','Màu không hợp lệ phải bị bỏ');assert.equal(tokens[1].font,'system','Font không hợp lệ phải về system');assert.equal(tokens[1].align,'left','Căn lề không hợp lệ phải về left');assert.ok(!tokens[1].text.includes('\u0001'),'Ký tự điều khiển phải bị loại bỏ');
  }
  const album=store.createGalleryAlbum({title:'Album 205 ảnh',is_public:true},admin.id);
  for(let i=0;i<205;i++)store.createGalleryPhoto({album_id:album.id,title:`Ảnh ${String(i+1).padStart(3,'0')}`,image_path:`${String(i).padStart(8,'0')}-1111-4111-8111-111111111111.jpg`},admin.id);
  assert.equal(store.listGalleryPhotos(album.id,{publicOnly:true}).length,205,'Backend phải giữ đầy đủ ảnh để frontend phân trang');
  console.log('v1019-rich-gallery-pagination-regression: OK');
} finally { try{store?.db?.close();}catch{} fs.rmSync(tmp,{recursive:true,force:true}); }
