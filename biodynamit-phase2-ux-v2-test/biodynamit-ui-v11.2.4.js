/* BioDynaMit v11.2.4c — inventory-centric navigation and UI consistency.
   Final layer loaded after the v11.2 inventory/config modules.
   No migration of primary laboratory data is performed.
*/
(function(){
  'use strict';

  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  ns.uiVersion='11.2.4c';

  const labelForType=t=>{
    if(!t)return '';
    if(t.Key==='cell_stock' && (!t.Name || t.Name==='Cellules -80 °C'))return 'Cellules';
    return t.Name||t.Key;
  };

  const inventoryRoute=t=>t.Key==='primary_antibody'?'antibodies':`inv:${t.Key}`;

  function hasGenericData(type){
    try{
      return rows(state.data.InventoryItems).some(x=>x.InventoryType===type) ||
             rows(state.data.InventoryContainers).some(x=>x.InventoryType===type) ||
             (type==='secondary_antibody' && !!window.BioDynaMitSecondary2025);
    }catch(_){return false;}
  }

  function visibleInventoryTypes(){
    let types=[];
    try{types=(ns.inventoryTypes?.()||[]).slice();}catch(_){}
    if(!types.some(t=>t.Key==='primary_antibody')){
      types.push({Key:'primary_antibody',Name:'Anticorps primaires',Icon:'Y',Mode:'legacy',Enabled:true,StorageEnabled:true,SortOrder:10});
    }
    return types
      .filter(t=>t.Key==='primary_antibody' ? t.Enabled!==false : (t.Enabled!==false || hasGenericData(t.Key)))
      .sort((a,b)=>Number(a.SortOrder||999)-Number(b.SortOrder||999));
  }

  renderNav=function(){
    const items=[['dashboard','⌂','Accueil']];
    for(const t of visibleInventoryTypes()){
      items.push([inventoryRoute(t),t.Icon||'◆',labelForType(t)]);
    }
    items.push(['alerts','△','Alertes'],['documents','▣','Documents'],['journal','▤','Journal']);

    $('#nav').innerHTML=items.map(([r,ic,l])=>`<button class="nav-item ${state.route===r?'active':''}" data-route="${esc(r)}"><span>${esc(ic)}</span><span>${esc(l)}</span></button>`).join('');
    document.querySelectorAll('#nav [data-route]').forEach(b=>b.onclick=()=>{
      const r=b.dataset.route;
      if(r.startsWith('inv:')){
        const type=r.slice(4);
        ns.inventoryView[type]='list';
        ns.inventorySelected[type]=null;
        ns.inventoryDetailTab[type]='overview';
      }
      go(r);
    });

    const adminBtn=document.querySelector('.sidebar-bottom [data-route="admin"]');
    if(adminBtn){
      adminBtn.onclick=()=>go('admin');
      adminBtn.classList.toggle('active',state.route==='admin');
    }
  };

  function primaryActions(active,{add=true}={}){
    const listActive=active==='list'||active==='detail';
    return `<div class="row v112-top-actions v112-inventory-switch">
      <button class="btn ${listActive?'btn-primary':''}" id="v112PrimaryList">Liste</button>
      <button class="btn ${active==='storage'?'btn-primary':''}" id="v112PrimaryStorage">Stockage</button>
      ${add?'<button class="btn btn-primary" id="v112PrimaryAdd">+ Ajouter un anticorps primaire</button>':''}
    </div>`;
  }

  function bindPrimaryTabs(){
    document.querySelector('#v112PrimaryList')?.addEventListener('click',()=>go('antibodies'));
    document.querySelector('#v112PrimaryStorage')?.addEventListener('click',()=>go('storage'));
    document.querySelector('#v112PrimaryAdd')?.addEventListener('click',()=>showAddAntibody());
  }

  const baseAntibodies=typeof antibodies==='function'?antibodies:null;
  if(baseAntibodies){
    antibodies=function(){
      const result=baseAntibodies.apply(this,arguments);
      const title=document.querySelector('#content .page-title');
      if(title && /^Anticorps$/i.test(title.textContent.trim()))title.textContent='Anticorps primaires';
      topbar('Anticorps primaires',primaryActions('list',{add:true}));
      bindPrimaryTabs();
      return result;
    };
  }

  const baseDetail=typeof antibodyDetail==='function'?antibodyDetail:null;
  if(baseDetail){
    antibodyDetail=function(){
      const result=baseDetail.apply(this,arguments);
      topbar('Anticorps primaires',primaryActions('detail',{add:true}));
      bindPrimaryTabs();
      return result;
    };
  }

  function wrapPrimaryStorage(fn){
    if(typeof fn!=='function')return fn;
    return function(){
      const result=fn.apply(this,arguments);
      topbar('Anticorps primaires',primaryActions('storage',{add:true}));
      bindPrimaryTabs();
      return result;
    };
  }
  if(typeof storage==='function')storage=wrapPrimaryStorage(storage);
  if(typeof box3d==='function')box3d=wrapPrimaryStorage(box3d);

  const baseVials=typeof vials==='function'?vials:null;
  if(baseVials){
    vials=function(){
      const result=baseVials.apply(this,arguments);
      document.querySelectorAll('#content th').forEach(th=>{
        if(th.textContent.trim()==='Anticorps')th.textContent='Anticorps primaire';
      });
      return result;
    };
  }

  // IMPORTANT v11.2.4c:
  // Every DOM write is guarded. Writing the same textContent repeatedly from a
  // MutationObserver can generate its own mutation and lock the embedded widget.
  let normalizing=false;
  function normalizeLabels(){
    if(normalizing)return;
    normalizing=true;
    try{
      document.querySelectorAll('.storage-integrated-v11 [data-sv11-antibody]').forEach(b=>{
        if(b.textContent.trim()!=='Voir la fiche anticorps primaire'){
          b.textContent='Voir la fiche anticorps primaire';
        }
      });
      if(state?.route==='dashboard'){
        document.querySelectorAll('#content .metric span').forEach(s=>{
          if(s.textContent.trim()==='Anticorps')s.textContent='Anticorps primaires';
        });
      }
      document.querySelectorAll('#content h1,#content h2,#content h3').forEach(x=>{
        if(x.textContent.trim()==='Anticorps')x.textContent='Anticorps primaires';
      });
    }finally{
      normalizing=false;
    }
  }

  const observer=new MutationObserver(()=>normalizeLabels());
  observer.observe(document.body,{childList:true,subtree:true});
  normalizeLabels();

  ns.refreshInventoryNavigation=()=>renderNav();

  try{renderNav();}catch(err){console.warn('v11.2.4c navigation:',err);}
})();
