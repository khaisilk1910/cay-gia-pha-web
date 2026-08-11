'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1024-'));
const previousDataDir=process.env.DATA_DIR;

try{
  // --- Database: ordered spouses, reciprocal relation and compact settings audit.
  process.env.DATA_DIR=path.join(tmp,'data');
  const {Store}=require(path.join(root,'lib','db.js'));
  const store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const husband=store.createPerson({full_name:'Nguyễn Văn Chồng',gender:'male',level:1,privacy_mode:'public'},admin.id);
  const wife1=store.createPerson({full_name:'Trần Thị Cả',gender:'female',level:1,is_deceased:true,death_date:'1990',privacy_mode:'public'},admin.id);
  const wife2=store.createPerson({full_name:'Lê Thị Hai',gender:'female',level:1,privacy_mode:'public'},admin.id);
  const wife3=store.createPerson({full_name:'Phạm Thị Ba',gender:'female',level:1,privacy_mode:'public'},admin.id);
  store.updatePerson(husband.id,{
    spouse_ids:[wife1.id,wife2.id,wife3.id],
    spouse_order_ids:[wife2.id,wife1.id,wife3.id],
    divorced_spouse_ids:[wife3.id]
  },admin.id);
  const saved=store.getPerson(husband.id);
  assert.deepEqual(saved.spouse_order_ids,[wife2.id,wife1.id,wife3.id],'Phải giữ đúng thứ tự hôn phối do admin đặt');
  for(const wife of [wife1,wife2,wife3]){
    const current=store.getPerson(wife.id);
    assert.ok(current.spouse_ids.includes(husband.id),'Quan hệ vợ/chồng phải đồng bộ hai chiều');
    assert.ok(current.spouse_order_ids.includes(husband.id),'Thứ tự hôn phối phía đối ứng phải không mất quan hệ');
  }

  const fundTokens=[
    {text:'Dòng thứ nhất\nDòng thứ hai',bold:false,italic:false,underline:false,strike:false,size:16,color:'#444444',font:'system',align:'left'},
    {text:'\nDòng thứ ba',bold:true,italic:false,underline:false,strike:false,size:16,color:'#444444',font:'system',align:'left'}
  ];
  store.updateSettings({fund_support_content:JSON.stringify(fundTokens),tree_title:'Gia Phả kiểm thử'},admin.id);
  const settings=store.settings();
  const savedFund=JSON.parse(settings.fund_support_content);
  assert.equal(savedFund.map(x=>x.text).join(''),'Dòng thứ nhất\nDòng thứ hai\nDòng thứ ba','Backend phải giữ nguyên xuống dòng Rich Text');
  const audit=store.listAudit(1)[0];
  assert.equal(audit.action,'settings.update');
  assert.match(audit.detail,/Đã sửa:/,'Nhật ký cài đặt phải mô tả nơi được sửa');
  assert.match(audit.detail,/Nội dung kêu gọi|Tiêu đề cây/,'Nhật ký phải nêu mục cài đặt đã thay đổi');
  assert.doesNotMatch(audit.detail,/\{"tree_title"|fund_support_content.*\[/,'Không được lưu toàn bộ JSON cài đặt vào Chi tiết');
  assert.ok(String(audit.detail).length<1000,'Chi tiết nhật ký cài đặt phải gọn');
  store.db.close();

  // --- Public tree: three wives get deterministic order, separate marriage lanes and child groups.
  const appCode=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
  const appContext={console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{}}},CSS:{escape:s=>String(s)}};
  vm.createContext(appContext);vm.runInContext(appCode,appContext);
  const runApp=(expr)=>vm.runInContext(expr,appContext);
  const people=[
    {id:'h',full_name:'Nguyễn Văn A',gender:'male',level:1,birth_order:1,spouse_ids:['w1','w2','w3'],spouse_order_ids:['w1','w2','w3'],divorced_spouse_ids:['w3'],privacy_mode:'public'},
    {id:'w1',full_name:'Vợ Cả',gender:'female',level:1,birth_order:99,spouse_ids:['h'],spouse_order_ids:['h'],divorced_spouse_ids:[],is_deceased:true,privacy_mode:'public'},
    {id:'w2',full_name:'Vợ Hai',gender:'female',level:1,birth_order:99,spouse_ids:['h'],spouse_order_ids:['h'],divorced_spouse_ids:[],privacy_mode:'public'},
    {id:'w3',full_name:'Vợ Ba',gender:'female',level:1,birth_order:99,spouse_ids:['h'],spouse_order_ids:['h'],divorced_spouse_ids:['h'],privacy_mode:'public'},
    {id:'c11',full_name:'Con Cả 1',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w1',spouse_ids:[],spouse_order_ids:[],divorced_spouse_ids:[],privacy_mode:'public'},
    {id:'c12',full_name:'Con Cả 2',gender:'female',level:2,birth_order:2,father_id:'h',mother_id:'w1',spouse_ids:[],spouse_order_ids:[],divorced_spouse_ids:[],privacy_mode:'public'},
    {id:'c21',full_name:'Con Hai',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w2',spouse_ids:[],spouse_order_ids:[],divorced_spouse_ids:[],privacy_mode:'public'},
    {id:'c31',full_name:'Con Ba',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w3',spouse_ids:[],spouse_order_ids:[],divorced_spouse_ids:[],privacy_mode:'public'}
  ];
  const layout=runApp(`buildLayout(${JSON.stringify(people)})`);
  const cx=Object.fromEntries(Array.from(layout.nodes,n=>[n.person.id,n.cx]));
  assert.ok(cx.h<cx.w1&&cx.w1<cx.w2&&cx.w2<cx.w3,'Vợ phải hiển thị đúng thứ tự Vợ cả → Vợ 2 → Vợ 3');
  const multiPaths=Array.from(layout.paths).filter(p=>p.includes('spouse-multi'));
  assert.equal(multiPaths.length,3,'Ba cuộc hôn nhân phải có ba làn đường riêng');
  assert.ok(multiPaths.every(p=>/ V .* H .* V /.test(p)),'Đường nhiều hôn phối phải đi xuống làn riêng thay vì xuyên qua thẻ người');
  assert.ok(Math.max(cx.c11,cx.c12)<cx.c21 && cx.c21<cx.c31,'Con phải được nhóm theo đúng người mẹ và thứ tự hôn phối');
  runApp(`state.people=${JSON.stringify(people)};state.byId=new Map(state.people.map(p=>[p.id,p]));`);
  const wife1Html=runApp(`renderPersonNode({x:0,y:0,person:state.byId.get('w1'),unit:{primary:state.byId.get('h')}})`);
  const wife2Html=runApp(`renderPersonNode({x:0,y:0,person:state.byId.get('w2'),unit:{primary:state.byId.get('h')}})`);
  const wife3Html=runApp(`renderPersonNode({x:0,y:0,person:state.byId.get('w3'),unit:{primary:state.byId.get('h')}})`);
  assert.match(wife1Html,/Vợ cả/); assert.match(wife2Html,/Vợ 2/); assert.match(wife3Html,/Vợ 3 · cũ/);

  const reordered=people.map(p=>p.id==='h'?{...p,spouse_order_ids:['w3','w1','w2']}:p);
  const layout2=runApp(`buildLayout(${JSON.stringify(reordered)})`); const cx2=Object.fromEntries(Array.from(layout2.nodes,n=>[n.person.id,n.cx]));
  assert.ok(cx2.h<cx2.w3&&cx2.w3<cx2.w1&&cx2.w1<cx2.w2,'Đổi thứ tự hôn phối phải đổi cả vị trí nhánh trên cây');
  assert.ok(cx2.c31<Math.min(cx2.c11,cx2.c12)&&Math.max(cx2.c11,cx2.c12)<cx2.c21,'Nhánh con phải di chuyển cùng thứ tự hôn phối');

  // --- Rich Text editor serialization: contenteditable DIV/P line breaks must survive save.
  const adminCode=fs.readFileSync(path.join(root,'public','admin.js'),'utf8');
  const fakeStyle=(el)=>({fontWeight:el?.style?.fontWeight||'400',textDecorationLine:el?.style?.textDecorationLine||'',textDecoration:'',fontStyle:el?.style?.fontStyle||'normal',fontSize:el?.style?.fontSize||'16px',color:el?.style?.color||'rgb(68, 68, 68)',fontFamily:el?.style?.fontFamily||'Segoe UI',textAlign:el?.style?.textAlign||'left'});
  const adminContext={console,URL,URLSearchParams,location:{reload:()=>{}},setTimeout:()=>0,clearTimeout:()=>{},fetch:()=>Promise.resolve(),confirm:()=>false,prompt:()=>'',window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>({}),documentElement:{dataset:{}}},Node:{TEXT_NODE:3,ELEMENT_NODE:1},getComputedStyle:fakeStyle,FileReader:function(){},Intl};
  vm.createContext(adminContext);vm.runInContext(adminCode,adminContext);
  const text=(value)=>({nodeType:3,nodeValue:value});
  const el=(tag,children=[],style={})=>({nodeType:1,tagName:tag,childNodes:children,style});
  adminContext.testEditor={dataset:{defaultAlign:'left'},childNodes:[text('Dòng 1'),el('DIV',[text('Dòng 2')]),el('DIV',[text('Dòng 3')]) ]};
  const rich=vm.runInContext('richEditorTokens(testEditor,4000)',adminContext);
  assert.equal(Array.from(rich,t=>t.text).join(''),'Dòng 1\nDòng 2\nDòng 3','Enter trong contenteditable phải được giữ thành đúng một xuống dòng');

  const adminJs=adminCode;
  assert.match(adminJs,/spouse_order_ids/,'Form quản trị phải gửi thứ tự hôn phối');
  assert.match(adminJs,/moveSpouseOrder/,'Form quản trị phải có nút sắp xếp hôn phối');
  assert.match(adminJs,/Thứ tự hôn phối/,'Form cá thể phải hiển thị khu vực sắp xếp vợ\/chồng');
  console.log('v1024-marriage-rich-audit-regression: OK');
} finally {
  if(previousDataDir===undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR=previousDataDir;
  fs.rmSync(tmp,{recursive:true,force:true});
}
