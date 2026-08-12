'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');

const projectRoot=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(projectRoot,'public','index.html'),'utf8');
const app=fs.readFileSync(path.join(projectRoot,'public','app.js'),'utf8');
const admin=fs.readFileSync(path.join(projectRoot,'public','admin.js'),'utf8');
const css=fs.readFileSync(path.join(projectRoot,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(projectRoot,'server.js'),'utf8');
const dbCode=fs.readFileSync(path.join(projectRoot,'lib','db.js'),'utf8');

assert.match(html,/id="brandLogo"/,'Logo công khai phải có điểm cập nhật động');
assert.match(admin,/id="set_site_logo_file"/,'Cài đặt admin phải có tải logo');
assert.match(admin,/512 × 512 px/,'Cài đặt logo phải diễn giải kích thước ảnh hợp lý');
assert.match(server,/logo_image_data/,'API cài đặt phải nhận dữ liệu logo');
assert.match(server,/footer_author_text/,'Cài đặt tác giả phải được đưa ra trang công khai');
assert.match(admin,/footerAuthorEditor/,'Admin phải có trình soạn dòng tác giả');
assert.match(admin,/data-rich-font/,'Trình soạn tác giả phải đổi được font chữ');
assert.match(html,/id="footerAuthor"/,'Trang công khai phải có dòng tác giả');
assert.ok(html.indexOf('footer-summary')<html.indexOf('id="trafficStats"'),'Thống kê online phải nằm dưới dòng mô tả chân trang');
assert.match(html,/id="treeLegend"/,'Chú thích cây phải render động theo dữ liệu');
assert.match(app,/Hôn phối khác Chi/,'Chú thích phải hỗ trợ hôn phối khác Chi');
assert.match(app,/Đã ly hôn/,'Chú thích phải hỗ trợ quan hệ đã ly hôn');
assert.match(css,/relation-line\.cross-branch/,'Cây phải có kiểu đường riêng cho hôn phối khác Chi');
assert.match(dbCode,/\{min:80,max:null\}/,'Backend phải có nhóm tuổi 80+');
assert.match(app,/age:\$\{b\.min\}:plus/,'Frontend phải mở được danh sách nhóm 80+');
assert.match(admin,/nhiều vợ\/chồng/,'Form cá thể phải hướng dẫn trường hợp nhiều hôn nhân');
assert.match(admin,/con riêng của từng cuộc hôn nhân/,'Form phải hướng dẫn gán con riêng theo đúng cha mẹ');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1013-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js'])fs.copyFileSync(path.join(projectRoot,'lib',name),path.join(tmp,'lib',name));
try{
  const {Store}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const actor=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const rootA=store.createPerson({full_name:'Gốc Chi A',gender:'male',level:1,privacy_mode:'public'},actor.id);
  const rootB=store.createPerson({full_name:'Gốc Chi B',gender:'male',level:1,privacy_mode:'public'},actor.id);
  const man=store.createPerson({full_name:'Nam Chi A',gender:'male',father_id:rootA.id,privacy_mode:'public'},actor.id);
  const wife=store.createPerson({full_name:'Nữ Chi B',gender:'female',father_id:rootB.id,spouse_ids:[man.id],privacy_mode:'public'},actor.id);
  const former=store.createPerson({full_name:'Vợ Trước',gender:'female',level:2,divorced_spouse_ids:[man.id],privacy_mode:'public'},actor.id);
  const childCurrent=store.createPerson({full_name:'Con Với Vợ Hiện Tại',gender:'male',father_id:man.id,mother_id:wife.id,privacy_mode:'public'},actor.id);
  const childFormer=store.createPerson({full_name:'Con Với Vợ Trước',gender:'female',father_id:man.id,mother_id:former.id,privacy_mode:'public'},actor.id);
  store.createBranch({name:'Chi A',root_person_id:rootA.id,is_public:true},actor.id);
  store.createBranch({name:'Chi B',root_person_id:rootB.id,is_public:true},actor.id);

  const all=store.listPeople({publicOnly:true});
  const by=Object.fromEntries(all.map(p=>[p.full_name,p]));
  assert.deepEqual(by['Nam Chi A'].branch_names,['Chi A'],'Nam phải thuộc huyết hệ Chi A');
  assert.deepEqual(by['Nữ Chi B'].branch_names,['Chi B'],'Nữ phải thuộc huyết hệ Chi B');
  assert.ok(by['Nam Chi A'].spouse_ids.includes(by['Nữ Chi B'].id),'Quan hệ khác Chi phải giữ đúng vợ/chồng');
  assert.ok(by['Nam Chi A'].spouse_ids.includes(by['Vợ Trước'].id),'Một người phải giữ được nhiều vợ/chồng');
  assert.ok(by['Nam Chi A'].divorced_spouse_ids.includes(by['Vợ Trước'].id),'Vợ trước phải giữ trạng thái đã ly hôn');
  assert.equal(store.getPerson(childCurrent.id).mother_id,wife.id,'Con hiện tại phải nối đúng cặp cha mẹ');
  assert.equal(store.getPerson(childFormer.id).mother_id,former.id,'Con riêng phải nối đúng người mẹ của cuộc hôn nhân trước');

  const ctx={console,URLSearchParams,location:{search:''},window:{addEventListener:()=>{}},document:{documentElement:{style:{setProperty:()=>{}}}},Intl,Date,setInterval:()=>0,clearInterval:()=>{},history:{}};
  vm.createContext(ctx);vm.runInContext(app,ctx);
  vm.runInContext(`state.people=${JSON.stringify(all)};state.byId=new Map(state.people.map(p=>[p.id,p]));`,ctx);
  assert.equal(vm.runInContext(`crossBranchMarriage(state.byId.get(${JSON.stringify(man.id)}),state.byId.get(${JSON.stringify(wife.id)}))`,ctx),true,'Hôn phối Chi A - Chi B phải được nhận diện');
  assert.match(vm.runInContext(`relationshipCaption({person:state.byId.get(${JSON.stringify(former.id)}),unit:{primary:{id:${JSON.stringify(man.id)}}}})`,ctx),/^Vợ (?:cũ|\d+ · cũ)$/,'Cây phải ghi rõ thứ tự và trạng thái vợ cũ cho quan hệ đã ly hôn');
  const layout=vm.runInContext('buildLayout(state.people)',ctx);
  assert.ok(layout.paths.some(x=>x.includes('spouse cross-branch')),'Đường hôn phối khác Chi phải được đánh dấu');
  assert.ok(layout.paths.some(x=>x.includes('spouse divorced')),'Đường với vợ/chồng đã ly hôn phải là nét ly hôn');
  const spousePaths=layout.paths.filter(x=>x.includes('relation-line spouse'));
  const spouseYs=spousePaths.map(x=>Number((x.match(/M [-0-9.]+ ([-0-9.]+) H/)||[])[1])).filter(Number.isFinite);
  assert.equal(new Set(spouseYs).size,spouseYs.length,'Nhiều vợ/chồng phải dùng các làn đường hôn phối khác nhau để không chồng nét');
  for(const y of spouseYs) assert.ok(layout.paths.some(x=>new RegExp(`relation-line\" d=\"M [-0-9.]+ ${y} V`).test(x)),'Nhánh con phải bắt đầu đúng tại làn hôn phối tương ứng');
  const relHtml=vm.runInContext(`relativeSection(relativeGroups(state.byId.get(${JSON.stringify(man.id)})))`,ctx);
  assert.match(relHtml,/Vợ \/ chồng hiện tại/,'Chi tiết phải tách vợ/chồng hiện tại');
  assert.match(relHtml,/Vợ \/ chồng đã ly hôn/,'Chi tiết phải tách vợ/chồng đã ly hôn');
  assert.match(relHtml,/Con với Nữ Chi B/,'Chi tiết phải nhóm con theo đúng phối ngẫu');
  assert.match(relHtml,/Con với Vợ Trước/,'Chi tiết phải nhóm con riêng theo đúng phối ngẫu trước');

  const y=new Date().getFullYear();
  store.createPerson({full_name:'Cụ 85',gender:'male',birth_date:String(y-85),privacy_mode:'public'},actor.id);
  const stats=store.treeStats(store.listPeople({publicOnly:true}));
  const over80=stats.age_bands.find(b=>b.min===80&&b.max===null);
  assert.ok(over80&&over80.total>=1,'Nhóm 80+ phải có dữ liệu và không chồng với 60-80');

  store.updateSettings({footer_author_text:'Tác giả trang web: Gia đình A',footer_author_font:'noto_serif',site_logo_path:'abc.png'},actor.id);
  assert.equal(store.getSetting('footer_author_text'),'Tác giả trang web: Gia đình A');
  assert.equal(store.getSetting('footer_author_font'),'noto_serif');
  assert.equal(store.getSetting('site_logo_path'),'Logo/abc.png');
  store.db.close();
  console.log('v1013-regression: OK');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
