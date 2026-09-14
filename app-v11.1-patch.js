/* BioDynaMit v11.1 — targeted usability fixes only.
   Keeps the validated v11 storage/3D architecture unchanged. */
(function(){
  'use strict';

  let detailTab = 'overview';

  function sourceTableName(){
    return Object.keys(state.data || {}).find(t => normalizeName(t) === 'list of all antibodies')
      || Object.keys(state.data || {}).find(t => /all.*antibod|antibod.*list/i.test(t));
  }

  function sourceRowForAntibody(a){
    const tableName = a?.RawTable && state.data[a.RawTable] ? a.RawTable : sourceTableName();
    if(!tableName) return null;
    const raw = rows(state.data[tableName]);
    if(a?.RawRowId){
      const byId = raw.find(r => Number(r.id) === Number(a.RawRowId));
      if(byId) return byId;
    }
    const cat = normalizeName(a?.CatalogNumber);
    const name = normalizeName(a?.Name || a?.FullName);
    return raw.find(r => {
      const rCat = normalizeName(findField(r,['Catalog number','Catalog','Reference','Ref']));
      const rName = normalizeName(findField(r,['Antigen-antibody','Antigen antibody','Antibody','Name','Antigen']));
      return (cat && rCat === cat) || (name && rName === name);
    }) || null;
  }

  function effectiveTarget(a){
    if(String(a?.Target || '').trim()) return a.Target;
    const r = sourceRowForAntibody(a);
    return r ? String(findField(r,['Target','Cible','Target protein','Protein target','Cellular target']) || '') : '';
  }

  function safeHref(link){
    const s = String(link || '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function formatDate(value){
    if(!value) return '—';
    const ms = Number(value) < 1e12 ? Number(value) * 1000 : Number(value);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function antibodyRowsHtml(list){
    if(!list.length) return '<tr><td colspan="7"><div class="empty">Aucun anticorps ne correspond à la recherche.</div></td></tr>';
    return list.map(a=>`<tr>
      <td class="link" data-ab="${a.id}"><b>${esc(a.Name||a.FullName)}</b></td>
      <td>${esc(effectiveTarget(a)||'—')}</td>
      <td>${esc(a.Supplier)}</td>
      <td>${esc(a.CatalogNumber)}</td>
      <td>${esc(a.HostSpecies)}</td>
      <td>${esc(a.ApplicationsText)}</td>
      <td>${antibodyStockPill(a.id)}</td>
    </tr>`).join('');
  }

  function filteredAntibodies(query){
    const q = normalizeName(query);
    return rows(state.data.Antibodies).filter(a => !q || [
      a.Name,a.FullName,a.Supplier,a.CatalogNumber,a.Target,effectiveTarget(a),a.ApplicationsText,a.HostSpecies
    ].some(x => normalizeName(x).includes(q)));
  }

  antibodies = function(){
    const initial = filteredAntibodies(state.search);
    topbar('Anticorps',`<button class="btn btn-primary" id="addAb">+ Ajouter un anticorps</button>`);
    content.innerHTML=`
      <div class="row space-between"><div><h1 class="page-title">Anticorps</h1><p class="subtitle"><span id="abCount">${initial.length}</span> résultat(s)</p></div></div>
      <div class="searchbar"><input id="abSearch" value="${esc(state.search)}" placeholder="Nom, cible, référence, fournisseur…"><button class="btn" id="clearSearch">Effacer</button></div>
      <div class="card table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Nom</th><th>Cible</th><th>Fournisseur</th><th>Référence</th><th>Host</th><th>Applications</th><th>Stock</th></tr></thead><tbody id="abBody">${antibodyRowsHtml(initial)}</tbody></table></div>`;

    const bindRows = () => document.querySelectorAll('[data-ab]').forEach(x=>x.onclick=()=>{
      state.selectedAntibody=Number(x.dataset.ab); detailTab='overview'; go('antibody-detail');
    });
    const refresh = () => {
      const list = filteredAntibodies(state.search);
      $('#abCount').textContent = list.length;
      $('#abBody').innerHTML = antibodyRowsHtml(list);
      bindRows();
    };
    $('#abSearch').oninput = e => { state.search=e.target.value; refresh(); };
    $('#clearSearch').onclick = () => { state.search=''; $('#abSearch').value=''; refresh(); $('#abSearch').focus(); };
    $('#addAb').onclick=showAddAntibody;
    bindRows();
  };

  function overviewHtml(a,vs){
    return `<div class="split">
      <div class="card card-pad"><h3 class="section-title">Informations générales</h3>
        <dl class="detail-list">
          <dt>Nom</dt><dd>${esc(a.Name)}</dd><dt>Nom complet</dt><dd>${esc(a.FullName)}</dd>
          <dt>Référence</dt><dd>${esc(a.CatalogNumber)}</dd><dt>Fournisseur</dt><dd>${esc(a.Supplier)}</dd>
          <dt>Espèce hôte</dt><dd>${esc(a.HostSpecies)}</dd><dt>Classe</dt><dd>${esc(a.Class)}</dd>
          <dt>Cible</dt><dd>${esc(effectiveTarget(a)||'—')}</dd><dt>Applications</dt><dd>${esc(a.ApplicationsText)}</dd>
          <dt>Commentaires</dt><dd>${esc(a.Comments)}</dd>
        </dl>
      </div>
      <div class="card card-pad"><h3 class="section-title">Stock</h3>${vs.length?vs.map(v=>vialCard(v)).join(''):'<div class="empty">Aucun vial associé.</div>'}</div>
    </div>`;
  }

  function vialsTabHtml(vs){
    return `<div class="card card-pad"><h3 class="section-title">Vials (${vs.length})</h3>${vs.length?vs.map(v=>vialCard(v)).join(''):'<div class="empty">Aucun vial associé.</div>'}</div>`;
  }

  function documentsTabHtml(a){
    const docs = rows(state.data.Documents).filter(d=>Number(d.Antibody)===Number(a.id));
    return `<div class="card card-pad">
      <div class="row space-between"><div><h3 class="section-title">Documents</h3><p class="subtitle">Datasheets, protocoles, publications et liens utiles.</p></div><button class="btn btn-primary" id="addDoc">+ Ajouter un document</button></div>
      ${docs.length?`<table class="table"><thead><tr><th>Titre</th><th>Type</th><th>Lien</th><th>Notes</th></tr></thead><tbody>${docs.map(d=>{const h=safeHref(d.Link);return `<tr><td><b>${esc(d.Title||'Sans titre')}</b></td><td>${esc(d.Type||'—')}</td><td>${h?`<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:esc(d.Link||'—')}</td><td>${esc(d.Notes||'')}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Aucun document lié à cet anticorps.</div>'}
    </div>`;
  }

  function notesTabHtml(a){
    const notes = rows(state.data.Notes).filter(n=>Number(n.Antibody)===Number(a.id)).sort((x,y)=>Number(y.Date||0)-Number(x.Date||0));
    return `<div class="card card-pad">
      <div class="row space-between"><div><h3 class="section-title">Notes</h3><p class="subtitle">Notes de laboratoire liées à cet anticorps.</p></div><button class="btn btn-primary" id="addNote">+ Ajouter une note</button></div>
      ${notes.length?notes.map(n=>`<div style="padding:14px 0;border-bottom:1px solid var(--line)"><div class="row space-between"><b>${esc(n.Author||'Utilisateur')}</b><span class="subtitle">${formatDate(n.Date)}</span></div><p style="white-space:pre-wrap">${esc(n.Text||'')}</p>${safeHref(n.AttachmentLink)?`<a href="${esc(safeHref(n.AttachmentLink))}" target="_blank" rel="noopener noreferrer">Pièce jointe ↗</a>`:''}</div>`).join(''):'<div class="empty">Aucune note pour cet anticorps.</div>'}
    </div>`;
  }

  function historyTabHtml(a,vs){
    const codes = new Set([a.Code,...vs.map(v=>v.Code)].filter(Boolean));
    const hist = rows(state.data.History).filter(h=>codes.has(h.EntityCode)).sort((x,y)=>Number(y.Date||0)-Number(x.Date||0));
    return `<div class="card card-pad"><h3 class="section-title">Historique</h3>${hist.length?`<table class="table"><thead><tr><th>Date</th><th>Action</th><th>Élément</th><th>Détails</th></tr></thead><tbody>${hist.map(h=>`<tr><td>${formatDate(h.Date)}</td><td>${esc(h.Action||'')}</td><td>${esc(h.EntityCode||'')}</td><td>${esc(h.Details||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun événement enregistré pour cet anticorps.</div>'}</div>`;
  }

  function showAddDocument(a,rerender){
    modal(`<h2>Ajouter un document — ${esc(a.Name||a.FullName)}</h2>
      <div class="form-grid"><div class="field"><label>Titre *</label><input id="v111DocTitle"></div><div class="field"><label>Type</label><select id="v111DocType"><option>Datasheet</option><option>Publication</option><option>Protocole</option><option>Image / capture</option><option>Autre</option></select></div></div>
      <div class="field" style="margin-top:12px"><label>Lien (https://…)</label><input id="v111DocLink" type="url"></div>
      <div class="field" style="margin-top:12px"><label>Notes</label><textarea id="v111DocNotes"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v111DocCancel">Annuler</button><button class="btn btn-primary" id="v111DocSave">Ajouter</button></div>`);
    $('#v111DocCancel').onclick=closeModal;
    $('#v111DocSave').onclick=async()=>{
      const title=$('#v111DocTitle').value.trim(); if(!title) return toast('Le titre est obligatoire.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','Documents',null,{Antibody:Number(a.id),Title:title,Type:$('#v111DocType').value,Link:$('#v111DocLink').value.trim(),Notes:$('#v111DocNotes').value.trim()}]]);
        closeModal(); await loadAll(); toast('Document ajouté.'); rerender();
      }catch(e){console.error(e);toast(`Erreur : ${e.message||e}`)}
    };
  }

  function showAddNote(a,rerender){
    modal(`<h2>Ajouter une note — ${esc(a.Name||a.FullName)}</h2>
      <div class="field"><label>Auteur</label><input id="v111NoteAuthor" value="Utilisateur"></div>
      <div class="field" style="margin-top:12px"><label>Note *</label><textarea id="v111NoteText" rows="6"></textarea></div>
      <div class="field" style="margin-top:12px"><label>Lien / pièce jointe</label><input id="v111NoteLink" type="url" placeholder="https://…"></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v111NoteCancel">Annuler</button><button class="btn btn-primary" id="v111NoteSave">Ajouter</button></div>`);
    $('#v111NoteCancel').onclick=closeModal;
    $('#v111NoteSave').onclick=async()=>{
      const text=$('#v111NoteText').value.trim(); if(!text) return toast('La note est vide.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','Notes',null,{Antibody:Number(a.id),Date:Date.now()/1000,Author:$('#v111NoteAuthor').value.trim()||'Utilisateur',Text:text,AttachmentLink:$('#v111NoteLink').value.trim()}]]);
        closeModal(); await loadAll(); toast('Note ajoutée.'); rerender();
      }catch(e){console.error(e);toast(`Erreur : ${e.message||e}`)}
    };
  }

  antibodyDetail = function(){
    const a=rowById('Antibodies',state.selectedAntibody)||rows(state.data.Antibodies)[0]; if(!a){go('antibodies');return}
    const vs=rows(state.data.Vials).filter(v=>Number(v.Antibody)===Number(a.id));
    topbar('Fiche anticorps',`<button class="btn" id="backAbList">← Anticorps</button>`);
    content.innerHTML=`<div class="row space-between"><div><h1 class="page-title">${esc(a.Name||a.FullName)} — ${esc(a.FullName||a.Name)}</h1><p class="subtitle">${esc(a.Supplier)} · Réf. : ${esc(a.CatalogNumber)} · Cible : ${esc(effectiveTarget(a)||'—')}</p></div>${vs.length?'<span class="pill ok">● Stock OK</span>':'<span class="pill warn">Stock à vérifier</span>'}</div>
      <div class="tabs" id="v111Tabs">
        ${[['overview',"Vue d'ensemble"],['vials',`Vials (${vs.length})`],['documents','Documents'],['notes','Notes'],['history','Historique']].map(([k,l])=>`<button class="tab ${detailTab===k?'active':''}" data-v111-tab="${k}" style="border:0;background:transparent;cursor:pointer">${l}</button>`).join('')}
      </div>
      <div id="v111TabBody"></div>`;
    $('#backAbList').onclick=()=>go('antibodies');

    const renderTab=()=>{
      const body=$('#v111TabBody');
      if(detailTab==='overview') body.innerHTML=overviewHtml(a,vs);
      if(detailTab==='vials') body.innerHTML=vialsTabHtml(vs);
      if(detailTab==='documents') body.innerHTML=documentsTabHtml(a);
      if(detailTab==='notes') body.innerHTML=notesTabHtml(a);
      if(detailTab==='history') body.innerHTML=historyTabHtml(a,vs);
      document.querySelectorAll('[data-openbox]').forEach(b=>b.onclick=()=>openBoxForVial(Number(b.dataset.openbox)));
      if($('#addDoc')) $('#addDoc').onclick=()=>showAddDocument(a,renderTab);
      if($('#addNote')) $('#addNote').onclick=()=>showAddNote(a,renderTab);
    };
    document.querySelectorAll('[data-v111-tab]').forEach(t=>t.onclick=()=>{
      detailTab=t.dataset.v111Tab;
      document.querySelectorAll('[data-v111-tab]').forEach(x=>x.classList.toggle('active',x.dataset.v111Tab===detailTab));
      renderTab();
    });
    renderTab();
  };

  function generatedVialCode(){
    const d=new Date(), p=n=>String(n).padStart(2,'0');
    return `V-${String(d.getFullYear()).slice(-2)}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.floor(Math.random()*90+10)}`;
  }

  function showImprovedAddVial(){
    const sv = window.BioDynaMitIntegratedStorageV11?.state;
    const boxId = Number(sv?.boxId || state.selectedBox);
    const slot = sv?.slot;
    const pos = rows(state.data.Positions).find(p=>Number(p.Box)===boxId && String(p.Slot)===String(slot));
    const box = rowById('Boxes',boxId);
    if(!pos || !box) return toast('Position introuvable.');
    if(Number(pos.Vial)) return toast('Cette position est déjà occupée.');
    const antibodies = rows(state.data.Antibodies).slice().sort((a,b)=>String(a.Name||'').localeCompare(String(b.Name||''),'fr'));
    modal(`<h2>Ajouter un vial — ${esc(box.Name||box.Code)} / ${esc(pos.Slot)}</h2>
      <p class="subtitle">La boîte et la position sont déjà définies par l’emplacement sélectionné.</p>
      <div class="field"><label>Anticorps *</label><select id="v111AddAb">${antibodies.map(a=>`<option value="${a.id}">${esc(a.Name||a.FullName||a.Code)}${effectiveTarget(a)?` — ${esc(effectiveTarget(a))}`:''}${a.CatalogNumber?` — ${esc(a.CatalogNumber)}`:''}</option>`).join('')}</select></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Code du vial *</label><input id="v111AddCode" value="${generatedVialCode()}"></div>
        <div class="field"><label>Date de réception</label><input id="v111AddDate" type="date"></div>
        <div class="field"><label>Remplissage</label><select id="v111AddFill"><option>Plein</option><option>≈ 50 %</option><option>Inconnu</option></select></div>
        <div class="field"><label>Volume estimé (µL)</label><input id="v111AddVol" type="number" min="0" step="1"></div>
        <div class="field"><label>Statut</label><input value="En stock" disabled><small>Le vial sera immédiatement positionné en ${esc(pos.Slot)}.</small></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="v111AddComments" rows="4"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="v111AddCancel">Annuler</button><button class="btn btn-primary" id="v111AddSave">Créer et positionner</button></div>`);
    $('#v111AddCancel').onclick=closeModal;
    $('#v111AddSave').onclick=async()=>{
      if(!state.connected) return toast('Cette action nécessite la connexion Grist.');
      const code=$('#v111AddCode').value.trim(); if(!code) return toast('Le code du vial est obligatoire.');
      if(rows(state.data.Vials).some(v=>normalizeName(v.Code)===normalizeName(code))) return toast('Ce code de vial existe déjà.');
      const currentPos=rowById('Positions',pos.id); if(Number(currentPos?.Vial)) return toast('Cette position vient d’être occupée. Actualisez la page.');
      const dateValue=$('#v111AddDate').value;
      const rec={Code:code,Antibody:Number($('#v111AddAb').value),FillStatus:$('#v111AddFill').value,EstimatedVolume_uL:$('#v111AddVol').value===''?null:Number($('#v111AddVol').value),Status:'En stock',Comments:$('#v111AddComments').value.trim()};
      if(dateValue) rec.DateReceived=new Date(`${dateValue}T12:00:00Z`).getTime()/1000;
      let created=null;
      try{
        await grist.docApi.applyUserActions([['AddRecord','Vials',null,rec]]);
        await loadAll();
        created=rows(state.data.Vials).find(v=>v.Code===code);
        if(!created) throw Error('Le vial a été créé mais n’a pas pu être relu.');
        const latest=rowById('Positions',pos.id);
        if(Number(latest?.Vial)){
          await grist.docApi.applyUserActions([
            ['UpdateRecord','Vials',created.id,{Status:'À ranger'}],
            ['AddRecord','History',null,{Date:Date.now()/1000,Action:'Ajout vial',EntityType:'Vial',EntityCode:created.Code||'',Details:`Vial créé mais ${box.Name||box.Code} / ${pos.Slot} a été occupée entre-temps ; vial laissé À ranger`,User:'Grist'}]
          ]);
          closeModal(); await loadAll(); toast('Le vial a été créé mais la position a été prise entre-temps : il est marqué « À ranger ».'); return;
        }
        await grist.docApi.applyUserActions([
          ['UpdateRecord','Positions',pos.id,{Vial:Number(created.id),Available:false}],
          ['AddRecord','History',null,{Date:Date.now()/1000,Action:'Ajout vial',EntityType:'Vial',EntityCode:created.Code||'',Details:`Ajout en ${box.Name||box.Code} / ${pos.Slot}`,User:'Grist'}]
        ]);
        state.selectedVial=Number(created.id); state.selectedBox=boxId; if(sv){sv.slot=pos.Slot;sv.boxId=boxId;}
        closeModal(); await loadAll(); toast(`Vial ajouté en ${pos.Slot}.`); storage();
      }catch(e){
        console.error(e);
        if(created){
          try{await grist.docApi.applyUserActions([['UpdateRecord','Vials',created.id,{Status:'À ranger'}]]);}catch(_){}
        }
        toast(`Erreur : ${e.message||e}`);
      }
    };
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-sv11-add]');
    if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showImprovedAddVial();
  },true);

  window.BioDynaMitV111 = {effectiveTarget, showImprovedAddVial, version:'11.1'};
})();

