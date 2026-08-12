'use strict';

const state={settings:{},people:[],byId:new Map(),stats:{},branches:[],activeBranch:null,selectedBranch:new URLSearchParams(location.search).get('chi')||'',svg:'',canvasW:0,canvasH:0,physicalWidthCm:200,physicalHeightCm:0,imageCache:new Map()};
const $=s=>document.querySelector(s);
window.addEventListener('DOMContentLoaded',init);

async function init(){
  $('#printBranch').addEventListener('change',async e=>{state.selectedBranch=String(e.target.value||'');const u=new URL(location.href);if(state.selectedBranch)u.searchParams.set('chi',state.selectedBranch);else u.searchParams.delete('chi');history.replaceState(null,'',u.pathname+u.search);await loadTree();await renderPrint();});
  $('#printWidthCm').addEventListener('change',()=>{state.physicalWidthCm=clamp(Number($('#printWidthCm').value)||200,50,1000);$('#printWidthCm').value=String(state.physicalWidthCm);updatePhysicalSize();});
  $('#printWidthCm').addEventListener('input',()=>{const n=Number($('#printWidthCm').value);if(Number.isFinite(n)&&n>0){state.physicalWidthCm=clamp(n,50,1000);updatePhysicalSize();}});
  $('#downloadSvg').addEventListener('click',downloadSvg);
  $('#printNow').addEventListener('click',printNow);
  await loadTree();
  await renderPrint();
}

