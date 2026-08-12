'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');

const projectRoot=path.join(__dirname,'..');
const serverCode=fs.readFileSync(path.join(projectRoot,'server.js'),'utf8');
const adminCode=fs.readFileSync(path.join(projectRoot,'public','admin.js'),'utf8');
const backupCode=fs.readFileSync(path.join(projectRoot,'lib','data-backup.js'),'utf8');
assert.match(serverCode,/method === 'POST' && pathname === '\/api\/admin\/backup\/export'/,'Xuất backup phải dùng POST để nhận mật khẩu');
assert.match(serverCode,/createDataSnapshot/,'Backup phải chụp toàn bộ thư mục data');
assert.match(serverCode,/decryptBackupToDirectory/,'Restore phải giải mã gói data');
assert.match(adminCode,/\.gpbak/,'Giao diện phải dùng định dạng backup .gpbak');
assert.match(adminCode,/không thể khôi phục dữ liệu nếu quên mật khẩu/i,'Phải cảnh báo người dùng ghi nhớ mật khẩu');
assert.match(adminCode,/backupExportPasswordConfirm/,'Phải nhập lại mật khẩu khi tạo backup');
assert.match(backupCode,/aes-256-gcm/,'Backup phải dùng mã hóa có xác thực AES-256-GCM');
assert.match(backupCode,/scryptSync/,'Mật khẩu backup phải qua KDF scrypt');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-data-folder-backup-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js','data-backup.js'])fs.copyFileSync(path.join(projectRoot,'lib',name),path.join(tmp,'lib',name));

