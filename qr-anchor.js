/* Sociosofia OMR · v0.11 — QR como âncora geométrica primária.
   O QR já é um fiducial 2D robusto e o BarcodeDetector fornece seus quatro
   cornerPoints. Como conhecemos a posição canônica do QR no OMR-08-v1,
   extrapolamos a homografia para os quatro marcadores e para toda a grade.

   Referência calibrada na imagem canônica OMR_laboratorio_v0_1_retificada:
   marcador-centro TL=(20,20), BR=(1180,520), portanto área útil 1160x500;
   QR detectado aproximadamente TL=(960,161), TR=(1138,161),
   BR=(1138,333), BL=(958,333).
*/

const QR_ANCHOR_08={
  left:(959-20)/1160,
  right:(1138-20)/1160,
  top:(161-20)/500,
  bottom:(333-20)/500
};

// Enriquece a leitura já existente com os quatro cantos reais do QR.
detectQR=async function(){
  if(barcodeDetector)try{
    const codes=await barcodeDetector.detect(work);
    const c=codes.find(x=>x.rawValue?.startsWith('C1:'))||codes[0];
    if(c){
      const cp=Array.isArray(c.cornerPoints)
        ?c.cornerPoints.map(p=>({x:Number(p.x),y:Number(p.y)}))
        :[];
      return{text:c.rawValue,box:c.boundingBox,cornerPoints:cp};
    }
  }catch(e){}
  return{text:'',box:null,cornerPoints:[]};
};

function markerCornersFromQR(qr){
  if(!qr||!Array.isArray(qr.cornerPoints)||qr.cornerPoints.length!==4)return null;
  if(typeof projectivePoint!=='function')return null;

  // BarcodeDetector: TL, TR, BR, BL. Nosso projetor: TL, TR, BL, BR.
  const q=[qr.cornerPoints[0],qr.cornerPoints[1],qr.cornerPoints[3],qr.cornerPoints[2]];
  const r=QR_ANCHOR_08;
  const du=r.right-r.left,dv=r.bottom-r.top;
  if(!(du>0&&dv>0))return null;

  const fromGlobal=(u,v)=>projectivePoint(q,(u-r.left)/du,(v-r.top)/dv);
  const c=[fromGlobal(0,0),fromGlobal(1,0),fromGlobal(0,1),fromGlobal(1,1)];
  if(c.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  return c;
}

function qrAnchorUsable(qr,W,H){
  const c=markerCornersFromQR(qr);
  if(!c)return null;
  // Permitimos alguma extrapolação fora do viewport, mas não uma solução absurda.
  const marginX=W*.22,marginY=H*.22;
  if(c.some(p=>p.x<-marginX||p.x>W+marginX||p.y<-marginY||p.y>H+marginY))return null;
  const [tl,tr,bl,br]=c;
  const top=Math.hypot(tr.x-tl.x,tr.y-tl.y),bot=Math.hypot(br.x-bl.x,br.y-bl.y);
  const left=Math.hypot(bl.x-tl.x,bl.y-tl.y),right=Math.hypot(br.x-tr.x,br.y-tr.y);
  if(Math.min(top,bot)<W*.30||Math.min(left,right)<H*.10)return null;
  return c;
}
