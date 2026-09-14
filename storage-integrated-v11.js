
/* BioDynaMit integrated storage v11
   Test-only integration layer.
   - Reuses app.js for the complete application and Grist connection.
   - Reuses the validated v10 scene/model modules unchanged.
   - Replaces only storage(), box3d() and openBoxForVial().
   - No schema creation or migration is triggered here.
*/
(() => {
  'use strict';

  const SV11 = {
    scene: null,
    boxId: null,
    slot: null,
    view: '3d',
    opened: true,
    modules: null,
    rendering: 0
  };

  const palette = {
    mouse:{label:'Souris',color:'#f1e96b'},
    rabbit:{label:'Lapin',color:'#a5e7ee'},
    goat:{label:'Chèvre',color:'#f5a2aa'},
    chicken:{label:'Poulet',color:'#bd95ee'},
    unknown:{label:'Non renseigné',color:'#d4dce3'}
  };

  const normCompact = s => String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');

  function hostKey(value){
    const n = normCompact(value);
    return ({mouse:'mouse',souris:'mouse',rabbit:'rabbit',lapin:'rabbit',
      goat:'goat',chevre:'goat',chicken:'chicken',poulet:'chicken'})[n] || 'unknown';
  }

  function rawLabel(vial){
    return String(vial?.Comments || '').split(/Valeur source:\s*\n/)[1]?.trim() || '';
  }

  function slotParts(slot){
    const m = /^([A-J])(10|[1-9])$/.exec(String(slot || '').trim().toUpperCase());
    return m ? {row:m[1].charCodeAt(0)-65,col:Number(m[2])-1,slot:m[0]} : null;
  }

  function inventory(){
    const A = rows(state.data.Antibodies);
    const V = rows(state.data.Vials);
    const B = rows(state.data.Boxes);
    const P = rows(state.data.Positions);
    const antibodies = new Map(A.map(a => [Number(a.id), a]));
    const vials = new Map(V.map(v => [Number(v.id), v]));
    const warnings = [];
    const seenVials = new Set();

    const boxes = B.map(box => {
      const positions = P.filter(p => Number(p.Box) === Number(box.id));
      const slots = new Map();
      for(const p of positions){
        const parts = slotParts(p.Slot);
        if(!parts){ warnings.push(`${box.Name||box.Code} : position invalide « ${p.Slot} ».`); continue; }
        if(slots.has(parts.slot)){ warnings.push(`${box.Name||box.Code} : plusieurs lignes pour ${parts.slot}.`); continue; }
        const occupied = Number(p.Vial) > 0;
        const vial = vials.get(Number(p.Vial));
        const antibody = antibodies.get(Number(vial?.Antibody));
        const source = rawLabel(vial);
        const sourceHost = source.split('\n').find(line => hostKey(line) !== 'unknown');
        const host = hostKey(antibody?.HostSpecies || sourceHost);
        if(occupied && !vial) warnings.push(`${box.Name||box.Code} / ${parts.slot} : vial référencé introuvable.`);
        if(occupied && seenVials.has(Number(p.Vial))) warnings.push(`${vial?.Code||p.Vial} est référencé par plusieurs positions.`);
        if(occupied) seenVials.add(Number(p.Vial));
        slots.set(parts.slot,{
          ...p,...parts,occupied,vial,antibody,host,color:palette[host].color,
          label:antibody?.Name || source.split('\n')[0] || vial?.Code || (occupied?'Vial non relié':'Libre'),
          source, blocked:!occupied && p.Available !== true
        });
      }
      const capacity = Number(box.Rows || 10) * Number(box.Columns || 10);
      if(Number(box.Rows||10)!==10 || Number(box.Columns||10)!==10){
        warnings.push(`${box.Name||box.Code} : format ${box.Rows} × ${box.Columns}; la scène validée attend 10 × 10.`);
      }
      return {...box,slots,capacity,occupied:positions.filter(p=>Number(p.Vial)>0).length};
    });

    return {Antibodies:A,Vials:V,Boxes:B,Positions:P,boxes,antibodies,vials,warnings};
  }

  async function modules(){
    if(!SV11.modules){
      SV11.modules = Promise.all([
        import('./storage-scene-v10.js?v=10'),
      ]).then(([scene]) => ({...scene}));
    }
    return SV11.modules;
  }

  function activeBox(inv){
    if(!inv.boxes.length) return null;
    const desired = Number(state.selectedBox || SV11.boxId);
    const found = inv.boxes.find(b => Number(b.id) === desired);
    if(found) return found;
    state.selectedBox = Number(inv.boxes[0].id);
    return inv.boxes[0];
  }

  function selectedSlotFromVial(inv, box){
    if(!state.selectedVial) return null;
    const p = inv.Positions.find(p => Number(p.Vial)===Number(state.selectedVial) && Number(p.Box)===Number(box?.id));
    return p?.Slot || null;
  }

  function currentBox(inv){
    return inv.boxes.find(b=>Number(b.id)===Number(SV11.boxId)) || activeBox(inv);
  }

  function esc11(v){ return esc(v); }

  function field(label,value){
    return `<div><dt>${esc11(label)}</dt><dd>${esc11(value===undefined||value===null||value===''?'Non renseigné':value)}</dd></div>`;
  }

  function fillBadge(v){
    const s = v?.FillStatus || 'Inconnu';
    const cl = s==='Plein'?'full':s==='Vide'?'empty':/50/.test(s)?'half':'';
    return `<span class="sv11-badge ${cl}">${esc11(s)}</span>`;
  }

  function renderBoxes(inv){
    const b = currentBox(inv);
    const host = document.querySelector('.storage-integrated-v11');
    if(!host) return;
    const area = host.querySelector('[data-sv11-boxes]');
    area.innerHTML = inv.boxes.map(x => `
      <button class="sv11-box-card ${Number(x.id)===Number(b?.id)?'active':''}" data-sv11-box="${x.id}">
        <span class="icon">▦</span>
        <span class="body">
          <strong>${esc11(x.Name||x.Code)}</strong>
          <small>${x.occupied} / ${x.capacity} positions occupées · ${esc11(x.Temperature||'Température non renseignée')}</small>
          <progress max="${x.capacity||100}" value="${x.occupied}"></progress>
        </span>
        <span>›</span>
      </button>`).join('');
    host.querySelector('[data-sv11-total]').textContent = inv.boxes.reduce((n,x)=>n+x.occupied,0);
    area.querySelectorAll('[data-sv11-box]').forEach(btn => btn.onclick = () => {
      state.selectedBox = Number(btn.dataset.sv11Box);
      state.selectedVial = null;
      SV11.boxId = Number(btn.dataset.sv11Box);
      SV11.slot = null;
      SV11.opened = true;
      renderBoxes(inv);
      void renderWorkbench(inv);
    });
  }

  function renderGrid(inv, box){
    const host = document.querySelector('.storage-integrated-v11');
    const grid = host?.querySelector('[data-sv11-grid]');
    if(!grid || !box) return;
    let html = '<div class="sv11-slot-grid"><span></span>' +
      Array.from({length:10},(_,c)=>`<span class="coordinate">${c+1}</span>`).join('');
    for(let r=0;r<10;r++){
      html += `<span class="coordinate">${String.fromCharCode(65+r)}</span>`;
      for(let c=0;c<10;c++){
        const name = String.fromCharCode(65+r)+(c+1);
        const p = box.slots.get(name);
        html += `<button data-sv11-slot="${name}" class="${name===SV11.slot?'selected ':''}${!p?'missing':''}"
          ${!p?'disabled':''} style="${p?.occupied?'background:'+p.color:''}"
          title="${esc11(p?.label||'Position absente de Grist')}">
          <b>${name}</b>${esc11(p?.occupied?p.label:p?.blocked?'Indisponible':p?'Libre':'Absente')}
        </button>`;
      }
    }
    grid.innerHTML = html + '</div>';
    grid.querySelectorAll('[data-sv11-slot]').forEach(btn => btn.onclick = () => selectSlot(inv, btn.dataset.sv11Slot));
  }

  function selectSlot(inv, value){
    SV11.slot = value;
    const box = currentBox(inv);
    const p = box?.slots.get(value);
    if(p?.occupied) state.selectedVial = Number(p.Vial);
    else state.selectedVial = null;
    SV11.scene?.select(value);
    renderGrid(inv,box);
    renderPanel(inv);
  }

  function renderPanel(inv){
    const host = document.querySelector('.storage-integrated-v11');
    const panel = host?.querySelector('[data-sv11-panel]');
    const box = currentBox(inv);
    const p = box?.slots.get(SV11.slot);
    if(!panel) return;

    if(!p){
      panel.innerHTML = `
        <p class="sv11-eyebrow">FICHE DU FLACON</p>
        <div class="sv11-panel-empty"><span>⌖</span><h2>Sélectionne un flacon</h2>
        <p>Clique sur la boîte ou sur le plan pour consulter son contenu.</p></div>`;
      return;
    }

    if(!p.occupied){
      panel.innerHTML = `
        <p class="sv11-eyebrow">EMPLACEMENT ${esc11(p.Slot)}</p>
        <h2>${p.blocked?'Position indisponible':'Position libre'}</h2>
        <p class="sv11-muted">${esc11(box.Name||box.Code)}</p>
        <p>Cette position existe dans Grist.</p>
        <button class="primary" data-sv11-add ${p.blocked?'disabled':''}>+ Ajouter un vial ici</button>
        <p class="sv11-panel-note">L'ajout créera un vial dans la table Vials puis l'associera à cette Position.</p>`;
      const add = panel.querySelector('[data-sv11-add]');
      if(add) add.onclick = () => showAddVial(inv, box, p);
      return;
    }

    const v = p.vial, a = p.antibody;
    const empty = normalizeName(v?.FillStatus)==='vide' || normalizeName(v?.Status)==='vide a retirer';
    panel.innerHTML = `
      <p class="sv11-eyebrow">FICHE DU FLACON · ${esc11(p.Slot)}</p>
      <div class="sv11-vial-art" style="--sv11-host:${p.color}">
        <div class="body"><div class="label">${esc11(p.label)}<br>ANTIBODY</div></div><div class="cap"></div>
      </div>
      <h2>${esc11(p.label)}</h2>
      <p class="sv11-muted">${esc11(v?.Code||'Référence vial introuvable')}</p>
      <p>${fillBadge(v)}</p>
      <dl>
        ${field('Référence',a?.CatalogNumber)}
        ${field('Fournisseur',a?.Supplier)}
        ${field('Espèce hôte',palette[p.host].label)}
        ${field('Volume',v?.EstimatedVolume_uL===null||v?.EstimatedVolume_uL===undefined?'Non renseigné':`${v.EstimatedVolume_uL} µL`)}
        ${field('Statut',v?.Status)}
        ${field('Position',p.Slot)}
        ${field('Boîte',box.Name)}
        ${field('Température',box.Temperature)}
        ${field('Rack',box.Rack)}
      </dl>
      ${a?'<button class="primary" data-sv11-antibody>Voir la fiche anticorps</button>':'<p class="sv11-badge">Correspondance anticorps à vérifier</p>'}
      <button data-sv11-edit>Modifier le vial</button>
      <button data-sv11-move>Déplacer le flacon</button>
      ${empty
        ? '<button class="danger" data-sv11-remove>Confirmer le retrait physique</button>'
        : '<button class="danger" data-sv11-empty>Marquer comme vide</button>'}
      <p class="sv11-panel-note">${empty?'La position reste occupée jusqu’au retrait physique.':'Toutes les modifications sont enregistrées dans Grist et History.'}</p>`;

    panel.querySelector('[data-sv11-antibody]')?.addEventListener('click', () => {
      state.selectedAntibody = Number(a.id);
      go('antibody-detail');
    });
    panel.querySelector('[data-sv11-edit]')?.addEventListener('click', () => showEditVial(inv,box,p));
    panel.querySelector('[data-sv11-move]')?.addEventListener('click', () => showMoveVial(inv,box,p));
    panel.querySelector('[data-sv11-empty]')?.addEventListener('click', () => markEmpty(inv,box,p));
    panel.querySelector('[data-sv11-remove]')?.addEventListener('click', () => confirmRemoval(inv,box,p));
  }

  async function refreshAndReturn(message, keepSlot=true){
    await loadAll();
    if(message) toast(message);
    const inv = inventory();
    const box = currentBox(inv);
    if(!keepSlot) SV11.slot = null;
    renderBoxes(inv);
    await renderWorkbench(inv);
    return inv;
  }

  function historyRecord(action,vial,details){
    return ['AddRecord','History',null,{
      Date:Date.now()/1000,
      Action:action,
      EntityType:'Vial',
      EntityCode:vial?.Code || '',
      Details:details,
      User:'Grist'
    }];
  }

  function showAddVial(inv,box,p){
    const antibodies = inv.Antibodies.slice().sort((a,b)=>String(a.Name||'').localeCompare(String(b.Name||''),'fr'));
    modal(`
      <h2>Ajouter un vial — ${esc11(box.Name||box.Code)} / ${esc11(p.Slot)}</h2>
      <div class="field"><label>Anticorps *</label>
        <select id="sv11AddAb">${antibodies.map(a=>`<option value="${a.id}">${esc11(a.Name||a.FullName||a.Code)}${a.CatalogNumber?` — ${esc11(a.CatalogNumber)}`:''}</option>`).join('')}</select>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Remplissage</label><select id="sv11AddFill"><option>Plein</option><option>≈ 50 %</option><option>Inconnu</option></select></div>
        <div class="field"><label>Volume estimé (µL)</label><input id="sv11AddVol" type="number" min="0" step="1"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaire</label><textarea id="sv11AddComments"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="sv11AddCancel">Annuler</button>
        <button class="btn btn-primary" id="sv11AddSave">Ajouter à ${esc11(p.Slot)}</button>
      </div>`);
    $('#sv11AddCancel').onclick = closeModal;
    $('#sv11AddSave').onclick = async () => {
      if(!state.connected) return toast('Cette action nécessite la connexion Grist.');
      if(Number(rowById('Positions',p.id)?.Vial)) return toast('Cette position vient d’être occupée. Actualisez la page.');
      const code = `V-${Date.now().toString().slice(-10)}`;
      try{
        await grist.docApi.applyUserActions([['AddRecord','Vials',null,{
          Code:code,
          Antibody:Number($('#sv11AddAb').value),
          FillStatus:$('#sv11AddFill').value,
          EstimatedVolume_uL:$('#sv11AddVol').value===''?null:Number($('#sv11AddVol').value),
          Status:'En stock',
          Comments:$('#sv11AddComments').value.trim()
        }]]);
        await loadAll();
        const created = rows(state.data.Vials).find(v=>v.Code===code);
        if(!created) throw Error('Le vial a été créé mais n’a pas pu être relu.');
        await grist.docApi.applyUserActions([
          ['UpdateRecord','Positions',p.id,{Vial:created.id,Available:false}],
          historyRecord('Ajout vial',created,`Ajout en ${box.Name||box.Code} / ${p.Slot}`)
        ]);
        state.selectedVial = Number(created.id);
        SV11.slot = p.Slot;
        closeModal();
        await refreshAndReturn(`Vial ajouté en ${p.Slot}.`);
      }catch(e){ console.error(e); toast(`Erreur : ${e.message||e}`); }
    };
  }

  function showEditVial(inv,box,p){
    const v = p.vial;
    modal(`
      <h2>Modifier ${esc11(v.Code||'le vial')}</h2>
      <div class="form-grid">
        <div class="field"><label>Remplissage</label>
          <select id="sv11EditFill">
            ${['Plein','≈ 50 %','Vide','Inconnu'].map(x=>`<option ${x===v.FillStatus?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Volume estimé (µL)</label><input id="sv11EditVol" type="number" min="0" step="1" value="${esc11(v.EstimatedVolume_uL??'')}"></div>
        <div class="field"><label>Statut</label>
          <select id="sv11EditStatus">
            ${['En stock','À ranger','Vide / à retirer','Archivé'].map(x=>`<option ${x===v.Status?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:12px"><label>Commentaires</label><textarea id="sv11EditComments">${esc11(v.Comments||'')}</textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="sv11EditCancel">Annuler</button>
        <button class="btn btn-primary" id="sv11EditSave">Enregistrer</button>
      </div>`);
    $('#sv11EditCancel').onclick = closeModal;
    $('#sv11EditSave').onclick = async () => {
      if(!state.connected) return toast('Cette action nécessite la connexion Grist.');
      const fill = $('#sv11EditFill').value;
      let status = $('#sv11EditStatus').value;
      // Règle métier : un vial marqué Vide reste localisé et "à retirer".
      if(fill==='Vide' && status!=='Archivé') status='Vide / à retirer';
      if(status==='Archivé' && Number(p.Vial)) {
        return toast('Utilisez « Confirmer le retrait physique » avant d’archiver un vial encore positionné.');
      }
      if(!confirm(`Enregistrer les modifications de ${v.Code||'ce vial'} ?`)) return;
      try{
        const before = `${v.FillStatus||'Inconnu'} / ${v.Status||'—'} / ${v.EstimatedVolume_uL??'—'} µL`;
        const after = `${fill} / ${status} / ${$('#sv11EditVol').value||'—'} µL`;
        await grist.docApi.applyUserActions([
          ['UpdateRecord','Vials',v.id,{
            FillStatus:fill,
            EstimatedVolume_uL:$('#sv11EditVol').value===''?null:Number($('#sv11EditVol').value),
            Status:status,
            Comments:$('#sv11EditComments').value.trim()
          }],
          historyRecord('Modification vial',v,`${before} → ${after}`)
        ]);
        closeModal();
        await refreshAndReturn('Vial modifié.');
      }catch(e){ console.error(e); toast(`Erreur : ${e.message||e}`); }
    };
  }

  function showMoveVial(inv,box,p){
    const destinations = inv.boxes.flatMap(b => [...b.slots.values()]
      .filter(x=>!x.occupied && !x.blocked)
      .map(x=>({box:b,pos:x})));
    modal(`
      <h2>Déplacer ${esc11(p.vial?.Code||'le vial')}</h2>
      <p>Position actuelle : <b>${esc11(box.Name||box.Code)} / ${esc11(p.Slot)}</b></p>
      <div class="field"><label>Nouvelle position libre</label>
        <select id="sv11MoveTo">${destinations.map(({box:b,pos:x})=>
          `<option value="${x.id}">${esc11(b.Name||b.Code)} · ${esc11(x.Slot)}</option>`).join('')}</select>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="sv11MoveCancel">Annuler</button>
        <button class="btn btn-primary" id="sv11MoveSave" ${destinations.length?'':'disabled'}>Déplacer</button>
      </div>`);
    $('#sv11MoveCancel').onclick = closeModal;
    $('#sv11MoveSave').onclick = async () => {
      const toId = Number($('#sv11MoveTo').value);
      const to = inv.Positions.find(x=>Number(x.id)===toId);
      const toBox = inv.boxes.find(b=>Number(b.id)===Number(to?.Box));
      if(!to || Number(to.Vial)) return toast('Destination indisponible.');
      if(!confirm(`Déplacer ${p.vial?.Code||'ce vial'} de ${box.Name||box.Code} / ${p.Slot} vers ${toBox?.Name||''} / ${to.Slot} ?`)) return;
      try{
        await grist.docApi.applyUserActions([
          ['UpdateRecord','Positions',p.id,{Vial:0,Available:true}],
          ['UpdateRecord','Positions',to.id,{Vial:Number(p.Vial),Available:false}],
          historyRecord('Déplacement',p.vial,`${box.Name||box.Code} / ${p.Slot} → ${toBox?.Name||to.Box} / ${to.Slot}`)
        ]);
        state.selectedBox = Number(to.Box);
        state.selectedVial = Number(p.Vial);
        SV11.boxId = Number(to.Box);
        SV11.slot = to.Slot;
        closeModal();
        await refreshAndReturn(`Vial déplacé vers ${to.Slot}.`);
      }catch(e){ console.error(e); toast(`Erreur : ${e.message||e}`); }
    };
  }

  async function markEmpty(inv,box,p){
    const v = p.vial;
    if(!confirm(`Marquer ${v?.Code||'ce vial'} comme « Vide / à retirer » ?\n\nLa position ${p.Slot} restera occupée jusqu’à la confirmation du retrait physique.`)) return;
    try{
      await grist.docApi.applyUserActions([
        ['UpdateRecord','Vials',v.id,{FillStatus:'Vide',Status:'Vide / à retirer'}],
        historyRecord('Vial vide',v,`${v.Code||''} marqué vide ; position ${box.Name||box.Code} / ${p.Slot} conservée`)
      ]);
      await refreshAndReturn('Vial marqué vide. Sa position reste occupée.');
    }catch(e){ console.error(e); toast(`Erreur : ${e.message||e}`); }
  }

  async function confirmRemoval(inv,box,p){
    const v = p.vial;
    if(!confirm(`Confirmer que ${v?.Code||'ce vial'} a été physiquement retiré de ${box.Name||box.Code} / ${p.Slot} ?\n\nCette action libérera la position et archivera le vial.`)) return;
    try{
      await grist.docApi.applyUserActions([
        ['UpdateRecord','Positions',p.id,{Vial:0,Available:true}],
        ['UpdateRecord','Vials',v.id,{Status:'Archivé'}],
        historyRecord('Retrait physique',v,`${v.Code||''} retiré de ${box.Name||box.Code} / ${p.Slot} ; position libérée`)
      ]);
      state.selectedVial = null;
      SV11.slot = p.Slot;
      await refreshAndReturn('Retrait confirmé. La position est maintenant libre.');
    }catch(e){ console.error(e); toast(`Erreur : ${e.message||e}`); }
  }

  async function renderWorkbench(inv){
    const version = ++SV11.rendering;
    const host = document.querySelector('.storage-integrated-v11');
    if(!host) return;
    const box = currentBox(inv);
    if(!box) return;

    SV11.boxId = Number(box.id);
    state.selectedBox = Number(box.id);

    const title = host.querySelector('[data-sv11-title]');
    const subtitle = host.querySelector('[data-sv11-subtitle]');
    title.textContent = box.Name || box.Code;
    subtitle.textContent = `${box.Temperature||'Température non renseignée'} · ${box.occupied} / ${box.capacity} positions occupées${box.Rack?' · '+box.Rack:''}`;

    renderGrid(inv,box);
    renderPanel(inv);

    const stage = host.querySelector('[data-sv11-stage]');
    const grid = host.querySelector('[data-sv11-grid]');
    stage.hidden = SV11.view !== '3d';
    grid.hidden = SV11.view !== '2d';
    host.querySelector('[data-sv11-view3d]').classList.toggle('active',SV11.view==='3d');
    host.querySelector('[data-sv11-view2d]').classList.toggle('active',SV11.view==='2d');

    if(SV11.scene){ try{SV11.scene.dispose();}catch(_){} SV11.scene=null; }
    if(SV11.view !== '3d') return;

    const sceneEl = host.querySelector('[data-sv11-scene]');
    try{
      if(Number(box.Rows||10)!==10 || Number(box.Columns||10)!==10) throw Error('La scène validée représente les boîtes 10 × 10.');
      const {mountScene} = await modules();
      if(version !== SV11.rendering || !document.body.contains(host)) return;
      sceneEl.replaceChildren();
      SV11.scene = mountScene(sceneEl,box,
        slot => selectSlot(inv,slot),
        text => { const h=host.querySelector('[data-sv11-hover]'); if(h) h.textContent=text; }
      );
      SV11.scene.setOpen(SV11.opened);
      SV11.scene.select(SV11.slot);
      host.querySelector('[data-sv11-lid]').disabled = false;
    }catch(e){
      console.error(e);
      sceneEl.innerHTML = `<div style="padding:80px 30px;text-align:center;color:#708698">${esc11(e.message)}</div>`;
    }
  }

  async function integratedStorage(){
    topbar('Stockage', state.connected?'<span class="pill ok">● Connecté à Grist</span>':'<span class="pill warn">Connexion Grist requise</span>');
    const inv = inventory();
    const initial = activeBox(inv);
    if(!initial){
      content.innerHTML = '<div class="card empty">Aucune boîte configurée.</div>';
      return;
    }

    SV11.boxId = Number(state.selectedBox || initial.id);
    const box = currentBox(inv);
    if(state.selectedVial){
      const selected = selectedSlotFromVial(inv,box);
      if(selected) SV11.slot = selected;
    } else if(!box?.slots.has(SV11.slot)){
      SV11.slot = null;
    }

    content.innerHTML = `
      <div class="storage-integrated-v11">
        ${inv.warnings.length?`<div class="sv11-warning">${esc11(inv.warnings.join('\n'))}</div>`:''}
        <section class="sv11-heading">
          <div>
            <p class="sv11-eyebrow">STOCKAGE DU LABORATOIRE</p>
            <h1>Chaque flacon à sa place.</h1>
            <p class="sv11-muted">Explore les boîtes, retrouve un anticorps et organise son emplacement.</p>
          </div>
          <div class="sv11-total"><strong data-sv11-total>—</strong><span>flacons localisés dans les boîtes</span></div>
        </section>

        <div class="sv11-box-cards" data-sv11-boxes></div>

        <section class="sv11-workbench">
          <div class="sv11-bench-main">
            <div class="sv11-toolbar">
              <div><strong data-sv11-title>Boîte</strong><small data-sv11-subtitle></small></div>
              <div class="sv11-toolbar-buttons">
                <button data-sv11-lid>Fermer la boîte</button>
                <div class="sv11-segmented">
                  <button data-sv11-view3d class="active">Vue 3D</button>
                  <button data-sv11-view2d>Vue 2D</button>
                </div>
              </div>
            </div>
            <div class="sv11-stage" data-sv11-stage>
              <div class="sv11-scene" data-sv11-scene></div>
              <div class="sv11-hover" data-sv11-hover></div>
              <p class="sv11-scene-hint">Glisser pour pivoter · Molette pour zoomer · Cliquer pour sélectionner</p>
            </div>
            <div class="sv11-grid" data-sv11-grid hidden></div>
            <div class="sv11-bench-footer">
              <div>
                ${Object.values(palette).map(h=>`<span class="sv11-legend-item"><i class="sv11-dot" style="background:${h.color}"></i>${h.label}</span>`).join('')}
              </div>
              <div>
                <button data-sv11-recenter>⤢ Recentrer</button>
                <button data-sv11-perspective>Perspective</button>
                <button data-sv11-top>Vue du dessus</button>
              </div>
            </div>
          </div>
          <aside class="sv11-panel" data-sv11-panel></aside>
        </section>
      </div>`;

    renderBoxes(inv);

    const host = document.querySelector('.storage-integrated-v11');
    host.querySelector('[data-sv11-view3d]').onclick = () => { SV11.view='3d'; void renderWorkbench(inv); };
    host.querySelector('[data-sv11-view2d]').onclick = () => { SV11.view='2d'; void renderWorkbench(inv); };
    host.querySelector('[data-sv11-lid]').onclick = () => {
      SV11.opened=!SV11.opened;
      SV11.scene?.setOpen(SV11.opened);
      SV11.scene?.select(SV11.slot);
      host.querySelector('[data-sv11-lid]').textContent = SV11.opened?'Fermer la boîte':'Ouvrir la boîte';
    };
    host.querySelector('[data-sv11-recenter]').onclick = () => SV11.scene?.fit();
    host.querySelector('[data-sv11-perspective]').onclick = () => SV11.scene?.fit('perspective');
    host.querySelector('[data-sv11-top]').onclick = () => SV11.scene?.fit('top');

    await renderWorkbench(inv);
  }

  async function openBoxForVialIntegrated(vialId){
    const p = rows(state.data.Positions).find(p=>Number(p.Vial)===Number(vialId));
    if(!p){ toast('Ce vial n’a pas de position attribuée.'); return; }
    state.selectedVial = Number(vialId);
    state.selectedBox = Number(p.Box);
    SV11.boxId = Number(p.Box);
    SV11.slot = p.Slot;
    SV11.opened = true;
    SV11.view = '3d';
    go('storage');
  }

  // Important : app.js utilise ces noms dans render() et vialCard().
  storage = integratedStorage;
  box3d = integratedStorage;
  openBoxForVial = openBoxForVialIntegrated;

  // Nettoyage de la scène quand on quitte Stockage.
  const originalGo = go;
  go = function(route){
    if(route!=='storage' && route!=='box3d' && SV11.scene){
      try{SV11.scene.dispose();}catch(_){}
      SV11.scene=null;
    }
    return originalGo(route);
  };

  // Expose uniquement pour diagnostic dans la console de la version de test.
  window.BioDynaMitIntegratedStorageV11 = {
    version:'11',
    state:SV11,
    openVial:openBoxForVialIntegrated
  };
})();
