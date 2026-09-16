/* BioDynaMit v11.2 — general flat-table Excel import assistant.
   Uses SheetJS in the browser. Storage-grid imports can be handled by configured/specialized StorageProfile adapters.
*/
(function(){
  'use strict';
  const core=window.BioDynaMitCoreV112,ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  if(!core||!ns)return;

  const IMP=ns.importAssistant=ns.importAssistant||{workbook:null,fileName:'',sheetName:'',rows:[],headerRow:1,type:'',mapping:{},plan:[]};
  function e(v){return esc(v);}
  function tr(name){return rows(state.data[name]||ns.data?.[name]);}

  const CORE_FIELDS=[
    {key:'Code',label:'Code',column:'Code',type:'text'},
    {key:'Name',label:'Nom',column:'Name',type:'text'},
    {key:'Supplier',label:'Fournisseur',column:'Supplier',type:'text'},
    {key:'CatalogNumber',label:'Référence catalogue',column:'CatalogNumber',type:'text'},
    {key:'Target',label:'Cible',column:'Target',type:'text'},
    {key:'TargetSpecies',label:'Espèce cible',column:'TargetSpecies',type:'text'},
    {key:'HostSpecies',label:'Espèce hôte',column:'HostSpecies',type:'text'},
    {key:'Fluorophore',label:'Fluorophore',column:'Fluorophore',type:'text'},
    {key:'Excitation_nm',label:'Excitation (nm)',column:'Excitation_nm',type:'number'},
    {key:'Emission_nm',label:'Émission (nm)',column:'Emission_nm',type:'number'},
    {key:'StorageTemperature',label:'Température',column:'StorageTemperature',type:'text'},
    {key:'Class',label:'Classe',column:'Class',type:'text'},
    {key:'Website',label:'Site / datasheet',column:'Website',type:'text'},
    {key:'Comments',label:'Commentaires',column:'Comments',type:'text'}
  ];
  const HEADER_ALIASES={
    name:['name','nom','antibody','antigen antibody','antigen-antibody','cell line','line','lignée','lignee'],
    supplier:['supplier','company','fournisseur'],
    catalognumber:['catalog number','catalog','reference','ref','référence','reference catalogue'],
    target:['target','cible'],
    targetspecies:['target species','espece cible','espèce cible'],
    hostspecies:['host species','host','espece hote','espèce hôte'],
    fluorophore:['fluorophore','fluor'],
    excitation_nm:['excitation','ex','excitation nm'],
    emission_nm:['emission','em','emission nm'],
    storagetemperature:['storage','temperature','température','storage temperature'],
    class:['class','classe'],
    website:['website','url','link','lien','supplier website'],
    comments:['comments','commentaires','notes','infos','information']
  };

  function genericTypes(){return (ns.inventoryTypes?.()||[]).filter(x=>x.Mode==='generic');}
  function targetFields(type){
    const fields=[...CORE_FIELDS];
    for(const f of ns.fieldsFor?.(type)||[]){
      if(f.StorageMode==='column'&&fields.some(x=>x.column===f.ColumnName))continue;
      fields.push({key:f.FieldKey,label:f.Label,column:f.StorageMode==='column'?f.ColumnName:'',attribute:f.StorageMode!=='column',type:f.DataType||'text'});
    }
    return fields;
  }
  function normHeader(v){return core.normalizeText(v);}
  function autoTarget(header,type){
    const n=normHeader(header),fields=targetFields(type);
    for(const f of fields){
      if(n===normHeader(f.label)||n===normHeader(f.key)||n===normHeader(f.column))return f.key;
    }
    for(const [key,aliases] of Object.entries(HEADER_ALIASES)){
      if(aliases.some(a=>n===normHeader(a)))return fields.find(f=>normHeader(f.key)===normHeader(key)||normHeader(f.column)===normHeader(key))?.key||'';
    }
    return '';
  }

  function bestHeaderRow(rows){
    let best={idx:0,score:-1};
    rows.slice(0,15).forEach((r,i)=>{
      const non=r.filter(v=>String(v??'').trim()!=='').length;
      const text=r.filter(v=>typeof v==='string'&&String(v).trim().length>1).length;
      const score=non+text*.5;
      if(score>best.score)best={idx:i,score};
    });
    return best.idx+1;
  }

  function sheetRows(){
    if(!IMP.workbook||!IMP.sheetName||!window.XLSX)return [];
    const ws=IMP.workbook.Sheets[IMP.sheetName];
    return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  }

  function rebuildMapping(){
    const data=sheetRows();IMP.rows=data;if(!data.length)return;
    const idx=Math.max(0,Number(IMP.headerRow||1)-1),headers=data[idx]||[];
    const next={};
    headers.forEach((h,i)=>{next[i]=IMP.mapping[i]||autoTarget(h,IMP.type);});
    IMP.mapping=next;
    buildPlan();
  }

  function mappedRows(){
    const data=IMP.rows,idx=Math.max(0,Number(IMP.headerRow||1)-1),headers=data[idx]||[],fields=targetFields(IMP.type);
    const fmap=new Map(fields.map(f=>[f.key,f]));
    const result=[];
    for(let r=idx+1;r<data.length;r++){
      const row=data[r];if(!row||!row.some(v=>String(v??'').trim()!==''))continue;
      const coreRec={InventoryType:IMP.type,Active:true,Status:'Actif'},attrs={};
      for(let c=0;c<headers.length;c++){
        const target=IMP.mapping[c];if(!target)continue;
        const f=fmap.get(target);if(!f)continue;
        let val=row[c];
        if(f.type==='number'){const n=Number(String(val).replace(',','.'));val=Number.isFinite(n)?n:null;}
        if(f.attribute)attrs[f.key]=val;
        else if(f.column)coreRec[f.column]=val;
      }
      result.push({sourceRow:r+1,core:coreRec,attributes:attrs});
    }
    return result;
  }

  function threshold(){
    const f=tr('FeatureFlags').find(x=>x.Key==='duplicate_detection');return Math.max(0,Number(f?.Value||50));
  }

  function buildPlan(){
    if(!IMP.type){IMP.plan=[];return;}
    const existing=tr('InventoryItems').filter(x=>x.InventoryType===IMP.type);
    let seq=1;
    IMP.plan=mappedRows().map(x=>{
      if(!x.core.Code)x.core.Code=`${IMP.type.toUpperCase().replace(/[^A-Z0-9]+/g,'-')}-${Date.now().toString(36).toUpperCase()}-${String(seq++).padStart(3,'0')}`;
      const dups=core.findDuplicateCandidates(x.core,existing,threshold());
      const best=dups[0]||null;
      const action=best&&best.score>=80?'merge':'add';
      return {...x,duplicates:dups.slice(0,3),best,action};
    });
  }

  async function fileChosen(file){
    if(!file)return;
    if(!window.XLSX)return toast('La librairie XLSX n’a pas pu être chargée.');
    const buf=await file.arrayBuffer();IMP.workbook=XLSX.read(buf,{type:'array'});IMP.fileName=file.name;IMP.sheetName=IMP.workbook.SheetNames[0]||'';
    IMP.rows=sheetRows();IMP.headerRow=bestHeaderRow(IMP.rows);IMP.type=genericTypes().find(x=>x.Enabled!==false)?.Key||genericTypes()[0]?.Key||'secondary_antibody';IMP.mapping={};rebuildMapping();renderImportWorkspace();
  }

  function mappingOptions(selected,type){
    return `<option value="">— Ignorer —</option>${targetFields(type).map(f=>`<option value="${e(f.key)}" ${f.key===selected?'selected':''}>${e(f.label)}${f.attribute?' (attribut)':''}</option>`).join('')}`;
  }

  function renderImportWorkspace(){
    const host=$('#v112ImportWorkspace');if(!host)return;
    if(!IMP.workbook){host.innerHTML='<div class="empty">Choisis un fichier .xlsx pour démarrer un import générique.</div>';return;}
    const headers=IMP.rows[Math.max(0,IMP.headerRow-1)]||[];
    host.innerHTML=`<div class="card card-pad">
      <div class="form-grid">
        <div class="field"><label>Fichier</label><input value="${e(IMP.fileName)}" disabled></div>
        <div class="field"><label>Feuille</label><select id="v112ImpSheet">${IMP.workbook.SheetNames.map(s=>`<option ${s===IMP.sheetName?'selected':''}>${e(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Type d’inventaire</label><select id="v112ImpType">${genericTypes().map(t=>`<option value="${e(t.Key)}" ${t.Key===IMP.type?'selected':''}>${e(t.Name)}</option>`).join('')}</select></div>
        <div class="field"><label>Ligne d’entête</label><input id="v112ImpHeader" type="number" min="1" value="${IMP.headerRow}"></div>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:12px"><h4>Mapping des colonnes</h4><table class="table"><thead><tr><th>Colonne source</th><th>Exemple</th><th>Champ BDD</th></tr></thead><tbody>
      ${headers.map((h,i)=>`<tr><td>${e(h||`Colonne ${i+1}`)}</td><td>${e(IMP.rows[IMP.headerRow]?.[i]??'')}</td><td><select data-v112-map="${i}">${mappingOptions(IMP.mapping[i]||'',IMP.type)}</select></td></tr>`).join('')}
    </tbody></table></div>
    <div class="card card-pad" style="margin-top:12px"><div class="row space-between"><div><h4>Plan d’import</h4><p class="subtitle">Les doublons forts sont proposés en fusion ; aucune valeur existante non vide ne sera écrasée.</p></div><span class="pill neutral">${IMP.plan.length} ligne(s)</span></div>
      ${planTable()}
      <label class="v112-check" style="margin-top:12px"><input type="checkbox" id="v112ImpConfirm"><span>Je confirme l’application de ce plan dans InventoryItems / InventoryAttributes.</span></label>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" id="v112ImpApply">Appliquer l’import</button></div>
    </div>`;

    $('#v112ImpSheet').onchange=e=>{IMP.sheetName=e.target.value;IMP.rows=sheetRows();IMP.headerRow=bestHeaderRow(IMP.rows);IMP.mapping={};rebuildMapping();renderImportWorkspace();};
    $('#v112ImpType').onchange=e=>{IMP.type=e.target.value;IMP.mapping={};rebuildMapping();renderImportWorkspace();};
    $('#v112ImpHeader').onchange=e=>{IMP.headerRow=Math.max(1,Number(e.target.value||1));IMP.mapping={};rebuildMapping();renderImportWorkspace();};
    document.querySelectorAll('[data-v112-map]').forEach(s=>s.onchange=e=>{IMP.mapping[Number(s.dataset.v112Map)]=e.target.value;buildPlan();renderImportWorkspace();});
    document.querySelectorAll('[data-v112-plan]').forEach(s=>s.onchange=()=>{IMP.plan[Number(s.dataset.v112Plan)].action=s.value;});
    $('#v112ImpApply').onclick=()=>{if(!$('#v112ImpConfirm').checked)return toast('Confirme le plan.');applyPlan();};
  }

  function planTable(){
    if(!IMP.plan.length)return '<div class="empty">Aucune ligne de données détectée.</div>';
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Ligne</th><th>Nom / code</th><th>Référence</th><th>Doublon</th><th>Action</th></tr></thead><tbody>${IMP.plan.slice(0,200).map((p,i)=>`<tr>
      <td>${p.sourceRow}</td><td>${e(p.core.Name||p.core.Code||'—')}</td><td>${e(p.core.CatalogNumber||'—')}</td>
      <td>${p.best?`${p.best.score}% · ${e(p.best.record.Name||p.best.record.Code)}`:'—'}</td>
      <td><select data-v112-plan="${i}"><option value="add" ${p.action==='add'?'selected':''}>Ajouter</option><option value="merge" ${p.action==='merge'?'selected':''} ${p.best?'':'disabled'}>Fusionner</option><option value="ignore" ${p.action==='ignore'?'selected':''}>Ignorer</option></select></td>
    </tr>`).join('')}</tbody></table></div>${IMP.plan.length>200?`<p class="subtitle">Aperçu limité à 200 lignes sur ${IMP.plan.length}.</p>`:''}`;
  }

  async function addAttributes(itemId,type,attrs,source){
    const records=Object.entries(attrs||{}).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=='').map(([k,v])=>({
      Item:Number(itemId),InventoryType:type,FieldKey:k,
      ValueNumber:typeof v==='number'?v:null,ValueText:typeof v==='number'?'':String(v),Source:source
    }));
    if(!records.length)return;
    const cols=Object.keys(records[0]),vals=Object.fromEntries(cols.map(c=>[c,records.map(r=>r[c]??null)]));
    await grist.docApi.applyUserActions([['BulkAddRecord','InventoryAttributes',Array(records.length).fill(null),vals]]);
  }

  async function applyPlan(){
    if(!state.connected)return toast('Connexion Grist requise.');
    if(!state.tables.includes('InventoryItems'))return toast('Initialise d’abord v11.2.');
    let added=0,merged=0,ignored=0;
    try{
      for(const p of IMP.plan){
        if(p.action==='ignore'){ignored++;continue;}
        if(p.action==='merge'&&p.best){
          const old=p.best.record,updates={};
          for(const [k,v] of Object.entries(p.core)){
            if(['InventoryType','Active','Status','Code'].includes(k))continue;
            if((old[k]===null||old[k]===undefined||String(old[k]).trim()==='') && v!==null&&v!==undefined&&String(v).trim()!=='')updates[k]=v;
          }
          if(Object.keys(updates).length)await grist.docApi.applyUserActions([['UpdateRecord','InventoryItems',Number(old.id),updates]]);
          await addAttributes(old.id,IMP.type,p.attributes,`${IMP.fileName} / ${IMP.sheetName} / row ${p.sourceRow}`);merged++;
        }else{
          const rec={...p.core,RawTable:`${IMP.fileName}:${IMP.sheetName}`,RawRowId:p.sourceRow};
          await grist.docApi.applyUserActions([['AddRecord','InventoryItems',null,rec]]);
          const fresh=await grist.docApi.fetchTable('InventoryItems');state.data.InventoryItems=fresh;ns.data.InventoryItems=fresh;
          const created=rows(fresh).find(x=>x.Code===rec.Code);
          if(created)await addAttributes(created.id,IMP.type,p.attributes,`${IMP.fileName} / ${IMP.sheetName} / row ${p.sourceRow}`);
          added++;
        }
      }
      await grist.docApi.applyUserActions([['AddRecord','InventoryHistory',null,{Date:Date.now()/1000,InventoryType:IMP.type,Action:'Import Excel générique',EntityType:'Inventory',EntityCode:IMP.type,Details:`${IMP.fileName} / ${IMP.sheetName} : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés`,User:'Grist'}]]);
      await loadAll();toast(`Import terminé : ${added} ajoutés, ${merged} fusionnés, ${ignored} ignorés.`);IMP.plan=[];renderImportWorkspace();
    }catch(err){console.error(err);toast(`Import interrompu : ${err.message||err}`);}
  }

  const baseAdmin=admin;
  admin=function(){
    baseAdmin();
    if(ns.adminTab!=='imports')return;
    const body=$('#v112AdminBody');if(!body)return;
    const block=document.createElement('div');block.className='card card-pad';block.style.marginTop='16px';
    block.innerHTML=`<div class="row space-between"><div><h3 class="section-title">Importer un nouveau fichier Excel</h3><p class="subtitle">Assistant générique pour feuilles tabulaires : détection de l’entête, mapping, doublons, Ajouter / Fusionner / Ignorer.</p></div>
      <label class="btn btn-primary" style="cursor:pointer">Choisir un .xlsx<input id="v112GenericExcel" type="file" accept=".xlsx,.xls" hidden></label></div>
      <div class="banner" style="margin-top:10px"><b>Limite actuelle :</b> les feuilles en grille de stockage nécessitent un StorageProfile. Le fichier des secondaires est déjà couvert par son manifeste/adapter dédié.</div>
      <div id="v112ImportWorkspace" style="margin-top:12px"></div>`;
    body.appendChild(block);renderImportWorkspace();
    $('#v112GenericExcel').onchange=e=>fileChosen(e.target.files?.[0]).catch(err=>{console.error(err);toast(`Erreur Excel : ${err.message||err}`);});
  };
})();