/* BioDynaMit v11.3.2 — Scientific watch direct-first compatibility bridge.
   Goal: restore the original Europe PMC behaviour without requiring an external account.

   Strategy for Europe PMC search requests:
   1. Direct browser GET to Europe PMC (default, same principle as v11.1.6).
   2. JSONP fallback for restrictive embedded-browser contexts.
   3. Optional configured proxy only if an admin explicitly provides one.

   PublicSettings:
   - scientific_watch_mode: direct (default) | proxy
   - scientific_watch_proxy_url: optional; only used in proxy mode or as last fallback.
*/
(function(){
  'use strict';

  const VERSION='11.3.2';
  const EPMC_RE=/^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search(?:\?|$)/i;
  const nativeFetch=window.fetch.bind(window);
  let jsonpSeq=0;

  async function getPublicSetting(key, fallback=''){
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
        const toRows=(table)=>{
          if(typeof rows==='function') return rows(table);
          if(!table || !Array.isArray(table.id)) return [];
          const keys=Object.keys(table);
          return table.id.map((id,i)=>{
            const r={id};
            for(const k of keys){
              if(k==='id') continue;
              if(Array.isArray(table[k])) r[k]=table[k][i];
            }
            return r;
          });
        };
        const rec=toRows(raw).find(r=>String(r.Key||'')===key);
        if(rec && rec.Value != null) return String(rec.Value).trim();
      }
    }catch(_){}
    return String(fallback).trim();
  }

  function responseLike(data,status=200){
    return {
      ok:status>=200 && status<300,
      status,
      statusText:status===200?'OK':'Error',
      headers:new Headers({'content-type':'application/json'}),
      url:'', redirected:false, type:'basic',
      clone(){return responseLike(data,status);},
      async json(){return data;},
      async text(){return JSON.stringify(data);}
    };
  }

  async function directEuropePmc(rawUrl){
    // Keep the request deliberately simple: no custom headers, no credentials.
    const r=await nativeFetch(rawUrl,{
      method:'GET',
      mode:'cors',
      credentials:'omit',
      cache:'no-store'
    });
    if(!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
    return r;
  }

  function jsonpEuropePmc(rawUrl,timeoutMs=15000){
    return new Promise((resolve,reject)=>{
      let url;
      try{url=new URL(rawUrl);}catch(err){reject(err);return;}

      const callback=`__bdmEpmc_${Date.now()}_${++jsonpSeq}`;
      url.searchParams.set('format','json');
      url.searchParams.set('callback',callback);

      const script=document.createElement('script');
      script.async=true;
      script.referrerPolicy='no-referrer';
      let done=false;

      const cleanup=()=>{
        try{delete window[callback];}catch(_){window[callback]=undefined;}
        try{script.remove();}catch(_){}
      };
      const finish=(fn,value)=>{
        if(done) return;
        done=true;
        clearTimeout(timer);
        cleanup();
        fn(value);
      };

      window[callback]=(data)=>finish(resolve,responseLike(data,200));
      script.onerror=()=>finish(reject,new Error('Europe PMC JSONP indisponible.'));
      const timer=setTimeout(()=>finish(reject,new Error('Europe PMC JSONP : délai dépassé.')),timeoutMs);
      script.src=url.toString();
      document.head.appendChild(script);
    });
  }

  async function proxyEuropePmc(rawUrl,base){
    const clean=String(base||'').trim().replace(/\/$/,'');
    if(!clean) throw new Error('Proxy de veille non configuré.');

    const src=new URL(rawUrl);
    const dst=new URL(clean+'/europepmc');
    for(const [k,v] of src.searchParams.entries()) dst.searchParams.append(k,v);

    const r=await nativeFetch(dst.toString(),{
      method:'GET', mode:'cors', credentials:'omit', cache:'no-store'
    });
    if(!r.ok) throw new Error(`Proxy Europe PMC HTTP ${r.status}`);
    return r;
  }

  async function europePmcFetch(rawUrl){
    const mode=(await getPublicSetting('scientific_watch_mode','direct')).toLowerCase();
    const proxyBase=(await getPublicSetting('scientific_watch_proxy_url','')).replace(/\/$/,'');

    // Explicit proxy mode remains available, but it is no longer mandatory.
    if(mode==='proxy' && proxyBase){
      try{return await proxyEuropePmc(rawUrl,proxyBase);}
      catch(err){console.warn('[BioDynaMit Journal] Proxy en échec, retour au mode direct.',err);}
    }

    try{
      const r=await directEuropePmc(rawUrl);
      console.info('[BioDynaMit Journal] Europe PMC chargé directement.');
      return r;
    }catch(directErr){
      console.warn('[BioDynaMit Journal] Accès direct Europe PMC bloqué, tentative JSONP.',directErr);
    }

    try{
      const r=await jsonpEuropePmc(rawUrl);
      console.info('[BioDynaMit Journal] Europe PMC chargé via JSONP.');
      return r;
    }catch(jsonpErr){
      console.warn('[BioDynaMit Journal] JSONP Europe PMC indisponible.',jsonpErr);
    }

    // If an optional proxy URL already exists, use it only as the final fallback.
    if(proxyBase){
      return proxyEuropePmc(rawUrl,proxyBase);
    }

    throw new Error(
      'Europe PMC est inaccessible depuis ce widget. Le mode direct a été essayé sans proxy externe.'
    );
  }

  window.fetch=function(input,init){
    let raw='';
    try{raw=typeof input==='string'?input:(input?.url||String(input));}catch(_){}
    if(EPMC_RE.test(raw)) return europePmcFetch(raw);
    return nativeFetch(input,init);
  };

  window.BioDynaMitScientificWatchProxyV113={
    version:VERSION,
    originalFetch:nativeFetch,
    endpoint:'Europe PMC direct-first; proxy optional',
    defaultMode:'direct'
  };
})();