async function api(url){const r=await fetch(url,{headers:{Accept:'application/json'}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`Lỗi ${r.status}`);return d;}
async function loadTree(){
  showLoading('Đang tải dữ liệu cây gia phả…');
  const query=state.selectedBranch?`?branch=${encodeURIComponent(state.selectedBranch)}`:'';
  try{
    const d=await api('/api/public/tree'+query);
    state.settings=d.settings||{};state.people=d.people||[];state.byId=new Map(state.people.map(p=>[p.id,p]));state.stats=d.stats||{};state.branches=d.branches||[];state.activeBranch=d.active_branch||null;
    const favicon=document.querySelector('link[rel~="icon"]');if(favicon)favicon.href=state.settings.logo_url||'/assets/logo.png';
    if(state.selectedBranch&&!state.activeBranch){state.selectedBranch='';return loadTree();}
    renderBranchSelect();
    const clan=state.settings.clan_name||'Gia đình';const suffix=state.activeBranch?` · ${state.activeBranch.name}`:'';document.title=`Bản in ${clan}${suffix}`;
    const back=new URL('/',location.origin);if(state.selectedBranch)back.searchParams.set('chi',state.selectedBranch);$('#backToTree').href=back.pathname+back.search;
  }catch(e){showError(e.message||'Không tải được dữ liệu.');throw e;}
}
function renderBranchSelect(){const s=$('#printBranch');s.innerHTML=`<option value="">Toàn gia phả</option>`+state.branches.map(b=>`<option value="${attr(b.slug)}" ${state.activeBranch?.id===b.id?'selected':''}>${esc(b.name)} · ${Number(b.member_count)||0} người</option>`).join('');}

async function renderPrint(){
  if(!state.people.length){showError('Cây đang xem chưa có cá thể để in.');return;}
  showLoading('Đang dựng bản in và nhúng ảnh đại diện…');
  try{
    const imageUrls=new Set(['/assets/candle.svg']);
    for(const p of state.people){const gender=['male','female','other'].includes(p.gender)?p.gender:'other';imageUrls.add(p.image_url||`/assets/avatar-${gender==='other'?'placeholder':gender}.svg`);}
    await Promise.all([...imageUrls].map(u=>embedImage(u)));
    const result=buildPrintSvg();state.svg=result.svg;state.canvasW=result.width;state.canvasH=result.height;
    $('#printPreview').innerHTML=state.svg;$('#printLoading').classList.add('hidden');$('#printError').classList.add('hidden');updatePhysicalSize();
  }catch(e){console.error(e);showError(e.message||'Không dựng được bản in.');}
}

function buildPrintSvg(){
  const layout=buildLayout(state.people);const canvasW=Math.max(1500,Math.ceil(layout.width+80));const treeX=(canvasW-layout.width)/2;
  const titleSize=clamp(Number(state.settings.tree_title_font_size)||28,16,64);const clanSize=Math.max(titleSize+4,clamp(Number(state.settings.clan_name_font_size)||66,28,96));
  const treeFont=fontStackForKey(state.settings.tree_font);const authorFont=fontStackForKey(state.settings.footer_author_font);
  const treeTitle=state.settings.tree_title||'Gia Phả Gia Đình';const clan=state.settings.clan_name||'Gia đình';
  const subtitle=state.activeBranch?(state.activeBranch.description||`Nhánh bắt đầu từ ${state.activeBranch.root_name}.`):(state.settings.tree_subtitle||'');
  const subtitleLines=wrapMultiline(subtitle,92);let y=54;
  const defs=[];const body=[];
  body.push(`<rect x="0" y="0" width="${canvasW}" height="100%" fill="#fffdfa"/>`);
  body.push(`<circle cx="${canvasW/2-166}" cy="${y-4}" r="5" fill="#a9854a" opacity=".95"/><text x="${canvasW/2-152}" y="${y}" text-anchor="start" font-family="${attr(treeFont)}" font-size="12" font-weight="750" letter-spacing="2.2" fill="#8a7047">GÌN GIỮ KÝ ỨC · KẾT NỐI CÁC THẾ HỆ</text>`);y+=47;
  body.push(`<text x="${canvasW/2}" y="${y}" text-anchor="middle" font-family="${attr(treeFont)}" font-size="${titleSize}" font-weight="450" fill="#4f5552">${xml(treeTitle)}</text>`);y+=clanSize+8;
  body.push(`<text x="${canvasW/2}" y="${y}" text-anchor="middle" font-family="${attr(treeFont)}" font-size="${clanSize}" font-weight="700" letter-spacing="-1.5" fill="#1f2a2a">${xml(clan)}</text>`);y+=42;
  for(const line of subtitleLines){body.push(`<text x="${canvasW/2}" y="${y}" text-anchor="middle" font-family="${attr(treeFont)}" font-size="16" fill="#74736d">${xml(line)}</text>`);y+=27;}
  y+=21;
  const mainStats=[['♙',state.stats.total||0,'thành viên'],['♂',state.stats.male||0,'nam'],['♀',state.stats.female||0,'nữ'],['♡',state.stats.living||0,'còn sống'],['⌁',state.stats.generations||0,'thế hệ'],['✦',state.stats.deceased||0,'người đã mất']];
  body.push(renderPillRow(mainStats.map(([icon,n,label])=>({kind:'main',icon,n,label})),y,canvasW,treeFont));y+=54;
  const bands=state.stats.age_bands?.length?state.stats.age_bands:buildAgeBandsFromPeople();const unknown=state.stats.age_unknown||buildUnknownAgeStatsFromPeople();
  const ages=bands.map(b=>({kind:'age',label:b.max==null?`${b.min}+ tuổi`:`${b.min}–${b.max} tuổi`,n:b.total||0,detail:`${b.living||0} sống · ${b.deceased||0} mất`}));ages.push({kind:'age',label:'Không rõ',n:unknown.total||0,detail:`${unknown.living||0} sống · ${unknown.deceased||0} mất`,dashed:true});
  body.push(renderPillRow(ages,y,canvasW,treeFont));y+=66;
  const treeTop=y;
  const grayscale='<filter id="print-gray"><feColorMatrix type="matrix" values="0.28 0.28 0.28 0 0  0.28 0.28 0.28 0 0  0.28 0.28 0.28 0 0  0 0 0 1 0"/></filter>';defs.push(grayscale);
  body.push(`<g transform="translate(${round(treeX)} ${round(treeTop)})">`);
  body.push(`<g class="relations">${layout.paths.join('')}</g>`);
  layout.nodes.forEach((pos,index)=>body.push(renderSvgPerson(pos,index,defs,treeFont)));
  body.push('</g>');
  y=treeTop+layout.height+32;
  body.push(renderLegend(y,canvasW,treeFont));y+=55;
  const author=String(state.settings.footer_author_text||'').trim();
  if(author){const lines=wrapMultiline(author,120);y+=12;for(const line of lines){body.push(`<text x="${canvasW/2}" y="${y}" text-anchor="middle" font-family="${attr(authorFont)}" font-size="13" fill="#716b61">${xml(line)}</text>`);y+=22;}y+=18;}
  else y+=16;
  const canvasH=Math.ceil(y+24);
  const widthCm=clamp(Number(state.physicalWidthCm)||200,50,1000);const heightCm=widthCm*canvasH/canvasW;
  const style=`<style>text{dominant-baseline:alphabetic}.relation-line{fill:none;stroke:#a69c89;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.relation-line.spouse{stroke:#968974;stroke-width:1.5}.relation-line.divorced{stroke-dasharray:5 4;opacity:.72}.relation-line.adopted{stroke-dasharray:3 4}.relation-line.stepchild{stroke:#b88743;stroke-dasharray:7 4;stroke-width:1.6}.relation-line.cross-branch{stroke:#b07a35;stroke-width:1.8}.relation-line.divorced.cross-branch{stroke-dasharray:6 4}.print-name{font-weight:700;fill:#302e29}.print-meta{fill:#7a776f}.print-order{fill:#90764d;font-weight:650}</style>`;
  const metadata=`<metadata>Generated by Cây Gia Phả Web v1.0.35. Vector layout for large-format printing. Physical size ${round(widthCm)}cm × ${round(heightCm)}cm.</metadata>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${round(widthCm)}cm" height="${round(heightCm)}cm" viewBox="0 0 ${canvasW} ${canvasH}" role="img" aria-label="Bản in cây gia phả ${attr(clan)}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">${metadata}<defs>${style}${defs.join('')}</defs>${body.join('')}</svg>`;
  return {svg,width:canvasW,height:canvasH};
}

function renderPillRow(items,y,canvasW,font){const widths=items.map(i=>i.kind==='age'?190:Math.max(132,94+(String(i.label).length+String(i.n).length)*6.1));const gap=10;const total=widths.reduce((a,b)=>a+b,0)+gap*(items.length-1);let x=(canvasW-total)/2;const out=[];items.forEach((i,idx)=>{const w=widths[idx],h=i.kind==='age'?39:37;out.push(`<rect x="${round(x)}" y="${round(y-h/2)}" width="${round(w)}" height="${h}" rx="${h/2}" fill="#fff" fill-opacity=".72" stroke="#ded8cc" ${i.dashed?'stroke-dasharray="4 3"':''}/>`);if(i.kind==='main'){out.push(`<text x="${round(x+15)}" y="${round(y+4)}" font-family="${attr(font)}" font-size="13" fill="#777">${xml(i.icon)}</text><text x="${round(x+38)}" y="${round(y+4)}" font-family="${attr(font)}" font-size="13" font-weight="760" fill="#1f2a2a">${xml(i.n)}</text><text x="${round(x+82)}" y="${round(y+4)}" font-family="${attr(font)}" font-size="12" fill="#74736d">${xml(i.label)}</text>`);}else{out.push(`<text x="${round(x+13)}" y="${round(y+3)}" font-family="${attr(font)}" font-size="11" font-weight="700" fill="#665f54">${xml(i.label)}</text><text x="${round(x+79)}" y="${round(y+3)}" font-family="${attr(font)}" font-size="12" font-weight="760" fill="#1f2a2a">${xml(i.n)}</text><text x="${round(x+118)}" y="${round(y+3)}" font-family="${attr(font)}" font-size="8.5" fill="#918b80">${xml(i.detail)}</text>`);}x+=w+gap;});return out.join('');}

function renderSvgPerson(pos,index,defs,font){const p=pos.person;const gender=['male','female','other'].includes(p.gender)?p.gender:'other';const color=gender==='male'?'#567e96':gender==='female'?'#a97887':'#7b7295';const imgUrl=p.image_url||`/assets/avatar-${gender==='other'?'placeholder':gender}.svg`;const img=state.imageCache.get(imgUrl)||'';const x=pos.x,y=pos.y,cx=x+95;const cardY=y+68;const avatarY=y+38;const clipId=`avatar-${index}`;defs.push(`<clipPath id="${clipId}"><circle cx="${round(cx)}" cy="${round(avatarY)}" r="35"/></clipPath>`);const life=lifeText(p),age=ageText(p),order=relationshipCaption(pos);const nameLines=splitNameLines(p.full_name||'',22);const out=[];
  out.push(`<rect x="${round(x)}" y="${round(cardY)}" width="190" height="112" rx="22" fill="${p.is_deceased?'#fdfbf7':'#fffdfa'}" fill-opacity=".98" stroke="#d8d0bf"/>`);
  out.push(`<circle cx="${round(cx)}" cy="${round(avatarY)}" r="38.2" fill="#fff" stroke="${color}" stroke-width="1.2"/>`);
  if(img)out.push(`<image href="${attr(img)}" x="${round(cx-35)}" y="${round(avatarY-35)}" width="70" height="70" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" ${p.is_deceased?'filter="url(#print-gray)"':''}/>`);
  if((p.step_parent_ids||[]).length)out.push(`<circle cx="${round(x+55)}" cy="${round(y+16)}" r="11" fill="#fff" stroke="#d8b06d"/><text x="${round(x+55)}" y="${round(y+20)}" text-anchor="middle" font-family="${attr(font)}" font-size="9" font-weight="700" fill="#8b6330">R</text>`);if(p.is_adopted)out.push(`<circle cx="${round(x+31)}" cy="${round(y+16)}" r="11" fill="#fff" stroke="#e7e1d6"/><text x="${round(x+31)}" y="${round(y+20)}" text-anchor="middle" font-family="${attr(font)}" font-size="10" font-weight="700" fill="#876d40">A</text>`);
  if(p.privacy_mode&&p.privacy_mode!=='public')out.push(`<circle cx="${round(x+159)}" cy="${round(y+16)}" r="11" fill="#fff" stroke="#e7e1d6"/><text x="${round(x+159)}" y="${round(y+20)}" text-anchor="middle" font-family="${attr(font)}" font-size="9" fill="#666">🔒</text>`);
  if(p.is_deceased){const candle=state.imageCache.get('/assets/candle.svg');if(candle)out.push(`<image href="${attr(candle)}" x="${round(cx+24)}" y="${round(y+48)}" width="20" height="25"/>`);}
  let ty=cardY+21;if(order){out.push(`<text class="print-order" x="${round(cx)}" y="${round(ty)}" text-anchor="middle" font-family="${attr(font)}" font-size="9">${xml(order)}</text>`);ty+=16;}
  const nameY=ty+2;nameLines.forEach((line,i)=>out.push(`<text class="print-name" x="${round(cx)}" y="${round(nameY+i*17)}" text-anchor="middle" font-family="${attr(font)}" font-size="14">${xml(line)}</text>`));ty=nameY+nameLines.length*17+5;
  if(life){out.push(`<text class="print-meta" x="${round(cx)}" y="${round(ty)}" text-anchor="middle" font-family="${attr(font)}" font-size="9.5">${xml(truncate(life,34))}</text>`);ty+=14;}
  if(age)out.push(`<text class="print-meta" x="${round(cx)}" y="${round(ty)}" text-anchor="middle" font-family="${attr(font)}" font-size="9.5">${xml(age)}</text>`);
  return out.join('');}

function renderLegend(y,canvasW,font){const parts=[];if(state.people.some(p=>p.gender==='male'))parts.push({type:'dot',color:'#567e96',text:'Nam'});if(state.people.some(p=>p.gender==='female'))parts.push({type:'dot',color:'#a97887',text:'Nữ'});if(state.people.some(p=>p.gender==='other'))parts.push({type:'dot',color:'#7b7295',text:'Khác'});if(state.people.some(p=>p.father_id||p.mother_id))parts.push({type:'line',color:'#a69c89',text:'Cha/mẹ – con'});if(state.people.some(p=>p.is_adopted))parts.push({type:'dash',color:'#999',text:'Con nuôi'});if(state.people.some(p=>(p.step_parent_ids||[]).length))parts.push({type:'dash',color:'#b88743',text:'Con riêng'});if(state.people.some(p=>(p.divorced_spouse_ids||[]).length))parts.push({type:'dash',color:'#968974',text:'Đã ly hôn'});let cross=false;for(const p of state.people){for(const sid of p.spouse_ids||[]){const sp=state.byId.get(sid);if(sp&&crossBranchMarriage(p,sp)){cross=true;break;}}if(cross)break;}if(cross)parts.push({type:'line',color:'#b07a35',text:'Hôn phối khác Chi',wide:true});
  const gap=24;const widths=parts.map(p=>32+p.text.length*6.2);const total=widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,parts.length-1);let x=Math.max(50,(canvasW-total)/2);const out=[`<line x1="50" y1="${round(y-18)}" x2="${canvasW-50}" y2="${round(y-18)}" stroke="#e6dfd2"/>`];parts.forEach((p,i)=>{if(p.type==='dot')out.push(`<circle cx="${round(x+5)}" cy="${round(y)}" r="4.5" fill="${p.color}"/>`);else out.push(`<line x1="${round(x)}" y1="${round(y)}" x2="${round(x+18)}" y2="${round(y)}" stroke="${p.color}" stroke-width="${p.wide?2:1.3}" ${p.type==='dash'?'stroke-dasharray="4 3"':''}/>`);out.push(`<text x="${round(x+25)}" y="${round(y+4)}" font-family="${attr(font)}" font-size="10" fill="#777">${xml(p.text)}</text>`);x+=widths[i]+gap;});return out.join('');}

