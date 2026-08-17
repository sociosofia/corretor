/* Sociosofia OMR · revisão nominal v1.3
   Navega a fila de revisão por estudante/turma/prova, sem depender da ordem de captura.
*/
(()=>{
  if(window.__omrReviewBrowserV13)return;
  window.__omrReviewBrowserV13=true;
  const QUEUE_KEY='sociosofia_omr_queue_v1';
  const details=document.querySelector('.queueDetails');
  if(!details)return;

  const style=document.createElement('style');
  style.textContent=`
    .reviewBrowser{margin:10px 0;padding:9px;border:1px solid #e1e4e8;border-radius:10px;background:#fafbfc}
    .reviewBrowserHead{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    .reviewBrowserHead input,.reviewBrowserHead select{border:1px solid #d1d5db;border-radius:8px;padding:8px;background:#fff;font-size:11px;min-width:0}
    .reviewBrowserHead input{flex:1;min-width:160px}.reviewBrowserHead select{width:auto}
    .reviewBrowserList{display:grid;gap:6px;max-height:390px;overflow:auto}
    .reviewPick{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;width:100%;text-align:left;border:1px solid #e2e5e9;background:#fff;border-radius:9px;padding:9px}
    .reviewPick b{display:block;font-size:12px}.reviewPick small{display:block;color:#697079;font-size:9px;margin-top:3px;line-height:1.35}
    .reviewPick .badge{align-self:center}.reviewEmpty{font-size:11px;color:#6b7280;padding:8px}
  `;
  document.head.appendChild(style);

  const box=document.createElement('div');box.className='reviewBrowser';
  box.innerHTML=`<div class="reviewBrowserHead"><input id="reviewSearchV13" type="search" placeholder="Buscar aluno, turma ou prova…"><select id="reviewFilterV13"><option value="review">Só revisão</option><option value="ready">Só prontas</option><option value="all">Toda a fila</option></select></div><div id="reviewBrowserListV13" class="reviewBrowserList"></div>`;
  const queueList=document.getElementById('queueList');details.insertBefore(box,queueList);
  const search=document.getElementById('reviewSearchV13'),filter=document.getElementById('reviewFilterV13'),list=document.getElementById('reviewBrowserListV13');

  function readQueue_(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')||[]}catch(e){return[]}}
  function norm_(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
  function label_(r){return r.meta?.nome||r.meta?.aluno_id||r.meta?.prova_id||String(r.token||'').slice(0,18)}
  function sorted_(){
    const q=readQueue_(),f=filter.value,term=norm_(search.value);
    return q.filter(r=>(f==='all'||r.state===f)).filter(r=>!term||norm_([r.meta?.nome,r.meta?.aluno_id,r.meta?.turma,r.meta?.prova_id].join(' ')).includes(term)).sort((a,b)=>{
      const ta=String(a.meta?.turma||''),tb=String(b.meta?.turma||'');if(ta!==tb)return ta.localeCompare(tb,'pt-BR');
      return label_(a).localeCompare(label_(b),'pt-BR');
    });
  }
  function esc_(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

  function render_(){
    const rows=sorted_();
    if(!rows.length){list.innerHTML='<div class="reviewEmpty">Nenhuma leitura neste filtro.</div>';return}
    list.innerHTML=rows.map(r=>{
      const nm=esc_(label_(r)),tm=esc_(r.meta?.turma||''),pv=esc_(r.meta?.prova_id||''),src=r.source==='pdf'?(r.sourcePage?`PDF p.${r.sourcePage}`:'PDF'):'câmera';
      const badge=r.state==='review'?'<span class="badge warn">revisar</span>':'<span class="badge ok">pronta</span>';
      return `<button class="reviewPick" data-id="${esc_(r.id)}"><span><b>${nm}</b><small>${tm}${tm&&pv?' · ':''}${pv} · ${src}</small></span>${badge}</button>`;
    }).join('');
    list.querySelectorAll('.reviewPick').forEach(b=>b.onclick=()=>openById_(b.dataset.id));
  }

  function openById_(id){
    const rec=readQueue_().find(x=>x.id===id);if(!rec)return render_();
    if(rec.state!=='review')return alert('Esta leitura já está pronta para envio.');
    if(pending&&!pending.__fromQueue)return alert('Há uma leitura atual aberta. Guarde ou reinicie antes de abrir outra revisão.');
    armed=false;
    pending={token:rec.token,rows:rec.rows,meta:rec.meta||{},burst:rec.burst,source:rec.source,sourcePage:rec.sourcePage,__queueId:rec.id,__fromQueue:true};
    render(rec.rows);renderReview(pending);
    const m=pending.meta||{};
    proofMeta.textContent=`${m.nome||m.aluno_id||'Aluno não identificado'} · ${m.turma||'turma —'} · ${m.prova_id||'prova —'}`;
    const bad=rec.rows.filter(r=>r.state!=='válida').map(r=>`Q${r.q} ${r.state}`).join(' · ');
    const safety=document.getElementById('reviewSafety');if(safety)safety.textContent=(rec.source==='pdf'?(rec.sourcePage?`PDF · página ${rec.sourcePage} · `:'PDF · '):'')+(bad||'leitura separada para conferência');
    status(`Revisando ${m.nome||m.aluno_id||'aluno'}`);stateText.textContent='revisão manual';
    reviewCard.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.__omrOpenReviewById=openById_;

  const next=document.getElementById('reviewNextBtn');
  if(next)next.onclick=()=>{const rec=sorted_().find(r=>r.state==='review');if(!rec)return alert('Não há revisões pendentes neste filtro.');openById_(rec.id)};

  // Filas capturadas antes de o backend devolver nome/turma podem ter só o token.
  // Enriquecemos aos poucos para não martelar o Apps Script, repetindo os lotes até
  // toda a fila antiga ficar nominal.
  let hydrating=false;
  async function hydrateMissing_(){
    if(hydrating||!Bridge?.ready?.())return;
    const q=readQueue_(),missing=q.filter(r=>r.state==='review'&&!r.meta?.nome).slice(0,18);
    if(!missing.length)return;
    hydrating=true;let changed=false;
    for(const r of missing){
      try{const m=await Bridge.identify(r.token);if(m?.ok){r.meta={...(r.meta||{}),...m,local:false};changed=true}}catch(e){}
      await new Promise(res=>setTimeout(res,110));
    }
    if(changed){
      const live=readQueue_();
      for(const enriched of q){const i=live.findIndex(x=>x.id===enriched.id);if(i>=0&&enriched.meta?.nome)live[i].meta=enriched.meta}
      localStorage.setItem(QUEUE_KEY,JSON.stringify(live));render_();
    }
    hydrating=false;
    if(readQueue_().some(r=>r.state==='review'&&!r.meta?.nome))setTimeout(hydrateMissing_,850);
  }

  search.oninput=render_;filter.onchange=render_;
  render_();setTimeout(hydrateMissing_,700);
  window.addEventListener('storage',render_);
  setInterval(render_,1800);
})();
