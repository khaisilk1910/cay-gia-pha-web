'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');

const projectRoot=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(projectRoot,'public','app.js'),'utf8');
const html=fs.readFileSync(path.join(projectRoot,'public','index.html'),'utf8');
const styles=fs.readFileSync(path.join(projectRoot,'public','styles.css'),'utf8');

for(const id of ['statsSearch','statsPageInfo','statsPageInput','statsPageTotal','statsFirstPage','statsPrevPage','statsNextPage','statsLastPage']){
  assert.match(html,new RegExp(`id="${id}"`),`Thiếu điều khiển ${id} trong danh sách thống kê công khai`);
}
assert.match(styles,/\.stats-age-group\{display:grid;grid-auto-flow:column/,'Thống kê độ tuổi phải nằm trên một dòng riêng');
assert.match(app,/pageSize:100/,'Danh sách thống kê công khai phải cố định 100 cá thể / trang');
assert.match(app,/key==='age:unknown'\?statsPersonAlphaSort:statsPersonSort/,'Nhóm Không rõ phải sắp xếp theo tên A-Z');

const elements={};
for(const id of ['#statsPanelSummary','#statsPersonList','#statsPageInfo','#statsPageInput','#statsPageTotal','#statsFirstPage','#statsPrevPage','#statsNextPage','#statsLastPage']){
  elements[id]={textContent:'',innerHTML:'',value:'',max:'',disabled:false};
}
const context={
  console,URLSearchParams,location:{search:''},Intl,Date,
  window:{addEventListener:()=>{}},history:{},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,
  document:{documentElement:{style:{setProperty:()=>{}}},querySelector:(selector)=>elements[selector]||null,querySelectorAll:()=>[]},
};
vm.createContext(context); vm.runInContext(app,context);
const run=(code)=>vm.runInContext(code,context);

const unknown=[];
for(let i=205;i>=1;i--)unknown.push({id:`u${i}`,full_name:`Cá thể ${String(i).padStart(3,'0')}`,gender:i%2?'male':'female',birth_date:'',death_date:'',is_deceased:false,level:1});
const y=new Date().getFullYear();
const extra=[
  {id:'known-living',full_name:'Người biết tuổi',gender:'male',birth_date:String(y-30),death_date:'',is_deceased:false,level:1},
  {id:'unknown-death',full_name:'Người không rõ năm mất',gender:'male',birth_date:'1950',death_date:'',is_deceased:true,level:1},
  {id:'known-deceased',full_name:'Người thọ rõ',gender:'female',birth_date:'1940',death_date:'2020',is_deceased:true,level:1},
];
run(`state.people=${JSON.stringify([...unknown,...extra])}; state.statsList={key:'age:unknown',label:'Không rõ',query:'',page:2,pageSize:100}; renderStatsListPage();`);
assert.match(elements['#statsPageInfo'].textContent,/101–200 \/ 206 cá thể/,'Trang 2 phải hiển thị STT 101-200 trên toàn bộ nhóm Không rõ');
assert.equal(elements['#statsPageInput'].value,'2');
assert.equal(elements['#statsPrevPage'].disabled,false);
assert.equal(elements['#statsNextPage'].disabled,false);
assert.match(elements['#statsPersonList'].innerHTML,/stats-person-number">101</,'STT phải liên tục qua các trang');
assert.ok(elements['#statsPersonList'].innerHTML.indexOf('Cá thể 100')<elements['#statsPersonList'].innerHTML.indexOf('Cá thể 101'),'Nhóm Không rõ phải sắp xếp tên A-Z trước khi phân trang');

run(`state.statsList.query=normalizeStatsSearch('ca the 205'); state.statsList.page=3; renderStatsListPage();`);
assert.match(elements['#statsPageInfo'].textContent,/1–1 \/ 1 cá thể/,'Tìm kiếm theo tên phải lọc toàn bộ dữ liệu trước khi phân trang');
assert.equal(elements['#statsPageInput'].value,'1','Sau khi kết quả chỉ còn một trang phải chặn trang về 1');
assert.match(elements['#statsPersonList'].innerHTML,/Cá thể 205/,'Tìm kiếm phải không phân biệt dấu tiếng Việt');
assert.doesNotMatch(elements['#statsPersonList'].innerHTML,/Cá thể 204/);

assert.equal(run(`statsPeopleForKey('age:unknown').some(p=>p.id==='known-living')`),false,'Người còn sống có năm sinh phải có tuổi xác định');
assert.equal(run(`statsPeopleForKey('age:unknown').some(p=>p.id==='unknown-death')`),true,'Người đã mất có năm sinh nhưng thiếu năm mất phải vào nhóm Không rõ');
assert.equal(run(`statsPeopleForKey('age:unknown').some(p=>p.id==='known-deceased')`),false,'Người đã mất có đủ năm sinh/năm mất không được vào nhóm Không rõ');

console.log('public-stats-pagination-regression: OK');
