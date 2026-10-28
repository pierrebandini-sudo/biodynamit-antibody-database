/* BioDynaMit v11.7.5.7 — correctif lecture des valeurs importées Excel.
   Problème corrigé :
   InventoryAttributes.ValueBool vaut false par défaut dans Grist. L'ancien lecteur
   utilisait ce false même lorsqu'une vraie ValueText / ValueNumber / ValueDate était
   présente, ce qui transformait les données importées en "Non".

   Ce module est volontairement additif :
   - aucune donnée Grist n'est modifiée ;
   - aucun modèle 3D n'est modifié ;
   - les valeurs sont corrigées uniquement en mémoire au moment de l'affichage.
*/
(function(){
  'use strict';

  const VERSION='11.7.5.7';
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};

  function hasText(v){
    return v!==null && v!==undefined && String(v).trim()!=='';
  }
  function hasScalar(v){
    return v!==null && v!==undefined && v!=='';
  }

  function sanitizeTable(table){
    if(!table)return 0;
    let changed=0;

    // Row-array representation.
    if(Array.isArray(table)){
      for(const a of table){
        if(!a || typeof a!=='object')continue;
        const other=hasText(a.ValueText)||hasScalar(a.ValueNumber)||hasScalar(a.ValueDate);
        if(other && (a.ValueBool===true || a.ValueBool===false)){
          a.ValueBool=null;
          changed++;
        }
      }
      return changed;
    }

    // {records:[...]} representation.
    if(Array.isArray(table.records)){
      return sanitizeTable(table.records);
    }

    // Grist columnar table representation.
    const bools=table.ValueBool;
    if(!Array.isArray(bools))return 0;
    const texts=Array.isArray(table.ValueText)?table.ValueText:[];
    const nums=Array.isArray(table.ValueNumber)?table.ValueNumber:[];
    const dates=Array.isArray(table.ValueDate)?table.ValueDate:[];

    for(let i=0;i<bools.length;i++){
      const other=hasText(texts[i])||hasScalar(nums[i])||hasScalar(dates[i]);
      if(other && (bools[i]===true || bools[i]===false)){
        bools[i]=null;
        changed++;
      }
    }
    return changed;
  }

  function sanitizeLoadedAttributes(){
    const seen=new Set();
    let changed=0;
    const candidates=[
      window.state?.data?.InventoryAttributes,
      ns.data?.InventoryAttributes
    ];
    for(const table of candidates){
      if(!table || seen.has(table))continue;
      seen.add(table);
      changed+=sanitizeTable(table);
    }
    return changed;
  }

  // 1) Réparer immédiatement les données déjà chargées.
  sanitizeLoadedAttributes();

  // 2) Réappliquer après chaque rechargement Grist.
  if(typeof window.loadAll==='function'){
    const previousLoadAll=window.loadAll;
    window.loadAll=async function(){
      const result=await previousLoadAll.apply(this,arguments);
      sanitizeLoadedAttributes();
      return result;
    };
    // Conserver aussi la liaison globale utilisée par les anciens modules.
    try{ loadAll=window.loadAll; }catch(_){}
  }

  // 3) Sécuriser tous les appels externes au moteur d'inventaire.
  if(typeof ns.inventoryData==='function'){
    const previousInventoryData=ns.inventoryData;
    ns.inventoryData=function(type){
      sanitizeLoadedAttributes();
      return previousInventoryData(type);
    };
  }
  if(typeof ns.renderInventory==='function'){
    const previousRenderInventory=ns.renderInventory;
    ns.renderInventory=function(type){
      sanitizeLoadedAttributes();
      return previousRenderInventory(type);
    };
  }

  // 4) La navigation générique passe par render() : corriger juste avant rendu.
  if(typeof window.render==='function'){
    const previousRender=window.render;
    window.render=function(){
      sanitizeLoadedAttributes();
      return previousRender.apply(this,arguments);
    };
    try{ render=window.render; }catch(_){}
  }

  // 5) Un dernier passage après initialisation des scripts.
  setTimeout(()=>{
    const n=sanitizeLoadedAttributes();
    if(n && String(window.state?.route||'').startsWith('inv:')){
      try{ window.render?.(); }catch(_){}
    }
  },0);

  window.BioDynaMitAttributeValueFixV11757={
    version:VERSION,
    sanitizeLoadedAttributes,
    _test:{sanitizeTable,hasText,hasScalar}
  };
})();
