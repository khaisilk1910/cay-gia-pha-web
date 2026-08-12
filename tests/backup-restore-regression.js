'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');

const projectRoot=path.join(__dirname,'..');
const serverCode=fs.readFileSync(path.join(projectRoot,'server.js'),'utf8');
const adminCode=fs.readFileSync(path.join(projectRoot,'public','admin.js'),'utf8');
const css=fs.readFileSync(path.join(projectRoot,'public','styles.css'),'utf8');
assert.match(serverCode,/\/api\/admin\/backup\/export/,'Phải có API xuất bản sao lưu đầy đủ');
assert.match(serverCode,/\/api\/admin\/backup\/restore/,'Phải có API khôi phục bản sao lưu');
assert.match(adminCode,/id="backupRestoreFile"/,'Cài đặt phải có ô chọn tệp khôi phục');
assert.match(adminCode,/KHOI PHUC/,'Khôi phục phải có xác nhận mạnh trước khi ghi đè dữ liệu');
assert.match(adminCode,/giữ nguyên data\/uploads\/gallery hiện có/i,'Giao diện phải nêu rõ Gallery được giữ riêng khi restore');
assert.match(css,/\.backup-box/,'Phần sao lưu/khôi phục phải có giao diện riêng');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-backup-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js'])fs.copyFileSync(path.join(projectRoot,'lib',name),path.join(tmp,'lib',name));
try{
  const {Store,DATA_DIR}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const editor=store.createUser({username:'editor1',display_name:'Biên tập',password:'Editor-Password-2026!',role:'editor'},admin.id);
  const imageName='12345678-1234-1234-1234-123456789abc.png';
  const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  fs.mkdirSync(path.join(DATA_DIR,'uploads','profiles'),{recursive:true});
  fs.writeFileSync(path.join(DATA_DIR,'uploads','profiles',imageName),image);
  const person=store.createPerson({full_name:'Nguyễn Bản Sao',gender:'male',birth_date:'1980',privacy_mode:'private',image_path:`profiles/${imageName}`},admin.id);
  store.createBranch({name:'Chi Sao Lưu',root_person_id:person.id,is_public:true},admin.id);
  fs.mkdirSync(path.join(DATA_DIR,'uploads','Logo'),{recursive:true});fs.copyFileSync(path.join(DATA_DIR,'uploads','profiles',imageName),path.join(DATA_DIR,'uploads','Logo',imageName));
  store.updateSettings({tree_title:'Gia phả trước backup',site_logo_path:`Logo/${imageName}`},admin.id);
  store.addComment('Người góp ý','Nội dung cần backup',editor.id,'hash-ip');
  store.recordPublicVisit('visit-backup',editor.id);

  const backup=store.exportFullBackup();
  assert.equal(backup.format,'cay-gia-pha-web-full-backup');
  assert.equal(backup.version,3);
  assert.equal(backup.sessions_included,false,'Không được sao lưu phiên đăng nhập');
  assert.ok(backup.tables.users.some(u=>u.id===admin.id&&u.password_hash),'Backup phải giữ tài khoản và password hash để restore đầy đủ');
  assert.ok(backup.tables.persons.some(p=>p.id===person.id&&p.image_path===`profiles/${imageName}`),'Backup phải giữ dữ liệu cá thể thô');
  assert.ok(backup.uploads.some(u=>u.filename===`profiles/${imageName}`&&u.sha256&&u.data_base64),'Backup phải nhúng ảnh và checksum');
  assert.match(backup.integrity.tables_sha256,/^[a-f0-9]{64}$/,'Backup phải có checksum cho toàn bộ dữ liệu bảng');

  const expires=new Date(Date.now()+86400_000).toISOString();
  store.createSession('current-session','csrf-current',expires,admin.id);
  store.createPerson({full_name:'Dữ liệu tạo sau backup',gender:'female',privacy_mode:'public'},admin.id);
  store.updateSettings({tree_title:'Đã thay đổi sau backup',site_logo_path:''},admin.id);
  fs.writeFileSync(path.join(DATA_DIR,'uploads','profiles','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'),image);

  const restored=store.restoreFullBackup(backup,admin.id,'current-session');
  assert.equal(restored.ok,true);
  assert.equal(restored.session_preserved,true,'Phiên admin đang restore nên được giữ nếu tài khoản còn trong backup');
  assert.equal(store.getSetting('tree_title'),'Gia phả trước backup','Cài đặt phải quay về trạng thái backup');
  assert.equal(store.getPerson(person.id).full_name,'Nguyễn Bản Sao','Cá thể phải được khôi phục');
  assert.equal(store.listPeople({publicOnly:false}).some(p=>p.full_name==='Dữ liệu tạo sau backup'),false,'Dữ liệu sau backup phải bị thay thế chứ không merge');
  assert.ok(store.getUserById(editor.id),'Tài khoản và phân quyền phải được restore');
  assert.equal(store.listBranches({publicOnly:false}).length,1,'Chi/nhánh phải được restore');
  assert.equal(store.listComments(true,0).some(c=>c.message==='Nội dung cần backup'),true,'Bình luận phải được restore');
  assert.equal(store.trafficStats().visits_total,1,'Lượt truy cập phải được restore');
  assert.deepEqual(fs.readFileSync(path.join(DATA_DIR,'uploads','profiles',imageName)),image,'Ảnh phải được restore nguyên vẹn');
  assert.equal(fs.existsSync(path.join(DATA_DIR,'uploads','profiles','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png')),false,'Ảnh phát sinh sau backup phải bị thay thế');
  assert.equal(store.getSession('current-session').user_id,admin.id,'Phiên hiện tại phải được nối lại với admin');
  assert.ok(store.listAudit(0).some(a=>a.action==='backup.restore'),'Nhật ký phải ghi thao tác restore');

  const noAdmin=structuredClone(backup);
  noAdmin.tables.users=noAdmin.tables.users.map(u=>({...u,role:u.id===admin.id?'viewer':u.role,is_active:u.role==='admin'?0:u.is_active}));
  noAdmin.integrity.tables_sha256=crypto.createHash('sha256').update(JSON.stringify(noAdmin.tables)).digest('hex');
  assert.throws(()=>store.restoreFullBackup(noAdmin,admin.id,'current-session'),/không có tài khoản admin/i,'Không được restore backup khiến hệ thống mất admin');
  assert.equal(store.getPerson(person.id).full_name,'Nguyễn Bản Sao','Backup bị từ chối không được làm thay đổi dữ liệu');

  const damaged=structuredClone(backup); damaged.uploads[0].sha256='0'.repeat(64);
  assert.throws(()=>store.restoreFullBackup(damaged,admin.id,'current-session'),/toàn vẹn/i,'Ảnh sai checksum phải bị từ chối trước khi restore');
  assert.equal(store.getSetting('tree_title'),'Gia phả trước backup');

  store.db.close();
  console.log('backup-restore-regression: OK');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
