'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const projectRoot=path.join(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v109-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js']) fs.copyFileSync(path.join(projectRoot,'lib',name),path.join(tmp,'lib',name));

try{
  const {Store}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);

  const root=store.createPerson({full_name:'Nguyễn Gốc',gender:'male',level:2,privacy_mode:'public'},admin.id);
  const spouse=store.createPerson({full_name:'Trần Phối Ngẫu',gender:'female',level:2,spouse_ids:[root.id],privacy_mode:'public'},admin.id);
  const former=store.createPerson({full_name:'Lê Chồng Cũ',gender:'male',level:1,privacy_mode:'public'},admin.id);
  const stepchild=store.createPerson({full_name:'Lê Con Riêng',gender:'female',father_id:former.id,mother_id:spouse.id,level:3,privacy_mode:'public'},admin.id);
  const child=store.createPerson({full_name:'Nguyễn Con',gender:'male',father_id:root.id,mother_id:spouse.id,privacy_mode:'public'},admin.id);
  const childSpouse=store.createPerson({full_name:'Phạm Con Dâu',gender:'female',level:3,spouse_ids:[child.id],privacy_mode:'public'},admin.id);
  const grandchild=store.createPerson({full_name:'Nguyễn Cháu',gender:'female',father_id:child.id,mother_id:childSpouse.id,privacy_mode:'public'},admin.id);

  assert.equal(store.getPerson(child.id).level,3,'Không gửi level phải tự tính theo cha/mẹ');
  assert.equal(store.getPerson(grandchild.id).level,4,'Đời cháu phải tự nối tiếp từ cha/mẹ');

  store.updatePerson(root.id,{level:5},admin.id);
  assert.equal(store.getPerson(root.id).level,5,'Đời nhập thủ công của cá thể phải được giữ');
  assert.equal(store.getPerson(spouse.id).level,5,'Phối ngẫu phải được căn cùng đời sau khi sửa');
  assert.equal(store.getPerson(child.id).level,6,'Con phải tự tăng theo đời mới của cha/mẹ');
  assert.equal(store.getPerson(childSpouse.id).level,6,'Phối ngẫu của hậu duệ phải được giữ cùng đời');
  assert.equal(store.getPerson(grandchild.id).level,7,'Toàn bộ hậu duệ phải tự cập nhật nối tiếp');
  assert.equal(store.getPerson(stepchild.id).level,6,'Con của phối ngẫu phải được căn tiếp để toàn bộ mạng gia đình không lệch đời');

  store.updatePerson(child.id,{level:8},admin.id);
  assert.equal(store.getPerson(root.id).level,5,'Sửa đời một hậu duệ không được sửa ngược tổ tiên');
  assert.equal(store.getPerson(spouse.id).level,5,'Sửa đời một hậu duệ không được sửa ngược đời cha/mẹ');
  assert.equal(store.getPerson(child.id).level,8,'Cá thể được sửa phải giữ đúng đời nhập thủ công');
  assert.equal(store.getPerson(childSpouse.id).level,8,'Phối ngẫu của cá thể được sửa phải theo cùng đời');
  assert.equal(store.getPerson(grandchild.id).level,9,'Đời sau của cá thể được sửa phải tiếp tục cập nhật');

  const expires=new Date(Date.now()+86400_000).toISOString();
  store.createSession('guest-session-hash','csrf-guest',expires,null);
  store.createSession('user-session-hash','csrf-user',expires,admin.id);
  store.createSession('user-session-hash-2','csrf-user-2',expires,admin.id);
  assert.equal(store.recordPublicVisit('guest-session-hash',null),true,'Lượt khách đầu tiên phải được ghi');
  assert.equal(store.recordPublicVisit('guest-session-hash',null),false,'Reload trong 30 phút không được tăng lượt truy cập');
  assert.equal(store.recordPublicVisit('user-session-hash',admin.id),true,'Lượt thành viên phải được ghi');
  const traffic=store.trafficStats(5);
  assert.equal(traffic.guests_online,1,'Phải đếm đúng khách đang online');
  assert.equal(traffic.users_online,1,'Cùng một tài khoản trên nhiều phiên vẫn chỉ tính một user đang online');
  assert.equal(traffic.online,2,'Tổng online phải bằng khách + user');
  assert.equal(traffic.visits_today,2,'Hai phiên truy cập phải được tính trong ngày');
  assert.equal(traffic.visits_month,2,'Hai phiên truy cập phải được tính trong tháng');
  assert.equal(traffic.visits_total,2,'Tổng lượt truy cập phải được lưu tích lũy');

  store.db.close();
  console.log('generation-traffic-regression: OK');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
