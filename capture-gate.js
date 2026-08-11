/* Sociosofia OMR · v1.0 operacional
   Captura por micro-rajada: coleta vários quadros bons dentro de uma janela curta,
   pontua geometria + nitidez e usa o melhor. QR continua como âncora primária.
*/

let captureLock={token:'',hits:0,startedAt:0,lastGoodAt:0,best:null,bestScore:Infinity,bestSharpness:0};

function resetCaptureLock(){
  captureLock={token:'',hits:0,startedAt:0,lastGoodAt:0,best:null,bestScore:Infinity,bestSharpness:0};
}

function frameSharpness_(img){
  if(!img?.data||!img.width||!img.height)return 0;
  const W=img.width,H=img.height,d=img.data;
  let total=0,n=0;
  for(let y=8;y<H-8;y+=12){
    for(let x=8;x<W-8;x+=12){
      const i=(y*W+x)*4,ix=(y*W+x+2)*4,iy=((y+2)*W+x)*4;
      const l=lum(d[i],d[i+1],d[i+2]);
      total+=Math.abs(l-lum(d[ix],d[ix+1],d[ix+2]));
      total+=Math.abs(l-lum(d[iy],d[iy+1],d[iy+2]));
      n+=2;
    }
  }
  return n?total/n:0;
}

function captureQuality_(align,img,anchor){
  const corner=align.rawDists?.length?Math.max(...align.rawDists):0;
  const center=Number(align.centerDist||0);
  const perspective=Math.max(0,Number(align.perspective||1)-1)*.15;
  const sharpness=frameSharpness_(img);
  const sharpBonus=Math.min(55,sharpness)*.0016;
  const anchorBonus=anchor==='QR'?.075:0;
  return {score:corner+center+perspective-sharpBonus-anchorBonus,sharpness};
}

/* Classificação relativa: a decisão considera intensidade, separação da segunda
   alternativa e baseline das demais. Mantemos comportamento conservador. */
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
    if(captureLock.hits>0 && now-captureLock.lastGoodAt<850){
      status(`Rajada ${captureLock.hits}/5 ✓ — pequena oscilação tolerada`);
      stateText.textContent='selecionando quadro';
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

  if(captureLock.token!==qr.text || (captureLock.startedAt && now-captureLock.startedAt>1700)){
    resetCaptureLock();
    captureLock.token=qr.text;
    captureLock.startedAt=now;
  }

  captureLock.hits++;
  captureLock.lastGoodAt=now;

  const quality=captureQuality_(align,img,anchor);
  if(quality.score<captureLock.bestScore){
    captureLock.bestScore=quality.score;
    captureLock.bestSharpness=quality.sharpness;
    captureLock.best={token:qr.text,corners:corners.map(p=>({x:p.x,y:p.y})),img,anchor};
  }

  const elapsed=now-captureLock.startedAt;
  const enoughFrames=captureLock.hits>=5;
  const enoughTime=elapsed>=650&&captureLock.hits>=3;
  if(!enoughFrames&&!enoughTime){
    status(`${anchor==='QR'?'QR ancorado':'Enquadrado'} ✓ · rajada ${captureLock.hits}/5`);
    stateText.textContent='elegendo melhor quadro';
    return;
  }

  const snap=captureLock.best||{token:qr.text,corners,img,anchor};
  window.__omrLastBurst={
    frames:captureLock.hits,
    elapsedMs:Math.round(elapsed),
    anchor:snap.anchor,
    bestScore:Number(captureLock.bestScore),
    sharpness:Number(captureLock.bestSharpness)
  };
  resetCaptureLock();
  status('Melhor quadro escolhido ✓');
  stateText.textContent='capturando';
  captureCurrent(snap.token,snap.corners,snap.img);
};
