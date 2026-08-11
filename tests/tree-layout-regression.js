'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const code=fs.readFileSync(require('node:path').join(__dirname,'..','public','app.js'),'utf8');
const context={
  console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},
  setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),
  window:{addEventListener:()=>{}},
  document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{}}},
  CSS:{escape:s=>String(s)},
};
vm.createContext(context);vm.runInContext(code,context);
const run=(expr)=>vm.runInContext(expr,context);
const defaults={spouse_ids:[],divorced_spouse_ids:[],privacy_mode:'public',is_deceased:false};
const person=(x)=>Object.assign({},defaults,x);

const family=[
  person({id:'f',full_name:'Nguyễn Văn Bố',gender:'male',level:1,birth_order:1,spouse_ids:['m']}),
  person({id:'m',full_name:'Trần Thị Mẹ',gender:'female',level:1,birth_order:1,spouse_ids:['f']}),
  person({id:'c1',full_name:'Con Một',gender:'male',level:2,birth_order:1,father_id:'f',mother_id:'m'}),
  person({id:'c2',full_name:'Con Hai',gender:'male',level:2,birth_order:2,father_id:'f',mother_id:'m'}),
  person({id:'c3',full_name:'Con Ba',gender:'female',level:2,birth_order:3,father_id:'f',mother_id:'m'}),
];
function layout(data){return run(`buildLayout(${JSON.stringify(data)})`)}
function centres(l){return Object.fromEntries(l.nodes.map(n=>[n.person.id,n.cx]))}
function siblingOrder(c){return ['c1','c2','c3'].slice().sort((a,b)=>c[a]-c[b])}
function pathNums(path){return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));}

// Adding an in-law must never change the fixed sibling ordering.
const before=layout(family); const beforeC=centres(before);
const withSpouse=family.map(x=>({...x,spouse_ids:[...(x.spouse_ids||[])]}));
withSpouse.find(x=>x.id==='c2').spouse_ids=['s2'];
withSpouse.push(person({id:'s2',full_name:'Vợ Con Hai',gender:'female',level:2,birth_order:99,spouse_ids:['c2']}));
const after=layout(withSpouse); const afterC=centres(after);
assert.deepEqual(siblingOrder(beforeC),['c1','c2','c3'],'Thứ tự con ban đầu sai');
assert.deepEqual(siblingOrder(afterC),['c1','c2','c3'],'Thêm phối ngẫu làm đổi thứ tự anh/chị/em');

// The spouse connector must cross the exact middle of the fixed 112px information
// card: node top + 68 + 112/2 = node top + 124.
const simple=layout(family.slice(0,2).concat([family[2]]));
const spousePath=simple.paths.find(p=>p.includes('relation-line spouse'));
const trunkPath=simple.paths.find(p=>p.includes('relation-line"') && / V /.test(p));
assert.ok(spousePath&&trunkPath,'Thiếu đường phối ngẫu hoặc đường con');
const spouseY=Number(spousePath.match(/M [\d.]+ ([\d.]+)/)[1]);
const parentTop=Math.min(...simple.nodes.filter(n=>['f','m'].includes(n.person.id)).map(n=>n.y));
assert.equal(spouseY,parentTop+124,'Đường vợ/chồng chưa nằm giữa khung thông tin');
const trunkStartY=Number(trunkPath.match(/M [\d.]+ ([\d.]+)/)[1]);
assert.equal(trunkStartY,spouseY,'Đường cha/mẹ-con không nối đúng vào đường phối ngẫu');
// Exactly one child without a spouse is vertically aligned; the two vertical path
// segments must meet at the same x/y rail point with no visible break.
const simpleRelationPaths=simple.paths.filter(p=>p.includes('relation-line\"') && / V /.test(p));
assert.ok(simpleRelationPaths.length>=2,'Một con đơn không có đủ hai đoạn dọc');
const simpleTrunkNums=pathNums(simpleRelationPaths[0]);
const simpleChildNums=pathNums(simpleRelationPaths[1]);
assert.equal(simpleTrunkNums[0],simpleChildNums[0],'Một con đơn bị lệch trục x giữa trunk và con');
assert.equal(simpleTrunkNums[2],simpleChildNums[1],'Một con đơn bị hở tại điểm rail');

