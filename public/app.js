'use strict';
// Legacy v1.0.21 regression reference only; intentional blank Rich Text lines are preserved in v1.0.28.
// while(element.lastElementChild&&!element.lastElementChild.childNodes.length)element.lastElementChild.remove()

const state = {
  settings: {}, people: [], byId: new Map(), stats: {}, traffic: {}, comments: [], branches: [], activeBranch: null,
  zoom: .8, panX: 0, panY: 0, stageW: 900, stageH: 500,
  selectedGeneration: 'all', search: '', dragging: false, dragOrigin: null, dragStart:null, dragMoved:false, suppressClickUntil:0,
  auth: null, pollTimer: null, trafficTimer: null, selectedBranch: new URLSearchParams(location.search).get('chi') || '',
  collapsedFamilies: new Set(),
  statsList: { key:'', label:'', query:'', page:1, pageSize:100 },
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindUI();
  await loadAuth();
  await Promise.all([loadTree(), loadComments(), loadTraffic(true)]);
  renderAll();
  state.pollTimer = setInterval(loadComments, 9000);
  state.trafficTimer = setInterval(()=>loadTraffic(false), 30000);
}

function bindUI() {
  $('#zoomIn').addEventListener('click', () => setZoom(state.zoom + .1));
  $('#zoomOut').addEventListener('click', () => setZoom(state.zoom - .1));
  $('#zoomReset').addEventListener('click', () => { state.zoom=.8; fitTree(); });
  $('#fitTree').addEventListener('click', fitTree);
  $('#openPrint')?.addEventListener('click',()=>{const u=new URL('/print.html',location.origin);if(state.selectedBranch)u.searchParams.set('chi',state.selectedBranch);window.open(u.pathname+u.search,'_blank','noopener');});
  $('#treeSearch').addEventListener('input', e => { state.search=e.target.value.trim().toLocaleLowerCase('vi'); applyFilters(); });
  $('#branchSelect').addEventListener('change', e => switchBranch(e.target.value));
  document.addEventListener('keydown', e => {
    if (e.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); $('#treeSearch').focus(); }
    if (e.key==='Escape') { closeDetail(); closeComments(); closeStatsList(); }
  });
  const viewport=$('#treeViewport');
  viewport.addEventListener('pointerdown', e => {
    if (e.button!==0 || e.target.closest('.branch-toggle')) return;
    // Chuột vẫn ưu tiên click thẻ cá thể; cảm ứng có thể bắt đầu kéo ngay trên thẻ.
    if(e.pointerType!=='touch' && e.target.closest('.person-node')) return;
    state.dragging=true; state.dragMoved=false; state.dragStart={x:e.clientX,y:e.clientY}; state.dragOrigin={x:e.clientX-state.panX,y:e.clientY-state.panY}; viewport.classList.add('dragging'); $('#treeStage').classList.add('drag-immediate');
    try{viewport.setPointerCapture(e.pointerId);}catch{}
  });
  viewport.addEventListener('pointermove', e => { if(!state.dragging)return; const dx=e.clientX-state.dragStart.x,dy=e.clientY-state.dragStart.y;if(Math.hypot(dx,dy)>5)state.dragMoved=true; state.panX=e.clientX-state.dragOrigin.x; state.panY=e.clientY-state.dragOrigin.y; applyTransform(); });
  const stopDrag=e=>{ if(!state.dragging)return; if(state.dragMoved)state.suppressClickUntil=Date.now()+350; state.dragging=false; viewport.classList.remove('dragging'); $('#treeStage').classList.remove('drag-immediate'); try{viewport.releasePointerCapture(e.pointerId);}catch{} };
  viewport.addEventListener('pointerup',stopDrag); viewport.addEventListener('pointercancel',stopDrag);
  viewport.addEventListener('wheel', e => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    e.preventDefault();
    const rect=viewport.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const worldX=(mx-state.panX)/state.zoom, worldY=(my-state.panY)/state.zoom;
    const next=clamp(state.zoom + (e.deltaY<0?.07:-.07),.45,1.55);
    state.panX=mx-worldX*next; state.panY=my-worldY*next; state.zoom=next; applyTransform(); updateZoomLabel();
  },{passive:false});

  $('#closeDetail').addEventListener('click',closeDetail); $('#panelBackdrop').addEventListener('click',closeDetail);
  $('#commentFab').addEventListener('click',openComments); $('#openCommentsBtn')?.addEventListener('click',openComments); $('#closeComments').addEventListener('click',closeComments);
  $('#commentForm').addEventListener('submit', submitComment);
  $('#statsRow').addEventListener('click',e=>{const b=e.target.closest('[data-stat-key]');if(b)openStatsList(b.dataset.statKey,b.dataset.statLabel||'Thành viên');});
  $('#closeStats').addEventListener('click',closeStatsList); $('#statsBackdrop').addEventListener('click',closeStatsList);
  $('#statsPersonList').addEventListener('click',e=>{const b=e.target.closest('[data-stats-person]');if(!b)return;closeStatsList();openDetail(b.dataset.statsPerson);});
  $('#statsSearch').addEventListener('input',e=>{state.statsList.query=normalizeStatsSearch(e.target.value);state.statsList.page=1;renderStatsListPage();});
  $('#statsFirstPage').addEventListener('click',()=>setStatsPage(1));
  $('#statsPrevPage').addEventListener('click',()=>setStatsPage(state.statsList.page-1));
  $('#statsNextPage').addEventListener('click',()=>setStatsPage(state.statsList.page+1));
  $('#statsLastPage').addEventListener('click',()=>setStatsPage(statsListTotalPages()));
  $('#statsPageInput').addEventListener('change',e=>setStatsPage(e.target.value));
  $('#statsPageInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setStatsPage(e.target.value);}});
}

