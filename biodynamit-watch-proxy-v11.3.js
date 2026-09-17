/* BioDynaMit v11.3.3 — Europe PMC direct + same-origin popup relay.
   No external proxy account required.

   Strategy:
   1. Try Europe PMC directly.
   2. If the Grist iframe blocks it, use a helper page hosted on the SAME
      GitHub Pages site as BioDynaMit.
   3. Keep the optional external proxy only as a last fallback if one is configured.
*/
(function(){
  'use strict';

  const VERSION='11.3.3';
  const EPMC_RE=/^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search(?:\?|$)/i;
  const nativeFetch=window.fetch.bind(window);
  const SAME_ORIGIN=window.location.origin;
  const RELAY_URL=new URL('europepmc-relay.html?v=11.3.3',window.location.href).href;

  let relayWindow=null;
  let relayReady=false;
  let readyPromise=null;
  let readyResolve=null;
  let seq=0;
  const pending=new Map();

  async function getPublicSetting(key,fallback=''){
    try{
      const sec=window.BioDynaMitSecurityV113||window.BioDynaMitV113;
      if(sec?.getPublicSetting){
        const v=await sec.getPublicSetting(key,fallback);
        return String(v ?? fallback).trim();
      }
    }catch(_){}
    try{
      if(window.grist?.docApi?.fetchTable){
        const raw=await grist.docApi.fetchTable('PublicSettings');
        const list=(typeof rows==='function')?rows(raw):[];
        const rec=list.find(r=>String(r.Key||'')===key);
        if(rec?.Value!=null) return String(rec.Value).trim();
      }
    }catch(_){}
    return String(fallback).trim();
  }

  function responseLike(body,status=200,contentType='application/json'){
    if(typeof Response!=='undefined'){
      return new Response(body,{status,headers:{'content-type':contentType||'application/json'}});
    }
    return {
      ok:status>=200&&status<300,
      status,
      statusText:status===200?'OK':'Error',
      headers:new Headers({'content-type':contentType||'application/json'}),
      async json(){return JSON.parse(body);},
      async text(){return body;},
      clone(){return responseLike(body,status,contentType);}
    };
  }

  function resetRelay(){
    relayWindow=null;
    relayReady=false;
    readyPromise=null;
    readyResolve=null;
  }

  function ensureRelay(){
    if(relayWindow && !relayWindow.closed) return relayWindow;
    relayReady=false;
    readyPromise=new Promise(resolve=>{readyResolve=resolve;});
    relayWindow=window.open(
      RELAY_URL,
      'BioDynaMitEuropePMC',
      'popup=yes,width=540,height=430,resizable=yes,scrollbars=yes'
    );
    if(!relayWindow){
      resetRelay();
      throw new Error(
        'La fenêtre de connexion Europe PMC a été bloquée. Autorise les pop-ups pour BioDynaMit puis reclique sur « Actualiser la veille ».'
      );
    }
    return relayWindow;
  }

  /* Important: open the helper while the click is still a real user gesture,
     otherwise Firefox/Chrome may block window.open(). */
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#v1116RefreshWatch,#v1116OlderWatch')){
      try{ ensureRelay(); }catch(err){ console.warn(err); }
    }
  },true);

  window.addEventListener('message',event=>{
    if(event.origin!==SAME_ORIGIN) return;
    const msg=event.data||{};
    if(msg.source!=='BioDynaMitEuropePMCRelay') return;

    if(msg.type==='ready'){
      relayReady=true;
      if(readyResolve) readyResolve(true);
      readyResolve=null;
      return;
    }

    if(msg.type==='response' && msg.id){
      const job=pending.get(msg.id);
      if(!job) return;
      pending.delete(msg.id);
      clearTimeout(job.timer);
      if(msg.error) job.reject(new Error(msg.error));
      else job.resolve(responseLike(
        String(msg.body||''),
        Number(msg.status||200),
        msg.contentType||'application/json'
      ));
    }
  });

  async function waitReady(timeoutMs=8000){
    ensureRelay();
    if(relayReady) return;
    if(!readyPromise) readyPromise=new Promise(resolve=>{readyResolve=resolve;});

    let timer;
    await Promise.race([
      readyPromise,
      new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Le relais BioDynaMit ne répond pas.')),timeoutMs);
      })
    ]).finally(()=>clearTimeout(timer));
  }

  async function relayFetch(rawUrl,timeoutMs=30000){
    await waitReady();
    if(!relayWindow || relayWindow.closed){
      resetRelay();
      throw new Error('La fenêtre Europe PMC a été fermée avant la fin de la recherche.');
    }

    const id=`bdm-${Date.now()}-${++seq}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(id);
        reject(new Error('Europe PMC : délai dépassé via le relais BioDynaMit.'));
      },timeoutMs);

      pending.set(id,{resolve,reject,timer});
      relayWindow.postMessage({
        source:'BioDynaMitWidget',
        type:'fetch',
        id,
        url:rawUrl
      },SAME_ORIGIN);
    });
  }

  async function directEuropePmc(rawUrl){
    const r=await nativeFetch(rawUrl,{
      method:'GET',
      mode:'cors',
      credentials:'omit',
      cache:'no-store'
    });
    if(!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
    return r;
  }

  async function proxyEuropePmc(rawUrl,base){
    const clean=String(base||'').trim().replace(/\/$/,'');
    if(!clean) throw new Error('Proxy de veille non configuré.');
    const src=new URL(rawUrl);
    const dst=new URL(clean+'/europepmc');
    for(const [k,v] of src.searchParams.entries()) dst.searchParams.append(k,v);
    const r=await nativeFetch(dst.toString(),{
      method:'GET',mode:'cors',credentials:'omit',cache:'no-store'
    });
    if(!r.ok) throw new Error(`Proxy Europe PMC HTTP ${r.status}`);
    return r;
  }

  async function europePmcFetch(rawUrl){
    const proxyBase=(await getPublicSetting('scientific_watch_proxy_url','')).replace(/\/$/,'');

    try{
      const r=await directEuropePmc(rawUrl);
      console.info('[BioDynaMit Journal] Europe PMC direct.');
      return r;
    }catch(err){
      console.warn('[BioDynaMit Journal] Direct bloqué, tentative relais GitHub Pages.',err);
    }

    try{
      const r=await relayFetch(rawUrl);
      console.info('[BioDynaMit Journal] Europe PMC via relais BioDynaMit.');
      return r;
    }catch(relayErr){
      console.warn('[BioDynaMit Journal] Relais en échec.',relayErr);
      if(proxyBase) return proxyEuropePmc(rawUrl,proxyBase);
      throw relayErr;
    }
  }

  window.fetch=function(input,init){
    let raw='';
    try{ raw=typeof input==='string'?input:(input?.url||String(input)); }catch(_){}
    if(EPMC_RE.test(raw)) return europePmcFetch(raw);
    return nativeFetch(input,init);
  };

  window.BioDynaMitScientificWatchProxyV113={
    version:VERSION,
    originalFetch:nativeFetch,
    endpoint:'Europe PMC direct + GitHub Pages relay',
    relayUrl:RELAY_URL
  };
})();