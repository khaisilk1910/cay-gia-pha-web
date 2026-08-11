'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');
const elements={
  '#peopleSearch':{value:''}, '#peoplePrivacy':{value:''}, '#peopleTable':{innerHTML:''},
  '#peoplePageInfo':{textContent:''}, '#peoplePageInput':{value:'',max:''},
  '#peopleFirstPage':{disabled:false}, '#peoplePrevPage':{disabled:false},
  '#peopleNextPage':{disabled:false}, '#peopleLastPage':{disabled:false},
  '#commentsTable':{innerHTML:''}, '#commentsPageInfo':{textContent:''}, '#commentsPageInput':{value:'',max:''},
  '#commentsFirstPage':{disabled:false}, '#commentsPrevPage':{disabled:false},
  '#commentsNextPage':{disabled:false}, '#commentsLastPage':{disabled:false},
};
const context={
  console, URL, FormData:class{}, setTimeout:()=>0, fetch:()=>Promise.resolve(), location:{},
  window:{addEventListener:()=>{}},
  document:{querySelector:(selector)=>elements[selector]||null,querySelectorAll:()=>[]},
};
vm.createContext(context);vm.runInContext(code,context);
const run=(expr)=>vm.runInContext(expr,context);
const people=[];
for(let i=1;i<=250;i++)people.push({
  id:`p${i}`,full_name:i===230?'Người Tìm Kiếm':`Người ${i}`,family_code:`I${String(i).padStart(3,'0')}`,
  birth_date:String(1900+(i%100)),gender:i%2?'male':'female',level:1,privacy_mode:'public',
  spouse_ids:[],divorced_spouse_ids:[],updated_at:'2026-08-07T00:00:00Z',is_deceased:false,
});
run(`S.people=${JSON.stringify(people)};S.auth={user:{role:'admin'}};S.peoplePage=3;renderPeople();`);
assert.match(elements['#peoplePageInfo'].textContent,/201–250 \/ 250/,'Trang 3 phải hiển thị bản ghi 201–250');
assert.match(elements['#peopleTable'].innerHTML,/<td class="row-number">201<\/td>/,'STT đầu trang 3 phải là 201');
assert.match(elements['#peopleTable'].innerHTML,/<td class="row-number">250<\/td>/,'STT cuối trang 3 phải là 250');
assert.equal(elements['#peopleNextPage'].disabled,true,'Trang cuối phải khóa nút Tiến');
assert.equal(elements['#peopleLastPage'].disabled,true,'Trang cuối phải khóa nút Cuối');

elements['#peopleSearch'].value='Tìm Kiếm';
run('S.peoplePage=1;renderPeople();');
assert.match(elements['#peoplePageInfo'].textContent,/1–1 \/ 1/,'Tìm kiếm toàn bộ 250 bản ghi phải trả đúng 1 kết quả');
assert.match(elements['#peopleTable'].innerHTML,/Người Tìm Kiếm/,'Kết quả ở vị trí 230 phải được tìm thấy dù không nằm trang 1 ban đầu');

run('setPeoplePage(999);');
assert.equal(run('S.peoplePage'),1,'Nhập trang vượt giới hạn sau lọc phải được chặn về trang hợp lệ');

const comments=[];
for(let i=1;i<=250;i++)comments.push({id:`c${i}`,display_name:`Khách ${i}`,message:`Bình luận ${i}`,created_at:'2026-08-07T00:00:00Z',deleted_at:null});
run(`S.comments=${JSON.stringify(comments)};S.commentsPage=3;renderComments();`);
assert.match(elements['#commentsPageInfo'].textContent,/201–250 \/ 250/,'Bình luận trang 3 phải hiển thị bản ghi 201–250');
assert.match(elements['#commentsTable'].innerHTML,/<td class="row-number">201<\/td>/,'STT bình luận đầu trang 3 phải là 201');
assert.match(elements['#commentsTable'].innerHTML,/<td class="row-number">250<\/td>/,'STT bình luận cuối trang 3 phải là 250');
assert.equal(elements['#commentsNextPage'].disabled,true,'Trang bình luận cuối phải khóa nút Tiến');
assert.equal(elements['#commentsLastPage'].disabled,true,'Trang bình luận cuối phải khóa nút Cuối');

console.log('admin-pagination-regression: OK');