async function api(url, options={}) {
  const res = await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data={}; try{data=await res.json();}catch{}
  if(!res.ok) throw new Error(data.error||`Lỗi ${res.status}`); return data;
}
async function loadTree() {
  try {
    const query=state.selectedBranch?`?branch=${encodeURIComponent(state.selectedBranch)}`:'';
    const d=await api('/api/public/tree'+query);
    state.settings=d.settings||{}; state.people=d.people||[]; state.byId=new Map(state.people.map(p=>[p.id,p])); state.stats=d.stats||{};
    state.branches=d.branches||[]; state.activeBranch=d.active_branch||null;
    if(state.selectedBranch && !state.activeBranch) state.selectedBranch='';
  } catch(e){
    console.error(e);
    if(state.selectedBranch){ state.selectedBranch=''; history.replaceState(null,'',location.pathname); return loadTree(); }
  }
}
async function switchBranch(slug){
  state.selectedBranch=String(slug||''); state.selectedGeneration='all'; state.search=''; state.collapsedFamilies.clear();
  if($('#treeSearch')) $('#treeSearch').value='';
  const u=new URL(location.href); if(state.selectedBranch)u.searchParams.set('chi',state.selectedBranch);else u.searchParams.delete('chi');
  history.pushState(null,'',u.pathname+u.search+u.hash);
  closeDetail(); await loadTree(); renderAll();
}
window.addEventListener('popstate',async()=>{state.selectedBranch=new URLSearchParams(location.search).get('chi')||'';state.collapsedFamilies.clear();await loadTree();renderAll();});
async function loadTraffic(record=false) { try { const d=await api(`/api/public/traffic${record?'?record=1':''}`); state.traffic=d.traffic||{}; renderTraffic(); } catch(e){ console.error(e); } }
async function loadComments() { try { const d=await api('/api/public/comments'); state.comments=d.comments||[]; renderComments(); } catch(e){ console.error(e); } }
async function loadAuth() {
  try {
    state.auth=await api('/api/auth/me');
    const wrap=$('#commentNameWrap');
    const input=$('#commentName');
    const signedIn=!!state.auth?.authenticated;
    if(wrap) wrap.classList.toggle('hidden',signedIn);
    // Hidden required inputs still participate in browser form validation.
    // Disable the name field for signed-in users because their account name is used instead.
    if(input){ input.disabled=signedIn; input.required=!signedIn; }
  } catch{}
}

function renderAll() {
  const branchSuffix=state.activeBranch?` · ${state.activeBranch.name}`:'';
  applyTreeFont(state.settings.tree_font); applyHeadingSettings();
  const clan=state.settings.clan_name||'Gia đình';
  document.title = `${clan}${branchSuffix} · Gia phả`;
  $('#treeTitle').textContent=state.settings.tree_title||'Gia Phả Gia Đình';
  $('#heroClanName').textContent=clan;
  if(state.activeBranch){const sub=$('#treeSubtitle');sub.textContent=state.activeBranch.description||`Nhánh bắt đầu từ ${state.activeBranch.root_name}.`;sub.style.textAlign='center';}else renderRichText($('#treeSubtitle'),state.settings.tree_subtitle_content,state.settings.tree_subtitle||'',{size:16,align:'center'});
  $('#clanName').textContent=clan;
  renderBrandAndFooter(); renderBranchSelector(); renderStats(); renderTraffic(); renderGenerationFilter(); renderTree(); renderLegend(); renderComments();
}
function applyHeadingSettings(){
  const title=Math.min(64,Math.max(16,Number(state.settings.tree_title_font_size)||28));
  const clan=Math.min(96,Math.max(title+4,Number(state.settings.clan_name_font_size)||66));
  document.documentElement.style.setProperty('--hero-title-size',`${title}px`);
  document.documentElement.style.setProperty('--hero-clan-size',`${clan}px`);
}

