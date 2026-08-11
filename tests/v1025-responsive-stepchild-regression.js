'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1025-'));
const previousDataDir=process.env.DATA_DIR;
try{
  process.env.DATA_DIR=path.join(tmp,'data');
  const {Store}=require(path.join(root,'lib','db.js'));
  const store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const dad=store.createPerson({full_name:'Nguyễn Văn Cha',gender:'male',level:1,privacy_mode:'public'},admin.id);
  const mom=store.createPerson({full_name:'Trần Thị Mẹ',gender:'female',level:1,privacy_mode:'public'},admin.id);
  const step=store.createPerson({full_name:'Lê Văn Cha Kế',gender:'male',level:1,privacy_mode:'public'},admin.id);
  store.updatePerson(mom.id,{spouse_ids:[step.id],spouse_order_ids:[step.id]},admin.id);
  const child=store.createPerson({full_name:'Nguyễn Văn Con Riêng',gender:'male',level:2,father_id:dad.id,mother_id:mom.id,step_parent_ids:[step.id],birth_order:1,privacy_mode:'public'},admin.id);
  assert.deepEqual(store.getPerson(child.id).step_parent_ids,[step.id],'Con riêng phải lưu cha/mẹ kế riêng với cha/mẹ huyết thống');
  const inlaw=store.createPerson({full_name:'Phạm Thị Dâu',gender:'female',level:2,is_inlaw:true,birth_order:8,privacy_mode:'public'},admin.id);
  assert.equal(store.getPerson(inlaw.id).is_inlaw,true,'Phải lưu trạng thái Dâu/Rể');
  assert.equal(store.getPerson(inlaw.id).birth_order,0,'Dâu/Rể không được dùng thứ tự con nội tộc');
  store.db.close();

  const galleryHtml=fs.readFileSync(path.join(root,'public','gallery.html'),'utf8');
  const contactHtml=fs.readFileSync(path.join(root,'public','contact.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
  const adminJs=fs.readFileSync(path.join(root,'public','admin.js'),'utf8');
  const appCode=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  assert.doesNotMatch(galleryHtml,/>Các thư mục ảnh</,'Không còn tiêu đề lớn “Các thư mục ảnh”');
  assert.doesNotMatch(galleryHtml,/>Video dòng họ</,'Không còn tiêu đề lớn “Video dòng họ”');
  assert.doesNotMatch(contactHtml,/Kết nối với đại diện dòng họ/,'Không còn tiêu đề phụ lớn ở Người liên hệ');
  assert.doesNotMatch(contactHtml,/<h2>Nhà thờ Tổ<\/h2>/,'Không gian thờ tự không còn tiêu đề Nhà thờ Tổ');
  assert.doesNotMatch(contactHtml,/Tối đa 10 ảnh · Trỏ chuột/,'Không còn dòng hướng dẫn cố định ở Không gian thờ tự');
  assert.match(css,/gallery-photo-card:nth-child\(5n\+2\).*aspect-ratio:4\/3!important/s,'Mọi ảnh Gallery phải có cùng tỷ lệ xem 4:3');
  assert.match(css,/\.tree-viewport\{touch-action:none/,'Cây phải chặn gesture trình duyệt để kéo bằng cảm ứng');
  assert.match(css,/@media\(max-width:700px\)[\s\S]*\.admin-modal\{padding:0;place-items:stretch\}/,'Modal quản trị phải tối ưu màn hình điện thoại');
  assert.match(adminJs,/Cha \/ mẹ kế · Con riêng/,'Form cá thể phải có quan hệ Con riêng');
  assert.match(adminJs,/Dâu \/ Rể · không tính thứ tự con nội tộc/,'Form phải có lựa chọn Dâu/Rể');
  assert.match(adminJs,/body\.step_parent_ids=relationValues\('step_parent_ids'\)/,'Form phải gửi quan hệ cha/mẹ kế');

  const ctx={console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{},style:{setProperty:()=>{}}}},CSS:{escape:s=>String(s)}};
  vm.createContext(ctx);vm.runInContext(appCode,ctx);
  const people=[
    {id:'bio',full_name:'Mẹ',gender:'female',level:1,birth_order:1,spouse_ids:['step'],spouse_order_ids:['step'],divorced_spouse_ids:[],step_parent_ids:[],privacy_mode:'public'},
    {id:'step',full_name:'Cha kế',gender:'male',level:1,birth_order:1,spouse_ids:['bio'],spouse_order_ids:['bio'],divorced_spouse_ids:[],step_parent_ids:[],privacy_mode:'public'},
    {id:'child',full_name:'Con riêng',gender:'male',level:2,birth_order:1,mother_id:'bio',father_id:null,spouse_ids:[],spouse_order_ids:[],divorced_spouse_ids:[],step_parent_ids:['step'],privacy_mode:'public'}
  ];
  const layout=vm.runInContext(`buildLayout(${JSON.stringify(people)})`,ctx);
  assert.ok(Array.from(layout.paths).some(x=>x.includes('stepchild')),'Cây phải vẽ đường Con riêng riêng biệt');
  vm.runInContext(`state.people=${JSON.stringify(people)};state.byId=new Map(state.people.map(p=>[p.id,p]));`,ctx);
  const childHtml=vm.runInContext(`renderPersonNode({x:0,y:0,person:state.byId.get('child'),unit:{primary:state.byId.get('child')}})`,ctx);
  assert.match(childHtml,/step-badge/,'Thẻ Con riêng phải có badge dễ phân biệt');
  console.log('v1025-responsive-stepchild-regression: OK');
} finally {
  if(previousDataDir===undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR=previousDataDir;
  fs.rmSync(tmp,{recursive:true,force:true});
}
