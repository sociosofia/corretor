const VALID=.65, REVIEW=.30;

const OMR_MODELS={
  'OMR-08-v1':{
    maxQuestions:8,
    colU:{A:(180-20)/1160,B:(335-20)/1160,C:(487-20)/1160,D:(639-20)/1160,E:(793-20)/1160},
    rowV:{1:(82-20)/500,2:(138-20)/500,3:(196-20)/500,4:(254-20)/500,5:(311-20)/500,6:(369-20)/500,7:(425-20)/500,8:(483-20)/500},
    radiusRatio:.0112
  }
};

function getOmrModel(id){return OMR_MODELS[String(id||'')]||null}
function lum(r,g,b){return .299*r+.587*g+.114*b}
function orderCorners(p){const pts=p.map(z=>({x:z.x,y:z.y}));const tl=pts.reduce((a,b)=>a.x+a.y<b.x+b.y?a:b);const br=pts.reduce((a,b)=>a.x+a.y>b.x+b.y?a:b);const tr=pts.reduce((a,b)=>a.x-a.y>b.x-b.y?a:b);const bl=pts.reduce((a,b)=>a.x-a.y<b.x-b.y?a:b);return[tl,tr,bl,br]}
function detectMarkers(imgData,qrBox=null){
 const W=imgData.width,H=imgData.height,d=imgData.data,step=3,gw=Math.floor(W/step),gh=Math.floor(H/step),dark=new Uint8Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const px=((y*step)*W+(x*step))*4;if(lum(d[px],d[px+1],d[px+2])<105)dark[y*gw+x]=1}
 const seen=new Uint8Array(gw*gh),comps=[],qx=new Int32Array(gw*gh),qy=new Int32Array(gw*gh);
 for(let sy=0;sy<gh;sy++)for(let sx=0;sx<gw;sx++){const idx=sy*gw+sx;if(!dark[idx]||seen[idx])continue;let head=0,tail=0,minx=sx,maxx=sx,miny=sy,maxy=sy,count=0;qx[tail]=sx;qy[tail]=sy;tail++;seen[idx]=1;
  while(head<tail){const x=qx[head],y=qy[head];head++;count++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;for(const[nx,ny]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||ny<0||nx>=gw||ny>=gh)continue;const ni=ny*gw+nx;if(dark[ni]&&!seen[ni]){seen[ni]=1;qx[tail]=nx;qy[tail]=ny;tail++}}}
  const bw=maxx-minx+1,bh=maxy-miny+1,fill=count/(bw*bh),pw=bw*step,ph=bh*step;
  if(count>=8&&count<=650&&bw/bh>.68&&bw/bh<1.47&&fill>.10&&fill<.88&&pw>=9&&ph>=9&&pw<=70&&ph<=70)comps.push({x:(minx+maxx+1)*step/2,y:(miny+maxy+1)*step/2,w:pw,h:ph,area:count*step*step,fill});
 }
 if(comps.length<4)return[];const cand=comps.sort((a,b)=>(b.w*b.h)-(a.w*a.h)).slice(0,24);let best=null,bestScore=-Infinity;
 for(let a=0;a<cand.length-3;a++)for(let b=a+1;b<cand.length-2;b++)for(let c=b+1;c<cand.length-1;c++)for(let e=c+1;e<cand.length;e++){
  const raw=[cand[a],cand[b],cand[c],cand[e]],p=orderCorners(raw),[tl,tr,bl,br]=p;if(new Set(p.map(z=>`${Math.round(z.x)},${Math.round(z.y)}`)).size<4)continue;
  const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y),left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y),d1=Math.hypot(br.x-tl.x,br.y-tl.y),d2=Math.hypot(bl.x-tr.x,bl.y-tr.y);
  if(top<W*.28||bot<W*.28||left<H*.12||right<H*.12)continue;const ratio=((top+bot)/2)/((left+right)/2);if(ratio<1.60||ratio>3.05)continue;
  const edgeSym=Math.abs(top-bot)/Math.max(top,bot)+Math.abs(left-right)/Math.max(left,right)+Math.abs(d1-d2)/Math.max(d1,d2),sizes=raw.map(z=>(z.w+z.h)/2),mean=sizes.reduce((x,y)=>x+y,0)/4,sizeSpread=Math.max(...sizes.map(x=>Math.abs(x-mean)/mean));if(edgeSym>.42||sizeSpread>.30)continue;
  if(qrBox){const qcx=qrBox.x+qrBox.width/2,qcy=qrBox.y+qrBox.height/2,minX=Math.min(tl.x,tr.x,bl.x,br.x),maxX=Math.max(tl.x,tr.x,bl.x,br.x),minY=Math.min(tl.y,tr.y,bl.y,br.y),maxY=Math.max(tl.y,tr.y,bl.y,br.y),nx=(qcx-minX)/(maxX-minX),ny=(qcy-minY)/(maxY-minY),rectW=maxX-minX,rectH=maxY-minY;if(!(nx>.58&&nx<.97&&ny>.08&&ny<.92))continue;if(rectW<qrBox.width*2.1||rectW>qrBox.width*9.5)continue;if(rectH<qrBox.height*1.25||rectH>qrBox.height*5.2)continue}
  const rectArea=((top+bot)/2)*((left+right)/2),score=rectArea-rectArea*edgeSym*.75-rectArea*sizeSpread*.90;if(score>bestScore){bestScore=score;best=p}
 }
 return best||[];
}
function bilerp(c,u,v){const[tl,tr,bl,br]=c;return{x:(1-u)*(1-v)*tl.x+u*(1-v)*tr.x+(1-u)*v*bl.x+u*v*br.x,y:(1-u)*(1-v)*tl.y+u*(1-v)*tr.y+(1-u)*v*bl.y+u*v*br.y}}
function rgbToSat(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return mx===0?0:(mx-mn)/mx*255}
function bubbleScores(img,c,modelId='OMR-08-v1',qtd=8){
 const model=getOmrModel(modelId);if(!model)throw new Error('Modelo OMR não suportado: '+modelId);qtd=Number(qtd);if(!Number.isInteger(qtd)||qtd<1||qtd>model.maxQuestions)throw new Error('Quantidade incompatível com '+modelId);
 const W=img.width,H=img.height,d=img.data,topW=Math.hypot(c[1].x-c[0].x,c[1].y-c[0].y),botW=Math.hypot(c[3].x-c[2].x,c[3].y-c[2].y),radius=Math.max(4,Math.round(((topW+botW)/2)*model.radiusRatio)),out={};
 for(let q=1;q<=qtd;q++){out[q]={};for(const l of'ABCDE'){const p=bilerp(c,model.colU[l],model.rowV[q]);let n=0,dark=0,sat=0;const x0=Math.max(0,Math.floor(p.x-radius)),x1=Math.min(W-1,Math.ceil(p.x+radius)),y0=Math.max(0,Math.floor(p.y-radius)),y1=Math.min(H-1,Math.ceil(p.y+radius));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=x-p.x,dy=y-p.y;if(dx*dx+dy*dy>radius*radius)continue;const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];n++;if(lum(r,g,b)<160)dark++;if(rgbToSat(r,g,b)>50)sat++}out[q][l]=n?Math.max(dark/n,sat/n):0}}
 return out;
}
function classify(scores,qtd=8){const rows=[];for(let q=1;q<=qtd;q++){const s=scores[q],strong=[...'ABCDE'].filter(l=>s[l]>=VALID),susp=[...'ABCDE'].filter(l=>s[l]>=REVIEW&&s[l]<VALID);let state,answer;if(strong.length>=2){state='dupla';answer=strong.join('/')}else if(strong.length===1){state='válida';answer=strong[0]}else if(susp.length){state='revisar';answer=susp.sort((a,b)=>s[b]-s[a])[0]}else{state='em branco';answer='—'}rows.push({q,answer,state,max:Math.max(...Object.values(s))})}return rows}
function guideTargets(W,H){return[{x:W*.10,y:H*.17},{x:W*.90,y:H*.17},{x:W*.10,y:H*.67},{x:W*.90,y:H*.67}]}
function alignmentInfo(c,W,H){if(c.length!==4)return{ok:false,near:false,dists:[]};const t=guideTargets(W,H),diag=Math.hypot(W,H),dists=c.map((p,i)=>Math.hypot(p.x-t[i].x,p.y-t[i].y)/diag),max=Math.max(...dists);return{ok:max<.055,near:max<.095,dists}}
function geomDistance(a,b){if(!a||!b||a.length!==4||b.length!==4)return 999;return a.reduce((s,p,i)=>s+Math.hypot(p.x-b[i].x,p.y-b[i].y),0)/4}