const VI_FONT_STACKS={system:'ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',segoe:'"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',arial:'Arial,"Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',tahoma:'Tahoma,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',verdana:'Verdana,"Noto Sans","DejaVu Sans","Liberation Sans",sans-serif',trebuchet:'"Trebuchet MS","Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',calibri:'Calibri,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',candara:'Candara,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',corbel:'Corbel,"Segoe UI","Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',helvetica:'"Helvetica Neue",Helvetica,"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',roboto:'Roboto,"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',noto_sans:'"Noto Sans","DejaVu Sans","Liberation Sans",Arial,sans-serif',dejavu_sans:'"DejaVu Sans","Noto Sans","Liberation Sans",Arial,sans-serif',liberation_sans:'"Liberation Sans","Noto Sans","DejaVu Sans",Arial,sans-serif',times:'"Times New Roman","Noto Serif","DejaVu Serif","Liberation Serif",serif',cambria:'Cambria,"Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',palatino:'"Palatino Linotype","Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',noto_serif:'"Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif',dejavu_serif:'"DejaVu Serif","Noto Serif","Liberation Serif","Times New Roman",serif',liberation_serif:'"Liberation Serif","Noto Serif","DejaVu Serif","Times New Roman",serif'};
function fontStackForKey(key){return VI_FONT_STACKS[String(key||'system')]||VI_FONT_STACKS.system;}
const PUBLIC_RICH_SIZES=new Set([10,12,14,16,18,20,24,28,32,36,42,48,56,64]);
const PUBLIC_RICH_FONTS=new Set(['system','segoe','arial','tahoma','verdana','trebuchet','calibri','candara','corbel','helvetica','roboto','noto_sans','dejavu_sans','liberation_sans','times','cambria','palatino','noto_serif','dejavu_serif','liberation_serif']);
const PUBLIC_RICH_ALIGNS=new Set(['left','center','right','justify']);
function parsePublicRichTokens(value,fallback='',defaultSize=16,defaultAlign='left'){if(window.GiaPhaPublicUI?.parseRich)return window.GiaPhaPublicUI.parseRich(value,fallback,defaultSize,defaultAlign);let data=[];try{data=JSON.parse(String(value||'[]'));}catch{}return Array.isArray(data)?data:[];}
function publicFundSupportTokens(value){return parsePublicRichTokens(value,'',16,'left');}
function renderRichText(element,value,fallback='',options={}){if(window.GiaPhaPublicUI?.renderRich)return window.GiaPhaPublicUI.renderRich(element,value,fallback,options);if(!element)return false;const token={text:String(fallback||'')};element.replaceChildren();if(!token.text)return false;const span=document.createElement('span');span.textContent=token.text;element.appendChild(span);return true;}
function renderFundSupport(){const section=$('#fundSupport');if(!section)return;const tokens=publicFundSupportTokens(state.settings.fund_support_content);const qrUrl=String(state.settings.fund_support_qr_url||'').trim();const enabled=String(state.settings.fund_support_enabled||'0')==='1';const show=enabled&&!!(qrUrl||tokens.length);section.classList.toggle('hidden',!show);if(!show)return;const content=$('#fundSupportContent');if(content){renderRichText(content,state.settings.fund_support_content,'',{size:16,align:'left'});content.classList.toggle('hidden',!tokens.length);}const wrap=$('#fundSupportQrWrap'),img=$('#fundSupportQr');section.classList.toggle('no-qr',!qrUrl);if(wrap&&img){wrap.classList.toggle('hidden',!qrUrl);if(qrUrl){img.onerror=()=>{wrap.classList.add('hidden');section.classList.add('no-qr');};img.onload=()=>{wrap.classList.remove('hidden');section.classList.remove('no-qr');};img.src=qrUrl;}}}
function renderBrandAndFooter(){window.GiaPhaPublicUI?.applyBranding?.(state.settings);window.GiaPhaPublicUI?.initWelcomePopup?.(state.settings);const logo=$('#brandLogo');if(logo){logo.onerror=()=>{logo.onerror=null;logo.src='/assets/logo.png';};logo.src=state.settings.logo_url||'/assets/logo.png';}renderFundSupport();const clan=state.settings.clan_name||'Gia đình';renderRichText($('#treeFooterContent'),state.settings.tree_footer_content,`${clan} · Dữ liệu gia đình được trình bày với ưu tiên quyền riêng tư.`,{size:14,align:'center'});const author=$('#footerAuthor');if(author){const has=renderRichText(author,state.settings.footer_author_content,state.settings.footer_author_text||'',{size:14,align:'center'});author.classList.toggle('hidden',!has);}}
function crossBranchMarriage(a,b){const aa=new Set(a?.branch_ids||[]),bb=new Set(b?.branch_ids||[]);if(!aa.size||!bb.size)return false;for(const id of aa)if(bb.has(id))return false;return true;}
function renderLegend(){const host=$('#treeLegend');if(!host)return;const parts=[];if(state.people.some(p=>p.gender==='male'))parts.push('<span><i class="legend-dot male"></i> Nam</span>');if(state.people.some(p=>p.gender==='female'))parts.push('<span><i class="legend-dot female"></i> Nữ</span>');if(state.people.some(p=>p.gender==='other'))parts.push('<span><i class="legend-dot other"></i> Khác</span>');if(state.people.some(p=>p.father_id||p.mother_id))parts.push('<span><i class="legend-line parent"></i> Cha/mẹ – con</span>');if(state.people.some(p=>p.is_adopted))parts.push('<span><i class="legend-line adopted"></i> Con nuôi</span>');if(state.people.some(p=>(p.step_parent_ids||[]).length))parts.push('<span><i class="legend-line stepchild"></i> Con riêng</span>');if(state.people.some(p=>(p.divorced_spouse_ids||[]).length))parts.push('<span><i class="legend-line divorced"></i> Đã ly hôn</span>');let cross=false;for(const p of state.people){for(const sid of p.spouse_ids||[]){const sp=state.byId.get(sid);if(sp&&crossBranchMarriage(p,sp)){cross=true;break;}}if(cross)break;}if(cross)parts.push('<span><i class="legend-line cross-branch"></i> Hôn phối khác Chi</span>');parts.push('<span class="privacy-note">🔒 Một số thông tin có thể được ẩn theo quyền riêng tư.</span>');host.innerHTML=parts.join('');}

