/* Sociosofia OMR · v1.2 operacional
   Fluxo contínuo: leituras seguras entram como prontas; divergências entram na fila
   de revisão sem interromper a captura. Fila local persistente, re-leitura rápida,
   envio em lote e importação local de PDF.
*/
(()=>{
  const QUEUE_KEY='sociosofia_omr_queue_v1';
  const CFG_KEY='sociosofia_omr_series_cfg_v2';
  const PDFJS_VERSION='6.2.108';
  const PDFJS_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
  const PDFJS_WORKER_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;

  let backendApi=null;
  let queue=loadJson_(QUEUE_KEY,[]);
  let seriesCfg={auto:true,destination:'local',...loadJson_(CFG_KEY,{})};
  let pdfBusy=false,pdfLibPromise=null;

  const autoSafe=$('autoSafe'),queueDestination=$('queueDestination'),seriesBadge=$('seriesBadge');
  const queueReadyCount=$('queueReadyCount'),queueReviewCount=$('queueReviewCount'),queueTotalCount=$('queueTotalCount');
  const sendQueueBtn=$('sendQueueBtn'),reviewNextBtn=$('reviewNextBtn'),queueList=$('queueList'),batchStatus=$('batchStatus');
  const saveQueueBtn=$('saveQueueBtn'),stashReviewBtn=$('stashReviewBtn'),reviewSafety=$('reviewSafety');
  const retryCaptureBtn=$('retryCaptureBtn'),pdfInput=$('pdfInput'),pdfStatus=$('pdfStatus');

  function loadJson_(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}}
  function saveQueue_(){localStorage.setItem(QUEUE_KEY,JSON.stringify(queue));renderQueue_()}
  function saveCfg_(){localStorage.setItem(CFG_KEY,JSON.stringify(seriesCfg))}
  function setBatch_(text,kind='wait'){if(!batchStatus)return;batchStatus.textContent=text;batchStatus.className='sendStatus show '+kind}
  function setPdf_(text,kind='wait'){if(!pdfStatus)return;pdfStatus.textContent=text;pdfStatus.className='sendStatus show '+kind}
  function apiNumber_(v){const n=parseFloat(String(v||'').replace(',','.'));return Number.isFinite(n)?n:0}

  async function backendSupportsSeparatedRelease_(force=false){
    if(!Bridge.ready())return false;
    if(!force&&backendApi!=null)return apiNumber_(backendApi)>=.2;
    try{
      const r=await Bridge.ping();backendApi=r?.api||'0';
      if(apiNumber_(backendApi)>=.2){seriesBadge.textContent='backend v'+backendApi;seriesBadge.className='connBadge on';return true}
      seriesBadge.textContent='backend v'+backendApi+' · atualizar';seriesBadge.className='connBadge err';return false;
    }catch(e){seriesBadge.textContent='backend indisponível';seriesBadge.className='connBadge err';return false}
  }

  function safety_(p){
    const reasons=[],rows=p?.rows||[],burst=p?.burst||window.__omrLastBurst||{},source=p?.source||burst?.source||'camera';
    if(p?.meta?.local)reasons.push('prova não confirmada pelo backend');
    if(!String(p?.token||'').startsWith('C1:'))reasons.push('QR não canônico');
    if(rows.length!==Number(p?.meta?.qtd_questoes||rows.length))reasons.push('quantidade divergente');
    if(rows.some(r=>r.state!=='válida'))reasons.push('há item não classificado como válido');
    const minTop=rows.length?Math.min(...rows.map(r=>Number(r.max||0))):0;
    const minGap=rows.length?Math.min(...rows.map(r=>Number(r.gap||0))):0;
    const minContrast=rows.length?Math.min(...rows.map(r=>Number(r.contrast||0))):0;
    if(minTop<.42)reasons.push('confiança absoluta abaixo de 0,42');
    if(minGap<.15)reasons.push('separação Δ abaixo de 0,15');
    if(minContrast<.18)reasons.push('contraste relativo abaixo de 0,18');
    if(source!=='pdf'&&Number(burst.frames||0)<3)reasons.push('rajada curta');
    if(burst.anchor!=='QR')reasons.push('geometria sem âncora QR');
    return{ok:reasons.length===0,reasons,minTop,minGap,minContrast,burst,source};
  }

  function upsertRecord_(p,finalAnswers,state='ready'){
    const existingId=p?.__queueId,sameToken=queue.find(x=>x.token===p.token),id=existingId||sameToken?.id||requestId();
    const rec={id,token:p.token,meta:p.meta,rows:p.rows,finalAnswers:finalAnswers||null,state,
      source:p.source||sameToken?.source||'camera',sourcePage:p.sourcePage||sameToken?.sourcePage||null,
      createdAt:sameToken?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
      burst:p.burst||window.__omrLastBurst||null};
    const idx=queue.findIndex(x=>x.id===id||x.token===p.token);if(idx>=0)queue[idx]=rec;else queue.push(rec);saveQueue_();return rec;
  }
  function removeRecord_(id){queue=queue.filter(x=>x.id!==id);saveQueue_()}
  function queuedToken_(token){return queue.some(x=>x.token===token)}

  function renderQueue_(){
    const ready=queue.filter(x=>x.state==='ready').length,review=queue.filter(x=>x.state==='review').length;
    if(queueReadyCount)queueReadyCount.textContent=ready;if(queueReviewCount)queueReviewCount.textContent=review;if(queueTotalCount)queueTotalCount.textContent=queue.length;
    if(sendQueueBtn)sendQueueBtn.disabled=ready===0;if(reviewNextBtn)reviewNextBtn.disabled=review===0;if(!queueList)return;
    if(!queue.length){queueList.innerHTML='<div class="queueEmpty">Fila local vazia.</div>';return}
    queueList.innerHTML=queue.slice(0,80).map(x=>{const label=x.state==='ready'?'pronta':'revisão',cls=x.state==='ready'?'ok':'warn';
      const who=x.meta?.nome?`${x.meta.nome} · ${x.meta?.turma||''}`:(x.meta?.prova_id||'prova');const src=x.source==='pdf'?(x.sourcePage?`PDF p.${x.sourcePage}`:'PDF'):'câmera';
      return `<div class="queueItem"><div><b>${who}</b><small>${x.meta?.prova_id||''} · ${src} · ${new Date(x.updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div><span class="badge ${cls}">${label}</span></div>`}).join('')+(queue.length>80?`<div class="queueEmpty">+ ${queue.length-80} item(ns)</div>`:'');
  }

  function clearDiagnostic_(){try{ctx.clearRect(0,0,overlay.width,overlay.height)}catch(e){}}
  function resetEphemeralCapture_(message='Leitura reiniciada · mantenha esta folha'){
    pending=null;reviewCard.classList.add('hidden');clearDiagnostic_();stableFrames=0;lastGeom=null;lastQR='';armed=true;dupbox.style.display='none';window.__omrLastBurst=null;
    if(typeof resetCaptureLock==='function')resetCaptureLock();status(message);stateText.textContent='aguardando captura';
  }
  function retryCapture_(){
    const visible=String(qrText?.textContent||'').trim(),queued=queue.find(x=>x.token===visible);
    if(queued){const recent=Date.now()-Date.parse(queued.updatedAt||0)<30000;if(recent){if(!confirm('Esta folha acabou de ser guardada na fila. Apagar essa leitura e tentar a mesma folha novamente?'))return;removeRecord_(queued.id)}else{return alert('Esta folha já existe na fila. Abra a revisão pendente se quiser alterá-la.')}}
    resetEphemeralCapture_();
  }

  waitRemoval=function(token,afterConfirm=false){
    stableFrames=0;lastGeom=null;lastQR='';if(typeof resetCaptureLock==='function')resetCaptureLock();let absent=0;
    const id=setInterval(async()=>{if(!frameToCanvas())return;const q=await detectQR();if(q.text!==token)absent++;else absent=0;if(absent>=3){clearInterval(id);armed=true;dupbox.style.display='none';if(afterConfirm){pending=null;setTimeout(()=>reviewCard.classList.add('hidden'),120)}clearDiagnostic_();status('Próxima folha');stateText.textContent='aguardando'}},180);
  };

  function finishLocal_(token,message){pending=null;reviewCard.classList.add('hidden');status(message);stateText.textContent='fila local';flash.textContent='FILA ✓';flash.classList.add('show');beep();setTimeout(()=>flash.classList.remove('show'),520);waitRemoval(token,false)}

  async function sendRecord_(rec){
    if(rec.state!=='ready'||!Array.isArray(rec.finalAnswers)||rec.finalAnswers.some(x=>!x))throw new Error('Item ainda precisa de revisão.');
    if(!await backendSupportsSeparatedRelease_())throw new Error('Atualize o Apps Script para a ponte v0.2 ou superior antes de confirmar correções reais.');
    const latest=await Bridge.identify(rec.token);if(latest?.ja_confirmada){if(!captures.includes(rec.token))captures.push(rec.token);save();removeRecord_(rec.id);return{already:true}}
    await Bridge.post({acao:'captura',request_id:rec.id,token_correcao:rec.token,leituras:rec.rows});await Bridge.waitStatus(rec.id,['CAPTURADA','CONFIRMADA'],12000);
    await Bridge.post({acao:'confirmar',captura_id:rec.id,respostas_finais:rec.finalAnswers});await Bridge.waitStatus(rec.id,['CONFIRMADA'],12000);
    if(!captures.includes(rec.token))captures.push(rec.token);save();removeRecord_(rec.id);return{already:false};
  }

  async function sendCurrent_(){
    if(!pending)return;const finais=finalAnswers();if(finais.some(x=>!x)){setSendStatus('Há questão pendente de confirmação.','err');return}
    const rec=upsertRecord_(pending,finais,'ready');sendGoogleBtn.disabled=true;reprocessBtn.disabled=true;
    try{setSendStatus('Registrando correção no Google…','wait');await sendRecord_(rec);setSendStatus('Correção registrada ✓ publicação ao aluno continua separada.','ok');status('Corrigida no Google ✓');stateText.textContent='corrigida';const token=pending.token;if(pending.__fromQueue){pending=null;reviewCard.classList.add('hidden');clearDiagnostic_();renderQueue_()}else waitRemoval(token,true)}
    catch(e){setSendStatus(e.message+' A leitura ficou preservada na fila local.','err');sendGoogleBtn.disabled=false;reprocessBtn.disabled=false;status('Preservada localmente · envio pendente');stateText.textContent='fila local'}
  }

  function saveCurrentToQueue_(){
    if(!pending)return;const finais=finalAnswers();if(finais.some(x=>!x)){setSendStatus('Resolva as questões pendentes antes de guardar como pronta.','err');return}upsertRecord_(pending,finais,'ready');const token=pending.token;
    if(pending.__fromQueue){pending=null;reviewCard.classList.add('hidden');clearDiagnostic_();renderQueue_();setBatch_('Revisão atualizada e pronta para envio.','ok')}else finishLocal_(token,'Confirmada e guardada neste aparelho ✓');
  }
  function stashReview_(){if(!pending)return;upsertRecord_(pending,null,'review');const token=pending.token;if(pending.__fromQueue){pending=null;reviewCard.classList.add('hidden');clearDiagnostic_();renderQueue_();setBatch_('Mantida na fila de revisão.','wait')}else finishLocal_(token,'Separada para revisão posterior ✓')}

  function loadNextReview_(){
    if(pending)return alert('Conclua a leitura atual primeiro.');const rec=queue.find(x=>x.state==='review');if(!rec)return setBatch_('Não há revisões pendentes.','ok');
    armed=false;pending={token:rec.token,rows:rec.rows,meta:rec.meta,burst:rec.burst,source:rec.source,sourcePage:rec.sourcePage,__queueId:rec.id,__fromQueue:true};render(rec.rows);renderReview(pending);
    if(reviewSafety){const s=safety_(pending),src=rec.source==='pdf'?(rec.sourcePage?`PDF · página ${rec.sourcePage}`:'PDF'):'câmera';reviewSafety.textContent=`${src} · `+(s.reasons.join(' · ')||'revisão manual')}
    status('Revisão da fila local');stateText.textContent='revisão manual';reviewCard.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function sendBatch_(){
    const ready=queue.filter(x=>x.state==='ready'),review=queue.filter(x=>x.state==='review');
    if(!ready.length){if(review.length){setBatch_(`Há ${review.length} leitura(s) para revisão e nenhuma pronta para envio.`,'wait');return loadNextReview_()}return setBatch_('Não há correções prontas para enviar.','ok')}
    if(review.length){const go=confirm(`Há ${review.length} leitura(s) separada(s) para revisão. Enviar agora somente as ${ready.length} prontas e deixar as divergências para depois?`);if(!go){setBatch_('Envio adiado. Abrindo a primeira divergência.','wait');return loadNextReview_()}}
    if(!await backendSupportsSeparatedRelease_(true))return setBatch_('Atualize o backend antes do envio em lote.','err');
    sendQueueBtn.disabled=true;reviewNextBtn.disabled=true;let sent=0;
    for(const rec of [...ready]){try{setBatch_(`Enviando ${sent+1}/${ready.length} · ${rec.meta?.turma||''} ${rec.meta?.prova_id||'prova'}…`,'wait');await sendRecord_(rec);sent++}catch(e){setBatch_(`Lote pausado após ${sent}/${ready.length}. ${e.message} A fila restante foi preservada.`,'err');renderQueue_();return}}
    setBatch_(`${sent} correção(ões) registrada(s) no Google ✓ ${review.length?review.length+' ficaram para revisão.':'Nenhuma foi publicada ao aluno.'}`,'ok');renderQueue_();
  }

  const _captureCurrentSeries=captureCurrent;
  captureCurrent=async function(token,corners,img){
    if(queuedToken_(token)){armed=false;dupbox.style.display='block';dupbox.textContent='Esta folha já está guardada na fila local.';status('Duplicata local bloqueada');stateText.textContent='duplicata';return waitRemoval(token,false)}
    await _captureCurrentSeries(token,corners,img);if(!pending||pending.token!==token)return;pending.source='camera';pending.burst=window.__omrLastBurst||null;const s=safety_(pending);
    if(reviewSafety){reviewSafety.textContent=s.ok?`Leitura segura · mín. ${s.minTop.toFixed(2)} · Δ mín. ${s.minGap.toFixed(2)} · ${s.burst?.frames||0} frames`:'Leitura com ressalva · '+s.reasons.join(' · ');reviewSafety.className='reviewSafety '+(s.ok?'safe':'needsReview')}
    if(!seriesCfg.auto){status(s.ok?'Leitura pronta — confirmação manual':'Leitura pronta — confira antes de guardar');stateText.textContent=s.ok?'aguardando confirmação':'revisão manual';return}
    if(!s.ok){upsertRecord_(pending,null,'review');reviewCard.classList.add('hidden');return finishLocal_(token,'Guardada para revisão ⚠ · próxima folha')}
    const finais=pending.rows.map(r=>r.answer),rec=upsertRecord_(pending,finais,'ready');reviewCard.classList.add('hidden');
    if(seriesCfg.destination==='local')return finishLocal_(token,'Leitura segura · pronta para envio ✓');
    if(!await backendSupportsSeparatedRelease_())return finishLocal_(token,'Leitura segura · guardada localmente (backend indisponível)');
    try{status('Leitura segura · enviando automaticamente…');stateText.textContent='envio automático';await sendRecord_(rec);status('Enviada ✓ retire a folha');stateText.textContent='corrigida';flash.textContent='ENVIADA ✓';flash.classList.add('show');beep();setTimeout(()=>flash.classList.remove('show'),600);waitRemoval(token,true)}
    catch(e){finishLocal_(token,'Falha de rede · leitura segura preservada localmente ✓');setBatch_('O envio automático falhou; a correção ficou na fila local.','err')}
  };

  const _startCameraSeries=startCamera;
  startCamera=async function(){await _startCameraSeries();if(timer){clearInterval(timer);timer=setInterval(analyzeLive,125)}if(retryCaptureBtn)retryCaptureBtn.disabled=false};$('startBtn').onclick=startCamera;

  async function pdfLib_(){if(!pdfLibPromise){pdfLibPromise=import(PDFJS_URL).then(lib=>{if(lib?.GlobalWorkerOptions)lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return lib})}return pdfLibPromise}
  async function processPdf_(file){
    if(!file||pdfBusy)return;if(!Bridge.ready())return setPdf_('Configure o backend do Google antes de importar um PDF real.','err');
    pdfBusy=true;if(pdfInput)pdfInput.disabled=true;const wasRunning=running;running=false;let found=0,ready=0,review=0,duplicates=0,skipped=0,errors=[];
    try{
      setPdf_('Carregando leitor de PDF…','wait');const pdfjs=await pdfLib_(),bytes=new Uint8Array(await file.arrayBuffer()),doc=await pdfjs.getDocument({data:bytes}).promise;setupBarcode();
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        setPdf_(`PDF · página ${pageNo}/${doc.numPages} · ${found} folha(s) OMR encontrada(s)…`,'wait');const page=await doc.getPage(pageNo),base=page.getViewport({scale:1}),targetW=1500,scale=Math.max(1,Math.min(3.2,targetW/base.width)),viewport=page.getViewport({scale});
        work.width=Math.round(viewport.width);work.height=Math.round(viewport.height);wctx.clearRect(0,0,work.width,work.height);await page.render({canvasContext:wctx,viewport}).promise;
        const qr=await detectQR();if(!qr.text?.startsWith('C1:')){skipped++;continue}found++;if(queuedToken_(qr.text)||captures.includes(qr.text)){duplicates++;continue}
        const img=wctx.getImageData(0,0,work.width,work.height);let corners=null,anchor='finders';if(typeof qrAnchorUsable==='function'){corners=qrAnchorUsable(qr,work.width,work.height);if(corners)anchor='QR'}if(!corners)corners=detectMarkers(img,qr.box);if(!corners||corners.length!==4){errors.push(pageNo);continue}
        const meta=await identifyToken(qr.text);if(meta?.ja_confirmada){duplicates++;continue}
        try{if(!getOmrModel(meta.modelo_omr))throw new Error('modelo OMR não suportado');const qtd=Number(meta.qtd_questoes||8),rows=classify(bubbleScores(img,corners,meta.modelo_omr,qtd),qtd),p={token:qr.text,rows,meta,source:'pdf',sourcePage:pageNo,burst:{frames:1,elapsedMs:0,anchor,source:'pdf',sharpness:typeof frameSharpness_==='function'?frameSharpness_(img):0}},s=safety_(p);if(s.ok){upsertRecord_(p,rows.map(r=>r.answer),'ready');ready++}else{upsertRecord_(p,null,'review');review++}}
        catch(e){errors.push(pageNo)}
      }
      const parts=[`${found} folha(s) OMR encontrada(s)`,`${ready} pronta(s)`,`${review} para revisão`];if(duplicates)parts.push(`${duplicates} duplicata(s)`);if(errors.length)parts.push(`falha nas páginas ${errors.slice(0,12).join(', ')}${errors.length>12?'…':''}`);setPdf_(parts.join(' · ')+' ✓','ok');setBatch_('PDF processado localmente. Confira a fila e envie as prontas quando quiser.','ok');status('PDF processado · câmera pronta para continuar');stateText.textContent='aguardando';
    }catch(e){setPdf_('Não consegui processar o PDF: '+(e.message||e),'err')}
    finally{pdfBusy=false;if(pdfInput)pdfInput.disabled=false;running=wasRunning;renderQueue_()}
  }

  if(autoSafe){autoSafe.checked=!!seriesCfg.auto;autoSafe.onchange=()=>{seriesCfg.auto=autoSafe.checked;saveCfg_()}}
  if(queueDestination){queueDestination.value=seriesCfg.destination;queueDestination.onchange=()=>{seriesCfg.destination=queueDestination.value;saveCfg_()}}
  if(sendQueueBtn)sendQueueBtn.onclick=sendBatch_;if(reviewNextBtn)reviewNextBtn.onclick=loadNextReview_;if(saveQueueBtn)saveQueueBtn.onclick=saveCurrentToQueue_;if(stashReviewBtn)stashReviewBtn.onclick=stashReview_;if(retryCaptureBtn)retryCaptureBtn.onclick=retryCapture_;
  if(pdfInput)pdfInput.onchange=e=>{const f=e.target.files?.[0];e.target.value='';processPdf_(f)};sendGoogleBtn.onclick=sendCurrent_;
  const _reprocessBase=reprocessBtn.onclick;reprocessBtn.onclick=()=>{if(pending?.__fromQueue){pending=null;reviewCard.classList.add('hidden');clearDiagnostic_();armed=true;status('Revisão fechada');stateText.textContent='aguardando';return}_reprocessBase?.()};
  renderQueue_();if(Bridge.ready())backendSupportsSeparatedRelease_();
})();
