/* Ajustes de campo v0.8 — tolerância humana + seleção robusta dos quatro marcadores.
   Este arquivo sobrescreve apenas detecção/alinhamento do laboratório base. */

/*
  Ideia central da v0.8:
  - alternativas preenchidas são escuras, mas normalmente circulares;
  - os marcadores são quadrados (vazados agora, sólidos no próximo modelo);
  - quando o QR está visível, o quadrilátero dos 4 marcadores PRECISA conter o QR;
  - a posição esperada junto aos cantos serve como evidência adicional, não como encaixe rígido.
*/
detectMarkers = function(imgData, qrBox=null){
 const W=imgData.width,H=imgData.height,d=imgData.data,step=3,gw=Math.floor(W/step),gh=Math.floor(H/step);
 let sum=0,nLum=0;
 for(let y=0;y<H;y+=12)for(let x=0;x<W;x+=12){const i=(y*W+x)*4;sum+=lum(d[i],d[i+1],d[i+2]);nLum++}
 const mean=nLum?sum/nLum:180;
 const darkCut=Math.max(98,Math.min(170,mean-50));
 const dark=new Uint8Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
   const px=((y*step)*W+(x*step))*4;
   if(lum(d[px],d[px+1],d[px+2])<darkCut)dark[y*gw+x]=1;
 }

 const seen=new Uint8Array(gw*gh),comps=[],qx=new Int32Array(gw*gh),qy=new Int32Array(gw*gh);
 const neigh=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
 const patchOcc=(x0,y0,x1,y1)=>{
   x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(gw-1,Math.ceil(x1));y1=Math.min(gh-1,Math.ceil(y1));
   let n=0,k=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){n++;if(dark[y*gw+x])k++}return n?k/n:0;
 };

 for(let sy=0;sy<gh;sy++)for(let sx=0;sx<gw;sx++){
   const idx=sy*gw+sx;if(!dark[idx]||seen[idx])continue;
   let head=0,tail=0,minx=sx,maxx=sx,miny=sy,maxy=sy,count=0;
   qx[tail]=sx;qy[tail]=sy;tail++;seen[idx]=1;
   while(head<tail){
     const x=qx[head],y=qy[head];head++;count++;
     if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
     for(const [dx,dy] of neigh){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=gw||ny>=gh)continue;const ni=ny*gw+nx;if(dark[ni]&&!seen[ni]){seen[ni]=1;qx[tail]=nx;qy[tail]=ny;tail++}}
   }
   const bw=maxx-minx+1,bh=maxy-miny+1,fill=count/(bw*bh),pw=bw*step,ph=bh*step,shape=bw/bh;
   if(!(count>=5&&count<=1400&&shape>.55&&shape<1.80&&fill>.035&&fill<.985&&pw>=7&&ph>=7&&pw<=95&&ph<=95))continue;

   // Quadrado: os quatro cantos da caixa tendem a ter tinta. Círculo preenchido tende a deixar
   // os cantos da caixa claros. Funciona tanto para marcador vazado quanto para marcador sólido.
   const fx=Math.max(1,bw*.28),fy=Math.max(1,bh*.28);
   const cornerOcc=(
     patchOcc(minx,miny,minx+fx,miny+fy)+
     patchOcc(maxx-fx,miny,maxx,miny+fy)+
     patchOcc(minx,maxy-fy,minx+fx,maxy)+
     patchOcc(maxx-fx,maxy-fy,maxx,maxy)
   )/4;
   const squareScore=Math.max(0,1-Math.abs(1-shape));
   const markerScore=cornerOcc*.72+squareScore*.28;
   comps.push({x:(minx+maxx+1)*step/2,y:(miny+maxy+1)*step/2,w:pw,h:ph,area:count*step*step,fill,cornerOcc,markerScore});
 }
 if(comps.length<4)return[];

 // Primeiro privilegia quadrados reais; mantém uma margem para marcador vazado pouco contrastado.
 const cand=comps
   .filter(z=>z.cornerOcc>.10 || z.fill<.50)
   .sort((a,b)=>(b.markerScore*2+b.w*b.h/1200)-(a.markerScore*2+a.w*a.h/1200))
   .slice(0,40);
 if(cand.length<4)return[];

 const orderObj=pts=>{
   const tl=pts.reduce((a,b)=>a.x+a.y<b.x+b.y?a:b),br=pts.reduce((a,b)=>a.x+a.y>b.x+b.y?a:b),tr=pts.reduce((a,b)=>a.x-a.y>b.x-b.y?a:b),bl=pts.reduce((a,b)=>a.x-a.y<b.x-b.y?a:b);
   return[tl,tr,bl,br];
 };
 const targets=guideTargets(W,H),diag=Math.hypot(W,H);
 let best=null,bestScore=-Infinity;

 for(let a=0;a<cand.length-3;a++)for(let b=a+1;b<cand.length-2;b++)for(let c=b+1;c<cand.length-1;c++)for(let e=c+1;e<cand.length;e++){
   const raw=[cand[a],cand[b],cand[c],cand[e]],p=orderObj(raw),[tl,tr,bl,br]=p;
   if(new Set(p.map(z=>`${Math.round(z.x)},${Math.round(z.y)}`)).size<4)continue;

   const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y),left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y),d1=Math.hypot(br.x-tl.x,br.y-tl.y),d2=Math.hypot(bl.x-tr.x,bl.y-tr.y);
   if(top<W*.34||bot<W*.34||left<H*.11||right<H*.11)continue;
   const ratio=((top+bot)/2)/((left+right)/2);if(ratio<1.55||ratio>3.30)continue;

   const edgeSym=Math.abs(top-bot)/Math.max(top,bot)+Math.abs(left-right)/Math.max(left,right)+Math.abs(d1-d2)/Math.max(d1,d2);
   const sizes=raw.map(z=>(z.w+z.h)/2),meanSize=sizes.reduce((x,y)=>x+y,0)/4,sizeSpread=Math.max(...sizes.map(x=>Math.abs(x-meanSize)/meanSize));
   if(edgeSym>.88||sizeSpread>.60)continue;

   // O QR impresso fica DENTRO do retângulo dos marcadores, próximo ao lado direito.
   // Esta regra elimina o falso positivo visto em campo, em que quatro bolhas preenchidas
   // formavam um trapézio que terminava antes do QR.
   if(qrBox){
     const qcx=qrBox.x+qrBox.width/2,qcy=qrBox.y+qrBox.height/2;
     const minX=Math.min(tl.x,tr.x,bl.x,br.x),maxX=Math.max(tl.x,tr.x,bl.x,br.x),minY=Math.min(tl.y,tr.y,bl.y,br.y),maxY=Math.max(tl.y,tr.y,bl.y,br.y);
     const nx=(qcx-minX)/(maxX-minX),ny=(qcy-minY)/(maxY-minY),rectW=maxX-minX,rectH=maxY-minY;
     if(!(nx>.58&&nx<.95&&ny>.04&&ny<.96))continue;
     if(tr.x<qcx+qrBox.width*.12 || br.x<qcx+qrBox.width*.12)continue;
     if(rectW<qrBox.width*2.3||rectW>qrBox.width*12.0)continue;
     if(rectH<qrBox.height*1.10||rectH>qrBox.height*7.0)continue;
   }

   const targetDist=p.reduce((s,z,i)=>s+Math.hypot(z.x-targets[i].x,z.y-targets[i].y)/diag,0)/4;
   if(targetDist>.19)continue;
   const markerQuality=raw.reduce((s,z)=>s+z.markerScore,0)/4;
   const rectArea=((top+bot)/2)*((left+right)/2);
   const score=rectArea*(1-targetDist*2.2)-rectArea*edgeSym*.30-rectArea*sizeSpread*.32+rectArea*markerQuality*.22;
   if(score>bestScore){bestScore=score;best=p.map(z=>({x:z.x,y:z.y}))}
 }
 return best||[];
};

