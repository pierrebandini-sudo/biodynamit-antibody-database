/* BioDynaMit v11.8.2 — PROTOTYPE ciblé, OFF by default.
   TEST COPIES ONLY. Fast mode is explicit opt-in via bottom-right panel.
   After a successful stock-only Grist action, the next loadAll reads ONLY the
   affected stock/history tables. Unknown actions always use original loadAll.
   This does not preserve synchronization of unrelated external edits: use
   full refresh to synchronize all tables. No persistent data cache is made.
*/
(function(){
  'use strict';
  if(window.BioDynaMitTargetedRefreshV1182)return;
  const perf=window.BioDynaMitPerfMetricsV1182;
  const clock=()=>window.performance?.now?.()??Date.now();
  const canUse=typeof loadAll==='function'&&typeof state==='object'&&!!window.grist?.docApi;
  let enabled=false;
  let pending=null;
  let forceFull=false;
  let busy=false;
  const outcomes=[];
  const allowed=new Set(['Vials','Positions','History','InventoryUnits','InventoryPositions','InventoryHistory']);
  const allowOps=new Set(['UpdateRecord','AddRecord','RemoveRecord','BulkUpdateRecord','BulkAddRecord','BulkRemoveRecord']);
  const stats={full:0,targeted:0,failed:0};
  const push=(entry)=>{outcomes.push(entry);if(outcomes.length>100)outcomes.shift();};
  const diagnostic={
    version:'11.8.2-test',ready:canUse,stats,outcomes,
    get enabled(){return enabled;},
    setEnabled(v){enabled=Boolean(v)&&canUse;pending=null;forceFull=false;return enabled;},
    async fullRefresh(){
      if(!canUse)throw Error('Chargement Grist non disponible');
      pending=null;forceFull=false;
      const began=clock();
      await originalLoadAll();
      push({mode:'full-manual',ms:Math.round(clock()-began),tables:'toutes'});
      // Re-render only when fully loaded; never show zero from a failed fetch.
      if(typeof render==='function')render();
    },
    report(){return {enabled,stats:{...stats},lastRefreshes:outcomes.slice(-10),grist:perf?.report?.()||null};},
    show(){return show();}
  };
  window.BioDynaMitTargetedRefreshV1182=diagnostic;
  if(!canUse){console.warn('[BioDynaMit 11.8.2] Fonctions de base indisponibles; diagnostic seul.');return;}
  const doc=window.grist.docApi;
  const baseApply=doc.applyUserActions;
  const originalLoadAll=loadAll;
  doc.applyUserActions=async function(actions,...rest){
    const result=await baseApply.call(this,actions,...rest);
    if(!enabled)return result;
    if(!Array.isArray(actions)||!actions.length){forceFull=true;return result;}
    const touched=new Set();let safe=true;
    for(const a of actions){
      if(!Array.isArray(a)||!allowOps.has(a[0])||!allowed.has(a[1])){safe=false;break;}
      touched.add(a[1]);
    }
    if(!safe){forceFull=true;pending=null;}
    else if(!forceFull){pending=pending||new Set();for(const t of touched)pending.add(t);}
    return result;
  };
  loadAll=async function(...args){
    if(!enabled||!pending||forceFull||busy||!state.connected||!state.data||!Array.isArray(state.tables)){
      const before=clock();stats.full++;
      const out=await originalLoadAll.apply(this,args);
      pending=null;forceFull=false;
      push({mode:'full',ms:Math.round(clock()-before)});
      return out;
    }
    const touched=[...pending];pending=null;
    // Do not silently convert a missing table to an empty inventory.
    if(!touched.every(t=>state.tables.includes(t)&&state.data[t])){
      const before=clock();stats.full++;
      const out=await originalLoadAll.apply(this,args);
      push({mode:'full-fallback',ms:Math.round(clock()-before)});
      return out;
    }
    busy=true;const before=clock();
    try{
      // Fetch all affected tables first; only commit after every read succeeds.
      const pairs=await Promise.all(touched.map(async t=>[t,await doc.fetchTable(t)]));
      for(const [t,table] of pairs){
        if(!table || (typeof table!=='object'))throw Error(`Invalid Grist table: ${t}`);
      }
      for(const [t,table] of pairs){
        state.data[t]=table;
        if(window.BioDynaMitV112?.data)window.BioDynaMitV112.data[t]=table;
      }
      stats.targeted++;
      push({mode:'targeted',ms:Math.round(clock()-before),tables:touched.join(', ')});
    }catch(err){
      stats.failed++;
      // A failed targeted refresh MUST fall back to normal full reload, not zero tables.
      const duration=clock();
      push({mode:'targeted-failed',ms:Math.round(duration-before),error:String(err.message||err)});
      stats.full++;
      await originalLoadAll.apply(this,args);
      push({mode:'full-fallback',ms:Math.round(clock()-duration)});
    }finally{busy=false;}
  };
  function show(){
    const r=diagnostic.report();
    const entries=(r.grist?.stats||[]).slice(0,14).map(x=>`${x.name} : ${x.calls} lectures, ${x.totalMs} ms cumulés`).join('\n');
    const recent=r.lastRefreshes.map(x=>`${x.mode} : ${x.ms} ms${x.tables?` (${x.tables})`:''}`).join('\n')||'Aucune mesure après modification.';
    alert(`BioDynaMit 11.8.2 TEST\n\nMode rapide vial : ${enabled?'ACTIF (test uniquement)':'INACTIF (mode sûr)'}\nPremier contenu : ${r.grist?.firstContentMs??'non mesuré'} ms\nNavigation : ${r.grist?.firstNavMs??'non mesurée'} ms\nLectures simultanées fusionnées : ${r.grist?.coalescedRequests??0}\nRechargements complets : ${stats.full}\nRechargements ciblés : ${stats.targeted}\n\nDernières opérations :\n${recent}\n\nLectures Grist :\n${entries||'Aucune mesure disponible.'}`);
    return r;
  }
  function addControls(){
    if(document.getElementById('v1182Panel'))return;
    const bar=document.createElement('div');bar.id='v1182Panel';
    bar.style.cssText='position:fixed;right:12px;bottom:12px;z-index:100000;display:flex;flex-wrap:wrap;gap:5px;background:#fff;color:#243247;border:1px solid #a0aeba;border-radius:9px;padding:7px;box-shadow:0 2px 12px #0002;font:12px Arial,sans-serif;max-width:min(94vw,500px)';
    const b=(txt,fn)=>{const el=document.createElement('button');el.type='button';el.textContent=txt;el.style.cssText='padding:5px 9px;border:1px solid #9dabb7;border-radius:6px;background:#f5f8fb;color:#243247;cursor:pointer';el.onclick=fn;bar.appendChild(el);return el;};
    const toggle=b('Mode rapide : NON',()=>{
      const next=!enabled;
      if(next&&!confirm('Mode expérimental pour les modifications de vials. Sur une COPIE TEST uniquement : les autres tables ne sont pas relues immédiatement. Activer ?'))return;
      diagnostic.setEnabled(next);toggle.textContent=`Mode rapide : ${enabled?'OUI':'NON'}`;
    });
    b('Mesures',show);
    b('Actualiser tout',async()=>{
      const btn=bar.querySelector('[data-reload]');if(btn)btn.disabled=true;
      try{await diagnostic.fullRefresh();alert('Actualisation complète terminée.');}
      catch(e){alert('Échec actualisation : '+String(e.message||e));}
      finally{if(btn)btn.disabled=false;}
    }).setAttribute('data-reload','1');
    document.body.appendChild(bar);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addControls,{once:true});
  else addControls();
})();
