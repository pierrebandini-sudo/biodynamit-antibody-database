/* BioDynaMit v11.4 — Privacy Shield / outbound data guard.
   Objective: reduce accidental data exfiltration from the browser.

   This module does NOT replace Grist Access Rules.
   It adds a second, client-side protection layer:
   - blocks unexpected fetch/XHR/beacon/WebSocket destinations
   - enforces no-referrer on external links
   - prevents external HTML form submissions
   - exposes a status object for Administration/debugging

   Allowed network destinations are intentionally minimal.
*/
(function(){
  'use strict';

  const VERSION='11.4.0';
  const SELF_ORIGIN=location.origin;

  const ALLOWED_EXACT_ORIGINS=new Set([
    SELF_ORIGIN,
    'https://eutils.ncbi.nlm.nih.gov',
    'https://docs.getgrist.com',
    'https://grist.numerique.gouv.fr',
    'wss://grist.numerique.gouv.fr'
  ]);

  function isAllowed(urlLike){
    try{
      const url=new URL(
        typeof urlLike==='string' ? urlLike : (urlLike?.url || String(urlLike)),
        location.href
      );

      if(url.origin===SELF_ORIGIN) return true;
      if(ALLOWED_EXACT_ORIGINS.has(url.origin)) return true;

      // Keep La Suite / DINUM traffic inside the trusted service family.
      if(
        url.protocol==='https:' &&
        (url.hostname==='numerique.gouv.fr' || url.hostname.endsWith('.numerique.gouv.fr'))
      ){
        return true;
      }

      return false;
    }catch(_){
      return false;
    }
  }

  function blockedError(kind,url){
    const safe=String(url||'').slice(0,220);
    console.warn(`[BioDynaMit Privacy ${VERSION}] ${kind} bloqué vers :`, safe);
    return new Error(
      `BioDynaMit Privacy : connexion externe bloquée (${kind}).`
    );
  }

  // ---- fetch --------------------------------------------------------------
  const nativeFetch=window.fetch?.bind(window);
  if(nativeFetch){
    window.fetch=function(input,init){
      const raw=typeof input==='string' ? input : (input?.url||String(input));
      if(!isAllowed(raw)) return Promise.reject(blockedError('fetch',raw));
      return nativeFetch(input,init);
    };
  }

  // ---- XMLHttpRequest -----------------------------------------------------
  const NativeXHR=window.XMLHttpRequest;
  if(NativeXHR){
    class GuardedXHR extends NativeXHR{
      open(method,url,...rest){
        this.__bdmUrl=url;
        if(!isAllowed(url)) throw blockedError('XHR',url);
        return super.open(method,url,...rest);
      }
    }
    window.XMLHttpRequest=GuardedXHR;
  }

  // ---- navigator.sendBeacon ---------------------------------------------
  if(navigator.sendBeacon){
    const nativeBeacon=navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon=function(url,data){
      if(!isAllowed(url)){
        blockedError('sendBeacon',url);
        return false;
      }
      return nativeBeacon(url,data);
    };
  }

  // ---- WebSocket ----------------------------------------------------------
  const NativeWebSocket=window.WebSocket;
  if(NativeWebSocket){
    function GuardedWebSocket(url,protocols){
      if(!isAllowed(url)) throw blockedError('WebSocket',url);
      return protocols===undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url,protocols);
    }
    GuardedWebSocket.prototype=NativeWebSocket.prototype;
    Object.setPrototypeOf(GuardedWebSocket,NativeWebSocket);
    window.WebSocket=GuardedWebSocket;
  }

  // ---- External links: never send current page / Grist referrer ----------
  document.addEventListener('click',event=>{
    const a=event.target?.closest?.('a[href]');
    if(!a) return;
    try{
      const u=new URL(a.href,location.href);
      if(u.origin!==SELF_ORIGIN){
        a.rel='noopener noreferrer';
        a.referrerPolicy='no-referrer';
      }
    }catch(_){}
  },true);

  // ---- Forms: prevent silent submission of data to third-party hosts ------
  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)) return;
    const target=form.getAttribute('action')||location.href;
    if(!isAllowed(target)){
      event.preventDefault();
      event.stopImmediatePropagation();
      try{ window.toast?.('Envoi externe bloqué par la protection des données.'); }catch(_){}
      console.warn('[BioDynaMit Privacy] formulaire externe bloqué:',target);
    }
  },true);

  // ---- Disable accidental referrer leakage globally -----------------------
  try{
    let ref=document.querySelector('meta[name="referrer"]');
    if(!ref){
      ref=document.createElement('meta');
      ref.name='referrer';
      document.head.prepend(ref);
    }
    ref.content='no-referrer';
  }catch(_){}

  window.BioDynaMitPrivacyV114=Object.freeze({
    version:VERSION,
    enabled:true,
    selfOrigin:SELF_ORIGIN,
    allowedOrigins:[...ALLOWED_EXACT_ORIGINS],
    isAllowed
  });

  console.info(`[BioDynaMit Privacy ${VERSION}] garde de sortie réseau actif.`);
})();