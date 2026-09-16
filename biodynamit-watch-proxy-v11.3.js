/* BioDynaMit v11.3 — Scientific watch proxy bridge.
   Rewrites only Europe PMC search requests to the proxy URL stored in PublicSettings.
   No Grist data is sent to any third-party service beyond the public search terms
   already used by the scientific watch.
*/
(function(){
  'use strict';

  const VERSION='11.3.0';
  const EPMC_RE=/^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search(?:\?|$)/i;
  const nativeFetch=window.fetch.bind(window);

  async function proxyBase(){
    try{
      const sec=window.BioDynaMitSecurityV113||window.BioDynaMitV113;
      if(sec?.getPublicSetting){
        return String(await sec.getPublicSetting('scientific_watch_proxy_url','')).trim().replace(/\/$/,'');
      }
    }catch(_){}
    try{
      if(window.grist?.docApi?.fetchTable){
        const raw=await grist.docApi.fetchTable('PublicSettings');
        const rowsFn=typeof rows==='function'?rows:null;
        const list=rowsFn?rowsFn(raw):[];
        const rec=list.find(r=>r.Key==='scientific_watch_proxy_url');
        if(rec?.Value) return String(rec.Value).trim().replace(/\/$/,'');
      }
    }catch(_){}
    return '';
  }

  async function proxiedEuropePmc(rawUrl,init){
    const base=await proxyBase();
    if(!base){
      throw new Error(
        'Proxy de veille non configuré. Un administrateur doit renseigner son URL dans Administration → Sécurité & audit.'
      );
    }

    const src=new URL(rawUrl);
    const dst=new URL(base+'/europepmc');
    for(const [k,v] of src.searchParams.entries()) dst.searchParams.append(k,v);

    const response=await nativeFetch(dst.toString(),{
      method:'GET',
      mode:'cors',
      credentials:'omit',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });
    if(!response.ok) throw new Error(`Proxy Europe PMC HTTP ${response.status}`);
    return response;
  }

  window.fetch=function(input,init){
    let raw='';
    try{raw=typeof input==='string'?input:(input?.url||String(input));}catch(_){}
    if(EPMC_RE.test(raw)) return proxiedEuropePmc(raw,init);
    return nativeFetch(input,init);
  };

  window.BioDynaMitScientificWatchProxyV113={
    version:VERSION,
    originalFetch:nativeFetch,
    endpoint:'Europe PMC via configured BioDynaMit proxy'
  };
})();
