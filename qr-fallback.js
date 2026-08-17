/* Sociosofia OMR · QR fallback v1.3.3
   BarcodeDetector continua primário. Se ele não reconhecer o QR (caso observado
   em PDF rasterizado no Brave/Chrome), usamos jsQR localmente sobre o canvas.
   Os quatro cantos são normalizados pela geometria da imagem (TL,TR,BR,BL),
   independentemente da orientação interna devolvida pelo decodificador.
*/
(()=>{
  if(window.__omrQrFallbackV133)return;
  window.__omrQrFallbackV133=true;

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

  function normalizeCorners_(points){
    if(!Array.isArray(points)||points.length!==4)return[];
    const p=points.map(z=>({x:Number(z.x),y:Number(z.y)}));
    if(p.some(z=>!Number.isFinite(z.x)||!Number.isFinite(z.y)))return[];
    const tl=p.reduce((a,b)=>a.x+a.y<b.x+b.y?a:b);
    const br=p.reduce((a,b)=>a.x+a.y>b.x+b.y?a:b);
    const tr=p.reduce((a,b)=>a.x-a.y>b.x-b.y?a:b);
    const bl=p.reduce((a,b)=>a.x-a.y<b.x-b.y?a:b);
    const out=[tl,tr,br,bl];
    if(new Set(out.map(z=>`${Math.round(z.x)},${Math.round(z.y)}`)).size!==4)return[];
    return out.map(z=>({x:z.x,y:z.y}));
  }

  function normalizeResult_(r,decoder){
    if(!r?.text)return r;
    const cp=normalizeCorners_(r.cornerPoints||[]);
    let box=r.box||null;
    if(cp.length===4){
      const xs=cp.map(p=>p.x),ys=cp.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
      box={x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
    }
    return {...r,box,cornerPoints:cp,decoder:decoder||r.decoder||'native'};
  }

  function fromJsQR_(code){
    if(!code?.data||!code.location)return null;
    const l=code.location;
    const raw=[l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner]
      .map(p=>({x:Number(p.x),y:Number(p.y)}));
    const cp=normalizeCorners_(raw);
    if(cp.length!==4)return null;
    const xs=cp.map(p=>p.x),ys=cp.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
    const box={x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
    return{text:String(code.data||''),box,cornerPoints:cp,decoder:'jsQR'};
  }

  detectQR=async function(){
    try{
      const r=await nativeDetect();
      if(r?.text?.startsWith('C1:'))return normalizeResult_(r,'BarcodeDetector');
    }catch(e){}

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
