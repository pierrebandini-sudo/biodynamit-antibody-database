/* BioDynaMit Phase 2 UX TEST — presentation only.
 * No Grist calls, data writes, persistent cache, polling or model replacement.
 * Search, creation, navigation, alerts and diagnostics delegate to Phase 2.
 */
(function(){
  'use strict';
  const D=window.BioDynaMitDataPhase2,ns=window.BioDynaMitV112,sec=window.BioDynaMitV113;
  if(!D||!ns||!sec)return;
  const host=document.getElementById('content');
  document.querySelector('.phase2-sync-bar')?.setAttribute('role','region');
  const paths={
    search:'M21 21l-4.5-4.5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15',
    home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
    antibody:'m5 3 7 7 7-7M12 10v11M3 6l5 5m13-5-5 5',
    vial:'M9 3h6M8 6h8v14H8V6Zm1 0V3m6 3V3M8 14h8',
    box:'m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10',
    plus:'M12 5v14M5 12h14',
    grid:'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
    alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',
    document:'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
    team:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M15 4a4 4 0 0 1 0 8m7 9v-3a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    history:'M3 11a9 9 0 1 1 3 8M3 4v7h7m2-4v5l3 2',
    arrow:'M5 12h14m-5-5 5 5-5 5',
    check:'m5 12 4 4L19 6',
    settings:'M4 7h16M4 17h16M9 4v6m6 4v6',
    connection:'m8 8 2-2a4 4 0 0 1 6 6l-2 2m-4-4-2 2a4 4 0 0 0 6 6l2-2M9 15l6-6'
  };
  const icon=name=>'<svg class="ux-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+(paths[name]||paths.grid)+'"/></svg>';
  const e=esc;
  let roleKnown=false,pendingCreation=null,queued=false,returnFocus=null,historyOnly=false;
  const ignoreProbe=name=>['SecurityAdminGate','SecurityEditorGate'].includes(name);
  function connection(){
    const failed=[...D.errors.keys()].filter(n=>!ignoreProbe(n));
    const bar=document.querySelector('.phase2-sync-bar');
    if(state.initialStatus==='error'||failed.length||bar?.classList.contains('phase2-error'))return {kind:'error',text:'Lecture Grist à vérifier',detail:failed.length?'Données indisponibles : '+failed.join(', '):'Consulter le message de synchronisation.'};
    if(!state.connected||state.initialStatus!=='ready')return {kind:'pending',text:'Chargement des données Grist',detail:'La disponibilité des données n’est pas encore confirmée.'};
    if(D.activeOperation||D.activeNative.size)return {kind:'pending',text:'Enregistrement en cours',detail:'La confirmation de Grist est attendue.'};
    return {kind:'ready',text:'Données Grist disponibles',detail:'État connu du service de données ; la dernière synchronisation est indiquée en bas de page.'};
  }
  function statusMarkup(){const s=connection();return '<span class="ux-connection" data-ux-connection data-state="'+s.kind+'" title="'+e(s.detail)+'">'+icon(s.kind==='error'?'alert':'connection')+'<span>'+s.text+'</span></span>';}
  function canCreate(){
    return roleKnown&&sec.core.canApply(sec.role,['AddRecord','InventoryItems',null,{}],sec.securityEnabled).allowed;
  }
  function canAdmin(){return roleKnown&&(!sec.securityEnabled||['admin','unconfigured'].includes(sec.role));}
  function updateStatus(){
    const s=connection();
    document.querySelectorAll('[data-ux-connection]').forEach(node=>{
      if(node.dataset.state!==s.kind)node.dataset.state=s.kind;
      const label=node.querySelector('span');if(label&&label.textContent!==s.text)label.textContent=s.text;
      if(node.title!==s.detail)node.title=s.detail;
    });
    const create=host.querySelector('[data-ux-action="create"]'),note=host.querySelector('[data-ux-permission]');
    if(create){
      create.hidden=!canCreate();
      if(note){
        note.hidden=canCreate();
        const title=roleKnown?'Consultation des ressources':'Vérification des droits';
        const text=roleKnown?'La création suit les droits de votre rôle.':'Les actions dépendent de votre rôle.';
        if(note.querySelector('strong').textContent!==title)note.querySelector('strong').textContent=title;
        if(note.querySelector('small').textContent!==text)note.querySelector('small').textContent=text;
      }
    }
    const admin=document.querySelector('.sidebar-bottom [data-route="admin"]');
    if(admin){admin.hidden=!canAdmin();admin.setAttribute('aria-hidden',String(!canAdmin()));}
  }
  // Display adapter only. Preserve the existing status function and all execution.
  const showStatus=D.showStatus;
  D.showStatus=function(){const result=showStatus?.apply(this,arguments);updateStatus();return result;};

  function navIcon(route){
    if(route==='dashboard')return 'home';
    if(route==='antibodies'||route==='antibody-detail'||route==='inv:secondary_antibody')return 'antibody';
    return ({storage:'box',box3d:'box',vials:'vial',alerts:'alert',documents:'document',journal:'document','team-tools':'team',admin:'settings'})[route]||'grid';
  }
  function decorateNav(){
    const nav=document.getElementById('nav'),scroll=nav.scrollTop;
    const buttons=[...nav.querySelectorAll('[data-route]')];
    const inventory=buttons.find(b=>b.dataset.route==='antibodies'||b.dataset.route.startsWith('inv:'));
    const tools=buttons.find(b=>['team-tools','alerts','documents'].includes(b.dataset.route));
    if(inventory&&!nav.querySelector('[data-ux-navgroup="inventory"]')){
      const label=document.createElement('div');label.className='ux-nav-group';label.dataset.uxNavgroup='inventory';label.textContent='Inventaires';nav.insertBefore(label,inventory);
    }
    if(tools&&!nav.querySelector('[data-ux-navgroup="tools"]')){
      const label=document.createElement('div');label.className='ux-nav-group';label.dataset.uxNavgroup='tools';label.textContent='Outils du laboratoire';nav.insertBefore(label,tools);
      if(!nav.querySelector('[data-route="storage"]')){
        const b=document.createElement('button');b.className='nav-item';b.dataset.route='storage';b.innerHTML='<span></span><span>Stockage des primaires</span>';b.onclick=()=>go('storage');nav.insertBefore(b,label);
      }
    }
    document.querySelectorAll('.sidebar [data-route]').forEach(b=>{
      const route=b.dataset.route,label=b.querySelector('span:last-child')?.textContent||b.textContent;
      const active=route===state.route||(route==='antibodies'&&state.route==='antibody-detail')||(route==='storage'&&state.route==='box3d');
      b.classList.toggle('active',active);b.setAttribute('aria-label',label.trim());b.title=label.trim();
      if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      const glyph=b.querySelector('span:first-child');
      if(glyph&&!glyph.querySelector('svg')){glyph.innerHTML=icon(navIcon(route));glyph.setAttribute('aria-hidden','true');}
    });
    nav.scrollTop=scroll;
  }
  const baseNav=renderNav;
  renderNav=function(){const scroll=document.getElementById('nav').scrollTop;const out=baseNav.apply(this,arguments);decorateNav();document.getElementById('nav').scrollTop=scroll;updateStatus();return out;};
  const baseTopbar=topbar;
  topbar=function(title,actions){
    baseTopbar(title,actions);
    if(!document.getElementById('topbar').querySelector('[data-ux-connection]')){
      const node=document.createElement('div');node.className='ux-topbar-status';node.innerHTML=statusMarkup();document.getElementById('topbar').appendChild(node);
    }
  };
  function inventoryEntries(){
    return [...document.querySelectorAll('#nav [data-route]')]
      .filter(b=>b.dataset.route==='antibodies'||b.dataset.route.startsWith('inv:'))
      .map(b=>({route:b.dataset.route,name:b.querySelector('span:last-child').textContent}));
  }
  function navigateInventory(route){
    const b=[...document.querySelectorAll('#nav [data-route]')].find(b=>b.dataset.route===route);
    if(b)b.click();else go(route);
  }
  function openInventoryPicker(create=false,locate=false){
    if(create&&!canCreate())return toast('Votre rôle ne permet pas la création de ressources.');
    const types=ns.inventoryTypes?.()||[];
    const list=inventoryEntries().filter(x=>!locate||types.find(t=>x.route===(t.Key==='primary_antibody'?'antibodies':'inv:'+t.Key))?.StorageEnabled!==false);
    modal('<div class="ux-dialog-head"><div><p class="ux-eyebrow">Ressources du laboratoire</p><h2 id="uxPickerTitle">'+(create?'Où ajouter la ressource ?':locate?'Dans quel inventaire localiser le vial ?':'Consulter les inventaires')+'</h2></div><button class="btn btn-sm" data-ux-close>Fermer</button></div><p class="subtitle">'+(create?'Choisissez un inventaire pour ouvrir son formulaire de création existant.':locate?'Ouvrez le stockage de l’inventaire concerné, puis choisissez la boîte ou la position.':'Choisissez un inventaire pour consulter ses références et son stockage.')+'</p><div class="ux-inventory-picker">'+list.map(x=>'<button class="ux-picker-row" data-ux-pick="'+e(x.route)+'">'+icon(navIcon(x.route))+'<span>'+e(x.name)+'</span>'+icon('arrow')+'</button>').join('')+'</div>');
    document.querySelector('[data-ux-close]').onclick=closeModal;
    document.querySelectorAll('[data-ux-pick]').forEach(b=>b.onclick=()=>{
      const route=b.dataset.uxPick;closeModal();
      pendingCreation=create||locate?{route,mode:locate?'locate':'create'}:null;navigateInventory(route);runPendingCreation();
    });
  }
  function runPendingCreation(){
    if(!pendingCreation)return;
    if(state.route!==pendingCreation.route){pendingCreation=null;return;}
    const button=pendingCreation.mode==='locate'
      ?document.querySelector('[data-u126-tab="storage"],[data-v112-view="storage"]')
      :document.querySelector('[data-u126-add],[data-v112-add-item]');
    if(!button||button.disabled)return;
    const mode=pendingCreation.mode;pendingCreation=null;
    if(mode==='locate'||canCreate())button.click();
  }
  function metric(name,n,label,description,action){
    return '<button class="card ux-metric" data-ux-action="'+action+'">'+
      '<span class="ux-metric-label">'+icon(name)+'<span>'+label+'</span></span><b data-ux-value="'+action+'">'+n+'</b><span class="ux-metric-description">'+description+'</span></button>';
  }
  function attention(){
    const failed=D.coreTables.filter(n=>D.errors.has(n));
    if(failed.length)return '<div class="ux-inline-error" role="alert">Les contrôles ne sont pas disponibles. La lecture des données a échoué.</div>';
    try{
      const alerts=ns.collectAlerts().filter(a=>['error','warning'].includes(String(a.severity).toLowerCase()));
      const groups=new Map();
      for(const a of alerts){const key=[a.title,a.scope,a.severity].join('|');if(!groups.has(key))groups.set(key,{...a,count:0});groups.get(key).count++;}
      const list=[...groups.values()].sort((a,b)=>(a.severity==='error'?0:1)-(b.severity==='error'?0:1));
      if(!list.length)return '<div class="ux-empty-attention">'+icon('check')+'<div><strong>Aucun élément nécessitant votre attention.</strong><span>Les contrôles de stock et de cohérence disponibles ne signalent aucune alerte.</span></div></div>';
      return '<ul class="ux-attention-list">'+list.slice(0,4).map(a=>'<li><button class="ux-attention-row" data-ux-action="alerts"><span class="ux-attention-symbol" data-severity="'+e(a.severity)+'">'+icon('alert')+'</span><span class="ux-attention-copy"><strong>'+e(a.title||'Contrôle à examiner')+'</strong><small>'+e(a.scope||'Laboratoire')+' · '+a.count+' élément'+(a.count>1?'s':'')+'</small></span>'+icon('arrow')+'</button></li>').join('')+'</ul>'+(list.length>4?'<p class="ux-muted">'+(list.length-4)+' autre(s) catégorie(s) dans les alertes.</p>':'');
    }catch(error){
      return '<div class="ux-inline-error" role="alert">Les contrôles n’ont pas pu être calculés. '+e(error.message||'Consultez les alertes pour vérifier les données.')+'</div>';
    }
  }
  const labels={
    'deplacement':'Vial déplacé vers une nouvelle position','ajout vial':'Vial ajouté','modification vial':'Vial modifié',
    'vial vide':'Vial marqué vide','retrait vial':'Vial retiré du stockage','archivage':'Référence archivée',
    'restauration':'Référence restaurée','ajout anticorps':'Anticorps ajouté','enrichissement reference':'Référence complétée'
  };
  function actionLabel(h){return labels[normalizeName(h.Action)]||h.Action||'Opération enregistrée';}
  function formattedDate(value){
    if(value===undefined||value===null||value==='')return '';
    const date=typeof value==='number'?new Date(value*(Math.abs(value)<1e12?1000:1)):new Date(value);
    return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);
  }
  function historyMarkup(list){
    if(!list.length)return '<div class="ux-empty-simple">Aucune activité enregistrée.</div>';
    return '<ol class="ux-activity">'+list.map(h=>'<li><button class="ux-activity-row" data-ux-history="'+e(h.id)+'">'+icon('history')+'<span><strong>'+e(actionLabel(h))+'</strong><small>'+e(h.EntityCode||h.EntityType||'Opération du laboratoire')+(h.User?' · '+e(h.User):'')+'</small></span>'+(formattedDate(h.Date)?'<time>'+e(formattedDate(h.Date))+'</time>':'')+'</button></li>').join('')+'</ol>';
  }
  function historyState(){
    if(D.errors.has('History'))return '<p class="ux-inline-error" role="alert">L’historique est indisponible. Les événements précédents ne sont pas considérés comme inexistants.</p><button class="btn btn-sm" data-ux-action="refresh">Réessayer la lecture</button>';
    if(!state.tables.includes('History'))return '<p class="ux-empty-simple">La table d’historique n’est pas disponible dans ce document.</p>';
    if(!D.snapshots.has('History'))return '<p class="ux-empty-simple" role="status">Chargement de l’historique…</p>';
    return historyMarkup(recentHistoryRows(5));
  }
  function showHistoryDetail(id){
    const h=rows(state.data.History).find(x=>String(x.id)===String(id));if(!h)return;
    modal('<div class="ux-dialog-head"><h2>Opération enregistrée</h2><button class="btn btn-sm" data-ux-close>Fermer</button></div><dl class="detail-list ux-history-detail">'+[
      ['Action',actionLabel(h)],['Ressource',h.EntityCode],['Date',formattedDate(h.Date)],['Auteur',h.User],
      ['Détail original',h.Details],['Type',h.EntityType],['Identifiant Grist',h.id],['Libellé original',h.Action]
    ].filter(x=>x[1]!==undefined&&x[1]!==null&&x[1]!=='').map(x=>'<dt>'+x[0]+'</dt><dd>'+e(x[1])+'</dd>').join('')+'</dl>');
    document.querySelector('[data-ux-close]').onclick=closeModal;
  }
  function fullHistory(){
    if(D.errors.has('History')||!D.snapshots.has('History'))return toast('L’historique doit être disponible avant son ouverture.');
    const list=rows(state.data.History).slice().reverse();
    modal('<div class="ux-dialog-head"><div><h2>Historique des primaires</h2><p class="subtitle">Toutes les opérations de la table History · '+list.length+' événement(s).</p></div><button class="btn btn-sm" data-ux-close>Fermer</button></div><p class="ux-muted">Les inventaires personnalisés conservent leur historique dans chaque fiche. Les journaux d’audit restent dans l’administration.</p><div class="table-wrap"><table class="table" id="uxHistoryTable"><thead><tr><th>Action</th><th>Ressource</th><th>Date</th><th>Détail</th></tr></thead><tbody></tbody></table></div>');
    document.querySelector('[data-ux-close]').onclick=closeModal;
    BioDynaMitListViewV1183.mount({table:document.getElementById('uxHistoryTable'),key:'ux-history',items:list,renderRows:items=>items.map(h=>'<tr><td>'+e(actionLabel(h))+'</td><td>'+e(h.EntityCode||'—')+'</td><td>'+e(formattedDate(h.Date)||'—')+'</td><td>'+e(h.Details||'—')+'</td></tr>').join('')});
  }

  dashboard=function(){
    if(D.gate()||ns.showInventoryLoadState?.())return;
    const activity=host.querySelector('[data-ux-activity-body]');
    // A History-only notification changes no stock, reference or alert data.
    // Update this component directly, preserving the search text and focus.
    // No snapshots, derived models or lab data are cached by the UX layer.
    if(historyOnly&&activity){historyOnly=false;activity.innerHTML=historyState();updateStatus();enhance(activity);return;}
    historyOnly=false;
    const A=rows(state.data.Antibodies),V=rows(state.data.Vials);
    // Identical predicates and population to the Phase 2 dashboard.
    const low=V.filter(v=>/50|20|faible/i.test(v.FillStatus||'')||Number(v.EstimatedVolume_uL||999)<30).length;
    const unr=V.filter(v=>normalizeName(v.Status)==='a ranger').length;
    topbar('Tableau de bord');
    host.innerHTML='<div class="ux-dashboard">'+
      '<header class="ux-page-head"><div><p class="ux-eyebrow">Espace laboratoire</p><h1 class="page-title">BioDynaMit — Tableau de bord</h1><p class="subtitle">Gestion des anticorps, réactifs et ressources du laboratoire.</p></div><span class="ux-test-label">Phase 2 UX · TEST</span></header>'+
      '<section class="card ux-search-panel" aria-labelledby="uxSearchTitle"><div class="ux-section-head"><h2 id="uxSearchTitle">Trouver une ressource</h2><span class="ux-muted">Anticorps primaires et secondaires</span></div>'+
      '<form id="uxSearchForm"><label class="ux-visually-hidden" for="globalSearch">Nom, référence catalogue ou fournisseur</label><div class="ux-search-line"><div class="ux-search-field">'+icon('search')+'<input type="search" id="globalSearch" autocomplete="off" placeholder="Nom, référence catalogue ou fournisseur…" aria-describedby="uxSearchHelp"></div><button class="btn btn-primary" id="searchBtn" type="submit">Rechercher '+icon('arrow')+'</button></div><p class="ux-search-help" id="uxSearchHelp">Ex. : MFN2, D1E9, Cell Signaling. Les résultats s’ouvrent dans la recherche existante des outils d’équipe.</p></form></section>'+
      '<section class="ux-quick-actions" aria-label="Actions rapides">'+
      '<button class="ux-quick-action" data-ux-action="catalogue">'+icon('antibody')+'<span><strong>Rechercher un anticorps</strong><small>Catalogue et fiches scientifiques</small></span>'+icon('arrow')+'</button>'+
      '<button class="ux-quick-action" data-ux-action="locate">'+icon('box')+'<span><strong>Localiser un vial</strong><small>Code, boîte et position</small></span>'+icon('arrow')+'</button>'+
      '<button class="ux-quick-action" data-ux-action="create" '+(canCreate()?'':'hidden')+'>'+icon('plus')+'<span><strong>Ajouter une ressource</strong><small>Choisir son inventaire</small></span>'+icon('arrow')+'</button>'+
      '<div class="ux-permission-note" data-ux-permission '+(canCreate()?'hidden':'')+'>'+icon('connection')+'<span><strong>'+(!roleKnown?'Vérification des droits':'Consultation des ressources')+'</strong><small>'+(!roleKnown?'Les actions dépendent de votre rôle.':'La création suit les droits de votre rôle.')+'</small></span></div>'+
      '<button class="ux-quick-action" data-ux-action="inventories">'+icon('grid')+'<span><strong>Consulter les inventaires</strong><small>Toutes les ressources disponibles</small></span>'+icon('arrow')+'</button></section>'+
      '<section class="ux-metrics" aria-label="Indicateurs des anticorps primaires">'+
      metric('antibody',A.length,'Anticorps primaires','Références du catalogue','catalogue')+
      metric('vial',V.length,'Vials','Exemplaires physiques primaires','vials')+
      metric('alert',low,'Stocks à surveiller','Vials primaires · critères existants','alerts')+
      metric('box',unr,'Vials à ranger','Statut « À ranger » · primaires','vials')+'</section>'+
      '<div class="ux-dashboard-columns"><section class="card ux-panel" aria-labelledby="uxAttentionTitle"><div class="ux-section-head"><h2 id="uxAttentionTitle">À traiter</h2><button class="ux-text-button" data-ux-action="alerts">Voir les alertes '+icon('arrow')+'</button></div>'+attention()+'<p class="ux-panel-foot">Contrôles disponibles sur les primaires et les inventaires.</p></section>'+
      '<section class="card ux-panel" aria-labelledby="uxActivityTitle"><div class="ux-section-head"><h2 id="uxActivityTitle">Activité récente</h2><button class="ux-text-button" data-ux-action="history">Historique '+icon('arrow')+'</button></div><p class="ux-activity-scope">Dernières opérations des anticorps primaires</p><div data-ux-activity-body>'+historyState()+'</div></section></div></div>';
    const form=document.getElementById('uxSearchForm');
    form.onsubmit=event=>{
      event.preventDefault();const query=document.getElementById('globalSearch').value.trim();
      if(!query){document.getElementById('globalSearch').focus();return;}
      const team=window.BioDynaMitTeamV115;
      if(team){team.searchQuery=query;team.tab='search';go('team-tools');}
      else{state.search=query;go('antibodies');}
    };
    updateStatus();enhance(host);
  };
  const baseAdmin=admin;
  admin=function(){
    const out=baseAdmin.apply(this,arguments);
    if(state.route==='admin'&&canAdmin()&&(!ns.adminTab||ns.adminTab==='overview')){
      ns.renderAutomationSummary?.();
      const section=host.querySelector('.v112-dashboard');
      if(section){
        const heading=section.querySelector('h3');if(heading)heading.textContent='Automatisation et maintenance';
        const diagnostic=document.createElement('button');diagnostic.className='btn';diagnostic.textContent='Ouvrir le diagnostic des données';
        diagnostic.onclick=()=>document.querySelector('[data-phase2-diagnostics]')?.click();section.appendChild(diagnostic);
      }
    }
    return out;
  };
  const actions={
    catalogue:()=>{state.search='';ns.qcFilter.primary=false;navigateInventory('antibodies');},
    locate:()=>openInventoryPicker(false,true),
    create:()=>openInventoryPicker(true),inventories:()=>openInventoryPicker(false),
    alerts:()=>go('alerts'),vials:()=>go('vials'),history:fullHistory,
    refresh:()=>document.querySelector('[data-phase2-refresh]')?.click()
  };
  document.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-ux-action],[data-ux-history]');if(!b)return;
    if(b.dataset.uxHistory!==undefined)showHistoryDetail(b.dataset.uxHistory);else actions[b.dataset.uxAction]?.();
  });

  let fieldId=0;
  function enhance(root){
    root.querySelectorAll('.bd1183-pager').forEach(pager=>{if(pager.getAttribute('role')!=='navigation')pager.setAttribute('role','navigation');});
    root.querySelectorAll('label').forEach(label=>{
      if(label.htmlFor)return;
      const field=label.closest('.field')||label.parentElement;
      const control=field?.querySelector('input,select,textarea');
      if(!control||control.type==='hidden')return;
      if(!control.id)control.id='ux-field-'+(++fieldId);
      label.htmlFor=control.id;
      const combo=field.querySelector('.v117-combo-input');
      if(combo&&!combo.getAttribute('aria-label'))combo.setAttribute('aria-label',label.textContent.trim());
    });
    root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(control=>{
      if(control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||control.labels?.length)return;
      const names={v117ActUser:'Filtrer l’activité par utilisateur',v117ActPeriod:'Période de l’activité',v117ActType:'Type d’événement'};
      const comparison=control.closest('.u127-compare-row')?.querySelector('span')?.textContent;
      const text=names[control.id]||(comparison?'Proposition : '+comparison:control.placeholder||control.title)||(control.tagName==='SELECT'?control.options[0]?.textContent:'');
      if(text)control.setAttribute('aria-label',text);
    });
    root.querySelectorAll('th').forEach(th=>{if(!th.hasAttribute('scope'))th.setAttribute('scope','col');});
    root.querySelectorAll('[data-u126-row],[data-v11755-item],[data-v115-openitem],[data-ab],.tab:not(button)').forEach(node=>{
      if(!node.onclick&&!node.matches('[data-v115-openitem]'))return;
      if(!node.hasAttribute('tabindex'))node.tabIndex=0;
      if(!node.hasAttribute('role'))node.setAttribute('role','button');
    });
    runPendingCreation();
  }
  // One bounded presentation observer for dynamic templates. No data reads or
  // rewriting of text values; attribute changes are intentionally not observed.
  const observer=new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(host);enhance(document.getElementById('modalCard'));});
  });
  observer.observe(host,{childList:true,subtree:true});
  observer.observe(document.getElementById('modalCard'),{childList:true,subtree:true});

  const baseModal=modal,baseClose=closeModal;
  modal=function(html){
    const card=document.getElementById('modalCard'),backdrop=document.getElementById('modal');
    if(backdrop.classList.contains('hidden'))returnFocus=document.activeElement;
    baseModal(html);card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');
    const heading=card.querySelector('h2,h1,h3');
    if(heading){if(!heading.id)heading.id='uxDialogTitle';card.setAttribute('aria-labelledby',heading.id);}
    enhance(card);
    requestAnimationFrame(()=>{if(backdrop.classList.contains('hidden')||card.contains(document.activeElement))return;const field=card.querySelector('input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)');field?.focus();});
  };
  closeModal=function(){baseClose();if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;};
  document.addEventListener('keydown',event=>{
    const card=document.getElementById('modalCard'),open=!document.getElementById('modal').classList.contains('hidden');
    if(open&&event.key==='Tab'){
      const controls=[...card.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if(controls.length&&event.shiftKey&&(document.activeElement===first||!card.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(controls.length&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    if(open&&event.key==='Escape'&&!D.activeOperation&&!D.activeNative.size){event.preventDefault();closeModal();}
    const node=event.target.closest('[role="button"][tabindex="0"]');
    if(node===event.target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();node.click();}
  });
  Promise.resolve(sec.readyPromise).then(()=>{roleKnown=true;updateStatus();});
  Promise.resolve(window.BioDynaMitInitialLoad).then(()=>{decorateNav();updateStatus();});
  D.onChange(info=>{historyOnly=info.changed.length>0&&info.changed.every(n=>n==='History');updateStatus();});
  window.BioDynaMitUX=Object.freeze({version:'phase2-ux-style-a',connection,canCreate,canAdmin,enhance,icon,observer,openInventoryPicker});
})();
