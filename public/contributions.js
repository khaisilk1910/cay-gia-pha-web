'use strict';
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const S={page:1,pageSize:20,totalPages:1,yearsLoaded:false,controller:null,seq:0,detailController:null};
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const amountKnown=r=>!(r?.amount_known===false||Number(r?.amount_known)===0);
  const money=(v,known=true)=>known?new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(v)||0):'—';
  const count=v=>new Intl.NumberFormat('vi-VN').format(Number(v)||0);
  const date=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:(v||'—');};

  window.addEventListener('DOMContentLoaded',()=>{bind();load();});
  function bind(){
    let timer=0;
    $('#contributionPublicSearch')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{S.page=1;load();},220);});
    $('#contributionPublicYear')?.addEventListener('change',()=>{S.page=1;load();});
    $('#contributionPublicSort')?.addEventListener('change',()=>{S.page=1;load();});
    $('#contributionFirstPage')?.addEventListener('click',()=>setPage(1));
    $('#contributionPrevPage')?.addEventListener('click',()=>setPage(S.page-1));
    $('#contributionNextPage')?.addEventListener('click',()=>setPage(S.page+1));
    $('#contributionLastPage')?.addEventListener('click',()=>setPage(S.totalPages));
    $('#contributionPageInput')?.addEventListener('change',e=>setPage(e.target.value));
    $('#contributionPageInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setPage(e.target.value);}});
    $('#contributionTopBody')?.addEventListener('click',e=>{const row=e.target.closest('[data-contribution-group]');if(row)openDetail(row.dataset.contributionGroup);});
    $('#contributionTopBody')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-contribution-group]')){e.preventDefault();openDetail(e.target.dataset.contributionGroup);}});
    document.querySelectorAll('[data-contribution-detail-close]').forEach(el=>el.addEventListener('click',closeDetail));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#contributionDetailModal')?.classList.contains('hidden'))closeDetail();});
  }
  function setPage(page){S.page=Math.min(S.totalPages,Math.max(1,Number(page)||1));load({scroll:true});}
  async function load(options={}){
    const seq=++S.seq;if(S.controller)S.controller.abort();S.controller=new AbortController();
    const params=new URLSearchParams({page:String(S.page),page_size:String(S.pageSize),sort:$('#contributionPublicSort')?.value||'date_desc'});
    const q=($('#contributionPublicSearch')?.value||'').trim(),year=$('#contributionPublicYear')?.value||'';if(q)params.set('q',q);if(year)params.set('year',year);
    try{
      document.body.classList.add('contribution-loading');
      const res=await fetch(`/api/public/contributions?${params}`,{headers:{Accept:'application/json'},signal:S.controller.signal});const d=await res.json();if(!res.ok)throw new Error(d.error||'Không thể tải Phương Danh Công Đức.');if(seq!==S.seq)return;
      renderBrand(d.settings||{});renderYears(d.years||[]);renderSummary(d.summary||{});renderTop(d.top||[],d.settings||{});renderList(d.contributions||[],d.pagination||{});
      if(options.scroll)document.querySelector('.contribution-list-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){if(e.name==='AbortError')return;console.error(e);renderError(e.message||'Không thể tải dữ liệu.');}
    finally{if(seq===S.seq)document.body.classList.remove('contribution-loading');}
  }
  function renderBrand(settings){
    const logo=String(settings.logo_url||'/assets/logo.png');$('#contributionBrandLogo').src=logo;$('#contributionClanName').textContent=settings.clan_name||'Gia đình';$('#contributionFooterClan').textContent=settings.clan_name||'Gia đình';document.title=`Phương Danh Công Đức · ${settings.clan_name||'Cây Gia Phả'}`;
    window.GiaPhaPublicUI?.applyFont(settings.tree_font||'system');window.GiaPhaPublicUI?.renderSharedFooter(document,settings);if(!S.trafficStarted){S.trafficStarted=true;window.GiaPhaPublicUI?.startTraffic($('#contributionTrafficStats'),true);}
  }
  function renderYears(years){if(S.yearsLoaded)return;const select=$('#contributionPublicYear');if(!select)return;const current=select.value;select.innerHTML='<option value="">Tất cả</option>'+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');if(years.includes(current))select.value=current;S.yearsLoaded=true;}
  function renderSummary(summary){const host=$('#contributionSummary');if(!host)return;host.innerHTML=`<div class="contribution-summary-card"><span>Tổng lượt công đức</span><strong>${count(summary.count)}</strong></div><div class="contribution-summary-card"><span>Phương danh</span><strong>${count(summary.donors)}</strong></div><div class="contribution-summary-card accent"><span>Tổng giá trị</span><strong>${money(summary.total_amount)}</strong></div>`;}
  function rowHtml(r,index,{top=false}={}){
    const rank=top&&index<3?` rank-${index+1}`:'',groupable=top&&Number(r.contribution_count||0)>=2&&r.group_key;
    const attrs=groupable?` data-contribution-group="${esc(r.group_key)}" tabindex="0" role="button" aria-label="Xem ${Number(r.contribution_count)} lần công đức của ${esc(r.donor_name)}"`:'';
    return `<tr class="contribution-row${rank}${groupable?' contribution-group-row':''}"${attrs}><td data-label="STT" class="contribution-rank">${top&&index<3?`<span class="rank-medal">${index+1}</span>`:index+1}</td><td data-label="Phương danh"><strong class="contribution-donor">${esc(r.donor_name)}</strong>${groupable?`<span class="contribution-detail-hint">Xem ${Number(r.contribution_count)} lần công đức ›</span>`:''}</td><td data-label="Địa chỉ" class="contribution-address">${esc(r.address||'—')}</td><td data-label="Nội dung công đức" class="contribution-content-cell">${esc(r.contribution_content||'—')}</td><td data-label="Giá trị"><strong class="contribution-value${amountKnown(r)?'':' unknown'}">${money(r.amount,amountKnown(r))}</strong></td><td data-label="Ngày công đức"><time datetime="${esc(r.contribution_date||'')}">${esc(date(r.contribution_date))}</time></td><td data-label="Ghi chú" class="contribution-notes">${esc(r.notes||'—')}</td></tr>`;
  }
  function renderTop(rows,settings){const body=$('#contributionTopBody'),empty=$('#contributionTopEmpty'),shell=document.querySelector('.top-table-shell');const n=Number(settings.contribution_top_count)||rows.length||10;$('#contributionTopBadge').textContent=`Top ${n}`;body.innerHTML=rows.map((r,i)=>rowHtml(r,i,{top:true})).join('');empty.classList.toggle('hidden',!!rows.length);shell.classList.toggle('hidden',!rows.length);}
  function renderList(rows,pagination){S.page=Math.max(1,Number(pagination.page)||1);S.totalPages=Math.max(1,Number(pagination.total_pages)||1);const start=(S.page-1)*S.pageSize;$('#contributionListBody').innerHTML=rows.map((r,i)=>rowHtml(r,start+i)).join('');const empty=$('#contributionListEmpty'),shell=document.querySelector('.contribution-list-section .contribution-table-shell');empty.classList.toggle('hidden',!!rows.length);shell.classList.toggle('hidden',!rows.length);const total=Number(pagination.total)||0,end=Math.min(start+rows.length,total);$('#contributionResultMeta').textContent=total?`Hiển thị ${count(start+1)}–${count(end)} trong ${count(total)} bản ghi`:'Không có bản ghi phù hợp';$('#contributionPageInfo').textContent=total?`${count(total)} bản ghi · Trang ${S.page}/${S.totalPages}`:'0 bản ghi';const input=$('#contributionPageInput');input.value=String(S.page);input.max=String(S.totalPages);$('#contributionPageTotal').textContent=`/ ${S.totalPages}`;$('#contributionFirstPage').disabled=S.page<=1;$('#contributionPrevPage').disabled=S.page<=1;$('#contributionNextPage').disabled=S.page>=S.totalPages;$('#contributionLastPage').disabled=S.page>=S.totalPages;$('#contributionPagination').classList.toggle('hidden',total===0);}
  async function openDetail(groupKey){
    if(!groupKey)return;if(S.detailController)S.detailController.abort();S.detailController=new AbortController();
    const modal=$('#contributionDetailModal'),loading=$('#contributionDetailLoading'),body=$('#contributionDetailBody');modal.classList.remove('hidden');document.body.classList.add('contribution-detail-open');loading.classList.remove('hidden');body.innerHTML='';
    try{const res=await fetch(`/api/public/contributions/group/${encodeURIComponent(groupKey)}`,{headers:{Accept:'application/json'},signal:S.detailController.signal});const d=await res.json();if(!res.ok)throw new Error(d.error||'Không thể tải chi tiết công đức.');$('#contributionDetailTitle').textContent=d.donor_name||'Các lần công đức';$('#contributionDetailAddress').textContent=d.address||'Không ghi địa chỉ';body.innerHTML=(d.contributions||[]).map((r,i)=>`<tr><td data-label="STT">${i+1}</td><td data-label="Nội dung công đức">${esc(r.contribution_content||'—')}</td><td data-label="Giá trị"><strong class="contribution-value${amountKnown(r)?'':' unknown'}">${money(r.amount,amountKnown(r))}</strong></td><td data-label="Ngày công đức">${esc(date(r.contribution_date))}</td><td data-label="Ghi chú">${esc(r.notes||'—')}</td></tr>`).join('');}
    catch(e){if(e.name==='AbortError')return;body.innerHTML=`<tr><td colspan="5" class="contribution-detail-error">${esc(e.message||'Không thể tải chi tiết.')}</td></tr>`;}finally{loading.classList.add('hidden');}
  }
  function closeDetail(){S.detailController?.abort();$('#contributionDetailModal')?.classList.add('hidden');document.body.classList.remove('contribution-detail-open');}
  function renderError(message){$('#contributionResultMeta').textContent=message;$('#contributionListBody').innerHTML='';$('#contributionListEmpty').classList.remove('hidden');$('#contributionListEmpty').querySelector('strong').textContent='Không thể tải dữ liệu';$('#contributionListEmpty').querySelector('p').textContent=message;}
})();
