/* v0.9 — correção projetiva real ("keystone") para a grade OMR.
   Em vez de interpolar linearmente dentro do trapézio, mapeamos o retângulo
   canônico 0..1 x 0..1 para o quadrilátero da câmera por homografia.
   A amostragem da bolha também acontece no plano canônico e é projetada
   ponto a ponto, preservando melhor centro e formato sob perspectiva. */

function projectivePoint(c,u,v){
  const tl=c[0],tr=c[1],bl=c[2],br=c[3];
  const x0=tl.x,y0=tl.y,x1=tr.x,y1=tr.y,x2=br.x,y2=br.y,x3=bl.x,y3=bl.y;
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3;
  const dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
  const den=dx1*dy2-dx2*dy1;

  let g=0,h=0;
  if(Math.abs(dx3)>1e-8||Math.abs(dy3)>1e-8){
    if(Math.abs(den)<1e-8)return bilerp(c,u,v);
    g=(dx3*dy2-dx2*dy3)/den;
    h=(dx1*dy3-dx3*dy1)/den;
  }

  const a=x1-x0+g*x1;
  const b=x3-x0+h*x3;
  const cc=x0;
  const d=y1-y0+g*y1;
  const e=y3-y0+h*y3;
  const f=y0;
  const z=g*u+h*v+1;
  if(Math.abs(z)<1e-8)return bilerp(c,u,v);
  return {x:(a*u+b*v+cc)/z,y:(d*u+e*v+f)/z};
}

function sampleProjectedBubble(img,c,u,v,model){
  const W=img.width,H=img.height,data=img.data;
  const ru=model.radiusRatio;
  const rv=ru*(model.referenceWidth/model.referenceHeight);
  const STEPS=7;
  let n=0,dark=0,sat=0;

  for(let iy=-STEPS;iy<=STEPS;iy++){
    const ny=iy/STEPS;
    for(let ix=-STEPS;ix<=STEPS;ix++){
      const nx=ix/STEPS;
      if(nx*nx+ny*ny>1)continue;
      const p=projectivePoint(c,u+nx*ru,v+ny*rv);
      const x=Math.round(p.x),y=Math.round(p.y);
      if(x<0||y<0||x>=W||y>=H)continue;
      const i=(y*W+x)*4,r=data[i],g=data[i+1],b=data[i+2];
      n++;
      if(lum(r,g,b)<160)dark++;
      if(rgbToSat(r,g,b)>50)sat++;
    }
  }
  return n?Math.max(dark/n,sat/n):0;
}

bubbleScores = function(img,c,modelId='OMR-08-v1',qtd=8){
  const model=getOmrModel(modelId);
  if(!model)throw new Error('Modelo OMR não suportado: '+modelId);
  qtd=Number(qtd);
  if(!Number.isInteger(qtd)||qtd<1||qtd>model.maxQuestions)throw new Error('Quantidade incompatível com '+modelId);

  const out={};
  for(let q=1;q<=qtd;q++){
    out[q]={};
    for(const l of 'ABCDE'){
      out[q][l]=sampleProjectedBubble(img,c,model.colU[l],model.rowV[q],model);
    }
  }
  return out;
};
