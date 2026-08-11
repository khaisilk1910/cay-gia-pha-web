'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');
const elements={
  '#personModalTitle':{textContent:''},
  '#personFormFields':{innerHTML:''},
  '#personLevel':null,
};
const context={
  console, URL, FormData:class{}, setTimeout:()=>0, fetch:()=>Promise.resolve(), location:{},
  window:{addEventListener:()=>{}},
  document:{querySelector:(selector)=>elements[selector]||null,querySelectorAll:()=>[]},
};
vm.createContext(context);vm.runInContext(code,context);
const run=(expr)=>vm.runInContext(expr,context);
run(`initRelationPickers=()=>{};openModal=()=>{};updateGenerationPreview=()=>{};S.people=[];`);

for(const mode of ['public','limited','private']){
  run(`S.settings={living_default_privacy:${JSON.stringify(mode)}};openPerson();`);
  const html=elements['#personFormFields'].innerHTML;
  const selected=[...html.matchAll(/<option value="(public|limited|private)" selected>/g)].map(m=>m[1]);
  assert.deepEqual(selected,[mode],`Thêm cá thể phải chọn mặc định ${mode} theo Cài đặt`);
}

run(`S.settings={living_default_privacy:'public'};S.people=[{id:'p1',privacy_mode:'limited',spouse_ids:[],divorced_spouse_ids:[],level:1,gender:'male'}];openPerson('p1');`);
assert.match(elements['#personFormFields'].innerHTML,/<option value="limited" selected>/,'Sửa cá thể phải giữ quyền riêng tư hiện có, không ghi đè bằng mặc định');
assert.doesNotMatch(elements['#personFormFields'].innerHTML,/<option value="public" selected>/,'Sửa cá thể limited không được tự chuyển sang public');

run(`S.settings={living_default_privacy:'unexpected'};S.people=[];openPerson();`);
assert.match(elements['#personFormFields'].innerHTML,/<option value="limited" selected>/,'Giá trị cài đặt không hợp lệ phải fallback an toàn về Giới hạn');

console.log('privacy-default-regression: OK');
