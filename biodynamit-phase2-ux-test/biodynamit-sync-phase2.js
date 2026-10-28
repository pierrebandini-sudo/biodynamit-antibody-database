/* Bounded synchronization. Grist's linked-table event is not an all-table feed. */
(function(){
 'use strict';
 const D=window.BioDynaMitDataPhase2;if(!D)return;
 let scheduled=null,running=null,stopped=false,booted=false,pending=false,manualPending=false;
 const eventNames=new Set();let fullQueued=false;
 const intervalMs=60000;
 const bar=document.createElement('div');bar.className='phase2-sync-bar';bar.setAttribute('aria-label','Synchronisation des données');
 bar.innerHTML='<span role="status" aria-live="polite">Phase 2 TEST · Connexion…</span><button type="button" class="btn btn-sm" data-phase2-refresh>Actualiser tout</button><button type="button" class="btn btn-sm" data-phase2-diagnostics>Diagnostic</button>';
 document.body.appendChild(bar);const label=bar.querySelector('span');
 D.showStatus=(text,error=false)=>{if(label.textContent!==text)label.textContent=text;bar.classList.toggle('phase2-error',error);};
 D.onChange(info=>{
   if(!booted||D.editing||D.activeOperation)return;
   if(['periodic','focus','grist-event','background','manual'].includes(info.reason))scheduleRender(info);
 });
 let renderQueued=false;
 function scheduleRender(info){
  const relevant=new Set(D.plan());if(D.getState().route==='dashboard')relevant.add('History');
  if(!info.changed.some(n=>relevant.has(n))||renderQueued)return;
  renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;if(!D.editing&&!D.activeOperation){D.captureView();render();}});
 }
 async function sync(reason='periodic',{force=false,names=null}={}){
  if(stopped||!booted||document.hidden)return {skipped:true};
  if(running){pending=true;if(names)names.forEach(n=>eventNames.add(n));else fullQueued=true;return running;}
  if(D.editing||D.activeOperation||D.activeNative.size){pending=true;return {deferred:true};}
  running=D.synchronize({reason,force,names}).then(async result=>{
    if(!result.deferred&&!result.throttled){
      if(window.BioDynaMitV113?.refreshSecurityData)await window.BioDynaMitV113.refreshSecurityData();
      D.showStatus('Phase 2 TEST · Données relues'+(D.graph.verified&&!D.graph.dynamic.length?'':' · Dépendances : mode complet'));
    }
    return result;
  }).catch(error=>{D.showStatus(error.message||String(error),true);return {error:String(error.message||error)};}).finally(()=>{
    running=null;
    if(pending&&!D.editing&&!D.activeOperation&&!D.activeNative.size){pending=false;if(eventNames.size||fullQueued)queue('grist-event',[]);}
  });
  return running;
 }
 function queue(reason,names=null){
  if(stopped||!booted)return;
  if(names)names.forEach(n=>eventNames.add(n));else fullQueued=true;
  if(scheduled!==null)clearTimeout(scheduled);
  scheduled=setTimeout(()=>{scheduled=null;const requested=fullQueued?null:[...eventNames];fullQueued=false;eventNames.clear();sync(reason,{force:true,names:requested});},200);
 }
 // Public SDK event, limited to the table actually connected to the widget.
 if(typeof window.grist?.on==='function')grist.on('message',msg=>{
  if(!booted||!msg?.dataChange||!msg.tableId||!D.catalogue?.includes(msg.tableId))return;
  D.invalidate(D.graph.affected([msg.tableId],D.dataNames()));
  eventNames.add(msg.tableId);
  if(D.activeOperation||D.editing){pending=true;return;}queue('grist-event',[msg.tableId]);
 });
 window.addEventListener('focus',()=>{if(performance.now()-D.lastSync>1000&&performance.now()-(D.lastWriteAt||0)>1000)queue('focus');});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue('focus');});
 bar.querySelector('[data-phase2-refresh]').onclick=async()=>{
   if(D.activeOperation||D.activeNative.size)return D.showStatus('Enregistrement en cours ; actualisation reportée.');
   if(D.editing){pending=true;manualPending=true;return D.showStatus('Fermer ou enregistrer le formulaire pour actualiser sans perdre la saisie.');}
   const b=bar.querySelector('[data-phase2-refresh]');b.disabled=true;
   try{await D.fullRefresh({reason:'manual'});await window.BioDynaMitV113?.refreshSecurityData();render();D.showStatus('Phase 2 TEST · Actualisation complète terminée');}
   catch(error){D.showStatus(error.message||String(error),true);}finally{b.disabled=false;}
 };
 bar.querySelector('[data-phase2-diagnostics]').onclick=()=>{
   const report=D.diagnostics();console.info('BioDynaMit Phase 2 TEST',report);
   alert('Phase 2 TEST — À CONFIRMER DANS GRIST\n\nTables chargées : '+report.loaded.length+'\nDépendances : '+report.dependencies.reason+'\nLectures mesurées : '+report.metrics.filter(m=>m.kind==='fetchTable').length+'\nErreurs de table : '+report.errors.join(', ')+'\n\nLe diagnostic ne contient aucune ligne de données. Un verrou serveur n’est pas fourni par le widget.');
 };
 const timer=setInterval(()=>{if(!document.hidden)sync('periodic');},intervalMs);
 const closed=D.endEdit.bind(D);D.endEdit=()=>{
  closed();if(!pending)return;pending=false;
  if(manualPending||performance.now()-D.lastSync>=intervalMs){manualPending=false;queue('focus');}
  else if(D.dirty.size)queue('grist-event',[...D.dirty]);
 };
 window.BioDynaMitSyncPhase2={run:sync,intervalMs,stop(){stopped=true;clearInterval(timer);if(scheduled!==null)clearTimeout(scheduled);},get pending(){return pending;},get running(){return !!running;}};
 Promise.resolve(window.BioDynaMitInitialLoad).then(()=>{booted=D.getState().initialStatus==='ready';D.lastSync=performance.now();D.showStatus(booted?'Phase 2 TEST · Données disponibles':'Phase 2 TEST · Chargement impossible',!booted);});
})();