// Regression: exactly one biological child who has a spouse. The biological child
// card sits on one side of its spouse unit, so sourceX differs from child.cx. A rail
// segment must connect those x coordinates instead of leaving two parallel lines.
const oneChildCouple=[
  person({id:'f',full_name:'Bố',gender:'male',level:1,birth_order:1,spouse_ids:['m']}),
  person({id:'m',full_name:'Mẹ',gender:'female',level:1,birth_order:1,spouse_ids:['f']}),
  person({id:'c',full_name:'Con ruột',gender:'male',level:2,birth_order:1,father_id:'f',mother_id:'m',spouse_ids:['w']}),
  person({id:'w',full_name:'Vợ của con',gender:'female',level:2,birth_order:99,spouse_ids:['c']}),
];
const one=layout(oneChildCouple);
const pos=Object.fromEntries(one.nodes.map(n=>[n.person.id,n]));
const sourceX=(pos.f.cx+pos.m.cx)/2;
const childX=pos.c.cx;
assert.notEqual(sourceX,childX,'Fixture phải tạo lệch tâm giữa bố mẹ và con ruột');
const horizontalRails=one.paths.filter(p=>p.includes('relation-line"') && / H /.test(p) && !p.includes('spouse'));
assert.ok(horizontalRails.length,'Một con duy nhất có vợ/chồng phải có rail nối ngang');
const connected=horizontalRails.some(p=>{
  const nums=pathNums(p); // M x1 y H x2
  const x1=nums[0],x2=nums[2];
  const lo=Math.min(x1,x2)-.11,hi=Math.max(x1,x2)+.11;
  return sourceX>=lo&&sourceX<=hi&&childX>=lo&&childX<=hi;
});
assert.ok(connected,'Rail một-con không nối từ tâm bố mẹ tới đúng con ruột');

// Relationship captions: blood-line member keeps Con thứ; in-laws show Vợ/Chồng.
const wifeHtml=run(`renderPersonNode({x:0,y:0,person:${JSON.stringify(person({id:'w',full_name:'Nguyễn Thị Dâu',gender:'female',level:2,birth_order:9}))},unit:{primary:{id:'c'}}})`);
assert.match(wifeHtml,/>Vợ</,'Dâu phải hiển thị nhãn Vợ');
assert.doesNotMatch(wifeHtml,/Con thứ 9/,'Dâu không được hiển thị Con thứ');
const husbandHtml=run(`renderPersonNode({x:0,y:0,person:${JSON.stringify(person({id:'h',full_name:'Trần Văn Rể',gender:'male',level:2,birth_order:9}))},unit:{primary:{id:'d'}}})`);
assert.match(husbandHtml,/>Chồng</,'Rể phải hiển thị nhãn Chồng');
assert.doesNotMatch(husbandHtml,/Con thứ 9/,'Rể không được hiển thị Con thứ');
const bloodHtml=run(`renderPersonNode({x:0,y:0,person:${JSON.stringify(person({id:'c',full_name:'Con ruột',gender:'male',level:2,birth_order:2}))},unit:{primary:{id:'c'}}})`);
assert.match(bloodHtml,/Con thứ 2/,'Người thuộc huyết hệ phải giữ Con thứ');

assert.equal(run(`ageText(${JSON.stringify(person({birth_date:'01/01/1920',death_date:'1978',is_deceased:true}))})`),'Thọ 58 tuổi');
const currentYear=new Date().getFullYear();
assert.equal(run(`ageText(${JSON.stringify(person({birth_date:String(currentYear-30)}))})`),'30 tuổi');
assert.equal(run(`ageText(${JSON.stringify(person({death_date:'2000',is_deceased:true}))})`),'');

const html=run(`renderPersonNode({x:0,y:0,person:${JSON.stringify(person({id:'d',full_name:'Đặng Thị Ánh',gender:'female',level:2,birth_order:2,birth_date:'1930',death_date:'2000',is_deceased:true}))},unit:{primary:{id:'d'}}})`);
assert.match(html,/Con thứ 2/);
assert.match(html,/Thọ 70 tuổi/);
assert.match(html,/candle\.svg/);
assert.match(html,/Đặng Thị Ánh/);

