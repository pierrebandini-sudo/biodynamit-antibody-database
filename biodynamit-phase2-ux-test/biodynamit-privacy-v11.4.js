(function(){
'use strict';
const VERSION='11.4.1', SELF_ORIGIN=location.origin;
document.addEventListener('click',event=>{
  const a=event.target?.closest?.('a[href]'); if(!a) return;
  try{
    const u=new URL(a.href,location.href);
    if(u.origin!==SELF_ORIGIN){a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}
  }catch(_){}
},true);
document.addEventListener('submit',event=>{
  const form=event.target; if(!(form instanceof HTMLFormElement)) return;
  const action=form.getAttribute('action')||location.href;
  try{
    const u=new URL(action,location.href);
    if(u.origin!==SELF_ORIGIN){
      event.preventDefault(); event.stopImmediatePropagation();
      try{window.toast?.('Envoi externe bloqué par la protection des données.');}catch(_){}
      console.warn('[BioDynaMit Privacy] formulaire externe bloqué:',u.href);
    }
  }catch(_){}
},true);
window.BioDynaMitPrivacyV114=Object.freeze({
  version:VERSION,enabled:true,mode:'safe',networkGuard:'CSP connect-src',selfOrigin:SELF_ORIGIN
});
console.info(`[BioDynaMit Privacy ${VERSION}] mode sûr actif.`);
})();