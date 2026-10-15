/* BioDynaMit v11.8 — diagnostic non intrusif et lecture seule. */
(function(){
  'use strict';
  const start=performance.now();
  const perf={version:'11.8',scripts:0,styles:0,gristReadyMs:null,firstDataMs:null,navVisibleMs:null,initialNavRoute:null,
    readOnly:true};
  const stats=()=>{
    const res=performance.getEntriesByType('resource');
    const nav=performance.getEntriesByType('navigation')[0];
    const js=res.filter(r=>/\.js(?:\?|$)/.test(r.name));
    const css=res.filter(r=>/\.css(?:\?|$)/.test(r.name));
    return {
      mode:location.pathname.includes('v11.8-BETA')?'optimisé':'référence',
      navigationDCLms:nav?Math.round(nav.domContentLoadedEventEnd):null,
      navigationLoadms:nav?Math.round(nav.loadEventEnd):null,
      firstNavVisibleMs:perf.navVisibleMs,
      firstGristConnectedMs:perf.gristReadyMs,
      firstGristInventoryTableMs:perf.firstDataMs,
      scriptsRequested:js.length,cssRequested:css.length,
      totalResources:res.length,
      transferBytesReported:Math.round(res.reduce((a,r)=>a+(r.transferSize||0),0)),
      isTestMeasurement:true,
      note:'Les tailles réseau cross-origin peuvent être cachées; comparer surtout les temps.'
    };
  };
  function observe(){
    const elapsed=Math.round(performance.now());
    if(perf.navVisibleMs===null && document.querySelector('#nav .nav-item'))perf.navVisibleMs=elapsed;
    try{
      // Accès lecture seule à la variable globale définie par app.js.
      if(typeof state!=='undefined'){
        if(perf.gristReadyMs===null&&state.connected===true)perf.gristReadyMs=elapsed;
        if(perf.firstDataMs===null&&state.connected===true&&(
          state.data?.InventoryItems || state.data?.Antibodies
        ))perf.firstDataMs=elapsed;
      }
    }catch(_){}
  }
  let ticks=0;
  const timer=setInterval(()=>{
    observe();
    if(++ticks>=120 || (perf.firstDataMs!==null&&perf.navVisibleMs!==null))clearInterval(timer);
  },250);
  const report=()=>{
    observe();
    const data=stats();
    console.table(data);
    return data;
  };
  window.BioDynaMitBootPerfV118={version:'11.8',metrics:perf,report};
  window.addEventListener('load',()=>setTimeout(()=>{
    observe();
    console.info('[BioDynaMit 11.8] Diagnostic prêt : BioDynaMitBootPerfV118.report()');
  },0),{once:true});
})();
