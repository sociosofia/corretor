/* Sociosofia OMR · v0.10 — quadro congelado para calibração de campo.
   Depois do PLIM, mostra EXATAMENTE a imagem usada na leitura e desenha
   os pontos projetados de Q1..Q8 / A..E. Assim a calibração deixa de ser por tentativa. */

function freezeDiagnosticFrame_(img,corners,meta){
  if(!img||!corners||corners.length!==4||!meta)return;
  const model=getOmrModel(meta.modelo_omr);
  if(!model)return;

  overlay.width=img.width;
  overlay.height=img.height;
  ctx.clearRect(0,0,overlay.width,overlay.height);
  ctx.putImageData(img,0,0);

  // Quadrilátero efetivamente usado como referência.
  ctx.save();
  ctx.strokeStyle='#16a34a';
  ctx.lineWidth=3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(corners[0].x,corners[0].y);
  ctx.lineTo(corners[1].x,corners[1].y);
  ctx.lineTo(corners[3].x,corners[3].y);
  ctx.lineTo(corners[2].x,corners[2].y);
  ctx.closePath();
  ctx.stroke();

  corners.forEach((p,i)=>{
    ctx.fillStyle='#16a34a';
    ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 11px Arial';
    ctx.fillText(String(i+1),p.x-3,p.y+4);
  });

  const qtd=Math.min(Number(meta.qtd_questoes||model.maxQuestions),model.maxQuestions);
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font='bold 9px Arial';

  for(let q=1;q<=qtd;q++){
    for(const l of 'ABCDE'){
      const u=model.colU[l],v=model.rowV[q];
      const p=typeof projectivePoint==='function'?projectivePoint(corners,u,v):bilerp(corners,u,v);
      const pR=typeof projectivePoint==='function'?projectivePoint(corners,u+model.radiusRatio,v):bilerp(corners,u+model.radiusRatio,v);
      const r=Math.max(4,Math.min(11,Math.hypot(pR.x-p.x,pR.y-p.y)));

      ctx.beginPath();
      ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.strokeStyle='rgba(220,38,38,.92)';
      ctx.lineWidth=2;
      ctx.stroke();

      // Marca central bem pequena para sabermos o centro matemático exato.
      ctx.fillStyle='rgba(220,38,38,.95)';
      ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill();
    }

    // Rótulo de linha à esquerda de A.
    const lp=typeof projectivePoint==='function'
      ?projectivePoint(corners,Math.max(.005,model.colU.A-.055),model.rowV[q])
      :bilerp(corners,Math.max(.005,model.colU.A-.055),model.rowV[q]);
    ctx.fillStyle='rgba(17,24,39,.88)';
    ctx.fillRect(lp.x-11,lp.y-7,22,14);
    ctx.fillStyle='#fff';
    ctx.fillText('Q'+q,lp.x,lp.y+.5);
  }
  ctx.restore();

  status('Quadro congelado · círculos vermelhos = pontos que foram lidos');
}

// Envolve a captura já existente sem alterar backend, QR ou classificação.
const _captureCurrentDiagnostic=captureCurrent;
captureCurrent=async function(token,corners,img){
  await _captureCurrentDiagnostic(token,corners,img);
  if(pending && pending.token===token){
    freezeDiagnosticFrame_(img,corners,pending.meta);
  }
};

// Ao pedir nova leitura, devolve o canvas ao modo transparente/live.
const _resetPendingDiagnostic=resetPending;
resetPending=function(){
  _resetPendingDiagnostic();
  ctx.clearRect(0,0,overlay.width,overlay.height);
};
