/* Exact existing XLSX dependency, loaded only when a file is selected. */
(function(){
 'use strict';
 const base=new URL('.',document.currentScript.src);
 let xlsxPromise=null;
 function xlsx(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(xlsxPromise)return xlsxPromise;
  xlsxPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=new URL('vendor/xlsx-0.18.5.full.min.js',base).href;
   script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('XLSX indisponible après chargement.'));
   script.onerror=()=>reject(Error('Échec du chargement Excel. Réessayer la sélection du fichier.'));
   document.head.appendChild(script);
  }).catch(err=>{xlsxPromise=null;throw err;});
  return xlsxPromise;
 }
 window.BioDynaMitDependenciesV1183=Object.freeze({xlsx});
})();
