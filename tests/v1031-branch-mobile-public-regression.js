'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('public/app.js');
const css=read('public/styles.css');
const index=read('public/index.html');
const gallery=read('public/gallery.html');
const contact=read('public/contact.html');
const contributions=read('public/contributions.html');
const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.version,'1.0.32','package.json phải ở v1.0.32');

function contextFor(src){
  const context={console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{},style:{setProperty:()=>{}}}},CSS:{escape:s=>String(s)}};
  vm.createContext(context);vm.runInContext(src,context);return context;
}
const ctx=contextFor(app);
const people=[
  {id:'gp1',full_name:'Nguyễn Thị Liên',gender:'female',level:1,spouse_ids:['gp2'],spouse_order_ids:['gp2'],step_parent_ids:[]},
  {id:'gp2',full_name:'Nguyễn Văn Nguyên',gender:'male',level:1,spouse_ids:['gp1'],spouse_order_ids:['gp1'],step_parent_ids:[]},
  {id:'daughter',full_name:'Nguyễn Thị Thảo',gender:'female',level:2,mother_id:'gp1',father_id:'gp2',spouse_ids:['inlaw'],spouse_order_ids:['inlaw'],step_parent_ids:[]},
  {id:'inlaw',full_name:'Nguyễn Văn A',gender:'male',level:2,spouse_ids:['daughter'],spouse_order_ids:['daughter'],step_parent_ids:[]},
  {id:'stepchild',full_name:'Nguyễn Thị A Con',gender:'female',level:3,father_id:'inlaw',mother_id:null,spouse_ids:[],spouse_order_ids:[],step_parent_ids:['daughter']},
  {id:'grandchild',full_name:'Nguyễn Văn A Con',gender:'male',level:3,father_id:'inlaw',mother_id:'daughter',spouse_ids:[],spouse_order_ids:[],step_parent_ids:[]},
  {id:'inlawFather',full_name:'Cha của Nguyễn Văn A',gender:'male',level:1,spouse_ids:[],spouse_order_ids:[],step_parent_ids:[]},
  {id:'sibling',full_name:'Nguyễn Văn Đạt',gender:'male',level:2,mother_id:'gp1',father_id:'gp2',spouse_ids:[],spouse_order_ids:[],step_parent_ids:[]}
];
// Give the in-law a visible parent to prove collapse never walks upward.
people.find(x=>x.id==='inlaw').father_id='inlawFather';
ctx.fixture=people;
const collapsed=vm.runInContext("visiblePeopleForCollapse(fixture,new Set(['gp1|gp2']))",ctx);
const ids=new Set(Array.from(collapsed,x=>x.id));
assert.ok(ids.has('gp1')&&ids.has('gp2'),'Cha mẹ của nhánh vẫn phải hiển thị để có nút mở lại');
assert.ok(ids.has('inlawFather'),'Thu gọn nhánh không được đi ngược lên cha mẹ của Dâu/Rể');
assert.ok(!ids.has('daughter'),'Con trực tiếp phải bị ẩn');
assert.ok(!ids.has('inlaw'),'Dâu/Rể của con trực tiếp phải bị ẩn cùng nhánh');
assert.ok(!ids.has('stepchild'),'Con riêng của Dâu/Rể phải bị ẩn cùng nhánh');
assert.ok(!ids.has('grandchild'),'Con chung/hậu duệ phải bị ẩn cùng nhánh');
assert.ok(!ids.has('sibling'),'Mọi con trực tiếp của cặp cha mẹ trong family key phải bị ẩn');
const restored=vm.runInContext('visiblePeopleForCollapse(fixture,new Set())',ctx);
assert.equal(restored.length,people.length,'Mở nhánh phải phục hồi toàn bộ người trong nhánh');
assert.match(app,/hasVisibleDirectChild=fam\.children\.some\(child=>positions\.has\(child\.id\)\)/,'Không được để nút thu gọn treo cho một family có toàn bộ con đang bị ẩn bởi nhánh khác');

// The redundant mobile comment trigger in the header is gone; the floating FAB remains.
assert.doesNotMatch(index,/id="openCommentsBtn"/,'Không được còn nút Bình luận ở header mobile');
assert.match(index,/id="commentFab"/,'Phải giữ nút Bình luận nổi');
assert.match(app,/\$\('#openCommentsBtn'\)\?\.addEventListener/,'Binding nút header cũ phải optional để không lỗi JS');

// All public hero sections follow the tree page top rhythm.
assert.match(css,/\.hero,\.gallery-hero,\.contact-hero,\.contributions-hero\{padding-top:28px\}/);
assert.match(css,/@media\(max-width:700px\)[\s\S]*\.hero,\.gallery-hero,\.contact-hero,\.contributions-hero\{padding-top:18px\}/);
for(const html of [index,gallery,contact,contributions]) assert.match(html,/styles\.css\?v=1\.0\.32/,'Trang công khai phải dùng cache key v1.0.32');

// Mobile stats popup uses edge insets and must not keep the old translate(-50%) geometry.
assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.stats-panel\{[\s\S]*?left:max\(6px,env\(safe-area-inset-left\)\);right:max\(6px,env\(safe-area-inset-right\)\);[\s\S]*?top:max\(6px,env\(safe-area-inset-top\)\);bottom:max\(6px,env\(safe-area-inset-bottom\)\);[\s\S]*?width:auto;height:auto;max-width:none;max-height:none;[\s\S]*?transform:translateY\(12px\) scale\(\.985\)/);
assert.match(css,/\.stats-panel\.open\{transform:none\}/,'Popup thống kê mobile mở ra phải nằm đúng inset, không dịch nửa màn hình');
assert.match(css,/\.stats-person-list\{flex:1 1 auto;overflow:auto/,'Danh sách thống kê phải tự cuộn trong popup');
assert.match(css,/\.stats-pagination \.people-page-controls\{[^}]*overflow-x:auto/,'Phân trang thống kê phải thao tác được trên màn hình hẹp');

// Comment panel stays inside dynamic viewport/safe areas and its form remains reachable.
assert.match(css,/\.comment-panel\{max-height:calc\(100dvh - 104px\)\}/);
assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.comment-panel\{[\s\S]*?top:max\(6px,env\(safe-area-inset-top\)\);bottom:max\(66px,calc\(env\(safe-area-inset-bottom\) \+ 58px\)\);[\s\S]*?width:auto;height:auto;max-width:none;max-height:none/);
assert.match(css,/\.comment-list\{min-height:0;flex:1 1 auto/);
assert.match(css,/\.comment-form\{flex:0 0 auto/);

console.log('v1031-branch-mobile-public-regression: OK');
