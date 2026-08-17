/* Sociosofia OMR · QR fallback v1.3.1
   BarcodeDetector continua primário. Se ele não reconhecer o QR (caso observado
   em PDF rasterizado no Brave/Chrome), usamos jsQR localmente sobre o canvas.
   Nenhum conteúdo da prova é enviado ao CDN: só o código da biblioteca é baixado.
*/
(()=>{
  if(window.__omrQrFallbackV131)return;
  window.__omrQrFallbackV131=true;

  const nativeDetect=detectQR;
  const JSQR_URL='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  let loader=null;

  function loadJsQR_(){
    if(window.jsQR)return Promise.resolve(window.jsQR);
    if(loader)return loader;
    loader=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=JSQR_URL;
      s.async=true;
      s.crossOrigin='anonymous';
      s.onload=()=>window.jsQR?resolve(window.jsQR):reject(new Error('jsQR não carregou'));
      s.onerror=()=>reject(new Error('falha ao carregar jsQR'));
      document.head.appendChild(s);
    }).catch(e=>{loader=null;throw e});
    return loader;
  }

  function fromJsQR_(code){
    if(!code?.data||!code.location)return null;
    const l=code.location;
    const cp=[l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner]
      .map(p=>({x:Number(p.x),y:Number(p.y)}));
    if(cp.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const xs=cp.map(p=>p.x),ys=cp.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
    const box={x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
    return{text:String(code.data||''),box,cornerPoints:cp,decoder:'jsQR'};
  }

  detectQR=async function(){
    // 1) caminho nativo já usado pela câmera.
    try{
      const r=await nativeDetect();
      if(r?.text?.startsWith('C1:'))return r;
    }catch(e){}

    // 2) fallback para PDFs/imagens em que BarcodeDetector falha.
    try{
      const lib=await loadJsQR_();
      if(!work?.width||!work?.height)return{text:'',box:null,cornerPoints:[]};
      const img=wctx.getImageData(0,0,work.width,work.height);
      const code=lib(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
      const r=fromJsQR_(code);
      if(r?.text)return r;
    }catch(e){}

    return{text:'',box:null,cornerPoints:[]};
  };
})();
