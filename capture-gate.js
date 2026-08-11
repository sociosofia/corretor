/* Sociosofia OMR · v0.11
   Captura humana + QR como âncora geométrica primária quando cornerPoints
   estiverem disponíveis. Os marcadores visuais passam a ser fallback/validação,
   não a única fonte da homografia.
*/

let captureLock={token:'',hits:0,startedAt:0,lastGoodAt:0,best:null,bestScore:Infinity};

function resetCaptureLock(){
  captureLock={token:'',hits:0,startedAt:0,lastGoodAt:0,best:null,bestScore:Infinity};
}

function captureQuality_(align){
  const corner=align.rawDists?.length?Math.max(...align.rawDists):0;
  const center=Number(align.centerDist||0);
  const perspective=Math.max(0,Number(align.perspective||1)-1)*.15;
  return corner+center+perspective;
}

analyzeLive=async function(){
  if(!running||!armed||pending||!frameToCanvas())return;

  const img=wctx.getImageData(0,0,work.width,work.height);
  const qr=await detectQR();

  // Preferência: geometria extrapolada dos quatro cantos do QR.
  // Fallback: detector visual dos quatro finders impressos.
  let corners=null,anchor='finders';
  if(qr.text?.startsWith('C1:')&&typeof qrAnchorUsable==='function'){
    corners=qrAnchorUsable(qr,work.width,work.height);
    if(corners)anchor='QR';
  }
  if(!corners)corners=detectMarkers(img,qr.box);

  const align=drawGuide(corners||[]);
  const now=performance.now();

  markersText.textContent=anchor==='QR'?'QR → 4/4':`${(corners||[]).length}/4`;
  qrText.textContent=qr.text||'—';

  const good=(corners||[]).length===4&&align.ok&&qr.text.startsWith('C1:');

  if(!good){
    if(captureLock.hits>0 && now-captureLock.lastGoodAt<750){
      status('Enquadramento travado ✓ — pode oscilar um pouco');
      stateText.textContent='travado';
      return;
    }

    resetCaptureLock();
    if(qr.text.startsWith('C1:')&&anchor!=='QR'){
      status('QR lido — ajustando referência da folha');
    }else{
      status((corners||[]).length===4&&align.ok&&!qr.text.startsWith('C1:')
        ?'Cantos alinhados — procurando QR'
        :alignmentHint(corners||[],align));
    }
    stateText.textContent=(corners||[]).length===4?'alinhando':'enquadrando';
    return;
  }

  if(captureLock.token!==qr.text || (captureLock.startedAt && now-captureLock.startedAt>1400)){
    resetCaptureLock();
    captureLock.token=qr.text;
    captureLock.startedAt=now;
  }

  captureLock.hits++;
  captureLock.lastGoodAt=now;

  const score=captureQuality_(align)+(anchor==='QR'?-.06:0);
  if(score<captureLock.bestScore){
    captureLock.bestScore=score;
    captureLock.best={
      token:qr.text,
      corners:corners.map(p=>({x:p.x,y:p.y})),
      img:img,
      anchor
    };
  }

  if(captureLock.hits<2){
    status(anchor==='QR'?'QR ancorado ✓ — só mais um instante':'Enquadrado ✓ — só mais um instante');
    stateText.textContent=anchor==='QR'?'QR ancorado':'travado';
    return;
  }

  const snap=captureLock.best||{token:qr.text,corners,img,anchor};
  resetCaptureLock();
  status('Capturando…');
  stateText.textContent='capturando';
  captureCurrent(snap.token,snap.corners,snap.img);
};
