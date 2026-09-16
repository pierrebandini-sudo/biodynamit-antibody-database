/* BioDynaMit v11.2 — generic inventories.
   Adds data-driven inventory routes without replacing the validated primary-antibody storage.
*/
(function(){
  'use strict';

  const core=window.BioDynaMitCoreV112;
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  if(!core||!ns){ console.error('BioDynaMit v11.2 inventory: dependencies missing.'); return; }

  ns.inventoryView=ns.inventoryView||{};
  ns.inventorySearch=ns.inventorySearch||{};
  ns.inventorySelected=ns.inventorySelected||{};
  ns.storageState=ns.storageState||{};
  ns.sceneModule=null;
  ns.genericScene=null;

  const palette=core.DEFAULT_PALETTE;
  const MANIFEST_TYPE='secondary_antibody';

  function er(v){ return esc(v); }
  function trows(name){ return rows(state.data[name]||ns.data?.[name]); }
  function typeConfig(key){ return ns.inventoryTypes?.().find(x=>x.Key===key) || null; }
  function isGristType(type){ return trows('InventoryItems').some(x=>x.InventoryType===type); }
  function manifest(){ return window.BioDynaMitSecondary2025||null; }

  function attrRowsFor(itemId,type){
    return trows('InventoryAttributes').filter(x=>Number(x.Item)===Number(itemId) && x.InventoryType===type);
  }

  function attrObject(itemId,type){
    const out={};
    for(const a of attrRowsFor(itemId,type)){
      let val=a.ValueText;
      if(a.ValueNumber!==null&&a.ValueNumber!==undefined&&a.ValueNumber!=='') val=a.ValueNumber;
      else if(a.ValueDate) val=a.ValueDate;
      else if(a.ValueBool===true||a.ValueBool===false) val=a.ValueBool;
      out[a.FieldKey]=val;
    }
    return out;
  }

  function mapGristItem(r){
    return {
      id:Number(r.id),code:r.Code||`ITEM-${r.id}`,inventoryType:r.InventoryType,name:r.Name||r.Code,
      status:r.Status||'',active:r.Active!==false,supplier:r.Supplier||'',catalogNumber:r.CatalogNumber||'',
      target:r.Target||'',targetSpecies:r.TargetSpecies||'',hostSpecies:r.HostSpecies||'',fluorophore:r.Fluorophore||'',
      excitation_nm:r.Excitation_nm,emission_nm:r.Emission_nm,storageTemperature:r.StorageTemperature||'',
      class:r.Class||'',website:r.Website||'',comments:r.Comments||'',source:'grist',
      attributes:attrObject(r.id,r.InventoryType),raw:r
    };
  }

  function mapManifestItem(r){
    return {...r,id:r.code,source:'manifest',active:true,status:'Source Excel',
      target:r.target||'',comments:r.infos||'',
      attributes:{infos:r.infos||'',labWB:r.labWB||'',labImmunostaining:r.labImmunostaining||''}
    };
  }

  function itemsFor(type){
    const live=trows('InventoryItems').filter(x=>x.InventoryType===type);
    if(live.length) return live.map(mapGristItem);
    if(type===MANIFEST_TYPE && manifest()) return manifest().items.map(mapManifestItem);
    return [];
  }

  function mapGristUnit(r,itemMap){
    const item=itemMap.get(Number(r.Item));
    return {
      id:Number(r.id),code:r.Code||`UNIT-${r.id}`,inventoryType:r.InventoryType,itemId:item?.id||null,itemCode:item?.code||'',
      item,fillStatus:r.FillStatus||'',estimatedVolume_uL:r.EstimatedVolume_uL,status:r.Status||'',
      dateReceived:r.DateReceived,comments:r.Comments||'',rawLabel:r.RawLabel||'',matchStatus:r.MatchStatus||'',
      matchScore:r.MatchScore,candidateItemCode:r.CandidateItemCode||'',source:'grist',raw:r
    };
  }

  function mapManifestUnit(r,itemByCode){
    const item=r.itemCode?itemByCode.get(r.itemCode):null;
    const candidate=r.candidateItemCode?itemByCode.get(r.candidateItemCode):null;
    return {
      id:r.code,code:r.code,inventoryType:r.inventoryType,itemId:item?.id||null,itemCode:item?.code||'',
      item,candidateItem:candidate,fillStatus:'Inconnu',estimatedVolume_uL:null,status:r.status||'',
      comments:'',rawLabel:r.rawLabel||'',cleanLabel:r.cleanLabel||'',matchStatus:r.matchStatus||'',
      matchScore:r.matchScore,candidateItemCode:r.candidateItemCode||'',detectedHost:r.detectedHost||'',
      detectedTargetSpecies:r.detectedTargetSpecies||'',detectedFluorophore:r.detectedFluorophore||'',
      stockMarker:r.stockMarker,dateLabel:r.dateLabel,containerCode:r.containerCode,slot:r.slot,
      matchIssues:r.matchIssues||[],source:'manifest',raw:r
    };
  }

  function unitsFor(type){
    const items=itemsFor(type);
    const mapNum=new Map(items.filter(x=>typeof x.id==='number').map(x=>[Number(x.id),x]));
    const live=trows('InventoryUnits').filter(x=>x.InventoryType===type);
    if(live.length) return live.map(x=>mapGristUnit(x,mapNum));
    if(type===MANIFEST_TYPE && manifest()){
      const byCode=new Map(items.map(x=>[x.code,x]));
      return manifest().units.map(x=>mapManifestUnit(x,byCode));
    }
    return [];
  }

  function containersFor(type){
    const live=trows('InventoryContainers').filter(x=>x.InventoryType===type);
    if(live.length) return live.map(r=>({
      id:Number(r.id),code:r.Code||`BOX-${r.id}`,inventoryType:r.InventoryType,name:r.Name||r.Code,
      temperature:r.Temperature||'',temperatureNumeric:Number(String(r.Temperature||'').match(/-?\d+/)?.[0]||NaN),
      rack:r.Rack||'',rows:Number(r.Rows||10),columns:Number(r.Columns||10),notes:r.Notes||'',source:'grist',raw:r
    }));
    if(type===MANIFEST_TYPE && manifest()) return manifest().containers.map(x=>({...x,id:x.code,source:'manifest'}));
    return [];
  }

  function positionsFor(type){
    const live=trows('InventoryPositions').filter(x=>x.InventoryType===type);
    if(live.length){
      const containers=containersFor(type);
      const units=unitsFor(type);
      const cById=new Map(containers.map(x=>[Number(x.id),x]));
      const uById=new Map(units.filter(x=>typeof x.id==='number').map(x=>[Number(x.id),x]));
      return live.map(r=>({
        id:Number(r.id),code:r.Code||`POS-${r.id}`,inventoryType:r.InventoryType,
        containerId:Number(r.Container),containerCode:cById.get(Number(r.Container))?.code||'',
        slot:r.Slot,unitId:Number(r.Unit)||null,unitCode:uById.get(Number(r.Unit))?.code||'',
        available:r.Available===true,notes:r.Notes||'',source:'grist',raw:r
      }));
    }
    if(type===MANIFEST_TYPE && manifest()) return manifest().positions.map(x=>({
      ...x,id:x.code,containerId:x.containerCode,unitId:x.unitCode||null,source:'manifest'
    }));
    return [];
  }

  function inventoryData(type){
    const items=itemsFor(type),units=unitsFor(type),containers=containersFor(type),positions=positionsFor(type);
    return {type,mode:isGristType(type)?'grist':(type===MANIFEST_TYPE&&manifest()?'manifest':'empty'),items,units,containers,positions};
  }
  ns.inventoryData=inventoryData;

  function countUnitsForItem(data,item){
    return data.units.filter(u=>String(u.itemCode||'')===String(item.code)).length;
  }

  function candidateUnitsForItem(data,item){
    return data.units.filter(u=>!u.itemCode && String(u.candidateItemCode||'')===String(item.code)).length;
  }

  function searchItems(data,q){
    const n=core.normalizeText(q);
    if(!n) return data.items;
    return data.items.filter(i=>[
      i.name,i.code,i.target,i.targetSpecies,i.hostSpecies,i.fluorophore,i.supplier,i.catalogNumber,
      i.storageTemperature,i.class,...Object.values(i.attributes||{})
    ].some(v=>core.normalizeText(v).includes(n)));
  }

  function genericNavTypes(){
    const types=ns.inventoryTypes?.()||[];
    return types.filter(t=>t.Mode==='generic' && t.Enabled!==false);
  }

  // Dynamic navigation: normal menus are preserved; enabled generic inventories are injected after Anticorps.
  const baseRenderNav=renderNav;
  renderNav=function(){
    const generic=genericNavTypes();
    const base=navItems.filter(([r])=>!String(r).startsWith('inv:'));
    const out=[];
    for(const item of base){
      out.push(item);
      if(item[0]==='antibodies'){
        for(const t of generic) out.push([`inv:${t.Key}`,t.Icon||'◆',t.Name||t.Key]);
      }
    }
    $('#nav').innerHTML=out.map(([r,ic,l])=>`<button class="nav-item ${state.route===r?'active':''}" data-route="${er(r)}"><span>${er(ic)}</span><span>${er(l)}</span></button>`).join('');
    document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{
      const r=b.dataset.route;
      if(r.startsWith('inv:')){
        const type=r.slice(4);
        ns.inventoryView[type]='list';
        ns.inventorySelected[type]=null;
      }
      go(r);
    });
  };
  ns.baseRenderNav=baseRenderNav;

  const baseRender=render;
  render=function(){
    if(String(state.route||'').startsWith('inv:')){
      renderInventory(String(state.route).slice(4));
      return;
    }
    return baseRender();
  };
  ns.baseRender=baseRender;

  function typeHeader(type,data){
    const cfg=typeConfig(type)||{Name:type,SingularName:'Élément',StorageEnabled:true};
    const view=ns.inventoryView[type]||'list';
    topbar(cfg.Name||type,`<div class="row v112-top-actions">
      <button class="btn ${view==='list'?'btn-primary':''}" data-v112-view="list">Liste</button>
      ${cfg.StorageEnabled!==false?`<button class="btn ${view==='storage'?'btn-primary':''}" data-v112-view="storage">Stockage</button>`:''}
    </div>`);
    return cfg;
  }

  function bindTypeViews(type){
    document.querySelectorAll('[data-v112-view]').forEach(b=>b.onclick=()=>{
      ns.inventoryView[type]=b.dataset.v112View;
      ns.inventorySelected[type]=null;
      renderInventory(type);
    });
  }

  function renderInventory(type){
    const data=inventoryData(type);
    const cfg=typeHeader(type,data);
    const view=ns.inventoryView[type]||'list';
    if(view==='detail') renderItemDetail(type,data,cfg);
    else if(view==='storage') renderGenericStorage(type,data,cfg);
    else renderItemList(type,data,cfg);
    bindTypeViews(type);
  }
  ns.renderInventory=renderInventory;

  function importBanner(type,data){
    if(type!==MANIFEST_TYPE || data.mode!=='manifest') return '';
    const m=manifest();
    return `<div class="banner v112-source-banner">
      <div><b>Aperçu direct du fichier secondaire reçu</b><br>
      ${m.summary.items} références · ${m.summary.occupiedUnits} vials · ${m.summary.autoMatchedUnits} correspondances sûres ·
      ${m.summary.reviewUnits+m.summary.unresolvedUnits+m.summary.otherReagentUnits} à vérifier.</div>
      <button class="btn btn-primary" id="v112ImportSecondary">Préparer l’import Grist</button>
    </div>`;
  }

  function renderItemList(type,data,cfg){
    const q=ns.inventorySearch[type]||'';
    const filtered=searchItems(data,q);
    const unresolved=data.units.filter(u=>u.status==='À réconcilier'||/review|unresolved|other_reagent/.test(u.matchStatus||'')).length;
    content.innerHTML=`<h1 class="page-title">${er(cfg.Name||type)}</h1>
      <p class="subtitle">${data.mode==='manifest'?'Source Excel en prévisualisation — aucune écriture Grist.':data.mode==='grist'?'Inventaire relationnel v11.2 chargé depuis Grist.':'Aucune donnée pour cet inventaire.'}</p>
      ${importBanner(type,data)}
      <div class="grid grid-4" style="margin-top:14px">
        <div class="card card-pad"><div class="metric-value">${data.items.length}</div><div class="subtitle">Références</div></div>
        <div class="card card-pad"><div class="metric-value">${data.units.length}</div><div class="subtitle">${er(cfg.UnitLabel||'Unités')}</div></div>
        <div class="card card-pad"><div class="metric-value">${data.containers.length}</div><div class="subtitle">Boîtes / conteneurs</div></div>
        <div class="card card-pad"><div class="metric-value">${unresolved}</div><div class="subtitle">À réconcilier</div></div>
      </div>
      <div class="searchbar" style="margin-top:16px"><input id="v112InvSearch" value="${er(q)}" placeholder="Nom, cible, fluorophore, fournisseur, référence…"><button class="btn" id="v112InvClear">Effacer</button></div>
      <div class="card table-wrap" style="margin-top:14px">
        <table class="table"><thead><tr>
          <th>Nom</th><th>Cible</th><th>Fluorophore</th><th>Ex / Em</th><th>Hôte</th><th>Fournisseur</th><th>Référence</th><th>Stock</th>
        </tr></thead><tbody id="v112InvBody">${itemRowsHtml(data,filtered)}</tbody></table>
      </div>
      ${type===MANIFEST_TYPE?secondaryQualityBlock(data):''}`;

    const bind=()=>document.querySelectorAll('[data-v112-item]').forEach(b=>b.onclick=()=>{
      ns.inventorySelected[type]=b.dataset.v112Item;
      ns.inventoryView[type]='detail';
      renderInventory(type);
    });
    $('#v112InvSearch').oninput=e=>{
      ns.inventorySearch[type]=e.target.value;
      $('#v112InvBody').innerHTML=itemRowsHtml(data,searchItems(data,e.target.value));
      bind();
    };
    $('#v112InvClear').onclick=()=>{
      ns.inventorySearch[type]=''; $('#v112InvSearch').value='';
      $('#v112InvBody').innerHTML=itemRowsHtml(data,data.items); bind(); $('#v112InvSearch').focus();
    };
    $('#v112ImportSecondary')?.addEventListener('click',showSecondaryImport);
    bind();
  }

  function itemRowsHtml(data,list){
    if(!list.length) return '<tr><td colspan="8"><div class="empty">Aucun résultat.</div></td></tr>';
    return list.map(i=>{
      const n=countUnitsForItem(data,i), pending=candidateUnitsForItem(data,i);
      return `<tr>
        <td><button class="v112-link-btn" data-v112-item="${er(i.id)}"><b>${er(i.name)}</b></button></td>
        <td>${er(i.targetSpecies||i.target||'—')}</td>
        <td>${er(i.fluorophore||'—')}</td>
        <td>${er(i.excitation_nm??'—')} / ${er(i.emission_nm??'—')}</td>
        <td>${er(i.hostSpecies||'—')}</td><td>${er(i.supplier||'—')}</td><td>${er(i.catalogNumber||'—')}</td>
        <td><span class="pill ${n?'ok':'neutral'}">${n} relié(s)</span>${pending?` <span class="pill warn">+${pending} à valider</span>`:''}</td>
      </tr>`;
    }).join('');
  }

  function secondaryQualityBlock(data){
    const m=manifest();
    if(!m) return '';
    return `<div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Contrôle qualité de la source secondaire</h3>
      <div class="v112-quality-grid">
        ${m.dataQualityIssues.map(x=>`<div class="v112-quality ${x.severity}">
          <b>${x.severity==='warning'?'⚠':'ℹ'} ${er(x.kind)}</b><p>${er(x.message)}</p>
        </div>`).join('')}
      </div>
      <p class="subtitle">Les valeurs sources restent intactes. Les synonymes servent au rapprochement sans réécrire l’Excel ni les données originales.</p>
    </div>`;
  }

  function selectedItem(data,type){
    const id=ns.inventorySelected[type];
    return data.items.find(x=>String(x.id)===String(id)||String(x.code)===String(id))||null;
  }

  function renderItemDetail(type,data,cfg){
    const item=selectedItem(data,type);
    if(!item){ ns.inventoryView[type]='list'; renderInventory(type); return; }
    const units=data.units.filter(u=>u.itemCode===item.code);
    const candidateUnits=data.units.filter(u=>!u.itemCode&&u.candidateItemCode===item.code);
    const fields=ns.fieldsFor?.(type)||[];
    const attrs=item.attributes||{};
    content.innerHTML=`<div class="row space-between">
      <div><button class="btn btn-sm" id="v112BackList">← Liste</button><h1 class="page-title" style="margin-top:12px">${er(item.name)}</h1>
      <p class="subtitle">${er(item.supplier||'')} ${item.catalogNumber?`· Réf. ${er(item.catalogNumber)}`:''}</p></div>
      <div class="row"><button class="btn" id="v112SuggestSlot">Suggérer une position</button>${data.mode==='grist'?'<button class="btn btn-primary" id="v112AddUnitFromItem">+ Ajouter un vial</button>':''}</div>
    </div>
    <div class="split">
      <div class="card card-pad"><h3 class="section-title">Informations générales</h3>
        <dl class="detail-list">
          <dt>Cible / espèce cible</dt><dd>${er(item.targetSpecies||item.target||'—')}</dd>
          <dt>Fluorophore</dt><dd>${er(item.fluorophore||'—')}</dd>
          <dt>Ex / Em</dt><dd>${er(item.excitation_nm??'—')} / ${er(item.emission_nm??'—')} nm</dd>
          <dt>Espèce hôte</dt><dd>${er(item.hostSpecies||'—')}</dd>
          <dt>Classe</dt><dd>${er(item.class||'—')}</dd>
          <dt>Fournisseur</dt><dd>${er(item.supplier||'—')}</dd>
          <dt>Référence</dt><dd>${er(item.catalogNumber||'—')}</dd>
          <dt>Température</dt><dd>${er(item.storageTemperature||'—')}</dd>
          <dt>Statut</dt><dd>${er(item.status||'—')}</dd>
        </dl>
        ${item.website?`<a class="btn" href="${er(item.website)}" target="_blank" rel="noopener noreferrer">Fiche fournisseur ↗</a>`:''}
      </div>
      <div class="card card-pad"><h3 class="section-title">Stock</h3>
        <p><span class="pill ok">${units.length} vial(s) relié(s)</span> ${candidateUnits.length?`<span class="pill warn">${candidateUnits.length} rapprochement(s) à valider</span>`:''}</p>
        ${units.length?`<table class="table"><thead><tr><th>Code</th><th>État</th><th>Position</th></tr></thead><tbody>${units.map(u=>`<tr><td>${er(u.code)}</td><td>${er(u.status||u.fillStatus||'')}</td><td>${er(unitLocation(data,u)||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun vial relié.</div>'}
      </div>
    </div>
    <div class="card card-pad" style="margin-top:16px"><h3 class="section-title">Champs configurables</h3>
      ${fields.length?`<dl class="detail-list">${fields.map(f=>{
        let v='';
        if(f.StorageMode==='column'){
          const map={TargetSpecies:'targetSpecies',Fluorophore:'fluorophore',Excitation_nm:'excitation_nm',Emission_nm:'emission_nm',HostSpecies:'hostSpecies',Class:'class',Supplier:'supplier',CatalogNumber:'catalogNumber',StorageTemperature:'storageTemperature',Website:'website'};
          v=item[map[f.ColumnName]||f.FieldKey];
        }else v=attrs[f.FieldKey];
        return `<dt>${er(f.Label)}</dt><dd>${er(v??'—')}</dd>`;
      }).join('')}</dl>`:'<div class="empty">Aucun FieldDefinition pour ce type.</div>'}
    </div>`;

    $('#v112BackList').onclick=()=>{ns.inventoryView[type]='list';ns.inventorySelected[type]=null;renderInventory(type);};
    $('#v112SuggestSlot').onclick=()=>suggestPositionForItem(type,data,item);
    $('#v112AddUnitFromItem')?.addEventListener('click',()=>addUnitFromItem(type,data,item));
  }

  function unitLocation(data,u){
    const p=data.positions.find(p=>String(p.unitCode||'')===String(u.code));
    if(!p) return '';
    const c=data.containers.find(c=>String(c.code)===String(p.containerCode));
    return `${c?.name||p.containerCode} / ${p.slot}`;
  }

  function suggestPositionForItem(type,data,item){
    if(!data.containers.length) return toast('Aucune boîte disponible.');
    // Prefer a container already holding the same item, then matching storage temperature.
    const peerUnitCodes=new Set(data.units.filter(u=>u.itemCode===item.code).map(u=>u.code));
    const peerPositions=data.positions.filter(p=>peerUnitCodes.has(p.unitCode));
    let container=peerPositions.length?data.containers.find(c=>c.code===peerPositions[0].containerCode):null;
    if(!container && item.storageTemperature) container=data.containers.find(c=>core.canonicalTemperature(c.temperature)===core.canonicalTemperature(item.storageTemperature));
    if(!container) container=data.containers[0];
    const suggestion=core.suggestSmartSlot({positions:data.positions,units:data.units.map(u=>({code:u.code,itemCode:u.itemCode})),targetItemId:item.code,containerId:container.code});
    if(!suggestion) return toast('Aucune position libre dans la boîte suggérée.');
    ns.inventoryView[type]='storage';
    const st=storageState(type); st.containerCode=container.code; st.slot=suggestion.slot; st.view='2d';
    toast(`Position suggérée : ${container.name} / ${suggestion.slot}.`);
    renderInventory(type);
  }

  function storageState(type){
    if(!ns.storageState[type]) ns.storageState[type]={containerCode:null,slot:null,view:'3d',opened:true,hover:''};
    return ns.storageState[type];
  }

  function buildBox(data,container){
    const units=new Map(data.units.map(u=>[u.code,u]));
    const items=new Map(data.items.map(i=>[i.code,i]));
    const positions=data.positions.filter(p=>p.containerCode===container.code);
    const slots=new Map();
    for(const p of positions){
      const parts=core.parseSlot(p.slot);
      if(!parts) continue;
      const unit=p.unitCode?units.get(p.unitCode):null;
      const item=unit?.item||items.get(unit?.itemCode)||unit?.candidateItem||items.get(unit?.candidateItemCode)||null;
      const detectedHost=unit?.detectedHost||item?.hostSpecies||'';
      const host=core.hostKey(detectedHost);
      slots.set(parts.slot,{
        ...p,...parts,Slot:parts.slot,Vial:unit?.code||'',occupied:!!unit,vial:unit,antibody:item,
        host,color:palette[host]||palette.unknown,label:item?.name||unit?.cleanLabel||unit?.rawLabel||unit?.code||(unit?'Vial non relié':'Libre'),
        source:unit?.rawLabel||'',blocked:!unit && p.available===false
      });
    }
    return {
      ...container,id:container.id,Name:container.name,Temperature:Number.isFinite(container.temperatureNumeric)?container.temperatureNumeric:Number(String(container.temperature||'').match(/-?\d+/)?.[0]||0),
      DisplayTemperature:container.temperature,Rows:container.rows,Columns:container.columns,slots,
      occupied:[...slots.values()].filter(x=>x.occupied).length,capacity:container.rows*container.columns
    };
  }

  async function sceneModule(){
    if(!ns.sceneModule) ns.sceneModule=import('./storage-scene-v10.js?v=10');
    return ns.sceneModule;
  }

  function disposeScene(){
    try{ns.genericScene?.dispose?.();}catch(_){}
    ns.genericScene=null;
  }

  function renderGenericStorage(type,data,cfg){
    disposeScene();
    const st=storageState(type);
    if(!data.containers.length){
      content.innerHTML=`<h1 class="page-title">Stockage — ${er(cfg.Name||type)}</h1><div class="empty">Aucune boîte configurée pour cet inventaire.</div>`;
      return;
    }
    let container=data.containers.find(c=>c.code===st.containerCode);
    if(!container){ container=data.containers[0]; st.containerCode=container.code; st.slot=null; }
    const box=buildBox(data,container);
    const can3d=Number(container.rows)===10&&Number(container.columns)===10;

    content.innerHTML=`<h1 class="page-title">Stockage — ${er(cfg.Name||type)}</h1>
      <p class="subtitle">${data.mode==='manifest'?'Aperçu des vraies boîtes Excel. Les actions d’écriture sont désactivées jusqu’à l’import Grist.':'Stockage générique v11.2 connecté à Grist.'}</p>
      ${importBanner(type,data)}
      <div class="v112-storage-layout">
        <aside class="v112-boxes">
          <div class="card card-pad"><h3 class="section-title">Boîtes</h3>
            ${data.containers.map(c=>{
              const b=buildBox(data,c);
              return `<button class="v112-box ${c.code===container.code?'active':''}" data-v112-box="${er(c.code)}">
                <span><b>${er(c.name)}</b><small>${er(c.temperature)} · ${b.occupied}/${b.capacity}</small></span><span>›</span>
              </button>`;
            }).join('')}
          </div>
        </aside>
        <section class="card v112-storage-main">
          <div class="v112-storage-toolbar">
            <div><h2>${er(container.name)}</h2><p>${er(container.temperature)} · ${box.occupied}/${box.capacity} positions occupées</p></div>
            <div class="row"><button class="btn ${st.view==='3d'?'btn-primary':''}" data-v112-storage-view="3d" ${can3d?'':'disabled'}>3D</button>
            <button class="btn ${st.view==='2d'?'btn-primary':''}" data-v112-storage-view="2d">2D</button></div>
          </div>
          <div class="v112-workbench">
            <div class="v112-view-host">
              <div id="v112Scene" class="${st.view==='3d'?'':'hidden'}"></div>
              <div id="v112Grid" class="${st.view==='2d'?'':'hidden'}"></div>
              <div id="v112Hover" class="v112-hover">${er(st.hover||'')}</div>
            </div>
            <aside id="v112UnitPanel" class="v112-unit-panel"></aside>
          </div>
        </section>
      </div>`;

    $('#v112ImportSecondary')?.addEventListener('click',showSecondaryImport);
    document.querySelectorAll('[data-v112-box]').forEach(b=>b.onclick=()=>{
      st.containerCode=b.dataset.v112Box;st.slot=null;renderGenericStorage(type,data,cfg);
    });
    document.querySelectorAll('[data-v112-storage-view]').forEach(b=>b.onclick=()=>{
      st.view=b.dataset.v112StorageView;renderGenericStorage(type,data,cfg);
    });
    renderGenericGrid(type,data,box);
    renderUnitPanel(type,data,box);
    if(st.view==='3d'&&can3d) void mountGenericScene(type,data,box);
  }

  function renderGenericGrid(type,data,box){
    const host=$('#v112Grid'); if(!host) return;
    const st=storageState(type);
    let html=`<div class="v112-slot-grid" style="grid-template-columns:34px repeat(${box.Columns},minmax(44px,1fr))"><span></span>`;
    for(let c=1;c<=box.Columns;c++) html+=`<span class="coordinate">${c}</span>`;
    for(let r=0;r<box.Rows;r++){
      html+=`<span class="coordinate">${String.fromCharCode(65+r)}</span>`;
      for(let c=0;c<box.Columns;c++){
        const slot=String.fromCharCode(65+r)+(c+1);
        const p=box.slots.get(slot);
        html+=`<button data-v112-slot="${slot}" class="${slot===st.slot?'selected ':''}${p?.occupied?'occupied ':''}${!p?'missing':''}"
          ${!p?'disabled':''} style="${p?.occupied?`--slot-color:${p.color}`:''}" title="${er(p?.label||'Position absente')}">
          <b>${slot}</b><small>${er(p?.occupied?p.label:p?.blocked?'Indisponible':p?'Libre':'Absente')}</small>
        </button>`;
      }
    }
    host.innerHTML=html+'</div>';
    host.querySelectorAll('[data-v112-slot]').forEach(b=>b.onclick=()=>selectStorageSlot(type,data,box,b.dataset.v112Slot));
  }

  function selectStorageSlot(type,data,box,slot){
    const st=storageState(type); st.slot=slot;
    ns.genericScene?.select?.(slot);
    renderGenericGrid(type,data,box);renderUnitPanel(type,data,box);
  }

  async function mountGenericScene(type,data,box){
    const el=$('#v112Scene'); if(!el) return;
    try{
      const mod=await sceneModule();
      ns.genericScene=mod.mountScene(el,box,
        slot=>selectStorageSlot(type,data,box,slot),
        text=>{const st=storageState(type);st.hover=text;const h=$('#v112Hover');if(h)h.textContent=text;}
      );
      const st=storageState(type);
      if(st.slot) ns.genericScene.select(st.slot);
    }catch(err){
      console.error(err);
      el.innerHTML='<div class="empty">La vue 3D n’a pas pu être chargée. Utilise la vue 2D.</div>';
    }
  }

  function renderUnitPanel(type,data,box){
    const panel=$('#v112UnitPanel');if(!panel)return;
    const st=storageState(type),p=box.slots.get(st.slot);
    if(!p){
      panel.innerHTML='<p class="v112-eyebrow">FICHE DU FLACON</p><div class="empty">Sélectionne une position dans la boîte.</div>';
      return;
    }
    if(!p.occupied){
      panel.innerHTML=`<p class="v112-eyebrow">EMPLACEMENT ${er(p.Slot)}</p><h2>${p.blocked?'Position indisponible':'Position libre'}</h2>
        <p class="subtitle">${er(box.Name)} · ${er(box.DisplayTemperature)}</p>
        ${data.mode==='grist'&&!p.blocked?'<button class="btn btn-primary" id="v112AddHere">+ Ajouter un vial ici</button>':'<div class="banner">Mode aperçu : aucune écriture.</div>'}`;
      $('#v112AddHere')?.addEventListener('click',()=>showAddGenericUnit(type,data,box,p));
      return;
    }
    const u=p.vial,item=p.antibody;
    const matchLabel=u.matchStatus==='auto'||u.matchStatus==='validated'?'Correspondance validée':u.matchStatus==='review'?'À valider':u.matchStatus==='other_reagent'?'Autre réactif':'Non résolu';
    const matchClass=u.matchStatus==='auto'||u.matchStatus==='validated'?'ok':u.matchStatus==='review'?'warn':'neutral';
    panel.innerHTML=`<p class="v112-eyebrow">FICHE DU FLACON · ${er(p.Slot)}</p>
      <div class="v112-vial-dot" style="--vial-color:${p.color}"></div>
      <h2>${er(item?.name||u.cleanLabel||u.rawLabel||u.code)}</h2>
      <p class="subtitle">${er(u.code)}</p>
      <p><span class="pill ${matchClass}">${er(matchLabel)}</span></p>
      <dl class="detail-list v112-panel-list">
        <dt>Libellé boîte</dt><dd>${er(u.rawLabel||'—')}</dd>
        <dt>Cible</dt><dd>${er(item?.targetSpecies||u.detectedTargetSpecies||'—')}</dd>
        <dt>Fluorophore</dt><dd>${er(item?.fluorophore||u.detectedFluorophore||'—')}</dd>
        <dt>Hôte</dt><dd>${er(item?.hostSpecies||u.detectedHost||'—')}</dd>
        <dt>Référence</dt><dd>${er(item?.catalogNumber||'—')}</dd>
        <dt>Fournisseur</dt><dd>${er(item?.supplier||'—')}</dd>
        <dt>Statut</dt><dd>${er(u.status||'—')}</dd>
        <dt>Position</dt><dd>${er(p.Slot)}</dd>
      </dl>
      ${u.candidateItem&&!u.item?`<div class="banner"><b>Candidat :</b> ${er(u.candidateItem.name)} · ${er(u.candidateItem.catalogNumber||'sans référence')}<br>${er((u.matchIssues||[]).join(' · '))}</div>`:''}
      ${data.mode==='grist'?`<div class="v112-panel-actions">
        <button class="btn" id="v112EditUnit">Modifier</button><button class="btn" id="v112MoveUnit">Déplacer</button>
        ${/vide/i.test(u.status||u.fillStatus||'')?'<button class="btn btn-danger" id="v112RemoveUnit">Confirmer retrait physique</button>':'<button class="btn btn-danger" id="v112EmptyUnit">Marquer vide</button>'}
      </div>`:''}`;
    $('#v112EditUnit')?.addEventListener('click',()=>showEditGenericUnit(type,data,box,p));
    $('#v112MoveUnit')?.addEventListener('click',()=>showMoveGenericUnit(type,data,box,p));
    $('#v112EmptyUnit')?.addEventListener('click',()=>markGenericEmpty(type,p));
    $('#v112RemoveUnit')?.addEventListener('click',()=>removeGenericUnit(type,p));
  }

  function generatedCode(prefix='UNIT'){
    const d=new Date(),pad=n=>String(n).padStart(2,'0');
    return `${prefix}-${String(d.getFullYear()).slice(-2)}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.floor(Math.random()*90+10)}`;
  }

  function itemSelectOptions(data,selected=''){
    return data.items.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr')).map(i=>`<option value="${er(i.id)}" ${String(i.id)===String(selected)?'selected':''}>${er(i.name)}${i.catalogNumber?` — ${er(i.catalogNumber)}`:''}</option>`).join('');
  }

  function showAddGenericUnit(type,data,box,p,preselectedItem=null){
    modal(`<h2>Ajouter un ${er(typeConfig(type)?.UnitLabel||'vial')} — ${er(box.Name)} / ${er(p.Slot)}</h2>
      <div class="field"><label>Élément *</label><select id="v112UnitItem">${itemSelectOptions(data,preselectedItem?.id||'')}</select></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Code *</label><input id="v112UnitCode" value="${generatedCode(type==='cell_stock'?'CRYO':'SEC-V')}"></div>
        <div class="field"><label>Remplissage</label><select id="v112UnitFill">${(ns.choiceValues?.('fill_status')||[]).map(x=>`<option>${er(x.Value)}</option>`).join('')||'<option>Plein</option><option>≈ 50 %</option><option>Inconnu</option>'}</select></div>
        <div class="field"><label>Volume estimé (µL)</label><input id="v112UnitVol" type="number" min="0"></div>
        <div class="field"><label>Statut</label><input value="En stock" disabled></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="v112UnitComments"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112UnitCancel">Annuler</button><button class="btn btn-primary" id="v112UnitSave">Créer et positionner</button></div>`);
    $('#v112UnitCancel').onclick=closeModal;
    $('#v112UnitSave').onclick=async()=>{
      if(!state.connected)return toast('Connexion Grist requise.');
      const code=$('#v112UnitCode').value.trim();if(!code)return toast('Code obligatoire.');
      if(trows('InventoryUnits').some(x=>core.normalizeText(x.Code)===core.normalizeText(code)))return toast('Ce code existe déjà.');
      const posLive=trows('InventoryPositions').find(x=>Number(x.id)===Number(p.id));
      if(!posLive||Number(posLive.Unit))return toast('La position n’est plus libre.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','InventoryUnits',null,{
          Code:code,InventoryType:type,Item:Number($('#v112UnitItem').value),FillStatus:$('#v112UnitFill').value,
          EstimatedVolume_uL:$('#v112UnitVol').value===''?null:Number($('#v112UnitVol').value),Status:'En stock',
          Comments:$('#v112UnitComments').value.trim(),MatchStatus:'manual'
        }]]);
        await loadAll();
        const unit=trows('InventoryUnits').find(x=>x.Code===code);
        if(!unit)throw Error('Unité créée mais introuvable après relecture.');
        const latest=trows('InventoryPositions').find(x=>Number(x.id)===Number(p.id));
        if(Number(latest?.Unit)){
          await grist.docApi.applyUserActions([['UpdateRecord','InventoryUnits',unit.id,{Status:'À ranger'}]]);
          throw Error('La position a été occupée entre-temps ; l’unité a été laissée « À ranger ».');
        }
        await grist.docApi.applyUserActions([
          ['UpdateRecord','InventoryPositions',p.id,{Unit:Number(unit.id),Available:false}],
          historyAction(type,'Ajout unité',unit.Code,`${box.Name} / ${p.Slot}`)
        ]);
        closeModal();await loadAll();toast(`Ajouté en ${p.Slot}.`);renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

  function addUnitFromItem(type,data,item){
    const peers=data.units.filter(u=>u.itemCode===item.code);
    const peerPos=data.positions.find(p=>peers.some(u=>u.code===p.unitCode));
    let container=peerPos?data.containers.find(c=>c.code===peerPos.containerCode):data.containers.find(c=>core.canonicalTemperature(c.temperature)===core.canonicalTemperature(item.storageTemperature));
    if(!container)container=data.containers[0];
    const suggestion=core.suggestSmartSlot({positions:data.positions,units:data.units.map(u=>({code:u.code,itemCode:u.itemCode})),targetItemId:item.code,containerId:container?.code});
    if(!container||!suggestion)return toast('Aucune position libre adaptée.');
    ns.inventoryView[type]='storage';const st=storageState(type);st.containerCode=container.code;st.slot=suggestion.slot;st.view='2d';
    renderInventory(type);
    setTimeout(()=>{
      const fresh=inventoryData(type),box=buildBox(fresh,fresh.containers.find(c=>c.code===container.code)),p=box.slots.get(suggestion.slot);
      if(p)showAddGenericUnit(type,fresh,box,p,item);
    },0);
  }

  function historyAction(type,action,code,details){
    return ['AddRecord','InventoryHistory',null,{Date:Date.now()/1000,InventoryType:type,Action:action,EntityType:'Unit',EntityCode:code||'',Details:details||'',User:'Grist'}];
  }

  function showEditGenericUnit(type,data,box,p){
    const u=p.vial;
    modal(`<h2>Modifier ${er(u.code)}</h2>
      <div class="form-grid">
        <div class="field"><label>Remplissage</label><input id="v112EditFill" value="${er(u.fillStatus||'')}"></div>
        <div class="field"><label>Volume estimé (µL)</label><input id="v112EditVol" type="number" min="0" value="${er(u.estimatedVolume_uL??'')}"></div>
        <div class="field"><label>Statut</label><input id="v112EditStatus" value="${er(u.status||'')}"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="v112EditComments">${er(u.comments||'')}</textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112EditCancel">Annuler</button><button class="btn btn-primary" id="v112EditSave">Enregistrer</button></div>`);
    $('#v112EditCancel').onclick=closeModal;
    $('#v112EditSave').onclick=async()=>{
      try{
        await grist.docApi.applyUserActions([
          ['UpdateRecord','InventoryUnits',Number(u.id),{FillStatus:$('#v112EditFill').value.trim(),EstimatedVolume_uL:$('#v112EditVol').value===''?null:Number($('#v112EditVol').value),Status:$('#v112EditStatus').value.trim(),Comments:$('#v112EditComments').value.trim()}],
          historyAction(type,'Modification unité',u.code,`${box.Name} / ${p.Slot}`)
        ]);
        closeModal();await loadAll();toast('Unité modifiée.');renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

  function showMoveGenericUnit(type,data,box,p){
    const free=data.positions.filter(x=>!x.unitCode&&x.available!==false);
    modal(`<h2>Déplacer ${er(p.vial.code)}</h2>
      <div class="field"><label>Nouvelle position</label><select id="v112MoveTarget">
        ${free.map(x=>{const c=data.containers.find(c=>c.code===x.containerCode);return `<option value="${er(x.id)}">${er(c?.name||x.containerCode)} / ${er(x.slot)}</option>`}).join('')}
      </select></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112MoveCancel">Annuler</button><button class="btn btn-primary" id="v112MoveSave">Déplacer</button></div>`);
    $('#v112MoveCancel').onclick=closeModal;
    $('#v112MoveSave').onclick=async()=>{
      const target=trows('InventoryPositions').find(x=>Number(x.id)===Number($('#v112MoveTarget').value));
      if(!target||Number(target.Unit))return toast('Destination indisponible.');
      try{
        await grist.docApi.applyUserActions([
          ['UpdateRecord','InventoryPositions',Number(p.id),{Unit:0,Available:true}],
          ['UpdateRecord','InventoryPositions',Number(target.id),{Unit:Number(p.vial.id),Available:false}],
          historyAction(type,'Déplacement',p.vial.code,`${box.Name} / ${p.Slot} → ${target.Slot}`)
        ]);
        closeModal();await loadAll();toast(`Déplacé vers ${target.Slot}.`);renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

  async function markGenericEmpty(type,p){
    if(!confirm('Marquer ce vial comme vide ? La position restera occupée jusqu’au retrait physique.'))return;
    try{
      await grist.docApi.applyUserActions([
        ['UpdateRecord','InventoryUnits',Number(p.vial.id),{FillStatus:'Vide',Status:'Vide / à retirer'}],
        historyAction(type,'Vial vide',p.vial.code,`Position ${p.Slot} conservée`)
      ]);
      await loadAll();toast('Vial marqué vide.');renderInventory(type);
    }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
  }

  async function removeGenericUnit(type,p){
    if(!confirm('Confirmer le retrait physique ? La position sera libérée et le vial archivé.'))return;
    try{
      await grist.docApi.applyUserActions([
        ['UpdateRecord','InventoryPositions',Number(p.id),{Unit:0,Available:true}],
        ['UpdateRecord','InventoryUnits',Number(p.vial.id),{Status:'Archivé'}],
        historyAction(type,'Retrait physique',p.vial.code,`Position ${p.Slot} libérée`)
      ]);
      storageState(type).slot=null;await loadAll();toast('Position libérée.');renderInventory(type);
    }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
  }

  // ---------------- Secondary import / reconciliation ----------------

  function showSecondaryImport(){
    const m=manifest();if(!m)return;
    modal(`<h2>Importer les anticorps secondaires dans les tables v11.2</h2>
      <div class="banner"><b>Aucune table historique ne sera modifiée.</b> L’import écrit uniquement dans InventoryItems, InventoryAttributes, InventoryContainers, InventoryUnits, InventoryPositions et InventoryHistory.</div>
      <div class="grid grid-4" style="margin-top:14px">
        <div><b>${m.summary.items}</b><small> références</small></div><div><b>${m.summary.occupiedUnits}</b><small> vials</small></div>
        <div><b>${m.summary.autoMatchedUnits}</b><small> auto-reliés</small></div><div><b>${m.summary.reviewUnits+m.summary.unresolvedUnits+m.summary.otherReagentUnits}</b><small> conservés à réconcilier</small></div>
      </div>
      <p>Les ${m.summary.reviewUnits} vials avec une incohérence Goat/Donkey ne seront <b>pas</b> reliés automatiquement. Ils seront importés avec le statut « À réconcilier » et une proposition de référence.</p>
      <label class="v112-check"><input type="checkbox" id="v112ImportConfirm"><span>Je confirme l’import dans les nouvelles tables génériques v11.2.</span></label>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112ImportCancel">Annuler</button><button class="btn btn-primary" id="v112ImportGo">Importer</button></div>`);
    $('#v112ImportCancel').onclick=closeModal;
    $('#v112ImportGo').onclick=async()=>{
      if(!$('#v112ImportConfirm').checked)return toast('Confirme l’import avant de continuer.');
      try{await importSecondaryManifest();closeModal();toast('Import secondaire terminé.');go('inv:secondary_antibody');}
      catch(err){console.error(err);toast(`Import interrompu : ${err.message||err}`);}
    };
  }

  async function bulkAddMissing(table,records,keyField='Code'){
    if(!records.length)return;
    const existing=new Set(trows(table).map(x=>String(x[keyField]||'')));
    const missing=records.filter(r=>!existing.has(String(r[keyField]||'')));
    if(!missing.length)return;
    const cols=Object.keys(missing[0]);
    const values=Object.fromEntries(cols.map(c=>[c,missing.map(r=>r[c]??null)]));
    await grist.docApi.applyUserActions([['BulkAddRecord',table,Array(missing.length).fill(null),values]]);
    const fresh=await grist.docApi.fetchTable(table);state.data[table]=fresh;ns.data[table]=fresh;
  }

  async function importSecondaryManifest(){
    if(!state.connected)throw Error('Connexion Grist requise.');
    const required=['InventoryItems','InventoryAttributes','InventoryContainers','InventoryUnits','InventoryPositions','InventoryHistory'];
    const missing=required.filter(x=>!state.tables.includes(x));
    if(missing.length)throw Error(`Initialise d’abord la structure v11.2 : ${missing.join(', ')}.`);
    const m=manifest();if(!m)throw Error('Manifeste secondaire introuvable.');

    await bulkAddMissing('InventoryItems',m.items.map(i=>({
      Code:i.code,InventoryType:'secondary_antibody',Name:i.name,Status:'Actif',Active:true,
      Supplier:i.supplier,CatalogNumber:i.catalogNumber,TargetSpecies:i.targetSpecies,HostSpecies:i.hostSpecies,
      Fluorophore:i.fluorophore,Excitation_nm:i.excitation_nm,Emission_nm:i.emission_nm,StorageTemperature:i.storageTemperature,
      Class:i.class,Website:i.website,Comments:i.infos||'',RawTable:i.sourceSheet,RawRowId:i.sourceRow
    })));
    const itemsLive=trows('InventoryItems').filter(x=>x.InventoryType==='secondary_antibody');
    const itemByCode=new Map(itemsLive.map(x=>[x.Code,x]));

    // Attributes: dedupe by Item + FieldKey + Source.
    const existingAttr=new Set(trows('InventoryAttributes').map(x=>`${x.Item}|${x.FieldKey}|${x.Source}`));
    const attrs=[];
    for(const i of m.items){
      const live=itemByCode.get(i.code);if(!live)continue;
      for(const [field,val] of [['infos',i.infos],['labWB',i.labWB],['labImmunostaining',i.labImmunostaining]]){
        if(val===null||val===undefined||String(val).trim()==='')continue;
        const key=`${live.id}|${field}|${i.sourceSheet}`;
        if(existingAttr.has(key))continue;
        attrs.push({Item:Number(live.id),InventoryType:'secondary_antibody',FieldKey:field,ValueText:String(val),Source:i.sourceSheet});
      }
    }
    if(attrs.length){
      const cols=Object.keys(attrs[0]);const values=Object.fromEntries(cols.map(c=>[c,attrs.map(r=>r[c]??null)]));
      await grist.docApi.applyUserActions([['BulkAddRecord','InventoryAttributes',Array(attrs.length).fill(null),values]]);
      const fresh=await grist.docApi.fetchTable('InventoryAttributes');state.data.InventoryAttributes=fresh;ns.data.InventoryAttributes=fresh;
    }

    await bulkAddMissing('InventoryContainers',m.containers.map(c=>({
      Code:c.code,InventoryType:'secondary_antibody',Name:c.name,Temperature:c.temperature,Rack:'',Rows:c.rows,Columns:c.columns,
      Notes:`Source : ${c.sourceSheet} / ${c.sourceRegion}`,Active:true
    })));
    const boxes=trows('InventoryContainers').filter(x=>x.InventoryType==='secondary_antibody');
    const boxByCode=new Map(boxes.map(x=>[x.Code,x]));

    await bulkAddMissing('InventoryUnits',m.units.map(u=>({
      Code:u.code,InventoryType:'secondary_antibody',
      Item:u.itemCode?Number(itemByCode.get(u.itemCode)?.id||0):0,
      FillStatus:'Inconnu',EstimatedVolume_uL:null,Status:u.status,Comments:(u.matchIssues||[]).join(' · '),
      RawLabel:u.rawLabel,MatchStatus:u.matchStatus,MatchScore:u.matchScore??null,CandidateItemCode:u.candidateItemCode||'',
      RawTable:u.sourceSheet,RawCell:`${u.containerCode}/${u.slot}`
    })));
    const units=trows('InventoryUnits').filter(x=>x.InventoryType==='secondary_antibody');
    const unitByCode=new Map(units.map(x=>[x.Code,x]));

    await bulkAddMissing('InventoryPositions',m.positions.map(p=>({
      Code:p.code,InventoryType:'secondary_antibody',Container:Number(boxByCode.get(p.containerCode)?.id||0),Slot:p.slot,
      Unit:p.unitCode?Number(unitByCode.get(p.unitCode)?.id||0):0,Available:p.available,Notes:''
    })));

    if(!trows('InventoryHistory').some(x=>x.InventoryType==='secondary_antibody'&&x.Action==='Import Excel 2025')){
      await grist.docApi.applyUserActions([['AddRecord','InventoryHistory',null,{
        Date:Date.now()/1000,InventoryType:'secondary_antibody',Action:'Import Excel 2025',EntityType:'Inventory',
        EntityCode:'secondary_antibody',Details:`${m.summary.items} références, ${m.summary.occupiedUnits} vials, ${m.summary.reviewUnits+m.summary.unresolvedUnits+m.summary.otherReagentUnits} à réconcilier`,User:'Grist'
      }]]);
    }
    await loadAll();
  }
  ns.importSecondaryManifest=importSecondaryManifest;

  function reconciliationGroupsFromLive(data){
    const pending=data.units.filter(u=>u.status==='À réconcilier'||['review','unresolved','other_reagent'].includes(u.matchStatus));
    const map=new Map();
    for(const u of pending){
      const parsed=core.parseSecondaryStorageLabel(u.rawLabel);
      const key=core.normalizeText(parsed.cleanLabel||u.rawLabel);
      if(!map.has(key))map.set(key,{key,label:parsed.cleanLabel||u.rawLabel,units:[],candidateItemCode:u.candidateItemCode||'',candidateItem:u.candidateItem});
      map.get(key).units.push(u);
    }
    return [...map.values()].sort((a,b)=>b.units.length-a.units.length);
  }

  function reconciliationHtml(type,data){
    if(type!==MANIFEST_TYPE)return '';
    const groups=data.mode==='grist'?reconciliationGroupsFromLive(data):(manifest()?.reconciliationGroups||[]).map(g=>({
      key:g.normalizedLabel,label:g.normalizedLabel,units:Array(g.count).fill(null),candidateItemCode:g.candidateItemCode,candidateItem:data.items.find(i=>i.code===g.candidateItemCode),issues:g.issues
    }));
    if(!groups.length)return '<div class="empty">Toutes les correspondances sont résolues.</div>';
    return `<div class="v112-reconcile-list">${groups.map((g,i)=>`<div class="v112-reconcile-card">
      <div><b>${er(g.label)}</b><p>${g.units.length} vial(s) · candidat : ${er(g.candidateItem?.name||g.candidateItemCode||'aucun')}</p></div>
      ${data.mode==='grist'?`<button class="btn btn-sm" data-v112-reconcile="${i}">Réconcilier</button>`:'<span class="pill warn">À valider après import</span>'}
    </div>`).join('')}</div>`;
  }

  function showReconciliation(type,data){
    const groups=reconciliationGroupsFromLive(data);
    modal(`<h2>Réconciliation des secondaires</h2><p class="subtitle">Valide une règle une seule fois : tous les vials portant le même libellé sont mis à jour ensemble.</p>
      ${groups.length?groups.map((g,i)=>`<div class="v112-reconcile-card"><div><b>${er(g.label)}</b><p>${g.units.length} vial(s) · proposition : ${er(g.candidateItem?.name||g.candidateItemCode||'aucune')}</p></div><button class="btn btn-sm" data-v112-rec="${i}">Choisir</button></div>`).join(''):'<div class="empty">Aucun groupe à réconcilier.</div>'}
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112RecClose">Fermer</button></div>`);
    $('#v112RecClose').onclick=closeModal;
    document.querySelectorAll('[data-v112-rec]').forEach(b=>b.onclick=()=>showReconciliationChoice(type,data,groups[Number(b.dataset.v112Rec)]));
  }

  function showReconciliationChoice(type,data,group){
    modal(`<h2>Réconcilier — ${er(group.label)}</h2><p>${group.units.length} vial(s) seront modifiés ensemble.</p>
      <div class="field"><label>Référence validée</label><select id="v112RecItem"><option value="">— Laisser non relié / autre réactif —</option>${itemSelectOptions(data,group.candidateItem?.id||'')}</select></div>
      <div class="banner" style="margin-top:12px">Le libellé source est conservé dans RawLabel. Cette action ne modifie pas l’Excel d’origine.</div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112RecCancel">Annuler</button><button class="btn btn-primary" id="v112RecApply">Valider le groupe</button></div>`);
    $('#v112RecCancel').onclick=()=>showReconciliation(type,data);
    $('#v112RecApply').onclick=async()=>{
      const itemId=Number($('#v112RecItem').value)||0;
      const selected=data.items.find(i=>Number(i.id)===itemId);
      const actions=group.units.map(u=>['UpdateRecord','InventoryUnits',Number(u.id),{
        Item:itemId,MatchStatus:itemId?'validated':'other_reagent',Status:itemId?'En stock':'À réconcilier',
        Comments:itemId?`Correspondance validée manuellement vers ${selected?.code||''}`:'Conservé comme autre réactif / non relié'
      }]);
      actions.push(['AddRecord','InventoryHistory',null,{Date:Date.now()/1000,InventoryType:type,Action:'Réconciliation',EntityType:'Units',EntityCode:group.key,Details:`${group.units.length} vial(s) → ${selected?.code||'non relié'}`,User:'Grist'}]);
      try{await grist.docApi.applyUserActions(actions);closeModal();await loadAll();toast('Groupe réconcilié.');renderInventory(type);}
      catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

  // Add a reconciliation block on the secondary list after render.
  const originalRenderItemList=renderItemList;
  // We cannot rebind the declaration above, so append through a route post-hook.
  const originalRenderInventory=renderInventory;
  renderInventory=function(type){
    originalRenderInventory(type);
    if(type===MANIFEST_TYPE && (ns.inventoryView[type]||'list')==='list'){
      const data=inventoryData(type);
      const holder=document.createElement('div');
      holder.className='card card-pad';holder.style.marginTop='16px';
      holder.innerHTML=`<div class="row space-between"><div><h3 class="section-title">Réconciliation du stockage</h3><p class="subtitle">Les incohérences de libellés ne sont jamais corrigées silencieusement.</p></div>${data.mode==='grist'?'<button class="btn btn-primary" id="v112OpenReconcile">Réconcilier</button>':''}</div>${reconciliationHtml(type,data)}`;
      content.appendChild(holder);
      $('#v112OpenReconcile')?.addEventListener('click',()=>showReconciliation(type,data));
    }
    bindTypeViews(type);
  };
  ns.renderInventory=renderInventory;

  // Ensure the render dispatcher uses the final renderInventory wrapper.
  render=function(){
    if(String(state.route||'').startsWith('inv:')){
      renderInventory(String(state.route).slice(4));
      return;
    }
    return baseRender();
  };

  setTimeout(()=>{try{renderNav();}catch(_){ }},120);
})();