function renderBranchSelector(){
  const select=$('#branchSelect'); if(!select)return;
  select.innerHTML=`<option value="">Toàn gia phả</option>`+state.branches.map(b=>`<option value="${attr(b.slug)}" ${state.activeBranch?.id===b.id?'selected':''}>${escapeHtml(b.name)} · ${b.member_count} người</option>`).join('');
  select.closest('.branch-switcher')?.classList.toggle('single',state.branches.length===0);
}
function renderStats() {
  const s=state.stats||{};
  const items=[['♙',s.total||0,'thành viên','total'],['♂',s.male||0,'nam','male'],['♀',s.female||0,'nữ','female'],['♡',s.living||0,'còn sống','living'],['⌁',s.generations||0,'thế hệ','generations'],['✦',s.deceased||0,'người đã mất','deceased']];
  const bands=(s.age_bands?.length?s.age_bands:buildAgeBandsFromPeople());
  const unknown=s.age_unknown||buildUnknownAgeStatsFromPeople();
  const main=items.map(([i,n,l,k])=>`<button type="button" class="stat-pill stat-clickable" data-stat-key="${k}" data-stat-label="${attr(l)}"><span>${i}</span><strong>${n}</strong>${escapeHtml(l)}</button>`).join('');
  const ages=bands.map(b=>{const plus=b.max==null;const label=plus?`${b.min}+ tuổi`:`${b.min}–${b.max} tuổi`;const key=plus?`age:${b.min}:plus`:`age:${b.min}:${b.max}`;const title=plus?`Từ ${b.min} tuổi trở lên`:`Từ ${b.min} đến dưới ${b.max} tuổi`;return `<button type="button" class="stat-pill stat-clickable age-stat" data-stat-key="${key}" data-stat-label="${label}" title="${title}"><span class="age-stat-label">${label}</span><strong>${b.total||0}</strong><small>${b.living||0} sống · ${b.deceased||0} mất</small></button>`;}).join('');
  const unknownAge=`<button type="button" class="stat-pill stat-clickable age-stat age-unknown-stat" data-stat-key="age:unknown" data-stat-label="Không rõ" title="Không xác định được tuổi do thiếu năm sinh hoặc, với người đã mất, thiếu năm mất"><span class="age-stat-label">Không rõ</span><strong>${unknown.total||0}</strong><small>${unknown.living||0} sống · ${unknown.deceased||0} mất</small></button>`;
  $('#statsRow').innerHTML=`<div class="stats-main-group">${main}</div><div class="stats-age-group">${ages}${unknownAge}</div>`;
}
function buildAgeBandsFromPeople(){return [{min:80,max:null},{min:60,max:80},{min:40,max:60},{min:20,max:40},{min:16,max:20},{min:0,max:16}].map(({min,max})=>{const members=state.people.filter(p=>{const age=personAgeYears(p);return Number.isFinite(age)&&age>=min&&(max==null||age<max);});return {min,max,total:members.length,living:members.filter(p=>!p.is_deceased).length,deceased:members.filter(p=>p.is_deceased).length};});}
function buildUnknownAgeStatsFromPeople(){const members=state.people.filter(p=>!Number.isFinite(personAgeYears(p)));return {total:members.length,living:members.filter(p=>!p.is_deceased).length,deceased:members.filter(p=>p.is_deceased).length};}
function personAgeYears(p){const hasAge=p?.age_years!==null&&p?.age_years!==undefined&&p?.age_years!=='';if(hasAge&&Number.isFinite(Number(p.age_years)))return Number(p.age_years);const birth=extractYear(p?.birth_date);if(!birth)return null;const end=(p?.is_deceased||p?.death_date)?extractYear(p?.death_date):new Date().getFullYear();if(!end||end<birth)return null;const age=end-birth;return age>=0&&age<=130?age:null;}
function statsPeopleForKey(key){
  const people=[...state.people];
  if(key==='male')return people.filter(p=>p.gender==='male'); if(key==='female')return people.filter(p=>p.gender==='female'); if(key==='living')return people.filter(p=>!p.is_deceased); if(key==='deceased')return people.filter(p=>p.is_deceased);
  if(key==='age:unknown')return people.filter(p=>!Number.isFinite(personAgeYears(p)));
  if(String(key).startsWith('age:')){const [,minRaw,maxRaw]=key.split(':');const min=Number(minRaw),max=maxRaw==='plus'?null:Number(maxRaw);return people.filter(p=>{const age=personAgeYears(p);return Number.isFinite(age)&&age>=min&&(max==null||age<max);});}
  return people;
}
function statsPersonSort(a,b){const aa=personAgeYears(a),bb=personAgeYears(b);if(Number.isFinite(aa)&&Number.isFinite(bb)&&aa!==bb)return bb-aa;if(Number.isFinite(aa)!==Number.isFinite(bb))return Number.isFinite(aa)?-1:1;return (Number(a.level)||1)-(Number(b.level)||1)||String(a.full_name||'').localeCompare(String(b.full_name||''),'vi');}
function statsPersonAlphaSort(a,b){return String(a.full_name||'').localeCompare(String(b.full_name||''),'vi',{sensitivity:'base',numeric:true})||String(a.id||'').localeCompare(String(b.id||''));}
function normalizeStatsSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi').trim();}
function statsListRows(){
  const key=state.statsList.key; const query=state.statsList.query;
  let rows=statsPeopleForKey(key);
  if(query) rows=rows.filter(p=>normalizeStatsSearch(p.full_name||'').includes(query));
  return rows.sort(key==='age:unknown'?statsPersonAlphaSort:statsPersonSort);
}
function statsListTotalPages(){return Math.max(1,Math.ceil(statsListRows().length/state.statsList.pageSize));}
function setStatsPage(page){const totalPages=statsListTotalPages();state.statsList.page=Math.min(totalPages,Math.max(1,Math.trunc(Number(page)||1)));renderStatsListPage();}
function statsUnknownLabel(p){if(Number.isFinite(personAgeYears(p)))return '';const birth=extractYear(p?.birth_date);const death=extractYear(p?.death_date);if(!birth&&p?.is_deceased&&!death)return 'Không rõ năm sinh và năm mất';if(!birth)return 'Không rõ năm sinh';if(p?.is_deceased&&!death)return 'Không rõ năm mất';return 'Không rõ năm sinh/năm mất';}
function renderStatsListPage(){
  const allRows=statsListRows(); const pageSize=state.statsList.pageSize; const totalPages=Math.max(1,Math.ceil(allRows.length/pageSize));
  state.statsList.page=Math.min(totalPages,Math.max(1,state.statsList.page));
  const start=(state.statsList.page-1)*pageSize; const rows=allRows.slice(start,start+pageSize); const key=state.statsList.key;
  const baseCount=statsPeopleForKey(key).length; const hasQuery=!!state.statsList.query; const sortText=key==='age:unknown'?'sắp xếp tên A–Z':'sắp xếp theo độ tuổi từ lớn xuống nhỏ';
  $('#statsPanelSummary').textContent=hasQuery?`${allRows.length} kết quả / ${baseCount} cá thể · ${sortText}`:`${baseCount} cá thể · ${sortText}`;
  $('#statsPersonList').innerHTML=rows.length?rows.map((p,i)=>{const age=personAgeYears(p);const gender=['male','female','other'].includes(p.gender)?p.gender:'other';const img=p.image_url||`/assets/avatar-${gender==='other'?'placeholder':gender}.svg`;const ageLabel=Number.isFinite(age)?(p.is_deceased?`Thọ ${age} tuổi`:`${age} tuổi`):statsUnknownLabel(p);return `<button type="button" class="stats-person" data-stats-person="${attr(p.id)}"><span class="stats-person-number">${start+i+1}</span><img src="${attr(img)}" alt=""><span class="stats-person-copy"><strong>${escapeHtml(p.full_name||'Cá thể')}</strong><small>${escapeHtml(ageLabel)} · Đời ${Number(p.level)||1} · ${p.is_deceased?'Đã mất':'Còn sống'}</small></span><span class="stats-person-arrow">›</span></button>`;}).join(''):'<div class="stats-empty">Không có cá thể phù hợp.</div>';
  const from=allRows.length?start+1:0,to=allRows.length?start+rows.length:0;
  $('#statsPageInfo').textContent=allRows.length?`${from}–${to} / ${allRows.length} cá thể`:'0 cá thể';
  $('#statsPageInput').value=String(state.statsList.page); $('#statsPageInput').max=String(totalPages); $('#statsPageTotal').textContent=`/ ${totalPages}`;
  $('#statsFirstPage').disabled=state.statsList.page<=1; $('#statsPrevPage').disabled=state.statsList.page<=1; $('#statsNextPage').disabled=state.statsList.page>=totalPages; $('#statsLastPage').disabled=state.statsList.page>=totalPages;
}
function openStatsList(key,label){
  state.statsList={key:String(key||'total'),label:String(label||'Thành viên'),query:'',page:1,pageSize:100};
  const title=key==='generations'?`${state.stats.generations||0} thế hệ`:label;
  $('#statsPanelTitle').textContent=title; $('#statsSearch').value=''; renderStatsListPage();
  $('#statsPanel').classList.add('open');$('#statsBackdrop').classList.add('open');$('#statsPanel').setAttribute('aria-hidden','false');
  setTimeout(()=>$('#statsSearch')?.focus(),0);
}
function closeStatsList(){const panel=$('#statsPanel');if(!panel)return;panel.classList.remove('open');$('#statsBackdrop').classList.remove('open');panel.setAttribute('aria-hidden','true');}
function renderTraffic() {
  const host=$('#trafficStats');if(!host)return;const t=state.traffic||{};const n=v=>new Intl.NumberFormat('vi-VN').format(Number(v)||0);
  host.innerHTML=`<div class="traffic-card"><span class="traffic-live"><i></i><strong>${n(t.online)}</strong> đang truy cập</span><span><b>${n(t.guests_online)}</b> khách</span><span><b>${n(t.users_online)}</b> thành viên</span><span class="traffic-divider"></span><span>Hôm nay <b>${n(t.visits_today)}</b></span><span>Tháng này <b>${n(t.visits_month)}</b></span><span>Tổng lượt <b>${n(t.visits_total)}</b></span></div>`;
}
function renderGenerationFilter() {
  const levels=(state.stats.generation_levels?.length?state.stats.generation_levels:[...new Set(state.people.map(p=>Number(p.level)||1))]).sort((a,b)=>a-b); const host=$('#generationFilter');
  host.innerHTML=`<button class="gen-btn ${state.selectedGeneration==='all'?'active':''}" data-gen="all">Tất cả</button>` + levels.map(level=>`<button class="gen-btn ${String(level)===String(state.selectedGeneration)?'active':''}" data-gen="${level}">Đời ${level}</button>`).join('');
  host.onclick=e=>{const b=e.target.closest('[data-gen]');if(!b)return;state.selectedGeneration=b.dataset.gen;renderGenerationFilter();applyFilters();};
}

