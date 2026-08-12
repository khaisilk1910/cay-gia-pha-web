'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const html=read('public/contributions.html');
const js=read('public/contributions.js');
const adminHtml=read('public/admin.html');
const adminJs=read('public/admin.js');
const css=read('public/styles.css');
const server=read('server.js');
const dbCode=read('lib/db.js');

assert.equal(pkg.version,'1.0.30','package.json phải ở v1.0.30');
assert.ok(fs.existsSync(path.join(root,'public','contributions.html')),'Thiếu trang public Phương Danh Công Đức');
assert.ok(fs.existsSync(path.join(root,'public','contributions.js')),'Thiếu JS trang Phương Danh Công Đức');

for(const label of ['STT','Phương danh','Nội dung công đức','Giá trị','Ngày công đức','Ghi chú']){
  assert.match(html,new RegExp(`>${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}<`),`Thiếu cột ${label}`);
}
assert.match(html,/Những tấm lòng nổi bật/,'Bảng Top phải nằm trên trang');
assert.ok(html.indexOf('contribution-top-section')<html.indexOf('contribution-list-section'),'Bảng Top phải nằm phía trên danh sách đầy đủ');
assert.match(html,/id="contributionPublicSearch"/,'Phải có tìm theo Phương danh');
assert.match(html,/id="contributionPublicYear"/,'Phải có lọc năm');
assert.match(html,/id="contributionPublicSort"/,'Phải có sắp xếp');
assert.match(html,/id="contributionPagination"/,'Phải có phân trang');
for(const file of ['public/index.html','public/gallery.html','public/contact.html']){
  assert.match(read(file),/href="\/contributions\.html"/g,`${file} phải có liên kết Phương Danh Công Đức`);
}

assert.match(adminHtml,/data-view="contributions"/,'Admin phải có menu Phương danh');
assert.match(adminHtml,/id="view-contributions"/,'Admin phải có view quản lý công đức');
assert.match(adminHtml,/id="contributionModal"/,'Admin phải có modal thêm/sửa công đức');
assert.match(adminHtml,/id="contributionsTable"/,'Admin phải có bảng công đức');
assert.match(adminJs,/settingsTabButton\('merit','Công đức','✦'\)/,'Cài đặt phải có tab Công đức');
assert.match(adminJs,/id="set_contribution_top_count"/,'Cài đặt phải có số lượng Top');
for(const n of [5,10,15,20]) assert.match(adminJs,new RegExp(`<option value="${n}"`),`Cài đặt Top phải hỗ trợ ${n}`);
assert.match(adminJs,/contribution_top_count:/,'Lưu cài đặt phải gửi contribution_top_count');

assert.match(server,/pathname === '\/api\/public\/contributions'/,'Thiếu API public contributions');
assert.match(server,/pathname === '\/api\/admin\/contributions'/,'Thiếu API admin contributions');
assert.match(server,/amount_desc/,'API phải hỗ trợ sort giá trị giảm dần');
assert.match(server,/date_desc/,'API phải hỗ trợ sort theo ngày');
assert.match(server,/year_desc/,'API phải hỗ trợ sort theo năm');
assert.match(html,/value="year_desc"/,'Trang public phải có lựa chọn sort theo năm');
assert.match(server,/store\.topContributors\(topCount\)/,'API public phải trả bảng Top theo cấu hình');
assert.match(dbCode,/CREATE TABLE IF NOT EXISTS contributions/,'DB phải có bảng contributions');
assert.match(dbCode,/contribution_top_count:\s*'10'/,'Top mặc định phải là 10');
assert.match(dbCode,/\['5','10','15','20'\]/,'DB phải giới hạn Top ở 5,10,15,20');
assert.match(dbCode,/topContributors\(limit=10\)/,'Store phải có tổng hợp Top contributors');
assert.match(dbCode,/SUM\(amount\)/,'Top phải cộng dồn giá trị theo Phương danh');
assert.match(dbCode,/legacyWithoutContributions/,'Restore phải tương thích backup legacy chưa có contributions');

