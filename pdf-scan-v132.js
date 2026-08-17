/* Sociosofia OMR · PDF scanner v1.3.3
   Scanner/PDF usa o QR como referência geométrica primária, com cantos normalizados.
   Os marcadores físicos servem como fallback/validação. Tenta rotações 0/180/90/270,
   preserva a fila e recusa leituras geometricamente vazias em vez de inventar 8 brancos.
*/
(()=>{
  if(window.__omrPdfScanV133)return;
  window.__omrPdfScanV133=true;

  const input=document.getElementById('pdfInput');
  const pdfStatus=document.getElementById('pdfStatus');
  const batchStatus=document.getElementById('batchStatus');
  if(!input)return;

  const QUEUE_KEY='sociosofia_omr_queue_v1';
  const PDFJS_VERSION='6.2.108';
  const PDFJS_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
  const PDFJS_WORKER_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
  let busy=false,libPromise=null;

  function setPdf_(t,k='wait'){if(pdfStatus){pdfStatus.textContent=t;pdfStatus.className='sendStatus show '+k}}
  function setBatch_(t,k='wait'){if(batchStatus){batchStatus.textContent=t;batchStatus.className='sendStatus show '+k}}
  function readQueue_(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')||[]}catch(e){return[]}}
  function saveQueue_(q){localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}
  function requestId_(){return'cap_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g,'')}
  function localConfirmed_(token){try{return Array.isArray(captures)&&captures.includes(token)}catch(e){return false}}

  async function pdfLib_(){
    if(!libPromise)libPromise=import(PDFJS_URL).then(lib=>{if(lib?.GlobalWorkerOptions)lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return lib});
    return libPromise;
  }

  function qrPositionInside_(qr,corners){
    if(!qr?.box||!corners||corners.length!==4)return null;
    const cx=qr.box.x+qr.box.width/2,cy=qr.box.y+qr.box.height/2;
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    if(maxX===minX||maxY===minY)return null;
    return {nx:(cx-minX)/(maxX-minX),ny:(cy-minY)/(maxY-minY)};
  }

  function markerGeometryPlausible_(qr,corners){
    if(!corners||corners.length!==4)return false;
    const [tl,tr,bl,br]=corners;
    const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y);
    const left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y);
    const ratio=((top+bot)/2)/Math.max(1,(left+right)/2);
    const pos=qrPositionInside_(qr,corners);
    return ratio>1.75&&ratio<2.75&&pos&&pos.nx>.72&&pos.nx<1.02&&pos.ny>.15&&pos.ny<.86;
  }

  async function renderOrientation_(page,angle,targetW=1650){
    const rotation=((Number(page.rotate||0)+angle)%360+360)%360;
    const base=page.getViewport({scale:1,rotation});
    const scale=Math.max(1,Math.min(3.5,targetW/base.width));
    const viewport=page.getViewport({scale,rotation});
    work.width=Math.round(viewport.width);work.height=Math.round(viewport.height);
    wctx.clearRect(0,0,work.width,work.height);
    await page.render({canvasContext:wctx,viewport}).promise;
    const qr=await detectQR();
    if(!qr?.text?.startsWith('C1:'))return null;
    const img=wctx.getImageData(0,0,work.width,work.height);

    // Para scan plano, o QR já é um fiducial excelente e conhecido no formulário.
    // A normalização dos cantos (v1.3.3) torna isso robusto mesmo quando o PDF traz rotação 180°.
    let corners=typeof qrAnchorUsable==='function'?qrAnchorUsable(qr,work.width,work.height):null;
    let anchor=corners&&corners.length===4?'QR_SCAN':'NONE';

    // Fallback: só aceitamos marcadores físicos se a geometria também colocar o QR
    // no setor canônico direito da moldura. Isso evita escolher bolhas/textos como cantos.
    if(!corners||corners.length!==4){
      const m=detectMarkers(img,qr.box);
      if(markerGeometryPlausible_(qr,m)){corners=m;anchor='MARKERS_PDF'}
    }

    if(!corners||corners.length!==4)return {qr,img,corners:null,anchor:'NONE',rotation};
    return {qr,img,corners,anchor,rotation};
  }

  async function findPage_(page){
    let sawQr=null;
    for(const angle of [0,180,90,270]){
      const r=await renderOrientation_(page,angle);
      if(!r)continue;
      sawQr=sawQr||r;
      if(r.corners&&r.corners.length===4)return r;
    }
    return sawQr;
  }

  function safePdf_(rows,anchor){
    const reasons=[];
    if(!rows?.length)reasons.push('sem respostas');
    const globalMax=rows?.length?Math.max(...rows.map(r=>Number(r.max||0))):0;
    // O contorno vazio costuma produzir algum sinal. 0,00 em todas as questões indica
    // grade projetada fora da área útil, não oito respostas em branco.
    if(globalMax<.16)reasons.push('geometria OMR inválida');
    if(rows.some(r=>r.state!=='válida'))reasons.push('há item não válido');
    const minTop=rows.length?Math.min(...rows.map(r=>Number(r.max||0))):0;
    const minGap=rows.length?Math.min(...rows.map(r=>Number(r.gap||0))):0;
    const minContrast=rows.length?Math.min(...rows.map(r=>Number(r.contrast||0))):0;
    if(minTop<.42)reasons.push('confiança < 0,42');
    if(minGap<.15)reasons.push('Δ < 0,15');
    if(minContrast<.18)reasons.push('contraste < 0,18');
    if(anchor!=='QR_SCAN'&&anchor!=='MARKERS_PDF')reasons.push('geometria sem referência');
    return {ok:reasons.length===0,reasons,minTop,minGap,minContrast,globalMax};
  }

  function staleZeroPdf_(rec){
    return rec?.source==='pdf'&&Array.isArray(rec.rows)&&rec.rows.length>0&&rec.rows.every(r=>Number(r.max||0)<=.05);
  }

  function upsert_(q,p,finalAnswers,state){
    const old=q.find(x=>x.token===p.token),id=old?.id||requestId_();
    const rec={
      id,token:p.token,meta:p.meta,rows:p.rows,finalAnswers:finalAnswers||null,state,
      source:'pdf',sourcePage:p.sourcePage,
      createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
      burst:p.burst
    };
    const i=q.findIndex(x=>x.id===id||x.token===p.token);if(i>=0)q[i]=rec;else q.push(rec);
    return rec;
  }

  function restoreSummary_(){
    const raw=sessionStorage.getItem('sociosofia_pdf_summary_v133');if(!raw)return;
    sessionStorage.removeItem('sociosofia_pdf_summary_v133');
    try{const x=JSON.parse(raw);setPdf_(x.text,x.kind||'ok');setBatch_('PDF processado localmente. A fila já foi recarregada e está pronta para conferência.','ok')}catch(e){}
  }

  async function process_(file){
    if(!file||busy)return;
    if(!Bridge?.ready?.())return setPdf_('Configure o backend do Google antes de importar um PDF real.','err');
    busy=true;input.disabled=true;
    const wasRunning=typeof running!=='undefined'?running:false;if(typeof running!=='undefined')running=false;
    let found=0,ready=0,review=0,duplicates=0,replaced=0,skipped=0;const errors=[];
    try{
      setPdf_('Abrindo PDF…','wait');
      const pdfjs=await pdfLib_(),bytes=new Uint8Array(await file.arrayBuffer()),doc=await pdfjs.getDocument({data:bytes}).promise;
      setupBarcode();
      let q=readQueue_();

      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        setPdf_(`PDF · página ${pageNo}/${doc.numPages} · ${found} folha(s) encontrada(s)…`,'wait');
        const page=await doc.getPage(pageNo),r=await findPage_(page);
        if(!r?.qr?.text?.startsWith('C1:')){skipped++;continue}
        found++;
        const token=r.qr.text;

        const local=q.find(x=>x.token===token);
        if(local){
          if(staleZeroPdf_(local)){q=q.filter(x=>x.id!==local.id);replaced++}
          else{duplicates++;continue}
        }
        if(localConfirmed_(token)){duplicates++;continue}

        let meta;
        try{meta=await identifyToken(token)}catch(e){errors.push({page:pageNo,stage:'identificação'});continue}
        if(meta?.ja_confirmada){duplicates++;continue}
        if(!r.corners||r.corners.length!==4){errors.push({page:pageNo,stage:'geometria'});continue}

        try{
          if(!getOmrModel(meta.modelo_omr))throw new Error('modelo OMR não suportado');
          const qtd=Number(meta.qtd_questoes||8);
          const rows=classify(bubbleScores(r.img,r.corners,meta.modelo_omr,qtd),qtd);
          const s=safePdf_(rows,r.anchor);
          if(s.globalMax<.16)throw new Error('grade OMR fora da área útil');
          const p={token,rows,meta,sourcePage:pageNo,burst:{frames:1,elapsedMs:0,anchor:r.anchor,source:'pdf',rotation:r.rotation}};
          if(s.ok){upsert_(q,p,rows.map(x=>x.answer),'ready');ready++}
          else{upsert_(q,p,null,'review');review++}
          saveQueue_(q);
        }catch(e){errors.push({page:pageNo,stage:String(e?.message||'OMR').slice(0,60)})}
      }

      const parts=[`${found} folha(s) OMR encontrada(s)`,`${ready} pronta(s)`,`${review} para revisão`];
      if(replaced)parts.push(`${replaced} leitura(s) zerada(s) substituída(s)`);
      if(duplicates)parts.push(`${duplicates} duplicata(s) ignorada(s)`);
      if(skipped)parts.push(`${skipped} página(s) sem QR de correção`);
      if(errors.length)parts.push('falha: '+errors.slice(0,5).map(e=>`p.${e.page} ${e.stage}`).join(', ')+(errors.length>5?'…':''));
      const text=parts.join(' · ')+(errors.length?'':' ✓');
      sessionStorage.setItem('sociosofia_pdf_summary_v133',JSON.stringify({text,kind:errors.length?'err':'ok'}));
      setPdf_(text,errors.length?'err':'ok');
      setBatch_('Atualizando a fila local…','wait');
      setTimeout(()=>location.reload(),650);
    }catch(e){setPdf_('Não consegui processar o PDF: '+(e?.message||e),'err')}
    finally{busy=false;input.disabled=false;if(typeof running!=='undefined')running=wasRunning}
  }

  input.onchange=e=>{const f=e.target.files?.[0];e.target.value='';process_(f)};
  restoreSummary_();
})();