function orderedSpouseIds(person){const ids=[...new Set((person?.spouse_ids||[]).filter(Boolean))],preferred=[...new Set((person?.spouse_order_ids||[]).filter(id=>ids.includes(id)))];return[...preferred,...ids.filter(id=>!preferred.includes(id))];}
function spouseOrdinalLabel(primary,index,total){if(total<=1)return primary?.gender==='male'?'Vợ':primary?.gender==='female'?'Chồng':'Phối ngẫu';if(primary?.gender==='male')return index===0?'Vợ cả':`Vợ ${index+1}`;if(primary?.gender==='female')return`Chồng ${index+1}`;return`Phối ngẫu ${index+1}`;}
function childFamilyRank(parentUnit,childUnit){const memberIndex=new Map(parentUnit.members.map((m,i)=>[m.id,i]));const candidates=[childUnit.primary,...childUnit.members.filter(m=>m.id!==childUnit.primary.id)];for(const child of candidates){const idx=[child.father_id,child.mother_id].filter(id=>memberIndex.has(id)).map(id=>memberIndex.get(id));if(idx.length)return avg(idx);}return 9999;}
function buildLayout(people) {
  const nodeW=190,nodeH=184,spouseGap=28,unitGap=58,marriageGroupGap=260,marginX=100,marginY=72;
  const cardTop=68,cardH=112,spouseAnchorOffset=cardTop+cardH/2,multiLaneStep=12;
  const maxSpouses=Math.max(0,...people.map(p=>orderedSpouseIds(p).length));
  const rowGap=112+Math.max(0,maxSpouses-1)*multiLaneStep;
  const byId=new Map(people.map(p=>[p.id,p]));
  const levels=[...new Set(people.map(p=>Number(p.level)||1))].sort((a,b)=>a-b);
  const levelIndex=new Map(levels.map((v,i)=>[v,i]));
  const unitOf=new Map(); const units=[]; const unitsByLevel=new Map();

  // Build spouse-connected units. Marriage order is kept as metadata; the final
  // horizontal position is refined after descendant subtrees have been placed.
  for(const level of levels){
    const row=people.filter(p=>(Number(p.level)||1)===level);
    const visited=new Set(); const rowUnits=[];
    for(const seed of sortPeople(row)){
      if(visited.has(seed.id))continue;
      const members=[]; const queue=[seed.id];
      while(queue.length){
        const id=queue.shift(); if(visited.has(id))continue;
        const m=byId.get(id); if(!m || (Number(m.level)||1)!==level)continue;
        visited.add(id); members.push(m);
        for(const sid of m.spouse_ids||[]){const sp=byId.get(sid);if(sp&&(Number(sp.level)||1)===level&&!visited.has(sid))queue.push(sid);}
      }
      const lineageCandidates=members.filter(m=>[m.father_id,m.mother_id].some(pid=>byId.has(pid)&&(Number(byId.get(pid).level)||1)<level));
      const primary=sortPeople(lineageCandidates.length?lineageCandidates:members)[0];
      const directOrder=orderedSpouseIds(primary).filter(id=>members.some(m=>m.id===id));
      const spouseMap=new Map(members.map(m=>[m.id,m]));
      const previousIds=directOrder.slice(0,-1), currentId=directOrder.at(-1)||'';
      const extras=members.filter(m=>m.id!==primary.id&&!directOrder.includes(m.id)).sort((a,b)=>genderRank(a)-genderRank(b)||personSort(a,b));
      const ordered=[...previousIds.map(id=>spouseMap.get(id)).filter(Boolean),...extras,primary,...(currentId?[spouseMap.get(currentId)].filter(Boolean):[])];
      members.splice(0,members.length,...ordered);
      const ownWidth=members.length*nodeW+Math.max(0,members.length-1)*spouseGap;
      const u={id:`u:${primary.id}`,level,members,primary,ownWidth,width:ownWidth,children:[],parents:[],x:0,y:0,cx:0,layoutLeft:0};
      rowUnits.push(u);units.push(u);for(const m of members)unitOf.set(m.id,u);
    }
    unitsByLevel.set(level,rowUnits);
  }

  for(const u of units){
    const parentUnits=[];
    for(const m of u.members){for(const pid of [m.father_id,m.mother_id].filter(Boolean)){const pu=unitOf.get(pid);if(pu&&pu!==u&&(levelIndex.get(pu.level)??-1)<(levelIndex.get(u.level)??999)&&!parentUnits.includes(pu))parentUnits.push(pu);}}
    parentUnits.sort((a,b)=>(levelIndex.get(b.level)-levelIndex.get(a.level))||personSort(a.primary,b.primary));
    const parent=parentUnits[0]||null;if(parent){u.parents=[parent];parent.children.push(u);}
  }

  const unitSort=(a,b)=>personSort(a.primary,b.primary);
  for(const u of units)u.children.sort((a,b)=>childFamilyRank(u,a)-childFamilyRank(u,b)||unitSort(a,b));
  const childGap=(u,a,b)=>Math.abs(childFamilyRank(u,a)-childFamilyRank(u,b))>.2?marriageGroupGap:unitGap;

  const calcWidth=(u,seen=new Set())=>{
    if(seen.has(u.id))return u.ownWidth;seen.add(u.id);
    if(!u.children.length){u.width=u.ownWidth;return u.width;}
    const childrenWidth=u.children.reduce((sum,c,i)=>sum+calcWidth(c,new Set(seen))+(i?childGap(u,u.children[i-1],c):0),0);
    u.width=Math.max(u.ownWidth,childrenWidth);return u.width;
  };
  const roots=units.filter(u=>!u.parents.length).sort((a,b)=>(levelIndex.get(a.level)-levelIndex.get(b.level))||unitSort(a,b));
  roots.forEach(r=>calcWidth(r));

  const positions=new Map();
  const place=(u,left)=>{
    const childTotal=u.children.reduce((sum,c,i)=>sum+c.width+(i?childGap(u,u.children[i-1],c):0),0);
    const contentW=Math.max(u.ownWidth,childTotal||0),base=left+(u.width-contentW)/2;
    const ownLeft=base+(contentW-u.ownWidth)/2;
    u.layoutLeft=left;u.x=ownLeft;u.y=marginY+(levelIndex.get(u.level)||0)*(nodeH+rowGap);u.cx=left+u.width/2;
    u.members.forEach((m,i)=>{const px=ownLeft+i*(nodeW+spouseGap);positions.set(m.id,{x:px,y:u.y,cx:px+nodeW/2,cy:u.y+nodeH/2,bottom:u.y+nodeH,top:u.y,nodeW,nodeH,person:m,unit:u});});
    if(u.children.length){let childLeft=base+(contentW-childTotal)/2;for(let i=0;i<u.children.length;i++){const c=u.children[i];place(c,childLeft);childLeft+=c.width+(i<u.children.length-1?childGap(u,c,u.children[i+1]):0);}}
  };
  let cursor=marginX;for(const r of roots){place(r,cursor);cursor+=r.width+unitGap*1.5;}

  for(const level of levels){const row=unitsByLevel.get(level)||[],missing=row.filter(u=>!positions.has(u.primary.id)).sort(unitSort);if(!missing.length)continue;let x=Math.max(marginX,...[...positions.values()].filter(p=>(Number(p.person.level)||1)===level).map(p=>p.x+nodeW+unitGap));for(const u of missing){u.width=u.ownWidth;place(u,x);x+=u.width+unitGap;}}

  // A previous spouse with a visible descendant branch becomes a satellite card
  // centered above that marriage's descendants. Previous spouses whose branch is
  // empty/collapsed stay beside the blood-line person. The blood-line person and
  // current/last spouse form the core block, preferably centered over their branch.
  const detachedMarriageAnchors=new Map();
  const marriageChildUnits=(u,spouseId)=>u.children.filter(c=>c.members.some(m=>{const ids=[m.father_id,m.mother_id].filter(Boolean);return ids.includes(u.primary.id)&&ids.includes(spouseId);}));
  const childGroupCenter=children=>{const left=Math.min(...children.map(c=>c.layoutLeft)),right=Math.max(...children.map(c=>c.layoutLeft+c.width));return (left+right)/2;};
  for(const u of units){
    const directOrder=orderedSpouseIds(u.primary).filter(id=>u.members.some(m=>m.id===id));
    if(directOrder.length<2)continue;
    const currentId=directOrder.at(-1)||'';
    const detached=directOrder.slice(0,-1).map(id=>({id,children:marriageChildUnits(u,id)})).filter(x=>x.children.length);
    if(!detached.length)continue;
    const detachedIds=new Set(detached.map(x=>x.id));
    const coreMembers=u.members.filter(m=>!detachedIds.has(m.id));
    const currentChildren=currentId?marriageChildUnits(u,currentId):[];
    const coreTarget=currentChildren.length?childGroupCenter(currentChildren):(u.layoutLeft+u.width/2);
    const blocks=detached.map(x=>({ids:[x.id],width:nodeW,target:childGroupCenter(x.children),detachedId:x.id}));
    if(coreMembers.length)blocks.push({ids:coreMembers.map(m=>m.id),width:coreMembers.length*nodeW+Math.max(0,coreMembers.length-1)*spouseGap,target:coreTarget,detachedId:''});
    let blockCursor=u.layoutLeft;
    for(const block of blocks){block.left=Math.max(block.target-block.width/2,blockCursor);blockCursor=block.left+block.width+spouseGap;}
    const layoutRight=u.layoutLeft+u.width;
    let lastRight=blocks.at(-1).left+blocks.at(-1).width;
    if(lastRight>layoutRight){const shift=lastRight-layoutRight;for(const block of blocks)block.left-=shift;}
    let firstLeft=Math.min(...blocks.map(b=>b.left));
    if(firstLeft<u.layoutLeft){const shift=u.layoutLeft-firstLeft;for(const block of blocks)block.left+=shift;}
    for(const block of blocks){
      const orderedIds=u.members.map(m=>m.id).filter(id=>block.ids.includes(id));
      orderedIds.forEach((id,i)=>{const pos=positions.get(id);if(!pos)return;const px=block.left+i*(nodeW+spouseGap);pos.x=px;pos.cx=px+nodeW/2;});
      if(block.detachedId){const key=[u.primary.id,block.detachedId].sort().join('|');detachedMarriageAnchors.set(key,block.detachedId);}
    }
  }

  const minX=Math.min(...[...positions.values()].map(p=>p.x),0);if(minX<marginX){const d=marginX-minX;for(const pos of positions.values()){pos.x+=d;pos.cx+=d;}for(const u of units){u.x+=d;u.cx+=d;u.layoutLeft+=d;}}
  const maxX=Math.max(...[...positions.values()].map(p=>p.x+nodeW),600),maxY=Math.max(...[...positions.values()].map(p=>p.y+nodeH),400);
  const width=maxX+marginX,height=maxY+marginY+(maxSpouses>1?14+(maxSpouses-1)*multiLaneStep:0);const paths=[];

  const spouseEdges=[],drawn=new Set();
  for(const p of people){const a=positions.get(p.id);if(!a)continue;for(const sid of p.spouse_ids||[]){const b=positions.get(sid);if(!b)continue;const key=[p.id,sid].sort().join('|');if(drawn.has(key))continue;drawn.add(key);spouseEdges.push({key,p,sid,a,b,unitId:a.unit?.id||b.unit?.id||key});}}
  const marriageAnchors=new Map(),edgesByUnit=new Map();
  for(const edge of spouseEdges){if(!edgesByUnit.has(edge.unitId))edgesByUnit.set(edge.unitId,[]);edgesByUnit.get(edge.unitId).push(edge);}
  for(const edges of edgesByUnit.values()){
    edges.sort((e1,e2)=>{const unit=e1.a.unit||e1.b.unit;const idx=new Map((unit?.members||[]).map((m,i)=>[m.id,i]));const r1=avg([idx.get(e1.p.id)??999,idx.get(e1.sid)??999]),r2=avg([idx.get(e2.p.id)??999,idx.get(e2.sid)??999]);return r1-r2||e1.key.localeCompare(e2.key);});
    const multiple=edges.length>1;
    edges.forEach((edge,index)=>{
      const left=edge.a.cx<edge.b.cx?edge.a:edge.b,right=edge.a.cx<edge.b.cx?edge.b:edge.a;
      const spouse=byId.get(edge.sid),div=(edge.p.divorced_spouse_ids||[]).includes(edge.sid)||(spouse?.divorced_spouse_ids||[]).includes(edge.p.id),cross=crossBranchMarriage(edge.p,spouse);
      const cls=`relation-line spouse${div?' divorced':''}${cross?' cross-branch':''}`;
      const detachedId=detachedMarriageAnchors.get(edge.key),detachedPos=detachedId?positions.get(detachedId):null;
      if(!multiple){
        const y=Math.min(left.y,right.y)+spouseAnchorOffset;
        marriageAnchors.set(edge.key,{x:detachedPos?.cx??avg([left.cx,right.cx]),y});
        paths.push(`<path class="${cls}" d="M ${round(left.x+nodeW)} ${round(y)} H ${round(right.x)}"/>`);
      }else{
        // Multiple marriages use separate lanes below the cards. For a detached
        // previous spouse, descendants branch from that spouse's center rather
        // than the midpoint of a very long marriage connector.
        const laneY=Math.max(left.bottom,right.bottom)+14+index*multiLaneStep;
        marriageAnchors.set(edge.key,{x:detachedPos?.cx??avg([left.cx,right.cx]),y:laneY});
        paths.push(`<path class="${cls} spouse-multi${detachedPos?' spouse-detached':''}" d="M ${round(left.cx)} ${round(left.bottom-2)} V ${round(laneY)} H ${round(right.cx)} V ${round(right.bottom-2)}"/>`);
      }
    });
  }

  const families=new Map();
  for(const child of people){const parentIds=[child.father_id,child.mother_id].filter(pid=>positions.has(pid));if(!parentIds.length)continue;const key=parentIds.slice().sort().join('|');if(!families.has(key))families.set(key,{key,parentIds,children:[]});families.get(key).children.push(child);}
  for(const fam of families.values()){
    const parentPos=fam.parentIds.map(id=>positions.get(id)).filter(Boolean);if(!parentPos.length)continue;
    const childEntries=sortPeople(fam.children).map(child=>({child,pos:positions.get(child.id)})).filter(x=>x.pos);if(!childEntries.length)continue;
    const marriage=marriageAnchors.get(fam.key);const sourceX=marriage?.x??avg(parentPos.map(p=>p.cx));const sourceY=marriage?.y??(parentPos.length>=2?(Math.min(...parentPos.map(p=>p.y))+spouseAnchorOffset):Math.max(...parentPos.map(p=>p.bottom))+2);
    const targetY=Math.min(...childEntries.map(x=>x.pos.top)),railY=sourceY+(targetY-sourceY)*.48;
    paths.push(`<path class="relation-line" d="M ${round(sourceX)} ${round(sourceY)} V ${round(railY)}"/>`);
    const xs=childEntries.map(x=>x.pos.cx),railXs=[sourceX,...xs],railMin=Math.min(...railXs),railMax=Math.max(...railXs);if(Math.abs(railMax-railMin)>.05)paths.push(`<path class="relation-line" d="M ${round(railMin)} ${round(railY)} H ${round(railMax)}"/>`);
    for(const {child,pos} of childEntries)paths.push(`<path class="relation-line${child.is_adopted?' adopted':''}" d="M ${round(pos.cx)} ${round(railY)} V ${round(pos.top-2)}"/>`);
  }
  // Con riêng: step_parent_ids là cha/mẹ kế. Vẽ thêm một đường riêng biệt,
  // không thay đổi quan hệ cha/mẹ huyết thống và không dùng kiểu Con nuôi.
  for(const child of people){const childPos=positions.get(child.id);if(!childPos)continue;for(const stepId of child.step_parent_ids||[]){const stepPos=positions.get(stepId);if(!stepPos)continue;const bioIds=[child.father_id,child.mother_id].filter(Boolean);const bioId=bioIds.find(id=>(byId.get(stepId)?.spouse_ids||[]).includes(id));const marriageKey=bioId?[stepId,bioId].sort().join('|'):'';const anchor=marriageKey?marriageAnchors.get(marriageKey):null;const sx=anchor?.x??stepPos.cx,sy=anchor?.y??stepPos.bottom;const tx=childPos.cx+10,ty=childPos.top-2,mid=sy+(ty-sy)*.58;paths.push(`<path class="relation-line stepchild" d="M ${round(sx)} ${round(sy)} V ${round(mid)} H ${round(tx)} V ${round(ty)}"/>`);}}
  return {width,height,paths,nodes:[...positions.values()],familyAnchors:marriageAnchors};
}


