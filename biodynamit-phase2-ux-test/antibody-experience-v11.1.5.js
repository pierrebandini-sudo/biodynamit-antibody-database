/* BioDynaMit v11.1.5
   Targeted improvements:
   1) Stock-location buttons readable in antibody sheets.
   2) Validation-image gallery in antibody overview (lab/authorized images only).
   3) Cell and tissue protocol suggestions in Documents, from official sources.
*/
(function(){
  'use strict';

  const VERSION = '11.1.5';

  function injectStyles(){
    if(document.getElementById('v1115Styles')) return;
    const s=document.createElement('style');
    s.id='v1115Styles';
    s.textContent=`
      /* 1. Stock-location actions: force readable black text */
      button[data-openbox],
      button[data-openbox]:hover,
      button[data-openbox]:focus{
        color:#111827 !important;
        background:#fff !important;
        border-color:#b8c9d8 !important;
        font-weight:750 !important;
        opacity:1 !important;
      }
      button[data-openbox]:hover{
        background:#eef6fd !important;
        border-color:#79aeda !important;
        box-shadow:0 0 0 2px rgba(11,120,227,.08);
      }

      /* 2. Representative / validation images */
      .v1115-media{
        margin-top:16px;
        padding:16px;
        background:#fff;
        border:1px solid var(--line);
        border-radius:12px;
        box-shadow:var(--shadow);
      }
      .v1115-media-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
        margin-bottom:12px;
      }
      .v1115-media-head h3{margin:0 0 4px}
      .v1115-media-head p{margin:0;color:var(--muted);max-width:850px;line-height:1.45}
      .v1115-media-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
      .v1115-media-card{
        border:1px solid var(--line);
        border-radius:11px;
        overflow:hidden;
        background:#fbfdff;
        min-width:0;
      }
      .v1115-media-card img{
        width:100%;
        height:210px;
        object-fit:contain;
        background:#f3f6f8;
        display:block;
      }
      .v1115-media-body{padding:12px}
      .v1115-media-body h4{margin:0 0 5px;font-size:14px}
      .v1115-media-body p{margin:4px 0;color:var(--muted);font-size:12px;line-height:1.4}
      .v1115-chip{
        display:inline-flex;
        align-items:center;
        border-radius:999px;
        padding:3px 7px;
        margin-bottom:7px;
        background:#eef5fb;
        color:#41627f;
        font-size:11px;
        font-weight:800;
      }
      .v1115-empty{
        padding:18px;
        border:1px dashed var(--line);
        border-radius:10px;
        color:var(--muted);
        background:#fbfdff;
      }
      .v1115-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}

      /* 3. Cell/tissue protocols */
      .v1115-protocols{
        margin-top:18px;
        border-top:1px solid var(--line);
        padding-top:18px;
      }
      .v1115-protocols > h4{margin:0 0 6px}
      .v1115-protocol-intro{margin:0 0 12px;color:var(--muted);font-size:13px;line-height:1.45}
      .v1115-protocol-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      .v1115-protocol-card{
        border:1px solid var(--line);
        border-radius:11px;
        padding:14px;
        background:#fbfdff;
      }
      .v1115-protocol-card h5{margin:0 0 6px;font-size:15px}
      .v1115-protocol-card p{margin:5px 0;color:var(--muted);font-size:13px;line-height:1.45}
      .v1115-warning{
        margin-top:10px;
        padding:9px 10px;
        border-radius:8px;
        background:#fff7df;
        color:#795914;
        font-size:12px;
        line-height:1.4;
      }
      @media(max-width:1050px){
        .v1115-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:760px){
        .v1115-media-grid,.v1115-protocol-grid{grid-template-columns:1fr}
        .v1115-media-head{flex-direction:column}
      }
    `;
    document.head.appendChild(s);
  }

  const norm = s => normalizeName(String(s||''));
  const directImage = link => /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(String(link||'').trim());
  const http = link => /^https?:\/\//i.test(String(link||'').trim());

  function selectedAntibody(){
    return rowById('Antibodies',state.selectedAntibody);
  }

  function docsFor(a){
    return rows(state.data.Documents).filter(d=>Number(d.Antibody)===Number(a?.id));
  }

  function mediaDocs(a){
    return docsFor(a).filter(d=>{
      const hay=norm(`${d.Type||''} ${d.Title||''} ${d.Notes||''}`);
      return /image|capture|western|wb\b|immuno|icc|ihc|if\b|microscop|validation/.test(hay) || directImage(d.Link);
    });
  }

  function techniqueFor(d){
    const h=norm(`${d.Type||''} ${d.Title||''} ${d.Notes||''}`);
    if(/western|wb\b/.test(h)) return 'WB';
    if(/ihc|tissu|tissue/.test(h)) return 'IHC / tissu';
    if(/icc|immunocyt|cell/.test(h)) return 'IF / cellules';
    if(/if\b|immunofluor|immunostain/.test(h)) return 'Immunofluorescence';
    return 'Validation';
  }

  function mediaCard(d){
    const link=String(d.Link||'').trim();
    const tech=techniqueFor(d);
    const isImg=directImage(link);
    return `<article class="v1115-media-card">
      ${isImg?`<img src="${esc(link)}" alt="${esc(d.Title||tech)}" loading="lazy" referrerpolicy="no-referrer">`:''}
      <div class="v1115-media-body">
        <span class="v1115-chip">${esc(tech)}</span>
        <h4>${esc(d.Title||'Image de validation')}</h4>
        ${d.Notes?`<p>${esc(d.Notes)}</p>`:''}
        ${http(link)?`<div class="v1115-actions"><a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${isImg?'Ouvrir l’image':'Ouvrir la source'} ↗</a></div>`:''}
      </div>
    </article>`;
  }

  function showAddValidationImage(a){
    modal(`<h2>Ajouter une image de validation — ${esc(a.Name||a.FullName)}</h2>
      <p class="subtitle">Ajoute une image produite par le labo ou une image que vous avez le droit d'afficher. Les images fournisseur restent accessibles via leur page produit.</p>
      <div class="form-grid">
        <div class="field"><label>Technique *</label>
          <select id="v1115MediaTech">
            <option>WB</option>
            <option>IF / cellules</option>
            <option>IHC / tissu</option>
            <option>Immunofluorescence</option>
            <option>Autre validation</option>
          </select>
        </div>
        <div class="field"><label>Titre *</label><input id="v1115MediaTitle" placeholder="Ex. WB — MFN2, MEF WT/DKO"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>URL de l’image ou de la ressource *</label><input id="v1115MediaLink" type="url" placeholder="https://…"></div>
      <div class="field" style="margin-top:12px"><label>Source / conditions / commentaire</label><textarea id="v1115MediaNotes" rows="5" placeholder="Ex. image labo, fixation, dilution, tissu/cellules, source…"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="v1115MediaCancel">Annuler</button>
        <button class="btn btn-primary" id="v1115MediaSave">Ajouter</button>
      </div>`);
    $('#v1115MediaCancel').onclick=closeModal;
    $('#v1115MediaSave').onclick=async()=>{
      const tech=$('#v1115MediaTech').value;
      const title=$('#v1115MediaTitle').value.trim();
      const link=$('#v1115MediaLink').value.trim();
      if(!title || !http(link)) return toast('Titre et URL http(s) valides sont obligatoires.');
      if(!state.connected) return toast('Connexion Grist requise.');
      try{
        await grist.docApi.applyUserActions([['AddRecord','Documents',null,{
          Antibody:Number(a.id),
          Title:title,
          Type:'Image / capture',
          Link:link,
          Notes:`Technique : ${tech}.${$('#v1115MediaNotes').value.trim()?` ${$('#v1115MediaNotes').value.trim()}`:''}`
        }]]);
        closeModal();
        await loadAll();
        toast('Image de validation ajoutée.');
        go('antibody-detail');
      }catch(e){
        console.error(e);
        toast(`Erreur : ${e.message||e}`);
      }
    };
  }

  function augmentOverview(){
    injectStyles();
    const active=document.querySelector('[data-v111-tab="overview"].active');
    const body=document.querySelector('#v111TabBody');
    if(!active || !body || document.getElementById('v1115Media')) return;
    const a=selectedAntibody();
    if(!a) return;

    const media=mediaDocs(a);
    const section=document.createElement('section');
    section.id='v1115Media';
    section.className='v1115-media';
    section.innerHTML=`
      <div class="v1115-media-head">
        <div>
          <h3>Images de validation</h3>
          <p>WB, immunofluorescence, immunostaining/IHC ou autres images représentatives. Les images affichées directement ici proviennent des ressources validées et ajoutées dans <b>Documents</b>.</p>
        </div>
        <button class="btn btn-primary" id="v1115AddMedia">+ Ajouter une image</button>
      </div>
      ${media.length
        ? `<div class="v1115-media-grid">${media.map(mediaCard).join('')}</div>`
        : `<div class="v1115-empty">Aucune image de validation n’a encore été validée pour cet anticorps.</div>`}
      <div class="v1115-actions">
        ${http(a.Website)?`<a class="btn" href="${esc(a.Website)}" target="_blank" rel="noopener noreferrer">Voir les validations fournisseur ↗</a>`:''}
        <button class="btn" id="v1115GoDocuments">Documents et datasheet</button>
      </div>
    `;
    body.appendChild(section);
    $('#v1115AddMedia').onclick=()=>showAddValidationImage(a);
    $('#v1115GoDocuments').onclick=()=>document.querySelector('[data-v111-tab="documents"]')?.click();
  }

  function existingDoc(a,link,title){
    return docsFor(a).some(d =>
      (link && String(d.Link||'').trim()===String(link).trim()) ||
      (title && norm(d.Title)===norm(title))
    );
  }

  async function addProtocol(a,item,button){
    if(existingDoc(a,item.link,item.title)){
      button.disabled=true; button.textContent='Déjà ajouté';
      return toast('Ce protocole est déjà dans Documents.');
    }
    if(!state.connected) return toast('Connexion Grist requise.');
    try{
      await grist.docApi.applyUserActions([['AddRecord','Documents',null,{
        Antibody:Number(a.id),
        Title:item.title,
        Type:'Protocole',
        Link:item.link,
        Notes:item.notes
      }]]);
      await loadAll();
      button.disabled=true; button.textContent='Ajouté ✓';
      toast('Protocole ajouté aux Documents.');
    }catch(e){
      console.error(e);
      toast(`Erreur : ${e.message||e}`);
    }
  }

  function protocolSet(a){
    const supplier=String(a.Supplier||'');
    const apps=norm(a.ApplicationsText);
    const isCST=/cell\s*signaling|cst\b/i.test(supplier);
    const isAbcam=/abcam/i.test(supplier);
    const isThermo=/thermo|fisher|invitrogen/i.test(supplier);

    if(isCST){
      return {
        source:'Cell Signaling Technology',
        cell:{
          title:'Protocole cellules — Immunofluorescence / ICC (CST)',
          link:'https://www.cellsignal.com/protocols/221',
          note:'Protocole officiel CST pour cellules cultivées (IF/ICC).'
        },
        tissue:{
          title:/ihc/.test(apps)?'Protocole tissus — IHC (CST)':'Protocole tissus — Immunofluorescence sur tissu congelé (CST)',
          link:/ihc/.test(apps)?'https://www.cellsignal.com/science-resources/ihc-protocols':'https://www.cellsignal.com/protocols/222',
          note:/ihc/.test(apps)?'Ressource officielle CST pour IHC tissulaire.':'Protocole officiel CST pour immunofluorescence sur coupes congelées.'
        }
      };
    }

    if(isThermo){
      return {
        source:'Thermo Fisher Scientific',
        cell:{
          title:'Protocole cellules — Immunofluorescence (Thermo Fisher)',
          link:'https://www.thermofisher.com/fr/fr/home/life-science/antibodies/antibodies-learning-center/antibodies-resource-library/antibody-application-testing-protocols/immunofluorescence-protocol-adherent-suspension-application-testing.html',
          note:'Protocole officiel Thermo Fisher pour immunofluorescence sur cellules adhérentes ou en suspension.'
        },
        tissue:{
          title:'Protocole tissus — IHC paraffine (Thermo Fisher)',
          link:'https://www.thermofisher.com/fr/fr/home/life-science/antibodies/antibodies-learning-center/antibodies-resource-library/antibody-application-testing-protocols/immunohistochemistry-paraffin-protocol-application-testing.html',
          note:'Protocole officiel Thermo Fisher pour immunohistochimie sur tissu paraffiné.'
        }
      };
    }

    if(isAbcam){
      return {
        source:'Abcam',
        cell:{
          title:'Protocole cellules — ICC / immunofluorescence (Abcam)',
          link:'https://www.abcam.com/en-us/technical-resources/protocols/icc-protocol',
          note:'Protocole officiel Abcam pour ICC/IF sur cellules.'
        },
        tissue:{
          title:'Protocoles tissus — IHC paraffine / congelé (Abcam)',
          link:'https://www.abcam.com/en-us/technical-resources/applications/immunohistochemistry/protocols',
          note:'Ressource officielle Abcam regroupant les protocoles IHC tissulaires.'
        }
      };
    }

    // General trusted starting point when supplier-specific protocol mapping is unavailable.
    return {
      source:'Protocoles généraux de référence',
      cell:{
        title:'Protocole cellules — ICC / immunofluorescence (Abcam, général)',
        link:'https://www.abcam.com/en-us/technical-resources/protocols/icc-protocol',
        note:'Protocole général de référence pour cellules. À adapter à la datasheet de cet anticorps.'
      },
      tissue:{
        title:'Protocoles tissus — IHC paraffine / congelé (Abcam, général)',
        link:'https://www.abcam.com/en-us/technical-resources/applications/immunohistochemistry/protocols',
        note:'Protocoles généraux pour tissus. À adapter à la datasheet de cet anticorps.'
      }
    };
  }

  function protocolCard(a,item,kind,source){
    const already=existingDoc(a,item.link,item.title);
    const notes=`${item.note} Source : ${source}. Applications déclarées pour l’anticorps : ${a.ApplicationsText||'non renseignées'}. Vérifier en priorité la datasheet de la référence ${a.CatalogNumber||'non renseignée'} pour la dilution, la fixation, la perméabilisation et l’éventuel antigen retrieval.`;
    return `<article class="v1115-protocol-card" data-v1115-protocol
      data-title="${esc(item.title)}"
      data-link="${esc(item.link)}"
      data-notes="${esc(notes)}">
      <span class="v1115-chip">${kind}</span>
      <h5>${esc(item.title)}</h5>
      <p>${esc(item.note)}</p>
      <p><b>Applications renseignées :</b> ${esc(a.ApplicationsText||'—')}</p>
      <div class="v1115-warning">Point de départ uniquement : les conditions doivent être ajustées à la datasheet de cette référence, car cellules et tissus peuvent nécessiter des fixations, perméabilisations et récupérations antigéniques différentes.</div>
      <div class="v1115-actions">
        <a class="btn btn-sm" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Ouvrir le protocole officiel ↗</a>
        <button class="btn btn-sm btn-primary" data-v1115-addprotocol ${already?'disabled':''}>${already?'Déjà ajouté':'Ajouter aux documents'}</button>
      </div>
    </article>`;
  }

  function augmentProtocols(){
    injectStyles();
    const enrichment=document.getElementById('v1114Enrichment');
    if(!enrichment || document.getElementById('v1115Protocols')) return;
    const a=selectedAntibody();
    if(!a) return;
    const set=protocolSet(a);
    const section=document.createElement('section');
    section.id='v1115Protocols';
    section.className='v1115-protocols';
    section.innerHTML=`
      <h4>Protocoles proposés : cellules et tissus</h4>
      <p class="v1115-protocol-intro">Deux workflows sont séparés volontairement. La datasheet de l’anticorps reste prioritaire lorsqu’elle donne des conditions spécifiques.</p>
      <div class="v1115-protocol-grid">
        ${protocolCard(a,set.cell,'CELLULES',set.source)}
        ${protocolCard(a,set.tissue,'TISSUS',set.source)}
      </div>`;
    enrichment.appendChild(section);

    section.querySelectorAll('[data-v1115-addprotocol]').forEach(btn=>{
      if(btn.disabled) return;
      btn.onclick=()=>{
        const card=btn.closest('[data-v1115-protocol]');
        addProtocol(a,{
          title:card.dataset.title,
          link:card.dataset.link,
          notes:card.dataset.notes
        },btn);
      };
    });
  }

  function refreshAugmentations(){
    injectStyles();
    augmentOverview();
    augmentProtocols();
  }

  // Re-augment after tab changes / document writes / route re-renders.
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-v111-tab]')){
      setTimeout(refreshAugmentations,0);
      setTimeout(refreshAugmentations,250);
    }
  });

  const observer=new MutationObserver(()=>refreshAugmentations());
  observer.observe(document.body,{subtree:true,childList:true});

  refreshAugmentations();

  window.BioDynaMitAntibodyExperienceV1115={
    version:VERSION,
    refresh:refreshAugmentations
  };
})();
