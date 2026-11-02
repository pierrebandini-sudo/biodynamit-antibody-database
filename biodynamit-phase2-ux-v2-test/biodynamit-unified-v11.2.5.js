/* BioDynaMit v11.2.5 — universal antibody UX.
   Goals:
   - one list grammar for primary and secondary antibodies;
   - visible quality-control state;
   - one reference-first creation workflow;
   - secondary storage visually aligned with validated primary storage.
   Additive UI only: no schema migration, no legacy storage geometry change.
*/
(function(){
  'use strict';

  const ns = window.BioDynaMitV112 = window.BioDynaMitV112 || {};
  const VERSION = '11.2.5';
  const SEC = 'secondary_antibody';

  const norm = v => normalizeName(String(v ?? ''));
  const er = v => esc(v ?? '');
  const num = v => {
    if(v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  function primaryRows(){ return rows(state.data.Antibodies); }
  function primaryVials(){ return rows(state.data.Vials); }
  function primaryBoxes(){ return rows(state.data.Boxes); }

  function stockCountForPrimary(a){
    return primaryVials().filter(v => Number(v.Antibody) === Number(a.id) && norm(v.Status) !== 'archive').length;
  }

  function primaryDuplicateMap(){
    const map = new Map();
    for(const a of primaryRows()){
      const ref = norm(a.CatalogNumber);
      if(!ref) continue;
      const key = `${norm(a.Supplier)}|${ref}`;
      map.set(key,(map.get(key)||0)+1);
    }
    return map;
  }

  function primaryQC(a, dupMap){
    const critical = [];
    if(!String(a.Name||a.FullName||'').trim()) critical.push('nom');
    if(!String(a.CatalogNumber||'').trim()) critical.push('référence');
    if(!String(a.Supplier||'').trim()) critical.push('fournisseur');
    if(!String(a.HostSpecies||'').trim()) critical.push('hôte');

    const enrich = [];
    if(!String(a.Target||'').trim()) enrich.push('cible');
    if(!String(a.ApplicationsText||'').trim()) enrich.push('applications');
    if(!String(a.Website||'').trim()) enrich.push('lien fournisseur');

    const key = `${norm(a.Supplier)}|${norm(a.CatalogNumber)}`;
    const duplicate = !!norm(a.CatalogNumber) && (dupMap.get(key)||0) > 1;

    if(duplicate) return {key:'duplicate',label:'Doublon ?',cl:'warn',details:'Même fournisseur + référence présents plusieurs fois.'};
    if(critical.length) return {key:'critical',label:'À compléter',cl:'bad',details:`Manque : ${critical.join(', ')}.`};
    if(enrich.length >= 2) return {key:'enrich',label:'À enrichir',cl:'neutral',details:`Informations optionnelles absentes : ${enrich.join(', ')}.`};
    return {key:'ok',label:'Complet',cl:'ok',details:'Champs essentiels renseignés.'};
  }

  function primaryFiltered(q){
    const n = norm(q);
    const dup = primaryDuplicateMap();
    return primaryRows().filter(a => {
      if(!n) return true;
      const qc = primaryQC(a,dup);
      return [
        a.Name,a.FullName,a.Target,a.ApplicationsText,a.HostSpecies,a.Supplier,
        a.CatalogNumber,a.Class,a.MolecularWeight,qc.label
      ].some(v => norm(v).includes(n));
    });
  }

  function qcPill(qc){
    return `<span class="pill u125-qc-pill ${qc.cl}" title="${er(qc.details)}">${er(qc.label)}</span>`;
  }

  function primaryTableRows(list){
    const dup = primaryDuplicateMap();
    if(!list.length) return '<tr><td colspan="8"><div class="empty">Aucun anticorps ne correspond à la recherche.</div></td></tr>';
    return list.map(a => {
      const qc = primaryQC(a,dup);
      const stock = stockCountForPrimary(a);
      return `<tr data-u125-primary-row="${Number(a.id)}">
        <td><button class="u125-link-btn" data-u125-primary="${Number(a.id)}"><b>${er(a.Name||a.FullName||a.CatalogNumber||a.Code)}</b></button></td>
        <td>${er(a.Target||'—')}</td>
        <td>${er(a.ApplicationsText||'—')}</td>
        <td>${er(a.HostSpecies||'—')}</td>
        <td>${er(a.Supplier||'—')}</td>
        <td>${er(a.CatalogNumber||'—')}</td>
        <td><span class="pill ${stock?'ok':'neutral'}">${stock} vial${stock>1?'s':''}</span></td>
        <td>${qcPill(qc)}</td>
      </tr>`;
    }).join('');
  }

  function renderPrimaryUniversal(){
    const q = state.search || '';
    const list = primaryFiltered(q);
    const dup = primaryDuplicateMap();
    const all = primaryRows();
    const control = all.filter(a => primaryQC(a,dup).key !== 'ok').length;

    topbar('Anticorps primaires',`<div class="row v112-top-actions v112-inventory-switch">
      <button class="btn btn-primary" id="v112PrimaryList">Liste</button>
      <button class="btn" id="v112PrimaryStorage">Stockage</button>
      <button class="btn btn-primary" id="v112PrimaryAdd">+ Ajouter un anticorps primaire</button>
    </div>`);

    content.innerHTML = `<h1 class="page-title">Anticorps primaires</h1>
      <p class="subtitle">Inventaire relationnel · même lecture que les anticorps secondaires, avec contrôle qualité visible.</p>

      <div class="grid grid-4 u125-metrics">
        <div class="card card-pad"><div class="metric-value">${all.length}</div><div class="subtitle">Références</div></div>
        <div class="card card-pad"><div class="metric-value">${primaryVials().length}</div><div class="subtitle">Vials</div></div>
        <div class="card card-pad"><div class="metric-value">${primaryBoxes().length}</div><div class="subtitle">Boîtes / conteneurs</div></div>
        <div class="card card-pad"><div class="metric-value">${control}</div><div class="subtitle">À contrôler / enrichir</div></div>
      </div>

      <div class="searchbar" style="margin-top:16px">
        <input id="u125PrimarySearch" value="${er(q)}" placeholder="Nom, cible, applications, hôte, fournisseur, référence, qualité…">
        <button class="btn" id="u125PrimaryClear">Effacer</button>
      </div>

      <div class="card table-wrap u125-universal-table" style="margin-top:14px">
        <table class="table">
          <thead><tr>
            <th>Nom</th><th>Cible</th><th>Applications</th><th>Hôte</th>
            <th>Fournisseur</th><th>Référence</th><th>Stock</th><th>Qualité</th>
          </tr></thead>
          <tbody id="u125PrimaryBody">${primaryTableRows(list)}</tbody>
        </table>
      </div>

      <div class="card card-pad u125-quality-summary" style="margin-top:14px">
        <div class="row space-between" style="align-items:flex-start;gap:14px">
          <div>
            <h3 class="section-title">Contrôle qualité</h3>
            <p class="subtitle">Le contrôle signale les champs essentiels manquants, les doublons fournisseur + référence et les fiches qui peuvent encore être enrichies. Il ne modifie aucune donnée automatiquement.</p>
          </div>
          <span class="pill ${control?'warn':'ok'}">${control} fiche${control>1?'s':''} à revoir</span>
        </div>
      </div>`;

    const bindRows = () => document.querySelectorAll('[data-u125-primary]').forEach(b => {
      b.onclick = () => {
        state.selectedAntibody = Number(b.dataset.u125Primary);
        go('antibody-detail');
      };
    });

    const refresh = () => {
      const now = primaryFiltered(state.search);
      $('#u125PrimaryBody').innerHTML = primaryTableRows(now);
      bindRows();
    };

    $('#u125PrimarySearch').oninput = e => { state.search = e.target.value; refresh(); };
    $('#u125PrimaryClear').onclick = () => {
      state.search = '';
      $('#u125PrimarySearch').value = '';
      refresh();
      $('#u125PrimarySearch').focus();
    };
    $('#v112PrimaryStorage').onclick = () => go('storage');
    $('#v112PrimaryAdd').onclick = e => { e.preventDefault(); showReferenceFirstForm('primary_antibody'); };
    bindRows();
  }

  // Replace only the primary list. Detail/storage keep their stable implementations.
  antibodies = renderPrimaryUniversal;

  function knownCandidates(ref, supplier=''){
    const r = norm(ref), s = norm(supplier);
    if(!r) return [];
    const out = [];

    for(const a of primaryRows()){
      if(norm(a.CatalogNumber) !== r) continue;
      out.push({
        source:'Anticorps primaires', inventoryType:'primary_antibody',
        name:a.Name||a.FullName||'', fullName:a.FullName||a.Name||'',
        supplier:a.Supplier||'', catalogNumber:a.CatalogNumber||'',
        target:a.Target||'', targetSpecies:'', hostSpecies:a.HostSpecies||'',
        className:a.Class||'', fluorophore:'', excitation_nm:null, emission_nm:null,
        applications:a.ApplicationsText||'', molecularWeight:a.MolecularWeight||'',
        storageTemperature:'', website:a.Website||'', comments:a.Comments||''
      });
    }

    try{
      const data = ns.inventoryData?.(SEC);
      for(const i of data?.items || []){
        if(norm(i.catalogNumber) !== r) continue;
        out.push({
          source:'Anticorps secondaires', inventoryType:SEC,
          name:i.name||'', fullName:i.name||'', supplier:i.supplier||'',
          catalogNumber:i.catalogNumber||'', target:i.target||'',
          targetSpecies:i.targetSpecies||'', hostSpecies:i.hostSpecies||'',
          className:i.class||'', fluorophore:i.fluorophore||'',
          excitation_nm:i.excitation_nm, emission_nm:i.emission_nm,
          applications:'', molecularWeight:'', storageTemperature:i.storageTemperature||'',
          website:i.website||'', comments:i.comments||'',
          labWB:i.attributes?.labWB||'', labIF:i.attributes?.labImmunostaining||'',
          infos:i.attributes?.infos||''
        });
      }
    }catch(_){}

    const filtered = s ? out.filter(x => norm(x.supplier) === s) : out;
    return filtered.length ? filtered : out;
  }

  function setVal(id,value){
    const el = document.getElementById(id);
    if(!el || value === null || value === undefined || value === '') return;
    el.value = String(value);
  }

  function prefillReference(type){
    const ref = $('#u125Ref')?.value.trim() || '';
    const supplier = $('#u125Supplier')?.value.trim() || '';
    if(!ref) return toast('Renseigne d’abord une référence.');

    const matches = knownCandidates(ref,supplier);
    if(!matches.length){
      toast('Aucune correspondance locale exacte. Les autres champs restent optionnels.');
      return;
    }
    if(matches.length > 1 && !supplier){
      toast(`${matches.length} correspondances locales : renseigne le fournisseur pour lever l’ambiguïté.`);
      return;
    }

    const x = matches[0];
    setVal('u125Name',x.name);
    setVal('u125FullName',x.fullName);
    setVal('u125Supplier',x.supplier);
    setVal('u125Target',x.target);
    setVal('u125TargetSpecies',x.targetSpecies);
    setVal('u125Host',x.hostSpecies);
    setVal('u125Class',x.className);
    setVal('u125Fluor',x.fluorophore);
    setVal('u125Ex',x.excitation_nm);
    setVal('u125Em',x.emission_nm);
    setVal('u125Apps',x.applications);
    setVal('u125MW',x.molecularWeight);
    setVal('u125Temp',x.storageTemperature);
    setVal('u125Website',x.website);
    setVal('u125LabWB',x.labWB);
    setVal('u125LabIF',x.labIF);
    setVal('u125Infos',x.infos);
    setVal('u125Comments',x.comments);

    toast(`Prérempli depuis ${x.source}. Vérifie avant d’enregistrer.`);
  }

  function commonFormIntro(type){
    const secondary = type === SEC;
    return `<div class="u125-ref-first">
      <div class="u125-ref-banner">
        <div>
          <b>Ajout rapide par référence</b>
          <p>Seule la référence est obligatoire. Le fournisseur améliore la fiabilité. Tous les autres champs sont optionnels et pourront être complétés ensuite.</p>
        </div>
        <span class="pill ok">${secondary?'Secondaire':'Primaire'}</span>
      </div>
      <div class="form-grid">
        <div class="field"><label>Référence / catalogue *</label><input id="u125Ref" autocomplete="off" placeholder="Ex. A-21244, ab15895…"></div>
        <div class="field"><label>Fournisseur <span class="u125-optional">optionnel mais recommandé</span></label><input id="u125Supplier" autocomplete="off" placeholder="Thermo Fisher, Abcam…"></div>
      </div>
      <div class="row" style="margin-top:10px;justify-content:flex-start">
        <button class="btn" id="u125Prefill">↻ Préremplir depuis les données connues</button>
      </div>
    </div>`;
  }

  function primaryOptionalFields(){
    return `<details class="u125-details" open>
      <summary>Informations de la fiche <span>optionnelles</span></summary>
      <div class="form-grid u125-form-body">
        <div class="field"><label>Nom</label><input id="u125Name"></div>
        <div class="field"><label>Nom complet</label><input id="u125FullName"></div>
        <div class="field"><label>Cible</label><input id="u125Target"></div>
        <div class="field"><label>Espèce hôte</label><input id="u125Host"></div>
        <div class="field"><label>Classe / isotype</label><input id="u125Class"></div>
        <div class="field"><label>Applications</label><input id="u125Apps" placeholder="WB, IF/ICC, IHC…"></div>
        <div class="field"><label>Poids moléculaire</label><input id="u125MW"></div>
        <div class="field"><label>Lien fournisseur</label><input id="u125Website" type="url" placeholder="https://…"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="u125Comments" rows="4"></textarea></div>
    </details>`;
  }

  function secondaryOptionalFields(){
    return `<details class="u125-details" open>
      <summary>Informations de la fiche <span>optionnelles</span></summary>
      <div class="form-grid u125-form-body">
        <div class="field"><label>Nom</label><input id="u125Name"></div>
        <div class="field"><label>Cible</label><input id="u125Target"></div>
        <div class="field"><label>Espèce cible</label><input id="u125TargetSpecies" placeholder="Mouse, Rabbit…"></div>
        <div class="field"><label>Espèce hôte</label><input id="u125Host" placeholder="Goat, Donkey…"></div>
        <div class="field"><label>Classe / isotype</label><input id="u125Class"></div>
        <div class="field"><label>Fluorophore</label><input id="u125Fluor" placeholder="AF488, AF555…"></div>
        <div class="field"><label>Excitation (nm)</label><input id="u125Ex" type="number" step="1"></div>
        <div class="field"><label>Émission (nm)</label><input id="u125Em" type="number" step="1"></div>
        <div class="field"><label>Température de stockage</label><input id="u125Temp" placeholder="-20°C"></div>
        <div class="field"><label>Lien fournisseur</label><input id="u125Website" type="url" placeholder="https://…"></div>
        <div class="field"><label>Validation labo — WB</label><input id="u125LabWB"></div>
        <div class="field"><label>Validation labo — IF / IHC</label><input id="u125LabIF"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Informations</label><textarea id="u125Infos" rows="3"></textarea></div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="u125Comments" rows="3"></textarea></div>
    </details>`;
  }

  function showReferenceFirstForm(type){
    if(!state.connected) return toast('Connexion Grist requise.');
    const secondary = type === SEC;
    modal(`<div class="u125-modal">
      <div class="row space-between" style="align-items:flex-start;gap:12px">
        <div>
          <h2>Ajouter un anticorps ${secondary?'secondaire':'primaire'}</h2>
          <p class="subtitle">La fiche peut commencer avec une seule référence puis être enrichie progressivement.</p>
        </div>
      </div>
      ${commonFormIntro(type)}
      ${secondary?secondaryOptionalFields():primaryOptionalFields()}
      <div class="u125-enrichment-note">
        <b>Complétion assistée</b>
        <span>Le bouton de préremplissage utilise uniquement les références déjà connues dans la BDD. Après création d’un primaire, le moteur d’enrichissement existant prépare aussi des suggestions de datasheet/document à valider.</span>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="u125Cancel">Annuler</button>
        <button class="btn btn-primary" id="u125Save">Créer la fiche</button>
      </div>
    </div>`);

    $('#u125Cancel').onclick = closeModal;
    $('#u125Prefill').onclick = () => prefillReference(type);
    $('#u125Ref').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); prefillReference(type); } };
    $('#u125Save').onclick = () => saveReferenceFirst(type);
    setTimeout(()=>$('#u125Ref')?.focus(),0);
  }

  function nextPrimaryCode(){
    const used = new Set(primaryRows().map(a => String(a.Code||'')));
    let n = Math.max(0,...primaryRows().map(a => {
      const m = String(a.Code||'').match(/^AB-(\d+)$/i);
      return m ? Number(m[1]) : 0;
    })) + 1;
    let code;
    do{ code = `AB-${String(n++).padStart(4,'0')}`; }while(used.has(code));
    return code;
  }

  function nextSecondaryCode(ref){
    const items = rows(state.data.InventoryItems).filter(x => x.InventoryType === SEC);
    const used = new Set(items.map(x => String(x.Code||'')));
    const base = `SEC-${String(ref||'NEW').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36) || 'NEW'}`;
    if(!used.has(base)) return base;
    let n=2,code;
    do{code=`${base}-${n++}`;}while(used.has(code));
    return code;
  }

  function duplicateReference(type,ref,supplier){
    const r=norm(ref),s=norm(supplier);
    if(type==='primary_antibody'){
      return primaryRows().filter(a=>norm(a.CatalogNumber)===r && (!s || norm(a.Supplier)===s));
    }
    return rows(state.data.InventoryItems).filter(i=>i.InventoryType===SEC && norm(i.CatalogNumber)===r && (!s || norm(i.Supplier)===s));
  }

  async function saveReferenceFirst(type){
    const ref = $('#u125Ref').value.trim();
    const supplier = $('#u125Supplier').value.trim();
    if(!ref) return toast('La référence est obligatoire.');

    const dup = duplicateReference(type,ref,supplier);
    if(dup.length && !confirm(`Cette référence existe déjà${supplier?' chez ce fournisseur':''}. Créer quand même une nouvelle fiche ?`)) return;

    // Merge any unique local exact match into missing optional fields.
    const known = knownCandidates(ref,supplier);
    const local = known.length===1 ? known[0] : null;

    const val = id => document.getElementById(id)?.value?.trim?.() || '';
    const pick = (id,key) => val(id) || local?.[key] || '';

    $('#u125Save').disabled = true;
    $('#u125Save').textContent = 'Création…';

    try{
      if(type === 'primary_antibody'){
        const code = nextPrimaryCode();
        const name = pick('u125Name','name') || ref;
        const rec = {
          Code:code,
          Name:name,
          FullName:pick('u125FullName','fullName') || name,
          Supplier:supplier || local?.supplier || '',
          CatalogNumber:ref,
          HostSpecies:pick('u125Host','hostSpecies'),
          Class:pick('u125Class','className'),
          Target:pick('u125Target','target'),
          ApplicationsText:pick('u125Apps','applications'),
          MolecularWeight:pick('u125MW','molecularWeight'),
          Website:pick('u125Website','website'),
          DateAdded:Math.floor(Date.now()/1000),
          Comments:pick('u125Comments','comments'),
          Active:true,
          RawTable:'',
          RawRowId:0
        };
        await grist.docApi.applyUserActions([['AddRecord','Antibodies',null,rec]]);
        await loadAll();
        const created = primaryRows().find(a=>a.Code===code);
        if(created && typeof ns.enrichPrimary === 'function'){
          try{ await ns.enrichPrimary(created); }catch(e){ console.warn('Enrichissement primaire:',e); }
        }
        closeModal();
        toast('Fiche primaire créée. Les champs manquants restent modifiables.');
        state.search='';
        antibodies();
        return;
      }

      const code = nextSecondaryCode(ref);
      const name = pick('u125Name','name') || ref;
      const rec = {
        Code:code,
        InventoryType:SEC,
        Name:name,
        Status:'Actif',
        Active:true,
        Supplier:supplier || local?.supplier || '',
        CatalogNumber:ref,
        Target:pick('u125Target','target'),
        TargetSpecies:pick('u125TargetSpecies','targetSpecies'),
        HostSpecies:pick('u125Host','hostSpecies'),
        Fluorophore:pick('u125Fluor','fluorophore'),
        Excitation_nm:num(val('u125Ex')) ?? local?.excitation_nm ?? null,
        Emission_nm:num(val('u125Em')) ?? local?.emission_nm ?? null,
        StorageTemperature:pick('u125Temp','storageTemperature'),
        Class:pick('u125Class','className'),
        Website:pick('u125Website','website'),
        Comments:pick('u125Comments','comments'),
        RawTable:'',
        RawRowId:0
      };
      await grist.docApi.applyUserActions([['AddRecord','InventoryItems',null,rec]]);
      await loadAll();
      const created = rows(state.data.InventoryItems).find(i=>i.InventoryType===SEC && i.Code===code);
      if(created){
        const attrs=[];
        const wb=val('u125LabWB')||local?.labWB||'';
        const labif=val('u125LabIF')||local?.labIF||'';
        const infos=val('u125Infos')||local?.infos||'';
        if(wb) attrs.push({Item:Number(created.id),InventoryType:SEC,FieldKey:'labWB',ValueText:wb,Source:'manual'});
        if(labif) attrs.push({Item:Number(created.id),InventoryType:SEC,FieldKey:'labImmunostaining',ValueText:labif,Source:'manual'});
        if(infos) attrs.push({Item:Number(created.id),InventoryType:SEC,FieldKey:'infos',ValueText:infos,Source:'manual'});
        const actions = attrs.map(a=>['AddRecord','InventoryAttributes',null,a]);
        if(state.tables.includes('InventoryHistory')){
          actions.push(['AddRecord','InventoryHistory',null,{
            Date:Date.now()/1000,InventoryType:SEC,Action:'Création fiche',
            EntityType:'InventoryItem',EntityCode:code,
            Details:`Création manuelle par référence ${ref}`,User:'Grist'
          }]);
        }
        if(actions.length) await grist.docApi.applyUserActions(actions);
      }
      closeModal();
      await loadAll();
      toast('Fiche secondaire créée. Les champs manquants restent modifiables.');
      ns.inventoryView[SEC]='list';
      ns.inventorySelected[SEC]=null;
      go(`inv:${SEC}`);
    }catch(e){
      console.error(e);
      $('#u125Save').disabled=false;
      $('#u125Save').textContent='Créer la fiche';
      toast(`Erreur : ${e.message||e}`);
    }
  }

  // Intercept add buttons generated by primary detail/storage and generic inventory views.
  document.addEventListener('click',e=>{
    const primaryBtn=e.target.closest?.('#v112PrimaryAdd');
    if(primaryBtn){
      e.preventDefault();
      e.stopImmediatePropagation();
      showReferenceFirstForm('primary_antibody');
      return;
    }
    const genericBtn=e.target.closest?.('[data-v112-add-item]');
    if(genericBtn && String(state.route||'')===`inv:${SEC}`){
      e.preventDefault();
      e.stopImmediatePropagation();
      showReferenceFirstForm(SEC);
    }
  },true);

  // Public helper for later inventories / tests.
  ns.showReferenceFirstAntibodyForm = showReferenceFirstForm;
  ns.unifiedVersion = VERSION;

  window.BioDynaMitUnifiedV1125 = {
    version:VERSION,
    renderPrimaryList:renderPrimaryUniversal,
    showAddPrimary:()=>showReferenceFirstForm('primary_antibody'),
    showAddSecondary:()=>showReferenceFirstForm(SEC)
  };
})();
