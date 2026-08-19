/* Sociosofia OMR · v1.3.6 — saneamento conservador da fila local
   - remove da fila registros que o próprio metadado já marca como confirmados;
   - promove para "pronta" somente leituras PDF QR_SCAN com 8 respostas únicas
     e margens fortes (sem branco, dupla ou item em revisão);
   - tenta resolver registros "modo local" canônicos no backend e remove os que
     já estiverem confirmados, sem expor URL/chave e sem tocar em ausências/câmera.
*/
(()=>{
  if(window.__omrQueueMigrationV136)return;
  window.__omrQueueMigrationV136=true;

  const KEY='sociosofia_omr_queue_v1';
  const STAMP='sociosofia_omr_queue_migration_v136';

  function read_(){
    try{const q=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(q)?q:[]}catch(e){return[]}
  }
  function save_(q){localStorage.setItem(KEY,JSON.stringify(q))}
  function num_(v){const n=Number(v);return Number.isFinite(n)?n:0}

  function strongQrPdf_(r){
    if(!r||r.source!=='pdf'||r.state!=='review'||r?.meta?.local)return false;
    if(String(r?.burst?.anchor||'')!=='QR_SCAN')return false;
    const rows=Array.isArray(r.rows)?r.rows:[];
    const qtd=Number(r?.meta?.qtd_questoes||8);
    if(rows.length!==qtd||rows.length!==8)return false;
    if(rows.some(x=>x?.state!=='válida'||!/^[A-E]$/.test(String(x?.answer||''))))return false;
    const minTop=Math.min(...rows.map(x=>num_(x.max)));
    const minGap=Math.min(...rows.map(x=>num_(x.gap)));
    const minContrast=Math.min(...rows.map(x=>num_(x.contrast)));
    return minTop>=.44&&minGap>=.25&&minContrast>=.28;
  }

  function syncMigrate_(){
    const before=read_(),out=[];
    let removed=0,promoted=0;
    for(const r of before){
      if(r?.meta?.ja_confirmada===true||String(r?.meta?.estado||'').toUpperCase()==='CORRIGIDA'){
        removed++;continue;
      }
      if(strongQrPdf_(r)){
        out.push({...r,state:'ready',finalAnswers:r.rows.map(x=>x.answer),updatedAt:new Date().toISOString(),burst:{...(r.burst||{}),safetyPromoted:'v1.3.6-strong-qr'}});
        promoted++;continue;
      }
      out.push(r);
    }
    if(removed||promoted)save_(out);
    try{sessionStorage.setItem(STAMP,JSON.stringify({removed,promoted,at:new Date().toISOString()}))}catch(e){}
    return{removed,promoted};
  }

  const first=syncMigrate_();

  async function resolveLocalCanonical_(){
    if(!window.Bridge?.ready?.())return;
    let q=read_(),changed=false,removed=0,enriched=0;
    const targets=q.filter(r=>r?.meta?.local===true&&String(r?.token||'').startsWith('C1:'));
    for(const rec of targets){
      try{
        const meta=await Bridge.identify(rec.token);
        if(!meta?.ok)continue;
        if(meta.ja_confirmada){
          q=q.filter(x=>x.id!==rec.id);removed++;changed=true;continue;
        }
        const i=q.findIndex(x=>x.id===rec.id);
        if(i>=0){
          q[i]={...q[i],meta:{...q[i].meta,...meta,local:false},updatedAt:new Date().toISOString()};
          enriched++;changed=true;
        }
      }catch(e){}
    }
    if(changed){
      // Reaplica a promoção conservadora depois do enriquecimento.
      save_(q);
      syncMigrate_();
      try{sessionStorage.setItem('sociosofia_omr_queue_backend_cleanup_v136',JSON.stringify({removed,enriched,at:new Date().toISOString()}))}catch(e){}
      location.reload();
    }
  }

  // Mostra o efeito da migração sem interromper o fluxo.
  window.addEventListener('DOMContentLoaded',()=>{
    const el=document.getElementById('batchStatus');
    if(el&&(first.removed||first.promoted)){
      const parts=[];
      if(first.promoted)parts.push(`${first.promoted} leitura(s) forte(s) promovida(s) para pronta`);
      if(first.removed)parts.push(`${first.removed} registro(s) já confirmado(s) removido(s) da fila`);
      el.textContent='v1.3.6 · '+parts.join(' · ')+'.';
      el.className='sendStatus show ok';
    }
    setTimeout(resolveLocalCanonical_,800);
  });
})();