function relationshipCaption(pos){const p=pos?.person||{},primaryId=pos?.unit?.primary?.id||'';if(primaryId&&p.id!==primaryId){const primary=state.byId.get(primaryId),former=(p.divorced_spouse_ids||[]).includes(primaryId)||(primary?.divorced_spouse_ids||[]).includes(p.id),order=orderedSpouseIds(primary),index=order.indexOf(p.id);if(index>=0&&order.length>1){const label=spouseOrdinalLabel(primary,index,order.length);return former?`${label} · cũ`:label;}if(p.gender==='female')return former?'Vợ cũ':'Vợ';if(p.gender==='male')return former?'Chồng cũ':'Chồng';return former?'Phối ngẫu cũ':'Phối ngẫu';}if(p.is_inlaw)return '';const n=Number(p.birth_order);return Number.isFinite(n)&&n>0?`Con thứ ${n}`:'';}
function lifeText(p){if(p.privacy_mode==='private')return'Thông tin riêng tư';const b=String(p.birth_date||'').trim(),d=String(p.death_date||'').trim();if(b&&d)return`${b} — ${d}`;if(b&&p.is_deceased)return`${b} — ?`;if(b)return`Sinh ${b}`;if(d)return`Mất ${d}`;return'';}
function ageText(p){if(p.privacy_mode==='private')return'';const age=personAgeYears(p);if(!Number.isFinite(age))return'';return(p.is_deceased||p.death_date)?`Thọ ${age} tuổi`:`${age} tuổi`;}
function personAgeYears(p){const hasAge=p?.age_years!==null&&p?.age_years!==undefined&&p?.age_years!=='';if(hasAge&&Number.isFinite(Number(p.age_years)))return Number(p.age_years);const birth=extractYear(p?.birth_date);if(!birth)return null;const end=(p?.is_deceased||p?.death_date)?extractYear(p?.death_date):new Date().getFullYear();if(!end||end<birth)return null;const age=end-birth;return age>=0&&age<=130?age:null;}
function buildAgeBandsFromPeople(){return[{min:80,max:null},{min:60,max:80},{min:40,max:60},{min:20,max:40},{min:16,max:20},{min:0,max:16}].map(({min,max})=>{const members=state.people.filter(p=>{const age=personAgeYears(p);return Number.isFinite(age)&&age>=min&&(max==null||age<max);});return{min,max,total:members.length,living:members.filter(p=>!p.is_deceased).length,deceased:members.filter(p=>p.is_deceased).length};});}
function buildUnknownAgeStatsFromPeople(){const members=state.people.filter(p=>!Number.isFinite(personAgeYears(p)));return{total:members.length,living:members.filter(p=>!p.is_deceased).length,deceased:members.filter(p=>p.is_deceased).length};}
function crossBranchMarriage(a,b){const aa=new Set(a?.branch_ids||[]),bb=new Set(b?.branch_ids||[]);if(!aa.size||!bb.size)return false;for(const id of aa)if(bb.has(id))return false;return true;}
function sortPeople(arr){return[...arr].sort(personSort);}function personSort(a,b){return(Number(a.birth_order)||999)-(Number(b.birth_order)||999)||(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.birth_date||'9999').localeCompare(String(b.birth_date||'9999'))||String(a.full_name||'').localeCompare(String(b.full_name||''),'vi');}function genderRank(p){return p.gender==='male'?0:p.gender==='female'?1:2;}
function splitNameLines(name,maxChars=22){const words=String(name||'').trim().split(/\s+/).filter(Boolean);if(!words.length)return[''];const lines=[];let cur='';for(const w of words){const next=cur?`${cur} ${w}`:w;if(next.length<=maxChars||!cur)cur=next;else{lines.push(cur);cur=w;if(lines.length===1)break;}}if(cur&&lines.length<2)lines.push(cur);const consumed=lines.join(' ').split(/\s+/).length;if(consumed<words.length)lines[lines.length-1]=truncate(lines[lines.length-1],maxChars-1)+'…';return lines.slice(0,2);}
function wrapMultiline(text,maxChars){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const line=raw.trim();if(!line){out.push('');continue;}let cur='';for(const word of line.split(/\s+/)){const next=cur?`${cur} ${word}`:word;if(next.length<=maxChars||!cur)cur=next;else{out.push(cur);cur=word;}}if(cur)out.push(cur);}return out.length?out:[''];}
function truncate(v,n){const s=String(v||'');return s.length>n?s.slice(0,Math.max(0,n-1))+'…':s;}
function extractYear(v){const m=String(v||'').match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})(?:\D|$)/);return m?Number(m[1]):null;}
const VI_FONT_STACKS={system:'ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',segoe:'"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',arial:'Arial,"Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',tahoma:'Tahoma,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',verdana:'Verdana,"Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',trebuchet:'"Trebuchet MS","Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',calibri:'Calibri,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',candara:'Candara,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',corbel:'Corbel,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',helvetica:'"Helvetica Neue",Helvetica,"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',roboto:'Roboto,"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',noto_sans:'"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',dejavu_sans:'"DejaVu Sans","Noto Sans","Liberation Sans",Arial,sans-serif',liberation_sans:'"Liberation Sans","Noto Sans","DejaVu Sans",Arial,sans-serif',times:'"Times New Roman","Noto Serif","DejaVu Serif","Liberation Serif",serif',cambria:'Cambria,"Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',palatino:'"Palatino Linotype","Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',noto_serif:'"Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',dejavu_serif:'"DejaVu Serif","Noto Serif","Liberation Serif","Times New Roman",serif',liberation_serif:'"Liberation Serif","Noto Serif","DejaVu Serif","Times New Roman",serif'};
function fontStackForKey(key){return VI_FONT_STACKS[String(key||'system')]||VI_FONT_STACKS.system;}
async function embedImage(url){if(state.imageCache.has(url))return state.imageCache.get(url);try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));const blob=await r.blob();const data=await blobToDataUrl(blob);state.imageCache.set(url,data);return data;}catch(e){console.warn('Không nhúng được ảnh',url,e);state.imageCache.set(url,'');return'';}}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Không đọc được ảnh.'));r.readAsDataURL(blob);});}
function updatePhysicalSize(){if(!state.canvasW||!state.canvasH)return;const widthCm=clamp(Number(state.physicalWidthCm)||200,50,1000),heightCm=widthCm*state.canvasH/state.canvasW;state.physicalWidthCm=widthCm;state.physicalHeightCm=heightCm;const info=$('#printSizeInfo');const big=widthCm>500||heightCm>500;info.textContent=`Khổ dự kiến ${fmt(widthCm)} × ${fmt(heightCm)} cm${big?' · Khuyên tải SVG để in bạt':''}`;document.documentElement.style.setProperty('--print-width-mm',`${widthCm*10}mm`);document.documentElement.style.setProperty('--print-height-mm',`${heightCm*10}mm`);let style=$('#dynamicPageStyle');if(!style){style=document.createElement('style');style.id='dynamicPageStyle';document.head.appendChild(style);}style.textContent=`@media print{@page{size:${widthCm*10}mm ${heightCm*10}mm;margin:0}}`;if(state.svg){const svg=$('#printPreview svg');if(svg){svg.setAttribute('width',`${round(widthCm)}cm`);svg.setAttribute('height',`${round(heightCm)}cm`);}}}
function downloadSvg(){if(!state.svg)return;const svg=$('#printPreview svg')?.outerHTML||state.svg;const blob=new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`],{type:'image/svg+xml;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);const clan=slug(state.settings.clan_name||'gia-pha'),branch=state.activeBranch?`-${slug(state.activeBranch.name)}`:'';a.download=`cay-gia-pha-${clan}${branch}-in-kho-lon.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
function printNow(){if(!state.svg)return;updatePhysicalSize();setTimeout(()=>window.print(),40);}
function showLoading(text){$('#printLoading').textContent=text;$('#printLoading').classList.remove('hidden');$('#printError').classList.add('hidden');$('#printPreview').innerHTML='';}
function showError(text){$('#printLoading').classList.add('hidden');$('#printError').textContent=text;$('#printError').classList.remove('hidden');}
function slug(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'gia-pha';}
function fmt(n){return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(n);}function avg(a){return a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);}function clamp(n,a,b){return Math.min(b,Math.max(a,n));}function round(n){return Math.round(Number(n)*10)/10;}function xml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}function attr(v){return esc(v);}
