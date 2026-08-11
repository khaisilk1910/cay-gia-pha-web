'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const printHtml=fs.readFileSync(path.join(root,'public','print.html'),'utf8');
const printCss=fs.readFileSync(path.join(root,'public','print.css'),'utf8');
const printJs=fs.readFileSync(path.join(root,'public','print.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'public','admin.js'),'utf8');
const db=fs.readFileSync(path.join(root,'lib','db.js'),'utf8');

assert.match(index,/id="openPrint"/,'Trang công khai phải có nút In cây');
assert.match(app,/\/print\.html/,'Nút In cây phải mở trang in riêng');
assert.match(printHtml,/id="printBranch"/,'Trang in phải cho chọn toàn cây hoặc từng Chi');
assert.match(printHtml,/id="downloadSvg"/,'Trang in phải có tải SVG chất lượng cao');
assert.match(printHtml,/id="printNow"/,'Trang in phải có In\/Lưu PDF');
assert.match(printHtml,/id="printWidthCm"/,'Trang in phải cho nhập chiều rộng bạt');
assert.match(printJs,/buildPrintSvg/,'Trang in phải dựng một bản SVG độc lập');
assert.match(printJs,/shape-rendering="geometricPrecision"/,'SVG phải ưu tiên độ chính xác hình học');
assert.match(printJs,/text-rendering="geometricPrecision"/,'SVG phải ưu tiên chữ vector chất lượng cao');
assert.match(printJs,/data_base64|blobToDataUrl|embedImage/,'Ảnh đại diện phải được nhúng vào bản in để SVG tự chứa dữ liệu ảnh');
assert.doesNotMatch(printJs,/branch-toggle/,'Bản in không được tạo nút +/- ẩn hiện nhánh');
assert.match(printJs,/footer_author_text/,'Bản in phải đặt nội dung tác giả dưới cây');
assert.match(printJs,/age_bands/,'Bản in phải có thống kê tuổi như trang web');
assert.match(printCss,/@media print/,'Phải có CSS in chuyên dụng');
assert.match(printJs,/@page\{size:/,'Khổ giấy in phải được tạo theo kích thước bạt người dùng nhập');
assert.match(admin,/tất cả ảnh\/logo đã tải lên/,'Giao diện backup phải nói rõ ảnh được sao lưu');
assert.match(db,/requiredUploads/,'Restore phải kiểm tra đủ ảnh đang được dữ liệu tham chiếu');

const fakeEl=()=>({addEventListener(){},classList:{add(){},remove(){}},style:{setProperty(){}},setAttribute(){},appendChild(){},innerHTML:'',textContent:'',value:'',href:''});
const ctx={console,URL,URLSearchParams,location:{search:'',origin:'http://localhost',href:'http://localhost/print.html'},history:{replaceState(){}},window:{addEventListener(){}},document:{querySelector(){return fakeEl();},documentElement:{style:{setProperty(){}}},head:{appendChild(){}},createElement(){return fakeEl();}},Intl,Date,Map,Set,Blob,FileReader:function(){},fetch:async()=>({ok:false,json:async()=>({})})};
vm.createContext(ctx);vm.runInContext(printJs,ctx);
const people=[
 {id:'a',full_name:'Nguyễn Văn Gốc',gender:'male',level:1,birth_order:1,spouse_ids:['b'],divorced_spouse_ids:[],branch_ids:['chi-a'],birth_date:'1940',privacy_mode:'public'},
 {id:'b',full_name:'Trần Thị Vợ',gender:'female',level:1,birth_order:1,spouse_ids:['a'],divorced_spouse_ids:[],branch_ids:['chi-b'],birth_date:'1945',privacy_mode:'public'},
 {id:'c',full_name:'Nguyễn Văn Con',gender:'male',level:2,birth_order:1,father_id:'a',mother_id:'b',spouse_ids:[],divorced_spouse_ids:[],birth_date:'1970',privacy_mode:'public'}
];
vm.runInContext(`state.people=${JSON.stringify(people)};state.byId=new Map(state.people.map(p=>[p.id,p]));state.settings={tree_title:'Gia Phả',clan_name:'Tiến Tộc',tree_subtitle:'Dòng thứ nhất\\nDòng thứ hai',tree_title_font_size:'28',clan_name_font_size:'66',tree_font:'system',footer_author_text:'Tác giả: Nguyễn Văn A',footer_author_font:'georgia'};state.stats={total:3,male:2,female:1,living:3,deceased:0,generations:2,age_bands:[{min:80,max:null,total:1,living:1,deceased:0},{min:60,max:80,total:1,living:1,deceased:0},{min:40,max:60,total:0,living:0,deceased:0},{min:20,max:40,total:0,living:0,deceased:0},{min:16,max:20,total:0,living:0,deceased:0},{min:0,max:16,total:0,living:0,deceased:0}],age_unknown:{total:1,living:1,deceased:0}};state.physicalWidthCm=300;`,ctx);
const layout=vm.runInContext('buildLayout(state.people)',ctx);
assert.equal(layout.nodes.length,3,'Bản in phải đưa toàn bộ cá thể vào layout');
assert.ok(layout.paths.some(p=>p.includes('spouse cross-branch')),'Bản in phải giữ kiểu hôn phối khác Chi');
assert.ok(layout.paths.some(p=>p.includes('relation-line" d="M')),'Bản in phải giữ đường cha mẹ - con');
const result=vm.runInContext('buildPrintSvg()',ctx);
assert.ok(result.width>=1500,'Canvas in phải đủ rộng cho phần đầu và thống kê');
assert.ok(result.height>layout.height,'Bản in phải có đầu trang và phần dưới cây ngoài layout cây');
assert.match(result.svg,/width="300cm"/,'SVG phải mang kích thước vật lý người dùng chọn');
assert.match(result.svg,/Nguyễn Văn Gốc/,'SVG phải chứa tên cá thể');
assert.match(result.svg,/Tác giả: Nguyễn Văn A/,'SVG phải chứa tác giả dưới cây');
assert.match(result.svg,/80\+ tuổi/,'SVG phải chứa nhóm tuổi 80+');
assert.match(result.svg,/Không rõ/,'SVG phải chứa thống kê Không rõ');
assert.match(result.svg,/cross-branch/,'SVG phải giữ class đường hôn phối khác Chi');
assert.doesNotMatch(result.svg,/<button/i,'SVG bản in không được chứa nút giao diện');
assert.doesNotMatch(result.svg,/foreignObject/i,'SVG không dùng foreignObject để tăng khả năng tương thích nhà in');

console.log('print-export-regression: OK');
