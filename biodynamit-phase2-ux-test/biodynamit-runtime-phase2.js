/* Phase 2 integration — explicit adapters, no new interception of Grist methods. */
(function(){
 'use strict';
 const core=['Antibodies','Vials','Boxes','Positions','InventoryTypes','FieldDefinitions','ChoiceOptions','FeatureFlags','AlertRules','InventoryItems','InventoryAttributes','InventoryUnits','InventoryContainers','InventoryPositions','EnrichmentQueue'];
 const canonical=['Suppliers','Antibodies','Boxes','Vials','Positions','Applications','Dilutions','Documents','Notes','History','AppSettings'];
 const config=['InventoryTypes','FieldDefinitions','ChoiceOptions','SupplierConfig','Synonyms','FeatureFlags','AutomationRules','AlertRules','WatchProfiles','WatchTerms','WatchScoring','ImportProfiles','ConfigVersions','InventoryItems','InventoryAttributes','InventoryContainers','InventoryUnits','InventoryPositions','InventoryDocuments','InventoryNotes','InventoryHistory','EnrichmentQueue'];
 const team=['LabReviews','LabUsage','LabUnitMeta','LabOrders','MicroscopeProfiles','LabInventoryChecks'];
 const permissions=['SecurityAdminGate','SecurityEditorGate','PublicSettings'];
 const auxiliary=['AuditLog','ActivityLog','TeamActivityLog'];
 window.BioDynaMitPhase2Runtime={
  create(getState){
   const api=window.grist?.docApi;if(!api)throw Error('API Grist indisponible.');
   const D=new window.BioDynaMitDataEnginePhase2.DataService({
    api:{fetchTable:name=>api.fetchTable(name),listTables:()=>api.listTables()},
    yieldTask:()=>new Promise(resolve=>setTimeout(resolve,0)),
    publish(pairs,info){
      const state=getState();
      for(const [name,table] of Object.entries(pairs)){
        state.data[name]=table;
        if(window.BioDynaMitV112)window.BioDynaMitV112.data[name]=table;
        if(team.includes(name)&&window.BioDynaMitTeamV115)window.BioDynaMitTeamV115.data[name]=table;
        if([...permissions,...auxiliary].includes(name)&&window.BioDynaMitV113)window.BioDynaMitV113.data[name]=table;
      }
      if(D.catalogue)state.tables=D.catalogue.slice();
      const ns=window.BioDynaMitV112;
      if(ns){ns.ready=config.slice(0,13).every(n=>state.tables.includes(n));if(core.every(n=>!state.tables.includes(n)||D.snapshots.has(n)))ns.loadState='ready';}
    },
    onError(error,tables){D.lastError={message:String(error.message||error),kind:error.name||'Error',tables};D.showStatus?.(D.lastError.message,true);}
   });
   D.register([...canonical,...config,...team,...permissions,...auxiliary]);
   // InventoryType is a Text key in the validated schema, not a Grist Ref.
   D.applicationEdges=[...config.filter(n=>n!=='InventoryTypes'),...team].map(n=>['InventoryTypes',n]);
   D.applicationEdges.push(['FieldDefinitions','InventoryAttributes'],['FieldDefinitions','InventoryItems']);
   // String-code relations are application conventions, absent from Grist Ref metadata.
   D.semanticReferences=['LabReviews','LabUsage','LabOrders','LabUnitMeta'].flatMap(table=>[
     {target:'Antibodies',table,column:'ItemCode',inventoryType:'primary_antibody'},
     {target:'InventoryItems',table,column:'ItemCode',matchInventory:true}
   ]).concat(['LabUsage','LabUnitMeta','LabInventoryChecks'].flatMap(table=>[
     {target:'Vials',table,column:'UnitCode',inventoryType:'primary_antibody'},
     {target:'InventoryUnits',table,column:'UnitCode',matchInventory:true}
   ]),[
     {target:'Boxes',table:'LabInventoryChecks',column:'ContainerCode',inventoryType:'primary_antibody'},
     {target:'InventoryContainers',table:'LabInventoryChecks',column:'ContainerCode',matchInventory:true}
   ],['InventoryItems','InventoryUnits','InventoryContainers','InventoryPositions','FieldDefinitions','ImportProfiles',...team].filter(n=>n!=='MicroscopeProfiles').map(table=>({target:'InventoryTypes',targetColumn:'Key',table,column:'InventoryType'})));
   D.coreTables=core;D.configTables=config;D.teamTables=team;D.permissionTables=permissions;
   D.plan=function(){
    const state=getState(),route=String(state.route||'dashboard'),ns=window.BioDynaMitV112;
    const legacy=(state.tables||[]).filter(n=>!canonical.includes(n)&&/antibod|20c|4c|storage/i.test(n));
    if(route==='documents')return ['Documents','InventoryDocuments','EnrichmentQueue','InventoryItems','Antibodies'];
    if(route==='journal')return [...core,'Notes','WatchProfiles','WatchTerms','WatchScoring','PublicSettings'];
    if(route==='admin')return [...config,...(ns?.adminTab==='security'?['AuditLog','ActivityLog','TeamActivityLog',...permissions]:[])];
    if(route==='team-tools')return [...core,...team];
    if(route==='alerts')return [...core,'AlertRules'];
    if(route==='antibody-detail')return [...core,'Dilutions','Applications','Documents','Notes','History','ActivityLog',...team,...legacy];
    if(route==='antibodies')return [...core,...legacy];
    if(route.startsWith('inv:')&&ns?.inventoryView?.[route.slice(4)]==='detail'){
      const tab=ns.inventoryDetailTab?.[route.slice(4)]||'overview';
      return [...core,'ActivityLog',...team,...(tab==='documents'?['InventoryDocuments']:tab==='notes'?['InventoryNotes']:tab==='history'?['InventoryHistory']:[])];
    }
    return core;
   };
   const pending=new Map();
   D.planKey=()=>JSON.stringify([getState().route,window.BioDynaMitV112?.inventoryView,window.BioDynaMitV112?.inventoryDetailTab,getState().selectedAntibody,window.BioDynaMitV112?.inventorySelected]);
   D.gate=function(){
    const state=getState();
    if(state.initialStatus==='loading'){document.querySelector('#content').innerHTML='<div class="bd1183-status" role="status">Chargement des données Grist…</div>';return true;}
    if(state.initialStatus==='error')return true;
    const genericCore=['InventoryItems','InventoryAttributes','InventoryUnits','InventoryContainers','InventoryPositions','FieldDefinitions'];
    const route=String(state.route||''),required=[];
    if(state.tables.includes('InventoryTypes')&&(route==='dashboard'||route.startsWith('inv:')||route==='team-tools'))required.push(...genericCore);
    if(route==='documents')required.push('Documents',...(state.tables.includes('InventoryTypes')?['InventoryDocuments']:[]));
    if(route==='antibody-detail')required.push('Documents','Notes','History','Dilutions','Applications');
    if(route.startsWith('inv:'))for(const n of D.plan())if(['InventoryDocuments','InventoryNotes','InventoryHistory'].includes(n))required.push(n);
    const absent=[...new Set(required)].filter(n=>!state.tables.includes(n));
    if(absent.length){
      const content=document.querySelector('#content');content.innerHTML='<div class="bd1183-status" role="alert"><b>Structure Grist incomplète ou inaccessible</b><p>Tables absentes : '+absent.join(', ')+'. Aucun inventaire vide n’est déduit de cette absence.</p><button class="btn" data-phase2-discover>Relire le catalogue</button></div>';
      content.querySelector('[data-phase2-discover]').onclick=async()=>{try{await D.fullRefresh({reason:'manual'});render();}catch(error){D.showStatus?.(error.message,true);}};return true;
    }
    const names=D.plan().filter(n=>state.tables.includes(n)||D.snapshots.has(n)),failures=names.filter(n=>D.errors.has(n)),missing=names.filter(n=>!D.snapshots.has(n)||D.dirty.has(n));
    const content=document.querySelector('#content');
    if(failures.length){
      content.innerHTML='<div class="bd1183-status" role="alert"><b>Données indisponibles</b><p>La lecture de '+failures.map(n=>String(n).replace(/[&<>"']/g,'')).join(', ')+' a échoué. Aucun inventaire vide n’est déduit de cette erreur.</p><button class="btn" data-phase2-retry>Réessayer</button></div>';
      content.querySelector('[data-phase2-retry]').onclick=async()=>{try{await D.ensure(names,{fresh:true,reason:'retry'});render();}catch(_) {}};return true;
    }
    if(!missing.length){if(window.BioDynaMitV112)window.BioDynaMitV112.loadError=null;return false;}
    content.innerHTML='<div class="bd1183-status" role="status">Chargement des données de cette vue…</div>';
    const key=D.planKey();
    if(!pending.has(key)){
      const task=D.ensure(names,{reason:'route'}).then(()=>{if(D.planKey()===key)render();},()=>{if(D.planKey()===key)D.gate();}).finally(()=>pending.delete(key));pending.set(key,task);
    }
    return true;
   };
   D.bootstrap=async()=>{
     const [data]=await Promise.all([D.ensure(core,{reason:'initial'}),D.auditSchema()]);
     return data;
   };
   D.background=function(names){
     const fresh=names.filter(n=>getState().tables.includes(n)&&!D.snapshots.has(n));
     if(!fresh.length)return;
     D.ensure(fresh,{reason:'background'}).catch(()=>{});
   };
   D.getState=getState;
   window.BioDynaMitDataPhase2=D;return D;
  }
 };
})();