function renderTree() {
  const allPeople=state.people;
  const people=visiblePeopleForCollapse(allPeople,state.collapsedFamilies);
  $('#treeEmpty').classList.toggle('hidden',allPeople.length>0);
  if(!allPeople.length){ $('#treeStage').style.width='1px'; $('#treeStage').style.height='1px'; return; }
  const layout=buildLayout(people);
  const toggles=buildFamilyToggles(allPeople,layout.nodes,state.collapsedFamilies,layout.familyAnchors);
  state.stageW=layout.width; state.stageH=layout.height;
  const stage=$('#treeStage'); stage.style.width=`${layout.width}px`;stage.style.height=`${layout.height}px`;
  const svg=$('#treeLines'); svg.setAttribute('viewBox',`0 0 ${layout.width} ${layout.height}`); svg.setAttribute('width',layout.width);svg.setAttribute('height',layout.height);svg.innerHTML=layout.paths.join('');
  $('#treeNodes').innerHTML=layout.nodes.map(renderPersonNode).join('')+toggles.map(renderBranchToggle).join('');
  $$('.person-node').forEach(el=>{
    el.addEventListener('click',()=>{if(Date.now()<state.suppressClickUntil)return;openDetail(el.dataset.id);});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(el.dataset.id);}});
  });
  $$('.branch-toggle').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const key=btn.dataset.familyKey;
    if(state.collapsedFamilies.has(key))state.collapsedFamilies.delete(key);else state.collapsedFamilies.add(key);
    renderTree();
  }));
  applyFilters(); requestAnimationFrame(fitTree);
}

function familyKeyFromChild(person){
  const ids=[person?.father_id,person?.mother_id].filter(Boolean).sort();
  return ids.length?ids.join('|'):'';
}
function visiblePeopleForCollapse(people,collapsedFamilies){
  if(!collapsedFamilies?.size)return people;
  const byId=new Map(people.map(p=>[p.id,p]));
  const directByFamily=new Map();
  const childrenByParent=new Map();
  const stepChildrenByParent=new Map();
  for(const child of people){
    const key=familyKeyFromChild(child);
    if(key){if(!directByFamily.has(key))directByFamily.set(key,[]);directByFamily.get(key).push(child.id);}
    for(const pid of [child.father_id,child.mother_id].filter(Boolean)){
      if(!childrenByParent.has(pid))childrenByParent.set(pid,[]);
      childrenByParent.get(pid).push(child.id);
    }
    for(const pid of child.step_parent_ids||[]){
      if(!pid)continue;
      if(!stepChildrenByParent.has(pid))stepChildrenByParent.set(pid,[]);
      stepChildrenByParent.get(pid).push(child.id);
    }
  }

  // A collapsed family hides the complete descendant branch, not only blood children.
  // A direct descendant is a "downline" member: hide their descendants, stepchildren and
  // spouse(s). A spouse is an attached "partner": hide the spouse and their own children
  // (including a child from another relationship), but do not walk upward to the spouse's
  // parents or sideways through that spouse's other marriages. This keeps collapse local
  // while ensuring in-laws and stepchildren cannot remain floating on the canvas.
  const hidden=new Set();
  const queued=new Set();
  const queue=[];
  const enqueue=(id,role)=>{
    if(!id||!byId.has(id))return;
    const token=`${role}:${id}`;
    if(queued.has(token))return;
    queued.add(token);queue.push({id,role});
  };
  for(const key of collapsedFamilies)for(const id of directByFamily.get(key)||[])enqueue(id,'downline');

  while(queue.length){
    const {id,role}=queue.shift();
    const person=byId.get(id);if(!person)continue;
    hidden.add(id);
    for(const cid of childrenByParent.get(id)||[])enqueue(cid,'downline');
    for(const cid of stepChildrenByParent.get(id)||[])enqueue(cid,'downline');
    if(role==='downline')for(const sid of person.spouse_ids||[])enqueue(sid,'partner');
  }
  return people.filter(p=>!hidden.has(p.id));
}
function buildFamilyToggles(allPeople,nodes,collapsedFamilies,familyAnchors=null){
  const positions=new Map(nodes.map(n=>[n.person.id,n]));
  const allIds=new Set(allPeople.map(p=>p.id));
  const families=new Map();
  for(const child of allPeople){
    const parentIds=[child.father_id,child.mother_id].filter(id=>id&&allIds.has(id)).sort();
    if(!parentIds.length)continue;
    const key=parentIds.join('|');
    if(!families.has(key))families.set(key,{key,parentIds,children:[]});
    families.get(key).children.push(child);
  }
  const out=[];
  for(const fam of families.values()){
    const parentPos=fam.parentIds.map(id=>positions.get(id)).filter(Boolean);
    if(!parentPos.length)continue;
    const hasVisibleDirectChild=fam.children.some(child=>positions.has(child.id));
    if(!collapsedFamilies.has(fam.key)&&!hasVisibleDirectChild)continue;
    const anchor=familyAnchors?.get?.(fam.key)||null;
    const x=anchor?.x??avg(parentPos.map(p=>p.cx));
    const sourceY=anchor?.y??(parentPos.length>=2?Math.min(...parentPos.map(p=>p.y))+124:Math.max(...parentPos.map(p=>p.bottom))+2);
    out.push({key:fam.key,x,y:sourceY+22,collapsed:collapsedFamilies.has(fam.key),childCount:fam.children.length});
  }
  return out;
}
function renderBranchToggle(t){
  const label=t.collapsed?'+':'−';
  const title=t.collapsed?`Hiện nhánh dưới (${t.childCount} con trực tiếp)`:`Ẩn nhánh dưới (${t.childCount} con trực tiếp)`;
  return `<button type="button" class="branch-toggle${t.collapsed?' collapsed':''}" style="left:${round(t.x-13)}px;top:${round(t.y-13)}px" data-family-key="${attr(t.key)}" title="${attr(title)}" aria-label="${attr(title)}">${label}</button>`;
}

