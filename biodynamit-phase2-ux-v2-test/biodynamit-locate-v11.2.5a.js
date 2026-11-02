/* BioDynaMit v11.2.5a — direct storage access from antibody lists.
   Adds "Voir dans la boîte" to both primary and secondary list rows.
   If several positioned vials exist, a small location chooser is displayed.
   No data/schema changes.
*/
(function(){
  'use strict';

  const SEC='secondary_antibody';
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const e=v=>esc(v??'');

  function primaryLocations(antibodyId){
    const vials=rows(state.data.Vials).filter(v=>Number(v.Antibody)===Number(antibodyId));
    const byId=new Map(vials.map(v=>[Number(v.id),v]));
    const boxes=new Map(rows(state.data.Boxes).map(b=>[Number(b.id),b]));
    return rows(state.data.Positions)
      .filter(p=>Number(p.Vial)>0 && byId.has(Number(p.Vial)))
      .map(p=>({
        vial:byId.get(Number(p.Vial)),
        vialId:Number(p.Vial),
        boxId:Number(p.Box),
        box:boxes.get(Number(p.Box)),
        slot:p.Slot||''
      }));
  }

  function secondaryData(){
    try{return ns.inventoryData?.(SEC)||null;}catch(_){return null;}
  }

  function secondaryLocations(itemId){
    const data=secondaryData();
    if(!data)return [];
    const item=data.items.find(i=>String(i.id)===String(itemId));
    if(!item)return [];
    const units=data.units.filter(u=>
      String(u.itemId||'')===String(item.id) ||
      (u.itemCode && String(u.itemCode)===String(item.code))
    );
    const out=[];
    for(const u of units){
      const p=data.positions.find(x=>String(x.unitCode||'')===String(u.code));
      if(!p)continue;
      const box=data.containers.find(c=>String(c.code)===String(p.containerCode));
      out.push({unit:u,pos:p,box});
    }
    return out;
  }

  function openPrimaryLocation(loc){
    if(!loc)return;
    if(typeof window.openBoxForVial==='function'){
      window.openBoxForVial(Number(loc.vialId));
      return;
    }
    state.selectedVial=Number(loc.vialId);
    state.selectedBox=Number(loc.boxId);
    go('storage');
  }

  function openSecondaryLocation(loc){
    if(!loc)return;
    ns.inventoryView[SEC]='storage';
    ns.inventorySelected[SEC]=null;
    const st=ns.storageState[SEC]=ns.storageState[SEC]||{};
    st.containerCode=loc.pos.containerCode;
    st.slot=loc.pos.slot;
    st.view='2d';
    if(String(state.route||'')!==`inv:${SEC}`){
      go(`inv:${SEC}`);
    }else if(typeof ns.renderInventory==='function'){
      ns.renderInventory(SEC);
    }else{
      go(`inv:${SEC}`);
    }
  }

  function locationLabel(loc,kind){
    if(kind==='primary'){
      return `${loc.box?.Name||loc.box?.Code||'Boîte'} · ${loc.slot}${loc.vial?.Code?` · ${loc.vial.Code}`:''}`;
    }
    return `${loc.box?.name||loc.box?.code||loc.pos.containerCode||'Boîte'} · ${loc.pos.slot}${loc.unit?.code?` · ${loc.unit.code}`:''}`;
  }

  function chooseLocation(kind,locations){
    if(!locations.length)return;
    if(locations.length===1){
      if(kind==='primary')openPrimaryLocation(locations[0]);
      else openSecondaryLocation(locations[0]);
      return;
    }
    modal(`<h2>Choisir le vial à localiser</h2>
      <p class="subtitle">${locations.length} vials positionnés sont associés à cette référence.</p>
      <div class="u125-location-list">
        ${locations.map((loc,i)=>`
          <button class="btn u125-location-choice" data-u125-location="${i}">
            <span>${e(locationLabel(loc,kind))}</span><b>Voir dans la boîte →</b>
          </button>`).join('')}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" id="u125LocationCancel">Annuler</button>
      </div>`);
    $('#u125LocationCancel').onclick=closeModal;
    document.querySelectorAll('[data-u125-location]').forEach(btn=>{
      btn.onclick=()=>{
        const loc=locations[Number(btn.dataset.u125Location)];
        closeModal();
        if(kind==='primary')openPrimaryLocation(loc);
        else openSecondaryLocation(loc);
      };
    });
  }

  function addPrimaryButtons(){
    if(state.route!=='antibodies')return;
    document.querySelectorAll('tr[data-u125-primary-row]').forEach(tr=>{
      if(tr.querySelector('[data-u125-locate-primary]'))return;
      const id=Number(tr.dataset.u125PrimaryRow);
      const locs=primaryLocations(id);
      if(!locs.length)return;
      const stockCell=tr.children[6];
      if(!stockCell)return;
      const btn=document.createElement('button');
      btn.className='btn btn-sm u125-list-locate';
      btn.dataset.u125LocatePrimary=String(id);
      btn.textContent='Voir dans la boîte';
      btn.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        chooseLocation('primary',primaryLocations(id));
      };
      stockCell.appendChild(btn);
    });
  }

  function addSecondaryButtons(){
    if(String(state.route||'')!==`inv:${SEC}`)return;
    const view=ns.inventoryView?.[SEC]||'list';
    if(view!=='list')return;

    document.querySelectorAll('#v112InvBody tr').forEach(tr=>{
      if(tr.querySelector('[data-u125-locate-secondary]'))return;
      const itemBtn=tr.querySelector('[data-v112-item]');
      if(!itemBtn)return;
      const itemId=itemBtn.dataset.v112Item;
      const locs=secondaryLocations(itemId);
      if(!locs.length)return;
      const stockCell=tr.lastElementChild;
      if(!stockCell)return;
      const btn=document.createElement('button');
      btn.className='btn btn-sm u125-list-locate';
      btn.dataset.u125LocateSecondary=String(itemId);
      btn.textContent='Voir dans la boîte';
      btn.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        chooseLocation('secondary',secondaryLocations(itemId));
      };
      stockCell.appendChild(btn);
    });
  }

  let scheduled=false;
  function enhance(){
    scheduled=false;
    addPrimaryButtons();
    addSecondaryButtons();
  }
  function scheduleEnhance(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(enhance);
  }

  const obs=new MutationObserver(scheduleEnhance);
  obs.observe(document.getElementById('content'),{childList:true,subtree:true});
  scheduleEnhance();

  window.BioDynaMitLocateV1125a={
    version:'11.2.5a',
    primaryLocations,
    secondaryLocations
  };
})();
