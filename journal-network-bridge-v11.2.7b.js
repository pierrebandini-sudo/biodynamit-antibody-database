/* BioDynaMit v11.2.7b — Europe PMC network bridge.
   The Journal normally queries Europe PMC with fetch().
   In some embedded Grist/Firefox contexts, the request can fail with a generic
   "NetworkError when attempting to fetch resource" even though the API itself is public.

   Strategy:
   1. Keep the normal fetch path first.
   2. For Europe PMC search requests only, retry without custom headers.
   3. If the browser still blocks the CORS response, fall back to Europe PMC JSONP
      (script tag + callback), which avoids reading a cross-origin fetch response.
   4. Do not proxy Grist data through any third-party service.
*/
(function(){
  'use strict';

  const VERSION = '11.2.7b';
  const EPMC_RE = /^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search(?:\?|$)/i;
  const nativeFetch = window.fetch.bind(window);
  let jsonpSeq = 0;

  function responseLike(data, status=200){
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers({'content-type':'application/json'}),
      url: '',
      redirected: false,
      type: 'basic',
      clone(){ return responseLike(data,status); },
      async json(){ return data; },
      async text(){ return JSON.stringify(data); }
    };
  }

  function jsonpSearch(rawUrl, timeoutMs=20000){
    return new Promise((resolve,reject)=>{
      let url;
      try{ url = new URL(rawUrl); }
      catch(err){ reject(err); return; }

      // Europe PMC historically supports a callback parameter on its REST responses.
      // Keep format=json explicit and use a unique global callback.
      const callback = `__bdmEpmcJsonp_${Date.now()}_${++jsonpSeq}`;
      url.searchParams.set('format','json');
      url.searchParams.set('callback',callback);

      const script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'no-referrer';

      let finished = false;
      const cleanup = ()=>{
        try{ delete window[callback]; }catch(_){ window[callback]=undefined; }
        try{ script.remove(); }catch(_){}
      };
      const done = fn => value=>{
        if(finished) return;
        finished = true;
        clearTimeout(timer);
        cleanup();
        fn(value);
      };

      window[callback] = done(data=>resolve(responseLike(data,200)));
      script.onerror = done(()=>reject(new Error(
        'Europe PMC inaccessible depuis ce widget (fetch et JSONP ont échoué).'
      )));
      const timer = setTimeout(done(()=>reject(new Error(
        'Europe PMC ne répond pas depuis ce widget (délai dépassé).'
      ))), timeoutMs);

      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function epmcFetch(input, init){
    const rawUrl = typeof input === 'string' ? input : input?.url || String(input);

    // First retry as a very simple anonymous CORS GET. This avoids any browser-specific
    // behaviour around inherited/request headers in an embedded widget.
    try{
      return await nativeFetch(rawUrl,{
        method:'GET',
        mode:'cors',
        credentials:'omit',
        cache:'no-store'
      });
    }catch(firstErr){
      console.warn('[BioDynaMit Journal] Europe PMC fetch bloqué, tentative JSONP.', firstErr);
      try{
        const resp = await jsonpSearch(rawUrl);
        console.info('[BioDynaMit Journal] Europe PMC chargé via JSONP fallback.');
        return resp;
      }catch(secondErr){
        console.error('[BioDynaMit Journal] Europe PMC indisponible.', secondErr);
        throw secondErr;
      }
    }
  }

  window.fetch = function(input, init){
    let rawUrl='';
    try{ rawUrl = typeof input === 'string' ? input : input?.url || String(input); }
    catch(_){}

    if(EPMC_RE.test(rawUrl)){
      return epmcFetch(input,init);
    }
    return nativeFetch(input,init);
  };

  window.BioDynaMitJournalNetworkBridge = {
    version:VERSION,
    endpoint:'Europe PMC',
    strategy:'fetch -> simple CORS retry -> JSONP'
  };
})();
