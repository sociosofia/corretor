/* Sociosofia OMR · v1.3
   Atalho seguro para o painel de conciliação servido pelo Apps Script v0.3+.
   Também carrega as extensões de precisão e revisão nominal da operação em série.
*/
(()=>{
  const btn=document.getElementById('openReconcileBtn');

  const apiNumber=v=>{
    const n=parseFloat(String(v||'').replace(',','.'));
    return Number.isFinite(n)?n:0;
  };

  async function refresh(){
    if(!btn)return;
    if(!Bridge.ready()){
      btn.disabled=true;
      btn.title='Configure primeiro o backend do Google.';
      return;
    }
    try{
      const r=await Bridge.ping();
      const ok=r&&r.ok&&apiNumber(r.api)>=.3&&r.conciliacao;
      btn.disabled=!ok;
      btn.title=ok?'Abrir conciliação por prova e turma':'Atualize o Apps Script para a ponte v0.3.';
    }catch(e){
      btn.disabled=true;
      btn.title='Backend indisponível no momento.';
    }
  }

  if(btn){
    btn.onclick=async()=>{
      if(!Bridge.ready())return alert('Configure primeiro a URL do Apps Script.');
      try{
        const r=await Bridge.ping();
        if(!r||!r.ok||apiNumber(r.api)<.3||!r.conciliacao){
          return alert('A conciliação exige a ponte Apps Script v0.3 ou superior.');
        }
        const cfg=Bridge.cfg();
        const u=new URL(cfg.url);
        u.searchParams.set('api_corretor','painel');
        const w=window.open(u.toString(),'_blank','noopener');
        if(!w)location.href=u.toString();
      }catch(e){
        alert('Não consegui abrir a conciliação agora. '+(e.message||''));
      }
    };
    setTimeout(refresh,500);
    document.getElementById('testGoogleBtn')?.addEventListener('click',()=>setTimeout(refresh,1200));
  }

  function loadExtension(src){
    if(document.querySelector(`script[data-sociosofia-ext="${src}"]`))return;
    const s=document.createElement('script');
    s.src=src+'?v=1.3.0';
    s.async=false;
    s.dataset.sociosofiaExt=src;
    document.body.appendChild(s);
  }
  loadExtension('precision-v13.js');
  loadExtension('review-browser.js');
})();
