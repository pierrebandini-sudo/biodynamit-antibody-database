/* BioDynaMit v11.8.2 — READ-ONLY diagnostics, installed before app.js.
   No Grist data cache, no schema change, no mutation of inventory data.
   Measures actual Grist calls and rendering readiness, without recording row contents. */
(function(){
  'use strict';
  if(window.BioDynaMitPerfMetricsV1182)return;
  const now=()=>window.performance?.now?.()??Date.now();
  const started=now();
  const logs=[];
  const inFlight=new Map();
  let coalesced=0;
  let firstContentMs=null,firstNavMs=null;
  // Only simultaneous identical reads are shared. Never reuse results after completion.
  const canClone=typeof structuredClone==='function';
  const api={
    version:'11.8.2-audit',start:started,
    get coalescedRequests(){return coalesced;},
    events:logs,
    getStats(){
      const grouped={};
      for(const x of logs){const key=x.kind==='fetchTable'?`Table : ${x.table}`:x.kind;
        const r=grouped[key]||(grouped[key]={calls:0,totalMs:0,maxMs:0,errors:0});
        r.calls++;r.totalMs+=x.ms;r.maxMs=Math.max(r.maxMs,x.ms);if(!x.ok)r.errors++;
      }
      return Object.entries(grouped).map(([name,x])=>({name,calls:x.calls,totalMs:Math.round(x.totalMs),maxMs:Math.round(x.maxMs),errors:x.errors})).sort((a,b)=>b.totalMs-a.totalMs);
    },
    report(){return {elapsedMs:Math.round(now()-started),firstContentMs,firstNavMs,calls:logs.length,coalescedRequests:coalesced,stats:this.getStats(),recent:logs.slice(-12)}}
  };
  window.BioDynaMitPerfMetricsV1182=api;
  const doc=window.grist?.docApi;
  if(!doc){api.setup='Grist API indisponible au moment de l’instrumentation';return;}
  for(const method of ['fetchTable','listTables','applyUserActions']){
    if(typeof doc[method]!=='function')continue;
    const original=doc[method];
    const wrapped=function(...args){
      const t=now();let returned;
      const shareable=canClone&&(method==='fetchTable'||method==='listTables');
      const key=shareable?method+':'+String(args[0]??''):'';
      if(shareable&&inFlight.has(key)){
        coalesced++;
        // Grist callers sometimes modify their local result. Return an independent copy.
        return inFlight.get(key).then(result=>{
          logs.push({kind:'simultaneousReadReused',table:method==='fetchTable'?String(args[0]):'',ms:Math.round(now()-t),ok:true});
          try{return structuredClone(result);}
          catch(_){return original.apply(this,args);}
        },()=>original.apply(this,args));
      }
      try{returned=original.apply(this,args)}catch(err){
        logs.push({kind:method,table:method==='fetchTable'?String(args[0]):'',ms:Math.round(now()-t),ok:false});throw err;
      }
      const promise=Promise.resolve(returned);
      if(shareable)inFlight.set(key,promise);
      return promise.then(result=>{
        if(shareable&&inFlight.get(key)===promise)inFlight.delete(key);
        logs.push({kind:method,table:method==='fetchTable'?String(args[0]):'',ms:Math.round(now()-t),ok:true});
        if(logs.length>1200)logs.splice(0,400);
        return result;
      },err=>{
        if(shareable&&inFlight.get(key)===promise)inFlight.delete(key);
        logs.push({kind:method,table:method==='fetchTable'?String(args[0]):'',ms:Math.round(now()-t),ok:false});throw err;
      });
    };
    try{doc[method]=wrapped;if(doc[method]!==wrapped)api.setup=`Mesure partielle : ${method} non modifiable`;}catch(_){api.setup=`Mesure partielle : ${method} non modifiable`;}
  }
  if(!api.setup)api.setup=canClone?'mesures et fusion des lectures Grist simultanées (sans cache)':'mesures seules (structuredClone non disponible)';
  // Non-intrusive readiness timer, stopped at first page content or 2 minutes.
  if(typeof document!=='undefined'&&typeof window.setInterval==='function'){
    let ticks=0;const watch=window.setInterval(()=>{
      ++ticks;
      try{
        if(firstNavMs===null&&document.querySelector('#nav .nav-item'))firstNavMs=Math.round(now());
        const c=document.querySelector('#content');
        if(firstContentMs===null&&c&&c.children.length&&!(c.textContent||'').includes('Chargement de BioDynaMit et des données Grist'))firstContentMs=Math.round(now());
      }catch(_){}
      if(firstContentMs!==null||ticks>=480)window.clearInterval(watch);
    },250);
  }
})();
