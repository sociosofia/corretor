const Bridge=(()=>{
  const KURL='sociosofia_corretor_exec_url',KKEY='sociosofia_corretor_chave';
  const cfg=()=>({url:(localStorage.getItem(KURL)||'').trim(),key:localStorage.getItem(KKEY)||''});
  const ready=()=>{const c=cfg();return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(c.url)&&c.key.length>=8};
  const setConfig=(url,key)=>{url=String(url||'').trim().replace(/\/$/,'');if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url))throw new Error('URL do Web App inválida.');if(String(key||'').length<8)throw new Error('A chave precisa ter pelo menos 8 caracteres.');localStorage.setItem(KURL,url);localStorage.setItem(KKEY,String(key));};
  const clear=()=>{localStorage.removeItem(KURL);localStorage.removeItem(KKEY)};
  function jsonp(params,timeout=8000){return new Promise((resolve,reject)=>{const c=cfg();if(!c.url)return reject(new Error('Google não configurado.'));const cb='__sociosofia_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);const qs=new URLSearchParams({...params,callback:cb});const s=document.createElement('script');let done=false;const end=(err,data)=>{if(done)return;done=true;clearTimeout(to);try{delete window[cb]}catch(e){}s.remove();err?reject(err):resolve(data)};window[cb]=data=>end(null,data);s.onerror=()=>end(new Error('Não consegui consultar o Apps Script.'));s.src=c.url+'?'+qs.toString();document.head.appendChild(s);const to=setTimeout(()=>end(new Error('Tempo esgotado ao consultar o Google.')),timeout)})}
  async function ping(){return jsonp({api_corretor:'ping'})}
  async function identify(token){return jsonp({api_corretor:'identificar',token:String(token||'').replace(/^C1:/i,'')})}
  async function status(capturaId){return jsonp({api_corretor:'status',captura_id:capturaId})}
  async function post(payload){const c=cfg();if(!ready())throw new Error('Configure URL e chave do Google.');await fetch(c.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...payload,chave:c.key})});return true}
  async function waitStatus(capturaId,accepted,timeout=10000){const wanted=new Set(accepted);const start=Date.now();let last=null;while(Date.now()-start<timeout){try{last=await status(capturaId);if(last&&wanted.has(last.estado))return last}catch(e){}await new Promise(r=>setTimeout(r,650))}throw new Error('O Google não confirmou a operação a tempo'+(last&&last.estado?' ('+last.estado+')':'')+'.')}
  return{cfg,ready,setConfig,clear,ping,identify,status,post,waitStatus};
})();
