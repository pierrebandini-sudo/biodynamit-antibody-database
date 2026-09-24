/* BioDynaMit v11.7.5 — stockage unifié, ajout par URL fournisseur et gestion des références.
   Couche additive construite sur l'état GitHub v11.7.5 vérifié avant modification.
   - "Attribuer une position" pour primaires ET secondaires.
   - Stock physique séparé du contrôle qualité.
   - Ajout par URL fournisseur avec fiche adaptative primaire/secondaire et validation humaine.
   - Archivage/restauration et suppression définitive Admin sécurisée.
   - Aucun changement des modèles 3D validés.
*/
(function(){
  'use strict';

  const VERSION='11.7.5';
  const PRIMARY='primary_antibody';
  const SEC='secondary_antibody';
    const v112=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const v113=window.BioDynaMitV113||{};
  const v117=window.BioDynaMitV117=window.BioDynaMitV117||{};
  const W=window.BioDynaMitWorkflowsV1175=window.BioDynaMitWorkflowsV1175||{};
  W.version=VERSION;
  W.observer=W.observer||null;

  const e=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const compact=v=>norm(v).replace(/\s+/g,'');
  const tr=name=>{try{return rows(state.data?.[name]||v112.data?.[name]||v113.data?.[name])||[]}catch(_){return[]}};
  const nowSec=()=>Date.now()/1000;
  const archivedStatus=v=>/^(archive|archived)$/i.test(norm(v));
  const activeRaw=r=>!(r?.Active===false||r?.Active===0||archivedStatus(r?.Status));
  const dateSec=s=>s?new Date(`${s}T12:00:00Z`).getTime()/1000:null;
  const joinValue=v=>Array.isArray(v)?v.filter(Boolean).join(', '):String(v??'');
  const isAdmin=()=>v113.role==='admin';

  function secondaryData(){
    try{return v112.inventoryData?.(SEC)||{type:SEC,mode:'empty',items:[],units:[],containers:[],positions:[]}}
    catch(_){return {type:SEC,mode:'empty',items:[],units:[],containers:[],positions:[]}}
  }
  function currentPrimary(){return tr('Antibodies').find(a=>Number(a.id)===Number(state.selectedAntibody))||null}
  function currentSecondary(data=secondaryData()){
    const id=v112.inventorySelected?.[SEC];
    return data.items.find(i=>String(i.id)===String(id))||null;
  }
  function activePrimary(){return tr('Antibodies').filter(activeRaw)}
  function archivedPrimary(){return tr('Antibodies').filter(a=>!activeRaw(a))}
  function activeSecondaryRaw(){return tr('InventoryItems').filter(i=>i.InventoryType===SEC&&activeRaw(i))}
  function archivedSecondaryRaw(){return tr('InventoryItems').filter(i=>i.InventoryType===SEC&&!activeRaw(i))}

  function primaryUnitsFor(a){
    return tr('Vials').filter(v=>Number(v.Antibody)===Number(a?.id)&&!archivedStatus(v.Status));
  }
  function primaryLocationsFor(a){
    const ids=new Set(primaryUnitsFor(a).map(v=>Number(v.id)));
    return tr('Positions').filter(p=>Number(p.Vial)>0&&ids.has(Number(p.Vial)));
  }
  function primaryUnpositioned(a){
    const located=new Set(primaryLocationsFor(a).map(p=>Number(p.Vial)));
    return primaryUnitsFor(a).filter(v=>!located.has(Number(v.id)));
  }
  function secondaryUnitsFor(item,data=secondaryData()){
    if(!item)return[];
    return data.units.filter(u=>!archivedStatus(u.status)&&(String(u.itemId||'')===String(item.id)||(u.itemCode&&String(u.itemCode)===String(item.code))));
  }
  function secondaryLocationsFor(item,data=secondaryData()){
    const codes=new Set(secondaryUnitsFor(item,data).map(u=>String(u.code)));
    return data.positions.filter(p=>codes.has(String(p.unitCode||'')));
  }
  function secondaryUnpositioned(item,data=secondaryData()){
    const located=new Set(secondaryLocationsFor(item,data).map(p=>String(p.unitCode||'')));
    return secondaryUnitsFor(item,data).filter(u=>!located.has(String(u.code)));
  }
  function pendingSecondaryUnit(u){
    const m=norm(u?.matchStatus),s=norm(u?.status);
    if(m==='validated'||m==='manual')return false;
    if(s==='a reconcilier')return true;
    if(/review|unresolved/.test(m))return true;
    return m==='other reagent'&&s!=='en stock';
  }
  function pendingForSecondary(item,data=secondaryData()){
    if(!item)return[];
    return data.units.filter(u=>pendingSecondaryUnit(u)&&(
      String(u.candidateItemCode||'')===String(item.code)||String(u.itemCode||'')===String(item.code)||String(u.itemId||'')===String(item.id)
    ));
  }

  function physicalStockState(kind,item){
    if(kind==='primary'){
      const units=primaryUnitsFor(item),locations=primaryLocationsFor(item),locatedIds=new Set(locations.map(p=>Number(p.Vial))),unlocated=units.filter(v=>!locatedIds.has(Number(v.id))).length;
      if(!units.length)return{key:'zero',label:'0 vial relié',cl:'neutral',title:'Aucun vial relié à cette référence.',units,locations,unlocated:0};
      if(!locations.length)return{key:'unlocated',label:`${units.length} vial${units.length>1?'s':''} non positionné${units.length>1?'s':''}`,cl:'warn',title:'Vial relié à la référence mais sans position de stockage.',units,locations,unlocated:units.length};
      if(unlocated)return{key:'partial',label:`${locations.length} positionné${locations.length>1?'s':''} · ${unlocated} à ranger`,cl:'warn',title:'Une partie des vials reste à positionner.',units,locations,unlocated};
      return{key:'located',label:`${units.length} vial${units.length>1?'s':''} positionné${units.length>1?'s':''}`,cl:'ok',title:'Tous les vials reliés possèdent une position.',units,locations,unlocated:0};
    }
    const data=secondaryData(),units=secondaryUnitsFor(item,data),locations=secondaryLocationsFor(item,data),locatedCodes=new Set(locations.map(p=>String(p.unitCode||''))),unlocated=units.filter(u=>!locatedCodes.has(String(u.code))).length;
    if(!units.length)return{key:'zero',label:'0 vial relié',cl:'neutral',title:'Aucun vial relié à cette référence.',units,locations,unlocated:0};
    if(!locations.length)return{key:'unlocated',label:`${units.length} vial${units.length>1?'s':''} non positionné${units.length>1?'s':''}`,cl:'warn',title:'Vial relié à la référence mais sans position de stockage.',units,locations,unlocated:units.length};
    if(unlocated)return{key:'partial',label:`${locations.length} positionné${locations.length>1?'s':''} · ${unlocated} à ranger`,cl:'warn',title:'Une partie des vials reste à positionner.',units,locations,unlocated};
    return{key:'located',label:`${units.length} vial${units.length>1?'s':''} positionné${units.length>1?'s':''}`,cl:'ok',title:'Tous les vials reliés possèdent une position.',units,locations,unlocated:0};
  }

  function slotParts(slot){const m=/^([A-Z])(\d{1,2})$/i.exec(String(slot||'').trim());return m?{r:m[1].toUpperCase().charCodeAt(0)-65,c:Number(m[2])-1}:{r:999,c:999}}
  function slotSort(a,b){const x=slotParts(a.slot||a.Slot),y=slotParts(b.slot||b.Slot);return x.r-y.r||x.c-y.c}
  function primaryFreePositions(){return tr('Positions').filter(p=>!Number(p.Vial)&&p.Available===true).slice().sort((a,b)=>Number(a.Box)-Number(b.Box)||slotSort(a,b))}
  function primaryFreeBoxes(){const free=primaryFreePositions(),counts=new Map();free.forEach(p=>counts.set(Number(p.Box),(counts.get(Number(p.Box))||0)+1));return tr('Boxes').filter(b=>(counts.get(Number(b.id))||0)>0).map(b=>({...b,_free:counts.get(Number(b.id))||0}))}
  function secondaryFreePositions(data=secondaryData()){return data.positions.filter(p=>!p.unitCode&&p.available!==false).slice().sort((a,b)=>String(a.containerCode).localeCompare(String(b.containerCode),'fr')||slotSort(a,b))}
  function secondaryFreeContainers(data=secondaryData()){const free=secondaryFreePositions(data),counts=new Map();free.forEach(p=>counts.set(String(p.containerCode),(counts.get(String(p.containerCode))||0)+1));return data.containers.filter(c=>(counts.get(String(c.code))||0)>0).map(c=>({...c,_free:counts.get(String(c.code))||0}))}

  function primaryHistory(action,code,details,entityType='Antibody'){
    if(!state.tables?.includes?.('History'))return null;
    return ['AddRecord','History',null,{Date:nowSec(),Action:action,EntityType:entityType,EntityCode:code||'',Details:details||'',User:'Grist'}];
  }
  function secondaryHistory(action,code,details,entityType='InventoryItem'){
    if(!state.tables?.includes?.('InventoryHistory'))return null;
    return ['AddRecord','InventoryHistory',null,{Date:nowSec(),InventoryType:SEC,Action:action,EntityType:entityType,EntityCode:code||'',Details:details||'',User:'Grist'}];
  }
  async function refreshAll(){if(typeof loadAll==='function')await loadAll()}

  function generatedCode(prefix,records,field='Code'){
    const d=new Date(),p=n=>String(n).padStart(2,'0'),base=`${prefix}-${String(d.getFullYear()).slice(-2)}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const used=new Set((records||[]).map(r=>norm(r[field]||r.code||'')));let code=base,i=2;while(used.has(norm(code)))code=`${base}-${i++}`;return code;
  }
  function nextPrimaryCode(){const used=new Set(tr('Antibodies').map(a=>String(a.Code||'')));let n=Math.max(0,...tr('Antibodies').map(a=>Number(String(a.Code||'').match(/^AB-(\d+)$/i)?.[1]||0)))+1,code='';do{code=`AB-${String(n++).padStart(4,'0')}`}while(used.has(code));return code}
  function nextSecondaryCode(ref){const used=new Set(tr('InventoryItems').filter(i=>i.InventoryType===SEC).map(i=>String(i.Code||'')));const base=`SEC-${String(ref||'NEW').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'NEW'}`;if(!used.has(base))return base;let i=2;while(used.has(`${base}-${i}`))i++;return`${base}-${i}`}

  async function liveFree(kind,id){
    try{
      const table=kind==='primary'?'Positions':'InventoryPositions',field=kind==='primary'?'Vial':'Unit';
      const raw=await grist.docApi.fetchTable(table),r=rows(raw).find(x=>String(x.id)===String(id));
      if(!r)return{ok:false,reason:'Position introuvable.'};
      if(Number(r[field])>0)return{ok:false,reason:'Cette position vient d’être occupée.'};
      if(r.Available!==true)return{ok:false,reason:'Cette position est marquée indisponible.'};
      return{ok:true,row:r};
    }catch(err){return{ok:false,reason:err?.message||String(err)}}
  }

  function unitForm(kind){
    const code=generatedCode(kind==='primary'?'V':'SEC-V',kind==='primary'?tr('Vials'):secondaryData().units,kind==='primary'?'Code':'code');
    return `<div id="v1174NewVialFields"><div class="form-grid"><div class="field"><label>Code vial *</label><input id="v1174VialCode" value="${e(code)}"></div><div class="field"><label>Date de réception</label><input id="v1174VialDate" type="date"></div><div class="field"><label>Remplissage</label><select id="v1174VialFill"><option>Plein</option><option>≈ 50 %</option><option>Inconnu</option></select></div><div class="field"><label>Volume estimé (µL)</label><input id="v1174VialVolume" type="number" min="0" step="1"></div></div><div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="v1174VialComments" rows="3"></textarea></div></div>`;
  }
  function readUnitDraft(){return{Code:(document.querySelector('#v1174VialCode')?.value||'').trim(),DateReceived:dateSec(document.querySelector('#v1174VialDate')?.value||''),FillStatus:document.querySelector('#v1174VialFill')?.value||'Inconnu',EstimatedVolume_uL:document.querySelector('#v1174VialVolume')?.value===''?null:Number(document.querySelector('#v1174VialVolume')?.value),Status:'En stock',Comments:(document.querySelector('#v1174VialComments')?.value||'').trim()}}

  function assignData(kind,item){
    if(kind==='primary'){
      const free=primaryFreePositions(),boxes=primaryFreeBoxes(),unpositioned=primaryUnpositioned(item);
      return{free,containers:boxes,unpositioned,containerKey:'Box',containerId:b=>String(b.id),containerName:b=>b.Name||b.Code,containerTemp:b=>b.Temperature||'',positionContainer:p=>String(p.Box),positionSlot:p=>p.Slot,positionId:p=>p.id};
    }
    const data=secondaryData(),free=secondaryFreePositions(data),containers=secondaryFreeContainers(data),unpositioned=secondaryUnpositioned(item,data);
    return{free,containers,unpositioned,containerKey:'Container',containerId:c=>String(c.code),containerName:c=>c.name||c.code,containerTemp:c=>c.temperature||'',positionContainer:p=>String(p.containerCode),positionSlot:p=>p.slot,positionId:p=>p.id,data};
  }

  async function finishOpenPosition(kind,container,pos,unit){
    await refreshAll();closeModal();
    if(kind==='primary'){
      state.selectedVial=Number(unit.id);state.selectedBox=Number(container.id);
      const sv=window.BioDynaMitIntegratedStorageV11?.state;if(sv){sv.boxId=Number(container.id);sv.slot=pos.Slot;sv.opened=true;sv.view='3d'}
      if(window.BioDynaMitIntegratedStorageV11?.openVial)await window.BioDynaMitIntegratedStorageV11.openVial(Number(unit.id));else go('storage');
    }else{
      v112.inventoryView[SEC]='storage';const st=v112.storageState[SEC]=v112.storageState[SEC]||{};st.containerCode=container.code;st.slot=pos.slot;st.view='2d';st.opened=true;v112.renderInventory?.(SEC);
    }
  }

  function showAssignPosition(kind,itemArg=null){
    const item=itemArg||(kind==='primary'?currentPrimary():currentSecondary());if(!item)return toast('Référence introuvable.');
    const d=assignData(kind,item);if(!d.containers.length)return toast('Aucune position réellement libre n’est disponible dans les boîtes de cet inventaire.');
    const existing=d.unpositioned;
    modal(`<div class="v1174-assign"><p class="u127-eyebrow">STOCKAGE · ${kind==='primary'?'PRIMAIRE':'SECONDAIRE'}</p><h2>Attribuer une position</h2><p class="subtitle"><b>${e(item.Name||item.name||item.Code||item.code)}</b> · ${e(item.CatalogNumber||item.catalogNumber||'sans référence')}</p>${existing.length?`<div class="banner neutral"><b>${existing.length} vial${existing.length>1?'s':''} déjà relié${existing.length>1?'s':''} mais non positionné${existing.length>1?'s':''}.</b> Tu peux en ranger un sans créer de doublon.</div><div class="field" style="margin-top:12px"><label>Vial à positionner</label><select id="v1174UnitMode"><option value="existing">Utiliser un vial existant non positionné</option><option value="new">Créer un nouveau vial</option></select></div><div id="v1174ExistingWrap" class="field"><label>Vial existant *</label><select id="v1174ExistingUnit">${existing.map(u=>`<option value="${e(u.id)}">${e(u.Code||u.code)} · ${e(u.FillStatus||u.fillStatus||u.Status||u.status||'')}</option>`).join('')}</select></div>`:`<input type="hidden" id="v1174UnitMode" value="new">`}<div id="v1174NewWrap" ${existing.length?'hidden':''}>${unitForm(kind)}</div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Boîte *</label><select id="v1174AssignBox">${d.containers.map(c=>`<option value="${e(d.containerId(c))}">${e(d.containerName(c))} · ${e(d.containerTemp(c)||'Température non renseignée')} · ${d.free.filter(p=>d.positionContainer(p)===d.containerId(c)).length} libre(s)</option>`).join('')}</select></div><div class="field"><label>Position *</label><select id="v1174AssignSlot"></select></div></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1174AssignCancel">Annuler</button><button class="btn btn-primary" id="v1174AssignSave">Attribuer la position</button></div></div>`);
    const mode=document.querySelector('#v1174UnitMode'),newWrap=document.querySelector('#v1174NewWrap'),existingWrap=document.querySelector('#v1174ExistingWrap'),box=document.querySelector('#v1174AssignBox'),slot=document.querySelector('#v1174AssignSlot');
    const toggle=()=>{if(!mode)return;const isNew=mode.value==='new';if(newWrap)newWrap.hidden=!isNew;if(existingWrap)existingWrap.hidden=isNew};if(mode?.tagName==='SELECT')mode.onchange=toggle;toggle();
    const drawSlots=()=>{const list=d.free.filter(p=>d.positionContainer(p)===String(box.value));slot.innerHTML=list.map(p=>`<option value="${e(d.positionId(p))}">${e(d.positionSlot(p))}</option>`).join('')};box.onchange=drawSlots;drawSlots();
    document.querySelector('#v1174AssignCancel').onclick=closeModal;
    document.querySelector('#v1174AssignSave').onclick=async()=>{
      const posId=slot.value,pos=d.free.find(p=>String(d.positionId(p))===String(posId)),container=d.containers.find(c=>d.containerId(c)===String(box.value));if(!pos||!container)return toast('Choisis une position libre.');
      const live=await liveFree(kind,posId);if(!live.ok)return toast(live.reason);
      const save=document.querySelector('#v1174AssignSave');save.disabled=true;save.textContent='Enregistrement…';
      try{
        let unit=null;
        if(mode?.value==='existing'){
          unit=existing.find(u=>String(u.id)===String(document.querySelector('#v1174ExistingUnit')?.value));if(!unit)throw Error('Vial existant introuvable.');
        }else{
          const draft=readUnitDraft();if(!draft.Code)throw Error('Le code vial est obligatoire.');
          const duplicateCode=kind==='primary'?tr('Vials').some(v=>norm(v.Code)===norm(draft.Code)):secondaryData().units.some(u=>norm(u.code)===norm(draft.Code));if(duplicateCode)throw Error('Ce code vial existe déjà.');
          if(kind==='primary'){
            const rec={...draft,Antibody:Number(item.id)};if(rec.DateReceived===null)delete rec.DateReceived;
            await grist.docApi.applyUserActions([['AddRecord','Vials',null,rec]]);await refreshAll();unit=tr('Vials').find(v=>String(v.Code)===draft.Code);
          }else{
            const rec={Code:draft.Code,InventoryType:SEC,Item:Number(item.id),FillStatus:draft.FillStatus,EstimatedVolume_uL:draft.EstimatedVolume_uL,Status:'En stock',Comments:draft.Comments,MatchStatus:'validated',CandidateItemCode:item.code||''};if(draft.DateReceived!==null)rec.DateReceived=draft.DateReceived;
            await grist.docApi.applyUserActions([['AddRecord','InventoryUnits',null,rec]]);await refreshAll();unit=secondaryData().units.find(u=>String(u.code)===draft.Code);
          }
          if(!unit)throw Error('Vial créé mais introuvable après relecture.');
          const live2=await liveFree(kind,posId);if(!live2.ok){const table=kind==='primary'?'Vials':'InventoryUnits';await grist.docApi.applyUserActions([['UpdateRecord',table,Number(unit.id),{Status:'À ranger'}]]);throw Error(`${live2.reason} Le vial a été conservé avec le statut « À ranger ».`)}
        }
        const actions=[];
        if(kind==='primary'){
          actions.push(['UpdateRecord','Positions',Number(posId),{Vial:Number(unit.id),Available:false}]);const h=primaryHistory('Attribution position',unit.Code||'',`${item.Name||item.Code} → ${container.Name||container.Code} / ${pos.Slot}`,'Vial');if(h)actions.push(h);
        }else{
          actions.push(['UpdateRecord','InventoryPositions',Number(posId),{Unit:Number(unit.id),Available:false}]);const h=secondaryHistory('Attribution position',unit.code||unit.Code||'',`${item.name||item.code} → ${container.name||container.code} / ${pos.slot}`,'InventoryUnit');if(h)actions.push(h);
        }
        await grist.docApi.applyUserActions(actions);await finishOpenPosition(kind,container,pos,unit);toast(`✓ Position attribuée : ${d.containerName(container)} / ${d.positionSlot(pos)}`);
      }catch(err){console.error('v11.7.5 assign:',err);toast(`Attribution impossible : ${err?.message||err}`);save.disabled=false;save.textContent='Attribuer la position'}
    };
  }

  /* --------------------- Product creation by supplier URL --------------------
     v11.7.5 scope rule: this Reader/enrichment UI exists ONLY inside an explicit
     product-creation workflow (list Add button or "Nouvel anticorps" from a free
     primary storage slot). It is never injected in dashboards, detail pages,
     Administration, Team Activity or ordinary navigation.                         */
  const PRODUCT_PROFILES={
    [PRIMARY]:{
      title:'Anticorps primaire',
      fields:[
        ['name','Nom *','text'],['supplier','Fournisseur','text'],['catalogNumber','Référence catalogue *','text'],
        ['target','Cible','text'],['hostSpecies','Espèce hôte','text'],['className','Classe / isotype','text'],
        ['applications','Applications','text'],['molecularWeight','Poids moléculaire','text'],['website','Lien produit','url']
      ],
      extras:['targetSpecies','clonality','cloneId','rrid','fluorophore','excitation_nm','emission_nm','storageTemperature']
    },
    [SEC]:{
      title:'Anticorps secondaire',
      fields:[
        ['name','Nom *','text'],['supplier','Fournisseur','text'],['catalogNumber','Référence catalogue *','text'],
        ['targetSpecies','Espèce cible / réactivité','text'],['hostSpecies','Espèce hôte','text'],['target','Cible / antigène','text'],
        ['className','Classe / isotype','text'],['fluorophore','Fluorophore / conjugué','text'],
        ['excitation_nm','Excitation (nm)','number'],['emission_nm','Émission (nm)','number'],
        ['storageTemperature','Température de stockage','text'],['website','Lien produit','url']
      ],
      extras:['applications','clonality','cloneId','rrid','molecularWeight']
    },
    chemical:{
      title:'Produit chimique',
      fields:[
        ['name','Nom *','text'],['supplier','Fournisseur','text'],['catalogNumber','Référence catalogue *','text'],
        ['casNumber','Numéro CAS','text'],['molecularFormula','Formule moléculaire','text'],['molarMass','Masse molaire','text'],
        ['purity','Pureté / assay','text'],['concentration','Concentration','text'],['solvent','Solvant','text'],
        ['physicalForm','Forme','text'],['storageTemperature','Stockage','text'],['hazard','Danger / signalétique','text'],['website','Lien produit','url']
      ],
      extras:[]
    }
  };
  const PRODUCT_LABELS={
    name:'Nom',supplier:'Fournisseur',catalogNumber:'Référence catalogue',website:'URL produit',target:'Cible',targetSpecies:'Espèce cible / réactivité',
    hostSpecies:'Espèce hôte',className:'Classe / isotype',applications:'Applications',molecularWeight:'Poids moléculaire',storageTemperature:'Stockage',
    fluorophore:'Fluorophore / conjugué',excitation_nm:'Excitation',emission_nm:'Émission',clonality:'Clonalité',cloneId:'Clone',rrid:'RRID',
    casNumber:'Numéro CAS',molecularFormula:'Formule moléculaire',molarMass:'Masse molaire',purity:'Pureté',concentration:'Concentration',solvent:'Solvant',
    physicalForm:'Forme',hazard:'Danger / signalétique'
  };
  const URL_SUPPLIERS=[
    {key:'abcam',name:'Abcam',test:h=>h==='abcam.com'||h.endsWith('.abcam.com')},
    {key:'thermo',name:'Thermo Fisher Scientific',test:h=>h==='thermofisher.com'||h.endsWith('.thermofisher.com')},
    {key:'cst',name:'Cell Signaling Technology',test:h=>h==='cellsignal.com'||h.endsWith('.cellsignal.com')},
    {key:'jackson',name:'Jackson ImmunoResearch',test:h=>h==='jacksonimmuno.com'||h.endsWith('.jacksonimmuno.com')},
    {key:'biolegend',name:'BioLegend',test:h=>h==='biolegend.com'||h.endsWith('.biolegend.com')},
    {key:'santacruz',name:'Santa Cruz Biotechnology',test:h=>h==='scbt.com'||h.endsWith('.scbt.com')},
    {key:'cytiva',name:'Cytiva',test:h=>h==='cytivalifesciences.com'||h.endsWith('.cytivalifesciences.com')},
    {key:'sigma',name:'Merck / Sigma-Aldrich',test:h=>h==='sigmaaldrich.com'||h.endsWith('.sigmaaldrich.com')||h==='merckmillipore.com'||h.endsWith('.merckmillipore.com')}
  ];
  function cleanMarkdown(v){return String(v||'').replace(/!\[[^\]]*\]\([^)]+\)/g,' ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/[`*_#>|]/g,' ').replace(/\s+/g,' ').trim()}
  function usefulValue(v){const s=cleanMarkdown(v);if(!s)return'';if(/^image\s*\d*/i.test(s)||/chevron-(down|up|right|left)/i.test(s))return'';if(/^(search|menu|close|login|sign in)$/i.test(s))return'';return s}
  function rawLines(text){return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
  function detectUrlSupplier(url){const h=new URL(url).hostname.toLowerCase();return URL_SUPPLIERS.find(s=>s.test(h))||{key:'other',name:h,test:()=>true}}
  async function fetchReaderOnce(endpoint,url,timeout=30000){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(endpoint+url,{method:'GET',mode:'cors',headers:{Accept:'text/plain'},credentials:'omit',cache:'no-store',signal:ctrl.signal});const text=await r.text();if(!r.ok)throw Error(`HTTP ${r.status}`);return{text,status:r.status,endpoint}}finally{clearTimeout(timer)}}
  async function fetchReader(url){let last=null;for(const endpoint of ['https://r.jina.ai/','https://eu.r.jina.ai/']){try{return await fetchReaderOnce(endpoint,url)}catch(err){last=err;console.warn('v11.7.5 Reader:',endpoint,err)}}throw last||Error('Reader indisponible')}
  function titleFromReader(text){const ls=rawLines(text);for(const line of ls){const m=line.match(/^Title:\s*(.+)$/i);if(m){const v=usefulValue(m[1]);if(v&&!/^search$/i.test(v))return v}}for(const line of ls){if(/^#\s+/.test(line)){const v=usefulValue(line.replace(/^#\s+/,''));if(v&&!/^search$/i.test(v))return v}}return''}
  function findReaderField(text,labels){const ls=rawLines(text),wanted=labels.map(compact);for(let i=0;i<ls.length;i++){const cleaned=usefulValue(ls[i].replace(/^#{1,6}\s*/,''));if(!cleaned)continue;for(let n=0;n<wanted.length;n++){if(compact(cleaned)===wanted[n]){for(let j=i+1;j<Math.min(i+7,ls.length);j++){if(/^#{1,6}\s/.test(ls[j]))break;const v=usefulValue(ls[j].replace(/^[-*]\s*/,''));if(v&&v.length<420)return v}}const label=labels[n],re=new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[:\\-]\\s*(.+)$','i'),m=cleaned.match(re);if(m){const v=usefulValue(m[1]);if(v)return v}}}return''}
  function readerRRID(text){const m=String(text||'').match(/\bAB_[0-9]{5,}\b/i);return m?m[0]:''}
  function readerFluor(text){const m=String(text||'').match(/\b(Alexa\s*Fluor(?:™|®)?\s*\d{3}|DyLight\s*\d{3}|Cy\s*\d(?:\.\d)?|FITC|TRITC|APC|PE|HRP|Biotin)\b/i);return m?cleanMarkdown(m[1]):''}
  function readerExEm(text){const m=String(text||'').match(/Excitation\/Emission Max[\s\S]{0,220}?(\d{3})\s*\/\s*(\d{3})\s*nm/i);return m?{ex:m[1],em:m[2]}:{ex:findReaderField(text,['Excitation maximum','Excitation max','Excitation wavelength','Excitation']).match(/\d{3}/)?.[0]||'',em:findReaderField(text,['Emission maximum','Emission max','Emission wavelength','Emission']).match(/\d{3}/)?.[0]||''}}
  function catalogFromReader(url,text){const candidates=[];try{const p=decodeURIComponent(new URL(url).pathname);for(const s of p.split('/').filter(Boolean)){const a=s.match(/\bab\d{4,}\b/i);if(a)candidates.push(a[0]);const t=s.match(/\bA-\d{4,}\b/i);if(t)candidates.push(t[0]);if(/^[A-Z]{1,5}-?\d{3,}[A-Z0-9-]*$/i.test(s))candidates.push(s)}}catch(_){}const labelled=findReaderField(text,['Catalog Number','Catalogue number','Catalog number','Product number','Product No.','Product Number']);if(labelled)candidates.unshift(labelled.split(/\s+/)[0]);return[...new Set(candidates)].find(Boolean)||''}
  function baseExtract(url,text,supplier){const spec=readerExEm(text);return{name:titleFromReader(text),supplier:supplier.name,catalogNumber:catalogFromReader(url,text),website:url,target:findReaderField(text,['Target','Specificity','Antigen']),targetSpecies:findReaderField(text,['Reacts with','Species Reactivity','Species reactivity','Reactivity','Target species']),hostSpecies:findReaderField(text,['Host species','Host / Isotype','Host/Isotype','Host']),className:findReaderField(text,['Class / isotype','Class','Isotype','Clonality']),applications:findReaderField(text,['Applications','Tested applications','Application']),molecularWeight:findReaderField(text,['Molecular weight','Predicted molecular weight']),storageTemperature:findReaderField(text,['Storage conditions','Storage condition','Storage','Storage temperature','Recommended storage']),fluorophore:findReaderField(text,['Conjugate','Conjugation','Fluorophore'])||readerFluor(text),excitation_nm:spec.ex,emission_nm:spec.em,clonality:findReaderField(text,['Clonality']),cloneId:findReaderField(text,['Clone number','Clone ID','Clone']),rrid:readerRRID(text),casNumber:findReaderField(text,['CAS Number','CAS number','CAS No.','CAS']),molecularFormula:findReaderField(text,['Molecular Formula','Molecular formula','Empirical Formula','Linear Formula']),molarMass:findReaderField(text,['Molar mass','Molecular Weight','Molecular weight']),purity:findReaderField(text,['Assay','Purity','Grade']),concentration:findReaderField(text,['Concentration']),solvent:findReaderField(text,['Solvent','Solubility']),physicalForm:findReaderField(text,['Form','Physical form','Appearance']),hazard:findReaderField(text,['Signal word','Hazard statements','Hazard statement']),sourceMap:{}}}
  function adjustExtracted(data,text,supplier){if(supplier.key==='abcam'){data.targetSpecies||=findReaderField(text,['Reacts with']);data.hostSpecies||=findReaderField(text,['Host species']);data.clonality||=findReaderField(text,['Clonality']);data.cloneId||=findReaderField(text,['Clone number']);data.fluorophore||=findReaderField(text,['Conjugation'])}if(supplier.key==='thermo'){const hi=findReaderField(text,['Host/Isotype','Host / Isotype']);if(hi&&hi.includes('/')){const p=hi.split('/').map(x=>x.trim()).filter(Boolean);data.hostSpecies=p[0]||data.hostSpecies;if(p.length>1&&!data.className)data.className=p.slice(1).join(' / ')}data.targetSpecies||=findReaderField(text,['Species Reactivity']);data.className||=findReaderField(text,['Class']);data.fluorophore||=findReaderField(text,['Conjugate']);data.storageTemperature||=findReaderField(text,['Storage conditions']);data.target||=findReaderField(text,['Target'])}if(supplier.key==='sigma'){data.casNumber||=findReaderField(text,['CAS Number','CAS No.','CAS']);data.molecularFormula||=findReaderField(text,['Linear Formula','Molecular Formula','Empirical Formula']);data.molarMass||=findReaderField(text,['Molecular Weight','Molar Mass']);data.purity||=findReaderField(text,['Assay','Purity']);data.physicalForm||=findReaderField(text,['Form','Physical form']);data.storageTemperature||=findReaderField(text,['Storage temp.','Storage temperature','Storage'])}for(const k of Object.keys(data)){if(k==='sourceMap')continue;if(usefulValue(data[k]))data.sourceMap[k]={kind:k==='supplier'?'domain':k==='website'?'url':'reader',label:k==='supplier'?'Déduit du domaine fournisseur':k==='website'?'URL fournie par le laboratoire':`Fiche ${supplier.name} via Reader`}}return data}
  function extractFromSupplierUrl(url,text,supplier){return adjustExtracted(baseExtract(url,text,supplier),text,supplier)}
  function productProfile(type){return PRODUCT_PROFILES[type]||PRODUCT_PROFILES[PRIMARY]}
  function profileFieldId(key){return 'v1175_'+key}
  function profileFieldHtml(key,label,type,data){const value=data?.[key]??'',src=data?.sourceMap?.[key],source=src?.label||'À compléter manuellement',cl=src?'ok':'warn';return `<div class="field v1175-product-field"><label>${e(label)}</label><input id="${profileFieldId(key)}" data-v1175-key="${e(key)}" type="${e(type||'text')}" value="${e(value)}"><small class="v1174-source ${cl}">${e(source)}</small></div>`}
  function extraDetectedHtml(type,data){const profile=productProfile(type),rows=(profile.extras||[]).filter(k=>usefulValue(data?.[k]));if(!rows.length)return'';return `<details class="v1175-extra"><summary>Autres informations détectées (${rows.length})</summary><div style="margin-top:8px">${rows.map(k=>`<div class="row space-between" style="gap:12px;border-bottom:1px solid var(--line);padding:6px 0"><span>${e(PRODUCT_LABELS[k]||k)}</span><b>${e(data[k])}</b></div>`).join('')}</div><p class="v1174-source neutral">Ces champs sont détectés mais ne sont pas automatiquement écrits si le schéma actuel de cet inventaire ne les prévoit pas.</p></details>`}
  function readProfileForm(type){const data={sourceMap:{}};for(const [key] of productProfile(type).fields){data[key]=String(document.querySelector('#'+profileFieldId(key))?.value||'').trim()}return data}
  function manualCandidate(type,url=''){const d={sourceMap:{},website:url};if(url)d.sourceMap.website={kind:'url',label:'URL fournie par le laboratoire'};return d}
  function checkExistingAfterAnalysis(type,data,opts){const ref=String(data.catalogNumber||'').trim(),supplier=String(data.supplier||'').trim();if(!ref)return false;const existing=sameTypeRefs(type,ref,supplier);if(!existing.length)return false;const active=existing.filter(activeRaw),arch=existing.filter(x=>!activeRaw(x));if(active.length){const x=active[0];modal(`<div class="v1174-add"><p class="u127-eyebrow">AJOUT PRODUIT · DOUBLON DÉTECTÉ</p><h2>Cette référence existe déjà</h2><div class="banner warn"><b>${e(x.Name||x.Code)}</b><br>${e(x.Supplier||'—')} · ${e(x.CatalogNumber||ref)}</div><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="v1175ExistingBack">Retour</button><button class="btn" id="v1175ExistingAssign">Attribuer une position</button><button class="btn btn-primary" id="v1175ExistingOpen">Ouvrir la référence</button></div></div>`);document.querySelector('#v1175ExistingBack').onclick=()=>showAddWizard(type,opts);document.querySelector('#v1175ExistingOpen').onclick=()=>openReference(type,x);document.querySelector('#v1175ExistingAssign').onclick=()=>{const mapped=type===PRIMARY?x:secondaryData().items.find(i=>Number(i.id)===Number(x.id));if(!mapped)return toast('Référence introuvable après relecture.');showAssignPosition(type,mapped)};return true}if(arch.length){const x=arch[0];modal(`<div class="v1174-add"><p class="u127-eyebrow">AJOUT PRODUIT · ARCHIVE DÉTECTÉE</p><h2>Cette référence existe dans les archives</h2><div class="banner warn">Il vaut mieux restaurer la fiche existante que créer un doublon.</div><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="v1175ArchiveBack">Retour</button><button class="btn btn-primary" id="v1175ArchiveRestore">Restaurer et ouvrir</button></div></div>`);document.querySelector('#v1175ArchiveBack').onclick=()=>showAddWizard(type,opts);document.querySelector('#v1175ArchiveRestore').onclick=async()=>{await restoreReference(type,Number(x.id),false);await refreshAll();openReference(type,tr(type===PRIMARY?'Antibodies':'InventoryItems').find(r=>Number(r.id)===Number(x.id))||x)};return true}return false}
  function showAddWizard(type,opts={}){
    if(!state?.connected)return toast('Connexion Grist requise.');const profile=productProfile(type);
    modal(`<div class="v1174-add v1175-url-add"><p class="u127-eyebrow">AJOUT PRODUIT · ${e(profile.title.toUpperCase())}</p><h2>Ajouter depuis la fiche fournisseur</h2><p class="subtitle">Colle l’URL officielle du produit. BioDynaMit lit cette page uniquement pendant cet ajout, propose les champs adaptés à cet inventaire, puis te laisse tout vérifier avant création.</p><div class="field"><label>URL officielle du produit *</label><input id="v1175ProductUrl" type="url" autocomplete="off" placeholder="https://www.abcam.com/... ou https://www.thermofisher.com/..."></div><div id="v1175UrlStatus" style="margin-top:12px"></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1175AddCancel">Annuler</button><button class="btn" id="v1175Manual">Saisie manuelle</button><button class="btn btn-primary" id="v1175Analyze">Analyser la fiche</button></div></div>`);
    document.querySelector('#v1175AddCancel').onclick=closeModal;document.querySelector('#v1175Manual').onclick=()=>showUrlPreview(type,{data:manualCandidate(type),opts,reader:null,manual:true});const run=()=>analyzeProductUrl(type,opts);document.querySelector('#v1175Analyze').onclick=run;document.querySelector('#v1175ProductUrl').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();run()}};requestAnimationFrame(()=>document.querySelector('#v1175ProductUrl')?.focus());
  }
  async function analyzeProductUrl(type,opts={}){
    const input=document.querySelector('#v1175ProductUrl'),url=String(input?.value||'').trim();if(!url)return toast('Colle l’URL officielle du produit.');let parsed,supplier;try{parsed=new URL(url);if(!/^https?:$/.test(parsed.protocol))throw Error('URL non HTTP(S)');supplier=detectUrlSupplier(url)}catch(err){return toast('URL fournisseur invalide.')}const btn=document.querySelector('#v1175Analyze'),status=document.querySelector('#v1175UrlStatus');btn.disabled=true;btn.textContent='Analyse…';status.innerHTML=`<div class="banner neutral">Lecture de la fiche ${e(supplier.name)}…</div>`;try{const reader=await fetchReader(url),data=extractFromSupplierUrl(url,reader.text,supplier);if(checkExistingAfterAnalysis(type,data,opts))return;showUrlPreview(type,{data,opts,reader,manual:false})}catch(err){console.error('v11.7.5 product URL:',err);status.innerHTML=`<div class="banner warn"><b>La fiche n’a pas pu être lue automatiquement.</b><br>${e(err?.name==='AbortError'?'Délai de lecture dépassé.':String(err?.message||err))}<div class="row" style="margin-top:10px"><button class="btn" id="v1175FallbackManual">Continuer en saisie manuelle</button><a class="btn" href="${e(url)}" target="_blank" rel="noopener noreferrer">Ouvrir la fiche fournisseur ↗</a></div></div>`;document.querySelector('#v1175FallbackManual').onclick=()=>showUrlPreview(type,{data:manualCandidate(type,url),opts,reader:null,manual:true});btn.disabled=false;btn.textContent='Analyser la fiche'}
  }
  function showUrlPreview(type,{data,opts,reader,manual}){
    const profile=productProfile(type),found=profile.fields.filter(([k])=>usefulValue(data?.[k])).length;
    modal(`<div class="v1174-add v1175-product-preview"><p class="u127-eyebrow">AJOUT PRODUIT · ${e(profile.title.toUpperCase())}</p><div class="row space-between" style="align-items:flex-start;gap:12px"><div><h2>Vérifier avant création</h2><p class="subtitle">${manual?'Saisie manuelle':'Préremplissage depuis l’URL fournisseur'} · ${found}/${profile.fields.length} champs du profil renseignés</p></div><span class="pill ${manual?'neutral':'ok'}">${manual?'Manuel':'URL fournisseur'}</span></div>${data?.website?`<div class="row" style="margin:10px 0"><a class="btn" href="${e(data.website)}" target="_blank" rel="noopener noreferrer">Ouvrir la fiche fournisseur ↗</a></div>`:''}<div class="form-grid">${profile.fields.map(([k,l,t])=>profileFieldHtml(k,l,t,data)).join('')}</div>${extraDetectedHtml(type,data)}<div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="v1175Comments" rows="3"></textarea><small class="v1174-source neutral">Validation humaine obligatoire : aucune valeur n’est enregistrée avant ton clic sur « Créer la référence ».</small></div><div class="v1174-provenance"><b>Provenance :</b> ${manual?'saisie manuelle':`fiche fournisseur lue via Reader${reader?.endpoint?` (${e(reader.endpoint.replace('https://','').replace('/',''))})`:''}`}.</div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1175PreviewBack">Retour</button><button class="btn btn-primary" id="v1175Create">Créer la référence</button></div></div>`);
    document.querySelector('#v1175PreviewBack').onclick=()=>showAddWizard(type,opts);document.querySelector('#v1175Create').onclick=()=>createReferenceFromUrl(type,{data,opts,manual});
  }
  async function addSecondaryAttributes(itemId,type,data,source){
    if(type!==SEC||!state?.tables?.includes?.('InventoryAttributes')||!itemId)return;const pairs=[['applications',data.applications],['rrid',data.rrid],['clonality',data.clonality],['clone',data.cloneId],['molecularWeight',data.molecularWeight]].filter(([,v])=>usefulValue(v));if(!pairs.length)return;const existing=tr('InventoryAttributes').filter(a=>Number(a.Item)===Number(itemId)&&a.InventoryType===SEC),actions=[];for(const [key,value] of pairs){if(existing.some(a=>a.FieldKey===key&&String(a.ValueText||'')===String(value)))continue;actions.push(['AddRecord','InventoryAttributes',null,{Item:Number(itemId),InventoryType:SEC,FieldKey:key,ValueText:String(value),Source:source}])}if(actions.length)await grist.docApi.applyUserActions(actions)
  }
  async function createReferenceFromUrl(type,{data,opts,manual}){
    const form=readProfileForm(type),name=form.name,catalog=form.catalogNumber,supplier=form.supplier;if(!name||!catalog)return toast('Le nom et la référence catalogue sont obligatoires.');await refreshAll();const dupe=sameTypeRefs(type,catalog,supplier).filter(activeRaw);if(dupe.length)return toast('Cette référence existe maintenant dans BioDynaMit. Création annulée pour éviter un doublon.');const save=document.querySelector('#v1175Create');save.disabled=true;save.textContent='Création…';try{let created=null;const sourceText=manual?'saisie manuelle':'URL fournisseur via Reader';if(type===PRIMARY){const rec={Code:nextPrimaryCode(),Name:name,FullName:name,Supplier:supplier,CatalogNumber:catalog,HostSpecies:form.hostSpecies||'',Class:form.className||'',Target:form.target||'',ApplicationsText:form.applications||'',MolecularWeight:form.molecularWeight||'',Website:form.website||'',DateAdded:nowSec(),Comments:String(document.querySelector('#v1175Comments')?.value||'').trim(),Active:true,RawTable:'',RawRowId:0};const acts=[['AddRecord','Antibodies',null,rec]],h=primaryHistory('Création référence anticorps',rec.Code,`${rec.Name} · ${rec.Supplier} / ${rec.CatalogNumber} · source: ${sourceText}`);if(h)acts.push(h);await grist.docApi.applyUserActions(acts);await refreshAll();created=tr('Antibodies').find(a=>a.Code===rec.Code)}else if(type===SEC){const rec={Code:nextSecondaryCode(catalog),InventoryType:SEC,Name:name,Status:'Actif',Active:true,Supplier:supplier,CatalogNumber:catalog,Target:form.target||'',TargetSpecies:form.targetSpecies||'',HostSpecies:form.hostSpecies||'',Fluorophore:form.fluorophore||'',Excitation_nm:form.excitation_nm===''?null:Number(form.excitation_nm),Emission_nm:form.emission_nm===''?null:Number(form.emission_nm),StorageTemperature:form.storageTemperature||'',Class:form.className||'',Website:form.website||'',Comments:String(document.querySelector('#v1175Comments')?.value||'').trim(),RawTable:'Ajout v11.7.5 URL',RawRowId:0};const acts=[['AddRecord','InventoryItems',null,rec]],h=secondaryHistory('Création référence',rec.Code,`${rec.Name} · ${rec.Supplier} / ${rec.CatalogNumber} · source: ${sourceText}`);if(h)acts.push(h);await grist.docApi.applyUserActions(acts);await refreshAll();created=secondaryData().items.find(i=>String(i.code)===String(rec.Code));if(created)await addSecondaryAttributes(Number(created.id),type,{...data,...form},sourceText)}else throw Error('Ce type de produit n’est pas encore activé comme inventaire dans BioDynaMit.');if(!created)throw Error('Référence créée mais introuvable après relecture.');if(opts?.fixedPrimaryPosition&&type===PRIMARY){showFixedPrimaryVialStep(created,opts.fixedPrimaryPosition);return}showCreatedNext(type,created)}catch(err){console.error('v11.7.5 create reference:',err);toast(`Création impossible : ${err?.message||err}`);save.disabled=false;save.textContent='Créer la référence'}
  }
  function showCreatedNext(type,item){
    modal(`<div class="v1174-created"><p class="u127-eyebrow">RÉFÉRENCE CRÉÉE</p><h2>✓ ${e(item.Name||item.name||item.Code||item.code)}</h2><p class="subtitle">La référence est enregistrée. Tu peux maintenant créer/ranger un vial sans repasser par la liste.</p><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1174CreatedDone">Terminer</button><button class="btn btn-primary" id="v1174CreatedAssign">Ajouter un vial et attribuer une position</button></div></div>`);
    document.querySelector('#v1174CreatedDone').onclick=()=>openReference(type,type===PRIMARY?item:(tr('InventoryItems').find(x=>Number(x.id)===Number(item.id))||item));document.querySelector('#v1174CreatedAssign').onclick=()=>showAssignPosition(type,item);
  }
  function showFixedPrimaryVialStep(antibody,ctx){
    modal(`<div class="v1174-created"><p class="u127-eyebrow">RÉFÉRENCE CRÉÉE · POSITION RÉSERVÉE</p><h2>Ajouter le vial en ${e(ctx.box.Name||ctx.box.Code)} / ${e(ctx.slot)}</h2><p class="subtitle"><b>${e(antibody.Name||antibody.FullName||antibody.Code)}</b> · la position sera revérifiée juste avant l’écriture.</p>${unitForm(PRIMARY)}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1174FixedDone">Terminer sans vial</button><button class="btn btn-primary" id="v1174FixedSave">Créer et positionner</button></div></div>`);
    document.querySelector('#v1174FixedDone').onclick=()=>openReference(PRIMARY,antibody);
    document.querySelector('#v1174FixedSave').onclick=()=>createPrimaryVialAtFixedPosition(antibody,ctx);
  }

  /* Free primary storage slot keeps its exact physical slot while using the new reference lookup. */
  function selectedPrimaryFreePosition(){
    const sv=window.BioDynaMitIntegratedStorageV11?.state,boxId=Number(sv?.boxId||state.selectedBox),slot=String(sv?.slot||'').trim().toUpperCase(),position=tr('Positions').find(p=>Number(p.Box)===boxId&&String(p.Slot||'').trim().toUpperCase()===slot),box=tr('Boxes').find(b=>Number(b.id)===boxId);return position&&box?{sv,boxId,slot,position,box}:null;
  }
  function showAddAtSelectedPosition(){
    const ctx=selectedPrimaryFreePosition();if(!ctx)return toast('Position introuvable.');if(Number(ctx.position.Vial)||ctx.position.Available===false)return toast('Cette position n’est plus libre.');
    const antibodies=activePrimary().slice().sort((a,b)=>String(a.Name||a.FullName||a.Code).localeCompare(String(b.Name||b.FullName||b.Code),'fr'));
    modal(`<div class="v1174-slot-add"><p class="u127-eyebrow">STOCKAGE · AJOUT GUIDÉ</p><h2>Position libre · ${e(ctx.box.Name||ctx.box.Code)} / ${e(ctx.slot)}</h2><div class="v117-path-tabs"><button class="btn active" data-v1174-path="existing">Anticorps existant</button><button class="btn" data-v1174-path="new">Nouvel anticorps</button></div><div id="v1174SlotPane"></div></div>`);
    const existing=()=>{const pane=document.querySelector('#v1174SlotPane');pane.innerHTML=`<div class="field"><label>Référence existante *</label><select id="v1174SlotAb"><option value="">— Choisir —</option>${antibodies.map(a=>`<option value="${Number(a.id)}">${e(a.Name||a.FullName||a.Code)} · ${e(a.CatalogNumber||'sans référence')} · ${e(a.Supplier||'—')}</option>`).join('')}</select></div>${unitForm(PRIMARY)}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v1174SlotCancel">Annuler</button><button class="btn btn-primary" id="v1174SlotSave">Créer et positionner</button></div>`;document.querySelector('#v1174SlotCancel').onclick=closeModal;document.querySelector('#v1174SlotSave').onclick=async()=>{const a=antibodies.find(x=>Number(x.id)===Number(document.querySelector('#v1174SlotAb').value));if(!a)return toast('Choisis une référence.');await createPrimaryVialAtFixedPosition(a,ctx)}};
    const fresh=()=>showAddWizard(PRIMARY,{fixedPrimaryPosition:ctx});
    document.querySelectorAll('[data-v1174-path]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-v1174-path]').forEach(x=>x.classList.toggle('active',x===b));b.dataset.v1174Path==='existing'?existing():fresh()});existing();
  }
  async function createPrimaryVialAtFixedPosition(antibody,ctx){
    const draft=readUnitDraft();if(!draft.Code)return toast('Le code vial est obligatoire.');if(tr('Vials').some(v=>norm(v.Code)===norm(draft.Code)))return toast('Ce code vial existe déjà.');const live=await liveFree(PRIMARY,ctx.position.id);if(!live.ok)return toast(live.reason);
    let created=null;try{const rec={...draft,Antibody:Number(antibody.id)};if(rec.DateReceived===null)delete rec.DateReceived;await grist.docApi.applyUserActions([['AddRecord','Vials',null,rec]]);await refreshAll();created=tr('Vials').find(v=>v.Code===draft.Code);if(!created)throw Error('Vial créé mais introuvable.');const live2=await liveFree(PRIMARY,ctx.position.id);if(!live2.ok){await grist.docApi.applyUserActions([['UpdateRecord','Vials',Number(created.id),{Status:'À ranger'}]]);throw Error(`${live2.reason} Le vial reste « À ranger ».`)}const acts=[['UpdateRecord','Positions',Number(ctx.position.id),{Vial:Number(created.id),Available:false}]],h=primaryHistory('Ajout vial',created.Code,`${antibody.Name||antibody.Code} → ${ctx.box.Name||ctx.box.Code} / ${ctx.slot}`,'Vial');if(h)acts.push(h);await grist.docApi.applyUserActions(acts);await finishOpenPosition(PRIMARY,ctx.box,ctx.position,created);toast(`✓ Vial ajouté en ${ctx.slot}`)}catch(err){console.error(err);toast(`Ajout impossible : ${err?.message||err}`)}
  }

  /* ------------------------- Archive / delete ------------------------ */
  function primaryDependencies(a){const code=a.Code||'';return{vials:tr('Vials').filter(v=>Number(v.Antibody)===Number(a.id)).length,dilutions:tr('Dilutions').filter(x=>Number(x.Antibody)===Number(a.id)).length,documents:tr('Documents').filter(x=>Number(x.Antibody)===Number(a.id)).length,notes:tr('Notes').filter(x=>Number(x.Antibody)===Number(a.id)).length,reviews:tr('LabReviews').filter(x=>x.InventoryType===PRIMARY&&String(x.ItemCode)===String(code)).length,usage:tr('LabUsage').filter(x=>x.InventoryType===PRIMARY&&String(x.ItemCode)===String(code)).length,orders:tr('LabOrders').filter(x=>x.InventoryType===PRIMARY&&String(x.ItemCode)===String(code)).length}}
  function secondaryDependencies(item){const raw=tr('InventoryItems').find(x=>Number(x.id)===Number(item.id))||item,code=raw.Code||item.code||'';return{vials:tr('InventoryUnits').filter(u=>Number(u.Item)===Number(raw.id)).length,attributes:tr('InventoryAttributes').filter(x=>Number(x.Item)===Number(raw.id)).length,documents:tr('InventoryDocuments').filter(x=>Number(x.Item)===Number(raw.id)).length,notes:tr('InventoryNotes').filter(x=>Number(x.Item)===Number(raw.id)).length,reviews:tr('LabReviews').filter(x=>x.InventoryType===SEC&&String(x.ItemCode)===String(code)).length,usage:tr('LabUsage').filter(x=>x.InventoryType===SEC&&String(x.ItemCode)===String(code)).length,orders:tr('LabOrders').filter(x=>x.InventoryType===SEC&&String(x.ItemCode)===String(code)).length}}
  async function archiveCurrent(kind){const item=kind==='primary'?currentPrimary():currentSecondary();if(!item)return toast('Référence introuvable.');const name=item.Name||item.name||item.Code||item.code;if(!confirm(`Retirer « ${name} » de la liste ? Les données et vials sont conservés et la référence pourra être restaurée.`))return;try{if(kind==='primary'){const acts=[['UpdateRecord','Antibodies',Number(item.id),{Active:false}]],h=primaryHistory('Archivage référence',item.Code||'',`Référence retirée de la liste : ${name}`);if(h)acts.push(h);await grist.docApi.applyUserActions(acts)}else{const acts=[['UpdateRecord','InventoryItems',Number(item.id),{Active:false,Status:'Archivé'}]],h=secondaryHistory('Archivage référence',item.code||'',`Référence retirée de la liste : ${name}`);if(h)acts.push(h);await grist.docApi.applyUserActions(acts)}await refreshAll();toast('✓ Référence retirée de la liste');goToList(kind)}catch(err){toast(`Archivage impossible : ${err?.message||err}`)}}
  async function restoreReference(type,id,show=true){try{if(type===PRIMARY)await grist.docApi.applyUserActions([['UpdateRecord','Antibodies',Number(id),{Active:true}]]);else await grist.docApi.applyUserActions([['UpdateRecord','InventoryItems',Number(id),{Active:true,Status:'Actif'}]]);await refreshAll();toast('✓ Référence restaurée');if(show)showArchived(type)}catch(err){toast(`Restauration impossible : ${err?.message||err}`)}}
  async function hardDelete(kind){if(!isAdmin())return toast('Suppression définitive réservée à l’administrateur.');const item=kind==='primary'?currentPrimary():currentSecondary();if(!item)return toast('Référence introuvable.');const deps=kind==='primary'?primaryDependencies(item):secondaryDependencies(item),busy=Object.values(deps).reduce((a,b)=>a+b,0),name=item.Name||item.name||item.Code||item.code;if(busy)return toast(`Suppression bloquée : ${Object.entries(deps).filter(([,n])=>n).map(([k,n])=>`${n} ${k}`).join(', ')} encore lié(s). Utilise « Retirer de la liste ».`);if(!confirm(`SUPPRESSION DÉFINITIVE de « ${name} » ? Cette action n’est pas réversible.`))return;try{await grist.docApi.applyUserActions([['RemoveRecord',kind==='primary'?'Antibodies':'InventoryItems',Number(item.id)]]);await refreshAll();toast('Référence supprimée définitivement.');goToList(kind)}catch(err){toast(`Suppression impossible : ${err?.message||err}`)}}
  function goToList(kind){closeModal();if(kind==='primary'){state.search='';go('antibodies')}else{v112.inventorySelected[SEC]=null;v112.inventoryView[SEC]='list';if(typeof v112.renderUniversalAntibodyList==='function')v112.renderUniversalAntibodyList('secondary');else go(`inv:${SEC}`)}}
  function showArchived(type){const list=type===PRIMARY?archivedPrimary():archivedSecondaryRaw();modal(`<h2>Références archivées</h2><p class="subtitle">Conservées dans Grist mais masquées des listes et de la recherche globale.</p>${list.length?`<div class="v115-list">${list.map(x=>`<div class="v115-list-row"><div class="meta"><b>${e(x.Name||x.Code)}</b><small>${e(x.Supplier||'')} · ${e(x.CatalogNumber||'')}</small></div><button class="btn btn-sm" data-v1174-restore="${Number(x.id)}">Restaurer</button></div>`).join('')}</div>`:'<div class="empty">Aucune référence archivée.</div>'}<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="v1174ArchivedClose">Fermer</button></div>`);document.querySelector('#v1174ArchivedClose').onclick=closeModal;document.querySelectorAll('[data-v1174-restore]').forEach(b=>b.onclick=()=>restoreReference(type,Number(b.dataset.v1174Restore),true))}

  /* ---------------------------- UI decoration ------------------------ */
  function decorateRows(kind){
    const root=document.querySelector(`.u126-antibody-list[data-u126-kind="${kind}"]`);if(!root)return;
    root.querySelectorAll(`[data-u126-row^="${kind}:"]`).forEach(row=>{
      const id=String(row.dataset.u126Row).split(':')[1],item=kind==='primary'?tr('Antibodies').find(a=>Number(a.id)===Number(id)):secondaryData().items.find(i=>String(i.id)===String(id));if(!item)return;
      const raw=kind==='primary'?item:tr('InventoryItems').find(r=>Number(r.id)===Number(item.id));if(raw&&!activeRaw(raw)){row.style.display='none';return}else row.style.display='';
      const s=physicalStockState(kind,item),cell=row.querySelector('.u126-col-stock');if(cell){const locate=s.locations.length?`<button class="btn btn-sm u126-locate" data-v1174-locate="${kind}:${e(id)}">Voir dans la boîte</button>`:'';cell.innerHTML=`<span class="pill ${s.cl}" title="${e(s.title)}">${e(s.label)}</span>${locate}`;cell.querySelector('[data-v1174-locate]')?.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();const p=s.locations[0];if(kind==='primary'){const v=tr('Vials').find(v=>Number(v.id)===Number(p.Vial));if(v)window.openBoxForVial?.(Number(v.id))}else{v112.inventoryView[SEC]='storage';const st=v112.storageState[SEC]=v112.storageState[SEC]||{};st.containerCode=p.containerCode;st.slot=p.slot;st.view='2d';v112.renderInventory?.(SEC)}})}
      if(kind==='secondary'){const qc=row.querySelector('.u126-col-qc .pill');if(qc&&norm(qc.textContent)==='non relie'){qc.textContent='Validé';qc.classList.remove('neutral','warn','bad');qc.classList.add('ok');qc.title='Le contrôle qualité est distinct de l’état physique du stock.'}}
    });
    const firstMetric=root.querySelector('.u125-metrics .metric-value');if(firstMetric)firstMetric.textContent=String(kind==='primary'?activePrimary().length:activeSecondaryRaw().length);
  }
  function decorateDetail(kind){
    const on=kind==='primary'?state.route==='antibody-detail':state.route===`inv:${SEC}`&&v112.inventoryView?.[SEC]==='detail';if(!on)return;const item=kind==='primary'?currentPrimary():currentSecondary();if(!item)return;const stock=physicalStockState(kind,item),stockHeading=[...document.querySelectorAll('#content h3')].find(x=>norm(x.textContent)==='stock'),card=stockHeading?.closest('.card');
    if(card&&!card.querySelector('.v1174-stock-tools')){if(kind==='secondary'){const legacy=card.querySelector('p > .pill:first-child');if(legacy)legacy.style.display='none'}const tools=document.createElement('div');tools.className='v1174-stock-tools row';tools.style.cssText='gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 12px';tools.innerHTML=`<span class="pill ${stock.cl}" title="${e(stock.title)}">${e(stock.label)}</span><button class="btn btn-primary" data-v1174-assign>Attribuer une position</button>`;stockHeading.after(tools);tools.querySelector('[data-v1174-assign]').onclick=()=>showAssignPosition(kind,item)}
    if(kind==='secondary'){document.querySelector('#v112SuggestSlot')?.remove();document.querySelector('#v112AddUnitFromItem')?.remove()}
    if(!document.querySelector('.v1174-reference-management')){const anchor=document.querySelector('.v117-context')||document.querySelector('#content .tabs')||document.querySelector('#content .page-title');if(anchor){const bar=document.createElement('div');bar.className='v1174-reference-management row';bar.style.cssText='gap:8px;margin:8px 0 14px;flex-wrap:wrap';bar.innerHTML=`<button class="btn" data-v1174-archive>Retirer de la liste</button>${isAdmin()?'<button class="btn btn-danger" data-v1174-delete>Supprimer définitivement</button>':''}`;anchor.after(bar);bar.querySelector('[data-v1174-archive]').onclick=()=>archiveCurrent(kind);bar.querySelector('[data-v1174-delete]')?.addEventListener('click',()=>hardDelete(kind))}}
  }
  function decorateArchivedButton(){const root=document.querySelector('.u126-antibody-list');if(!root)return;const kind=root.dataset.u126Kind,type=kind==='primary'?PRIMARY:SEC,bar=document.querySelector('.v112-top-actions');if(!bar||bar.querySelector('#v1174ArchivedBtn'))return;const n=type===PRIMARY?archivedPrimary().length:archivedSecondaryRaw().length;if(!n)return;const b=document.createElement('button');b.className='btn';b.id='v1174ArchivedBtn';b.textContent=`Archivés (${n})`;b.onclick=()=>showArchived(type);bar.appendChild(b)}
  function decorate(){decorateRows('primary');decorateRows('secondary');decorateDetail('primary');decorateDetail('secondary');decorateArchivedButton()}

  function installStyle(){if(document.getElementById('v1174Style'))return;const s=document.createElement('style');s.id='v1174Style';s.textContent='.v1174-source{display:block;margin-top:5px;font-size:10px;color:#64788a}.v1174-source.ok{color:#25704f}.v1174-source.warn{color:#9a6820}.v1174-provenance{margin-top:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f7fafc;font-size:12px;color:#536a7c}.v1174-stock-tools .pill{min-width:120px;text-align:center}.v1174-add .banner,.v1174-assign .banner{margin-top:10px}';document.head.appendChild(s)}
  function install(){
    installStyle();v112.showReferenceFirstAntibodyForm=(type)=>showAddWizard(type);v117.showAddAtSelectedPosition=showAddAtSelectedPosition;
    document.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-u126-add="primary"],[data-u126-add="secondary"]');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();showAddWizard(b.dataset.u126Add==='primary'?PRIMARY:SEC)},true);
    if(!W.observer){let queued=false;W.observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;try{decorate()}catch(err){console.warn('v11.7.5 decorate:',err)}})});W.observer.observe(document.querySelector('#content')||document.body,{childList:true,subtree:true})}
    decorate();
  }

  W.physicalStockState=physicalStockState;W.showAssignPosition=showAssignPosition;W.showAddWizard=showAddWizard;W.showProductUrlWizard=showAddWizard;W.productProfiles=PRODUCT_PROFILES;W.extractFromSupplierUrl=extractFromSupplierUrl;W.showArchived=showArchived;W._test={pendingSecondaryUnit,primaryDependencies,secondaryDependencies,catalogFromReader,titleFromReader,findReaderField,detectUrlSupplier};
  install();
})();
