/* BioDynaMit v11.7.5.5 — Import Excel fidèle aux colonnes source.
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

  const VERSION='11.7.5.5';
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  const core=window.BioDynaMitCoreV112;
  const X=ns.excelImportV11755=ns.excelImportV11755||{
    workbook:null,fileName:'',sheetName:'',rows:[],headerRow:1,type:'',columns:[],plan:[]
  };
  if(!core)return;

  const escHtml=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>core.normalizeText(String(v??''));
  const tr=name=>{try{return rows(state.data[name]||ns.data?.[name])||[]}catch(_){return[]}};
  const q=s=>document.querySelector(s);

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
    return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  }

  function rebuild(){
    X.rows=sheetRows();
    const headers=X.rows[Math.max(0,Number(X.headerRow||1)-1)]||[];
    X.columns=uniqueColumns(headers);
    buildPlan();
  }

  function valueFor(row,col){
    const raw=row?.[col.index];
    if(col.dataType==='number'){
      const s=String(raw??'').trim();
      if(!s)return null;
      const n=Number(s.replace(',','.'));
      return Number.isFinite(n)?n:String(raw??'');
    }
    return raw??'';
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
    const types=genericTypes();
    X.type=types[0]?.Key||'secondary_antibody';
    rebuild();
    renderWorkspace();
  }

  function typeOptions(){
    const types=genericTypes();
    return types.map(t=>`<option value="${escHtml(t.Key)}" ${t.Key===X.type?'selected':''}>${escHtml(t.Name||t.Key)}</option>`).join('');
  }

  function columnsPreview(){
    if(!X.columns.length)return'<div class="empty">Aucune colonne détectée.</div>';
    const exampleRow=X.rows[Math.max(0,X.headerRow)]||[];
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Colonne Excel</th><th>Exemple</th><th>Import BioDynaMit</th></tr></thead>
      <tbody>${X.columns.map((c,i)=>`<tr>
        <td>${i+1}</td>
        <td><b>${escHtml(c.label)}</b></td>
        <td>${escHtml(exampleRow[c.index]??'')}</td>
        <td>${c.storageMode==='column'
          ?`<span class="pill ok">Champ standard</span> ${escHtml(c.standardLabel)}`
          :`<span class="pill neutral">Colonne personnalisée</span> ${escHtml(c.label)}`}</td>
      </tr>`).join('')}</tbody></table></div>`;
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
            Source:source
          }]);
        }
      }else{
        actions.push(['AddRecord','InventoryAttributes',null,{
          Item:Number(itemId),InventoryType:X.type,FieldKey:key,
          ValueNumber:typeof val==='number'?val:null,
          ValueText:typeof val==='number'?'':String(val),
          Source:source
        }]);
      }
    }
    if(actions.length)await grist.docApi.applyUserActions(actions);
  }

  async function applyImport(){
    if(!state.connected)return toast('Connexion Grist requise.');
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
        Details:`${X.fileName} / ${X.sheetName} : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés ; ${X.columns.length} colonnes reprises depuis Excel`,
        User:'Grist'
      }]]);

      if(typeof loadAll==='function')await loadAll();
      toast(`Import terminé : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés. ${X.columns.length} colonnes reprises depuis Excel.`);
      X.plan=[];
      renderWorkspace();
    }catch(err){
      console.error('BioDynaMit Excel import v11.7.5.5',err);
      toast(`Import interrompu : ${err.message||err}`);
    }
  }

  function importedDefs(type){
    return (ns.fieldsFor?.(type)||[])
      .filter(f=>f.Active!==false&&f.Visible!==false&&f.Section==='Import Excel')
      .sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  }

  function displayValue(item,field){
    if(field.StorageMode==='column'){
      const raw=item.raw||{};
      const val=raw[field.ColumnName];
      return val===null||val===undefined||val===''?'—':val;
    }
    const val=item.attributes?.[field.FieldKey];
    return val===null||val===undefined||val===''?'—':val;
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

  function installAdmin(){
    if(typeof admin!=='function')return;
    const previous=admin;
    admin=function(){
      previous();
      if(ns.adminTab!=='imports')return;
      const body=q('#v112AdminBody');
      if(!body)return;

      const oldInput=q('#v112GenericExcel');
      const oldCard=oldInput?.closest('.card');
      if(oldCard)oldCard.remove();
      if(q('#v11755ExcelImport'))return;

      const block=document.createElement('div');
      block.id='v11755ExcelImport';
      block.className='card card-pad';
      block.style.marginTop='16px';
      block.innerHTML=`<div class="row space-between"><div>
        <h3 class="section-title">Importer un fichier Excel</h3>
        <p class="subtitle">Les colonnes de la liste BioDynaMit sont générées à partir des colonnes réellement présentes dans le fichier Excel.</p>
        </div><label class="btn btn-primary" style="cursor:pointer">Choisir un .xlsx
        <input id="v11755ExcelFile" type="file" accept=".xlsx,.xls" hidden></label></div>
        <div class="banner" style="margin-top:10px"><b>Principe :</b> aucune colonne Excel n’est perdue. Les champs reconnus (nom, fournisseur, référence, etc.) alimentent les champs standards BioDynaMit ; toutes les autres colonnes deviennent automatiquement des champs personnalisés visibles dans la liste.</div>
        <div id="v11755ImportWorkspace" style="margin-top:12px"></div>`;
      body.appendChild(block);
      renderWorkspace();
      q('#v11755ExcelFile').onchange=ev=>chooseFile(ev.target.files?.[0]).catch(err=>{console.error(err);toast(`Erreur Excel : ${err.message||err}`)});
    };
  }

  installAdmin();
  installListObserver();

  window.BioDynaMitExcelImportV11755={
    version:VERSION,state:X,rebuild,applyImport,patchImportedList,
    _test:{coreForHeader,safeKey,uniqueColumns,bestHeaderRow,fieldDefinitionsForImport}
  };
})();
