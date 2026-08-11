/* Sociosofia OMR · v0.12 — calibração relativa de confiança.
   Não reduzimos simplesmente o limiar absoluto. Cada linha compara a melhor
   alternativa com a segunda e com o baseline das demais bolhas. Isso permite
   reconhecer uma marca um pouco fraca quando ela se destaca claramente,
   mantendo revisão/dupla quando há competição real entre alternativas. */

classify = function(scores,qtd=8){
  const rows=[];

  for(let q=1;q<=qtd;q++){
    const s=scores[q];
    const ranked=[...'ABCDE']
      .map(l=>({l,v:Number(s[l]||0)}))
      .sort((a,b)=>b.v-a.v);

    const top=ranked[0], second=ranked[1];
    const rest=ranked.slice(1).map(x=>x.v).sort((a,b)=>a-b);
    const baseline=(rest[1]+rest[2])/2; // centro das quatro não vencedoras
    const gap=top.v-second.v;
    const contrast=top.v-baseline;

    let state='em branco',answer='—';

    // Dupla provável: duas marcas relevantes e próximas entre si.
    if(top.v>=.40 && second.v>=.38 && gap<.15){
      state='dupla';
      answer=top.l+'/'+second.l;
    }
    // Marca válida forte pelo valor absoluto, desde que haja separação mínima.
    else if(top.v>=.52 && gap>=.10 && contrast>=.16){
      state='válida';
      answer=top.l;
    }
    // Marca válida moderada, mas muito claramente dominante na própria linha.
    else if(top.v>=.38 && gap>=.17 && contrast>=.19){
      state='válida';
      answer=top.l;
    }
    // Existe sinal, mas não queremos automatizar a decisão.
    else if(top.v>=.25 || (top.v>=.21 && gap>=.12)){
      state='revisar';
      answer=top.l;
    }

    rows.push({
      q,answer,state,max:top.v,
      second:second.v,
      gap,contrast,
      runnerUp:second.l
    });
  }
  return rows;
};

// Mostra o índice vencedor e a margem para podermos calibrar com dados de campo.
render = function(rows){
  resultBody.innerHTML='';
  for(const r of rows){
    const cls=r.state==='válida'?'ok':r.state==='revisar'?'warn':r.state==='dupla'?'bad':'blank';
    const idx=Number.isFinite(r.gap)
      ?`${r.max.toFixed(2)} · Δ${r.gap.toFixed(2)}`
      :r.max.toFixed(2);
    resultBody.insertAdjacentHTML('beforeend',
      `<tr><td><b>Q${r.q}</b></td><td><b>${r.answer}</b></td><td><span class="badge ${cls}">${r.state}</span></td><td>${idx}</td></tr>`);
  }
};
