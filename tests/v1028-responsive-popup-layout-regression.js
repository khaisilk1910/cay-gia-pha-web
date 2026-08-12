'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('public/app.js');
const print=read('public/print.js');
const publicUi=read('public/public-ui.js');
const admin=read('public/admin.js');
const css=read('public/styles.css');
const pkg=JSON.parse(read('package.json'));
assert.ok(/^1\.0\.(?:29|[3-9]\d|\d{3,})$/.test(pkg.version),`expected version >= 1.0.29, got ${pkg.version}`);

// Welcome popup: no confirmation button, close by backdrop/X/Escape, and lock background scroll.
assert.match(publicUi,/welcome-popup-backdrop[^']*data-welcome-close/);
assert.match(publicUi,/welcome-popup-close[^']*data-welcome-close/);
assert.match(publicUi,/if\(e\.key==='Escape'\)close\(\)/);
assert.ok(!publicUi.includes('Đã hiểu'),'welcome popup must not render the old confirmation button');
assert.ok(!publicUi.includes('welcome-popup-confirm'),'welcome popup confirmation control must be removed');
assert.match(publicUi,/document\.body\.classList\.add\('welcome-popup-open'\)/);
assert.match(publicUi,/document\.body\.classList\.remove\('welcome-popup-open'\)/);
assert.match(css,/\.welcome-popup-card\{[^}]*overflow-x:hidden;[^}]*overflow-y:auto/);
assert.match(css,/\.welcome-popup-content\{[^}]*overflow-wrap:anywhere;[^}]*word-break:break-word/);
assert.match(css,/\.welcome-popup-content \.public-rich-image img\{[^}]*max-width:100%!important/);

// Settings/public pages use the available browser width. Switching tabs must not jump the page.
assert.match(css,/\.site-header,main,\.gallery-main,\.contact-main,\.site-footer\{width:100%;max-width:none/);
assert.match(css,/\.admin-content\{width:100%;max-width:none/);
assert.match(css,/\.gallery-overview,\.gallery-album-view,\.gallery-video-overview,\.contact-section\{width:100%;max-width:none/);
assert.match(css,/\.settings-tabs-wrap\{top:68px/);
assert.match(css,/@media\(max-width:760px\)[\s\S]*\.settings-tabs-wrap\{top:58px/);
assert.match(css,/\.settings-tab-btn\{[^}]*min-height:34px;[^}]*font-size:10px/);
assert.ok(!admin.includes("window.scrollTo({top:0,behavior:'smooth'})"),'settings tabs must not force the document back to the top');
assert.match(admin,/aria-selected/);
assert.match(admin,/typeof strip\.scrollTo==='function'/);
assert.match(admin,/strip\.scrollLeft=left/);

function contextFor(src){
  const context={console,URLSearchParams,location:{search:'',href:'http://localhost/',pathname:'/'},history:{},setInterval:()=>0,clearInterval:()=>{},fetch:()=>Promise.resolve(),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{}}},CSS:{escape:s=>String(s)}};
  vm.createContext(context);vm.runInContext(src,context);return context;
}
const people=[
  {id:'h',full_name:'Người nội tộc',gender:'male',level:1,birth_order:1,spouse_ids:['w1','w2','w3'],spouse_order_ids:['w1','w2','w3'],divorced_spouse_ids:[]},
  {id:'w1',full_name:'Vợ cả',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
  {id:'w2',full_name:'Vợ 2',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
  {id:'w3',full_name:'Vợ hiện tại',gender:'female',level:1,spouse_ids:['h'],spouse_order_ids:['h']},
  {id:'a1',full_name:'Con A1',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w1',spouse_ids:[],spouse_order_ids:[]},
  {id:'a2',full_name:'Con A2',gender:'female',level:2,birth_order:2,father_id:'h',mother_id:'w1',spouse_ids:[],spouse_order_ids:[]},
  {id:'b1',full_name:'Con B1',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w2',spouse_ids:[],spouse_order_ids:[]},
  {id:'b2',full_name:'Con B2',gender:'female',level:2,birth_order:2,father_id:'h',mother_id:'w2',spouse_ids:[],spouse_order_ids:[]},
  {id:'c1',full_name:'Con C1',gender:'male',level:2,birth_order:1,father_id:'h',mother_id:'w3',spouse_ids:[],spouse_order_ids:[]},
  {id:'c2',full_name:'Con C2',gender:'female',level:2,birth_order:2,father_id:'h',mother_id:'w3',spouse_ids:[],spouse_order_ids:[]}
];
function layoutFrom(src,fixture){const c=contextFor(src);c.peopleFixture=fixture;return vm.runInContext('buildLayout(peopleFixture)',c);}
function pos(layout){return Object.fromEntries(Array.from(layout.nodes,n=>[n.person.id,n]));}
function midpoint(...values){return values.reduce((a,b)=>a+b,0)/values.length;}

for(const src of [app,print]){
  const layout=layoutFrom(src,people),p=pos(layout);
  assert.ok(p.w1.cx<p.w2.cx&&p.w2.cx<p.h.cx&&p.h.cx<p.w3.cx,'visible previous-marriage branches must flow left-to-right before the current couple');
  assert.ok(Math.abs(p.w1.cx-midpoint(p.a1.cx,p.a2.cx))<1,'first previous spouse must center over that marriage descendants');
  assert.ok(Math.abs(p.w2.cx-midpoint(p.b1.cx,p.b2.cx))<1,'second previous spouse must center over that marriage descendants');
  assert.ok(Math.abs(midpoint(p.h.cx,p.w3.cx)-midpoint(p.c1.cx,p.c2.cx))<1,'blood-line person + current spouse core must center over the current marriage descendants');
  assert.equal(Array.from(layout.paths).filter(x=>x.includes('spouse-detached')).length,2,'only previous spouses with visible descendants should use detached lanes');

  // Simulate the first marriage branch being collapsed: its spouse remains next to the blood-line person.
  const collapsed=people.filter(x=>!['a1','a2'].includes(x.id));
  const compact=pos(layoutFrom(src,collapsed));
  assert.ok(Math.abs(compact.h.cx-compact.w1.cx)<=218.1,'previous spouse with hidden/no visible descendants must stay next to the blood-line person');
  assert.ok(compact.w2.cx<compact.w1.cx,'another previous spouse with a visible branch may remain detached while the collapsed one returns to the core');
}

assert.match(app,/detachedMarriageAnchors/);
assert.match(print,/detachedMarriageAnchors/);
assert.match(app,/spouse-detached/);
assert.match(print,/spouse-detached/);

console.log('v1028-responsive-popup-layout-regression: OK');
