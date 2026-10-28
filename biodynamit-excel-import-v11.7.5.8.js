/* BioDynaMit v11.7.5.8 — Import Excel fidèle aux colonnes source.
   Additif : ne modifie pas les modules 3D ni les données existantes.
   Objectif :
   - lire les entêtes réelles du fichier Excel ;
   - conserver l'ordre et le libellé des colonnes ;
   - mapper les champs BioDynaMit standards quand ils sont reconnus ;
   - stocker toutes les autres colonnes comme InventoryAttributes ;
   - créer des FieldDefinitions "Import Excel" pour que la liste affiche
     les mêmes colonnes que l'Excel, dans le même ordre.
*/
(function(){
  'use strict';

  const VERSION='11.7.5.8';
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const core=window.BioDynaMitCoreV112;
  const X=ns.excelImportV11758=ns.excelImportV11758||{
    workbook:null,fileName:'',sheetName:'',rows:[],headerRow:1,type:'',columns:[],plan:[]
  };
  if(!core)return;

  const escHtml=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>core.normalizeText(String(v??''));
  const tr=name=>{try{
    const team=window.BioDynaMitTeamV115?.data?.[name];
    const sec=(window.BioDynaMitSecurityV113||window.BioDynaMitV113||{})?.data?.[name];
    return rows(state.data[name]||ns.data?.[name]||team||sec)||[];
  }catch(_){return[]}};
  const q=s=>document.querySelector(s);

  // Inventaires validés dont l'affichage métier ne doit jamais être remplacé
  // par les colonnes d'un Excel importé.
  const PROTECTED_LIST_TYPES=new Set(['secondary_antibody']);
  const SYSTEM_INVENTORIES=new Set(['primary_antibody','secondary_antibody','cell_stock']);
  const SYSTEM_IMPORT_PROFILES=new Set(['secondary_2025']);
  const isProtectedListType=type=>PROTECTED_LIST_TYPES.has(String(type||''));
  const isSystemInventory=type=>SYSTEM_INVENTORIES.has(String(type||''));
  const isAdminRole=()=>{
    const sec=window.BioDynaMitSecurityV113||window.BioDynaMitV113||{};
    return sec.role==='admin';
  };

  const CORE=[
    {key:'code',label:'Code',column:'Code',type:'text',aliases:['code','id','identifier','identifiant']},
    {key:'name',label:'Nom',column:'Name',type:'text',aliases:['name','nom','product','produit','antibody','anticorps','reagent','réactif','reactif','cell line','lignée','lignee']},
    {key:'supplier',label:'Fournisseur',column:'Supplier',type:'text',aliases:['supplier','company','manufacturer','vendor','fournisseur','marque']},
    {key:'catalog',label:'Référence catalogue',column:'CatalogNumber',type:'text',aliases:['catalog number','catalog','catalogue','reference','référence','ref','cat no','cat #','catalogue number','reference catalogue']},
    {key:'target',label:'Cible',column:'Target',type:'text',aliases:['target','cible','antigen','antigène','antigene']},
    {key:'targetspecies',label:'Espèce cible',column:'TargetSpecies',type:'text',aliases:['target species','species reactivity','reactivity','réactivité','reactivite','espèce cible','espece cible']},
    {key:'host',label:'Espèce hôte',column:'HostSpecies',type:'text',aliases:['host species','host','source organism','espèce hôte','espece hote']},
    {key:'fluor',label:'Fluorophore',column:'Fluorophore',type:'text',aliases:['fluorophore','fluor','conjugate','conjugué','conjugue']},
    {key:'ex',label:'Excitation (nm)',column:'Excitation_nm',type:'number',aliases:['excitation','excitation nm','ex','ex nm']},
    {key:'em',label:'Émission (nm)',column:'Emission_nm',type:'number',aliases:['emission','émission','emission nm','émission nm','em','em nm']},
    {key:'storage',label:'Température',column:'StorageTemperature',type:'text',aliases:['storage','storage temperature','temperature','température','conservation']},
    {key:'class',label:'Classe',column:'Class',type:'text',aliases:['class','classe','isotype','clonality','clonalité','clonalite']},
    {key:'website',label:'Site / datasheet',column:'Website',type:'text',aliases:['website','url','link','lien','datasheet','data sheet','supplier website']},
    {key:'comments',label:'Commentaires',column:'Comments',type:'text',aliases:['comments','commentaires','notes','infos','information','informations']}
  ];

  function coreForHeader(header){
    const n=norm(header);
    if(!n)return null;
    return CORE.find(f=>norm(f.label)===n||norm(f.column)===n||f.aliases.some(a=>norm(a)===n))||null;
  }

  function safeKey(header,index){
    let s=String(header||`Colonne ${index+1}`).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    if(!s)s=`colonne_${index+1}`;
    return `excel_${s}`;
  }

  function uniqueColumns(headers){
    const used=new Set();
    return headers.map((raw,i)=>{
      const label=String(raw??'').trim()||`Colonne ${i+1}`;
      const coreField=coreForHeader(label);
      let fieldKey=safeKey(label,i),base=fieldKey,n=2;
      while(used.has(fieldKey))fieldKey=`${base}_${n++}`;
      used.add(fieldKey);
      return {
        index:i,label,fieldKey,
        storageMode:coreField?'column':'attribute',
        columnName:coreField?.column||'',
        dataType:coreField?.type||'text',
        standardLabel:coreField?.label||''
      };
    });
  }

  function bestHeaderRow(data){
    let best={idx:0,score:-1};
    data.slice(0,20).forEach((r,i)=>{
      const values=(r||[]).map(v=>String(v??'').trim());
      const non=values.filter(Boolean).length;
      const distinct=new Set(values.filter(Boolean).map(norm)).size;
      const text=values.filter(v=>v&&isNaN(Number(v.replace(',','.')))).length;
      const score=non*2+distinct+text*.5;
      if(score>best.score)best={idx:i,score};
    });
    return best.idx+1;
  }

  function genericTypes(){
    return (ns.inventoryTypes?.()||[]).filter(x=>x.Mode==='generic'&&x.Enabled!==false);
  }

  function sheetRows(){
    if(!X.workbook||!X.sheetName||!window.XLSX)return[];
    const ws=X.workbook.Sheets[X.sheetName];
    // raw:true : récupérer la vraie valeur Excel, pas son affichage localisé.
    return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  }

  function looksLikeDateColumn(label){
    return /(^|[\s_\-])(date|jour|day)([\s_\-]|$)/i.test(String(label||'').trim());
  }

  function pad2(n){ return String(n).padStart(2,'0'); }

  function excelSerialToFrenchDate(value){
    const serial=Number(value);
    if(!Number.isFinite(serial))return value;
    const date1904=!!X.workbook?.Workbook?.WBProps?.date1904;
    const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
    const ms=epoch+Math.round(serial*86400000);
    const d=new Date(ms);
    if(Number.isNaN(d.getTime()))return value;
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;
  }

  function expandYear(y){
    const n=Number(y);
    if(String(y).length===4)return n;
    return n>=70?1900+n:2000+n;
  }

  function normalizeDateDisplay(value){
    if(value===null||value===undefined||value==='')return '';
    if(typeof value==='number'){
      if(value>20000&&value<100000)return excelSerialToFrenchDate(value);
      if(value>1e9){
        const d=new Date(value>1e12?value:value*1000);
        if(!Number.isNaN(d.getTime()))return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
      }
      return value;
    }
    if(value instanceof Date && !Number.isNaN(value.getTime())){
      return `${pad2(value.getDate())}/${pad2(value.getMonth()+1)}/${value.getFullYear()}`;
    }
    const s=String(value).trim();
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if(m)return `${pad2(m[3])}/${pad2(m[2])}/${m[1]}`;

    m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if(m){
      // Les anciens imports raw:false utilisaient le format US m/d/yy.
      const month=Number(m[1]),day=Number(m[2]),year=expandYear(m[3]);
      if(month>=1&&month<=12&&day>=1&&day<=31)return `${pad2(day)}/${pad2(month)}/${year}`;
    }

    m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const a=Number(m[1]),b=Number(m[2]),y=Number(m[3]);
      if(a>12&&b<=12)return `${pad2(a)}/${pad2(b)}/${y}`;
      if(b>12&&a<=12)return `${pad2(b)}/${pad2(a)}/${y}`;
      return `${pad2(a)}/${pad2(b)}/${y}`;
    }
    return s;
  }

  function rebuild(){
    X.rows=sheetRows();
    const headers=X.rows[Math.max(0,Number(X.headerRow||1)-1)]||[];
    X.columns=uniqueColumns(headers).map(c=>({...c,isDate:looksLikeDateColumn(c.label)}));
    buildPlan();
  }

  function valueFor(row,col){
    const raw=row?.[col.index];
    if(raw===null||raw===undefined||raw==='')return '';
    if(col.isDate)return normalizeDateDisplay(raw);
    if(col.dataType==='number'){
      if(typeof raw==='number')return raw;
      const s=String(raw??'').trim();
      if(!s)return null;
      const n=Number(s.replace(',','.'));
      return Number.isFinite(n)?n:String(raw??'');
    }
    return raw;
  }

  function columnStats(){
    const start=Math.max(0,Number(X.headerRow||1));
    const dataRows=X.rows.slice(start).filter(row=>row&&row.some(v=>String(v??'').trim()!==''));
    return X.columns.map(c=>{
      let nonEmpty=0;
      for(const row of dataRows){
        const v=valueFor(row,c);
        if(v!==null&&v!==undefined&&String(v).trim()!=='')nonEmpty++;
      }
      return {fieldKey:c.fieldKey,label:c.label,nonEmpty,total:dataRows.length};
    });
  }

  function mappedRows(){
    const start=Math.max(0,Number(X.headerRow||1));
    const out=[];
    for(let r=start;r<X.rows.length;r++){
      const row=X.rows[r];
      if(!row||!row.some(v=>String(v??'').trim()!==''))continue;
      const coreRec={InventoryType:X.type,Status:'Actif',Active:true};
      const attrs={};
      for(const col of X.columns){
        const val=valueFor(row,col);
        if(col.storageMode==='column')coreRec[col.columnName]=val;
        else attrs[col.fieldKey]=val;
      }
      out.push({sourceRow:r+1,core:coreRec,attributes:attrs});
    }
    return out;
  }

  function duplicateThreshold(){
    const f=tr('FeatureFlags').find(x=>x.Key==='duplicate_detection');
    return Math.max(0,Number(f?.Value||50));
  }

  function buildPlan(){
    if(!X.type){X.plan=[];return}
    const existing=tr('InventoryItems').filter(x=>x.InventoryType===X.type);
    let seq=1;
    X.plan=mappedRows().map(x=>{
      if(!String(x.core.Name||'').trim()){
        const first=X.columns.find(c=>String(x.core[c.columnName]??x.attributes[c.fieldKey]??'').trim());
        if(first){
          const v=first.storageMode==='column'?x.core[first.columnName]:x.attributes[first.fieldKey];
          x.core.Name=String(v||'').trim();
        }
      }
      if(!String(x.core.Code||'').trim()){
        x.core.Code=`${String(X.type||'ITEM').toUpperCase().replace(/[^A-Z0-9]+/g,'-')}-${Date.now().toString(36).toUpperCase()}-${String(seq++).padStart(3,'0')}`;
      }
      const dups=core.findDuplicateCandidates?.(x.core,existing,duplicateThreshold())||[];
      const best=dups[0]||null;
      return {...x,duplicates:dups.slice(0,3),best,action:best&&best.score>=80?'merge':'add'};
    });
  }

  async function chooseFile(file){
    if(!file)return;
    if(!window.XLSX)throw Error('La librairie XLSX n’a pas pu être chargée.');
    const buf=await file.arrayBuffer();
    X.workbook=XLSX.read(buf,{type:'array'});
    X.fileName=file.name;
    X.sheetName=X.workbook.SheetNames[0]||'';
    X.rows=sheetRows();
    X.headerRow=bestHeaderRow(X.rows);
    // Aucun inventaire n'est présélectionné : cela évite d'importer par erreur
    // un Excel dans les anticorps secondaires, qui est un inventaire système.
    X.type='';
    rebuild();
    renderWorkspace();
  }

  function typeOptions(){
    const types=genericTypes().slice().sort((a,b)=>{
      const ap=isSystemInventory(a.Key)?1:0,bp=isSystemInventory(b.Key)?1:0;
      return ap-bp||Number(a.SortOrder||0)-Number(b.SortOrder||0);
    });
    return `<option value="">— Choisir la liste de destination —</option>`+
      types.map(t=>`<option value="${escHtml(t.Key)}" ${t.Key===X.type?'selected':''}>${escHtml(t.Name||t.Key)}${isSystemInventory(t.Key)?' — inventaire système':''}</option>`).join('');
  }

  function selectedTypeWarning(){
    if(!X.type)return `<div class="banner warn" style="margin-top:10px"><b>Choisis d'abord la liste de destination.</b> Pour créer une nouvelle liste, passe par Administration → Inventaires → + Ajouter, avec Mode = generic.</div>`;
    if(isProtectedListType(X.type))return `<div class="banner warn" style="margin-top:10px"><b>Inventaire système protégé.</b> L'import peut ajouter/compléter des données, mais les colonnes de l'Excel ne remplaceront jamais l'affichage validé des anticorps secondaires.</div>`;
    return '';
  }

  function columnsPreview(){
    if(!X.columns.length)return'<div class="empty">Aucune colonne détectée.</div>';
    const exampleRow=X.rows[Math.max(0,X.headerRow)]||[];
    const stats=new Map(columnStats().map(s=>[s.fieldKey,s]));
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Colonne Excel</th><th>Exemple lu</th><th>Valeurs détectées</th><th>Import BioDynaMit</th></tr></thead>
      <tbody>${X.columns.map((c,i)=>{
        const st=stats.get(c.fieldKey)||{nonEmpty:0,total:0};
        return `<tr>
        <td>${i+1}</td>
        <td><b>${escHtml(c.label)}</b>${c.isDate?' <span class="pill ok">Date → JJ/MM/AAAA</span>':''}</td>
        <td>${escHtml(valueFor(exampleRow,c)??'')}</td>
        <td><b>${st.nonEmpty}</b> / ${st.total}</td>
        <td>${c.storageMode==='column'
          ?`<span class="pill ok">Champ standard</span> ${escHtml(c.standardLabel)}`
          :`<span class="pill neutral">Colonne personnalisée</span> ${escHtml(c.label)}`}</td>
      </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function planHtml(){
    if(!X.plan.length)return'<div class="empty">Aucune ligne de données détectée.</div>';
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Ligne Excel</th><th>Nom</th><th>Référence</th><th>Doublon</th><th>Action</th></tr></thead>
      <tbody>${X.plan.slice(0,200).map((p,i)=>`<tr>
        <td>${p.sourceRow}</td>
        <td>${escHtml(p.core.Name||p.core.Code||'—')}</td>
        <td>${escHtml(p.core.CatalogNumber||'—')}</td>
        <td>${p.best?`${Math.round(p.best.score)} % · ${escHtml(p.best.record?.Name||p.best.record?.Code||'')}`:'—'}</td>
        <td><select data-ximp-plan="${i}">
          <option value="add" ${p.action==='add'?'selected':''}>Ajouter</option>
          <option value="merge" ${p.action==='merge'?'selected':''} ${p.best?'':'disabled'}>Fusionner</option>
          <option value="ignore" ${p.action==='ignore'?'selected':''}>Ignorer</option>
        </select></td>
      </tr>`).join('')}</tbody></table></div>
      ${X.plan.length>200?`<p class="subtitle">Aperçu limité à 200 lignes sur ${X.plan.length}.</p>`:''}`;
  }

  function renderWorkspace(){
    const host=q('#v11755ImportWorkspace');
    if(!host)return;
    if(!X.workbook){
      host.innerHTML='<div class="empty">Choisis un fichier Excel. Les colonnes de la future liste seront créées directement depuis les entêtes du fichier.</div>';
      return;
    }
    host.innerHTML=`
      <div class="card card-pad">
        <div class="form-grid">
          <div class="field"><label>Fichier</label><input value="${escHtml(X.fileName)}" disabled></div>
          <div class="field"><label>Feuille</label><select id="v11755Sheet">${X.workbook.SheetNames.map(s=>`<option ${s===X.sheetName?'selected':''}>${escHtml(s)}</option>`).join('')}</select></div>
          <div class="field"><label>Type d’inventaire</label><select id="v11755Type">${typeOptions()}</select></div>
          <div class="field"><label>Ligne d’entête</label><input id="v11755Header" type="number" min="1" value="${X.headerRow}"></div>
        </div>
        ${selectedTypeWarning()}
      </div>
      <div class="card card-pad" style="margin-top:12px">
        <div class="row space-between"><div><h4>Colonnes détectées dans Excel</h4>
        <p class="subtitle">BioDynaMit reprend ces colonnes dans le même ordre. Les champs connus sont reliés aux champs standards ; les autres sont conservés comme champs personnalisés.</p></div>
        <span class="pill ok">${X.columns.length} colonne(s)</span></div>
        ${columnsPreview()}
      </div>
      <div class="card card-pad" style="margin-top:12px">
        <div class="row space-between"><div><h4>Plan d’import</h4>
        <p class="subtitle">Les doublons forts sont proposés en fusion. Les valeurs déjà présentes ne sont pas écrasées automatiquement.</p></div>
        <span class="pill neutral">${X.plan.length} ligne(s)</span></div>
        ${planHtml()}
        <label class="v112-check" style="margin-top:12px"><input type="checkbox" id="v11755Confirm"><span>Je confirme l’import et la création de la liste avec les colonnes du fichier Excel.</span></label>
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button class="btn btn-primary" id="v11755Apply">Appliquer l’import</button>
        </div>
      </div>`;

    q('#v11755Sheet').onchange=ev=>{X.sheetName=ev.target.value;X.rows=sheetRows();X.headerRow=bestHeaderRow(X.rows);rebuild();renderWorkspace()};
    q('#v11755Type').onchange=ev=>{X.type=ev.target.value;buildPlan();renderWorkspace()};
    q('#v11755Header').onchange=ev=>{X.headerRow=Math.max(1,Number(ev.target.value||1));rebuild();renderWorkspace()};
    document.querySelectorAll('[data-ximp-plan]').forEach(s=>s.onchange=()=>{X.plan[Number(s.dataset.ximpPlan)].action=s.value});
    q('#v11755Apply').onclick=()=>{if(!q('#v11755Confirm')?.checked)return toast('Confirme le plan avant l’import.');applyImport()};
  }

  function fieldDefinitionsForImport(){
    return X.columns.map((c,i)=>({
      InventoryType:X.type,
      FieldKey:c.fieldKey,
      Label:c.label,
      DataType:c.dataType,
      Required:false,
      Visible:true,
      Searchable:true,
      Section:'Import Excel',
      SortOrder:(i+1)*10,
      StorageMode:c.storageMode==='column'?'column':'attribute',
      ColumnName:c.columnName||'',
      ChoiceGroup:'',
      HelpText:`Colonne importée automatiquement depuis ${X.fileName} / ${X.sheetName}`,
      Active:true
    }));
  }

  async function syncFieldDefinitions(){
    if(!state.tables?.includes('FieldDefinitions'))throw Error('FieldDefinitions n’est pas initialisée.');
    // Inventaires métier validés : conserver leurs FieldDefinitions existantes.
    // Les colonnes Excel inconnues peuvent être stockées en attributs, mais elles
    // ne doivent jamais modifier les formulaires/listes métier.
    if(isProtectedListType(X.type))return;
    const wanted=fieldDefinitionsForImport();
    const wantedKeys=new Set(wanted.map(x=>x.FieldKey));
    const existing=tr('FieldDefinitions').filter(x=>x.InventoryType===X.type&&x.Section==='Import Excel');
    const actions=[];

    for(const old of existing){
      if(!wantedKeys.has(old.FieldKey)&&old.Active!==false){
        actions.push(['UpdateRecord','FieldDefinitions',Number(old.id),{Active:false,Visible:false}]);
      }
    }
    for(const d of wanted){
      const old=existing.find(x=>x.FieldKey===d.FieldKey);
      if(old)actions.push(['UpdateRecord','FieldDefinitions',Number(old.id),d]);
      else actions.push(['AddRecord','FieldDefinitions',null,d]);
    }
    if(actions.length)await grist.docApi.applyUserActions(actions);
  }

  async function upsertAttributes(itemId,attrs,source){
    const existing=tr('InventoryAttributes').filter(x=>Number(x.Item)===Number(itemId)&&x.InventoryType===X.type);
    const actions=[];
    for(const [key,val] of Object.entries(attrs||{})){
      if(val===null||val===undefined||String(val).trim()==='')continue;
      const old=existing.find(x=>x.FieldKey===key);
      if(old){
        const oldVal=old.ValueNumber!==null&&old.ValueNumber!==undefined&&old.ValueNumber!==''?old.ValueNumber:old.ValueText;
        if(oldVal===null||oldVal===undefined||String(oldVal).trim()===''){
          actions.push(['UpdateRecord','InventoryAttributes',Number(old.id),{
            ValueNumber:typeof val==='number'?val:null,
            ValueText:typeof val==='number'?'':String(val),
            ValueDate:null,ValueBool:null,
            Source:source
          }]);
        }
      }else{
        actions.push(['AddRecord','InventoryAttributes',null,{
          Item:Number(itemId),InventoryType:X.type,FieldKey:key,
          ValueNumber:typeof val==='number'?val:null,
          ValueText:typeof val==='number'?'':String(val),
          ValueDate:null,ValueBool:null,
          Source:source
        }]);
      }
    }
    if(actions.length)await grist.docApi.applyUserActions(actions);
  }

  async function applyImport(){
    if(!state.connected)return toast('Connexion Grist requise.');
    if(!X.type)return toast('Choisis la liste de destination avant d’appliquer l’import.');
    for(const t of ['InventoryItems','InventoryAttributes','FieldDefinitions','InventoryHistory']){
      if(!state.tables?.includes(t))return toast(`Table ${t} manquante : initialise d’abord la structure BioDynaMit.`);
    }

    let added=0,merged=0,ignored=0;
    try{
      await syncFieldDefinitions();
      if(typeof loadAll==='function')await loadAll();

      for(const p of X.plan){
        if(p.action==='ignore'){ignored++;continue}
        const source=`${X.fileName} / ${X.sheetName} / ligne ${p.sourceRow}`;
        if(p.action==='merge'&&p.best){
          const old=p.best.record,updates={};
          for(const [k,v] of Object.entries(p.core)){
            if(['InventoryType','Status','Active','Code'].includes(k))continue;
            if((old[k]===null||old[k]===undefined||String(old[k]).trim()==='')&&v!==null&&v!==undefined&&String(v).trim()!=='')updates[k]=v;
          }
          if(Object.keys(updates).length)await grist.docApi.applyUserActions([['UpdateRecord','InventoryItems',Number(old.id),updates]]);
          if(typeof loadAll==='function')await loadAll();
          await upsertAttributes(old.id,p.attributes,source);
          merged++;
        }else{
          const rec={...p.core,RawTable:`${X.fileName}:${X.sheetName}`,RawRowId:p.sourceRow};
          await grist.docApi.applyUserActions([['AddRecord','InventoryItems',null,rec]]);
          const fresh=await grist.docApi.fetchTable('InventoryItems');
          state.data.InventoryItems=fresh;ns.data.InventoryItems=fresh;
          const created=rows(fresh).find(x=>x.Code===rec.Code&&x.InventoryType===X.type);
          if(created)await upsertAttributes(created.id,p.attributes,source);
          added++;
        }
      }

      await grist.docApi.applyUserActions([['AddRecord','InventoryHistory',null,{
        Date:Date.now()/1000,InventoryType:X.type,Action:'Import Excel — colonnes source',
        EntityType:'Inventory',EntityCode:X.type,
        Details:`${X.fileName} / ${X.sheetName} : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés ; ${X.columns.length} colonnes reprises depuis Excel ; ${columnStats().reduce((n,s)=>n+s.nonEmpty,0)} cellules non vides détectées`,
        User:'Grist'
      }]]);

      if(typeof loadAll==='function')await loadAll();
      toast(`Import terminé : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés. ${X.columns.length} colonnes reprises depuis Excel.`);
      X.plan=[];
      renderWorkspace();
    }catch(err){
      console.error('BioDynaMit Excel import v11.7.5.8',err);
      toast(`Import interrompu : ${err.message||err}`);
    }
  }

  function importedDefs(type){
    return (ns.fieldsFor?.(type)||[])
      .filter(f=>f.Active!==false&&f.Visible!==false&&f.Section==='Import Excel')
      .sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  }

  function displayValue(item,field){
    let val;
    if(field.StorageMode==='column'){
      const raw=item.raw||{};
      val=raw[field.ColumnName];
    }else val=item.attributes?.[field.FieldKey];
    if(val===null||val===undefined||val==='')return '—';
    if(val===true)return 'Oui';
    if(val===false)return 'Non';
    if(looksLikeDateColumn(field.Label||field.FieldKey))return normalizeDateDisplay(val);
    return val;
  }

  function currentInventoryType(){
    const route=String(state?.route||'');
    if(!route.startsWith('inv:'))return'';
    return route.slice(4);
  }

  function dynamicFilter(items,defs,query){
    const n=norm(query);
    if(!n)return items;
    return items.filter(item=>defs.some(f=>norm(displayValue(item,f)).includes(n)));
  }

  function patchImportedList(){
    const type=currentInventoryType();
    if(!type||ns.inventoryView?.[type]==='detail'||ns.inventoryView?.[type]==='storage')return;
    // Correctif critique v11.7.5.8 : l'affichage validé des secondaires
    // ne peut plus être remplacé par des FieldDefinitions issues d'un import.
    if(isProtectedListType(type))return;
    const defs=importedDefs(type);
    if(!defs.length)return;

    let data;
    try{data=ns.inventoryData?.(type)}catch(_){return}
    if(!data)return;

    const table=q('#content .card.table-wrap table.table');
    if(!table)return;
    const signature=defs.map(f=>`${f.FieldKey}:${f.Label}:${f.SortOrder}`).join('|');
    if(table.dataset.excelSignature===signature)return;
    table.dataset.excelSignature=signature;

    const renderRows=list=>{
      const tbody=table.querySelector('tbody');
      if(!tbody)return;
      if(!list.length){
        tbody.innerHTML=`<tr><td colspan="${defs.length}"><div class="empty">Aucun résultat.</div></td></tr>`;
        return;
      }
      tbody.innerHTML=list.map(item=>`<tr>${defs.map((f,i)=>{
        const val=displayValue(item,f);
        return i===0
          ?`<td><button class="v112-link-btn" data-v11755-item="${escHtml(item.id)}"><b>${escHtml(val)}</b></button></td>`
          :`<td>${escHtml(val)}</td>`;
      }).join('')}</tr>`).join('');
      tbody.querySelectorAll('[data-v11755-item]').forEach(b=>b.onclick=()=>{
        ns.inventorySelected[type]=b.dataset.v11755Item;
        ns.inventoryView[type]='detail';
        ns.renderInventory?.(type);
      });
    };

    table.innerHTML=`<thead><tr>${defs.map(f=>`<th>${escHtml(f.Label)}</th>`).join('')}</tr></thead><tbody></tbody>`;
    const search=q('#v112InvSearch'),clear=q('#v112InvClear');
    const applySearch=()=>{
      const query=search?.value||'';
      ns.inventorySearch[type]=query;
      renderRows(dynamicFilter(data.items||[],defs,query));
    };
    if(search){
      search.placeholder=`Rechercher dans ${defs.length} colonne(s) Excel…`;
      search.oninput=applySearch;
    }
    if(clear)clear.onclick=()=>{if(search)search.value='';ns.inventorySearch[type]='';renderRows(data.items||[]);search?.focus()};
    renderRows(dynamicFilter(data.items||[],defs,search?.value||ns.inventorySearch?.[type]||''));

    const subtitle=q('#content .page-title + .subtitle');
    if(subtitle)subtitle.textContent=`Liste importée depuis Excel — ${defs.length} colonne(s) reprises depuis le fichier source.`;
  }

  function installListObserver(){
    let queued=false;
    const obs=new MutationObserver(()=>{
      if(queued)return;queued=true;
      requestAnimationFrame(()=>{queued=false;patchImportedList()});
    });
    const root=q('#content')||document.body;
    obs.observe(root,{childList:true,subtree:true});
    setTimeout(patchImportedList,0);
  }

  function bulkRemoveAction(table,ids){
    const list=[...new Set((ids||[]).map(Number).filter(Number.isFinite))];
    return list.length?['BulkRemoveRecord',table,list]:null;
  }

  function rowsForImportGroups(){
    const items=tr('InventoryItems'),attrs=tr('InventoryAttributes');
    const itemById=new Map(items.map(x=>[Number(x.id),x]));
    const groups=new Map();

    const ensure=(label,type='')=>{
      const key=`${type}||${label}`;
      if(!groups.has(key))groups.set(key,{key,label,type,itemIds:new Set(),attributeIds:new Set()});
      return groups.get(key);
    };

    for(const item of items){
      const raw=String(item.RawTable||'').trim();
      if(!raw||raw==='Ajout manuel')continue;
      const pos=raw.lastIndexOf(':');
      if(pos<=0)continue;
      const label=`${raw.slice(0,pos)} / ${raw.slice(pos+1)}`;
      ensure(label,item.InventoryType).itemIds.add(Number(item.id));
    }

    for(const a of attrs){
      const source=String(a.Source||'').trim();
      const m=source.match(/^(.*)\s\/\sligne\s+\d+\s*$/i);
      if(!m)continue;
      const item=itemById.get(Number(a.Item));
      if(!item)continue;
      ensure(m[1].trim(),a.InventoryType||item.InventoryType).attributeIds.add(Number(a.id));
    }

    const units=tr('InventoryUnits');
    return [...groups.values()].map(g=>{
      const unitCount=units.filter(u=>g.itemIds.has(Number(u.Item))).length;
      const typeName=(ns.inventoryTypes?.()||[]).find(t=>t.Key===g.type)?.Name||g.type||'Inventaire';
      return {...g,unitCount,typeName};
    }).sort((a,b)=>a.typeName.localeCompare(b.typeName,'fr')||a.label.localeCompare(b.label,'fr'));
  }

  function importManualDependencies(g){
    const itemIds=g.itemIds||new Set();
    const items=tr('InventoryItems').filter(x=>itemIds.has(Number(x.id)));
    const codes=new Set(items.map(x=>String(x.Code||'')).filter(Boolean));
    const countBy=(table,pred)=>tr(table).filter(pred).length;
    return {
      documents:countBy('InventoryDocuments',x=>itemIds.has(Number(x.Item))),
      notes:countBy('InventoryNotes',x=>itemIds.has(Number(x.Item))),
      reviews:countBy('LabReviews',x=>x.InventoryType===g.type&&codes.has(String(x.ItemCode||''))),
      usage:countBy('LabUsage',x=>x.InventoryType===g.type&&codes.has(String(x.ItemCode||''))),
      orders:countBy('LabOrders',x=>x.InventoryType===g.type&&codes.has(String(x.ItemCode||''))),
      unitMeta:countBy('LabUnitMeta',x=>x.InventoryType===g.type&&codes.has(String(x.ItemCode||'')))
    };
  }

  function dependencySummary(dep){
    return Object.entries(dep).filter(([,n])=>Number(n)>0).map(([k,n])=>`${n} ${k}`).join(', ');
  }

  async function refreshAfterMaintenance(){
    if(typeof loadAll==='function')await loadAll();
    if(typeof admin==='function')admin();
  }

  async function repairSecondaryExcelDisplay(){
    if(!isAdminRole())return toast('Réparation réservée à l’administrateur.');
    const defs=tr('FieldDefinitions').filter(x=>x.InventoryType==='secondary_antibody'&&x.Section==='Import Excel'&&(x.Active!==false||x.Visible!==false));
    if(!defs.length)return toast('Aucune colonne Excel parasite active sur les secondaires.');
    if(!confirm(`Désactiver ${defs.length} définition(s) de colonnes Excel accidentelles sur les anticorps secondaires ? Les anticorps, vials et positions ne seront pas supprimés.`))return;
    try{
      const actions=defs.map(x=>['UpdateRecord','FieldDefinitions',Number(x.id),{Active:false,Visible:false}]);
      await grist.docApi.applyUserActions(actions);
      await refreshAfterMaintenance();
      toast('Affichage des anticorps secondaires réparé.');
    }catch(err){console.error(err);toast(`Réparation impossible : ${err.message||err}`)}
  }

  async function deleteImportGroup(key){
    if(!isAdminRole())return toast('Suppression d’import réservée à l’administrateur.');
    const g=rowsForImportGroups().find(x=>x.key===key);
    if(!g)return toast('Import introuvable après relecture.');
    if(g.unitCount)return toast(`Suppression bloquée : ${g.unitCount} vial(s)/unité(s) sont relié(s) à cet import. Déplace ou archive d’abord ces éléments.`);
    const manualDeps=importManualDependencies(g);
    const manualCount=Object.values(manualDeps).reduce((a,b)=>a+Number(b||0),0);
    if(manualCount)return toast(`Suppression bloquée : des données de laboratoire sont liées aux lignes créées par cet import (${dependencySummary(manualDeps)}).`);
    const msg=`Supprimer l’import « ${g.label} » de ${g.typeName} ?\n\n`+
      `${g.itemIds.size} ligne(s) créée(s) et ${g.attributeIds.size} attribut(s) issus de cet import seront supprimés.\n`+
      `Les valeurs de champs standards qui auraient été fusionnées dans une fiche existante ne peuvent pas être annulées automatiquement.`;
    if(!confirm(msg))return;
    try{
      const itemIds=g.itemIds;
      const actions=[];
      const add=(table,ids)=>{if(state.tables?.includes(table)){const a=bulkRemoveAction(table,ids);if(a)actions.push(a)}};

      add('InventoryAttributes',tr('InventoryAttributes').filter(x=>itemIds.has(Number(x.Item))||g.attributeIds.has(Number(x.id))).map(x=>x.id));
      add('InventoryDocuments',tr('InventoryDocuments').filter(x=>itemIds.has(Number(x.Item))).map(x=>x.id));
      add('InventoryNotes',tr('InventoryNotes').filter(x=>itemIds.has(Number(x.Item))).map(x=>x.id));
      add('EnrichmentQueue',tr('EnrichmentQueue').filter(x=>x.TargetTable==='InventoryItems'&&itemIds.has(Number(x.TargetId))).map(x=>x.id));
      add('InventoryItems',[...itemIds]);

      // Si c'était le dernier import restant de ce type, on désactive ses colonnes
      // d'affichage importées au lieu de supprimer les définitions brutalement.
      const otherImported=tr('InventoryItems').filter(x=>x.InventoryType===g.type&&!itemIds.has(Number(x.id))&&String(x.RawTable||'').includes(':'));
      if(!otherImported.length){
        for(const d of tr('FieldDefinitions').filter(x=>x.InventoryType===g.type&&x.Section==='Import Excel'&&x.Active!==false)){
          actions.push(['UpdateRecord','FieldDefinitions',Number(d.id),{Active:false,Visible:false}]);
        }
      }

      if(actions.length)await grist.docApi.applyUserActions(actions);
      if(state.tables?.includes('InventoryHistory')){
        await grist.docApi.applyUserActions([['AddRecord','InventoryHistory',null,{
          Date:Date.now()/1000,InventoryType:g.type,Action:'Import Excel supprimé',
          EntityType:'Import',EntityCode:g.label,Details:`Suppression administrative : ${g.itemIds.size} ligne(s) créées par cet import`,User:'Grist'
        }]]);
      }
      await refreshAfterMaintenance();
      toast('Import supprimé.');
    }catch(err){console.error(err);toast(`Suppression de l’import impossible : ${err.message||err}`)}
  }

  async function deleteImportProfile(id){
    if(!isAdminRole())return toast('Suppression de profil d’import réservée à l’administrateur.');
    const profile=tr('ImportProfiles').find(x=>Number(x.id)===Number(id));
    if(!profile)return toast('Profil d’import introuvable.');
    if(SYSTEM_IMPORT_PROFILES.has(String(profile.Key||'')))return toast('Ce profil d’import système est protégé.');
    if(!confirm(`Supprimer le profil d’import « ${profile.Name||profile.Key} » ?\n\nCela supprime uniquement la configuration du profil. Les données déjà importées ne seront pas supprimées.`))return;
    try{
      await grist.docApi.applyUserActions([['RemoveRecord','ImportProfiles',Number(profile.id)]]);
      await refreshAfterMaintenance();
      toast('Profil d’import supprimé.');
    }catch(err){console.error(err);toast(`Suppression du profil impossible : ${err.message||err}`)}
  }

  async function deleteCustomInventory(id){
    if(!isAdminRole())return toast('Suppression d’inventaire réservée à l’administrateur.');
    const inv=tr('InventoryTypes').find(x=>Number(x.id)===Number(id));
    if(!inv)return toast('Inventaire introuvable.');
    if(isSystemInventory(inv.Key))return toast('Cet inventaire système est protégé et ne peut pas être supprimé.');

    const items=tr('InventoryItems').filter(x=>x.InventoryType===inv.Key);
    const itemIds=new Set(items.map(x=>Number(x.id)));
    const units=tr('InventoryUnits').filter(x=>x.InventoryType===inv.Key||itemIds.has(Number(x.Item)));
    const containers=tr('InventoryContainers').filter(x=>x.InventoryType===inv.Key);
    const positions=tr('InventoryPositions').filter(x=>x.InventoryType===inv.Key);

    if(units.length||containers.length||positions.length){
      return toast(`Suppression bloquée : inventaire relié à ${units.length} unité(s), ${containers.length} conteneur(s) et ${positions.length} position(s). Retire d’abord le stock physique.`);
    }

    const typed=prompt(`Suppression définitive de la liste « ${inv.Name||inv.Key} ».\nCette action supprimera ses fiches importées et ses champs personnalisés.\n\nTape exactement la clé suivante pour confirmer :\n${inv.Key}`);
    if(typed===null)return;
    if(String(typed).trim()!==String(inv.Key))return toast('Clé incorrecte : suppression annulée.');

    try{
      const actions=[];
      const add=(table,ids)=>{if(state.tables?.includes(table)){const a=bulkRemoveAction(table,ids);if(a)actions.push(a)}};

      add('InventoryAttributes',tr('InventoryAttributes').filter(x=>x.InventoryType===inv.Key||itemIds.has(Number(x.Item))).map(x=>x.id));
      add('InventoryDocuments',tr('InventoryDocuments').filter(x=>x.InventoryType===inv.Key||itemIds.has(Number(x.Item))).map(x=>x.id));
      add('InventoryNotes',tr('InventoryNotes').filter(x=>x.InventoryType===inv.Key||itemIds.has(Number(x.Item))).map(x=>x.id));
      add('EnrichmentQueue',tr('EnrichmentQueue').filter(x=>x.InventoryType===inv.Key||(x.TargetTable==='InventoryItems'&&itemIds.has(Number(x.TargetId)))).map(x=>x.id));
      add('LabReviews',tr('LabReviews').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('LabUsage',tr('LabUsage').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('LabUnitMeta',tr('LabUnitMeta').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('LabOrders',tr('LabOrders').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('LabInventoryChecks',tr('LabInventoryChecks').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('InventoryItems',items.map(x=>x.id));
      add('FieldDefinitions',tr('FieldDefinitions').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));
      add('ImportProfiles',tr('ImportProfiles').filter(x=>x.InventoryType===inv.Key).map(x=>x.id));

      if(actions.length)await grist.docApi.applyUserActions(actions);
      if(state.tables?.includes('InventoryHistory')){
        await grist.docApi.applyUserActions([['AddRecord','InventoryHistory',null,{
          Date:Date.now()/1000,InventoryType:inv.Key,Action:'Inventaire supprimé',
          EntityType:'Inventory',EntityCode:inv.Key,Details:`Suppression administrative de ${inv.Name||inv.Key}`,User:'Grist'
        }]]);
      }
      await grist.docApi.applyUserActions([['RemoveRecord','InventoryTypes',Number(inv.id)]]);
      await refreshAfterMaintenance();
      toast('Inventaire personnalisé supprimé.');
    }catch(err){console.error(err);toast(`Suppression impossible : ${err.message||err}`)}
  }

  function renderExistingImportsCard(){
    const groups=rowsForImportGroups();
    return `<div class="card card-pad" id="v11756ExistingImports" style="margin-top:16px">
      <div class="row space-between"><div><h3 class="section-title">Imports Excel existants</h3>
      <p class="subtitle">Permet de nettoyer un import de démonstration ou un import erroné. La suppression est bloquée si du stock physique est déjà relié.</p></div>
      <span class="pill neutral">${groups.length} import(s)</span></div>
      ${groups.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Inventaire</th><th>Source</th><th>Lignes créées</th><th>Attributs</th><th>Stock lié</th><th></th></tr></thead><tbody>
        ${groups.map(g=>`<tr><td>${escHtml(g.typeName)}</td><td>${escHtml(g.label)}</td><td>${g.itemIds.size}</td><td>${g.attributeIds.size}</td><td>${g.unitCount}</td>
        <td><button class="btn btn-sm ${g.unitCount?'':'btn-danger'}" data-v11756-delete-import="${escHtml(g.key)}" ${g.unitCount?'disabled title="Stock physique relié"':''}>Supprimer l’import</button></td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty">Aucun import Excel supprimable détecté.</div>'}
    </div>`;
  }

  function decorateInventoriesAdmin(){
    const body=q('#v112AdminBody');if(!body)return;
    if(!q('#v11756InventoryNotice')){
      const info=document.createElement('div');
      info.id='v11756InventoryNotice';
      info.className='banner';
      info.style.marginBottom='12px';
      info.innerHTML='<b>Suppression sécurisée :</b> les inventaires système sont protégés. Une liste personnalisée peut être supprimée uniquement si aucun vial, conteneur ou emplacement physique ne lui est relié.';
      body.prepend(info);
    }
    body.querySelectorAll('[data-v112-edit="InventoryTypes"]').forEach(edit=>{
      const id=Number(edit.dataset.id);
      if(edit.parentElement?.querySelector(`[data-v11756-delete-inventory="${id}"]`))return;
      const inv=tr('InventoryTypes').find(x=>Number(x.id)===id);
      if(!inv)return;
      const b=document.createElement('button');
      b.type='button';
      b.className='btn btn-sm';
      b.dataset.v11756DeleteInventory=String(id);
      if(isSystemInventory(inv.Key)){
        b.textContent='Protégé';
        b.disabled=true;
        b.title='Inventaire système BioDynaMit';
      }else{
        b.textContent='Supprimer';
        b.classList.add('btn-danger');
        b.onclick=()=>deleteCustomInventory(id);
      }
      edit.insertAdjacentElement('afterend',b);
    });
  }

  function decorateImportsAdmin(){
    const body=q('#v112AdminBody');
    if(!body)return;

    // Les lignes de configuration ImportProfiles ont maintenant une suppression
    // distincte de la suppression des données réellement importées.
    body.querySelectorAll('[data-v112-edit="ImportProfiles"]').forEach(edit=>{
      const id=Number(edit.dataset.id);
      if(edit.parentElement?.querySelector(`[data-v11756-delete-profile="${id}"]`))return;
      const profile=tr('ImportProfiles').find(x=>Number(x.id)===id);
      if(!profile)return;
      const b=document.createElement('button');
      b.type='button';
      b.className='btn btn-sm';
      b.dataset.v11756DeleteProfile=String(id);
      if(SYSTEM_IMPORT_PROFILES.has(String(profile.Key||''))){
        b.textContent='Protégé';
        b.disabled=true;
        b.title='Profil d’import système BioDynaMit';
      }else{
        b.textContent='Supprimer';
        b.classList.add('btn-danger');
        b.onclick=()=>deleteImportProfile(id);
      }
      edit.insertAdjacentElement('afterend',b);
    });

    const oldInput=q('#v112GenericExcel');
    const oldCard=oldInput?.closest('.card');
    if(oldCard)oldCard.remove();

    if(!q('#v11756ExcelImport')){
      const block=document.createElement('div');
      block.id='v11756ExcelImport';
      block.className='card card-pad';
      block.style.marginTop='16px';
      block.innerHTML=`<div class="row space-between"><div>
        <h3 class="section-title">Importer un fichier Excel</h3>
        <p class="subtitle">Les colonnes de la liste personnalisée sont générées à partir des colonnes réellement présentes dans le fichier Excel.</p>
        </div><label class="btn btn-primary" style="cursor:pointer">Choisir un .xlsx
        <input id="v11756ExcelFile" type="file" accept=".xlsx,.xls" hidden></label></div>
        <div class="banner" style="margin-top:10px"><b>Conseil :</b> pour créer une nouvelle liste, crée d’abord un inventaire personnalisé dans Administration → Inventaires. Aucun inventaire n’est présélectionné afin d’éviter d’écraser l’affichage d’une liste existante.</div>
        <div id="v11755ImportWorkspace" style="margin-top:12px"></div>`;
      body.appendChild(block);
      renderWorkspace();
      q('#v11756ExcelFile').onchange=ev=>chooseFile(ev.target.files?.[0]).catch(err=>{console.error(err);toast(`Erreur Excel : ${err.message||err}`)});
    }

    const parasitic=tr('FieldDefinitions').filter(x=>x.InventoryType==='secondary_antibody'&&x.Section==='Import Excel'&&(x.Active!==false||x.Visible!==false));
    if(parasitic.length&&!q('#v11756SecondaryRepair')){
      const repair=document.createElement('div');
      repair.id='v11756SecondaryRepair';
      repair.className='banner warn';
      repair.style.marginTop='12px';
      repair.innerHTML=`<b>Configuration Excel détectée sur les anticorps secondaires (${parasitic.length} colonne(s)).</b> La v11.7.5.8 ignore déjà ces colonnes pour restaurer la liste validée. <button class="btn btn-sm" id="v11756RepairSecondary">Nettoyer cette configuration</button>`;
      body.appendChild(repair);
      q('#v11756RepairSecondary').onclick=repairSecondaryExcelDisplay;
    }

    if(!q('#v11756ExistingImports')){
      const wrap=document.createElement('div');
      wrap.innerHTML=renderExistingImportsCard();
      body.appendChild(wrap.firstElementChild);
      body.querySelectorAll('[data-v11756-delete-import]').forEach(b=>b.onclick=()=>deleteImportGroup(b.dataset.v11756DeleteImport));
    }
  }

  function installAdmin(){
    if(typeof admin!=='function')return;
    const previous=admin;
    admin=function(){
      previous();
      if(ns.adminTab==='imports')decorateImportsAdmin();
      if(ns.adminTab==='inventories')decorateInventoriesAdmin();
    };
  }

  installAdmin();
  installListObserver();

  window.BioDynaMitExcelImportV11758={
    version:VERSION,state:X,rebuild,applyImport,patchImportedList,
    deleteImportGroup,deleteImportProfile,deleteCustomInventory,repairSecondaryExcelDisplay,
    _test:{coreForHeader,safeKey,uniqueColumns,bestHeaderRow,fieldDefinitionsForImport,isProtectedListType,isSystemInventory,rowsForImportGroups,importManualDependencies,looksLikeDateColumn,excelSerialToFrenchDate,normalizeDateDisplay,columnStats,valueFor}
  };
})();