// A moldura é orientação, não uma fechadura. A captura aceita deslocamento, escala e
// perspectiva moderados; os 4 marcadores é que definem a geometria usada na leitura.
alignmentInfo = function(c,W,H){
 if(c.length!==4)return{ok:false,near:false,dists:[]};
 const t=guideTargets(W,H),diag=Math.hypot(W,H);
 const rawDists=c.map((p,i)=>Math.hypot(p.x-t[i].x,p.y-t[i].y)/diag);
 const [tl,tr,bl,br]=c;
 const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y),left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y);
 const tw=Math.hypot(t[1].x-t[0].x,t[1].y-t[0].y),th=Math.hypot(t[2].x-t[0].x,t[2].y-t[0].y);
 const qw=(top+bot)/2,qh=(left+right)/2;
 const cx=c.reduce((s,p)=>s+p.x,0)/4,cy=c.reduce((s,p)=>s+p.y,0)/4,tx=t.reduce((s,p)=>s+p.x,0)/4,ty=t.reduce((s,p)=>s+p.y,0)/4;
 const centerDist=Math.hypot(cx-tx,cy-ty)/diag;
 const perspective=Math.max(top/bot,bot/top,left/right,right/left);
 const maxRaw=Math.max(...rawDists),scaleW=qw/tw,scaleH=qh/th;
 const ok=centerDist<.105&&scaleW>.56&&scaleW<1.48&&scaleH>.46&&scaleH<1.66&&maxRaw<.235&&perspective<1.72;
 const near=centerDist<.145&&scaleW>.46&&scaleW<1.62&&scaleH>.36&&scaleH<1.82&&maxRaw<.300&&perspective<1.95;
 const dists=rawDists.map(d=>d*.27);
 return{ok,near,dists,rawDists,centerDist,scaleW,scaleH,perspective};
};

geomDistance = function(a,b){
 if(!a||!b||a.length!==4||b.length!==4)return 999;
 const real=a.reduce((s,p,i)=>s+Math.hypot(p.x-b[i].x,p.y-b[i].y),0)/4;
 return real/2.4;
};