// v1.0.7: collapsing a parental family hides its direct children, their descendants,
// and ordinary in-law spouses, while leaving the parents visible. Re-expanding uses
// the untouched source array, so sibling order is identical to the original layout.
const collapseFamily=[
  person({id:'pf',full_name:'Cha',gender:'male',level:1,birth_order:1,spouse_ids:['pm']}),
  person({id:'pm',full_name:'Mẹ',gender:'female',level:1,birth_order:1,spouse_ids:['pf']}),
  person({id:'pc1',full_name:'Con 1',gender:'male',level:2,birth_order:1,father_id:'pf',mother_id:'pm',spouse_ids:['pw']}),
  person({id:'pw',full_name:'Vợ con 1',gender:'female',level:2,birth_order:99,spouse_ids:['pc1']}),
  person({id:'pc2',full_name:'Con 2',gender:'female',level:2,birth_order:2,father_id:'pf',mother_id:'pm'}),
  person({id:'pg',full_name:'Cháu',gender:'male',level:3,birth_order:1,father_id:'pc1',mother_id:'pw'}),
];
const collapsedVisible=run(`visiblePeopleForCollapse(${JSON.stringify(collapseFamily)},new Set(['pf|pm']))`);
assert.deepEqual(Array.from(collapsedVisible,x=>x.id).sort(),['pf','pm'],'Thu gọn bố/mẹ phải ẩn toàn bộ nhánh dưới và dâu/rể');
const expandedAgain=layout(collapseFamily);
const expandedCentres=centres(expandedAgain);
assert.ok(expandedCentres.pc1<expandedCentres.pc2,'Mở lại nhánh phải giữ nguyên thứ tự con');
const collapseLayout=layout(collapseFamily);
const toggleData=run(`buildFamilyToggles(${JSON.stringify(collapseFamily)},buildLayout(${JSON.stringify(collapseFamily)}).nodes,new Set())`);
const rootToggle=Array.from(toggleData).find(t=>t.key==='pf|pm');
assert.ok(rootToggle,'Gia đình có con phải có nút +/-');
assert.equal(rootToggle.childCount,2,'Nút +/- phải biết đúng số con trực tiếp');
const collapsedToggle=run(`buildFamilyToggles(${JSON.stringify(collapseFamily)},buildLayout(${JSON.stringify(collapsedVisible)}).nodes,new Set(['pf|pm']))`).find(t=>t.key==='pf|pm');
assert.ok(collapsedToggle?.collapsed,'Nút phải chuyển sang trạng thái + khi nhánh đang ẩn');

