/* BioDynaMit v11.2.6 — definitive unified antibody lists.
   Primary and secondary antibodies now use the SAME list renderer:
   - identical metrics
   - identical columns
   - identical stock/location behavior
   - identical quality-control column
   - type-specific science is shown only in "Spécificité"
   No schema/data migration.
*/
(function(){
  'use strict';

  const ns = window.BioDynaMitV112 = window.BioDynaMitV112 || {};
  const SEC = 'secondary_antibody';
  const VERSION = '11.2.6';
  const er = v => esc(v ?? '');
  const norm = v => normalizeName(String(v ?? ''));

  function safeTitle(v){ return er(String(v ?? '').replace(/\s+/g,' ').trim()); }

  /* ---------------------------------------------------------------------- */
  /* Shared list model                                                       */
  /* ---------------------------------------------------------------------- */

  function primaryData(){
    const items = rows(state.data.Antibodies);
    const units = rows(state.data.Vials);
    const boxes = rows(state.data.Boxes);
    const positions = rows(state.data.Positions);
    return {items,units,boxes,positions};
  }

  function secondaryData(){
    try{return ns.inventoryData?.(SEC) || {items:[],units:[],containers:[],positions:[]};}
    catch(_){return {items:[],units:[],containers:[],positions:[]};}
  }

  function primaryUnitsFor(a,data){
    return data.units.filter(v=>Number(v.Antibody)===Number(a.id) && norm(v.Status)!=='archive');
  }

  function primaryLocationsFor(a,data){
    const units=primaryUnitsFor(a,data);
    const unitIds=new Set(units.map(v=>Number(v.id)));
    return data.positions.filter(p=>Number(p.Vial)>0 && unitIds.has(Number(p.Vial)));
  }

  function secondaryUnitsFor(item,data){
    return data.units.filter(u=>
      String(u.itemId||'')===String(item.id) ||
      (u.itemCode && String(u.itemCode)===String(item.code))
    );
  }

  function secondaryLocationsFor(item,data){
    const units=secondaryUnitsFor(item,data);
    const codes=new Set(units.map(u=>String(u.code)));
    return data.positions.filter(p=>codes.has(String(p.unitCode||'')));
  }

  function primaryDupMap(items){
    const map=new Map();
    for(const a of items){
      const ref=norm(a.CatalogNumber);
      if(!ref)continue;
      const key=`${norm(a.Supplier)}|${ref}`;
      map.set(key,(map.get(key)||0)+1);
    }
    return map;
  }

  function primaryQuality(a,data,dupMap){
    const missing=[];
    if(!String(a.Name||a.FullName||'').trim())missing.push('nom');
    if(!String(a.CatalogNumber||'').trim())missing.push('référence');
    if(!String(a.Supplier||'').trim())missing.push('fournisseur');
    if(!String(a.HostSpecies||'').trim())missing.push('hôte');

    const key=`${norm(a.Supplier)}|${norm(a.CatalogNumber)}`;
    if(norm(a.CatalogNumber) && (dupMap.get(key)||0)>1){
      return {label:'Doublon ?',cl:'warn',detail:'Même fournisseur + référence présents plusieurs fois.',countable:true};
    }
    if(missing.length){
      return {label:'À compléter',cl:'bad',detail:`Champs essentiels manquants : ${missing.join(', ')}.`,countable:true};
    }

    const enrich=[];
    if(!String(a.Target||'').trim())enrich.push('cible');
    if(!String(a.ApplicationsText||'').trim())enrich.push('applications');
    if(!String(a.Website||'').trim())enrich.push('lien fournisseur');
    if(enrich.length>=2){
      return {label:'À enrichir',cl:'neutral',detail:`Informations optionnelles absentes : ${enrich.join(', ')}.`,countable:true};
    }
    return {label:'Validé',cl:'ok',detail:'Champs essentiels renseignés.',countable:false};
  }

  function secondaryQuality(item,data){
    const units=secondaryUnitsFor(item,data);
    const linked=units.filter(u=>u.item || u.itemId || u.itemCode).length;
    const pending=units.filter(u=>
      u.status==='À réconcilier' ||
      /review|unresolved|other_reagent/.test(String(u.matchStatus||'')) ||
      (!u.itemCode && String(u.candidateItemCode||'')===String(item.code))
    ).length;

    if(pending>0){
      return {label:`${pending} à valider`,cl:'warn',detail:`${pending} vial(s) nécessitent une réconciliation.`,countable:true};
    }

    const missing=[];
    if(!String(item.catalogNumber||'').trim())missing.push('référence');
    if(!String(item.supplier||'').trim())missing.push('fournisseur');
    if(!String(item.hostSpecies||'').trim())missing.push('hôte');
    if(!String(item.targetSpecies||item.target||'').trim())missing.push('cible');
    if(missing.length>=2){
      return {label:'À compléter',cl:'neutral',detail:`Informations incomplètes : ${missing.join(', ')}.`,countable:true};
    }

    if(linked===0){
      return {label:'Non relié',cl:'neutral',detail:'Aucun vial actuellement relié à cette référence.',countable:false};
    }
    return {label:'Validé',cl:'ok',detail:'Référence et vials reliés sans réconciliation en attente.',countable:false};
  }

  function primaryRowsModel(){
    const d=primaryData(),dup=primaryDupMap(d.items);
    return d.items.map(a=>{
      const units=primaryUnitsFor(a,d),locations=primaryLocationsFor(a,d),qc=primaryQuality(a,d,dup);
      return {
        kind:'primary',
        id:Number(a.id),
        item:a,
        name:a.Name||a.FullName||a.CatalogNumber||a.Code||'Sans nom',
        target:a.Target||'',
        specificity:a.ApplicationsText||'',
        specificityTitle:a.ApplicationsText||'Applications non renseignées',
        host:a.HostSpecies||'',
        supplier:a.Supplier||'',
        reference:a.CatalogNumber||'',
        stockCount:units.length,
        locatedCount:locations.length,
        quality:qc,
        search:[a.Name,a.FullName,a.Target,a.ApplicationsText,a.HostSpecies,a.Supplier,a.CatalogNumber,a.Class,a.MolecularWeight,qc.label].join(' ')
      };
    });
  }

  function secondaryRowsModel(){
    const d=secondaryData();
    return d.items.map(i=>{
      const units=secondaryUnitsFor(i,d),locations=secondaryLocationsFor(i,d),qc=secondaryQuality(i,d);
      const fluor=String(i.fluorophore||'').trim();
      const ex=i.excitation_nm, em=i.emission_nm;
      const spectral=(ex!==null&&ex!==undefined&&ex!==''&&em!==null&&em!==undefined&&em!=='') ? `${ex} / ${em} nm` : '';
      const spec=[fluor,spectral].filter(Boolean).join(' · ');
      return {
        kind:'secondary',
        id:i.id,
        item:i,
        name:i.name||i.catalogNumber||i.code||'Sans nom',
        target:i.targetSpecies||i.target||'',
        specificity:spec,
        specificityTitle:[`Fluorophore : ${fluor||'—'}`,`Ex / Em : ${spectral||'—'}`].join(' | '),
        host:i.hostSpecies||'',
        supplier:i.supplier||'',
        reference:i.catalogNumber||'',
        stockCount:units.length,
        locatedCount:locations.length,
        quality:qc,
        search:[i.name,i.targetSpecies,i.target,i.fluorophore,i.excitation_nm,i.emission_nm,i.hostSpecies,i.supplier,i.catalogNumber,qc.label].join(' ')
      };
    });
  }

  function filtered(list,q){
    const n=norm(q);
    if(!n)return list;
    return list.filter(r=>norm(r.search).includes(n));
  }

  function metricsFor(kind,models){
    if(kind==='primary'){
      const d=primaryData();
      return {
        refs:models.length,
        units:d.units.length,
        containers:d.boxes.length,
        control:models.filter(x=>x.quality.countable).length
      };
    }
    const d=secondaryData();
    return {
      refs:models.length,
      units:d.units.length,
      containers:d.containers.length,
      control:d.units.filter(u=>u.status==='À réconcilier'||/review|unresolved|other_reagent/.test(String(u.matchStatus||''))).length
    };
  }

  /* ---------------------------------------------------------------------- */
  /* One renderer for both inventory families                                */
  /* ---------------------------------------------------------------------- */

  function specificityLabel(kind){ return kind==='primary'?'Applications':'Fluorophore / Ex-Em'; }

  function rowHtml(r){
    const q=r.quality;
    const locate = r.locatedCount>0
      ? `<button class="btn btn-sm u126-locate" data-u126-locate="${er(r.kind)}:${er(r.id)}">Voir dans la boîte</button>`
      : '';
    return `<tr data-u126-row="${er(r.kind)}:${er(r.id)}">
      <td class="u126-col-name"><button class="u125-link-btn" data-u126-open="${er(r.kind)}:${er(r.id)}"><b>${er(r.name)}</b></button></td>
      <td class="u126-col-target"><span class="u126-clamp" title="${safeTitle(r.target)}">${er(r.target||'—')}</span></td>
      <td class="u126-col-spec"><span class="u126-clamp" title="${safeTitle(r.specificityTitle)}">${er(r.specificity||'—')}</span></td>
      <td class="u126-col-host"><span class="u126-clamp" title="${safeTitle(r.host)}">${er(r.host||'—')}</span></td>
      <td class="u126-col-supplier"><span class="u126-clamp" title="${safeTitle(r.supplier)}">${er(r.supplier||'—')}</span></td>
      <td class="u126-col-ref"><span class="u126-clamp" title="${safeTitle(r.reference)}">${er(r.reference||'—')}</span></td>
      <td class="u126-col-stock">
        <span class="pill ${r.stockCount?'ok':'neutral'}">${r.stockCount} relié${r.stockCount>1?'s':''}</span>
        ${locate}
      </td>
      <td class="u126-col-qc"><span class="pill u125-qc-pill ${er(q.cl)}" title="${safeTitle(q.detail)}">${er(q.label)}</span></td>
    </tr>`;
  }

  function tableHtml(kind,list){
    if(!list.length)return '<tr><td colspan="8"><div class="empty">Aucun résultat.</div></td></tr>';
    return list.map(rowHtml).join('');
  }

  function topActions(kind){
    if(kind==='primary'){
      return `<div class="row v112-top-actions v112-inventory-switch">
        <button class="btn btn-primary" data-u126-tab="list">Liste</button>
        <button class="btn" data-u126-tab="storage">Stockage</button>
        <button class="btn btn-primary" data-u126-add="primary">+ Ajouter un anticorps primaire</button>
      </div>`;
    }
    return `<div class="row v112-top-actions v112-inventory-switch">
      <button class="btn btn-primary" data-u126-tab="list">Liste</button>
      <button class="btn" data-u126-tab="storage">Stockage</button>
      <button class="btn btn-primary" data-u126-add="secondary">+ Ajouter un anticorps secondaire</button>
    </div>`;
  }

  function renderUniversalList(kind){
    const isPrimary=kind==='primary';
    const title=isPrimary?'Anticorps primaires':'Anticorps secondaires';
    const models=isPrimary?primaryRowsModel():secondaryRowsModel();
    const q=isPrimary?(state.search||''):(ns.inventorySearch?.[SEC]||'');
    const shown=filtered(models,q);
    const m=metricsFor(kind,models);

    topbar(title,topActions(kind));
    content.innerHTML=`<div class="u126-antibody-list" data-u126-kind="${kind}">
      <h1 class="page-title">${title}</h1>
      <p class="subtitle">Inventaire relationnel · affichage universel avec stock et contrôle qualité.</p>

      <div class="grid grid-4 u125-metrics">
        <div class="card card-pad"><div class="metric-value">${m.refs}</div><div class="subtitle">Références</div></div>
        <div class="card card-pad"><div class="metric-value">${m.units}</div><div class="subtitle">Vials</div></div>
        <div class="card card-pad"><div class="metric-value">${m.containers}</div><div class="subtitle">Boîtes / conteneurs</div></div>
        <div class="card card-pad"><div class="metric-value">${m.control}</div><div class="subtitle">${isPrimary?'À contrôler / enrichir':'À réconcilier'}</div></div>
      </div>

      <div class="searchbar" style="margin-top:16px">
        <input id="u126Search" value="${er(q)}" placeholder="Nom, cible, spécificité, hôte, fournisseur, référence, qualité…">
        <button class="btn" id="u126Clear">Effacer</button>
      </div>

      <div class="card table-wrap u126-table-wrap" style="margin-top:14px">
        <table class="table u126-table">
          <colgroup>
            <col class="c-name"><col class="c-target"><col class="c-spec"><col class="c-host">
            <col class="c-supplier"><col class="c-ref"><col class="c-stock"><col class="c-qc">
          </colgroup>
          <thead><tr>
            <th>Nom</th><th>Cible</th><th>${specificityLabel(kind)}</th><th>Hôte</th>
            <th>Fournisseur</th><th>Référence</th><th>Stock</th><th>Contrôle qualité</th>
          </tr></thead>
          <tbody id="u126Body">${tableHtml(kind,shown)}</tbody>
        </table>
      </div>

      <div class="card card-pad u125-quality-summary" style="margin-top:14px">
        <div class="row space-between" style="align-items:flex-start;gap:14px">
          <div>
            <h3 class="section-title">Contrôle qualité & réconciliation</h3>
            <p class="subtitle">${isPrimary
              ? 'Signale les champs essentiels manquants, les doublons de référence et les fiches qui peuvent être enrichies.'
              : 'Signale les vials dont le rapprochement avec une référence doit encore être validé. Aucune correction scientifique n’est appliquée automatiquement.'}</p>
          </div>
          <span class="pill ${m.control?'warn':'ok'}">${m.control} à revoir</span>
        </div>
      </div>
    </div>`;

    const repaint=()=>{
      const models2=isPrimary?primaryRowsModel():secondaryRowsModel();
      const q2=isPrimary?(state.search||''):(ns.inventorySearch?.[SEC]||'');
      $('#u126Body').innerHTML=tableHtml(kind,filtered(models2,q2));
      bindRows();
    };

    const bindRows=()=>{
      document.querySelectorAll('[data-u126-open]').forEach(btn=>{
        btn.onclick=()=>{
          const [k,id]=String(btn.dataset.u126Open).split(':');
          if(k==='primary'){
            state.selectedAntibody=Number(id);
            go('antibody-detail');
          }else{
            ns.inventorySelected[SEC]=id;
            ns.inventoryView[SEC]='detail';
            ns.inventoryDetailTab[SEC]='overview';
            // Call the legacy/generic renderer for detail view.
            if(typeof ns.renderInventory==='function')ns.renderInventory(SEC);
            else go(`inv:${SEC}`);
          }
        };
      });

      document.querySelectorAll('[data-u126-locate]').forEach(btn=>{
        btn.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          const [k,id]=String(btn.dataset.u126Locate).split(':');
          if(k==='primary'){
            const d=primaryData();
            const a=d.items.find(x=>Number(x.id)===Number(id));
            const locs=primaryLocationsFor(a,d);
            if(!locs.length)return;
            const first=locs[0];
            const vial=rows(state.data.Vials).find(v=>Number(v.id)===Number(first.Vial));
            if(vial && typeof window.openBoxForVial==='function')window.openBoxForVial(Number(vial.id));
          }else{
            const d=secondaryData();
            const item=d.items.find(x=>String(x.id)===String(id));
            const locs=secondaryLocationsFor(item,d);
            if(!locs.length)return;
            const p=locs[0];
            ns.inventoryView[SEC]='storage';
            const st=ns.storageState[SEC]=ns.storageState[SEC]||{};
            st.containerCode=p.containerCode;
            st.slot=p.slot;
            st.view='2d';
            if(typeof ns.renderInventory==='function')ns.renderInventory(SEC);
            else go(`inv:${SEC}`);
          }
        };
      });
    };

    $('#u126Search').oninput=e=>{
      if(isPrimary)state.search=e.target.value;
      else ns.inventorySearch[SEC]=e.target.value;
      repaint();
    };
    $('#u126Clear').onclick=()=>{
      if(isPrimary)state.search='';
      else ns.inventorySearch[SEC]='';
      $('#u126Search').value='';
      repaint();
      $('#u126Search').focus();
    };

    document.querySelector('[data-u126-tab="storage"]').onclick=()=>{
      if(isPrimary)go('storage');
      else{
        ns.inventoryView[SEC]='storage';
        if(typeof ns.renderInventory==='function')ns.renderInventory(SEC);
        else go(`inv:${SEC}`);
      }
    };
    document.querySelector('[data-u126-add="primary"]')?.addEventListener('click',()=>ns.showReferenceFirstAntibodyForm?.('primary_antibody'));
    document.querySelector('[data-u126-add="secondary"]')?.addEventListener('click',()=>ns.showReferenceFirstAntibodyForm?.(SEC));

    bindRows();
  }

  /* ---------------------------------------------------------------------- */
  /* Route interception                                                       */
  /* ---------------------------------------------------------------------- */

  const previousRender=render;
  render=function(){
    if(state.route==='antibodies'){
      renderUniversalList('primary');
      return;
    }
    if(String(state.route||'')===`inv:${SEC}` && (ns.inventoryView?.[SEC]||'list')==='list'){
      renderUniversalList('secondary');
      return;
    }
    return previousRender();
  };

  // Ensure direct calls from generic detail/storage "back to list" also land on
  // the universal renderer instead of the older secondary list.
  document.addEventListener('click',e=>{
    if(String(state.route||'')!==`inv:${SEC}`)return;

    const listBtn=e.target.closest?.('[data-v112-view="list"],#v112BackList');
    if(listBtn){
      e.preventDefault();
      e.stopImmediatePropagation();
      ns.inventoryView[SEC]='list';
      ns.inventorySelected[SEC]=null;
      ns.inventoryDetailTab[SEC]='overview';
      renderUniversalList('secondary');
    }
  },true);

  ns.renderUniversalAntibodyList=renderUniversalList;
  ns.unifiedListVersion=VERSION;

  // Refresh the current list once this layer is loaded.
  try{
    if(state.route==='antibodies')renderUniversalList('primary');
    else if(String(state.route||'')===`inv:${SEC}` && (ns.inventoryView?.[SEC]||'list')==='list')renderUniversalList('secondary');
  }catch(err){console.warn('v11.2.6 unified list:',err);}
})();
