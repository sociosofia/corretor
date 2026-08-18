/* Sociosofia OMR · exportação segura do cache local
   Exporta somente dados operacionais necessários à auditoria.
   NÃO inclui URL/chave do Apps Script.
*/
(()=>{
  if(window.__omrCacheExportV1)return;
  window.__omrCacheExportV1=true;

  const QUEUE_KEY='sociosofia_omr_queue_v1';
  const CONFIRMED_KEY='omr_confirmed_tokens';
  const CFG_KEY='sociosofia_omr_series_cfg_v2';

  function readJson_(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}
  }
  function pad_(n){return String(n).padStart(2,'0')}
  function stamp_(d=new Date()){
    return `${d.getFullYear()}${pad_(d.getMonth()+1)}${pad_(d.getDate())}-${pad_(d.getHours())}${pad_(d.getMinutes())}${pad_(d.getSeconds())}`;
  }
  function summarize_(queue){
    const summary={total:queue.length,ready:0,review:0,other:0,pdf:0,camera:0,byProof:{},byClass:{}};
    for(const r of queue){
      if(r?.state==='ready')summary.ready++;else if(r?.state==='review')summary.review++;else summary.other++;
      if(r?.source==='pdf')summary.pdf++;else summary.camera++;
      const prova=String(r?.meta?.prova_id||'SEM_PROVA');summary.byProof[prova]=(summary.byProof[prova]||0)+1;
      const turma=String(r?.meta?.turma||'SEM_TURMA');summary.byClass[turma]=(summary.byClass[turma]||0)+1;
    }
    return summary;
  }
  function exportCache_(){
    const queue=readJson_(QUEUE_KEY,[]);
    const confirmed=readJson_(CONFIRMED_KEY,[]);
    const seriesConfig=readJson_(CFG_KEY,{});
    const now=new Date();
    const payload={
      schema:'sociosofia-omr-cache-export/v1',
      exportedAt:now.toISOString(),
      note:'Exportação local para auditoria. URL e chave do Apps Script foram deliberadamente excluídas.',
      summary:summarize_(Array.isArray(queue)?queue:[]),
      cache:{
        [QUEUE_KEY]:Array.isArray(queue)?queue:[],
        [CONFIRMED_KEY]:Array.isArray(confirmed)?confirmed:[],
        [CFG_KEY]:seriesConfig&&typeof seriesConfig==='object'?seriesConfig:{}
      }
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`sociosofia-omr-cache-${stamp_(now)}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    const btn=document.getElementById('exportCacheBtn');
    if(btn){const old=btn.textContent;btn.textContent=`Cache exportado ✓ (${payload.summary.total})`;setTimeout(()=>btn.textContent=old,2200)}
  }

  function install_(){
    if(document.getElementById('exportCacheBtn'))return;
    const actions=document.querySelector('.seriesActions');
    if(!actions)return;
    const btn=document.createElement('button');
    btn.id='exportCacheBtn';btn.type='button';btn.textContent='Exportar cache';btn.title='Baixa um JSON da fila local e do histórico de confirmações, sem a chave do Google.';
    btn.addEventListener('click',exportCache_);
    actions.appendChild(btn);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install_);else install_();
  window.__omrExportCache=exportCache_;
})();
