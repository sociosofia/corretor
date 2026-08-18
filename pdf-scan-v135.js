/* Sociosofia OMR · PDF scanner v1.3.5
   Fechamento/auditoria de lote:
   - manifesto página a página do último PDF;
   - contagem por PROVA ÚNICA (token), separada de páginas/duplicatas;
   - duas leituras físicas concorrentes: detector global + refinamento local guiado pelo QR;
   - segunda passagem em maior resolução apenas quando a geometria/leitura fica fraca;
   - revisões PDF antigas só são substituídas quando a nova leitura é objetivamente melhor;
   - registros já confirmados no Google e leituras prontas nunca são sobrescritos.
*/
(()=>{
  if(window.__omrPdfScanV135)return;
  window.__omrPdfScanV135=true;

  const input=document.getElementById('pdfInput');
  const pdfStatus=document.getElementById('pdfStatus');
  const batchStatus=document.getElementById('batchStatus');
  if(!input)return;

  const QUEUE_KEY='sociosofia_omr_queue_v1';
  const MANIFEST_KEY='sociosofia_pdf_manifest_v1';
  const PDFJS_VERSION='6.2.108';
  const PDFJS_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
  const PDFJS_WORKER_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
  const BASE_W=1650,HIGH_W=2350;
  let busy=false,libPromise=null;

  function setPdf_(t,k='wait'){if(pdfStatus){pdfStatus.textContent=t;pdfStatus.className='sendStatus show '+k}}
  function setBatch_(t,k='wait'){if(batchStatus){batchStatus.textContent=t;batchStatus.className='sendStatus show '+k}}
  function readJson_(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}}
  function readQueue_(){const q=readJson_(QUEUE_KEY,[]);return Array.isArray(q)?q:[]}
  function saveQueue_(q){localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}
  function saveManifest_(m){localStorage.setItem(MANIFEST_KEY,JSON.stringify(m))}
  function requestId_(){return'cap_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g,'')}
  function clamp_(v,a,b){return Math.max(a,Math.min(b,v))}

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

  function squareDarkRatio_(img,cx,cy,half){
    const W=img.width,H=img.height,d=img.data;
    const x0=Math.max(0,Math.round(cx-half)),x1=Math.min(W-1,Math.round(cx+half));
    const y0=Math.max(0,Math.round(cy-half)),y1=Math.min(H-1,Math.round(cy+half));
    let n=0,dark=0;
    for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){
      const i=(y*W+x)*4;n++;
      if(lum(d[i],d[i+1],d[i+2])<115)dark++;
    }
    return n?dark/n:0;
  }

  function refineOneMarker_(img,p,searchR,half){
    if(!p)return null;
    const step=Math.max(2,Math.round(half*.55));
    let best=null,bestScore=-1;
    for(let y=p.y-searchR;y<=p.y+searchR;y+=step){
      for(let x=p.x-searchR;x<=p.x+searchR;x+=step){
        const score=squareDarkRatio_(img,x,y,half);
        if(score>bestScore){bestScore=score;best={x,y}}
      }
    }
    if(!best||bestScore<.34)return null;
    const W=img.width,H=img.height,d=img.data,r=Math.round(half*1.65);
    let sx=0,sy=0,n=0;
    for(let y=Math.max(0,Math.round(best.y-r));y<=Math.min(H-1,Math.round(best.y+r));y++){
      for(let x=Math.max(0,Math.round(best.x-r));x<=Math.min(W-1,Math.round(best.x+r));x++){
        const i=(y*W+x)*4;
        if(lum(d[i],d[i+1],d[i+2])<92){sx+=x;sy+=y;n++}
      }
    }
    return n>=18?{x:sx/n,y:sy/n,score:bestScore}:{...best,score:bestScore};
  }

  function refinedMarkersFromQR_(img,qr){
    if(typeof qrAnchorUsable!=='function'||!qr?.box)return[];
    const approx=qrAnchorUsable(qr,img.width,img.height);
    if(!approx||approx.length!==4)return[];
    const [tl,tr,bl,br]=approx;
    const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y);
    const left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y);
    const formW=(top+bot)/2,formH=(left+right)/2;
    const searchR=clamp_(Math.round(Math.min(formW*.060,formH*.14)),24,105);
    const half=clamp_(Math.round(Math.max(qr.box.width,qr.box.height)*.055),6,22);
    const refined=approx.map(p=>refineOneMarker_(img,p,searchR,half));
    if(refined.some(x=>!x))return[];
    const ordered=orderCorners(refined);
    return markerGeometryPlausible_(qr,ordered)?ordered:[];
  }

  function distinctCandidate_(list,corners){
    if(!corners||corners.length!==4)return false;
    if(typeof geomDistance!=='function')return true;
    return !list.some(x=>geomDistance(x.corners,corners)<5);
  }

  async function renderOrientation_(page,angle,targetW=BASE_W){
    const rotation=((Number(page.rotate||0)+angle)%360+360)%360;
    const base=page.getViewport({scale:1,rotation});
    const scale=Math.max(1,Math.min(4.2,targetW/base.width));
    const viewport=page.getViewport({scale,rotation});
    work.width=Math.round(viewport.width);work.height=Math.round(viewport.height);
    wctx.clearRect(0,0,work.width,work.height);
    await page.render({canvasContext:wctx,viewport}).promise;
    const qr=await detectQR();
    if(!qr?.text?.startsWith('C1:'))return null;
    const img=wctx.getImageData(0,0,work.width,work.height);
    const candidates=[];

    const global=detectMarkers(img,qr.box);
    if(markerGeometryPlausible_(qr,global))candidates.push({corners:global,anchor:'MARKERS_PDF'});

    const refined=refinedMarkersFromQR_(img,qr);
    if(refined.length===4&&distinctCandidate_(candidates,refined))candidates.push({corners:refined,anchor:'MARKERS_REFINE'});

    if(typeof qrAnchorUsable==='function'){
      const fromQr=qrAnchorUsable(qr,work.width,work.height);
      if(fromQr&&fromQr.length===4&&distinctCandidate_(candidates,fromQr))candidates.push({corners:fromQr,anchor:'QR_SCAN'});
    }
    return {qr,img,candidates,rotation,targetW};
  }

  async function findPageAtWidth_(page,targetW){
    let fallback=null;
    for(const angle of [0,180,90,270]){
      const r=await renderOrientation_(page,angle,targetW);
      if(!r)continue;
      const physical=r.candidates.filter(c=>c.anchor!=='QR_SCAN');
      if(physical.length){r.candidates=[...physical,...r.candidates.filter(c=>c.anchor==='QR_SCAN')];return r}
      if(!fallback)fallback=r;
    }
    return fallback;
  }

  function safePdf_(rows,anchor){
    const reasons=[];
    if(!rows?.length)reasons.push('sem respostas');
    const globalMax=rows?.length?Math.max(...rows.map(r=>Number(r.max||0))):0;
    if(globalMax<.16)reasons.push('geometria OMR inválida');
    if(rows.some(r=>r.state!=='válida'))reasons.push('há item não válido');
    const minTop=rows.length?Math.min(...rows.map(r=>Number(r.max||0))):0;
    const minGap=rows.length?Math.min(...rows.map(r=>Number(r.gap||0))):0;
    const minContrast=rows.length?Math.min(...rows.map(r=>Number(r.contrast||0))):0;
    if(minTop<.42)reasons.push('confiança < 0,42');
    if(minGap<.15)reasons.push('Δ < 0,15');
    if(minContrast<.18)reasons.push('contraste < 0,18');
    if(!String(anchor||'').startsWith('MARKERS_')&&anchor!=='MARKERS_PDF')reasons.push(anchor==='QR_SCAN'?'QR sem validação pelos 4 marcadores':'geometria sem referência');
    return {ok:reasons.length===0,reasons,minTop,minGap,minContrast,globalMax};
  }

  function qualityRows_(rows,anchor=''){
    if(!Array.isArray(rows)||!rows.length)return -999;
    let valid=0,review=0,blank=0,double=0,sum=0;
    for(const r of rows){
      if(r.state==='válida')valid++;else if(r.state==='revisar')review++;else if(r.state==='dupla')double++;else blank++;
      sum+=Number(r.max||0);
    }
    const physical=String(anchor).startsWith('MARKERS_')||anchor==='MARKERS_PDF';
    return valid*100+review*18+double*12-blank*25+(sum/rows.length)*20+(physical?8:0);
  }

  function evaluate_(r,meta){
    if(!r?.candidates?.length)return null;
    const qtd=Number(meta.qtd_questoes||8),evaluated=[];
    for(const c of r.candidates){
      try{
        const rows=classify(bubbleScores(r.img,c.corners,meta.modelo_omr,qtd),qtd);
        const safety=safePdf_(rows,c.anchor);
        evaluated.push({...c,rows,safety,quality:qualityRows_(rows,c.anchor)});
      }catch(e){}
    }
    if(!evaluated.length)return null;
    evaluated.sort((a,b)=>b.quality-a.quality);
    return {...evaluated[0],rotation:r.rotation,targetW:r.targetW};
  }

  function oldQuality_(rec){return qualityRows_(rec?.rows||[],String(rec?.burst?.anchor||''))}
  function canReplace_(old,next){
    if(!old)return true;
    if(old.state==='ready')return false;
    if(old.source!=='pdf')return false;
    if(old.state!=='review')return false;
    const oq=oldQuality_(old),nq=next?.quality??-999;
    const oldAnchor=String(old?.burst?.anchor||'');
    const newAnchor=String(next?.anchor||'');
    if(oldAnchor==='QR_SCAN'&&newAnchor.startsWith('MARKERS_')&&nq>=oq-2)return true;
    return nq>oq+12;
  }

  function upsert_(q,p,finalAnswers,state){
    const old=q.find(x=>x.token===p.token),id=old?.id||requestId_();
    const rec={
      id,token:p.token,meta:p.meta,rows:p.rows,finalAnswers:finalAnswers||null,state,
      source:'pdf',sourcePage:p.sourcePage,
      createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),burst:p.burst
    };
    const i=q.findIndex(x=>x.id===id||x.token===p.token);if(i>=0)q[i]=rec;else q.push(rec);
    return rec;
  }

  function manifestPage_(pageNo){return {page:pageNo,status:'processing',qr:false,token:'',aluno_id:'',nome:'',turma:'',prova_id:'',anchor:'',rotation:null,resolution:null,queueState:'',duplicateOf:null,error:''}}
  function applyMeta_(m,meta){
    if(!meta)return;
    m.aluno_id=String(meta.aluno_id||'');m.nome=String(meta.nome||'');m.turma=String(meta.turma||'');m.prova_id=String(meta.prova_id||'');
  }

  function restoreSummary_(){
    const raw=sessionStorage.getItem('sociosofia_pdf_summary_v135');if(!raw)return;
    sessionStorage.removeItem('sociosofia_pdf_summary_v135');
    try{const x=JSON.parse(raw);setPdf_(x.text,x.kind||'ok');setBatch_('PDF processado localmente. O manifesto do lote foi salvo e entrará no próximo “Exportar cache”.','ok')}catch(e){}
  }

  async function process_(file){
    if(!file||busy)return;
    if(!Bridge?.ready?.())return setPdf_('Configure o backend do Google antes de importar um PDF real.','err');
    busy=true;input.disabled=true;
    const wasRunning=typeof running!=='undefined'?running:false;if(typeof running!=='undefined')running=false;

    let q=readQueue_();
    let pagesWithQr=0,duplicatePages=0,ready=0,review=0,upgraded=0,confirmed=0,noQr=0,errors=0,highPass=0;
    const seen=new Map(),metaCache=new Map(),manifestPages=[];
    try{
      setPdf_('Abrindo PDF…','wait');
      const pdfjs=await pdfLib_(),bytes=new Uint8Array(await file.arrayBuffer()),doc=await pdfjs.getDocument({data:bytes}).promise;
      setupBarcode();

      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        setPdf_(`PDF · página ${pageNo}/${doc.numPages} · ${seen.size} prova(s) única(s)…`,'wait');
        const mp=manifestPage_(pageNo);manifestPages.push(mp);
        const page=await doc.getPage(pageNo);
        let r=await findPageAtWidth_(page,BASE_W);
        if(!r?.qr?.text?.startsWith('C1:')){
          r=await findPageAtWidth_(page,HIGH_W);if(r)highPass++;
        }
        if(!r?.qr?.text?.startsWith('C1:')){mp.status='no_qr';mp.error='QR de correção não localizado';noQr++;continue}

        pagesWithQr++;mp.qr=true;mp.token=r.qr.text;mp.rotation=r.rotation;mp.resolution=r.targetW;
        const token=r.qr.text;
        if(seen.has(token)){duplicatePages++;mp.duplicateOf=seen.get(token)}else seen.set(token,pageNo);

        let meta=metaCache.get(token);
        if(!meta){
          try{meta=await identifyToken(token);metaCache.set(token,meta||{})}
          catch(e){mp.status='identify_error';mp.error='falha de identificação';errors++;continue}
        }
        applyMeta_(mp,meta);

        if(meta?.ja_confirmada){mp.status='confirmed';mp.queueState='google';confirmed++;continue}

        const local=q.find(x=>x.token===token);
        if(local?.state==='ready'){mp.status=mp.duplicateOf?'duplicate_ready':'local_ready';mp.queueState='ready';continue}
        if(local&&local.source!=='pdf'){mp.status='local_non_pdf';mp.queueState=local.state||'';mp.error='registro local preservado (origem não PDF)';continue}

        if(!getOmrModel(meta.modelo_omr)){mp.status='model_error';mp.error='modelo OMR não suportado';errors++;continue}
        let best=evaluate_(r,meta);

        const weak=!best||best.safety.globalMax<.16||best.rows.filter(x=>x.state==='válida').length<6;
        if(weak&&r.targetW!==HIGH_W){
          const hi=await findPageAtWidth_(page,HIGH_W);highPass++;
          if(hi?.qr?.text===token){
            const b2=evaluate_(hi,meta);
            if(b2&&(!best||b2.quality>best.quality)){best=b2;r=hi}
          }
        }

        if(!best){mp.status='geometry_error';mp.error='nenhuma geometria OMR utilizável';errors++;continue}
        mp.anchor=best.anchor;mp.rotation=best.rotation;mp.resolution=best.targetW;
        if(best.safety.globalMax<.16){mp.status='geometry_error';mp.error='grade OMR fora da área útil';errors++;continue}

        const next={quality:best.quality,anchor:best.anchor};
        if(local&&!canReplace_(local,next)){
          mp.status=mp.duplicateOf?'duplicate_preserved':'review_preserved';mp.queueState=local.state||'';mp.error='leitura existente preservada por ser igual ou melhor';continue
        }

        const p={token,rows:best.rows,meta,sourcePage:pageNo,burst:{frames:1,elapsedMs:0,anchor:best.anchor,source:'pdf',rotation:best.rotation,geometryVersion:'1.3.5',renderWidth:best.targetW,quality:best.quality}};
        const state=best.safety.ok?'ready':'review';
        upsert_(q,p,state==='ready'?best.rows.map(x=>x.answer):null,state);
        if(local)upgraded++;
        if(state==='ready')ready++;else review++;
        mp.status=state;mp.queueState=state;
        saveQueue_(q);
      }

      const manifest={
        schema:'sociosofia-pdf-manifest/v1',
        generatedAt:new Date().toISOString(),scannerVersion:'1.3.5',
        file:{name:String(file.name||''),size:Number(file.size||0),lastModified:Number(file.lastModified||0),pages:doc.numPages},
        summary:{pages:doc.numPages,pagesWithQr,uniqueTokens:seen.size,duplicatePages,noQr,confirmedPages:confirmed,readyWrites:ready,reviewWrites:review,upgraded,errors,highResolutionPasses:highPass},
        pages:manifestPages
      };
      saveManifest_(manifest);

      const parts=[`${doc.numPages} página(s)`,`${pagesWithQr} com QR`,`${seen.size} prova(s) única(s)`,`${duplicatePages} página(s) repetida(s)`];
      if(confirmed)parts.push(`${confirmed} ocorrência(s) já confirmada(s)`);
      if(ready)parts.push(`${ready} pronta(s)`);
      if(review)parts.push(`${review} para revisão`);
      if(upgraded)parts.push(`${upgraded} revisão(ões) melhorada(s)`);
      if(noQr)parts.push(`${noQr} sem QR`);
      if(errors)parts.push(`${errors} falha(s) registrada(s) no manifesto`);
      const text=parts.join(' · ')+(errors||noQr?'':' ✓');
      sessionStorage.setItem('sociosofia_pdf_summary_v135',JSON.stringify({text,kind:(errors||noQr)?'err':'ok'}));
      setPdf_(text,(errors||noQr)?'err':'ok');
      setBatch_('Atualizando fila e manifesto local…','wait');
      setTimeout(()=>location.reload(),650);
    }catch(e){setPdf_('Não consegui processar o PDF: '+(e?.message||e),'err')}
    finally{busy=false;input.disabled=false;if(typeof running!=='undefined')running=wasRunning}
  }

  input.onchange=e=>{const f=e.target.files?.[0];e.target.value='';process_(f)};
  restoreSummary_();
})();
