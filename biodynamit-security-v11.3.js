/* BioDynaMit v11.3 — Permissions & Audit.
   Security model:
   - Admin  = Grist Owner
   - User   = Grist Editor
   - Reader = Grist Viewer

   IMPORTANT:
   UI restrictions are only convenience. Real enforcement must be configured
   in Grist Access Rules; see GRIST_ACCESS_RULES_V11.3.md.
*/
(function(){
  'use strict';

  const core=window.BioDynaMitSecurityCoreV113;
  if(!core){ console.error('BioDynaMit v11.3: security core missing.'); return; }

  const ns=window.BioDynaMitV113=window.BioDynaMitV113||{};
  const v112=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const VERSION='11.3.0';

  const SECURITY_SCHEMAS={
    SecurityAdminGate:[
      {id:'Key',type:'Text'},{id:'Value',type:'Text'}
    ],
    SecurityEditorGate:[
      {id:'Key',type:'Text'},{id:'Value',type:'Text'}
    ],
    PublicSettings:[
      {id:'Key',type:'Text'},{id:'Value',type:'Text'},{id:'Description',type:'Text'}
    ],
    AuditLog:[
      {id:'Date',type:'DateTime'},
      {id:'ActorEmail',type:'Text'},{id:'ActorName',type:'Text'},{id:'Role',type:'Text'},
      {id:'Action',type:'Text'},{id:'EntityType',type:'Text'},{id:'EntityCode',type:'Text'},
      {id:'InventoryType',type:'Text'},{id:'TableName',type:'Text'},{id:'RecordId',type:'Text'},
      {id:'BeforeJSON',type:'Text'},{id:'AfterJSON',type:'Text'},{id:'Details',type:'Text'},
      {id:'Source',type:'Text'},{id:'Success',type:'Bool'},{id:'SessionId',type:'Text'}
    ],
    ActivityLog:[
      {id:'Date',type:'DateTime'},
      {id:'ActorEmail',type:'Text'},{id:'ActorName',type:'Text'},
      {id:'InventoryType',type:'Text'},{id:'ItemCode',type:'Text'},{id:'ItemName',type:'Text'},
      {id:'Action',type:'Text'},{id:'Summary',type:'Text'},
      {id:'EntityType',type:'Text'},{id:'EntityCode',type:'Text'},
      {id:'Source',type:'Text'},{id:'SessionId',type:'Text'}
    ]
  };

  const DOMAIN_TABLES=new Set([
    'Antibodies','Vials','Positions','Boxes','Documents','Notes',
    'InventoryItems','InventoryUnits','InventoryPositions','InventoryContainers',
    'InventoryDocuments','InventoryNotes'
  ]);

  const EXCLUDE_AUDIT_TABLES=new Set([
    'AuditLog','ActivityLog','History','InventoryHistory',
    'SecurityAdminGate','SecurityEditorGate','PublicSettings'
  ]);

  ns.version=VERSION;
  ns.sessionId=ns.sessionId||(
    'S-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)
  );
  ns.role=core.ROLES.UNCONFIGURED;
  ns.securityEnabled=false;
  ns.securityTablesReady=false;
  ns.data=ns.data||{};
  ns._nativeApply=null;
  ns._writeGuardInstalled=false;
  ns._uiObserver=null;
  ns.adminSecurityTab=false;

  const escHtml=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>'"]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function tableRows(raw){
    try{return rows(raw)||[];}catch(_){return [];}
  }

  async function listTablesSafe(){
    try{return await grist.docApi.listTables();}catch(_){return [];}
  }

  async function fetchTableSafe(name){
    try{return await grist.docApi.fetchTable(name);}
    catch(err){return null;}
  }

  async function refreshSecurityData(){
    if(!state?.connected || !window.grist) return;
    const tables=await listTablesSafe();
    ns.securityTablesReady=['SecurityAdminGate','SecurityEditorGate','PublicSettings','AuditLog','ActivityLog']
      .every(t=>tables.includes(t));

    for(const name of Object.keys(SECURITY_SCHEMAS)){
      if(!tables.includes(name)){ ns.data[name]=null; continue; }
      const raw=await fetchTableSafe(name);
      ns.data[name]=raw;
    }

    const settings=tableRows(ns.data.PublicSettings);
    const sec=settings.find(r=>r.Key==='security_enforcement');
    ns.securityEnabled=String(sec?.Value||'off').toLowerCase()==='on';

    await detectRole();
    applyRoleUI();
    injectActivityCard();
  }

  async function detectRole(){
    if(!state?.connected){
      ns.role=core.ROLES.UNCONFIGURED;
      return ns.role;
    }

    const tables=await listTablesSafe();
    if(!tables.includes('SecurityAdminGate') || !tables.includes('SecurityEditorGate')){
      ns.role=core.ROLES.UNCONFIGURED;
      return ns.role;
    }

    // After ACL is configured:
    // - Owner can read both gates.
    // - Editor can only read editor gate.
    // - Viewer can read neither gate.
    try{
      await grist.docApi.fetchTable('SecurityAdminGate');
      ns.role=core.ROLES.ADMIN;
      return ns.role;
    }catch(_){}

    try{
      await grist.docApi.fetchTable('SecurityEditorGate');
      ns.role=core.ROLES.EDITOR;
      return ns.role;
    }catch(_){}

    ns.role=core.ROLES.VIEWER;
    return ns.role;
  }

  function getPublicSettingSync(key, fallback=''){
    const row=tableRows(ns.data.PublicSettings).find(r=>r.Key===key);
    return row?.Value??fallback;
  }

  async function getPublicSetting(key,fallback=''){
    if(!ns.data.PublicSettings){
      const raw=await fetchTableSafe('PublicSettings');
      if(raw) ns.data.PublicSettings=raw;
    }
    return getPublicSettingSync(key,fallback);
  }

  async function setPublicSetting(key,value,description=''){
    if(!state.connected) throw new Error('Connexion Grist requise.');
    if(ns.securityEnabled && ns.role!==core.ROLES.ADMIN){
      throw new Error('Action réservée aux administrateurs.');
    }
    const raw=await fetchTableSafe('PublicSettings');
    const list=tableRows(raw);
    const row=list.find(r=>r.Key===key);
    const action=row
      ? ['UpdateRecord','PublicSettings',Number(row.id),{Value:String(value),Description:description||row.Description||''}]
      : ['AddRecord','PublicSettings',null,{Key:key,Value:String(value),Description:description}];
    const apply=ns._nativeApply||grist.docApi.applyUserActions.bind(grist.docApi);
    await apply([action]);
    ns.data.PublicSettings=await fetchTableSafe('PublicSettings');
    if(key==='security_enforcement') ns.securityEnabled=String(value).toLowerCase()==='on';
    return true;
  }

  async function ensureSecuritySchema(){
    if(!state.connected) throw new Error('Connexion Grist requise.');
    const apply=ns._nativeApply||grist.docApi.applyUserActions.bind(grist.docApi);
    const current=new Set(await grist.docApi.listTables());
    const created=[];

    for(const [name,cols] of Object.entries(SECURITY_SCHEMAS)){
      if(current.has(name)) continue;
      await apply([['AddTable',name,cols]]);
      current.add(name);
      created.push(name);
    }

    async function addIfEmpty(table,records){
      const raw=await fetchTableSafe(table);
      if(tableRows(raw).length) return;
      for(const rec of records){
        await apply([['AddRecord',table,null,rec]]);
      }
    }

    await addIfEmpty('SecurityAdminGate',[
      {Key:'ADMIN_GATE',Value:'Owner-only read gate. Do not delete.'}
    ]);
    await addIfEmpty('SecurityEditorGate',[
      {Key:'EDITOR_GATE',Value:'Owner+Editor read gate. Do not delete.'}
    ]);
    await addIfEmpty('PublicSettings',[
      {Key:'security_enforcement',Value:'off',Description:'Set to on only after Grist Access Rules are configured.'},
      {Key:'scientific_watch_proxy_url',Value:'',Description:'Base URL of the BioDynaMit Europe PMC proxy, e.g. https://...workers.dev'}
    ]);

    await refreshSecurityData();
    return created;
  }

  function getRowFromState(table,id){
    try{
      return tableRows(state.data?.[table]).find(r=>Number(r.id)===Number(id))||null;
    }catch(_){return null;}
  }

  function truncate(value,max=12000){
    const s=typeof value==='string'?value:JSON.stringify(value??null);
    return s.length>max?s.slice(0,max)+'…':s;
  }

  function actionSnapshot(action){
    const name=String(action?.[0]||'');
    const table=String(action?.[1]||'');
    const id=action?.[2];
    const payload=action?.[3]||{};
    let before=null,after=null,details='';

    if(name==='UpdateRecord'){
      before=getRowFromState(table,id);
      after={...(before||{}),...(payload||{})};
      details='Champs modifiés : '+Object.keys(payload||{}).join(', ');
    }else if(name==='AddRecord'){
      after=payload||{};
      details='Nouvel enregistrement';
    }else if(name==='RemoveRecord'){
      before=getRowFromState(table,id);
      details='Suppression d’un enregistrement';
    }else if(name==='BulkUpdateRecord'){
      details=`Modification multiple (${Array.isArray(id)?id.length:'plusieurs'} enregistrements)`;
      after=payload||{};
    }else if(name==='BulkAddRecord'){
      details=`Ajout multiple (${Array.isArray(id)?id.length:'plusieurs'} enregistrements)`;
      after=payload||{};
    }else if(name==='BulkRemoveRecord'){
      details=`Suppression multiple (${Array.isArray(id)?id.length:'plusieurs'} enregistrements)`;
    }else{
      details=`${name} sur ${table}`;
      after=payload||{};
    }
    return {name,table,id,before,after,details};
  }

  function resolvePrimaryItemFromVial(vial){
    if(!vial) return null;
    const a=getRowFromState('Antibodies',vial.Antibody);
    return a?{code:a.Code||'',name:a.Name||a.FullName||'',inventoryType:'primary_antibody'}:null;
  }

  function resolvePrimaryItemFromPosition(pos){
    if(!pos) return null;
    const vial=getRowFromState('Vials',pos.Vial);
    return resolvePrimaryItemFromVial(vial);
  }

  function resolveGenericItemFromUnit(unit){
    if(!unit) return null;
    const item=getRowFromState('InventoryItems',unit.Item);
    return item?{code:item.Code||'',name:item.Name||'',inventoryType:item.InventoryType||unit.InventoryType||''}:null;
  }

  function resolveGenericItemFromPosition(pos){
    if(!pos) return null;
    const unit=getRowFromState('InventoryUnits',pos.Unit);
    return resolveGenericItemFromUnit(unit);
  }

  function inferItem(table,row,payload={}){
    const r=row||payload||{};
    if(table==='Antibodies') return {code:r.Code||'',name:r.Name||r.FullName||'',inventoryType:'primary_antibody'};
    if(table==='Vials') return resolvePrimaryItemFromVial(r);
    if(table==='Positions') return resolvePrimaryItemFromPosition(r);
    if(table==='Documents'||table==='Notes'){
      const a=getRowFromState('Antibodies',r.Antibody);
      return a?{code:a.Code||'',name:a.Name||a.FullName||'',inventoryType:'primary_antibody'}:null;
    }
    if(table==='InventoryItems') return {code:r.Code||'',name:r.Name||'',inventoryType:r.InventoryType||''};
    if(table==='InventoryUnits') return resolveGenericItemFromUnit(r);
    if(table==='InventoryPositions') return resolveGenericItemFromPosition(r);
    if(table==='InventoryDocuments'||table==='InventoryNotes'){
      const item=getRowFromState('InventoryItems',r.Item);
      return item?{code:item.Code||'',name:item.Name||'',inventoryType:item.InventoryType||r.InventoryType||''}:null;
    }
    return null;
  }

  function entityCode(snapshot){
    const r=snapshot.before||snapshot.after||{};
    return String(r?.Code||r?.EntityCode||'');
  }

  async function writeAudit(actions,success,errorText=''){
    if(!state.connected || !Array.isArray(actions) || !actions.length) return;
    const tables=await listTablesSafe();
    const hasAudit=tables.includes('AuditLog');
    const hasActivity=tables.includes('ActivityLog');
    if(!hasAudit && !hasActivity) return;

    const native=ns._nativeApply||grist.docApi.applyUserActions.bind(grist.docApi);
    const auditActions=[];
    const activityActions=[];
    const now=Date.now()/1000;

    for(const action of actions){
      const snap=actionSnapshot(action);
      if(EXCLUDE_AUDIT_TABLES.has(snap.table)) continue;
      const item=inferItem(snap.table,snap.before,snap.after||{});
      const entCode=entityCode(snap);
      const recId=Array.isArray(snap.id)?snap.id.join(','):String(snap.id??'');
      const label=core.actionLabel(action);

      if(hasAudit){
        auditActions.push(['AddRecord','AuditLog',null,{
          Date:now,
          Role:core.roleLabel(ns.role),
          Action:label,
          EntityType:snap.table,
          EntityCode:entCode,
          InventoryType:item?.inventoryType||'',
          TableName:snap.table,
          RecordId:recId,
          BeforeJSON:truncate(snap.before),
          AfterJSON:truncate(snap.after),
          Details:truncate(success?snap.details:`ÉCHEC — ${errorText||snap.details}`,4000),
          Source:'BioDynaMit v11.3',
          Success:!!success,
          SessionId:ns.sessionId
        }]);
      }

      if(success && hasActivity && DOMAIN_TABLES.has(snap.table)){
        activityActions.push(['AddRecord','ActivityLog',null,{
          Date:now,
          InventoryType:item?.inventoryType||'',
          ItemCode:item?.code||'',
          ItemName:item?.name||'',
          Action:label,
          Summary:truncate(snap.details,1500),
          EntityType:snap.table,
          EntityCode:entCode,
          Source:'BioDynaMit v11.3',
          SessionId:ns.sessionId
        }]);
      }
    }

    try{
      if(auditActions.length) await native(auditActions);
      if(activityActions.length) await native(activityActions);
    }catch(err){
      console.warn('BioDynaMit v11.3 audit write:',err);
    }
  }

  function blockedMessage(reason){
    if(reason==='viewer_read_only') return 'Mode lecture seule : aucune modification n’est autorisée.';
    if(reason==='editor_no_delete') return 'Les utilisateurs labo ne peuvent supprimer aucun enregistrement.';
    if(reason==='editor_no_schema') return 'La structure de la BDD est réservée aux administrateurs.';
    return 'Action non autorisée par la politique de sécurité.';
  }

  function installWriteGuard(){
    if(ns._writeGuardInstalled || !window.grist?.docApi?.applyUserActions) return;
    const original=grist.docApi.applyUserActions.bind(grist.docApi);
    ns._nativeApply=original;

    const guarded=async function(actions){
      const list=Array.isArray(actions)?actions:[];
      if(ns.securityEnabled){
        for(const action of list){
          const decision=core.canApply(ns.role,action,true);
          if(!decision.allowed){
            const msg=blockedMessage(decision.reason);
            try{toast(msg);}catch(_){}
            await writeAudit(list,false,msg);
            throw new Error(msg);
          }
        }
      }
      try{
        const result=await original(actions);
        await writeAudit(list,true,'');
        // Refresh app-specific security/activity data asynchronously; do not block UI.
        setTimeout(()=>refreshSecurityData().catch(()=>{}),80);
        return result;
      }catch(err){
        await writeAudit(list,false,err?.message||String(err));
        throw err;
      }
    };

    try{
      grist.docApi.applyUserActions=guarded;
      ns._writeGuardInstalled=true;
    }catch(err){
      console.warn('BioDynaMit v11.3: impossible d’installer le garde d’écriture.',err);
    }
  }

  function roleClass(){ return `v113-role-${ns.role}`; }

  function applyRoleUI(){
    const enabled=ns.securityEnabled;
    const isAdmin=ns.role===core.ROLES.ADMIN || ns.role===core.ROLES.UNCONFIGURED;

    const adminBtn=document.querySelector('.sidebar-bottom [data-route="admin"]');
    if(adminBtn){
      adminBtn.style.display=(enabled&&!isAdmin)?'none':'';
      adminBtn.setAttribute('aria-hidden',(enabled&&!isAdmin)?'true':'false');
    }

    const profile=document.querySelector('.sidebar-bottom .profile');
    if(profile){
      const strong=profile.querySelector('strong');
      const small=profile.querySelector('small');
      if(strong) strong.textContent=core.roleLabel(ns.role);
      if(small) small.textContent=enabled?'Sécurité v11.3 active':'Sécurité v11.3 à configurer';
      profile.classList.remove('v113-role-admin','v113-role-editor','v113-role-viewer','v113-role-unconfigured');
      profile.classList.add(roleClass());
    }

    // UI convenience only; the true protection is Grist Access Rules + the write guard.
    document.querySelectorAll('button,a').forEach(el=>{
      const txt=String(el.textContent||'').trim().toLowerCase();
      if(enabled && ns.role!==core.ROLES.ADMIN && /^(supprimer|delete|supprimer définitivement)/i.test(txt)){
        el.style.display='none';
      }
    });
  }

  function securityTabs(active='security'){
    const tabs=[
      ['overview','Vue générale'],['inventories','Inventaires'],['fields','Champs'],
      ['suppliers','Fournisseurs & synonymes'],['rules','Règles & alertes'],
      ['watch','Veille scientifique'],['imports','Imports'],['integrity','Intégrité'],
      ['versions','Versions'],['security','Sécurité & audit']
    ];
    return `<div class="v112-admin-tabs">
      ${tabs.map(([k,l])=>`<button class="tab ${active===k?'active':''}" data-v113-admin="${k}">${escHtml(l)}</button>`).join('')}
    </div>`;
  }

  function bindSecurityTabs(){
    document.querySelectorAll('[data-v113-admin]').forEach(btn=>{
      btn.onclick=()=>{
        const k=btn.dataset.v113Admin;
        if(k==='security'){
          v112.adminTab='security';
          admin();
        }else{
          v112.adminTab=k;
          admin();
        }
      };
    });
  }

  function auditRows(){
    return tableRows(ns.data.AuditLog).slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0));
  }

  function fmtDate(v){
    if(!v) return '—';
    const ms=Number(v)<1e12?Number(v)*1000:Number(v);
    try{return new Date(ms).toLocaleString('fr-FR');}catch(_){return String(v);}
  }

  function auditTableHtml(list){
    if(!list.length) return '<div class="empty">Aucune action auditée pour le moment.</div>';
    return `<div class="table-wrap v113-audit-table"><table class="table">
      <thead><tr>
        <th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Action</th>
        <th>Table</th><th>Entité</th><th>Détails</th><th>Résultat</th>
      </tr></thead>
      <tbody>${list.slice(0,250).map(r=>`<tr>
        <td>${escHtml(fmtDate(r.Date))}</td>
        <td><b>${escHtml(r.ActorName||'—')}</b><small>${escHtml(r.ActorEmail||'')}</small></td>
        <td>${escHtml(r.Role||'')}</td>
        <td>${escHtml(r.Action||'')}</td>
        <td>${escHtml(r.TableName||r.EntityType||'')}</td>
        <td>${escHtml(r.EntityCode||r.RecordId||'')}</td>
        <td><button class="btn btn-sm v113-audit-detail" data-v113-audit-id="${Number(r.id)}">Voir</button></td>
        <td><span class="pill ${r.Success?'ok':'warn'}">${r.Success?'OK':'Échec'}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function showAuditDetail(id){
    const r=auditRows().find(x=>Number(x.id)===Number(id));
    if(!r) return;
    modal(`<h2>Détail de l’action</h2>
      <div class="v113-audit-detail-grid">
        <b>Date</b><span>${escHtml(fmtDate(r.Date))}</span>
        <b>Utilisateur</b><span>${escHtml(r.ActorName||'—')} ${r.ActorEmail?`<small>${escHtml(r.ActorEmail)}</small>`:''}</span>
        <b>Rôle</b><span>${escHtml(r.Role||'—')}</span>
        <b>Action</b><span>${escHtml(r.Action||'—')}</span>
        <b>Table</b><span>${escHtml(r.TableName||'—')}</span>
        <b>Entité</b><span>${escHtml(r.EntityCode||r.RecordId||'—')}</span>
        <b>Détails</b><span>${escHtml(r.Details||'—')}</span>
      </div>
      <details class="v113-json"><summary>Avant</summary><pre>${escHtml(r.BeforeJSON||'—')}</pre></details>
      <details class="v113-json"><summary>Après</summary><pre>${escHtml(r.AfterJSON||'—')}</pre></details>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="v113AuditClose">Fermer</button></div>`);
    document.querySelector('#v113AuditClose').onclick=closeModal;
  }

  function roleStatusHtml(){
    const label=core.roleLabel(ns.role);
    const cls=ns.role==='admin'?'ok':ns.role==='editor'?'warn':ns.role==='viewer'?'neutral':'warn';
    return `<span class="pill ${cls}">${escHtml(label)}</span>`;
  }

  async function testWatchProxy(){
    const out=document.querySelector('#v113WatchTestResult');
    if(out) out.innerHTML='Test en cours…';
    try{
      const base=(await getPublicSetting('scientific_watch_proxy_url','')).trim().replace(/\/$/,'');
      if(!base) throw new Error('URL du proxy non configurée.');
      const u=new URL(base+'/europepmc');
      u.searchParams.set('format','json');
      u.searchParams.set('pageSize','1');
      u.searchParams.set('resultType','core');
      u.searchParams.set('query',`FIRST_PDATE:[${new Date().getFullYear()}-01-01 TO ${new Date().getFullYear()}-12-31] AND mitochondria`);
      const r=await fetch(u.toString(),{credentials:'omit'});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const data=await r.json();
      const count=data?.hitCount ?? data?.resultList?.result?.length ?? 0;
      if(out) out.innerHTML=`<span class="pill ok">Proxy opérationnel · ${escHtml(count)} résultat(s) signalé(s)</span>`;
    }catch(err){
      if(out) out.innerHTML=`<span class="pill warn">${escHtml(err.message||String(err))}</span>`;
    }
  }

  function renderSecurityAdmin(){
    topbar('Administration');
    const ready=ns.securityTablesReady;
    const proxy=getPublicSettingSync('scientific_watch_proxy_url','');
    const audits=auditRows();

    content.innerHTML=`<h1 class="page-title">Administration v11.3</h1>
      <p class="subtitle">Permissions, traçabilité, accès en page unique et veille scientifique sécurisée.</p>
      ${securityTabs('security')}

      <div class="grid grid-3 v113-security-metrics">
        <div class="card card-pad">
          <h3>Rôle détecté</h3>
          ${roleStatusHtml()}
          <p class="subtitle">Détection via les tables-gates protégées par les Access Rules Grist.</p>
        </div>
        <div class="card card-pad">
          <h3>Mode sécurisé</h3>
          <span class="pill ${ns.securityEnabled?'ok':'warn'}">${ns.securityEnabled?'Actif':'Inactif'}</span>
          <p class="subtitle">${ns.securityEnabled?'Les restrictions UI et le garde d’écriture sont actifs.':'À activer seulement après configuration des Access Rules.'}</p>
        </div>
        <div class="card card-pad">
          <h3>Audit</h3>
          <div class="metric-value">${audits.length}</div>
          <p class="subtitle">Actions détaillées visibles par les administrateurs.</p>
        </div>
      </div>

      <div class="card card-pad v113-section">
        <div class="row space-between" style="align-items:flex-start;gap:16px">
          <div>
            <h3 class="section-title">1. Structure de sécurité</h3>
            <p class="subtitle">Crée uniquement les tables manquantes. Aucune donnée métier n’est migrée ni supprimée.</p>
          </div>
          <span class="pill ${ready?'ok':'warn'}">${ready?'Tables présentes':'À initialiser'}</span>
        </div>
        <div class="row" style="margin-top:12px;justify-content:flex-start;gap:8px">
          <button class="btn btn-primary" id="v113EnsureSecurity">${ready?'Vérifier la structure v11.3':'Initialiser la structure v11.3'}</button>
        </div>
      </div>

      <div class="card card-pad v113-section">
        <h3 class="section-title">2. Règles d’accès Grist</h3>
        <p class="subtitle">La sécurité réelle se fait dans Grist. Le modèle retenu est simple : Owner = Administrateur, Editor = Utilisateur labo, Viewer = Lecture seule.</p>
        <div class="v113-role-grid">
          <div><b>Administrateur</b><span>Lecture, création, modification, suppression, structure, Administration et audit.</span></div>
          <div><b>Utilisateur labo</b><span>Accès à la BDD, création et modification. Aucune suppression, aucune structure, pas d’Administration.</span></div>
          <div><b>Lecture seule</b><span>Consultation uniquement.</span></div>
        </div>
        <div class="banner warn" style="margin-top:12px">
          Configure d’abord les Access Rules avec le guide fourni dans le ZIP. Ensuite seulement, active le mode sécurisé ci-dessous.
        </div>
        <div class="row" style="margin-top:12px;justify-content:flex-start;gap:8px">
          <button class="btn ${ns.securityEnabled?'':'btn-primary'}" id="v113EnableSecurity">${ns.securityEnabled?'Désactiver temporairement':'J’ai configuré les règles — activer'}</button>
        </div>
      </div>

      <div class="card card-pad v113-section">
        <h3 class="section-title">3. Identité dans les journaux</h3>
        <p class="subtitle">Pour une attribution fiable côté Grist, configure les colonnes d’auteur de <b>AuditLog</b> et <b>ActivityLog</b> : ActorEmail = <code>user.Email</code> et ActorName = <code>user.Name</code>, appliquées aux nouveaux enregistrements.</p>
        <div class="banner neutral">Le widget n’invente jamais l’identité. Grist la tamponne au moment de l’écriture.</div>
      </div>

      <div class="card card-pad v113-section">
        <h3 class="section-title">4. Veille scientifique — proxy Europe PMC</h3>
        <p class="subtitle">Le navigateur Grist bloque actuellement l’accès direct à Europe PMC. v11.3 utilise un petit proxy sans accès à la BDD.</p>
        <div class="field">
          <label>URL du Worker / proxy</label>
          <input id="v113WatchProxy" value="${escHtml(proxy)}" placeholder="https://biodynamit-watch....workers.dev">
        </div>
        <div class="row" style="margin-top:10px;justify-content:flex-start;gap:8px">
          <button class="btn btn-primary" id="v113SaveWatchProxy">Enregistrer</button>
          <button class="btn" id="v113TestWatchProxy">Tester</button>
          <span id="v113WatchTestResult"></span>
        </div>
        <p class="subtitle" style="margin-top:8px">Le fichier <code>scientific-watch-worker-v11.3.js</code> est fourni dans le package. Il ne contient aucun secret Grist.</p>
      </div>

      <div class="card card-pad v113-section">
        <div class="row space-between" style="align-items:center;gap:12px">
          <div>
            <h3 class="section-title">5. Journal d’audit administrateur</h3>
            <p class="subtitle">Créations, modifications, tentatives de suppression, avant/après et résultat.</p>
          </div>
          <button class="btn" id="v113RefreshAudit">Actualiser</button>
        </div>
        <div class="searchbar" style="margin-top:10px">
          <input id="v113AuditSearch" placeholder="Utilisateur, action, table, anticorps…">
          <button class="btn" id="v113AuditClear">Effacer</button>
        </div>
        <div id="v113AuditBody" style="margin-top:10px">${auditTableHtml(audits)}</div>
      </div>`;

    bindSecurityTabs();

    const ensureBtn=document.querySelector('#v113EnsureSecurity');
    if(ensureBtn) ensureBtn.onclick=async()=>{
      ensureBtn.disabled=true;
      ensureBtn.textContent='Vérification…';
      try{
        const created=await ensureSecuritySchema();
        toast(created.length?`${created.length} table(s) v11.3 créée(s).`:'Structure v11.3 déjà complète.');
        await refreshSecurityData();
        renderSecurityAdmin();
      }catch(err){
        toast(`Erreur : ${err.message||err}`);
        ensureBtn.disabled=false;
      }
    };

    const enableBtn=document.querySelector('#v113EnableSecurity');
    if(enableBtn) enableBtn.onclick=async()=>{
      try{
        if(ns.securityEnabled){
          if(!confirm('Désactiver temporairement les restrictions applicatives v11.3 ? Les Access Rules Grist restent en place.')) return;
          await setPublicSetting('security_enforcement','off','Application-level security state.');
        }else{
          if(!confirm('Confirme que les Access Rules Grist du guide v11.3 sont déjà configurées. Activer ensuite les restrictions applicatives ?')) return;
          await setPublicSetting('security_enforcement','on','Application-level security state.');
        }
        await refreshSecurityData();
        renderSecurityAdmin();
      }catch(err){toast(`Erreur : ${err.message||err}`);}
    };

    const saveProxy=document.querySelector('#v113SaveWatchProxy');
    if(saveProxy) saveProxy.onclick=async()=>{
      const value=document.querySelector('#v113WatchProxy').value.trim();
      try{
        await setPublicSetting('scientific_watch_proxy_url',value,'Base URL for the BioDynaMit Europe PMC proxy.');
        toast('URL de veille enregistrée.');
      }catch(err){toast(`Erreur : ${err.message||err}`);}
    };

    document.querySelector('#v113TestWatchProxy')?.addEventListener('click',testWatchProxy);

    const refreshAudit=async()=>{
      const raw=await fetchTableSafe('AuditLog');
      if(raw) ns.data.AuditLog=raw;
      renderSecurityAdmin();
    };
    document.querySelector('#v113RefreshAudit')?.addEventListener('click',refreshAudit);

    const filterAudit=()=>{
      const q=String(document.querySelector('#v113AuditSearch')?.value||'').toLowerCase().trim();
      const list=auditRows().filter(r=>!q || [
        r.ActorName,r.ActorEmail,r.Role,r.Action,r.TableName,r.EntityCode,r.Details
      ].some(v=>String(v||'').toLowerCase().includes(q)));
      document.querySelector('#v113AuditBody').innerHTML=auditTableHtml(list);
      document.querySelectorAll('[data-v113-audit-id]').forEach(b=>b.onclick=()=>showAuditDetail(b.dataset.v113AuditId));
    };
    const search=document.querySelector('#v113AuditSearch');
    if(search) search.oninput=filterAudit;
    document.querySelector('#v113AuditClear')?.addEventListener('click',()=>{
      if(search) search.value='';
      filterAudit();
    });
    document.querySelectorAll('[data-v113-audit-id]').forEach(b=>b.onclick=()=>showAuditDetail(b.dataset.v113AuditId));
  }

  // Admin wrapper: adds one v11.3 tab without disturbing v11.2 configuration screens.
  const baseAdmin=typeof admin==='function'?admin:null;
  if(baseAdmin){
    admin=function(){
      if(ns.securityEnabled && ns.role!==core.ROLES.ADMIN){
        toast('Administration réservée aux administrateurs.');
        state.route='dashboard';
        renderNav();
        render();
        return;
      }

      if(v112.adminTab==='security'){
        renderSecurityAdmin();
        return;
      }

      baseAdmin();
      const tabs=document.querySelector('.v112-admin-tabs');
      if(tabs && !tabs.querySelector('[data-v113-admin="security"]')){
        const b=document.createElement('button');
        b.className='tab';
        b.dataset.v113Admin='security';
        b.textContent='Sécurité & audit';
        b.onclick=()=>{v112.adminTab='security';admin();};
        tabs.appendChild(b);
      }
      const h=document.querySelector('#content .page-title');
      if(h && /Administration v11\.2/.test(h.textContent)) h.textContent='Administration v11.3';
      applyRoleUI();
    };
  }

  // Route guard.
  const baseGo=typeof go==='function'?go:null;
  if(baseGo){
    go=function(route){
      if(route==='admin' && ns.securityEnabled && ns.role!==core.ROLES.ADMIN){
        toast('Administration réservée aux administrateurs.');
        return baseGo('dashboard');
      }
      return baseGo(route);
    };
  }

  // Nav wrapper so role visibility survives every rerender.
  const baseRenderNav=typeof renderNav==='function'?renderNav:null;
  if(baseRenderNav){
    renderNav=function(){
      const out=baseRenderNav.apply(this,arguments);
      applyRoleUI();
      return out;
    };
  }

  async function refreshActivityData(){
    const raw=await fetchTableSafe('ActivityLog');
    if(raw) ns.data.ActivityLog=raw;
  }

  function currentItemContext(){
    if(state.route==='antibody-detail'){
      const a=getRowFromState('Antibodies',state.selectedAntibody);
      if(a) return {code:a.Code||'',name:a.Name||a.FullName||'',inventoryType:'primary_antibody'};
    }
    if(String(state.route||'').startsWith('inv:')){
      const type=String(state.route).slice(4);
      if(v112.inventoryView?.[type]==='detail'){
        try{
          const data=v112.inventoryData?.(type);
          const id=v112.inventorySelected?.[type];
          const item=data?.items?.find(x=>String(x.id)===String(id));
          if(item) return {code:item.code||'',name:item.name||'',inventoryType:type};
        }catch(_){}
      }
    }
    return null;
  }

  function injectActivityCard(){
    if(!document.querySelector('#content')) return;
    if(document.querySelector('.v113-item-activity')) return;
    const ctx=currentItemContext();
    if(!ctx?.code) return;
    const list=tableRows(ns.data.ActivityLog)
      .filter(r=>String(r.ItemCode||'')===String(ctx.code))
      .sort((a,b)=>Number(b.Date||0)-Number(a.Date||0))
      .slice(0,20);

    const card=document.createElement('div');
    card.className='card card-pad v113-item-activity';
    card.style.marginTop='16px';
    card.innerHTML=`<div class="row space-between" style="align-items:flex-start;gap:12px">
      <div><h3 class="section-title">Activité & traçabilité</h3>
      <p class="subtitle">Historique opérationnel enregistré depuis la v11.3 pour ${escHtml(ctx.name||ctx.code)}.</p></div>
      <span class="pill neutral">${list.length} action${list.length>1?'s':''}</span></div>
      ${list.length?`<div class="v113-activity-list">${list.map(r=>`
        <div class="v113-activity-row">
          <time>${escHtml(fmtDate(r.Date))}</time>
          <div><b>${escHtml(r.Action||'Action')}</b><span>${escHtml(r.Summary||'')}</span></div>
          <small>${escHtml(r.ActorName||'Utilisateur')}</small>
        </div>`).join('')}</div>`:
        '<div class="empty">Aucune activité enregistrée depuis l’activation de la v11.3.</div>'}`;
    document.querySelector('#content').appendChild(card);
  }

  function installUiObserver(){
    if(ns._uiObserver) return;
    let busy=false;
    ns._uiObserver=new MutationObserver(()=>{
      if(busy) return;
      busy=true;
      try{
        applyRoleUI();
        injectActivityCard();
      }finally{
        busy=false;
      }
    });
    ns._uiObserver.observe(document.body,{childList:true,subtree:true});
  }

  async function bootstrap(){
    installWriteGuard();
    installUiObserver();

    let tries=0;
    const wait=async()=>{
      tries++;
      if(state?.connected){
        await refreshSecurityData();
        await refreshActivityData();
        applyRoleUI();
        injectActivityCard();
        return;
      }
      if(tries<40) setTimeout(wait,250);
    };
    wait();
  }

  ns.ensureSecuritySchema=ensureSecuritySchema;
  ns.refreshSecurityData=refreshSecurityData;
  ns.refreshActivityData=refreshActivityData;
  ns.detectRole=detectRole;
  ns.getPublicSetting=getPublicSetting;
  ns.setPublicSetting=setPublicSetting;
  ns.renderSecurityAdmin=renderSecurityAdmin;
  ns.testWatchProxy=testWatchProxy;
  ns.core=core;

  window.BioDynaMitSecurityV113=ns;
  bootstrap();
})();
