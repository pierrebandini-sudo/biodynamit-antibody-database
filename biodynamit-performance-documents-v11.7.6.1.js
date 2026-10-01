/* BioDynaMit v11.7.6.1 — Performance + images de microscopie
   Additif et réversible :
   - aucun modèle 3D modifié ;
   - aucun fichier métier historique réécrit ;
   - cache mémoire des conversions rows() et inventoryData() ;
   - pagination visuelle des grandes listes anticorps ;
   - upload natif Grist d'images liées aux Documents / InventoryDocuments ;
   - galerie avec chargement différé des miniatures.
*/
(function(){
  'use strict';

  const VERSION='11.7.6.1';
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const PERF=window.BioDynaMitPerfV1176=window.BioDynaMitPerfV1176||{
    rowHits:0,rowMisses:0,inventoryHits:0,inventoryMisses:0,lastInvalidation:'initialisation'
  };

  /* ====================================================================== */
  /* 1. PERFORMANCE                                                         */
  /* ====================================================================== */

  let rowCache=new WeakMap();
  const originalRows=window.rows;
  let originalInventoryData=null;
  const inventoryCache=new Map();
  const objectIds=new WeakMap();
  let nextObjectId=1;

  function objectId(v){
    if(!v || (typeof v!=='object' && typeof v!=='function'))return String(v);
    if(!objectIds.has(v))objectIds.set(v,nextObjectId++);
    return objectIds.get(v);
  }

  function fastRows(table){
    if(!originalRows)return [];
    if(!table || typeof table!=='object')return originalRows(table);
    const cached=rowCache.get(table);
    if(cached){
      PERF.rowHits++;
      return cached;
    }
    PERF.rowMisses++;
    const result=originalRows(table);
    rowCache.set(table,result);
    return result;
  }

  function tableRef(name){
    return window.state?.data?.[name] || ns.data?.[name] || null;
  }

  function inventorySignature(type){
    return [
      type,
      objectId(tableRef('InventoryItems')),
      objectId(tableRef('InventoryAttributes')),
      objectId(tableRef('InventoryUnits')),
      objectId(tableRef('InventoryContainers')),
      objectId(tableRef('InventoryPositions'))
    ].join('|');
  }

  function invalidateCaches(reason='données modifiées'){
    rowCache=new WeakMap();
    inventoryCache.clear();
    PERF.lastInvalidation=reason;
  }

  function installPerformanceCache(){
    if(typeof originalRows==='function'){
      window.rows=fastRows;
      try{ rows=fastRows; }catch(_){}
    }

    if(typeof ns.inventoryData==='function'){
      originalInventoryData=ns.inventoryData;
      ns.inventoryData=function(type){
        const sig=inventorySignature(type);
        const cached=inventoryCache.get(type);
        if(cached && cached.signature===sig){
          PERF.inventoryHits++;
          return cached.value;
        }
        PERF.inventoryMisses++;
        const value=originalInventoryData(type);
        inventoryCache.set(type,{signature:sig,value});
        return value;
      };
    }

    if(typeof window.loadAll==='function'){
      const previousLoadAll=window.loadAll;
      window.loadAll=async function(){
        const result=await previousLoadAll.apply(this,arguments);
        invalidateCaches('loadAll');
        return result;
      };
      try{ loadAll=window.loadAll; }catch(_){}
    }
  }

  // Pagination visuelle : réduit le coût de layout/paint des tableaux les plus longs.
  const PAGE_SIZE=50;
  function paginateUnifiedTable(){
    const host=document.querySelector('.u126-antibody-list');
    if(!host)return;
    const table=host.querySelector('table.table');
    if(!table || table.dataset.v1176Paged==='1')return;
    const body=table.tBodies?.[0];
    if(!body)return;
    const rows=[...body.querySelectorAll('tr[data-u126-row]')];
    if(rows.length<=PAGE_SIZE)return;

    table.dataset.v1176Paged='1';
    let page=0;
    const pages=Math.ceil(rows.length/PAGE_SIZE);
    const pager=document.createElement('div');
    pager.className='v1176-pager row';
    pager.innerHTML=`<button class="btn btn-sm" data-v1176-prev>← Précédent</button>
      <span class="subtitle" data-v1176-page></span>
      <button class="btn btn-sm" data-v1176-next>Suivant →</button>`;

    const wrapper=table.closest('.table-wrap')||table.parentElement;
    wrapper.insertAdjacentElement('afterend',pager);

    const draw=()=>{
      const start=page*PAGE_SIZE,end=start+PAGE_SIZE;
      rows.forEach((r,i)=>{r.style.display=(i>=start&&i<end)?'':'none'});
      pager.querySelector('[data-v1176-page]').textContent=`${page+1} / ${pages} · ${rows.length} références`;
      pager.querySelector('[data-v1176-prev]').disabled=page===0;
      pager.querySelector('[data-v1176-next]').disabled=page>=pages-1;
    };
    pager.querySelector('[data-v1176-prev]').onclick=()=>{if(page>0){page--;draw();wrapper.scrollIntoView({block:'start'})}};
    pager.querySelector('[data-v1176-next]').onclick=()=>{if(page<pages-1){page++;draw();wrapper.scrollIntoView({block:'start'})}};
    draw();
  }

  let paginationQueued=false;
  function queuePagination(){
    if(paginationQueued)return;
    paginationQueued=true;
    requestAnimationFrame(()=>{
      paginationQueued=false;
      paginateUnifiedTable();
    });
  }

  /* ====================================================================== */
  /* 2. DOCUMENTS / IMAGES DE MICROSCOPIE                                   */
  /* ====================================================================== */

  const ATTACH_COL='Attachments';
  const IMG_TYPE='Image de microscopie';
  let readTokenPromise=null;

  function esc2(v){
    if(typeof window.esc==='function')return window.esc(v);
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function tableRows(name){
    try{return fastRows(tableRef(name))||[]}catch(_){return[]}
  }

  function tableHasColumn(name,col){
    const raw=tableRef(name);
    if(!raw)return false;
    if(Object.prototype.hasOwnProperty.call(raw,col))return true;
    return tableRows(name).some(r=>Object.prototype.hasOwnProperty.call(r,col));
  }

  function securityRole(){
    return (window.BioDynaMitSecurityV113||window.BioDynaMitV113||{})?.role||'';
  }
  function canSetupAttachments(){
    const role=securityRole();
    // Une copie TEST peut être encore "unconfigured" même pour son Owner.
    // Le moteur de sécurité BioDynaMit traite déjà ce rôle comme rôle de setup.
    return role==='admin' || role==='unconfigured' || role==='';
  }

  function attachmentIds(value){
    if(value===null||value===undefined||value==='')return[];
    if(Array.isArray(value)){
      const a=value[0]==='L'?value.slice(1):value;
      return a.map(Number).filter(n=>Number.isFinite(n)&&n>0);
    }
    if(typeof value==='number')return value>0?[value]:[];
    if(typeof value==='string'){
      const s=value.trim();
      if(!s)return[];
      try{return attachmentIds(JSON.parse(s))}catch(_){}
      return s.split(/[,\s]+/).map(Number).filter(n=>Number.isFinite(n)&&n>0);
    }
    return[];
  }

  async function getToken(readOnly=true){
    if(readOnly && readTokenPromise)return readTokenPromise;
    const p=grist.docApi.getAccessToken({readOnly});
    if(readOnly){
      readTokenPromise=p;
      setTimeout(()=>{readTokenPromise=null},45000);
    }
    return p;
  }

  function downloadUrl(tokenInfo,id){
    const base=String(tokenInfo.baseUrl||'').replace(/\/$/,'');
    return `${base}/attachments/${encodeURIComponent(id)}/download?auth=${encodeURIComponent(tokenInfo.token)}`;
  }

  async function ensureAttachmentColumns(){
    if(!window.state?.connected)throw Error('Connexion Grist requise.');
    const targets=['Documents','InventoryDocuments'].filter(t=>window.state.tables?.includes(t));
    const actions=[];
    for(const table of targets){
      let raw=tableRef(table);
      if(!raw){
        try{raw=await grist.docApi.fetchTable(table)}catch(_){}
      }
      const has=raw && (
        Object.prototype.hasOwnProperty.call(raw,ATTACH_COL) ||
        fastRows(raw).some(r=>Object.prototype.hasOwnProperty.call(r,ATTACH_COL))
      );
      if(!has){
        actions.push(['AddColumn',table,ATTACH_COL,{type:'Attachments',isFormula:false}]);
      }
    }
    if(actions.length){
      await grist.docApi.applyUserActions(actions);
      await window.loadAll?.();
    }
    return actions.length;
  }

  async function uploadFiles(files){
    const list=[...files].filter(Boolean);
    if(!list.length)throw Error('Sélectionne au moins une image.');
    const tokenInfo=await getToken(false);
    const formData=new FormData();
    list.forEach(file=>formData.append('upload',file,file.name));
    const base=String(tokenInfo.baseUrl||'').replace(/\/$/,'');
    let response;
    try{
      response=await fetch(`${base}/attachments?auth=${encodeURIComponent(tokenInfo.token)}`,{
        method:'POST',
        body:formData,
        headers:{'X-Requested-With':'XMLHttpRequest'}
      });
    }catch(err){
      throw Error(`Upload Grist inaccessible (${err?.message||err}). Le serveur peut temporairement bloquer les pièces jointes depuis les widgets.`);
    }
    if(!response.ok)throw Error(`Upload Grist échoué (${response.status} ${response.statusText}).`);
    const result=await response.json();
    const ids=Array.isArray(result)?result.map(Number).filter(n=>n>0):[];
    if(ids.length!==list.length)throw Error(`Grist a renvoyé ${ids.length} pièce(s) jointe(s) pour ${list.length} fichier(s).`);
    return ids;
  }

  function microscopyNotes(meta){
    const lines=[];
    if(meta.application)lines.push(`Application : ${meta.application}`);
    if(meta.sample)lines.push(`Échantillon : ${meta.sample}`);
    if(meta.microscope)lines.push(`Microscope : ${meta.microscope}`);
    if(meta.objective)lines.push(`Objectif : ${meta.objective}`);
    if(meta.channels)lines.push(`Canaux / fluorophores : ${meta.channels}`);
    if(meta.date)lines.push(`Date d’acquisition : ${meta.date}`);
    if(meta.notes)lines.push(`Notes : ${meta.notes}`);
    return lines.join('\n');
  }

  async function openMicroscopyUploader(ctx){
    const table=ctx.kind==='primary'?'Documents':'InventoryDocuments';
    if(!tableHasColumn(table,ATTACH_COL)){
      if(!canSetupAttachments()){
        return window.toast?.('L’upload d’images doit d’abord être activé par un administrateur/Owner.');
      }
      const ok=confirm('Activer maintenant l’upload d’images dans Grist ? Cette opération ajoute uniquement une colonne de type Pièce jointe aux tables documentaires.');
      if(!ok)return;
      try{
        const n=await ensureAttachmentColumns();
        window.toast?.(n?`Upload d’images activé (${n} colonne(s) créée(s)).`:'Upload déjà activé.');
      }catch(err){
        console.error(err);
        return window.toast?.(`Activation impossible : ${err?.message||err}`);
      }
    }
    microscopyModal(ctx);
  }

  function microscopyModal(ctx){
    const defaultTitle=`${ctx.name||'Anticorps'} — image de microscopie`;
    window.modal?.(`<div class="v1176-upload-modal">
      <h2>Ajouter des images de microscopie</h2>
      <p class="subtitle">Les fichiers seront stockés comme pièces jointes dans Grist et liés à cette fiche.</p>
      <div class="field"><label>Images *</label>
        <input id="v1176Files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/tiff,.tif,.tiff">
        <small>PNG/JPEG/WEBP/TIFF. Pour les données brutes lourdes (ND2, CZI, LIF…), privilégier le serveur du labo et ajouter un lien.</small>
      </div>
      <div class="field" style="margin-top:12px"><label>Titre *</label><input id="v1176Title" value="${esc2(defaultTitle)}"></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Application</label><input id="v1176Application" placeholder="IF, IHC…"></div>
        <div class="field"><label>Échantillon</label><input id="v1176Sample" placeholder="MEF, nerf sciatique…"></div>
        <div class="field"><label>Microscope</label><input id="v1176Microscope" placeholder="Nikon Ti2, SP8…"></div>
        <div class="field"><label>Objectif</label><input id="v1176Objective" placeholder="60×, 100×…"></div>
        <div class="field"><label>Canaux / fluorophores</label><input id="v1176Channels" placeholder="DAPI, AF488, AF647…"></div>
        <div class="field"><label>Date d’acquisition</label><input id="v1176Date" type="date"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Notes</label><textarea id="v1176Notes" rows="3"></textarea></div>
      <div id="v1176UploadStatus" class="subtitle" style="margin-top:10px"></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="v1176Cancel">Annuler</button>
        <button class="btn btn-primary" id="v1176Save">Uploader et lier</button>
      </div>
    </div>`);
    document.querySelector('#v1176Cancel').onclick=window.closeModal;
    document.querySelector('#v1176Save').onclick=()=>saveMicroscopy(ctx);
  }

  async function saveMicroscopy(ctx){
    const btn=document.querySelector('#v1176Save');
    const status=document.querySelector('#v1176UploadStatus');
    const files=document.querySelector('#v1176Files')?.files;
    const title=document.querySelector('#v1176Title')?.value.trim();
    if(!files?.length)return window.toast?.('Sélectionne au moins une image.');
    if(!title)return window.toast?.('Le titre est obligatoire.');

    const total=[...files].reduce((s,f)=>s+Number(f.size||0),0);
    if(total>100*1024*1024){
      const ok=confirm('Les fichiers sélectionnés dépassent 100 Mo. Pour préserver les performances de la BDD, il est préférable de stocker les données brutes sur le serveur du labo. Continuer quand même ?');
      if(!ok)return;
    }

    btn.disabled=true;
    btn.textContent='Upload…';
    status.textContent=`Envoi de ${files.length} fichier(s) vers Grist…`;
    try{
      const ids=await uploadFiles(files);
      status.textContent='Fichiers reçus par Grist. Création du lien avec la fiche…';
      const notes=microscopyNotes({
        application:document.querySelector('#v1176Application')?.value.trim(),
        sample:document.querySelector('#v1176Sample')?.value.trim(),
        microscope:document.querySelector('#v1176Microscope')?.value.trim(),
        objective:document.querySelector('#v1176Objective')?.value.trim(),
        channels:document.querySelector('#v1176Channels')?.value.trim(),
        date:document.querySelector('#v1176Date')?.value,
        notes:document.querySelector('#v1176Notes')?.value.trim()
      });

      let action;
      if(ctx.kind==='primary'){
        action=['AddRecord','Documents',null,{
          Antibody:Number(ctx.item.id),Title:title,Type:IMG_TYPE,Link:'',Notes:notes,
          [ATTACH_COL]:['L',...ids]
        }];
      }else{
        action=['AddRecord','InventoryDocuments',null,{
          Item:Number(ctx.item.id),InventoryType:ctx.type,Title:title,Type:IMG_TYPE,Link:'',Notes:notes,
          [ATTACH_COL]:['L',...ids]
        }];
      }
      await grist.docApi.applyUserActions([action]);
      await window.loadAll?.();
      window.closeModal?.();
      window.toast?.(`${ids.length} image(s) ajoutée(s).`);
      if(ctx.kind==='primary'){
        window.antibodyDetail?.();
      }else{
        ns.renderInventory?.(ctx.type);
      }
    }catch(err){
      console.error('BioDynaMit microscopy upload:',err);
      status.textContent=`Erreur : ${err?.message||err}`;
      window.toast?.(`Upload impossible : ${err?.message||err}`);
      btn.disabled=false;
      btn.textContent='Uploader et lier';
    }
  }

  function contextFromPage(){
    if(window.state?.route==='antibody-detail' && window.state?.selectedAntibody){
      const item=tableRows('Antibodies').find(a=>Number(a.id)===Number(window.state.selectedAntibody));
      if(item)return{kind:'primary',item,name:item.Name||item.FullName||item.Code};
    }
    const route=String(window.state?.route||'');
    if(route.startsWith('inv:')){
      const type=route.slice(4);
      const selected=ns.inventorySelected?.[type];
      if(selected!==null&&selected!==undefined){
        try{
          const data=ns.inventoryData?.(type);
          const item=data?.items?.find(x=>String(x.id)===String(selected)||String(x.code)===String(selected));
          if(item)return{kind:'inventory',type,item,name:item.name||item.catalogNumber||item.code};
        }catch(_){}
      }
    }
    return null;
  }

  function microscopyDocs(ctx){
    if(ctx.kind==='primary'){
      return tableRows('Documents').filter(d=>Number(d.Antibody)===Number(ctx.item.id) &&
        (attachmentIds(d[ATTACH_COL]).length || /image|micros/i.test(String(d.Type||''))));
    }
    return tableRows('InventoryDocuments').filter(d=>Number(d.Item)===Number(ctx.item.id) &&
      d.InventoryType===ctx.type &&
      (attachmentIds(d[ATTACH_COL]).length || /image|micros/i.test(String(d.Type||''))));
  }

  function gallerySkeleton(ctx){
    const docs=microscopyDocs(ctx);
    if(!docs.length)return '<div class="empty">Aucune image de microscopie liée à cet anticorps.</div>';
    return `<div class="v1176-gallery">${docs.map((d,di)=>{
      const ids=attachmentIds(d[ATTACH_COL]);
      return `<article class="v1176-image-card">
        <div class="v1176-image-head"><b>${esc2(d.Title||'Image de microscopie')}</b><span class="pill neutral">${ids.length} fichier${ids.length>1?'s':''}</span></div>
        ${d.Notes?`<p class="v1176-image-notes">${esc2(d.Notes).replace(/\n/g,'<br>')}</p>`:''}
        ${ids.length?`<div class="v1176-thumbs">${ids.map((id,i)=>`<div class="v1176-thumb" data-v1176-attachment="${id}">
          <div class="v1176-thumb-loading">Chargement…</div>
          <img loading="lazy" alt="${esc2(d.Title||'Image')} ${i+1}">
          <a class="btn btn-sm v1176-download" target="_blank" rel="noopener noreferrer">Ouvrir / télécharger</a>
        </div>`).join('')}</div>`:(d.Link?`<a href="${esc2(d.Link)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">Ouvrir l’image ↗</a>`:'')}
      </article>`;
    }).join('')}</div>`;
  }

  async function hydrateGallery(root){
    const nodes=[...root.querySelectorAll('[data-v1176-attachment]')];
    if(!nodes.length)return;
    try{
      const token=await getToken(true);
      for(const node of nodes){
        const id=Number(node.dataset.v1176Attachment);
        const url=downloadUrl(token,id);
        const img=node.querySelector('img');
        const link=node.querySelector('.v1176-download');
        const loading=node.querySelector('.v1176-thumb-loading');
        link.href=url;
        img.onload=()=>{loading.style.display='none';img.style.display='block'};
        img.onerror=()=>{loading.textContent='Aperçu indisponible (ex. TIFF)';img.style.display='none'};
        img.src=url;
      }
    }catch(err){
      console.error('BioDynaMit gallery:',err);
      nodes.forEach(n=>{
        const l=n.querySelector('.v1176-thumb-loading');
        if(l)l.textContent='Aperçu indisponible';
      });
    }
  }

  function injectDocumentStyles(){
    if(document.getElementById('v1176Styles'))return;
    const style=document.createElement('style');
    style.id='v1176Styles';
    style.textContent=`
      .v1176-microscopy{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}
      .v1176-microscopy-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .v1176-microscopy-head h3{margin:0 0 4px}
      .v1176-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
      .v1176-image-card{border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px;content-visibility:auto;contain-intrinsic-size:260px}
      .v1176-image-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .v1176-image-notes{font-size:12px;line-height:1.45;color:var(--muted);white-space:normal}
      .v1176-thumbs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
      .v1176-thumb{min-height:150px;border:1px solid var(--line);border-radius:9px;padding:6px;display:flex;flex-direction:column;gap:6px;justify-content:center;background:#f8fbfd}
      .v1176-thumb img{display:none;width:100%;height:145px;object-fit:contain;border-radius:6px;background:#0d1720}
      .v1176-thumb-loading{text-align:center;color:var(--muted);font-size:12px}
      .v1176-pager{justify-content:center;align-items:center;gap:12px;margin:12px 0 4px}
      .v1176-setup{margin-top:12px}
      @media(max-width:800px){.v1176-gallery{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function augmentDocuments(){
    injectDocumentStyles();
    const ctx=contextFromPage();
    if(!ctx)return;

    const primaryBtn=document.querySelector('#addDoc');
    const invBtn=document.querySelector('#v112AddDocument');
    const addBtn=primaryBtn||invBtn;
    if(!addBtn)return;

    const body=ctx.kind==='primary'?document.querySelector('#v111TabBody'):addBtn.closest('.card')?.parentElement;
    if(!body || body.querySelector('#v1176Microscopy'))return;

    const table=ctx.kind==='primary'?'Documents':'InventoryDocuments';
    const hasAttachments=tableHasColumn(table,ATTACH_COL);

    if(!document.querySelector('#v1176AddMicroscopy')){
      const b=document.createElement('button');
      b.className='btn btn-primary';
      b.id='v1176AddMicroscopy';
      b.textContent='+ Images de microscopie';
      b.title=hasAttachments?'Uploader des images de microscopie':'Activer puis uploader des images de microscopie';
      b.onclick=()=>openMicroscopyUploader(ctx);
      addBtn.insertAdjacentElement('afterend',b);
    }

    const section=document.createElement('section');
    section.id='v1176Microscopy';
    section.className='v1176-microscopy';
    section.innerHTML=`<div class="v1176-microscopy-head"><div>
      <h3>Images de microscopie</h3>
      <p class="subtitle">Images représentatives obtenues avec cet anticorps. Les données brutes volumineuses restent de préférence sur le serveur du laboratoire.</p>
      </div></div>
      ${hasAttachments?gallerySkeleton(ctx):`<div class="banner v1176-setup">
        <b>Upload non initialisé.</b> Il faut ajouter une colonne Grist de type Pièce jointe aux tables documentaires.
        ${canSetupAttachments()?'<button class="btn btn-sm btn-primary" id="v1176EnableAttachments" style="margin-left:8px">Activer l’upload d’images</button>':'<br><small>Demande à un administrateur/Owner BioDynaMit d’activer cette fonction une seule fois.</small>'}
      </div>`}`;
    body.appendChild(section);

    if(hasAttachments){
      hydrateGallery(section);
    }else{
      const setup=section.querySelector('#v1176EnableAttachments');
      if(setup)setup.onclick=async()=>{
        setup.disabled=true;
        setup.textContent='Initialisation…';
        try{
          const n=await ensureAttachmentColumns();
          window.toast?.(n?`Upload d’images activé (${n} colonne(s) créée(s)).`:'Upload déjà activé.');
          if(ctx.kind==='primary')window.antibodyDetail?.();
          else ns.renderInventory?.(ctx.type);
        }catch(err){
          console.error(err);
          setup.disabled=false;
          setup.textContent='Activer l’upload d’images';
          window.toast?.(`Initialisation impossible : ${err?.message||err}`);
        }
      };
    }
  }

  /* ====================================================================== */
  /* 3. INITIALISATION                                                       */
  /* ====================================================================== */

  // Installer après les correctifs v11.7.5.7 qui assainissent les attributs.
  setTimeout(()=>{
    installPerformanceCache();
    injectDocumentStyles();
    queuePagination();
    augmentDocuments();
  },0);

  const observer=new MutationObserver(()=>{
    queuePagination();
    // Debounce léger pour éviter de ré-analyser le DOM à chaque micro-mutation.
    clearTimeout(observer._v1176Timer);
    observer._v1176Timer=setTimeout(augmentDocuments,30);
  });
  observer.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});

  document.addEventListener('click',ev=>{
    if(ev.target.closest?.('[data-v111-tab="documents"],[data-v112-detail-tab="documents"],[data-v112-tab="documents"]')){
      setTimeout(augmentDocuments,0);
    }
  },true);

  window.BioDynaMitV1176={
    version:VERSION,
    performance:PERF,
    invalidateCaches,
    ensureAttachmentColumns,
    openMicroscopyUploader,
    uploadFiles,
    attachmentIds,
    augmentDocuments
  };
})();
