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
  ns.inventoryDetailTab=ns.inventoryDetailTab||{};
  ns.storageState=ns.storageState||{};
  ns.sceneModule=null;
  ns.genericScene=null;

  const palette=core.DEFAULT_PALETTE;
  const MANIFEST_TYPE='secondary_antibody';

  // v11.2.2 — visual/storage metadata for secondary antibodies.
  // -20 °C Excel boxes use letters A–J horizontally and rows 1–10 vertically.
  // The +4 °C box uses the legacy orientation (letters vertically, numbers horizontally).
  const SECONDARY_FLUOR_COLORS={
    'af350':'#6f8ff1','d350':'#6f8ff1','d405':'#5f80e9',
    'af488':'#6fc255','bodipy':'#f0a43b','af555':'#ef6464',
    'af568':'#f08d91','af594':'#9b69d8','d649':'#54a9cf',
    'dylight649':'#54a9cf','af647':'#e75b6b','cy5':'#39a7d8',
    'cydye800':'#6f7fdc'
  };

  function fluorKey(v){
    return core.normalizeText(v||'').replace(/\s+/g,'').replace(/dyelight/g,'dylight');
  }

  function secondaryColor(item,unit){
    const key=fluorKey(item?.fluorophore||unit?.detectedFluorophore||'');
    return SECONDARY_FLUOR_COLORS[key]||'#d4dce3';
  }

  function orientationFromNotes(notes=''){
    const m=String(notes).match(/Layout\s*:\s*([a-z-]+)/i);
    return m?.[1]||'';
  }

  function defaultContainerOrientation(code,notes=''){
    const explicit=orientationFromNotes(notes);
    if(explicit)return explicit;
    if(/^SEC-BOX-20-0[12]$/i.test(String(code||'')))return 'letters-columns';
    return 'letters-rows';
  }

  function sceneBoxForOrientation(box){
    if(box.GridOrientation!=='letters-columns') return {sceneBox:box,rawToScene:new Map()};
    const slots=new Map(),rawToScene=new Map();
    for(const p of box.slots.values()){
      // Raw A1/B1/... is displayed with the letter on the horizontal axis.
      const vr=p.col, vc=p.row;
      const sceneKey=String.fromCharCode(65+vr)+(vc+1);
      rawToScene.set(p.Slot,sceneKey);
      slots.set(sceneKey,{...p,row:vr,col:vc});
    }
    return {sceneBox:{...box,slots},rawToScene};
  }

  function storageLegend(data,box){
    const seen=new Map();
    for(const p of box.slots.values()){
      if(!p.occupied)continue;
      const f=p.antibody?.fluorophore||p.vial?.detectedFluorophore||'Non renseigné';
      const key=core.normalizeText(f)||'unknown';
      if(!seen.has(key))seen.set(key,{label:f||'Non renseigné',color:p.color});
    }
    if(!seen.size)return '';
    return [...seen.values()].map(x=>`<span class="v112-storage-legend-item"><i style="background:${er(x.color)}"></i>${er(x.label)}</span>`).join('');
  }

  function er(v){ return esc(v); }
  function trows(name){ return rows(state.data[name]||ns.data?.[name]); }
  function tableHasFields(name,fields){
    const table=state.data[name]||ns.data?.[name];
    if(!table)return false;
    return fields.every(k=>Object.prototype.hasOwnProperty.call(table,k) || trows(name).some(r=>Object.prototype.hasOwnProperty.call(r,k)));
  }
  function typeConfig(key){
    const cfg=ns.inventoryTypes?.().find(x=>x.Key===key) || null;
    if(!cfg)return null;
    if(key==='cell_stock' && (!cfg.Name || cfg.Name==='Cellules -80 °C')) return {...cfg,Name:'Cellules'};
    return cfg;
  }
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
      matchScore:r.MatchScore,candidateItemCode:r.CandidateItemCode||'',
      detectedHost:r.DetectedHost||'',detectedTargetSpecies:r.DetectedTargetSpecies||'',detectedFluorophore:r.DetectedFluorophore||'',
      stockMarker:r.StockMarker===true,dateLabel:r.DateLabel||'',source:'grist',raw:r
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
    if(live.length) return live.map(r=>{
      const fallback=type===MANIFEST_TYPE?manifest()?.containers?.find(c=>c.code===r.Code):null;
      return {
        id:Number(r.id),code:r.Code||`BOX-${r.id}`,inventoryType:r.InventoryType,name:r.Name||r.Code,
        temperature:r.Temperature||'',temperatureNumeric:Number(String(r.Temperature||'').match(/-?\d+/)?.[0]||NaN),
        rack:r.Rack||'',rows:Number(r.Rows||10),columns:Number(r.Columns||10),notes:r.Notes||'',
        gridOrientation:orientationFromNotes(r.Notes||'')||fallback?.gridOrientation||defaultContainerOrientation(r.Code,r.Notes||''),
        subtitle:String(r.Notes||'').match(/Subtitle\s*:\s*([^|]+)/i)?.[1]?.trim()||fallback?.subtitle||'',
        source:'grist',raw:r
      };
    });
    if(type===MANIFEST_TYPE && manifest()) return manifest().containers.map(x=>({
      ...x,id:x.code,gridOrientation:x.gridOrientation||defaultContainerOrientation(x.code,''),
      source:'manifest'
    }));
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
    const singular=String(cfg.SingularName||'Élément').trim();
    // For the secondary Excel preview, importing the manifest must remain the
    // first write. Once data are in Grist, manual creation is available.
    const canAdd=state.connected && !(type===MANIFEST_TYPE && data.mode==='manifest');
    topbar(cfg.Name||type,`<div class="row v112-top-actions v112-inventory-switch">
      <button class="btn ${view==='list'||view==='detail'?'btn-primary':''}" data-v112-view="list">Liste</button>
      ${cfg.StorageEnabled!==false?`<button class="btn ${view==='storage'?'btn-primary':''}" data-v112-view="storage">Stockage</button>`:''}
      ${canAdd?`<button class="btn btn-primary" data-v112-add-item>+ Ajouter un ${er(singular.toLowerCase())}</button>`:''}
    </div>`);
    return cfg;
  }

  function bindTypeViews(type,data,cfg){
    document.querySelectorAll('[data-v112-view]').forEach(b=>b.onclick=()=>{
      ns.inventoryView[type]=b.dataset.v112View;
      ns.inventorySelected[type]=null;
      renderInventory(type);
    });
    document.querySelector('[data-v112-add-item]')?.addEventListener('click',()=>showAddInventoryItem(type,data,cfg));
  }

  function renderInventory(type){
    const data=inventoryData(type);
    const cfg=typeHeader(type,data);
    const view=ns.inventoryView[type]||'list';
    if(view==='detail') renderItemDetail(type,data,cfg);
    else if(view==='storage') renderGenericStorage(type,data,cfg);
    else renderItemList(type,data,cfg);
    bindTypeViews(type,data,cfg);
  }
  ns.renderInventory=renderInventory;

  function genericFieldInput(field){
    const id=`v112NewItem_${field.FieldKey}`;
    const label=er(field.Label||field.FieldKey);
    const required=field.Required===true?' *':'';
    const help=field.HelpText?`<small>${er(field.HelpText)}</small>`:'';
    let control='';
    if(field.DataType==='choice'){
      const opts=(ns.choiceValues?.(field.ChoiceGroup)||[]).map(x=>`<option value="${er(x.Value)}">${er(x.Label||x.Value)}</option>`).join('');
      control=`<select id="${er(id)}"><option value="">—</option>${opts}</select>`;
    }else if(field.DataType==='number'){
      control=`<input id="${er(id)}" type="number" step="any">`;
    }else if(field.DataType==='date'){
      control=`<input id="${er(id)}" type="date">`;
    }else if(/info|comment|note|validation/i.test(String(field.FieldKey||''))){
      control=`<textarea id="${er(id)}" rows="3"></textarea>`;
    }else{
      control=`<input id="${er(id)}" type="text">`;
    }
    return `<div class="field"><label>${label}${required}</label>${control}${help}</div>`;
  }

  function showAddInventoryItem(type,data,cfg){
    if(!state.connected)return toast('Connexion Grist requise.');
    if(type===MANIFEST_TYPE && data.mode==='manifest')return toast('Importe d’abord le stock secondaire dans Grist.');
    const fields=(ns.fieldsFor?.(type)||[]).filter(f=>f.Active!==false&&f.Visible!==false).sort((a,b)=>Number(a.SortOrder||999)-Number(b.SortOrder||999));
    const singular=String(cfg.SingularName||'élément').toLowerCase();
    const isSecondary=type===MANIFEST_TYPE;
    const codePrefix=isSecondary?'SEC-AB':type==='cell_stock'?'CELL':'ITEM';
    const common=isSecondary?`
      <div class="field"><label>Fournisseur</label><input id="v112NewItemSupplier"></div>
      <div class="field"><label>Référence catalogue</label><input id="v112NewItemCatalog"></div>
      <div class="field"><label>Température de stockage</label><input id="v112NewItemStorage" placeholder="-20°C, +4°C…"></div>
      <div class="field"><label>Lien fournisseur</label><input id="v112NewItemWebsite" type="url" placeholder="https://…"></div>`:'';
    modal(`<h2>Ajouter un ${er(singular)}</h2>
      <p class="subtitle">Création dans l’inventaire ${er(cfg.Name||type)}. Les autres inventaires ne sont pas modifiés.</p>
      <div class="v112-form-grid">
        <div class="field"><label>Nom *</label><input id="v112NewItemName" autocomplete="off"></div>
        <div class="field"><label>Code *</label><input id="v112NewItemCode" value="${er(generatedCode(codePrefix))}"></div>
        ${common}
        ${fields.map(genericFieldInput).join('')}
        <div class="field v112-span2"><label>Commentaires</label><textarea id="v112NewItemComments" rows="3"></textarea></div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112NewItemCancel">Annuler</button><button class="btn btn-primary" id="v112NewItemSave">Ajouter</button></div>`);
    $('#v112NewItemCancel').onclick=closeModal;
    $('#v112NewItemSave').onclick=async()=>{
      const name=$('#v112NewItemName').value.trim(),code=$('#v112NewItemCode').value.trim();
      if(!name||!code)return toast('Nom et code obligatoires.');
      if(trows('InventoryItems').some(x=>core.normalizeText(x.Code)===core.normalizeText(code)))return toast('Ce code existe déjà.');
      const requiredMissing=fields.find(f=>f.Required===true&&!String(document.getElementById(`v112NewItem_${f.FieldKey}`)?.value||'').trim());
      if(requiredMissing)return toast(`${requiredMissing.Label||requiredMissing.FieldKey} est obligatoire.`);
      if(isSecondary){
        const catalog=$('#v112NewItemCatalog')?.value.trim()||'';
        const duplicate=trows('InventoryItems').find(x=>x.InventoryType===type && core.normalizeText(x.Name)===core.normalizeText(name) && catalog && core.normalizeText(x.CatalogNumber)===core.normalizeText(catalog));
        if(duplicate)return toast('Une référence secondaire avec ce nom et ce catalogue existe déjà.');
      }
      const record={Code:code,InventoryType:type,Name:name,Status:'Actif',Active:true,Comments:$('#v112NewItemComments').value.trim(),RawTable:'Ajout manuel'};
      if(isSecondary){
        record.Supplier=$('#v112NewItemSupplier').value.trim();
        record.CatalogNumber=$('#v112NewItemCatalog').value.trim();
        record.StorageTemperature=$('#v112NewItemStorage').value.trim();
        record.Website=$('#v112NewItemWebsite').value.trim();
      }
      const columnMap={target:'Target',targetSpecies:'TargetSpecies',hostSpecies:'HostSpecies',fluorophore:'Fluorophore',excitation_nm:'Excitation_nm',emission_nm:'Emission_nm',class:'Class',supplier:'Supplier',catalogNumber:'CatalogNumber',storageTemperature:'StorageTemperature',website:'Website'};
      for(const f of fields){
        if(f.StorageMode!=='column')continue;
        const el=document.getElementById(`v112NewItem_${f.FieldKey}`),raw=el?.value??'';
        const col=f.ColumnName||columnMap[f.FieldKey];if(!col)continue;
        record[col]=f.DataType==='number'?(raw===''?null:Number(raw)):raw;
      }
      try{
        await grist.docApi.applyUserActions([['AddRecord','InventoryItems',null,record]]);
        await loadAll();
        const created=trows('InventoryItems').find(x=>x.Code===code&&x.InventoryType===type);
        if(!created)throw Error('Élément créé mais introuvable après relecture.');
        const attrs=[];
        for(const f of fields){
          if(f.StorageMode==='column')continue;
          const el=document.getElementById(`v112NewItem_${f.FieldKey}`),raw=el?.value??'';
          if(raw==='')continue;
          const a={Item:Number(created.id),InventoryType:type,FieldKey:f.FieldKey,Source:'Ajout manuel'};
          if(f.DataType==='number')a.ValueNumber=Number(raw);
          else if(f.DataType==='date')a.ValueDate=Date.parse(`${raw}T00:00:00`)/1000;
          else if(f.DataType==='bool')a.ValueBool=raw==='true';
          else a.ValueText=raw;
          attrs.push(a);
        }
        const actions=[];
        if(attrs.length){
          const cols=[...new Set(attrs.flatMap(Object.keys))];
          const vals=Object.fromEntries(cols.map(c=>[c,attrs.map(a=>a[c]??null)]));
          actions.push(['BulkAddRecord','InventoryAttributes',Array(attrs.length).fill(null),vals]);
        }
        actions.push(['AddRecord','InventoryHistory',null,{Date:Date.now()/1000,InventoryType:type,Action:'Ajout manuel',EntityType:'Item',EntityCode:code,Details:name,User:'Grist'}]);
        await grist.docApi.applyUserActions(actions);
        closeModal();await loadAll();
        ns.inventorySelected[type]=Number(created.id);ns.inventoryView[type]='detail';
        toast(`${cfg.SingularName||'Élément'} ajouté.`);renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

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

  function itemDocuments(type,item){
    if(typeof item.id!=='number') return [];
    return trows('InventoryDocuments').filter(x=>Number(x.Item)===Number(item.id) && x.InventoryType===type);
  }

  function itemNotes(type,item){
    if(typeof item.id!=='number') return [];
    return trows('InventoryNotes').filter(x=>Number(x.Item)===Number(item.id) && x.InventoryType===type);
  }

  function itemHistory(type,item,units){
    const codes=new Set([item.code,...units.map(u=>u.code)]);
    return trows('InventoryHistory').filter(x=>x.InventoryType===type && (codes.has(x.EntityCode)||x.EntityCode===type)).slice().reverse();
  }

  function humanDate(v){
    if(v===null||v===undefined||v==='')return '—';
    try{
      const n=Number(v);
      const d=Number.isFinite(n) ? new Date(n>1e12?n:n*1000) : new Date(v);
      if(Number.isNaN(d.getTime()))return String(v);
      return d.toLocaleDateString('fr-FR');
    }catch(_){return String(v);}
  }

  function renderItemDetail(type,data,cfg){
    const item=selectedItem(data,type);
    if(!item){ ns.inventoryView[type]='list'; renderInventory(type); return; }
    const units=data.units.filter(u=>u.itemCode===item.code);
    const candidateUnits=data.units.filter(u=>!u.itemCode&&u.candidateItemCode===item.code);
    const fields=ns.fieldsFor?.(type)||[];
    const attrs=item.attributes||{};
    const docs=itemDocuments(type,item),notes=itemNotes(type,item),hist=itemHistory(type,item,units);
    const tab=ns.inventoryDetailTab[type]||'overview';

    let body='';
    if(tab==='vials'){
      body=`<div class="card card-pad">
        <div class="row space-between"><h3 class="section-title">Vials / unités</h3>${data.mode==='grist'?'<button class="btn btn-primary" id="v112AddUnitFromItem">+ Ajouter un vial</button>':''}</div>
        ${units.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Remplissage</th><th>Volume</th><th>Statut</th><th>Localisation</th><th></th></tr></thead><tbody>
          ${units.map(u=>{const loc=unitLocation(data,u);return `<tr><td>${er(u.code)}</td><td>${er(u.fillStatus||'—')}</td><td>${u.estimatedVolume_uL===null||u.estimatedVolume_uL===undefined?'—':`${er(u.estimatedVolume_uL)} µL`}</td><td>${er(u.status||'—')}</td><td>${er(loc||'—')}</td><td>${loc?`<button class="btn btn-sm" data-v112-locate="${er(u.code)}">Voir dans le stockage</button>`:''}</td></tr>`}).join('')}
        </tbody></table></div>`:'<div class="empty">Aucun vial relié.</div>'}
        ${candidateUnits.length?`<p class="subtitle" style="margin-top:12px">${candidateUnits.length} rapprochement(s) supplémentaire(s) restent à valider.</p>`:''}
      </div>`;
    }else if(tab==='documents'){
      body=`<div class="card card-pad">
        <div class="row space-between"><h3 class="section-title">Documents</h3>${data.mode==='grist'?'<button class="btn btn-primary" id="v112AddDocument">+ Ajouter un document</button>':''}</div>
        ${docs.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Titre</th><th>Type</th><th>Notes</th><th></th></tr></thead><tbody>${docs.map(d=>`<tr><td>${er(d.Title||'Document')}</td><td>${er(d.Type||'—')}</td><td>${er(d.Notes||'')}</td><td>${d.Link?`<a class="btn btn-sm" href="${er(d.Link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucun document associé.</div>'}
      </div>`;
    }else if(tab==='notes'){
      body=`<div class="card card-pad">
        <div class="row space-between"><h3 class="section-title">Notes</h3>${data.mode==='grist'&&state.tables.includes('InventoryNotes')?'<button class="btn btn-primary" id="v112AddNote">+ Ajouter une note</button>':''}</div>
        ${notes.length?`<div class="v112-note-list">${notes.slice().reverse().map(n=>`<article class="v112-note-card"><div class="row space-between"><b>${er(n.Author||'Laboratoire')}</b><small>${er(humanDate(n.Date))}</small></div><p>${er(n.Text||'')}</p>${n.AttachmentLink?`<a class="btn btn-sm" href="${er(n.AttachmentLink)}" target="_blank" rel="noopener noreferrer">Pièce jointe ↗</a>`:''}</article>`).join('')}</div>`:'<div class="empty">Aucune note.</div>'}
      </div>`;
    }else if(tab==='history'){
      body=`<div class="card card-pad"><h3 class="section-title">Historique</h3>
        ${hist.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Élément</th><th>Détails</th></tr></thead><tbody>${hist.map(h=>`<tr><td>${er(humanDate(h.Date))}</td><td>${er(h.Action||'')}</td><td>${er(h.EntityCode||'')}</td><td>${er(h.Details||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucun historique associé.</div>'}
      </div>`;
    }else{
      body=`<div class="split">
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
            <dt>Commentaires</dt><dd>${er(item.comments||'—')}</dd>
          </dl>
          ${item.website?`<a class="btn" href="${er(item.website)}" target="_blank" rel="noopener noreferrer">Fiche fournisseur ↗</a>`:''}
        </div>
        <div class="card card-pad"><h3 class="section-title">Stock</h3>
          <p><span class="pill ${units.length?'ok':'neutral'}">${units.length} vial(s) relié(s)</span> ${candidateUnits.length?`<span class="pill warn">${candidateUnits.length} rapprochement(s) à valider</span>`:''}</p>
          ${units.length?`<table class="table"><thead><tr><th>Code</th><th>État</th><th>Position</th></tr></thead><tbody>${units.slice(0,8).map(u=>`<tr><td>${er(u.code)}</td><td>${er(u.status||u.fillStatus||'')}</td><td>${er(unitLocation(data,u)||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun vial relié.</div>'}
          <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" id="v112SuggestSlot">Suggérer une position</button>${data.mode==='grist'?'<button class="btn btn-primary" id="v112AddUnitFromItem">+ Ajouter un vial</button>':''}</div>
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
    }

    content.innerHTML=`<div class="row space-between">
      <div><button class="btn btn-sm" id="v112BackList">← Liste</button><h1 class="page-title" style="margin-top:12px">${er(item.name)}</h1>
      <p class="subtitle">${er(item.supplier||'')} ${item.catalogNumber?`· Réf. ${er(item.catalogNumber)}`:''}</p></div>
    </div>
    <div class="tabs v112-detail-tabs">
      <div class="tab ${tab==='overview'?'active':''}" data-v112-detail-tab="overview">Vue d'ensemble</div>
      <div class="tab ${tab==='vials'?'active':''}" data-v112-detail-tab="vials">Vials (${units.length})</div>
      <div class="tab ${tab==='documents'?'active':''}" data-v112-detail-tab="documents">Documents (${docs.length})</div>
      <div class="tab ${tab==='notes'?'active':''}" data-v112-detail-tab="notes">Notes (${notes.length})</div>
      <div class="tab ${tab==='history'?'active':''}" data-v112-detail-tab="history">Historique</div>
    </div>
    ${body}`;

    $('#v112BackList').onclick=()=>{ns.inventoryView[type]='list';ns.inventorySelected[type]=null;ns.inventoryDetailTab[type]='overview';renderInventory(type);};
    document.querySelectorAll('[data-v112-detail-tab]').forEach(t=>t.onclick=()=>{ns.inventoryDetailTab[type]=t.dataset.v112DetailTab;renderInventory(type);});
    $('#v112SuggestSlot')?.addEventListener('click',()=>suggestPositionForItem(type,data,item));
    $('#v112AddUnitFromItem')?.addEventListener('click',()=>addUnitFromItem(type,data,item));
    document.querySelectorAll('[data-v112-locate]').forEach(b=>b.onclick=()=>{
      const u=data.units.find(x=>x.code===b.dataset.v112Locate);
      const pos=data.positions.find(x=>x.unitCode===u?.code);
      if(!pos)return;
      ns.inventoryView[type]='storage';
      const st=storageState(type);st.containerCode=pos.containerCode;st.slot=pos.slot;st.view='2d';
      renderInventory(type);
    });
    $('#v112AddDocument')?.addEventListener('click',()=>showAddInventoryDocument(type,item));
    $('#v112AddNote')?.addEventListener('click',()=>showAddInventoryNote(type,item));
  }

  function showAddInventoryDocument(type,item){
    modal(`<h2>Ajouter un document</h2>
      <div class="field"><label>Titre</label><input id="v112DocTitle"></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Type</label><input id="v112DocType" placeholder="Datasheet, publication, protocole…"></div>
        <div class="field"><label>Lien</label><input id="v112DocLink" type="url"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Notes</label><textarea id="v112DocNotes"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112DocCancel">Annuler</button><button class="btn btn-primary" id="v112DocSave">Ajouter</button></div>`);
    $('#v112DocCancel').onclick=closeModal;
    $('#v112DocSave').onclick=async()=>{
      const title=$('#v112DocTitle').value.trim();if(!title)return toast('Titre requis.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','InventoryDocuments',null,{Item:Number(item.id),InventoryType:type,Title:title,Type:$('#v112DocType').value.trim(),Link:$('#v112DocLink').value.trim(),Notes:$('#v112DocNotes').value.trim()}]]);
        closeModal();await loadAll();toast('Document ajouté.');renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
  }

  function showAddInventoryNote(type,item){
    modal(`<h2>Ajouter une note</h2>
      <div class="field"><label>Auteur</label><input id="v112NoteAuthor" value="Laboratoire"></div>
      <div class="field" style="margin-top:12px"><label>Note</label><textarea id="v112NoteText"></textarea></div>
      <div class="field" style="margin-top:12px"><label>Lien / pièce jointe</label><input id="v112NoteLink" type="url"></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v112NoteCancel">Annuler</button><button class="btn btn-primary" id="v112NoteSave">Ajouter</button></div>`);
    $('#v112NoteCancel').onclick=closeModal;
    $('#v112NoteSave').onclick=async()=>{
      const text=$('#v112NoteText').value.trim();if(!text)return toast('Note vide.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','InventoryNotes',null,{Item:Number(item.id),InventoryType:type,Date:Date.now()/1000,Author:$('#v112NoteAuthor').value.trim(),Text:text,AttachmentLink:$('#v112NoteLink').value.trim()}]]);
        closeModal();await loadAll();toast('Note ajoutée.');renderInventory(type);
      }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
    };
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
      const color=data.type===MANIFEST_TYPE?secondaryColor(item,unit):(palette[host]?.color||palette.unknown?.color||'#d4dce3');
      slots.set(parts.slot,{
        ...p,...parts,Slot:parts.slot,Vial:unit?.code||'',occupied:!!unit,vial:unit,antibody:item,
        host,color,label:item?.name||unit?.cleanLabel||unit?.rawLabel||unit?.code||(unit?'Vial non relié':'Libre'),
        source:unit?.rawLabel||'',blocked:!unit && p.available===false
      });
    }
    return {
      ...container,id:container.id,Name:container.name,
      Temperature:Number.isFinite(container.temperatureNumeric)?container.temperatureNumeric:Number(String(container.temperature||'').match(/-?\d+/)?.[0]||0),
      DisplayTemperature:container.temperature,Rows:container.rows,Columns:container.columns,
      GridOrientation:container.gridOrientation||defaultContainerOrientation(container.code,container.notes||''),
      Subtitle:container.subtitle||'',slots,
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
    const unitLabel=cfg.UnitLabel||'unité';
    const vialLike=/vial|flacon/i.test(String(unitLabel));
    const displayUnit=vialLike?'flacon':String(unitLabel).toLowerCase();
    const subject=type===MANIFEST_TYPE?'anticorps secondaire':(cfg.SingularName||'élément').toLowerCase();
    const located=data.positions.filter(p=>p.unitCode).length;
    const totalCapacity=data.containers.reduce((n,c)=>n+Number(c.rows||10)*Number(c.columns||10),0);

    content.innerHTML=`
      <div class="v112-storage-hero">
        <div>
          <div class="v112-storage-kicker">STOCKAGE DU LABORATOIRE</div>
          <h1 class="page-title">Chaque ${er(displayUnit)} à sa place.</h1>
          <p class="subtitle">Explore les boîtes, retrouve un ${er(subject)} et organise son emplacement.</p>
        </div>
        <div class="v112-storage-total"><strong>${located}</strong><span>${er(displayUnit)}${located>1?'s':''} localisé${located>1?'s':''}<br>dans les boîtes</span></div>
      </div>
      ${importBanner(type,data)}
      <div class="v112-storage-box-row">
        ${data.containers.map(c=>{
          const b=buildBox(data,c),pct=b.capacity?Math.round(b.occupied/b.capacity*100):0;
          return `<button class="v112-storage-box-card ${c.code===container.code?'active':''}" data-v112-box="${er(c.code)}">
            <span class="v112-storage-box-icon">▦</span>
            <span class="v112-storage-box-body">
              <strong>${er(c.name)}</strong>
              <small>${b.occupied} / ${b.capacity} positions occupées · ${er(c.temperature||'Température non renseignée')}</small>
              ${b.Subtitle?`<em>${er(b.Subtitle)}</em>`:''}
              <span class="v112-progress"><i style="width:${pct}%"></i></span>
            </span>
            <span class="v112-chevron">›</span>
          </button>`;
        }).join('')}
      </div>
      <section class="card v112-storage-main v112-storage-primarylike">
        <div class="v112-storage-toolbar">
          <div>
            <h2>${er(container.name)}</h2>
            <p>${er(container.temperature)} · ${box.occupied}/${box.capacity} positions occupées${box.Subtitle?` · ${er(box.Subtitle)}`:''}</p>
          </div>
          <div class="row v112-storage-actions">
            <button class="btn" id="v112ToggleOpen" ${st.view==='3d'&&can3d?'':'disabled'}>${st.opened===false?'Ouvrir la boîte':'Fermer la boîte'}</button>
            <button class="btn ${st.view==='3d'?'btn-primary':''}" data-v112-storage-view="3d" ${can3d?'':'disabled'}>Vue 3D</button>
            <button class="btn ${st.view==='2d'?'btn-primary':''}" data-v112-storage-view="2d">Vue 2D</button>
          </div>
        </div>
        <div class="v112-workbench">
          <div class="v112-view-host">
            <div id="v112Scene" class="${st.view==='3d'?'':'hidden'}"></div>
            <div id="v112Grid" class="${st.view==='2d'?'':'hidden'}"></div>
            <div id="v112Hover" class="v112-hover">${er(st.hover||'')}</div>
          </div>
          <aside id="v112UnitPanel" class="v112-unit-panel"></aside>
        </div>
        <div class="v112-storage-footer">
          <div class="v112-storage-legend">${storageLegend(data,box)}</div>
          <div class="row">
            <button class="btn btn-sm" id="v112Recenter" ${st.view==='3d'&&can3d?'':'disabled'}>↗ Recentrer</button>
            <button class="btn btn-sm" id="v112Perspective" ${st.view==='3d'&&can3d?'':'disabled'}>Perspective</button>
            <button class="btn btn-sm" id="v112TopView" ${st.view==='3d'&&can3d?'':'disabled'}>Vue du dessus</button>
          </div>
        </div>
      </section>
      <p class="v112-storage-footnote">${located} ${er(displayUnit)}${located>1?'s':''} positionné${located>1?'s':''} sur ${totalCapacity} emplacements disponibles dans cet inventaire.</p>`;

    $('#v112ImportSecondary')?.addEventListener('click',showSecondaryImport);
    document.querySelectorAll('[data-v112-box]').forEach(b=>b.onclick=()=>{
      st.containerCode=b.dataset.v112Box;st.slot=null;st.opened=true;renderGenericStorage(type,data,cfg);
    });
    document.querySelectorAll('[data-v112-storage-view]').forEach(b=>b.onclick=()=>{
      st.view=b.dataset.v112StorageView;renderGenericStorage(type,data,cfg);
    });
    $('#v112ToggleOpen')?.addEventListener('click',()=>{
      st.opened=st.opened===false?true:false;
      ns.genericScene?.setOpen?.(st.opened);
      const btn=$('#v112ToggleOpen');if(btn)btn.textContent=st.opened?'Fermer la boîte':'Ouvrir la boîte';
    });
    $('#v112Recenter')?.addEventListener('click',()=>ns.genericScene?.fit?.());
    $('#v112Perspective')?.addEventListener('click',()=>ns.genericScene?.fit?.('perspective'));
    $('#v112TopView')?.addEventListener('click',()=>ns.genericScene?.fit?.('top'));

    renderGenericGrid(type,data,box);
    renderUnitPanel(type,data,box);
    if(st.view==='3d'&&can3d) void mountGenericScene(type,data,box);
  }

  function renderGenericGrid(type,data,box){
    const host=$('#v112Grid'); if(!host) return;
    const st=storageState(type);
    const horizontalLetters=box.GridOrientation==='letters-columns';
    let html='';
    if(horizontalLetters){
      html=`<div class="v112-slot-grid v112-slot-grid-excel" style="grid-template-columns:34px repeat(${box.Rows},minmax(0,1fr))"><span></span>`;
      for(let c=0;c<box.Rows;c++) html+=`<span class="coordinate">${String.fromCharCode(65+c)}</span>`;
      for(let r=1;r<=box.Columns;r++){
        html+=`<span class="coordinate">${r}</span>`;
        for(let c=0;c<box.Rows;c++){
          const slot=String.fromCharCode(65+c)+r;
          const p=box.slots.get(slot);
          html+=storageSlotButton(slot,p,st);
        }
      }
    }else{
      html=`<div class="v112-slot-grid" style="grid-template-columns:34px repeat(${box.Columns},minmax(0,1fr))"><span></span>`;
      for(let c=1;c<=box.Columns;c++) html+=`<span class="coordinate">${c}</span>`;
      for(let r=0;r<box.Rows;r++){
        html+=`<span class="coordinate">${String.fromCharCode(65+r)}</span>`;
        for(let c=0;c<box.Columns;c++){
          const slot=String.fromCharCode(65+r)+(c+1);
          const p=box.slots.get(slot);
          html+=storageSlotButton(slot,p,st);
        }
      }
    }
    host.innerHTML=html+'</div>';
    host.querySelectorAll('[data-v112-slot]').forEach(b=>b.onclick=()=>selectStorageSlot(type,data,box,b.dataset.v112Slot));
  }

  function storageSlotButton(slot,p,st){
    const item=p?.antibody,u=p?.vial;
    const short=item?.fluorophore||u?.detectedFluorophore||'';
    const label=p?.occupied?(u?.rawLabel||p.label):p?.blocked?'Indisponible':p?'Libre':'Absente';
    return `<button data-v112-slot="${er(slot)}" class="${slot===st.slot?'selected ':''}${p?.occupied?'occupied ':''}${!p?'missing':''}"
      ${!p?'disabled':''} style="${p?.occupied?`--slot-color:${p.color}`:''}" title="${er(label)}">
      <b>${er(slot)}</b>${short?`<span class="v112-slot-fluor">${er(short)}</span>`:''}<small>${er(label)}</small>
    </button>`;
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
      const adapted=sceneBoxForOrientation(box);
      const scene=mod.mountScene(el,adapted.sceneBox,
        slot=>selectStorageSlot(type,data,box,slot),
        text=>{const st=storageState(type);st.hover=text;const h=$('#v112Hover');if(h)h.textContent=text;}
      );
      ns.genericScene={
        ...scene,
        select(rawSlot){ scene.select(adapted.rawToScene.get(rawSlot)||rawSlot); },
        fit(view){ scene.fit(view); },
        setOpen(value){ scene.setOpen(value); },
        dispose(){ scene.dispose(); }
      };
      const st=storageState(type);
      ns.genericScene.setOpen(st.opened!==false);
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
      panel.innerHTML='<p class="v112-eyebrow">FICHE DU FLACON</p><div class="v112-panel-empty"><span>⌖</span><h2>Sélectionne un flacon</h2><p>Clique sur la boîte ou sur le plan pour consulter son contenu.</p></div>';
      return;
    }
    if(!p.occupied){
      panel.innerHTML=`<p class="v112-eyebrow">EMPLACEMENT ${er(p.Slot)}</p><h2>${p.blocked?'Position indisponible':'Position libre'}</h2>
        <p class="subtitle">${er(box.Name)} · ${er(box.DisplayTemperature)}</p>
        <dl class="detail-list v112-panel-list">
          <dt>Position</dt><dd>${er(p.Slot)}</dd><dt>Boîte</dt><dd>${er(box.Name)}</dd>
          <dt>Température</dt><dd>${er(box.DisplayTemperature||'—')}</dd><dt>Rack</dt><dd>${er(box.rack||'Sans rack')}</dd>
        </dl>
        ${data.mode==='grist'&&!p.blocked?'<button class="btn btn-primary" id="v112AddHere">+ Ajouter un vial ici</button>':'<div class="banner">Mode aperçu : aucune écriture.</div>'}`;
      $('#v112AddHere')?.addEventListener('click',()=>showAddGenericUnit(type,data,box,p));
      return;
    }
    const u=p.vial,item=p.antibody;
    const matchLabel=u.matchStatus==='auto'||u.matchStatus==='validated'?'Correspondance validée':u.matchStatus==='review'?'À valider':u.matchStatus==='other_reagent'?'Autre réactif':'Non résolu';
    const matchClass=u.matchStatus==='auto'||u.matchStatus==='validated'?'ok':u.matchStatus==='review'?'warn':'neutral';
    const labWB=item?.attributes?.labWB||'';
    const labIF=item?.attributes?.labImmunostaining||'';
    panel.innerHTML=`<p class="v112-eyebrow">FICHE DU FLACON · ${er(p.Slot)}</p>
      <div class="v112-vial-dot" style="--vial-color:${p.color}"></div>
      <h2>${er(item?.name||u.cleanLabel||u.rawLabel||u.code)}</h2>
      <p class="subtitle">${er(u.code)}</p>
      <p><span class="pill ${matchClass}">${er(matchLabel)}</span> ${u.fillStatus?`<span class="pill neutral">${er(u.fillStatus)}</span>`:''}</p>
      <dl class="detail-list v112-panel-list">
        <dt>Libellé boîte</dt><dd>${er(u.rawLabel||'—')}</dd>
        <dt>Cible</dt><dd>${er(item?.targetSpecies||u.detectedTargetSpecies||'—')}</dd>
        <dt>Fluorophore</dt><dd>${er(item?.fluorophore||u.detectedFluorophore||'—')}</dd>
        <dt>Ex / Em</dt><dd>${er(item?.excitation_nm??'—')} / ${er(item?.emission_nm??'—')} nm</dd>
        <dt>Hôte</dt><dd>${er(item?.hostSpecies||u.detectedHost||'—')}</dd>
        <dt>Classe</dt><dd>${er(item?.class||'—')}</dd>
        <dt>Référence</dt><dd>${er(item?.catalogNumber||'—')}</dd>
        <dt>Fournisseur</dt><dd>${er(item?.supplier||'—')}</dd>
        <dt>Remplissage</dt><dd>${er(u.fillStatus||'Inconnu')}</dd>
        <dt>Volume</dt><dd>${u.estimatedVolume_uL===null||u.estimatedVolume_uL===undefined?'Non renseigné':`${er(u.estimatedVolume_uL)} µL`}</dd>
        <dt>Statut</dt><dd>${er(u.status||'—')}</dd>
        <dt>Date / lot</dt><dd>${er(u.dateLabel||u.dateReceived||'—')}</dd>
        <dt>Position</dt><dd>${er(p.Slot)}</dd>
        <dt>Boîte</dt><dd>${er(box.Name)}</dd>
        <dt>Température</dt><dd>${er(box.DisplayTemperature||'—')}</dd>
        <dt>Rack</dt><dd>${er(box.rack||'Sans rack')}</dd>
        <dt>Validation WB</dt><dd>${er(labWB||'—')}</dd>
        <dt>Validation IF/IHC</dt><dd>${er(labIF||'—')}</dd>
        <dt>Score rapprochement</dt><dd>${u.matchScore===null||u.matchScore===undefined?'—':er(u.matchScore)}</dd>
      </dl>
      ${u.candidateItem&&!u.item?`<div class="banner"><b>Candidat :</b> ${er(u.candidateItem.name)} · ${er(u.candidateItem.catalogNumber||'sans référence')}<br>${er((u.matchIssues||[]).join(' · '))}</div>`:''}
      <div class="v112-panel-actions">
        ${item?`<button class="btn btn-primary" id="v112OpenItem">Voir la fiche ${er((typeConfig(type)?.SingularName||'élément').toLowerCase())}</button>`:''}
        ${item?.website?`<a class="btn" href="${er(item.website)}" target="_blank" rel="noopener noreferrer">Fiche fournisseur ↗</a>`:''}
        ${data.mode==='grist'?`
          <button class="btn" id="v112EditUnit">Modifier le vial</button><button class="btn" id="v112MoveUnit">Déplacer le flacon</button>
          ${/vide/i.test(u.status||u.fillStatus||'')?'<button class="btn btn-danger" id="v112RemoveUnit">Confirmer le retrait physique</button>':'<button class="btn btn-danger" id="v112EmptyUnit">Marquer comme vide</button>'}
        `:''}
      </div>
      <p class="v112-panel-note">${data.mode==='grist'?'Les modifications sont enregistrées dans Grist et InventoryHistory.':'Aperçu Excel : aucune modification n’est écrite dans Grist.'}</p>`;
    $('#v112OpenItem')?.addEventListener('click',()=>{
      ns.inventorySelected[type]=item.id;ns.inventoryView[type]='detail';renderInventory(type);
    });
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
    const storageFields=['GridOrientation','StorageProfile','DisplayStyle','Subtitle'];
    const unitFields=['DetectedHost','DetectedTargetSpecies','DetectedFluorophore','StockMarker','DateLabel'];
    if(!tableHasFields('InventoryContainers',storageFields)||!tableHasFields('InventoryUnits',unitFields)){
      throw Error('La structure v11.2 doit être complétée avant cet import. Va dans Administration > Vérifier la structure v11.2.');
    }
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
      GridOrientation:c.gridOrientation||defaultContainerOrientation(c.code,''),StorageProfile:'secondary_antibody',
      DisplayStyle:'box-grid',Subtitle:c.subtitle||'',
      Notes:`Source : ${c.sourceSheet} / ${c.sourceRegion} | Layout:${c.gridOrientation||defaultContainerOrientation(c.code,'')} | Subtitle:${c.subtitle||''}`,Active:true
    })));
    const boxes=trows('InventoryContainers').filter(x=>x.InventoryType==='secondary_antibody');
    const boxByCode=new Map(boxes.map(x=>[x.Code,x]));

    await bulkAddMissing('InventoryUnits',m.units.map(u=>({
      Code:u.code,InventoryType:'secondary_antibody',
      Item:u.itemCode?Number(itemByCode.get(u.itemCode)?.id||0):0,
      FillStatus:'Inconnu',EstimatedVolume_uL:null,Status:u.status,Comments:(u.matchIssues||[]).join(' · '),
      RawLabel:u.rawLabel,MatchStatus:u.matchStatus,MatchScore:u.matchScore??null,CandidateItemCode:u.candidateItemCode||'',
      DetectedHost:u.detectedHost||'',DetectedTargetSpecies:u.detectedTargetSpecies||'',DetectedFluorophore:u.detectedFluorophore||'',
      StockMarker:u.stockMarker===true,DateLabel:u.dateLabel||'',
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