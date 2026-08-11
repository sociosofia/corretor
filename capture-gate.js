/* Sociosofia OMR · v0.12
   Captura humana + QR como âncora geométrica primária quando cornerPoints
   estiverem disponíveis. Os marcadores visuais passam a ser fallback/validação.

   Nesta versão a classificação passa a considerar não só o valor absoluto da
   bolha vencedora, mas também sua separação da segunda colocada e o baseline
   das demais alternativas da mesma questão.
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

/* Calibração relativa: evita simplesmente reduzir VALID=.65.
   Uma marca moderada pode ser válida se estiver claramente separada de A–E;
   duas marcas competitivas continuam em revisão/dupla. */
classify = function(scores,qtd=8){
  const rows=[];
  for(let q=1;q<=qtd;q++){
    const s=scores[q];
    const ranked=[...'ABCDE'].map(l=>({l,v:Number(s[l]||0)})).sort((a,b)=>b.v-a.v);
    const top=ranked[0],second=ranked[1];
    const rest=ranked.slice(1).map(x=>x.v).sort((a,b)=>a-b);
    const baseline=(rest[1]+rest[2])/2;
    const gap=top.v-second.v;
    const contrast=top.v-baseline;

    let state='em branco',answer='—';

    if(top.v>=.40 && second.v>=.38 && gap<.15){
      state='dupla';answer=top.l+'/'+second.l;
    }else if(top.v>=.52 && gap>=.10 && contrast>=.16){
      state='válida';answer=top.l;
    }else if(top.v>=.38 && gap>=.17 && contrast>=.19){
      state='válida';answer=top.l;
    }else if(top.v>=.25 || (top.v>=.21 && gap>=.12)){
      state='revisar';answer=top.l;
    }

    rows.push({q,answer,state,max:top.v,second:second.v,gap,contrast,runnerUp:second.l});
  }
  return rows;
};

/* Exibe a margem Δ para a calibração de campo.
   Ex.: 0.46 · Δ0.28 significa vencedor 0.46 e segunda alternativa 0.18. */
render = function(rows){
  resultBody.innerHTML='';
  for(const r of rows){
    const cls=r.state==='válida'?'ok':r.state==='revisar'?'warn':r.state==='dupla'?'bad':'blank';
    const idx=Number.isFinite(r.gap)?`${r.max.toFixed(2)} · Δ${r.gap.toFixed(2)}`:r.max.toFixed(2);
    resultBody.insertAdjacentHTML('beforeend',`<tr><td><b>Q${r.q}</b></td><td><b>${r.answer}</b></td><td><span class="badge ${cls}">${r.state}</span></td><td>${idx}</td></tr>`);
  }
};

analyzeLive=async function(){
  if(!running||!armed||pending||!frameToCanvas())return;

  const img=wctx.getImageData(0,0,work.width,work.height);
  const qr=await detectQR();

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
    captureLock.best={token:qr.text,corners:corners.map(p=>({x:p.x,y:p.y})),img:img,anchor};
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