// Admin regression checks: richer people columns and centered notification layer.
const adminHtml=fs.readFileSync(require('node:path').join(__dirname,'..','public','admin.html'),'utf8');
const adminJs=fs.readFileSync(require('node:path').join(__dirname,'..','public','admin.js'),'utf8');
const css=fs.readFileSync(require('node:path').join(__dirname,'..','public','styles.css'),'utf8');
assert.match(adminHtml,/<th>Năm sinh<\/th>/,'Thiếu cột Năm sinh trong danh sách cá thể');
assert.match(adminHtml,/<th>Vợ \/ Chồng<\/th>/,'Thiếu cột Vợ / Chồng trong danh sách cá thể');
assert.match(adminJs,/spouse-cell-item/,'Danh sách cá thể chưa render tên vợ/chồng');
assert.match(css,/\.toast-stack\{position:fixed;inset:0;[^}]*align-items:center;justify-content:center/,'Thông báo quản trị chưa được căn chính giữa màn hình');
assert.match(css,/\.branch-toggle\{/,'Thiếu CSS cho nút thu gọn nhánh');

// v1.0.8: people table pagination is applied after global search/filtering.
assert.match(adminHtml,/<th>STT<\/th>/,'Thiếu cột số thứ tự trong bảng cá thể');
assert.match(adminHtml,/id="peopleFirstPage"/,'Thiếu nút nhảy trang đầu');
assert.match(adminHtml,/id="peoplePrevPage"/,'Thiếu nút lùi trang');
assert.match(adminHtml,/id="peopleNextPage"/,'Thiếu nút tiến trang');
assert.match(adminHtml,/id="peopleLastPage"/,'Thiếu nút nhảy trang cuối');
assert.match(adminHtml,/id="peoplePageInput"/,'Thiếu ô nhập số trang');
assert.match(adminJs,/peoplePageSize:100/,'Kích thước trang cá thể phải cố định 100');
assert.match(adminJs,/const rows=filteredPeople\(\);[^;]*totalPages/s,'Phân trang phải chạy trên kết quả đã tìm kiếm/lọc');
assert.match(adminJs,/rows\.slice\(start,start\+S\.peoplePageSize\)/,'Chưa cắt đúng 100 cá thể theo trang');
assert.match(adminJs,/start\+i\+1/,'STT chưa chạy liên tục theo vị trí kết quả');
assert.match(adminJs,/peopleSearch'\)\.addEventListener\('input',\(\)=>\{S\.peoplePage=1;renderPeople\(\);\}\)/,'Tìm kiếm phải về trang 1 và lọc toàn bộ dữ liệu');

// Public statistics expose male/female/living alongside existing totals.
assert.match(code,/s\.male\|\|0/,'Thiếu thống kê số nam trên trang công khai');
assert.match(code,/s\.female\|\|0/,'Thiếu thống kê số nữ trên trang công khai');
assert.match(code,/s\.living\|\|0/,'Thiếu thống kê số còn sống trên trang công khai');
const dbCode=fs.readFileSync(require('node:path').join(__dirname,'..','lib','db.js'),'utf8');
assert.match(dbCode,/male:rows\.filter\(\(p\)=>p\.gender==='male'\)\.length/,'Backend chưa tính số nam');
assert.match(dbCode,/female:rows\.filter\(\(p\)=>p\.gender==='female'\)\.length/,'Backend chưa tính số nữ');

// v1.0.9: all major admin lists use the same 100-row pagination controls.
for(const prefix of ['branches','comments','users','audit','recent']){
  for(const suffix of ['FirstPage','PrevPage','PageInput','NextPage','LastPage']) assert.match(adminHtml,new RegExp(`id="${prefix}${suffix}"`),`Thiếu điều hướng phân trang ${prefix}${suffix}`);
}
assert.match(adminJs,/adminPageSize:100/,'Các trang quản trị khác phải cố định 100 bản ghi / trang');
assert.match(adminJs,/simplePage\(S\.comments,'commentsPage'\)/,'Bình luận chưa dùng phân trang 100 bản ghi');
assert.match(adminJs,/simplePage\(S\.users,'usersPage'\)/,'Người dùng chưa dùng phân trang 100 bản ghi');
assert.match(adminJs,/simplePage\(S\.audit,'auditPage'\)/,'Nhật ký chưa dùng phân trang 100 bản ghi');
assert.match(adminJs,/id="personLevel" name="level" type="number"/,'Đời / thế hệ trong form cá thể chưa cho phép sửa');
assert.doesNotMatch(adminJs,/delete body\.level/,'Client vẫn đang xóa giá trị đời trước khi lưu');

// Public traffic statistics include live guest/member counts and persisted visit totals.
const publicHtml=fs.readFileSync(require('node:path').join(__dirname,'..','public','index.html'),'utf8');
assert.match(publicHtml,/id="trafficStats"/,'Trang công khai thiếu vùng thống kê truy cập');
assert.match(code,/\/api\/public\/traffic/,'Frontend chưa gọi API thống kê truy cập');
assert.match(code,/guests_online/,'Thiếu số khách đang truy cập');
assert.match(code,/users_online/,'Thiếu số user đang truy cập');
assert.match(code,/visits_today/,'Thiếu lượt truy cập trong ngày');
assert.match(code,/visits_month/,'Thiếu lượt truy cập trong tháng');
assert.match(code,/visits_total/,'Thiếu tổng lượt truy cập');
assert.match(dbCode,/CREATE TABLE IF NOT EXISTS page_visits/,'Backend chưa lưu lịch sử lượt truy cập');
assert.match(dbCode,/trafficStats\(onlineMinutes=5\)/,'Backend chưa tính số người đang truy cập');

console.log('tree-layout-regression: OK');