(async()=>{
  try{
    const {Store,DATA_DIR}=require(path.join(tmp,'lib','db.js'));
    const {createEncryptedBackup,decryptBackupToDirectory,inspectBackupFile,validateBackupPassword}=require(path.join(tmp,'lib','data-backup.js'));
    const store=new Store();
    const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
    const imageName='12345678-1234-1234-1234-123456789abc.png';
    const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    fs.mkdirSync(path.join(DATA_DIR,'uploads','profiles'),{recursive:true});
    fs.writeFileSync(path.join(DATA_DIR,'uploads','profiles',imageName),image);
    fs.mkdirSync(path.join(DATA_DIR,'extra','nested'),{recursive:true});
    fs.writeFileSync(path.join(DATA_DIR,'extra','nested','ghi-chu.txt'),'noi dung tuy y trong data');
    fs.mkdirSync(path.join(DATA_DIR,'empty-dir'),{recursive:true});
    const galleryFolder=path.join(DATA_DIR,'uploads','gallery','Gio To 2026');
    fs.mkdirSync(galleryFolder,{recursive:true});
    fs.writeFileSync(path.join(galleryFolder,'anh-01.jpg'),Buffer.from('gallery-before-backup'));
    const person=store.createPerson({full_name:'Nguyễn Backup Thư Mục',gender:'male',birth_date:'1988',privacy_mode:'private',image_path:`profiles/${imageName}`},admin.id);
    fs.mkdirSync(path.join(DATA_DIR,'uploads','Logo'),{recursive:true});fs.copyFileSync(path.join(DATA_DIR,'uploads','profiles',imageName),path.join(DATA_DIR,'uploads','Logo',imageName));
    store.updateSettings({tree_title:'Gia phả trước backup',site_logo_path:`Logo/${imageName}`},admin.id);
    const expires=new Date(Date.now()+86400_000).toISOString();
    store.createSession('current-session','csrf-current',expires,admin.id);

    const snapshot=store.createDataSnapshot();
    const backupFile=path.join(tmp,'backup.gpbak');
    const password='MậtKhẩu-Backup-2026!';
    await createEncryptedBackup(snapshot.dataDir,password,backupFile);
    fs.rmSync(snapshot.holder,{recursive:true,force:true});
    assert.equal(inspectBackupFile(backupFile),true,'Tệp phải có magic của gói backup mới');
    const encrypted=fs.readFileSync(backupFile);
    assert.equal(encrypted.includes(Buffer.from('noi dung tuy y trong data')),false,'Nội dung data không được lộ dưới dạng plaintext');
    assert.equal(encrypted.includes(Buffer.from('SQLite format 3')),false,'CSDL không được lộ plaintext trong backup');
    assert.throws(()=>validateBackupPassword('1234567'),/ít nhất 8 ký tự/i,'Mật khẩu quá ngắn phải bị từ chối');

    const stageHolder=path.join(tmp,'stage');
    fs.mkdirSync(stageHolder);
    const stagedData=path.join(stageHolder,'data');
    await decryptBackupToDirectory(backupFile,password,stagedData);
    assert.deepEqual(fs.readFileSync(path.join(stagedData,'uploads','profiles',imageName)),image,'Ảnh đại diện phải nằm nguyên trong thư mục data đã giải mã');
    assert.equal(fs.readFileSync(path.join(stagedData,'extra','nested','ghi-chu.txt'),'utf8'),'noi dung tuy y trong data','Mọi tệp bổ sung trong data phải được đóng gói');
    assert.equal(fs.statSync(path.join(stagedData,'empty-dir')).isDirectory(),true,'Thư mục rỗng trong data cũng phải được giữ');
    assert.equal(fs.existsSync(path.join(stagedData,'uploads','gallery')),false,'Backup .gpbak mới không được chứa data/uploads/gallery');

    const invalidHolder=path.join(tmp,'invalid-stage');
    const invalidData=path.join(invalidHolder,'data');
    fs.cpSync(stagedData,invalidData,{recursive:true});
    const invalidDb=new DatabaseSync(path.join(invalidData,'family_tree.db'));
    invalidDb.prepare("UPDATE users SET role='viewer' WHERE role='admin'").run();
    invalidDb.close();
    assert.throws(()=>store.validateStagedDataDirectory(invalidData),/không có tài khoản admin/i,'Restore thư mục data không được phép làm mất admin');
    fs.rmSync(invalidHolder,{recursive:true,force:true});

    const wrongTarget=path.join(tmp,'wrong-data');
    await assert.rejects(()=>decryptBackupToDirectory(backupFile,'Sai-Mat-Khau-123!',wrongTarget),/Mật khẩu backup không đúng|bị hỏng/i,'Sai mật khẩu phải không giải mã được');
    assert.equal(fs.existsSync(wrongTarget),false,'Sai mật khẩu không được tạo thư mục data restore');
    const tampered=path.join(tmp,'tampered.gpbak');
    const changed=Buffer.from(encrypted);changed[Math.floor(changed.length/2)]^=0x01;fs.writeFileSync(tampered,changed);
    await assert.rejects(()=>decryptBackupToDirectory(tampered,password,path.join(tmp,'tampered-data')),/Mật khẩu backup không đúng|bị hỏng/i,'Backup bị sửa phải bị AES-GCM từ chối');

    store.createPerson({full_name:'Dữ liệu sau backup',gender:'female',privacy_mode:'public'},admin.id);
    fs.writeFileSync(path.join(DATA_DIR,'after-backup.txt'),'phai bi xoa khi restore');
    fs.writeFileSync(path.join(galleryFolder,'anh-sau-backup.jpg'),Buffer.from('gallery-must-be-preserved'));
    const restored=store.restoreDataDirectory(stagedData,admin.id,'current-session');
    assert.equal(restored.ok,true);
    assert.equal(restored.session_preserved,true,'Phiên admin hiện tại được giữ nếu admin có trong backup');
    assert.equal(store.getSetting('tree_title'),'Gia phả trước backup');
    assert.equal(store.getPerson(person.id).full_name,'Nguyễn Backup Thư Mục');
    assert.equal(store.listPeople({publicOnly:false}).some(p=>p.full_name==='Dữ liệu sau backup'),false,'Restore phải thay cả data, không merge');
    assert.equal(fs.existsSync(path.join(DATA_DIR,'after-backup.txt')),false,'Tệp phát sinh sau backup phải biến mất khi thay thư mục data');
    assert.equal(fs.readFileSync(path.join(DATA_DIR,'extra','nested','ghi-chu.txt'),'utf8'),'noi dung tuy y trong data');
    assert.equal(fs.readFileSync(path.join(DATA_DIR,'uploads','gallery','Gio To 2026','anh-sau-backup.jpg'),'utf8'),'gallery-must-be-preserved','Restore phải giữ nguyên Gallery hiện tại vì Gallery không nằm trong .gpbak');
    assert.equal(restored.gallery_preserved,true,'Kết quả restore phải báo Gallery được giữ riêng');
    assert.equal(store.getSession('current-session').user_id,admin.id);
    store.db.close();
    console.log('data-folder-backup-regression: OK');
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
})().catch((error)=>{console.error(error);process.exit(1);});
