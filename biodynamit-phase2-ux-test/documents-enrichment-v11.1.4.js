/* BioDynaMit v11.1.4 — enrichment documentaire des fiches anticorps
   - Ne modifie pas les données automatiquement.
   - Propose fiche fournisseur/datasheet, publications avec référence exacte,
     et publications liées à la cible dans un contexte mitochondrial.
   - L'utilisateur valide explicitement tout ajout dans Documents.
*/
(function(){
  'use strict';

  const VERSION = '11.1.4';
  const EP_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

  function injectStyles(){
    if(document.getElementById('v1114Styles')) return;
    const style = document.createElement('style');
    style.id = 'v1114Styles';
    style.textContent = `
      .v1114-wrap{margin-top:18px;border-top:1px solid var(--line);padding-top:18px}
      .v1114-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
      .v1114-head h3{margin:0 0 4px}
      .v1114-head p{margin:0;color:var(--muted);max-width:850px}
      .v1114-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .v1114-card{border:1px solid var(--line);border-radius:11px;padding:14px;background:#fbfdff}
      .v1114-card h4{margin:0 0 6px;font-size:14px}
      .v1114-card p{margin:5px 0;color:var(--muted);font-size:13px;line-height:1.45}
      .v1114-card .v1114-title{font-weight:750;color:var(--ink);font-size:14px;line-height:1.4}
      .v1114-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .v1114-chip{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#eef5fb;color:#41627f;font-size:11px;font-weight:700}
      .v1114-section{margin-top:16px}
      .v1114-section h4{margin:0 0 9px}
      .v1114-loading{padding:18px;border:1px dashed var(--line);border-radius:10px;color:var(--muted)}
      .v1114-empty{padding:14px;border:1px dashed var(--line);border-radius:10px;color:var(--muted)}
      @media(max-width:900px){.v1114-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function norm(s){ return normalizeName(String(s||'')); }
  function urlOk(s){ return /^https?:\/\//i.test(String(s||'').trim()); }
  function targetOf(a){
    try{
      return String(window.BioDynaMitV111?.effectiveTarget?.(a) || a?.Target || '').trim();
    }catch(_){ return String(a?.Target || '').trim(); }
  }
  function catalogUsable(ref){
    const s=String(ref||'').trim();
    if(!s || s.length<3) return false;
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
    if(/^00:00:00$/.test(s)) return false;
    return true;
  }

  const supplierDomains = [
    [/abcam/i,'abcam.com'],
    [/cell\s*signaling|cst\b/i,'cellsignal.com'],
    [/proteintech/i,'ptglab.com'],
    [/sigma|millipore|merck/i,'sigmaaldrich.com'],
    [/thermo|fisher|invitrogen/i,'thermofisher.com'],
    [/santa\s*cruz/i,'scbt.com'],
    [/novus/i,'novusbio.com'],
    [/bd\s*pharm|becton|bd\b/i,'bd.com'],
    [/jackson/i,'jacksonimmuno.com'],
    [/bio-?rad/i,'bio-rad-antibodies.com'],
    [/agilent|dako/i,'agilent.com']
  ];

  function supplierDomain(name){
    const s=String(name||'');
    return supplierDomains.find(([rx])=>rx.test(s))?.[1] || '';
  }

  function officialSearchUrl(a){
    const ref=String(a?.CatalogNumber||'').trim();
    const supplier=String(a?.Supplier||'').trim();
    const domain=supplierDomain(supplier);
    const q = domain
      ? `site:${domain} "${ref}" antibody datasheet`
      : `"${supplier}" "${ref}" antibody datasheet`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  function publicationUrl(r){
    if(r.doi) return `https://doi.org/${encodeURIComponent(r.doi)}`;
    if(r.pmid) return `https://europepmc.org/article/MED/${encodeURIComponent(r.pmid)}`;
    if(r.pmcid) return `https://europepmc.org/article/PMC/${encodeURIComponent(r.pmcid)}`;
    const id=r.id||r.extId;
    return id ? `https://europepmc.org/article/${encodeURIComponent(r.source||'MED')}/${encodeURIComponent(id)}` : 'https://europepmc.org/';
  }

  function journalOf(r){
    return r.journalTitle || r.journalInfo?.journal?.title || '';
  }

  function dateOf(r){
    return r.firstPublicationDate || r.firstIndexDate || r.pubYear || '';
  }

  async function epSearch(query, pageSize=6){
    const url=`${EP_BASE}?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}`;
    const res=await fetch(url,{headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error(`Europe PMC ${res.status}`);
    const data=await res.json();
    return data?.resultList?.result || [];
  }

  function existingDoc(a, link, title){
    return rows(state.data.Documents).some(d =>
      Number(d.Antibody)===Number(a.id) &&
      ((link && String(d.Link||'').trim()===String(link).trim()) ||
       (title && norm(d.Title)===norm(title)))
    );
  }

  async function addDocument(a, item, button){
    if(!state.connected) return toast('Connexion Grist requise.');
    if(existingDoc(a,item.link,item.title)){
      button.disabled=true; button.textContent='Déjà ajouté';
      return toast('Ce document est déjà associé à cet anticorps.');
    }
    try{
      await grist.docApi.applyUserActions([['AddRecord','Documents',null,{
        Antibody:Number(a.id),
        Title:item.title,
        Type:item.type || 'Autre',
        Link:item.link || '',
        Notes:item.notes || ''
      }]]);
      await loadAll();
      button.disabled=true; button.textContent='Ajouté ✓';
      toast('Document ajouté à la fiche.');
    }catch(e){
      console.error(e);
      toast(`Erreur : ${e.message||e}`);
    }
  }

  function publicationCard(a,r,reason){
    const title=r.title || 'Publication sans titre';
    const link=publicationUrl(r);
    const meta=[r.authorString,journalOf(r),dateOf(r)].filter(Boolean).join(' · ');
    const item={
      title,
      type:'Publication',
      link,
      notes:`Suggestion automatique (${reason}). Source : Europe PMC.${r.doi?` DOI : ${r.doi}.`:''}`
    };
    const already=existingDoc(a,link,title);
    return `<article class="v1114-card" data-v1114-pub
      data-title="${esc(title)}"
      data-link="${esc(link)}"
      data-type="Publication"
      data-notes="${esc(item.notes)}">
      <span class="v1114-chip">${esc(reason)}</span>
      <p class="v1114-title">${esc(title)}</p>
      <p>${esc(meta||'Europe PMC')}</p>
      <div class="v1114-actions">
        <a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>
        <button class="btn btn-sm btn-primary" data-v1114-add ${already?'disabled':''}>${already?'Déjà ajouté':'Ajouter aux documents'}</button>
      </div>
    </article>`;
  }

  function bindAddButtons(root,a){
    root.querySelectorAll('[data-v1114-add]').forEach(btn=>{
      if(btn.disabled) return;
      btn.onclick=()=>{
        const card=btn.closest('[data-v1114-pub],[data-v1114-resource]');
        if(!card) return;
        addDocument(a,{
          title:card.dataset.title||'Document',
          link:card.dataset.link||'',
          type:card.dataset.type||'Autre',
          notes:card.dataset.notes||''
        },btn);
      };
    });
  }

  function supplierBlock(a){
    const direct=urlOk(a?.Website) ? String(a.Website).trim() : '';
    const search=officialSearchUrl(a);
    const ref=String(a?.CatalogNumber||'').trim();
    const supplier=String(a?.Supplier||'').trim();

    if(direct){
      const title=`Fiche fournisseur / datasheet — ${a.Name||a.FullName||ref}`;
      const item={
        title,
        type:'Datasheet',
        link:direct,
        notes:`Lien fournisseur enregistré dans la base pour ${supplier||'le fournisseur'} — référence ${ref||'non renseignée'}.`
      };
      const already=existingDoc(a,item.link,item.title);
      return `<article class="v1114-card" data-v1114-resource
        data-title="${esc(item.title)}"
        data-link="${esc(item.link)}"
        data-type="Datasheet"
        data-notes="${esc(item.notes)}">
        <span class="v1114-chip">FOURNISSEUR</span>
        <h4>Datasheet / fiche produit</h4>
        <p>Référence : <b>${esc(ref||'—')}</b> · ${esc(supplier||'Fournisseur non renseigné')}</p>
        <p>Un lien fournisseur est déjà enregistré pour cet anticorps.</p>
        <div class="v1114-actions">
          <a class="btn btn-sm" href="${esc(direct)}" target="_blank" rel="noopener noreferrer">Ouvrir la fiche ↗</a>
          <button class="btn btn-sm btn-primary" data-v1114-add ${already?'disabled':''}>${already?'Déjà ajouté':'Ajouter aux documents'}</button>
        </div>
      </article>`;
    }

    return `<article class="v1114-card">
      <span class="v1114-chip">FOURNISSEUR</span>
      <h4>Datasheet / fiche produit</h4>
      <p>Référence : <b>${esc(ref||'—')}</b> · ${esc(supplier||'Fournisseur non renseigné')}</p>
      <p>Aucun lien produit direct n'est enregistré. La recherche ci-dessous est limitée au site officiel du fournisseur lorsqu'il est reconnu.</p>
      <div class="v1114-actions">
        <a class="btn btn-sm btn-primary" href="${esc(search)}" target="_blank" rel="noopener noreferrer">Trouver la datasheet officielle ↗</a>
        <button class="btn btn-sm" id="v1114ManualDoc">Ajouter le lien manuellement</button>
      </div>
    </article>`;
  }

  async function loadSuggestions(root,a){
    const exactHost=root.querySelector('[data-v1114-exact]');
    const targetHost=root.querySelector('[data-v1114-target]');
    const ref=String(a?.CatalogNumber||'').trim();
    const name=String(a?.Name||a?.FullName||'').trim();
    const target=targetOf(a);
    const scientificTerm = name || target;

    if(exactHost){
      if(!catalogUsable(ref)){
        exactHost.innerHTML='<div class="v1114-empty">Référence catalogue absente ou non exploitable pour une recherche exacte.</div>';
      }else{
        try{
          const results=await epSearch(`"${ref.replace(/"/g,'')}"`,6);
          exactHost.innerHTML=results.length
            ? `<div class="v1114-grid">${results.map(r=>publicationCard(a,r,'Même référence catalogue')).join('')}</div>`
            : '<div class="v1114-empty">Aucune publication indexée trouvée avec cette référence exacte. Cela ne signifie pas qu’elle n’existe pas : les références catalogue sont souvent absentes des résumés.</div>';
        }catch(e){
          console.error(e);
          exactHost.innerHTML='<div class="v1114-empty">La recherche Europe PMC n’a pas pu être chargée pour le moment.</div>';
        }
      }
    }

    if(targetHost){
      if(!scientificTerm){
        targetHost.innerHTML='<div class="v1114-empty">Cible non renseignée.</div>';
      }else{
        try{
          const term=scientificTerm.replace(/"/g,'');
          const results=await epSearch(`"${term}" AND (mitochondria OR mitochondrial OR mitofusin OR cristae)`,6);
          targetHost.innerHTML=results.length
            ? `<div class="v1114-grid">${results.map(r=>publicationCard(a,r,'Cible / mitochondrie')).join('')}</div>`
            : '<div class="v1114-empty">Aucune publication mitochondriale pertinente trouvée automatiquement pour cette cible.</div>';
        }catch(e){
          console.error(e);
          targetHost.innerHTML='<div class="v1114-empty">La recherche Europe PMC n’a pas pu être chargée pour le moment.</div>';
        }
      }
    }

    bindAddButtons(root,a);
  }

  function augmentDocuments(){
    injectStyles();
    const addBtn=document.querySelector('#addDoc');
    const body=document.querySelector('#v111TabBody');
    if(!addBtn || !body || document.getElementById('v1114Enrichment')) return;

    const a=rowById('Antibodies',state.selectedAntibody);
    if(!a) return;

    const wrapper=document.createElement('section');
    wrapper.id='v1114Enrichment';
    wrapper.className='v1114-wrap';
    wrapper.innerHTML=`
      <div class="v1114-head">
        <div>
          <h3>Ressources suggérées automatiquement</h3>
          <p>La référence catalogue, le fournisseur et la cible servent à proposer des ressources. Rien n'est enregistré dans Grist sans validation explicite.</p>
        </div>
        <span class="v1114-chip">v${VERSION}</span>
      </div>

      ${supplierBlock(a)}

      <div class="v1114-section">
        <h4>Publications utilisant la même référence catalogue</h4>
        <div class="v1114-loading" data-v1114-exact>Recherche dans Europe PMC…</div>
      </div>

      <div class="v1114-section">
        <h4>Publications importantes sur la cible et la mitochondrie</h4>
        <div class="v1114-loading" data-v1114-target>Recherche dans Europe PMC…</div>
      </div>`;

    body.appendChild(wrapper);

    const manual=wrapper.querySelector('#v1114ManualDoc');
    if(manual) manual.onclick=()=>addBtn.click();

    bindAddButtons(wrapper,a);
    loadSuggestions(wrapper,a);
  }

  // Après clic sur l'onglet Documents, le patch v11.1.2 reconstruit le contenu.
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-v111-tab="documents"]')){
      setTimeout(augmentDocuments,0);
    }
  });

  // Couvre aussi les re-rendus provoqués par l'ajout d'un document.
  const observer=new MutationObserver(()=>{
    if(document.querySelector('#addDoc') && !document.getElementById('v1114Enrichment')){
      augmentDocuments();
    }
  });
  observer.observe(document.body,{subtree:true,childList:true});

  window.BioDynaMitDocumentsV1114={version:VERSION,augment:augmentDocuments};
})();
