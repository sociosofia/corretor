/* Sociosofia OMR · v0.7
   Janela de captura humana: duas confirmações boas dentro de uma janela curta,
   sem exigir quadros perfeitos consecutivos. Uma oscilação breve não zera o enquadramento.
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
  const corners=detectMarkers(img,qr.box);
  const align=drawGuide(corners);
  const now=performance.now();

  markersText.textContent=`${corners.length}/4`;
  qrText.textContent=qr.text||'—';

  const good=corners.length===4&&align.ok&&qr.text.startsWith('C1:');

  if(!good){
    /* Histerese: depois de um bom enquadramento, tolera ~0,75 s de oscilação.
       Assim um pequeno tremor não obriga o professor a começar de novo. */
    if(captureLock.hits>0 && now-captureLock.lastGoodAt<750){
      status('Enquadramento travado ✓ — pode oscilar um pouco');
      stateText.textContent='travado';
      return;
    }

    resetCaptureLock();
    status(corners.length===4&&align.ok&&!qr.text.startsWith('C1:')
      ?'Cantos alinhados — procurando QR'
      :alignmentHint(corners,align));
    stateText.textContent=corners.length===4?'alinhando':'enquadrando';
    return;
  }

  /* Novo QR ou uma tentativa antiga demais: começa uma janela nova. */
  if(captureLock.token!==qr.text || (captureLock.startedAt && now-captureLock.startedAt>1400)){
    resetCaptureLock();
    captureLock.token=qr.text;
    captureLock.startedAt=now;
  }

  captureLock.hits++;
  captureLock.lastGoodAt=now;

  /* Guarda o melhor quadro visto durante a pequena janela, não necessariamente o último. */
  const score=captureQuality_(align);
  if(score<captureLock.bestScore){
    captureLock.bestScore=score;
    captureLock.best={
      token:qr.text,
      corners:corners.map(p=>({x:p.x,y:p.y})),
      img:img
    };
  }

  if(captureLock.hits<2){
    status('Enquadrado ✓ — só mais um instante');
    stateText.textContent='travado';
    return;
  }

  /* Duas boas confirmações podem ser intercaladas por um tremor curto.
     Na prática, a captura acontece em ~0,2–0,7 s depois do primeiro encaixe bom. */
  const snap=captureLock.best||{token:qr.text,corners,img};
  resetCaptureLock();
  status('Capturando…');
  stateText.textContent='capturando';
  captureCurrent(snap.token,snap.corners,snap.img);
};
