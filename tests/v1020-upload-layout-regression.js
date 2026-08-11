'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const serverCode=fs.readFileSync(path.join(root,'server.js'),'utf8');
const dbCode=fs.readFileSync(path.join(root,'lib','db.js'),'utf8');
assert.match(serverCode,/UPLOAD_LAYOUT\.profiles/,'Ảnh đại diện phải được ghi vào uploads\/profiles');
assert.match(serverCode,/UPLOAD_LAYOUT\.logo/,'Logo phải được ghi vào uploads\/Logo');
assert.match(serverCode,/UPLOAD_LAYOUT\.qrcode/,'QR phải được ghi vào uploads\/qrcode');
assert.match(serverCode,/galleryAlbumUploadDir/,'Upload Gallery phải lấy đúng thư mục vật lý của album');
assert.match(serverCode,/moveImageFile\(current\.image_path,targetDir\)/,'Chuyển ảnh sang album khác phải chuyển cả tệp vật lý');
assert.match(serverCode,/deleteGalleryAlbumFolder\(deleted\.storage_folder\)/,'Xóa album phải dọn đúng thư mục album');
assert.match(dbCode,/storage_folder TEXT/,'Album phải lưu tên thư mục vật lý riêng');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1020-'));
process.env.DATA_DIR=path.join(tmp,'data');
let store;
try{
  const {Store,UPLOAD_DIR,UPLOAD_LAYOUT,normalizeUploadPath,uploadFullPath}=require('../lib/db');
  store=new Store();
  for(const folder of ['Logo','qrcode','profiles','gallery']) assert.equal(fs.statSync(path.join(UPLOAD_DIR,folder)).isDirectory(),true,`Thiếu thư mục uploads/${folder}`);
  assert.equal(normalizeUploadPath('../x.png'),'','Không được cho phép path traversal');

  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const person=store.createPerson({full_name:'Nguyễn Ảnh Cũ',gender:'male',privacy_mode:'public'},admin.id);
  const album=store.createGalleryAlbum({title:'Giỗ Tổ 2026',is_public:true},admin.id);
  const rawAlbum=store.getGalleryAlbumRaw(album.id);
  assert.match(rawAlbum.storage_folder,/^gio-to-2026--[a-f0-9-]+$/i,'Thư mục album phải dễ nhận biết theo tên album');
  assert.equal(fs.statSync(path.join(UPLOAD_DIR,'gallery',rawAlbum.storage_folder)).isDirectory(),true,'Tạo album phải tạo thư mục vật lý ngay');

  const files={profile:'11111111-1111-4111-8111-111111111111.png',logo:'22222222-2222-4222-8222-222222222222.png',qr:'33333333-3333-4333-8333-333333333333.png',gallery:'44444444-4444-4444-8444-444444444444.png',orphan:'55555555-5555-4555-8555-555555555555.png'};
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  for(const name of Object.values(files))fs.writeFileSync(path.join(UPLOAD_DIR,name),png);
  store.db.prepare('UPDATE persons SET image_path=? WHERE id=?').run(files.profile,person.id);
  store.db.prepare("UPDATE settings SET value=? WHERE key='site_logo_path'").run(files.logo);
  store.db.prepare("UPDATE settings SET value=? WHERE key='fund_support_qr_path'").run(files.qr);
  const photoId='photo-v1020';const now=new Date().toISOString();
  store.db.prepare('INSERT INTO gallery_photos(id,album_id,title,image_path,sort_order,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(photoId,album.id,'Ảnh cũ',files.gallery,0,admin.id,admin.id,now,now);
  store.db.close();store=null;

  store=new Store();
  const migratedAlbum=store.getGalleryAlbumRaw(album.id);
  const migratedPerson=store.getPerson(person.id);
  const migratedPhoto=store.getGalleryPhotoRaw(photoId);
  assert.equal(migratedPerson.image_path,`profiles/${files.profile}`);
  assert.equal(store.getSetting('site_logo_path'),`Logo/${files.logo}`);
  assert.equal(store.getSetting('fund_support_qr_path'),`qrcode/${files.qr}`);
  assert.equal(migratedPhoto.image_path,`gallery/${migratedAlbum.storage_folder}/${files.gallery}`);
  for(const rel of [migratedPerson.image_path,store.getSetting('site_logo_path'),store.getSetting('fund_support_qr_path'),migratedPhoto.image_path])assert.equal(fs.existsSync(uploadFullPath(rel)),true,`Thiếu file sau migration: ${rel}`);
  for(const name of [files.profile,files.logo,files.qr,files.gallery,files.orphan])assert.equal(fs.existsSync(path.join(UPLOAD_DIR,name)),false,`Không được để ảnh rời trong uploads/: ${name}`);
  assert.equal(fs.existsSync(path.join(UPLOAD_DIR,UPLOAD_LAYOUT.legacy,files.orphan)),true,'Ảnh cũ không còn tham chiếu phải được gom vào _legacy thay vì xóa mất');

  const second=store.createGalleryAlbum({title:'Ngày Hội Gia Đình',is_public:true},admin.id);
  const secondRaw=store.getGalleryAlbumRaw(second.id);
  assert.notEqual(secondRaw.storage_folder,migratedAlbum.storage_folder);
  assert.equal(fs.existsSync(path.join(UPLOAD_DIR,'gallery',secondRaw.storage_folder)),true);

  console.log('v1020-upload-layout-regression: OK');
} finally { try{store?.db?.close();}catch{} fs.rmSync(tmp,{recursive:true,force:true}); }