function orderedSpouseIds(person){const ids=[...new Set((person?.spouse_ids||[]).filter(Boolean))],preferred=[...new Set((person?.spouse_order_ids||[]).filter(id=>ids.includes(id)))];return [...preferred,...ids.filter(id=>!preferred.includes(id))];}
function spouseOrdinalLabel(primary,index,total){if(total<=1)return primary?.gender==='male'?'Vợ':primary?.gender==='female'?'Chồng':'Phối ngẫu';if(primary?.gender==='male')return index===0?'Vợ cả':`Vợ ${index+1}`;if(primary?.gender==='female')return `Chồng ${index+1}`;return `Phối ngẫu ${index+1}`;}
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


function renderPersonNode(pos){
  const p=pos.person; const gender=['male','female','other'].includes(p.gender)?p.gender:'other'; const img=p.image_url||`/assets/avatar-${gender==='other'?'placeholder':gender}.svg`;
  const life=lifeText(p); const age=ageText(p); const order=relationshipCaption(pos);
  const privacy=p.privacy_mode&&p.privacy_mode!=='public'?`<span class="privacy-badge" title="Thông tin được giới hạn">🔒</span>`:'';
  const adopted=p.is_adopted?`<span class="adopt-badge" title="Con nuôi">A</span>`:''; const stepchild=(p.step_parent_ids||[]).length?`<span class="step-badge" title="Con riêng của vợ/chồng">R</span>`:'';
  const candle=p.is_deceased?`<span class="memorial-candle" title="Đã mất" aria-label="Đã mất"><img src="/assets/candle.svg" alt=""></span>`:'';
  return `<div class="person-node gender-${gender}${p.is_deceased?' deceased':''}${p.privacy_mode==='private'?' private':''}" style="left:${round(pos.x)}px;top:${round(pos.y)}px" data-id="${attr(p.id)}" data-level="${Number(p.level)||1}" data-search="${attr(`${p.full_name||''} ${p.birth_date||''}`.toLocaleLowerCase('vi'))}" tabindex="0" role="button" aria-label="${attr(p.full_name||'Cá thể')}">
    <div class="avatar-wrap">${adopted}${stepchild}<img class="person-avatar" src="${attr(img)}" alt="" loading="lazy">${privacy}${candle}</div>
    <div class="person-label">${order?`<span class="person-order">${escapeHtml(order)}</span>`:''}<span class="person-name" title="${attr(p.full_name||'')}">${escapeHtml(p.full_name||'')}</span>${life?`<span class="person-life">${escapeHtml(life)}</span>`:''}${age?`<span class="person-age">${escapeHtml(age)}</span>`:''}</div>
  </div>`;
}
function lifeText(p){
  if(p.privacy_mode==='private')return 'Thông tin riêng tư';
  const b=String(p.birth_date||'').trim(), d=String(p.death_date||'').trim();
  if(b&&d)return `${b} — ${d}`;
  if(b&&p.is_deceased)return `${b} — ?`;
  if(b)return `Sinh ${b}`;
  if(d)return `Mất ${d}`;
  return '';
}
function extractYear(value){const m=String(value||'').match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})(?:\D|$)/);return m?Number(m[1]):null;}
function ageText(p){
  if(p.privacy_mode==='private')return '';
  const age=personAgeYears(p); if(!Number.isFinite(age))return '';
  return (p.is_deceased||p.death_date)?`Thọ ${age} tuổi`:`${age} tuổi`;
}
function childOrderText(p){
  if(p.is_inlaw)return '';
  const n=Number(p.birth_order); if(!Number.isFinite(n)||n<=0)return '';
  return `Con thứ ${n}`;
}
function relationshipCaption(pos){
  const p=pos?.person||{},primaryId=pos?.unit?.primary?.id||'';
  if(primaryId&&p.id!==primaryId){
    const primary=state.byId.get(primaryId),former=(p.divorced_spouse_ids||[]).includes(primaryId)||(primary?.divorced_spouse_ids||[]).includes(p.id),order=orderedSpouseIds(primary),index=order.indexOf(p.id);
    if(index>=0&&order.length>1){const label=spouseOrdinalLabel(primary,index,order.length);return former?`${label} · cũ`:label;}
    if(p.gender==='female')return former?'Vợ cũ':'Vợ';if(p.gender==='male')return former?'Chồng cũ':'Chồng';return former?'Phối ngẫu cũ':'Phối ngẫu';
  }
  return childOrderText(p);
}

