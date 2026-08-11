/* Ajustes de campo v0.6 — tolerância humana + marcadores vazados em luz variável.
   Este arquivo sobrescreve apenas a detecção/alinhamento do laboratório base. */

// Detector mais tolerante: limiar de luminância adaptativo, conectividade em 8 direções
// e filtros geométricos um pouco mais generosos. A geometria dos 4 pontos continua sendo
// a principal defesa contra falsos positivos.
detectMarkers = function(imgData, qrBox=null){
 const W=imgData.width,H=imgData.height,d=imgData.data,step=3,gw=Math.floor(W/step),gh=Math.floor(H/step);
 let sum=0,nLum=0;
 for(let y=0;y<H;y+=12)for(let x=0;x<W;x+=12){const i=(y*W+x)*4;sum+=lum(d[i],d[i+1],d[i+2]);nLum++}
 const mean=nLum?sum/nLum:180;
 const darkCut=Math.max(100,Math.min(165,mean-52));
 const dark=new Uint8Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
   const px=((y*step)*W+(x*step))*4;
   if(lum(d[px],d[px+1],d[px+2])<darkCut)dark[y*gw+x]=1;
 }
 const seen=new Uint8Array(gw*gh),comps=[],qx=new Int32Array(gw*gh),qy=new Int32Array(gw*gh);
 const neigh=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
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
   if(count>=5&&count<=1200&&shape>.55&&shape<1.80&&fill>.045&&fill<.97&&pw>=7&&ph>=7&&pw<=90&&ph<=90){
     comps.push({x:(minx+maxx+1)*step/2,y:(miny+maxy+1)*step/2,w:pw,h:ph,area:count*step*step,fill});
   }
 }
 if(comps.length<4)return[];
 const cand=comps.sort((a,b)=>(b.w*b.h)-(a.w*a.h)).slice(0,36);let best=null,bestScore=-Infinity;
 for(let a=0;a<cand.length-3;a++)for(let b=a+1;b<cand.length-2;b++)for(let c=b+1;c<cand.length-1;c++)for(let e=c+1;e<cand.length;e++){
   const raw=[cand[a],cand[b],cand[c],cand[e]],p=orderCorners(raw),[tl,tr,bl,br]=p;
   if(new Set(p.map(z=>`${Math.round(z.x)},${Math.round(z.y)}`)).size<4)continue;
   const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y),left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y),d1=Math.hypot(br.x-tl.x,br.y-tl.y),d2=Math.hypot(bl.x-tr.x,bl.y-tr.y);
   if(top<W*.24||bot<W*.24||left<H*.09||right<H*.09)continue;
   const ratio=((top+bot)/2)/((left+right)/2);if(ratio<1.45||ratio>3.35)continue;
   const edgeSym=Math.abs(top-bot)/Math.max(top,bot)+Math.abs(left-right)/Math.max(left,right)+Math.abs(d1-d2)/Math.max(d1,d2);
   const sizes=raw.map(z=>(z.w+z.h)/2),meanSize=sizes.reduce((x,y)=>x+y,0)/4,sizeSpread=Math.max(...sizes.map(x=>Math.abs(x-meanSize)/meanSize));
   if(edgeSym>.80||sizeSpread>.55)continue;
   if(qrBox){
     const qcx=qrBox.x+qrBox.width/2,qcy=qrBox.y+qrBox.height/2,minX=Math.min(tl.x,tr.x,bl.x,br.x),maxX=Math.max(tl.x,tr.x,bl.x,br.x),minY=Math.min(tl.y,tr.y,bl.y,br.y),maxY=Math.max(tl.y,tr.y,bl.y,br.y),nx=(qcx-minX)/(maxX-minX),ny=(qcy-minY)/(maxY-minY),rectW=maxX-minX,rectH=maxY-minY;
     if(!(nx>.50&&nx<1.04&&ny>.02&&ny<.98))continue;
     if(rectW<qrBox.width*1.8||rectW>qrBox.width*11.0)continue;
     if(rectH<qrBox.height*1.05||rectH>qrBox.height*6.3)continue;
   }
   const rectArea=((top+bot)/2)*((left+right)/2),score=rectArea-rectArea*edgeSym*.45-rectArea*sizeSpread*.55;
   if(score>bestScore){bestScore=score;best=p}
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
 // app.js pinta verde em <.055; comprimimos a distância apenas para a orientação visual.
 const dists=rawDists.map(d=>d*.27);
 return{ok,near,dists,rawDists,centerDist,scaleW,scaleH,perspective};
};

// O celular não precisa ficar imóvel como um scanner de mesa. A confirmação humana posterior
// permite uma tolerância maior sem transformar uma leitura duvidosa em nota automaticamente.
geomDistance = function(a,b){
 if(!a||!b||a.length!==4||b.length!==4)return 999;
 const real=a.reduce((s,p,i)=>s+Math.hypot(p.x-b[i].x,p.y-b[i].y),0)/4;
 return real/2.4;
};
