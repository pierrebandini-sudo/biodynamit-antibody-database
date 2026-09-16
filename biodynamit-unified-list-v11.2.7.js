/* BioDynaMit v11.2.7 — unified antibody lists + interactive QC/reconciliation.
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
  const VERSION = '11.2.7';
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

  ns.qcFilter=ns.qcFilter||{primary:false,secondary:false};

  function isPendingSecondaryUnit(u){
    const ms=String(u.matchStatus||'').toLowerCase();
    if(ms==='validated') return false;
    if(u.status==='À réconcilier') return true;
    if(/review|unresolved/.test(ms)) return true;
    // Imported "other_reagent" records remain pending until the lab confirms them.
    // Once confirmed we keep MatchStatus=other_reagent but set Status=En stock.
    if(ms==='other_reagent' && u.status!=='En stock') return true;
    return false;
  }

  function pendingSecondaryUnits(data){
    return data.units.filter(isPendingSecondaryUnit);
  }

  function pendingForSecondaryItem(item,data){
    return pendingSecondaryUnits(data).filter(u=>
      String(u.candidateItemCode||'')===String(item.code) ||
      String(u.itemCode||'')===String(item.code) ||
      String(u.itemId||'')===String(item.id)
    );
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
    const pending=pendingForSecondaryItem(item,data).length;

    if(pending>0){
      return {label:`${pending} à valider`,cl:'warn',detail:`${pending} vial(s) nécessitent une réconciliation.`,countable:true,reconcile:true};
    }

    const missing=[];
    if(!String(item.catalogNumber||'').trim())missing.push('référence');
    if(!String(item.supplier||'').trim())missing.push('fournisseur');
    if(!String(item.hostSpecies||'').trim())missing.push('hôte');
    if(!String(item.targetSpecies||item.target||'').trim())missing.push('cible');
    if(missing.length>=2){
      return {label:'À compléter',cl:'neutral',detail:`Informations incomplètes : ${missing.join(', ')}.`,countable:true,reconcile:false};
    }

    if(linked===0){
      return {label:'Non relié',cl:'neutral',detail:'Aucun vial actuellement relié à cette référence.',countable:false,reconcile:false};
    }
    return {label:'Validé',cl:'ok',detail:'Référence et vials reliés sans réconciliation en attente.',countable:false,reconcile:false};
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
      control:pendingSecondaryUnits(d).length
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
      <td class="u126-col-qc">
        ${r.kind==='secondary' && q.reconcile
          ? `<button class="pill u125-qc-pill ${er(q.cl)} u127-qc-action" data-u127-qc="${er(r.id)}" title="${safeTitle(q.detail)}">${er(q.label)}</button>`
          : `<span class="pill u125-qc-pill ${er(q.cl)}" title="${safeTitle(q.detail)}">${er(q.label)}</span>`}
      </td>
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


  /* ---------------------------------------------------------------------- */
  /* Secondary reconciliation center                                         */
  /* ---------------------------------------------------------------------- */

  const QC={scopeItemId:null,cursor:0};

  function secondaryCandidateFor(u,data){
    if(!u?.candidateItemCode)return null;
    return data.items.find(i=>String(i.code)===String(u.candidateItemCode))||null;
  }

  function secondaryLocationForUnit(u,data){
    const p=data.positions.find(x=>String(x.unitCode||'')===String(u.code));
    const box=p?data.containers.find(c=>String(c.code)===String(p.containerCode)):null;
    return {position:p,box};
  }

  function fieldCompare(label,detected,candidate){
    const a=String(detected||'').trim(),b=String(candidate||'').trim();
    const same=a&&b&&norm(a)===norm(b);
    const mismatch=a&&b&&!same;
    const cl=same?'ok':mismatch?'bad':'neutral';
    return `<div class="u127-compare-row">
      <span>${er(label)}</span>
      <b class="${cl}">${er(a||'—')}</b>
      <span class="u127-arrow">→</span>
      <b class="${cl}">${er(b||'—')}</b>
    </div>`;
  }

  async function refreshSecondaryTables(){
    if(!state.connected)return;
    for(const name of ['InventoryItems','InventoryUnits','InventoryPositions','InventoryContainers','InventoryHistory']){
      if(!state.tables.includes(name))continue;
      const table=await grist.docApi.fetchTable(name);
      state.data[name]=table;
      ns.data=ns.data||{};
      ns.data[name]=table;
    }
  }

  function historyAction(action,u,details){
    if(!state.tables.includes('InventoryHistory'))return null;
    return ['AddRecord','InventoryHistory',null,{
      Date:Date.now()/1000,
      InventoryType:SEC,
      Action:action,
      EntityType:'InventoryUnit',
      EntityCode:u.code||'',
      Details:details||'',
      User:'Grist'
    }];
  }

  function appendResolutionComment(u,text){
    const old=String(u.raw?.Comments||u.comments||'').trim();
    const stamp=`[Réconciliation] ${text}`;
    return old?`${old}\n${stamp}`:stamp;
  }

  async function applyUnitResolution(u,updates,action,details){
    if(!state.connected)return toast('Connexion Grist requise.');
    const actions=[['UpdateRecord','InventoryUnits',Number(u.id),updates]];
    const hist=historyAction(action,u,details);
    if(hist)actions.push(hist);
    try{
      await grist.docApi.applyUserActions(actions);
      await refreshSecondaryTables();
      toast('Réconciliation enregistrée.');
      const pending=pendingSecondaryUnits(secondaryData());
      if(!pending.length){
        closeModal();
        ns.qcFilter.secondary=false;
        renderUniversalList('secondary');
        return;
      }
      QC.cursor=Math.min(QC.cursor,pending.length-1);
      renderReconciliationCenter();
    }catch(err){
      console.error(err);
      toast(`Erreur : ${err.message||err}`);
    }
  }

  function nextSecondaryCode(seed='NEW'){
    const data=secondaryData();
    const used=new Set(data.items.map(x=>String(x.code||'')));
    const base=`SEC-${String(seed||'NEW').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28)||'NEW'}`;
    if(!used.has(base))return base;
    let i=2,code='';
    do{code=`${base}-${i++}`;}while(used.has(code));
    return code;
  }

  function showCreateReferenceForUnit(u){
    const data=secondaryData();
    const candidate=secondaryCandidateFor(u,data);
    modal(`<div class="u127-create-ref">
      <div class="row space-between" style="align-items:flex-start;gap:12px">
        <div><h2>Créer une nouvelle référence</h2><p class="subtitle">Le vial sera automatiquement relié à cette nouvelle fiche après création.</p></div>
        <span class="pill warn">${er(u.code)}</span>
      </div>
      <div class="u127-source-box"><b>Libellé source</b><span>${er(u.rawLabel||'—')}</span></div>
      <div class="form-grid">
        <div class="field"><label>Nom *</label><input id="u127NewName" value="${er(u.rawLabel||'')}"></div>
        <div class="field"><label>Référence catalogue</label><input id="u127NewRef" value=""></div>
        <div class="field"><label>Fournisseur</label><input id="u127NewSupplier" value="${er(candidate?.supplier||'')}"></div>
        <div class="field"><label>Espèce cible</label><input id="u127NewTarget" value="${er(u.detectedTargetSpecies||'')}"></div>
        <div class="field"><label>Espèce hôte</label><input id="u127NewHost" value="${er(u.detectedHost||'')}"></div>
        <div class="field"><label>Fluorophore</label><input id="u127NewFluor" value="${er(u.detectedFluorophore||'')}"></div>
      </div>
      <p class="u127-help">Ces valeurs proviennent du vial/source Excel lorsqu'elles sont disponibles. Vérifie-les avant validation.</p>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="u127CreateBack">Retour</button>
        <button class="btn btn-primary" id="u127CreateSave">Créer et associer</button>
      </div>
    </div>`);
    $('#u127CreateBack').onclick=renderReconciliationCenter;
    $('#u127CreateSave').onclick=async()=>{
      const name=$('#u127NewName').value.trim();
      if(!name)return toast('Le nom est obligatoire.');
      const code=nextSecondaryCode($('#u127NewRef').value.trim()||name);
      const rec={
        Code:code,InventoryType:SEC,Name:name,Status:'Actif',Active:true,
        Supplier:$('#u127NewSupplier').value.trim(),
        CatalogNumber:$('#u127NewRef').value.trim(),
        Target:'',TargetSpecies:$('#u127NewTarget').value.trim(),
        HostSpecies:$('#u127NewHost').value.trim(),
        Fluorophore:$('#u127NewFluor').value.trim(),
        StorageTemperature:'',Class:'',Website:'',Comments:'Créée depuis le centre de réconciliation.',
        RawTable:'Réconciliation',RawRowId:0
      };
      try{
        $('#u127CreateSave').disabled=true;
        await grist.docApi.applyUserActions([['AddRecord','InventoryItems',null,rec]]);
        await refreshSecondaryTables();
        const created=secondaryData().items.find(i=>String(i.code)===code);
        if(!created)throw Error('La nouvelle référence n’a pas pu être retrouvée.');
        await applyUnitResolution(u,{
          Item:Number(created.id),Status:'En stock',MatchStatus:'validated',
          CandidateItemCode:created.code,
          Comments:appendResolutionComment(u,`nouvelle référence ${created.code} créée et validée`)
        },'Réconciliation — nouvelle référence',`${u.code} → ${created.code} (${created.name})`);
      }catch(err){
        console.error(err);
        $('#u127CreateSave').disabled=false;
        toast(`Erreur : ${err.message||err}`);
      }
    };
  }

  function reconciliationPool(){
    const data=secondaryData();
    let list=pendingSecondaryUnits(data);
    if(QC.scopeItemId!==null && QC.scopeItemId!==undefined){
      const item=data.items.find(i=>String(i.id)===String(QC.scopeItemId));
      if(item)list=list.filter(u=>
        String(u.candidateItemCode||'')===String(item.code) ||
        String(u.itemCode||'')===String(item.code) ||
        String(u.itemId||'')===String(item.id)
      );
    }
    return list;
  }

  function renderReconciliationCenter(){
    const data=secondaryData();
    const list=reconciliationPool();
    if(!list.length){
      closeModal();
      ns.qcFilter.secondary=false;
      renderUniversalList('secondary');
      toast('Aucun cas restant dans ce filtre.');
      return;
    }
    QC.cursor=Math.max(0,Math.min(QC.cursor,list.length-1));
    const u=list[QC.cursor];
    const candidate=secondaryCandidateFor(u,data);
    const {position,box}=secondaryLocationForUnit(u,data);
    const items=data.items.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));
    const score=u.matchScore===null||u.matchScore===undefined?'—':`${Math.round(Number(u.matchScore))}%`;

    modal(`<div class="u127-center">
      <div class="u127-center-head">
        <div>
          <p class="u127-eyebrow">CONTRÔLE QUALITÉ · ANTICORPS SECONDAIRES</p>
          <h2>Réconciliation des vials</h2>
          <p class="subtitle">Cas ${QC.cursor+1} / ${list.length}${QC.scopeItemId!==null?' dans cette référence':''}</p>
        </div>
        <div class="row">
          <button class="btn btn-sm" id="u127Prev" ${QC.cursor===0?'disabled':''}>← Précédent</button>
          <button class="btn btn-sm" id="u127Next" ${QC.cursor>=list.length-1?'disabled':''}>Suivant →</button>
        </div>
      </div>

      <div class="u127-case-grid">
        <section class="card card-pad">
          <h3 class="section-title">Vial source</h3>
          <div class="u127-source-label">${er(u.rawLabel||'Libellé non renseigné')}</div>
          <dl class="detail-list">
            <dt>Code vial</dt><dd>${er(u.code)}</dd>
            <dt>Position</dt><dd>${er(position?.slot||'—')}</dd>
            <dt>Boîte</dt><dd>${er(box?.name||box?.code||'—')}</dd>
            <dt>Source</dt><dd>${er(u.raw?.RawTable||'—')} ${u.raw?.RawCell?`· ${er(u.raw.RawCell)}`:''}</dd>
            <dt>Date / lot</dt><dd>${er(u.dateLabel||'—')}</dd>
            <dt>Score proposé</dt><dd><span class="pill ${Number(u.matchScore)>=80?'ok':'warn'}">${er(score)}</span></dd>
          </dl>
        </section>

        <section class="card card-pad">
          <h3 class="section-title">Détection ↔ proposition</h3>
          <div class="u127-compare-head"><span>Champ</span><span>Détecté</span><span></span><span>Référence proposée</span></div>
          ${fieldCompare('Hôte',u.detectedHost,candidate?.hostSpecies)}
          ${fieldCompare('Espèce cible',u.detectedTargetSpecies,candidate?.targetSpecies||candidate?.target)}
          ${fieldCompare('Fluorophore',u.detectedFluorophore,candidate?.fluorophore)}
          <div class="u127-candidate">
            <b>Proposition actuelle</b>
            ${candidate
              ? `<span>${er(candidate.name)} · ${er(candidate.supplier||'—')} · ${er(candidate.catalogNumber||'—')}</span>`
              : `<span class="u127-no-candidate">Aucune référence candidate fiable</span>`}
          </div>
        </section>
      </div>

      <section class="card card-pad u127-actions">
        <h3 class="section-title">Décision du laboratoire</h3>
        <p class="subtitle">Aucune action n'est automatique. Chaque décision est enregistrée dans InventoryHistory.</p>

        <div class="u127-action-row">
          <button class="btn btn-primary" id="u127ValidateCandidate" ${candidate?'':'disabled'}>✓ Valider la proposition</button>
          <button class="btn" id="u127CreateReference">+ Créer une nouvelle référence</button>
          <button class="btn" id="u127OtherReagent">Autre réactif</button>
        </div>

        <div class="u127-manual-link">
          <label>Ou associer à une autre référence :</label>
          <div class="row">
            <select id="u127ItemSelect">
              <option value="">— Choisir une référence —</option>
              ${items.map(i=>`<option value="${er(i.id)}" ${candidate&&String(i.id)===String(candidate.id)?'selected':''}>${er(i.name)} · ${er(i.supplier||'—')} · ${er(i.catalogNumber||'—')}</option>`).join('')}
            </select>
            <button class="btn" id="u127Associate">Associer</button>
          </div>
        </div>
      </section>

      <div class="u127-center-footer">
        <button class="btn" id="u127Close">Fermer sans décision</button>
        <span>${pendingSecondaryUnits(data).length} cas restant(s) au total</span>
      </div>
    </div>`);

    $('#u127Prev').onclick=()=>{QC.cursor--;renderReconciliationCenter();};
    $('#u127Next').onclick=()=>{QC.cursor++;renderReconciliationCenter();};
    $('#u127Close').onclick=closeModal;
    $('#u127CreateReference').onclick=()=>showCreateReferenceForUnit(u);

    $('#u127ValidateCandidate').onclick=()=>{
      if(!candidate)return;
      applyUnitResolution(u,{
        Item:Number(candidate.id),Status:'En stock',MatchStatus:'validated',
        CandidateItemCode:candidate.code,
        Comments:appendResolutionComment(u,`proposition ${candidate.code} validée`)
      },'Réconciliation — validation',`${u.code} associé à ${candidate.code} (${candidate.name})`);
    };

    $('#u127Associate').onclick=()=>{
      const id=$('#u127ItemSelect').value;
      const item=data.items.find(i=>String(i.id)===String(id));
      if(!item)return toast('Choisis une référence.');
      applyUnitResolution(u,{
        Item:Number(item.id),Status:'En stock',MatchStatus:'validated',
        CandidateItemCode:item.code,
        Comments:appendResolutionComment(u,`association manuelle à ${item.code}`)
      },'Réconciliation — association manuelle',`${u.code} associé manuellement à ${item.code} (${item.name})`);
    };

    $('#u127OtherReagent').onclick=()=>{
      if(!confirm(`Confirmer que « ${u.rawLabel||u.code} » n'est pas un anticorps secondaire à relier à une référence ?`))return;
      applyUnitResolution(u,{
        Item:0,Status:'En stock',MatchStatus:'other_reagent',CandidateItemCode:'',
        Comments:appendResolutionComment(u,'classé comme autre réactif')
      },'Réconciliation — autre réactif',`${u.code} classé comme autre réactif ; aucune référence anticorps associée`);
    };
  }

  function openReconciliationCenter(itemId=null){
    QC.scopeItemId=itemId;
    QC.cursor=0;
    renderReconciliationCenter();
  }

  function renderUniversalList(kind){
    const isPrimary=kind==='primary';
    const title=isPrimary?'Anticorps primaires':'Anticorps secondaires';
    const models=isPrimary?primaryRowsModel():secondaryRowsModel();
    const q=isPrimary?(state.search||''):(ns.inventorySearch?.[SEC]||'');
    const qcOnly=!!ns.qcFilter[kind];
    const baseShown=filtered(models,q);
    const shown=qcOnly
      ? baseShown.filter(r=>isPrimary ? r.quality.countable : r.quality.reconcile)
      : baseShown;
    const m=metricsFor(kind,models);

    topbar(title,topActions(kind));
    content.innerHTML=`<div class="u126-antibody-list" data-u126-kind="${kind}">
      <h1 class="page-title">${title}</h1>
      <p class="subtitle">Inventaire relationnel · affichage universel avec stock et contrôle qualité.</p>

      <div class="grid grid-4 u125-metrics">
        <div class="card card-pad"><div class="metric-value">${m.refs}</div><div class="subtitle">Références</div></div>
        <div class="card card-pad"><div class="metric-value">${m.units}</div><div class="subtitle">Vials</div></div>
        <div class="card card-pad"><div class="metric-value">${m.containers}</div><div class="subtitle">Boîtes / conteneurs</div></div>
        <button class="card card-pad u127-metric-card ${qcOnly?'active':''}" data-u127-toggle-filter>
          <div class="metric-value">${m.control}</div>
          <div class="subtitle">${isPrimary?'À contrôler / enrichir':'À réconcilier'}</div>
          <small>${qcOnly?'Afficher tout':'Cliquer pour filtrer'}</small>
        </button>
      </div>

      <div class="searchbar" style="margin-top:16px">
        <input id="u126Search" value="${er(q)}" placeholder="Nom, cible, spécificité, hôte, fournisseur, référence, qualité…">
        <button class="btn" id="u126Clear">Effacer</button>
      </div>

      ${qcOnly?`<div class="u127-filter-banner">
        <span><b>Filtre actif :</b> ${isPrimary?'fiches à contrôler / enrichir':'références avec vials à réconcilier'}</span>
        <button class="btn btn-sm" data-u127-clear-filter>Tout afficher</button>
      </div>`:''}

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
          ${isPrimary
            ? `<button class="pill ${m.control?'warn':'ok'} u127-summary-action" data-u127-toggle-filter>${m.control} à revoir</button>`
            : `<button class="btn ${m.control?'btn-primary':''} u127-summary-open" data-u127-open-center ${m.control?'':'disabled'}>${m.control?`Ouvrir les ${m.control} cas à revoir`:'Aucun cas à revoir'}</button>`}
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

      document.querySelectorAll('[data-u127-qc]').forEach(btn=>{
        btn.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          openReconciliationCenter(btn.dataset.u127Qc);
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

    document.querySelectorAll('[data-u127-toggle-filter]').forEach(btn=>{
      btn.onclick=()=>{
        ns.qcFilter[kind]=!ns.qcFilter[kind];
        renderUniversalList(kind);
      };
    });
    document.querySelector('[data-u127-clear-filter]')?.addEventListener('click',()=>{
      ns.qcFilter[kind]=false;
      renderUniversalList(kind);
    });
    document.querySelector('[data-u127-open-center]')?.addEventListener('click',()=>{
      if(!isPrimary)openReconciliationCenter(null);
    });
    document.querySelectorAll('[data-u127-qc]').forEach(btn=>{
      btn.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        openReconciliationCenter(btn.dataset.u127Qc);
      };
    });

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
  ns.openSecondaryReconciliation=openReconciliationCenter;
  ns.unifiedListVersion=VERSION;

  // Refresh the current list once this layer is loaded.
  try{
    if(state.route==='antibodies')renderUniversalList('primary');
    else if(String(state.route||'')===`inv:${SEC}` && (ns.inventoryView?.[SEC]||'list')==='list')renderUniversalList('secondary');
  }catch(err){console.warn('v11.2.6 unified list:',err);}
})();