function applyFilters(){
  const gen=state.selectedGeneration;const q=state.search;let hit=null;
  $$('.person-node').forEach(n=>{const genOk=gen==='all'||n.dataset.level===String(gen);const qOk=!q||n.dataset.search.includes(q);n.classList.toggle('search-dim',!(genOk&&qOk));n.classList.toggle('search-hit',q&&genOk&&qOk);if(q&&genOk&&qOk&&!hit)hit=n;});
  if(hit){const x=parseFloat(hit.style.left)+78,y=parseFloat(hit.style.top)+65;centerOn(x,y);}
}
function setZoom(next){const viewport=$('#treeViewport');const rect=viewport.getBoundingClientRect();const mx=rect.width/2,my=rect.height/2;const worldX=(mx-state.panX)/state.zoom,worldY=(my-state.panY)/state.zoom;state.zoom=clamp(next,.45,1.55);state.panX=mx-worldX*state.zoom;state.panY=my-worldY*state.zoom;applyTransform();updateZoomLabel();}
function fitTree(){const viewport=$('#treeViewport');if(!state.stageW||!viewport)return;const pad=35;const z=Math.min((viewport.clientWidth-pad*2)/state.stageW,(viewport.clientHeight-pad*2)/state.stageH,.95);state.zoom=clamp(z,.45,.95);state.panX=(viewport.clientWidth-state.stageW*state.zoom)/2;state.panY=Math.max(24,(viewport.clientHeight-state.stageH*state.zoom)/2);applyTransform();updateZoomLabel();}
function centerOn(x,y){const v=$('#treeViewport');state.panX=v.clientWidth/2-x*state.zoom;state.panY=v.clientHeight/2-y*state.zoom;applyTransform();}
function applyTransform(){ $('#treeStage').style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`; }
function updateZoomLabel(){ $('#zoomReset').textContent=`${Math.round(state.zoom*100)}%`; }

function openDetail(id){const p=state.byId.get(id);if(!p)return;const relatives=relativeGroups(p);const gender=['male','female','other'].includes(p.gender)?p.gender:'other';const img=p.image_url||`/assets/avatar-${gender==='other'?'placeholder':gender}.svg`;
  const detail=$('#detailContent');detail.innerHTML=`<div class="detail-hero" style="--node-color:var(--${gender})"><img class="detail-avatar" src="${attr(img)}" alt=""><h2>${escapeHtml(p.full_name||'')}</h2><div class="detail-sub">${escapeHtml(lifeText(p))}</div><div class="detail-tags"><span class="tag">Đời ${Number(p.level)||1}</span>${p.family_code?`<span class="tag">${escapeHtml(p.family_code)}</span>`:''}${p.is_adopted?'<span class="tag">Con nuôi</span>':''}${(p.step_parent_ids||[]).length?'<span class="tag">Con riêng</span>':''}${p.is_inlaw?'<span class="tag">Dâu / Rể</span>':''}${p.privacy_mode!=='public'?'<span class="tag">🔒 Riêng tư</span>':''}${(p.branch_names||[]).map(name=>`<span class="tag branch-tag">Chi ${escapeHtml(name)}</span>`).join('')}</div></div>
  ${p.privacy_mode==='private'?`<div class="detail-section"><h3>Quyền riêng tư</h3><p class="detail-text">Thông tin chi tiết của thành viên này được gia đình đặt ở chế độ riêng tư.</p></div>`:`
  <div class="detail-section"><h3>Thông tin</h3><div class="detail-grid"><div class="detail-item"><span>Sinh</span><strong>${escapeHtml(p.birth_date||'Chưa rõ')}</strong></div><div class="detail-item"><span>Mất</span><strong>${escapeHtml(p.is_deceased?(p.death_date||'Chưa rõ'):'Đang sống')}</strong></div><div class="detail-item"><span>Nơi sinh</span><strong>${escapeHtml(p.birth_place||'Chưa rõ')}</strong></div><div class="detail-item"><span>Nơi mất</span><strong>${escapeHtml(p.is_deceased?(p.death_place||'Chưa rõ'):'—')}</strong></div><div class="detail-item"><span>Nghề nghiệp</span><strong>${escapeHtml(p.occupation||'Chưa cập nhật')}</strong></div></div></div>
  ${p.details?`<div class="detail-section"><h3>Tiểu sử / ghi chú</h3><div class="detail-text">${escapeHtml(p.details)}</div></div>`:''}
  ${p.source_citations?`<div class="detail-section"><h3>Nguồn & trích dẫn</h3><div class="detail-text">${escapeHtml(p.source_citations)}</div></div>`:''}`}
  ${relativeSection(relatives)}`;
  $('#detailPanel').classList.add('open');$('#detailPanel').setAttribute('aria-hidden','false');$('#panelBackdrop').classList.add('open');
  $$('.relative-chip',detail).forEach(b=>b.onclick=()=>openDetail(b.dataset.id));
}
function relativeGroups(p){const by=state.byId;const parents=[p.father_id,p.mother_id].filter(Boolean).map(id=>by.get(id)).filter(Boolean);const spouseOrder=orderedSpouseIds(p),allSpouses=spouseOrder.map(id=>by.get(id)).filter(Boolean);const divorced=new Set(p.divorced_spouse_ids||[]);const currentSpouses=allSpouses.filter(x=>!divorced.has(x.id));const formerSpouses=allSpouses.filter(x=>divorced.has(x.id));const children=state.people.filter(c=>c.father_id===p.id||c.mother_id===p.id);const rawGroups=new Map();for(const child of children){const partnerId=child.father_id===p.id?child.mother_id:child.father_id;const key=partnerId||'';if(!rawGroups.has(key))rawGroups.set(key,[]);rawGroups.get(key).push(child);}const childGroups=new Map();for(const id of spouseOrder)if(rawGroups.has(id))childGroups.set(id,rawGroups.get(id));for(const [id,items] of rawGroups)if(!childGroups.has(id))childGroups.set(id,items);const stepParents=(p.step_parent_ids||[]).map(id=>by.get(id)).filter(Boolean);const stepChildren=state.people.filter(c=>(c.step_parent_ids||[]).includes(p.id));return {person:p,parents,stepParents,currentSpouses,formerSpouses,children,stepChildren,childGroups};}
function relativeChip(x,extra=''){const branches=(x.branch_names||[]).length?` <small>${escapeHtml((x.branch_names||[]).join(' / '))}</small>`:'';return `<button class="relative-chip" data-id="${attr(x.id)}">${escapeHtml(x.full_name)}${extra?` <em>${escapeHtml(extra)}</em>`:''}${branches}</button>`;}
function spouseRelativeExtra(person,spouse){const order=orderedSpouseIds(person),idx=order.indexOf(spouse.id),parts=[];if(order.length>1&&idx>=0)parts.push(spouseOrdinalLabel(person,idx,order.length));if(crossBranchMarriage(person,spouse))parts.push('khác Chi');return parts.join(' · ');}
function relativeSection(groups){const parts=[];if(groups.parents.length)parts.push(`<div><strong>Cha mẹ</strong><div class="relative-list">${groups.parents.map(x=>relativeChip(x)).join('')}</div></div>`);if(groups.stepParents?.length)parts.push(`<div><strong>Cha / mẹ kế</strong><div class="relative-list">${groups.stepParents.map(x=>relativeChip(x,'quan hệ con riêng')).join('')}</div></div>`);if(groups.currentSpouses.length)parts.push(`<div><strong>Vợ / chồng hiện tại</strong><div class="relative-list">${groups.currentSpouses.map(x=>relativeChip(x,spouseRelativeExtra(groups.person,x))).join('')}</div></div>`);if(groups.formerSpouses.length)parts.push(`<div><strong>Vợ / chồng đã ly hôn</strong><div class="relative-list">${groups.formerSpouses.map(x=>relativeChip(x,spouseRelativeExtra(groups.person,x))).join('')}</div></div>`);if(groups.stepChildren?.length)parts.push(`<div><strong>Con riêng của vợ/chồng</strong><div class="relative-list">${sortPeople(groups.stepChildren).map(x=>relativeChip(x,'con riêng')).join('')}</div></div>`);for(const [partnerId,children] of groups.childGroups){const partner=partnerId?state.byId.get(partnerId):null;const label=partner?`Con với ${partner.full_name}`:'Con (chưa rõ người còn lại)';parts.push(`<div><strong>${escapeHtml(label)}</strong><div class="relative-list">${sortPeople(children).map(x=>relativeChip(x)).join('')}</div></div>`);}return parts.length?`<div class="detail-section"><h3>Quan hệ gia đình</h3><div style="display:grid;gap:13px">${parts.join('')}</div></div>`:'';}
function closeDetail(){ $('#detailPanel').classList.remove('open');$('#detailPanel').setAttribute('aria-hidden','true');$('#panelBackdrop').classList.remove('open'); }

function openComments(){ $('#commentPanel').classList.add('open');setTimeout(()=>$('#commentMessage')?.focus(),180); }
function closeComments(){ $('#commentPanel').classList.remove('open'); }
function renderComments(){const list=$('#commentList');if(!list)return;$('#commentCount').textContent=state.comments.length; if(!state.comments.length){list.innerHTML='<div class="comment-empty">Chưa có lời nhắn. Hãy là người đầu tiên gửi bình luận.</div>';return;}list.innerHTML=state.comments.map(c=>`<article class="comment-card"><div class="comment-meta"><strong>${escapeHtml(c.display_name||'Ẩn danh')}</strong><span>${formatTime(c.created_at)}</span></div><p>${escapeHtml(c.message||'')}</p></article>`).join('');list.scrollTop=list.scrollHeight;}
async function submitComment(e){
  e.preventDefault();
  const form=e.currentTarget;
  const status=$('#commentStatus');
  const button=form.querySelector('button[type="submit"]');
  status.textContent='';
  const message=$('#commentMessage').value.trim();
  const display_name=state.auth?.authenticated?(state.auth.user?.display_name||'Thành viên'):($('#commentName')?.value||'').trim();
  if(!message){status.style.color='var(--danger)';status.textContent='Vui lòng nhập lời nhắn.';return;}
  if(!state.auth?.authenticated&&display_name.length<2){status.style.color='var(--danger)';status.textContent='Vui lòng nhập tên hiển thị từ 2 ký tự.';return;}
  try{
    if(button){button.disabled=true;button.textContent='Đang gửi…';}
    const d=await api('/api/public/comments',{method:'POST',body:JSON.stringify({display_name,message})});
    state.comments.unshift(d.comment);
    $('#commentMessage').value='';
    renderComments();
    status.style.color='var(--success)';status.textContent='Đã gửi bình luận.';
    setTimeout(()=>status.textContent='',1800);
  }catch(err){status.style.color='var(--danger)';status.textContent=err.message;}
  finally{if(button){button.disabled=false;button.textContent='Gửi bình luận';}}
}

function sortPeople(arr){return [...arr].sort(personSort);} function personSort(a,b){return (Number(a.birth_order)||999)-(Number(b.birth_order)||999)||(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.birth_date||'9999').localeCompare(String(b.birth_date||'9999'))||String(a.full_name||'').localeCompare(String(b.full_name||''),'vi');}
function genderRank(p){return p.gender==='male'?0:p.gender==='female'?1:2;} function avg(a){return a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);} function clamp(n,a,b){return Math.min(b,Math.max(a,n));} function round(n){return Math.round(n*10)/10;}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));} function attr(v){return escapeHtml(v);}
function formatTime(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);}

function applyTreeFont(key){
  const allowed=['system','segoe','arial','tahoma','verdana','trebuchet','calibri','candara','corbel','helvetica','roboto','noto_sans','dejavu_sans','liberation_sans','times','cambria','palatino','noto_serif','dejavu_serif','liberation_serif'];
  document.documentElement.dataset.treeFont=allowed.includes(String(key||''))?String(key):'system';
}
