'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const admin=read('public/admin.js');
const app=read('public/app.js');
const publicUi=read('public/public-ui.js');
const indexHtml=read('public/index.html');
const galleryHtml=read('public/gallery.html');
const contactHtml=read('public/contact.html');
const css=read('public/styles.css');
const dbCode=read('lib/db.js');
const server=read('server.js');
const pkg=JSON.parse(read('package.json'));

assert.ok(/^1\.0\.(?:29|[3-9]\d|\d{3,})$/.test(pkg.version),`expected version >= 1.0.29, got ${pkg.version}`);
assert.match(admin,/history\.scrollRestoration='manual'/,'Admin phải vô hiệu scroll restoration để các view luôn bắt đầu từ top');
assert.match(admin,/function switchView\(name\)[\s\S]*?window\.scrollTo\(0,0\)/,'Chuyển trang Admin phải đưa nội dung về top');
assert.match(admin,/data-settings-tab[\s\S]*?window\.scrollTo\(0,0\)/,'Chuyển tab Cài đặt phải đưa nội dung về top');
assert.doesNotMatch(admin,/id="set_fund_support_title"/,'Không còn ô Tiêu đề của QR trong Cài đặt');
assert.doesNotMatch(admin,/id="set_fund_support_title_font_size"/,'Không còn ô cỡ chữ Tiêu đề QR');
for(const html of [indexHtml,galleryHtml,contactHtml]) assert.doesNotMatch(html,/data-fund-title|fundSupportTitle/,'Không còn tiêu đề riêng của QR trên trang công khai');
assert.doesNotMatch(app,/fund_support_title/,'Trang cây không còn phụ thuộc tiêu đề QR');
assert.doesNotMatch(publicUi,/fund_support_title/,'Trang Thư viện/Liên hệ không còn phụ thuộc tiêu đề QR');
assert.match(css,/\.fund-support-qr-frame\{width:228px;height:228px/,'QRCode desktop phải được tăng kích thước');
assert.match(admin,/không chứa data\/uploads\/gallery/i,'Cài đặt backup phải nêu rõ loại trừ Gallery');
assert.match(admin,/giữ nguyên data\/uploads\/gallery hiện có/i,'Cài đặt restore phải nêu rõ Gallery được giữ lại');
assert.match(dbCode,/galleryRel=path\.join\('uploads',UPLOAD_LAYOUT\.gallery\)/,'Snapshot phải loại trừ data/uploads/gallery');
assert.match(dbCode,/syncGalleryFromFilesystem/,'DB phải có cơ chế tự đồng bộ Gallery từ filesystem');
assert.match(server,/store\.syncGalleryFromFilesystem\(\)/,'API Gallery phải kích hoạt đồng bộ filesystem');
assert.match(server,/decodeURIComponent\(pathname\.slice\('\/uploads\/'\.length\)\)/,'Upload route phải đọc được tên thư mục/file Unicode đã URL encode');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1029-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js'])fs.copyFileSync(path.join(root,'lib',name),path.join(tmp,'lib',name));
try{
  const {Store,DATA_DIR}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const adminUser=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const folder='Giỗ Tổ 2026';
  const galleryDir=path.join(DATA_DIR,'uploads','gallery',folder);
  fs.mkdirSync(galleryDir,{recursive:true});
  fs.writeFileSync(path.join(galleryDir,'Ảnh đại gia đình 01.jpg'),Buffer.from('manual-gallery-image'));
  const first=store.syncGalleryFromFilesystem({force:true});
  assert.equal(first.albums_added,1,'Folder copy trực tiếp phải tự tạo album');
  assert.equal(first.photos_added,1,'Ảnh copy trực tiếp phải tự tạo photo record');
  const albums=store.listGalleryAlbums({publicOnly:true});
  const album=albums.find((a)=>a.title==='Giỗ Tổ 2026');
  assert.ok(album,'Album filesystem phải được công khai mặc định');
  const photos=store.listGalleryPhotos(album.id,{publicOnly:true});
  assert.equal(photos.length,1);
  assert.match(photos[0].image_url,/Gi%E1%BB%97%20T%E1%BB%95%202026/,'URL ảnh phải encode folder Unicode an toàn');
  assert.match(photos[0].image_url,/%E1%BA%A2nh%20%C4%91%E1%BA%A1i%20gia%20%C4%91%C3%ACnh%2001\.jpg/,'URL ảnh phải encode tên file Unicode/spaces');

  fs.writeFileSync(path.join(galleryDir,'Ảnh 02.webp'),Buffer.from('another-manual-gallery-image'));
  const second=store.syncGalleryFromFilesystem({force:true});
  assert.equal(second.photos_added,1,'Ảnh mới copy vào folder hiện có phải tự nhận diện');
  assert.equal(store.listGalleryPhotos(album.id,{publicOnly:true}).length,2);

  const snapshot=store.createDataSnapshot();
  assert.equal(fs.existsSync(path.join(snapshot.dataDir,'uploads','gallery')),false,'Snapshot .gpbak không được chứa Gallery');
  assert.equal(fs.existsSync(path.join(snapshot.dataDir,'family_tree.db')),true,'Snapshot vẫn phải chứa database');
  fs.rmSync(snapshot.holder,{recursive:true,force:true});
  assert.ok(store.getUserById(adminUser.id));
  store.db.close();
  console.log('v1029-admin-qr-gallery-backup-regression: OK');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
