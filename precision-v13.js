/* Sociosofia OMR · precisão v1.3
   - amostragem privilegia o miolo da bolha para reduzir o ruído do círculo impresso;
   - micro-rajada vota por mediana entre 3–5 quadros bons;
   - não afrouxa a classificação: melhora primeiro a evidência que chega ao classificador.
*/
(()=>{
  if(window.__omrPrecisionV13)return;
  window.__omrPrecisionV13=true;

  const _bubbleScoresSingle=bubbleScores;
  let burst={token:'',startedAt:0,lastGoodAt:0,hits:0,samples:[]};

  function resetBurst_(){burst={token:'',startedAt:0,lastGoodAt:0,hits:0,samples:[]}}
  function median_(a){
    const v=a.filter(Number.isFinite).sort((x,y)=>x-y);
    if(!v.length)return 0;
    const m=Math.floor(v.length/2);
    return v.length%2?v[m]:(v[m-1]+v[m])/2;
  }

  // O contorno preto da bolha existe mesmo quando ela está vazia. O escore antigo
  // media o disco inteiro e acabava levando parte desse contorno para todas as opções.
  // Agora o miolo pesa integralmente; o disco cheio continua como fallback para X,
  // traços inclinados ou preenchimentos que pegam a borda.
  sampleProjectedBubble=function(img,c,u,v,model){
    const W=img.width,H=img.height,data=img.data;
    const ru=model.radiusRatio,rv=ru*(model.referenceWidth/model.referenceHeight);
    const STEPS=9,INNER2=.52;
    let nf=0,df=0,sf=0,ni=0,di=0,si=0;

    for(let iy=-STEPS;iy<=STEPS;iy++){
      const ny=iy/STEPS;
      for(let ix=-STEPS;ix<=STEPS;ix++){
        const nx=ix/STEPS,r2=nx*nx+ny*ny;
        if(r2>1)continue;
        const p=projectivePoint(c,u+nx*ru,v+ny*rv);
        const x=Math.round(p.x),y=Math.round(p.y);
        if(x<0||y<0||x>=W||y>=H)continue;
        const i=(y*W+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        const isDark=lum(r,g,b)<165,isSat=rgbToSat(r,g,b)>45;
        nf++;if(isDark)df++;if(isSat)sf++;
        if(r2<=INNER2){ni++;if(isDark)di++;if(isSat)si++}
      }
    }
    const full=nf?Math.max(df/nf,sf/nf):0;
    const inner=ni?Math.max(di/ni,si/ni):0;
    return Math.max(inner,full*.82);
  };

  // Quando a câmera entrega uma rajada, cada quadro é medido com a própria homografia.
  // A mediana por bolha descarta um frame ruim/glare sem escolher a resposta pelo conteúdo.
  bubbleScores=function(img,c,modelId='OMR-08-v1',qtd=8){
    const pack=window.__omrBurstV13;
    if(window.__omrBurstActive&&pack?.samples?.length>=3){
      const all=pack.samples.map(s=>_bubbleScoresSingle(s.img,s.corners,modelId,qtd));
      const out={};
      for(let q=1;q<=Number(qtd);q++){
        out[q]={};
        for(const l of 'ABCDE')out[q][l]=median_(all.map(x=>Number(x?.[q]?.[l]||0)));
      }
      return out;
    }
    return _bubbleScoresSingle(img,c,modelId,qtd);
  };

  analyzeLive=async function(){
    if(!running||!armed||pending||!frameToCanvas())return;
    const img=wctx.getImageData(0,0,work.width,work.height),qr=await detectQR();
    let corners=null,anchor='finders';
    if(qr.text?.startsWith('C1:')&&typeof qrAnchorUsable==='function'){
      corners=qrAnchorUsable(qr,work.width,work.height);if(corners)anchor='QR';
    }
    if(!corners)corners=detectMarkers(img,qr.box);
    const align=drawGuide(corners||[]),now=performance.now();
    markersText.textContent=anchor==='QR'?'QR → 4/4':`${(corners||[]).length}/4`;
    qrText.textContent=qr.text||'—';
    const good=(corners||[]).length===4&&align.ok&&qr.text.startsWith('C1:');

    if(!good){
      if(burst.hits>0&&now-burst.lastGoodAt<850){status(`Rajada ${burst.hits}/5 ✓ — pequena oscilação tolerada`);stateText.textContent='selecionando quadro';return}
      resetBurst_();
      status(qr.text.startsWith('C1:')&&anchor!=='QR'?'QR lido — ajustando referência da folha':((corners||[]).length===4&&align.ok&&!qr.text.startsWith('C1:')?'Cantos alinhados — procurando QR':alignmentHint(corners||[],align)));
      stateText.textContent=(corners||[]).length===4?'alinhando':'enquadrando';return;
    }

    if(burst.token!==qr.text||(burst.startedAt&&now-burst.startedAt>1700)){
      resetBurst_();burst.token=qr.text;burst.startedAt=now;
    }
    burst.hits++;burst.lastGoodAt=now;
    const quality=typeof captureQuality_==='function'?captureQuality_(align,img,anchor):{score:0,sharpness:0};
    burst.samples.push({img,corners:corners.map(p=>({x:p.x,y:p.y})),anchor,score:Number(quality.score||0),sharpness:Number(quality.sharpness||0)});
    burst.samples.sort((a,b)=>a.score-b.score);
    if(burst.samples.length>5)burst.samples.length=5;

    const elapsed=now-burst.startedAt,enoughFrames=burst.hits>=5,enoughTime=elapsed>=650&&burst.hits>=3;
    if(!enoughFrames&&!enoughTime){status(`${anchor==='QR'?'QR ancorado':'Enquadrado'} ✓ · rajada ${burst.hits}/5`);stateText.textContent='elegendo melhor quadro';return}

    const snap=burst.samples[0]||{img,corners,anchor,score:0,sharpness:0};
    const pack={token:qr.text,samples:burst.samples.slice(),frames:burst.hits,elapsedMs:Math.round(elapsed)};
    window.__omrBurstV13=pack;window.__omrBurstActive=true;
    window.__omrLastBurst={frames:burst.hits,elapsedMs:Math.round(elapsed),anchor:snap.anchor,bestScore:snap.score,sharpness:snap.sharpness,aggregation:'median',samples:pack.samples.length};
    resetBurst_();
    status(`Rajada consolidada ✓ · ${pack.samples.length} quadros`);stateText.textContent='capturando';
    try{await captureCurrent(qr.text,snap.corners,snap.img)}
    finally{window.__omrBurstActive=false;window.__omrBurstV13=null}
  };
})();
