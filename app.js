const $=id=>document.getElementById(id),video=$('video'),overlay=$('overlay'),ctx=overlay.getContext('2d'),work=$('work'),wctx=work.getContext('2d',{willReadFrequently:true});
const statusEl=$('status'),qrText=$('qrText'),markersText=$('markersText'),alignmentText=$('alignmentText'),stateText=$('stateText'),resultBody=$('resultBody'),flash=$('flash'),dupbox=$('dupbox'),counter=$('counter');
const reviewCard=$('reviewCard'),reviewRows=$('reviewRows'),proofMeta=$('proofMeta'),sendStatus=$('sendStatus'),sendGoogleBtn=$('sendGoogleBtn'),reprocessBtn=$('reprocessBtn');
const googleBadge=$('googleBadge'),googleDialog=$('googleDialog'),googleUrl=$('googleUrl'),googleKey=$('googleKey');
let stream=null,timer=null,running=false,armed=true,stableFrames=0,lastGeom=null,lastQR='',barcodeDetector=null,pending=null;
let captures=JSON.parse(localStorage.getItem('omr_confirmed_tokens')||'[]');

function status(t){statusEl.textContent=t}
function save(){localStorage.setItem('omr_confirmed_tokens',JSON.stringify(captures));counter.textContent=`${captures.length} confirmada${captures.length===1?'':'s'}`}
save();
function setupBarcode(){if('BarcodeDetector'in window)try{barcodeDetector=new BarcodeDetector({formats:['qr_code']})}catch(e){}}
async function startCamera(){try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('getUserMedia indisponível.');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});video.srcObject=stream;await video.play();$('manualBtn').disabled=false;running=true;armed=true;setupBarcode();status('Alinhe os quatro cantos');timer=setInterval(analyzeLive,180)}catch(e){status('Não consegui abrir a câmera.');alert(e.message)}}
function frameToCanvas(maxW=720){if(!video.videoWidth)return false;const scale=Math.min(1,maxW/video.videoWidth);work.width=Math.round(video.videoWidth*scale);work.height=Math.round(video.videoHeight*scale);wctx.drawImage(video,0,0,work.width,work.height);return true}
async function detectQR(){if(barcodeDetector)try{const codes=await barcodeDetector.detect(work),c=codes.find(x=>x.rawValue?.startsWith('C1:'))||codes[0];if(c)return{text:c.rawValue,box:c.boundingBox}}catch(e){}return{text:'',box:null}}
function drawGuide(corners){overlay.width=work.width;overlay.height=work.height;ctx.clearRect(0,0,overlay.width,overlay.height);const info=alignmentInfo(corners,work.width,work.height),t=guideTargets(work.width,work.height);ctx.strokeStyle=info.ok?'#22c55e':'#f7c948';ctx.lineWidth=3;ctx.setLineDash([9,7]);ctx.beginPath();ctx.moveTo(t[0].x,t[0].y);ctx.lineTo(t[1].x,t[1].y);ctx.lineTo(t[3].x,t[3].y);ctx.lineTo(t[2].x,t[2].y);ctx.closePath();ctx.stroke();ctx.setLineDash([]);t.forEach((p,i)=>{const d=info.dists[i];ctx.strokeStyle=d==null?'#f7c948':d<.055?'#22c55e':d<.095?'#fb923c':'#ef4444';ctx.lineWidth=5;ctx.strokeRect(p.x-14,p.y-14,28,28)});if(corners.length===4){ctx.strokeStyle=info.ok?'#22c55e':'#fb923c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);ctx.lineTo(corners[1].x,corners[1].y);ctx.lineTo(corners[3].x,corners[3].y);ctx.lineTo(corners[2].x,corners[2].y);ctx.closePath();ctx.stroke();corners.forEach((p,i)=>{const d=info.dists[i];ctx.fillStyle=d<.055?'#22c55e':d<.095?'#fb923c':'#ef4444';ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill()})}alignmentText.textContent=info.ok?'4/4 alinhados':info.near?'quase lá':corners.length===4?'ajuste os cantos':'—';return info}
function alignmentHint(c,info){if(c.length!==4)return'Procure os 4 marcadores';if(info.ok)return'Mantenha imóvel…';const t=guideTargets(work.width,work.height),cx=c.reduce((a,p)=>a+p.x,0)/4,cy=c.reduce((a,p)=>a+p.y,0)/4,tx=t.reduce((a,p)=>a+p.x,0)/4,ty=t.reduce((a,p)=>a+p.y,0)/4,w=Math.hypot(c[1].x-c[0].x,c[1].y-c[0].y),tw=Math.hypot(t[1].x-t[0].x,t[1].y-t[0].y);if(w<tw*.82)return'Aproxime o celular';if(w>tw*1.18)return'Afaste o celular';if(cx<tx-work.width*.035)return'Mova para a esquerda';if(cx>tx+work.width*.035)return'Mova para a direita';if(cy<ty-work.height*.035)return'Mova para cima';if(cy>ty+work.height*.035)return'Mova para baixo';return'Ajuste a inclinação até os 4 cantos ficarem verdes'}
async function analyzeLive(){if(!running||!armed||pending||!frameToCanvas())return;const img=wctx.getImageData(0,0,work.width,work.height),qr=await detectQR(),corners=detectMarkers(img,qr.box),align=drawGuide(corners);markersText.textContent=`${corners.length}/4`;qrText.textContent=qr.text||'—';const good=corners.length===4&&align.ok&&qr.text.startsWith('C1:');if(!good){stableFrames=0;lastGeom=null;lastQR='';status(corners.length===4&&align.ok&&!qr.text.startsWith('C1:')?'Cantos alinhados — procurando QR':alignmentHint(corners,align));stateText.textContent=corners.length===4?'alinhando':'enquadrando';return}const move=geomDistance(lastGeom,corners);if(qr.text===lastQR&&move<5)stableFrames++;else stableFrames=0;lastGeom=corners;lastQR=qr.text;if(stableFrames<3){status('Mantenha imóvel…');stateText.textContent='estabilizando';return}captureCurrent(qr.text,corners,img)}

async function identifyToken(token){
 const fallback={ok:true,prova_id:'modo local',modelo_omr:'OMR-08-v1',qtd_questoes:8,local:true};
 if(!Bridge.ready())return fallback;
 try{const r=await Bridge.identify(token);if(r&&r.ok)return{...r,local:false};return fallback}catch(e){return fallback}
}

async function captureCurrent(token,corners,img){
 if(!armed||pending)return;armed=false;
 if(captures.includes(token)){dupbox.style.display='block';dupbox.textContent='Esta folha já foi confirmada neste aparelho.';status('Duplicata bloqueada');stateText.textContent='duplicata';return waitRemoval(token)}
 dupbox.style.display='none';
 status('Identificando modelo da folha…');stateText.textContent='identificando';
 const meta=await identifyToken(token);
 if(meta.ja_confirmada){dupbox.style.display='block';dupbox.textContent='O Google informa que esta folha já foi confirmada.';status('Folha já corrigida');stateText.textContent='duplicata';return waitRemoval(token)}
 try{
   if(!getOmrModel(meta.modelo_omr))throw new Error('Modelo OMR não suportado neste corretor: '+meta.modelo_omr);
   const qtd=Number(meta.qtd_questoes||8),rows=classify(bubbleScores(img,corners,meta.modelo_omr,qtd),qtd);
   pending={token,rows,meta};
   render(rows);renderReview(pending);
   flash.textContent='PLIM ✓';flash.classList.add('show');beep();setTimeout(()=>flash.classList.remove('show'),450);
   status('Leitura pronta — confira abaixo');stateText.textContent='aguardando confirmação';
 }catch(e){armed=true;status('Não consegui interpretar esta folha');stateText.textContent='erro';alert(e.message)}
}

function render(rows){resultBody.innerHTML='';for(const r of rows){const cls=r.state==='válida'?'ok':r.state==='revisar'?'warn':r.state==='dupla'?'bad':'blank';resultBody.insertAdjacentHTML('beforeend',`<tr><td><b>Q${r.q}</b></td><td><b>${r.answer}</b></td><td><span class="badge ${cls}">${r.state}</span></td><td>${r.max.toFixed(2)}</td></tr>`)}}
function renderReview(p){
 reviewRows.innerHTML='';reviewCard.classList.remove('hidden');sendStatus.className='sendStatus';sendStatus.textContent='';
 const m=p.meta;proofMeta.textContent=`${m.prova_id||'prova não identificada'} · ${m.modelo_omr} · ${m.qtd_questoes} questões${m.local?' · modo local':''}`;
 for(const r of p.rows){
   const attention=r.state==='dupla'||r.state==='revisar';
   const suggested=/^[A-E]$/.test(r.answer)?r.answer:'';
   const selected=r.state==='válida'?r.answer:r.state==='em branco'?'BRANCO':'';
   const options=['<option value="">confirmar…</option>',...'ABCDE'.split('').map(x=>`<option value="${x}" ${selected===x?'selected':''}>${x}</option>`),`<option value="BRANCO" ${selected==='BRANCO'?'selected':''}>em branco</option>`].join('');
   reviewRows.insertAdjacentHTML('beforeend',`<div class="reviewRow ${attention?'attention':''}"><b>Q${r.q}</b><div><span>${r.state}</span><small>${attention&&suggested?'leitura sugerida: '+suggested:'índice '+r.max.toFixed(2)}</small></div><select data-q="${r.q}" aria-label="Resposta final Q${r.q}">${options}</select></div>`);
 }
 sendGoogleBtn.disabled=!p.token.startsWith('C1:');
}
function finalAnswers(){return[...reviewRows.querySelectorAll('select')].map(s=>s.value)}
function setSendStatus(text,kind){sendStatus.textContent=text;sendStatus.className='sendStatus show '+kind}
function requestId(){return'cap_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g,'')}

async function sendPending(){
 if(!pending)return;
 if(!Bridge.ready()){setSendStatus('Configure primeiro a URL e a chave do Apps Script.','err');return}
 const finais=finalAnswers();if(finais.some(x=>!x)){setSendStatus('Há questão pendente de confirmação.','err');return}
 sendGoogleBtn.disabled=true;reprocessBtn.disabled=true;
 const id=requestId();
 try{
   setSendStatus('1/2 · registrando a leitura no Google…','wait');
   await Bridge.post({acao:'captura',request_id:id,token_correcao:pending.token,leituras:pending.rows});
   await Bridge.waitStatus(id,['CAPTURADA','CONFIRMADA'],12000);
   setSendStatus('2/2 · confirmando respostas e liberando o resultado…','wait');
   await Bridge.post({acao:'confirmar',captura_id:id,respostas_finais:finais});
   await Bridge.waitStatus(id,['CONFIRMADA'],12000);
   if(!captures.includes(pending.token))captures.push(pending.token);save();
   setSendStatus('Confirmada no Google ✓ O QR do aluno pode receber o resultado.','ok');
   status('Confirmada no Google ✓');stateText.textContent='confirmada';
   flash.textContent='GRAVADA ✓';flash.classList.add('show');beep();setTimeout(()=>flash.classList.remove('show'),650);
   waitRemoval(pending.token,true);
 }catch(e){setSendStatus(e.message,'err');sendGoogleBtn.disabled=false;reprocessBtn.disabled=false;status('Falha ao gravar — leitura preservada');stateText.textContent='erro de envio'}
}

function beep(){try{const ac=new(window.AudioContext||window.webkitAudioContext)(),o=ac.createOscillator(),g=ac.createGain();o.frequency.value=740;g.gain.value=.08;o.connect(g);g.connect(ac.destination);o.start();setTimeout(()=>{o.stop();ac.close()},90)}catch(e){}}
function waitRemoval(token,afterConfirm=false){stableFrames=0;lastGeom=null;lastQR='';let absent=0;const id=setInterval(async()=>{if(!frameToCanvas())return;const q=await detectQR();if(q.text!==token)absent++;else absent=0;if(absent>=3){clearInterval(id);armed=true;dupbox.style.display='none';if(afterConfirm){pending=null;setTimeout(()=>reviewCard.classList.add('hidden'),500)}status('Próxima folha');stateText.textContent='aguardando'}},220)}
async function manualCapture(){if(pending)return alert('Conclua ou refaça a leitura atual.');if(!frameToCanvas())return;const img=wctx.getImageData(0,0,work.width,work.height),qr=await detectQR(),corners=detectMarkers(img,qr.box);drawGuide(corners);if(corners.length!==4)return alert('Ainda não encontrei os quatro marcadores.');const token=qr.text.startsWith('C1:')?qr.text:'C1:DEMO-'+Date.now();captureCurrent(token,corners,img)}
async function processFile(f){if(!f)return;if(pending)return alert('Conclua ou refaça a leitura atual.');const bmp=await createImageBitmap(f),scale=Math.min(1,720/bmp.width);work.width=Math.round(bmp.width*scale);work.height=Math.round(bmp.height*scale);wctx.drawImage(bmp,0,0,work.width,work.height);setupBarcode();const img=wctx.getImageData(0,0,work.width,work.height),qr=await detectQR(),corners=detectMarkers(img,qr.box);drawGuide(corners);markersText.textContent=`${corners.length}/4`;qrText.textContent=qr.text||'—';if(corners.length!==4)return alert('Foto recebida, mas não localizei os quatro marcadores.');captureCurrent(qr.text.startsWith('C1:')?qr.text:'C1:FOTO-'+Date.now(),corners,img)}

function resetPending(){pending=null;reviewCard.classList.add('hidden');sendGoogleBtn.disabled=false;reprocessBtn.disabled=false;armed=true;stableFrames=0;lastGeom=null;lastQR='';status('Alinhe novamente');stateText.textContent='aguardando'}

function refreshGoogleBadge(){if(Bridge.ready()){googleBadge.textContent='configurado';googleBadge.className='connBadge wait'}else{googleBadge.textContent='não configurado';googleBadge.className='connBadge off'}}
async function testGoogle(){if(!Bridge.ready()){googleBadge.textContent='configure primeiro';googleBadge.className='connBadge err';return}googleBadge.textContent='testando…';googleBadge.className='connBadge wait';try{const r=await Bridge.ping();if(r&&r.ok){googleBadge.textContent='Google conectado';googleBadge.className='connBadge on'}else throw new Error()}catch(e){googleBadge.textContent='sem resposta';googleBadge.className='connBadge err'}}

$('startBtn').onclick=startCamera;$('manualBtn').onclick=manualCapture;$('fileInput').onchange=e=>{processFile(e.target.files[0]);e.target.value=''};
$('clearBtn').onclick=()=>{if(confirm('Limpar apenas o histórico local de folhas confirmadas?')){captures=[];save();resultBody.innerHTML='<tr><td colspan="4">Sessão limpa.</td></tr>'}};
sendGoogleBtn.onclick=sendPending;reprocessBtn.onclick=resetPending;
$('configGoogleBtn').onclick=()=>{const c=Bridge.cfg();googleUrl.value=c.url;googleKey.value=c.key;googleDialog.showModal()};
$('saveGoogleBtn').onclick=e=>{e.preventDefault();try{Bridge.setConfig(googleUrl.value,googleKey.value);googleDialog.close();refreshGoogleBadge();testGoogle()}catch(err){alert(err.message)}};
$('testGoogleBtn').onclick=testGoogle;
refreshGoogleBadge();
