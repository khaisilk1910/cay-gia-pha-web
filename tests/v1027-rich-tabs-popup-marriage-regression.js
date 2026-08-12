'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const admin=read('public/admin.js'), app=read('public/app.js'), print=read('public/print.js'), publicUi=read('public/public-ui.js'), css=read('public/styles.css'), server=read('server.js'), dbSrc=read('lib/db.js');
const pkg=JSON.parse(read('package.json'));
assert.ok(/^1\.0\.(?:2[7-9]|[3-9]\d|\d{3,})$/.test(pkg.version),`expected version >= 1.0.27, got ${pkg.version}`);

// Settings are grouped by feature instead of one very long form.
for(const tab of ['tree','gallery','fund','contact','author','popup','brand','backup']){
  assert.ok(admin.includes(`settingsTabButton('${tab}'`),`missing settings tab ${tab}`);
  assert.ok(admin.includes(`settingsPanel('${tab}'`),`missing settings panel ${tab}`);
}
assert.match(css,/\.settings-tabs-wrap/);assert.match(css,/\.settings-tab-panel\.active/);

// Every Settings Rich Text field can insert an image and popup is configurable.
for(const id of ['treeSubtitleEditor','treeFooterEditor','galleryIntroEditor','galleryFooterEditor','fundSupportEditor','footerAuthorEditor','contactIntroEditor','contactFooterEditor','contactMapAddressEditor','welcomePopupEditor']){
  const re=new RegExp(`richEditorField\\('${id}'[\\s\\S]{0,500}?allowImage:true`);
  assert.match(admin,re,`${id} must allow image insertion`);
}
assert.match(admin,/id="set_welcome_popup_enabled"/);assert.match(admin,/Popup chào mừng/);
assert.match(server,/materializeRichImages/);assert.match(server,/UPLOAD_LAYOUT\.richtext/);
assert.match(publicUi,/function initWelcomePopup/);assert.match(css,/\.welcome-popup-card/);

// Uploaded logo becomes favicon on public pages and print page.
assert.match(publicUi,/icon\.href=href/);assert.match(print,/favicon\.href=state\.settings\.logo_url/);

// Rich Text blank lines must survive serialize -> DB -> re-edit; do not trim trailing newline.
assert.ok(!/while\(out\.length&&out\[out\.length-1\]\?\.type==='text'&&out\[out\.length-1\]\.text\.endsWith\('\\n'\)\)/.test(admin),'Rich editor must not trim trailing blank lines');
assert.match(admin,/Dòng trống được giữ nguyên sau khi lưu/);

const fakeStyle=el=>({fontWeight:el?.style?.fontWeight||'400',textDecorationLine:'',textDecoration:'',fontStyle:el?.style?.fontStyle||'normal',fontSize:el?.style?.fontSize||'16px',color:el?.style?.color||'rgb(68, 68, 68)',fontFamily:el?.style?.fontFamily||'Segoe UI',textAlign:el?.style?.textAlign||'left'});
const adminContext={console,URL,URLSearchParams,location:{reload:()=>{}},setTimeout:()=>0,clearTimeout:()=>{},fetch:()=>Promise.resolve(),confirm:()=>false,prompt:()=>'',window:{addEventListener:()=>{},scrollTo:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>({}),documentElement:{dataset:{}}},Node:{TEXT_NODE:3,ELEMENT_NODE:1},getComputedStyle:fakeStyle,FileReader:function(){},Intl};
vm.createContext(adminContext);vm.runInContext(admin,adminContext);
const text=value=>({nodeType:3,nodeValue:value});
const el=(tag,children=[],style={})=>({nodeType:1,tagName:tag,childNodes:children,style,dataset:{},querySelector:()=>null});
adminContext.blankEditor={dataset:{defaultAlign:'left'},childNodes:[el('DIV',[text('Dòng 1')]),el('DIV',[el('BR')]),el('DIV',[text('Dòng 3')]),el('DIV',[el('BR')])]};
const blankTokens=vm.runInContext('richEditorTokens(blankEditor,8000)',adminContext);
assert.equal(Array.from(blankTokens,t=>t.text||'').join(''),'Dòng 1\n\nDòng 3\n','Blank line and trailing Enter must be preserved');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1027-'));
const oldData=process.env.DATA_DIR;
try{
  process.env.DATA_DIR=path.join(tmp,'data');
  const {Store}=require(path.join(root,'lib','db.js'));
  const store=new Store();const actor=store.ensureAdmin('admin','Regression-Password-2027!',false);
  const content=JSON.stringify([{type:'text',text:'A\n\nB\n',bold:false,size:16,font:'system',align:'left'},{type:'image',image_path:'richtext/abcdef12-abcd-4abc-8abc-abcdef123456.png',alt:'Ảnh thông báo',width:66,align:'center'}]);
  store.updateSettings({welcome_popup_enabled:'1',welcome_popup_content:content},actor.id);
  const saved=JSON.parse(store.getSetting('welcome_popup_content'));
  assert.equal(saved[0].text,'A\n\nB\n');assert.equal(saved[1].type,'image');assert.equal(saved[1].image_path,'richtext/abcdef12-abcd-4abc-8abc-abcdef123456.png');
  store.db.close();
} finally {if(oldData===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldData;fs.rmSync(tmp,{recursive:true,force:true});}

// Previous spouse branches sit to the LEFT; last/current spouse sits to the RIGHT.
const appContext={console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{}}},CSS:{escape:s=>String(s)}};
vm.createContext(appContext);vm.runInContext(app,appContext);
const people=[
{id:'h',full_name:'Chồng',gender:'male',level:1,birth_order:1,spouse_ids:['w1','w2','w3'],spouse_order_ids:['w1','w2','w3'],divorced_spouse_ids:[]},
{id:'w1',full_name:'Vợ Cả',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
{id:'w2',full_name:'Vợ 2',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
{id:'w3',full_name:'Vợ 3',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
{id:'c1',full_name:'Con nhánh 1',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w1',spouse_ids:[],spouse_order_ids:[]},
{id:'c2',full_name:'Con nhánh 2',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w2',spouse_ids:[],spouse_order_ids:[]},
{id:'c3',full_name:'Con nhánh hiện tại',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w3',spouse_ids:[],spouse_order_ids:[]}
];
appContext.peopleFixture=people;
const layout=vm.runInContext('buildLayout(peopleFixture)',appContext);const cx=Object.fromEntries(Array.from(layout.nodes,n=>[n.person.id,n.cx]));
assert.ok(cx.w1<cx.w2&&cx.w2<cx.h&&cx.h<cx.w3,'previous spouses must be left of primary; current spouse right');
assert.ok(cx.c1<cx.c2&&cx.c2<cx.c3,'child branches must follow spouse order left-to-right');
assert.ok(cx.c2-cx.c1>200&&cx.c3-cx.c2>200,'marriage descendant groups need a clear horizontal safety gap');
assert.equal(Array.from(layout.paths).filter(p=>p.includes('spouse-multi')).length,3);
assert.match(app,/marriageGroupGap=260/);assert.match(print,/marriageGroupGap=260/);

console.log('v1027-rich-tabs-popup-marriage-regression: OK');