assert.match(css,/\.contribution-list-table tbody tr:nth-child\(odd\) td\{background:/,'Danh sách phải có nền dòng lẻ riêng');
assert.match(css,/\.contribution-list-table tbody tr:nth-child\(even\) td\{background:/,'Danh sách phải có nền dòng chẵn riêng');
assert.match(css,/rank-1/,'Bảng Top phải nhấn mạnh hạng 1');
assert.match(css,/@media\(max-width:700px\)[\s\S]*?\.contribution-public-table thead\{display:none\}/,'Trang công đức phải responsive trên mobile');
assert.match(js,/page_size/,'Trang public phải gửi page_size');
assert.match(js,/data-label/,'Bảng public phải gắn nhãn cột cho mobile');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1030-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js']) fs.copyFileSync(path.join(root,'lib',name),path.join(tmp,'lib',name));
try{
  const {Store}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  assert.ok(admin?.id,'Phải tạo được admin test');

  const a1=store.createContribution({donor_name:'Gia đình Nguyễn Văn A',contribution_content:'Tu sửa nhà thờ Tổ',amount:1000000,contribution_date:'2026-01-10',notes:'Đợt 1'},admin.id);
  const a2=store.createContribution({donor_name:'Gia đình Nguyễn Văn A',contribution_content:'Quỹ khuyến học',amount:2000000,contribution_date:'2026-03-12',notes:'Đợt 2'},admin.id);
  const b=store.createContribution({donor_name:'Tập thể B',contribution_content:'Công đức',amount:2500000,contribution_date:'2025-05-20',notes:''},admin.id);
  assert.equal(store.listContributions().length,3,'Phải lưu đủ 3 khoản công đức');
  assert.deepEqual(store.contributionYears(),['2026','2025'],'Danh sách năm phải giảm dần');
  const top=store.topContributors(5);
  assert.equal(top.length,2,'Top phải gộp theo Phương danh');
  assert.equal(top[0].donor_name,'Gia đình Nguyễn Văn A','Người tổng công đức cao nhất phải đứng đầu');
  assert.equal(top[0].amount,3000000,'Top phải cộng dồn các lần công đức cùng Phương danh');
  assert.equal(top[0].contribution_count,2,'Top phải đếm đúng số lần công đức');
  assert.deepEqual(store.contributionSummary(),{count:3,donors:2,total_amount:5500000},'Thống kê công đức phải chính xác');

  const updated=store.updateContribution(b.id,{amount:3500000,notes:'Cập nhật'},admin.id);
  assert.equal(updated.amount,3500000,'Phải cập nhật được giá trị');
  assert.equal(store.topContributors(5)[0].donor_name,'Tập thể B','Top phải đổi ngay sau cập nhật');
  assert.ok(store.deleteContribution(a1.id,admin.id),'Phải xóa được bản ghi');
  assert.equal(store.listContributions().length,2,'Sau xóa phải còn 2 bản ghi');

  store.updateSettings({contribution_top_count:'15'},admin.id);
  assert.equal(store.getSetting('contribution_top_count'),'15','Phải lưu Top 15');
  store.updateSettings({contribution_top_count:'999'},admin.id);
  assert.equal(store.getSetting('contribution_top_count'),'10','Giá trị Top không hợp lệ phải về 10');
  const stats=store.stats();
  assert.equal(stats.contributions,2,'Dashboard stats phải có số bản ghi công đức');
  assert.equal(stats.contribution_total,5500000,'Dashboard stats phải có tổng tiền sau cập nhật/xóa');

  // Tương thích file backup JSON legacy v3: trước v1.0.30 chưa có bảng contributions.
  const currentBackup=store.exportFullBackup();
  const legacyTables={};
  for(const table of ['settings','users','persons','branches','comments','audit_logs','page_visits']) legacyTables[table]=currentBackup.tables[table];
  const legacy={...currentBackup,tables:legacyTables,integrity:{tables_sha256:crypto.createHash('sha256').update(JSON.stringify(legacyTables)).digest('hex')}};
  const restore=store.restoreFullBackup(legacy,admin.id,null);
  assert.equal(restore.ok,true,'Backup legacy phải restore được');
  assert.equal(store.listContributions().length,0,'Backup legacy phải khởi tạo contributions rỗng');

  store.db.close();
  console.log('v1030-contributions-regression: OK');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