/* v11.1.1 — Journal: veille bibliographique mitochondries / références du stock */
(function(){
  'use strict';

  const WATCH = {
    loaded:false,
    loading:false,
    error:'',
    results:[],
    lastQuery:'',
    lastRun:null
  };

  function e(v){ return esc(v); }
  function norm(v){ return normalizeName(v); }

  function refsForWatch(){
    const seen = new Set();
    return rows(state.data.Antibodies)
      .map(a=>({id:a.id,name:String(a.Name||a.FullName||'').trim(),ref:String(a.CatalogNumber||'').trim(),supplier:String(a.Supplier||'').trim()}))
      .filter(x=>x.ref && x.ref.length>=3)
      .filter(x=>{ const k=norm(x.ref); if(!k || seen.has(k)) return false; seen.add(k); return true; });
  }

  function splitBatches(items,maxChars=1200){
    const batches=[]; let current=[], size=0;
    for(const item of items){
      const term=`\"${item.ref.replace(/\"/g,'')}\"`;
      if(current.length && size+term.length+4>maxChars){ batches.push(current); current=[]; size=0; }
      current.push(item); size+=term.length+4;
    }
    if(current.length) batches.push(current);
    return batches;
  }

  function recentStartDate(years=2){
    const d=new Date(); d.setFullYear(d.getFullYear()-years);
    return d.toISOString().slice(0,10);
  }

  async function queryEuropePMC(batch){
    const refs = batch.map(x=>`\"${x.ref.replace(/\"/g,'')}\"`).join(' OR ');
    const start = recentStartDate(2);
    const query = `FIRST_PDATE:[${start} TO ${new Date().toISOString().slice(0,10)}] AND (mitochondria OR mitochondrial OR mitofusin OR cristae) AND (${refs})`;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=50&sort_date:y&resultType=core&query=${encodeURIComponent(query)}`;
    const r = await fetch(url,{headers:{'Accept':'application/json'}});
    if(!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
    const data = await r.json();
    return {query,results:data?.resultList?.result||[]};
  }

  function matchReferences(pub,refs){
    const hay = norm([pub.title,pub.abstractText,pub.authorString,pub.journalTitle].filter(Boolean).join(' '));
    const raw = [pub.title,pub.abstractText].filter(Boolean).join(' ').toLowerCase();
    return refs.filter(x=>{
      const rr=x.ref.toLowerCase();
      return rr && (raw.includes(rr) || hay.includes(norm(rr)));
    });
  }

  async function refreshWatch(){
    if(WATCH.loading) return;
    WATCH.loading=true; WATCH.error=''; WATCH.results=[];
    journal();
    try{
      const refs=refsForWatch();
      if(!refs.length) throw new Error('Aucune référence catalogue exploitable dans Antibodies.');
      const batches=splitBatches(refs).slice(0,12);
      const merged=new Map();
      const queryTexts=[];
      for(const batch of batches){
        const out=await queryEuropePMC(batch); queryTexts.push(out.query);
        for(const pub of out.results){
          const key=pub.doi||pub.pmid||pub.pmcid||`${pub.title}-${pub.firstPublicationDate||pub.pubYear||''}`;
          const matches=matchReferences(pub,batch);
          if(!matches.length) continue;
          const old=merged.get(key);
          if(old){
            const m=new Map([...old.matches,...matches].map(x=>[norm(x.ref),x])); old.matches=[...m.values()];
          }else merged.set(key,{...pub,matches});
        }
      }
      WATCH.results=[...merged.values()].sort((a,b)=>String(b.firstPublicationDate||b.pubYear||'').localeCompare(String(a.firstPublicationDate||a.pubYear||''))).slice(0,30);
      WATCH.lastQuery=queryTexts.join('\n'); WATCH.lastRun=new Date(); WATCH.loaded=true;
    }catch(err){
      console.error(err); WATCH.error=err.message||String(err);
    }finally{ WATCH.loading=false; journal(); }
  }

  function pubLink(p){
    if(p.doi) return `https://doi.org/${encodeURIComponent(p.doi)}`;
    if(p.pmid) return `https://europepmc.org/article/MED/${encodeURIComponent(p.pmid)}`;
    if(p.pmcid) return `https://europepmc.org/article/PMC/${encodeURIComponent(p.pmcid)}`;
    return '';
  }

  function publicationCards(){
    if(WATCH.loading) return '<div class="empty">Recherche des publications récentes…</div>';
    if(WATCH.error) return `<div class="banner error">Veille indisponible : ${e(WATCH.error)}</div>`;
    if(!WATCH.loaded) return '<div class="empty">Clique sur « Actualiser la veille » pour rechercher les publications récentes liées aux références catalogue du stock et à la mitochondrie.</div>';
    if(!WATCH.results.length) return '<div class="empty">Aucune publication récente trouvée avec les critères actuels. Cela ne signifie pas qu’aucun article n’utilise ces anticorps : les références catalogue ne sont pas toujours indexées dans les résumés ou textes accessibles.</div>';
    return WATCH.results.map(p=>{
      const link=pubLink(p);
      const refs=p.matches.map(x=>`${x.name||'Anticorps'} (${x.ref})`).join(', ');
      return `<article class="card card-pad" style="margin-top:12px">
        <div class="row space-between" style="gap:12px;align-items:flex-start"><div>
          <h3 class="section-title" style="margin-bottom:5px">${e(p.title||'Publication sans titre')}</h3>
          <p class="subtitle">${e(p.authorString||'Auteurs non renseignés')} · ${e(p.journalTitle||'Journal non renseigné')} · ${e(p.firstPublicationDate||p.pubYear||'')}</p>
        </div>${link?`<a class="btn btn-sm" href="${e(link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:''}</div>
        <p><b>Référence(s) de notre stock détectée(s) :</b> ${e(refs)}</p>
        ${p.abstractText?`<p style="color:var(--muted)">${e(String(p.abstractText).slice(0,520))}${String(p.abstractText).length>520?'…':''}</p>`:''}
      </article>`;
    }).join('');
  }

  journal = function(){
    topbar('Journal');
    const N=rows(state.data.Notes);
    content.innerHTML=`
      <h1 class="page-title">Journal & veille scientifique</h1>
      <p class="subtitle">Notes internes et publications récentes potentiellement pertinentes pour les anticorps du stock.</p>

      <div class="card card-pad">
        <div class="row space-between" style="align-items:flex-start;gap:16px">
          <div>
            <h3 class="section-title">🔬 Veille publications — mitochondries</h3>
            <p class="subtitle">Recherche les articles récents mentionnant une référence catalogue présente dans notre BDD, avec un contexte mitochondrie / mitochondrial / mitofusin / cristae.</p>
          </div>
          <button class="btn btn-primary" id="v111RefreshWatch" ${WATCH.loading?'disabled':''}>${WATCH.loading?'Recherche…':'Actualiser la veille'}</button>
        </div>
        <div class="banner" style="margin-top:12px"><b>Important :</b> cette veille est indicative. Une référence catalogue peut n’apparaître que dans les méthodes ou suppléments, donc certains articles peuvent ne pas être détectés automatiquement.</div>
        ${WATCH.lastRun?`<p class="subtitle" style="margin-top:10px">Dernière recherche : ${e(WATCH.lastRun.toLocaleString('fr-FR'))}</p>`:''}
        <div id="v111WatchResults">${publicationCards()}</div>
      </div>

      <div class="card card-pad" style="margin-top:16px">
        <h3 class="section-title">Notes du laboratoire</h3>
        ${N.length?`<table class="table"><tbody>${N.slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)).map(n=>`<tr><td>${e(n.Author||'Utilisateur')}</td><td>${e(n.Text||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune note pour le moment.</div>'}
      </div>`;
    const b=$('#v111RefreshWatch'); if(b) b.onclick=refreshWatch;
  };

  window.BioDynaMitPublicationWatch = {state:WATCH,refresh:refreshWatch};
})();
