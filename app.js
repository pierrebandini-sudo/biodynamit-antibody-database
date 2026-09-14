import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';
const CANON = {
  Suppliers: [
    {id:'Name', type:'Text'}, {id:'Website', type:'Text'}, {id:'RawVariants', type:'Text'}
  ],
  Antibodies: [
    {id:'Code',type:'Text'}, {id:'Name',type:'Text'}, {id:'FullName',type:'Text'}, {id:'Supplier',type:'Text'},
    {id:'CatalogNumber',type:'Text'}, {id:'HostSpecies',type:'Text'}, {id:'Class',type:'Text'}, {id:'Target',type:'Text'},
    {id:'ApplicationsText',type:'Text'}, {id:'MolecularWeight',type:'Text'}, {id:'Website',type:'Text'}, {id:'DateAdded',type:'Date'},
    {id:'Comments',type:'Text'}, {id:'Active',type:'Bool'}, {id:'RawTable',type:'Text'}, {id:'RawRowId',type:'Int'}
  ],
  Boxes: [
    {id:'Code',type:'Text'}, {id:'Name',type:'Text'}, {id:'Temperature',type:'Text'}, {id:'Rack',type:'Text'},
    {id:'Rows',type:'Int'}, {id:'Columns',type:'Int'}, {id:'Notes',type:'Text'}
  ],
  Vials: [
    {id:'Code',type:'Text'}, {id:'Antibody',type:'Ref:Antibodies'}, {id:'FillStatus',type:'Text'}, {id:'EstimatedVolume_uL',type:'Numeric'},
    {id:'Status',type:'Text'}, {id:'DateReceived',type:'Date'}, {id:'Comments',type:'Text'}
  ],
  Positions: [
    {id:'Code',type:'Text'}, {id:'Box',type:'Ref:Boxes'}, {id:'Slot',type:'Text'}, {id:'Vial',type:'Ref:Vials'},
    {id:'Available',type:'Bool'}, {id:'Notes',type:'Text'}
  ],
  Applications: [
    {id:'Code',type:'Text'}, {id:'Name',type:'Text'}
  ],
  Dilutions: [
    {id:'Antibody',type:'Ref:Antibodies'}, {id:'Application',type:'Ref:Applications'}, {id:'SupplierDilution',type:'Text'},
    {id:'LabDilution',type:'Text'}, {id:'FinalVolume_uL',type:'Numeric'}
  ],
  Documents: [
    {id:'Antibody',type:'Ref:Antibodies'}, {id:'Title',type:'Text'}, {id:'Type',type:'Text'}, {id:'Link',type:'Text'}, {id:'Notes',type:'Text'}
  ],
  Notes: [
    {id:'Antibody',type:'Ref:Antibodies'}, {id:'Date',type:'DateTime'}, {id:'Author',type:'Text'}, {id:'Text',type:'Text'}, {id:'AttachmentLink',type:'Text'}
  ],
  History: [
    {id:'Date',type:'DateTime'}, {id:'Action',type:'Text'}, {id:'EntityType',type:'Text'}, {id:'EntityCode',type:'Text'}, {id:'Details',type:'Text'}, {id:'User',type:'Text'}
  ],
  AppSettings: [
    {id:'Key',type:'Text'}, {id:'Value',type:'Text'}
  ]
};

const state = {
  route:'dashboard', connected:false, tables:[], data:{}, selectedAntibody:null, selectedBox:null,
  selectedVial:null, three:null, search:'', isDemo:false
};

const navItems = [
  ['dashboard','⌂','Accueil'],['antibodies','Y','Anticorps'],['vials','▥','Vials'],['storage','❄','Stockage'],
  ['alerts','△','Alertes'],['documents','▣','Documents'],['journal','▤','Journal']
];

const $ = (s)=>document.querySelector(s);
const content = $('#content');

function esc(v){return String(v ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2600)}
function normalizeName(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function rows(table){
  if(!table) return [];
  if(Array.isArray(table)) return table;
  if(table.records && Array.isArray(table.records)) return table.records;
  const keys=Object.keys(table); if(!keys.length) return [];
  const n=Math.max(...keys.map(k=>Array.isArray(table[k])?table[k].length:0));
  return Array.from({length:n},(_,i)=>Object.fromEntries(keys.map(k=>[k,Array.isArray(table[k])?table[k][i]:undefined])));
}
function rowById(name,id){return rows(state.data[name]).find(r=>Number(r.id)===Number(id));}
function codeFrom(r,prefix){return r?.Code || `${prefix}-${String(r?.id||0).padStart(3,'0')}`}

function renderNav(){
  $('#nav').innerHTML=navItems.map(([r,ic,l])=>`<button class="nav-item ${state.route===r?'active':''}" data-route="${r}"><span>${ic}</span><span>${l}</span></button>`).join('');
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>go(b.dataset.route));
}
function topbar(title, actions=''){ $('#topbar').innerHTML=`<div><strong>${esc(title)}</strong></div><div class="row">${actions}</div>`; }
function go(route){state.route=route; renderNav(); render();}

async function connectGrist(){
  if(!window.grist){state.isDemo=true;state.connected=false;return false;}
  try{
    grist.ready({requiredAccess:'full', allowSelectBy:true});
    state.tables=await grist.docApi.listTables();
    state.connected=true;
    return true;
  }catch(e){console.warn(e);state.isDemo=true;state.connected=false;return false;}
}
async function loadAll(){
  if(!state.connected){seedDemoInMemory();return;}
  state.tables=await grist.docApi.listTables();
  const wanted=[...new Set([...Object.keys(CANON), ...state.tables.filter(t=>/antibod|20c|4c|storage/i.test(t))])];
  const results=await Promise.all(wanted.filter(t=>state.tables.includes(t)).map(async t=>[t,await grist.docApi.fetchTable(t)]));
  state.data=Object.fromEntries(results);
}
function schemaReady(){return ['Antibodies','Vials','Boxes','Positions'].every(t=>state.tables.includes(t));}

async function createSchema(){
  if(!state.connected) return toast('Le schéma ne peut être créé que dans Grist.');
  const current=new Set(await grist.docApi.listTables());
  // Create in dependency-safe order.
  const order=['Suppliers','Antibodies','Boxes','Applications','Vials','Positions','Dilutions','Documents','Notes','History','AppSettings'];
  for(const t of order){
    if(current.has(t)) continue;
    await grist.docApi.applyUserActions([['AddTable',t,CANON[t]]]);
    current.add(t);
  }
  toast('Structure BioDynaMit créée dans Grist.');
  await loadAll(); render();
}

function findField(row, aliases){
  const map=new Map(Object.keys(row).map(k=>[normalizeName(k),k]));
  for(const a of aliases){const key=map.get(normalizeName(a)); if(key) return row[key];}
  for(const [nk,k] of map){if(aliases.some(a=>nk.includes(normalizeName(a)))) return row[k];}
  return '';
}
async function migrateAntibodies(){
  if(!state.connected || !schemaReady()) return;
  const existing=rows(state.data.Antibodies); if(existing.length) return toast('La table Antibodies contient déjà des données. Migration annulée.');
  const rawName=state.tables.find(t=>normalizeName(t)==='list of all antibodies') || state.tables.find(t=>/all.*antibod|antibod.*list/i.test(t));
  if(!rawName) return toast('Table source « list of all antibodies » introuvable.');
  const raw=rows(await grist.docApi.fetchTable(rawName));
  const recs=[];
  raw.forEach((r,i)=>{
    const name=findField(r,['Antigen-antibody','Antigen antibody','Antibody','Name','Antigen']);
    const cat=findField(r,['Catalog number','Catalog','Reference','Ref']);
    const supplier=findField(r,['Company','Supplier','Fournisseur']);
    if(!name && !cat) return;
    recs.push({
      Code:`AB-${String(i+1).padStart(4,'0')}`, Name:String(name||''), FullName:String(name||''), Supplier:String(supplier||''),
      CatalogNumber:String(cat||''), HostSpecies:String(findField(r,['Host species','Host'])||''), Class:String(findField(r,['Class'])||''),
      Target:String(findField(r,['Target'])||''), ApplicationsText:String(findField(r,['Suitable for','Applications','Application'])||''),
      MolecularWeight:String(findField(r,['Molecular weight','MW'])||''), Website:String(findField(r,['Website','Supplier website'])||''),
      Comments:'', Active:true, RawTable:rawName, RawRowId:Number(r.id||i+1)
    });
  });
  if(!recs.length) return toast('Aucune ligne exploitable détectée dans la table source.');
  // Batch add.
  const cols=Object.keys(recs[0]);
  const vals=Object.fromEntries(cols.map(c=>[c,recs.map(r=>r[c])]));
  await grist.docApi.applyUserActions([['BulkAddRecord','Antibodies',Array(recs.length).fill(null),vals]]);
  await grist.docApi.applyUserActions([['AddRecord','History',null,{Date:Date.now()/1000,Action:'Migration',EntityType:'Antibodies',EntityCode:'',Details:`${recs.length} anticorps importés depuis ${rawName}`,User:'Grist'}]]);
  toast(`${recs.length} anticorps importés.`); await loadAll(); render();
}

async function seedTestData(){
  if(!state.connected || !schemaReady()) return;
  if(rows(state.data.Boxes).length) return toast('Des boîtes existent déjà. Données de test non ajoutées.');
  const ares=await grist.docApi.applyUserActions([['AddRecord','Antibodies',null,{Code:'AB-TEST-001',Name:'MFN2',FullName:'Mitofusin-2',Supplier:'Cell Signaling Technology',CatalogNumber:'D1E9',HostSpecies:'Rabbit',ApplicationsText:'IF, WB, IHC',Active:true}]]);
  await loadAll(); const ab=rows(state.data.Antibodies).find(r=>r.Code==='AB-TEST-001');
  await grist.docApi.applyUserActions([['AddRecord','Boxes',null,{Code:'BOX-001',Name:'Box 3',Temperature:'-20°C',Rack:'Rack 1',Rows:10,Columns:10,Notes:'Boîte de démonstration'}]]);
  await loadAll(); const box=rows(state.data.Boxes).find(r=>r.Code==='BOX-001');
  await grist.docApi.applyUserActions([['AddRecord','Vials',null,{Code:'V-TEST-001',Antibody:ab.id,FillStatus:'Plein',EstimatedVolume_uL:100,Status:'En stock',Comments:'Donnée de démonstration'}]]);
  await loadAll(); const vial=rows(state.data.Vials).find(r=>r.Code==='V-TEST-001');
  const slots=[]; for(let rr=0;rr<10;rr++)for(let cc=0;cc<10;cc++){const slot=`${String.fromCharCode(65+rr)}${cc+1}`;slots.push({Code:`BOX-001-${slot}`,Box:box.id,Slot:slot,Vial:slot==='C7'?vial.id:0,Available:slot!=='C7',Notes:''});}
  const cols=Object.keys(slots[0]); const vals=Object.fromEntries(cols.map(c=>[c,slots.map(r=>r[c])]));
  await grist.docApi.applyUserActions([['BulkAddRecord','Positions',Array(slots.length).fill(null),vals]]);
  toast('Données de test créées.'); await loadAll(); go('storage');
}

function seedDemoInMemory(){
  const abs=[{id:1,Code:'AB-001',Name:'MFN2',FullName:'Mitofusin-2',Supplier:'Cell Signaling Technology',CatalogNumber:'D1E9',HostSpecies:'Rabbit',ApplicationsText:'IF, WB, IHC, IP',Active:true},{id:2,Code:'AB-002',Name:'VDAC1',Supplier:'Abcam',CatalogNumber:'ab15895',HostSpecies:'Mouse',ApplicationsText:'IF, WB',Active:true}];
  const boxes=[{id:1,Code:'BOX-001',Name:'Box 3',Temperature:'-20°C',Rack:'Rack 1',Rows:10,Columns:10}];
  const vials=[{id:1,Code:'V-047',Antibody:1,FillStatus:'Plein',EstimatedVolume_uL:100,Status:'En stock'},{id:2,Code:'V-032',Antibody:1,FillStatus:'≈ 50 %',EstimatedVolume_uL:50,Status:'En stock'}];
  const positions=[];let id=1;for(let r=0;r<10;r++)for(let c=0;c<10;c++){const slot=`${String.fromCharCode(65+r)}${c+1}`;let v=0;if(slot==='C7')v=1;if(slot==='A2')v=2;positions.push({id:id++,Code:`BOX-001-${slot}`,Box:1,Slot:slot,Vial:v,Available:!v});}
  state.data={Antibodies:abs,Vials:vials,Boxes:boxes,Positions:positions,Documents:[],Notes:[],History:[]};
  state.tables=Object.keys(state.data);
}

function dashboard(){
  const A=rows(state.data.Antibodies), V=rows(state.data.Vials), P=rows(state.data.Positions);
  const low=V.filter(v=>/50|20|faible/i.test(v.FillStatus||'')||Number(v.EstimatedVolume_uL||999)<30).length;
  const unr=V.filter(v=>normalizeName(v.Status)==='a ranger').length;
  topbar('Accueil', state.connected?'<span class="pill ok">● Connecté à Grist</span>':'<span class="pill warn">Mode démo</span>');
  content.innerHTML=`<h1 class="page-title">Bienvenue !</h1><p class="subtitle">Recherchez un anticorps, une référence ou un fournisseur.</p>
  <div class="searchbar"><input id="globalSearch" placeholder="Ex. : MFN2, D1E9, Cell Signaling…"><button class="btn btn-primary" id="searchBtn">Rechercher</button></div>
  <div class="grid grid-4" style="margin-top:16px">
    ${metric('Y',A.length,'Anticorps')}${metric('▥',V.length,'Vials')}${metric('△',low,'Stock bas')}${metric('▣',unr,'À ranger')}
  </div>
  <div class="grid grid-2" style="margin-top:16px">
    <div class="card card-pad"><h3 class="section-title">⚠ Anticorps à surveiller</h3>${miniVialTable(V.filter(v=>Number(v.EstimatedVolume_uL||999)<30).slice(0,6))}</div>
    <div class="card card-pad"><h3 class="section-title">▣ Vials à ranger</h3>${miniVialTable(V.filter(v=>normalizeName(v.Status)==='a ranger').slice(0,6))}</div>
  </div>
  <div class="card card-pad" style="margin-top:16px"><h3 class="section-title">◷ Activité récente</h3>${historyTable(rows(state.data.History).slice(-8).reverse())}</div>`;
  $('#searchBtn').onclick=()=>{state.search=$('#globalSearch').value;go('antibodies')};
  $('#globalSearch').onkeydown=e=>{if(e.key==='Enter')$('#searchBtn').click()};
}
function metric(ic,n,l){return `<div class="card metric"><div class="icon">${ic}</div><div><b>${n}</b><span>${l}</span></div></div>`}
function miniVialTable(list){if(!list.length)return '<div class="empty">Aucun élément.</div>';return `<table class="table"><tbody>${list.map(v=>{const a=rowById('Antibodies',v.Antibody);return `<tr><td><b>${esc(a?.Name||'—')}</b></td><td>${esc(codeFrom(v,'V'))}</td><td>${statusPill(v.FillStatus||v.Status)}</td></tr>`}).join('')}</tbody></table>`}
function historyTable(list){if(!list.length)return '<div class="empty">Aucune activité enregistrée.</div>';return `<table class="table"><tbody>${list.map(h=>`<tr><td>${esc(h.Action||'Action')}</td><td>${esc(h.EntityCode||'')}</td><td>${esc(h.Details||'')}</td></tr>`).join('')}</tbody></table>`}
function statusPill(s){const n=normalizeName(s);const cl=/plein|stock ok|en stock/.test(n)?'ok':/vide|faible/.test(n)?'bad':/50|20|ranger/.test(n)?'warn':'neutral';return `<span class="pill ${cl}">${esc(s||'Inconnu')}</span>`}

function antibodies(){
  const q=normalizeName(state.search); const A=rows(state.data.Antibodies).filter(a=>!q||[a.Name,a.FullName,a.Supplier,a.CatalogNumber,a.Target].some(x=>normalizeName(x).includes(q)));
  topbar('Anticorps',`<button class="btn btn-primary" id="addAb">+ Ajouter un anticorps</button>`);
  content.innerHTML=`<div class="row space-between"><div><h1 class="page-title">Anticorps</h1><p class="subtitle">${A.length} résultat(s)</p></div></div>
  <div class="searchbar"><input id="abSearch" value="${esc(state.search)}" placeholder="Nom, référence, fournisseur…"><button class="btn" id="clearSearch">Effacer</button></div>
  <div class="card table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Nom</th><th>Fournisseur</th><th>Référence</th><th>Host</th><th>Applications</th><th>Stock</th></tr></thead><tbody>${A.map(a=>`<tr><td class="link" data-ab="${a.id}"><b>${esc(a.Name||a.FullName)}</b></td><td>${esc(a.Supplier)}</td><td>${esc(a.CatalogNumber)}</td><td>${esc(a.HostSpecies)}</td><td>${esc(a.ApplicationsText)}</td><td>${antibodyStockPill(a.id)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#abSearch').oninput=e=>{state.search=e.target.value;antibodies()}; $('#clearSearch').onclick=()=>{state.search='';antibodies()};
  document.querySelectorAll('[data-ab]').forEach(x=>x.onclick=()=>{state.selectedAntibody=Number(x.dataset.ab);go('antibody-detail')});
  $('#addAb').onclick=showAddAntibody;
}
function antibodyStockPill(id){const v=rows(state.data.Vials).filter(v=>Number(v.Antibody)===Number(id)&&normalizeName(v.Status)!=='archive');return v.length?`<span class="pill ok">${v.length} vial${v.length>1?'s':''}</span>`:'<span class="pill warn">0 vial</span>'}
function antibodyDetail(){
  const a=rowById('Antibodies',state.selectedAntibody)||rows(state.data.Antibodies)[0]; if(!a){go('antibodies');return}
  const vs=rows(state.data.Vials).filter(v=>Number(v.Antibody)===Number(a.id));
  topbar('Fiche anticorps',`<button class="btn" onclick="history.back()">← Retour</button>`);
  content.innerHTML=`<div class="row space-between"><div><h1 class="page-title">${esc(a.Name||a.FullName)} — ${esc(a.FullName||a.Name)}</h1><p class="subtitle">${esc(a.Supplier)} · Réf. : ${esc(a.CatalogNumber)}</p></div>${vs.length?'<span class="pill ok">● Stock OK</span>':'<span class="pill warn">Stock à vérifier</span>'}</div>
  <div class="tabs"><div class="tab active">Vue d'ensemble</div><div class="tab">Vials (${vs.length})</div><div class="tab">Documents</div><div class="tab">Notes</div><div class="tab">Historique</div></div>
  <div class="split"><div class="card card-pad"><h3 class="section-title">Informations générales</h3><dl class="detail-list"><dt>Nom</dt><dd>${esc(a.Name)}</dd><dt>Nom complet</dt><dd>${esc(a.FullName)}</dd><dt>Référence</dt><dd>${esc(a.CatalogNumber)}</dd><dt>Fournisseur</dt><dd>${esc(a.Supplier)}</dd><dt>Espèce hôte</dt><dd>${esc(a.HostSpecies)}</dd><dt>Classe</dt><dd>${esc(a.Class)}</dd><dt>Cible</dt><dd>${esc(a.Target)}</dd><dt>Applications</dt><dd>${esc(a.ApplicationsText)}</dd><dt>Commentaires</dt><dd>${esc(a.Comments)}</dd></dl></div>
  <div class="card card-pad"><h3 class="section-title">Stock</h3>${vs.length?vs.map(v=>vialCard(v)).join(''):'<div class="empty">Aucun vial associé.</div>'}</div></div>`;
  document.querySelectorAll('[data-openbox]').forEach(b=>b.onclick=()=>openBoxForVial(Number(b.dataset.openbox)));
}
function vialCard(v){const p=rows(state.data.Positions).find(p=>Number(p.Vial)===Number(v.id));const box=p?rowById('Boxes',p.Box):null;return `<div style="padding:12px 0;border-bottom:1px solid var(--line)"><b>${esc(codeFrom(v,'V'))}</b> ${statusPill(v.FillStatus)}<div style="margin-top:6px;color:var(--muted)">~ ${esc(v.EstimatedVolume_uL||'?')} µL<br>${box?`${esc(box.Temperature)} / ${esc(box.Rack)} / ${esc(box.Name)} / ${esc(p.Slot)}`:'À ranger'}</div>${p?`<button class="btn btn-sm" data-openbox="${v.id}" style="margin-top:8px">Voir dans la boîte</button>`:''}</div>`}

function vials(){
  const V=rows(state.data.Vials); topbar('Vials');
  content.innerHTML=`<h1 class="page-title">Vials</h1><p class="subtitle">Gestion des exemplaires physiques.</p><div class="card table-wrap"><table class="table"><thead><tr><th>Vial</th><th>Anticorps</th><th>État</th><th>Volume</th><th>Statut</th><th>Localisation</th></tr></thead><tbody>${V.map(v=>{const a=rowById('Antibodies',v.Antibody);const p=rows(state.data.Positions).find(p=>Number(p.Vial)===Number(v.id));const b=p?rowById('Boxes',p.Box):null;return `<tr><td>${esc(codeFrom(v,'V'))}</td><td>${esc(a?.Name||'—')}</td><td>${statusPill(v.FillStatus)}</td><td>${esc(v.EstimatedVolume_uL||'—')} µL</td><td>${statusPill(v.Status)}</td><td>${p?`${esc(b?.Temperature)} / ${esc(b?.Name)} / ${esc(p.Slot)}`:'—'}</td></tr>`}).join('')}</tbody></table></div>`;
}

function storage(){
  const B=rows(state.data.Boxes); topbar('Stockage',`<button class="btn btn-primary" id="addBox">+ Ajouter une boîte</button>`);
  content.innerHTML=`<h1 class="page-title">Stockage</h1><p class="subtitle">Température → rack → boîte → position.</p>
  ${B.length?groupBoxes(B):'<div class="card empty">Aucune boîte configurée.</div>'}`;
  document.querySelectorAll('[data-box]').forEach(x=>x.onclick=()=>{state.selectedBox=Number(x.dataset.box);go('box3d')});
  $('#addBox').onclick=showAddBox;
}
function groupBoxes(B){const temps=[...new Set(B.map(b=>b.Temperature||'Non renseigné'))];return temps.map(t=>`<div class="card card-pad storage-tree" style="margin-bottom:14px"><h3 class="section-title">❄ ${esc(t)}</h3>${[...new Set(B.filter(b=>(b.Temperature||'Non renseigné')===t).map(b=>b.Rack||'Sans rack'))].map(r=>`<div style="margin:12px 0"><b>${esc(r)}</b><div class="box-row" style="margin-top:8px">${B.filter(b=>(b.Temperature||'Non renseigné')===t&&(b.Rack||'Sans rack')===r).map(b=>{const pos=rows(state.data.Positions).filter(p=>Number(p.Box)===Number(b.id));const occ=pos.filter(p=>Number(p.Vial)>0).length;return `<div class="box-tile" data-box="${b.id}"><b>${esc(b.Name||b.Code)}</b><small>${occ} / ${Number(b.Rows||10)*Number(b.Columns||10)} positions</small></div>`}).join('')}</div></div>`).join('')}</div>`).join('')}

async function openBoxForVial(vialId){const p=rows(state.data.Positions).find(p=>Number(p.Vial)===Number(vialId));if(!p)return;state.selectedVial=vialId;state.selectedBox=Number(p.Box);go('box3d')}
function box3d(){
  const box=rowById('Boxes',state.selectedBox)||rows(state.data.Boxes)[0]; if(!box){go('storage');return}
  const ps=rows(state.data.Positions).filter(p=>Number(p.Box)===Number(box.id)); const occ=ps.filter(p=>Number(p.Vial)>0).length;
  topbar(`${box.Temperature||''} / ${box.Rack||''} / ${box.Name||box.Code}`,`<button class="btn" id="backStorage">← Stockage</button><button class="btn" id="gridToggle">Vue grille</button>`);
  content.innerHTML=`<div class="three-layout"><div class="three-stage"><canvas id="threeCanvas"></canvas><div class="three-overlay"><b>${esc(box.Name||box.Code)}</b><br><small>${occ} / ${Number(box.Rows||10)*Number(box.Columns||10)} positions occupées</small></div></div><aside class="card sidepanel" id="vialPanel"><div class="empty">Cliquez sur un vial.</div></aside></div>`;
  $('#backStorage').onclick=()=>go('storage'); $('#gridToggle').onclick=()=>renderGridModal(box,ps);
  init3D(box,ps);
}

function init3D(box,positions){
  const canvas=$('#threeCanvas'); const scene=new THREE.Scene(); scene.background=new THREE.Color(0xe9eef2);
  const camera=new THREE.PerspectiveCamera(42,canvas.clientWidth/canvas.clientHeight,.1,100); camera.position.set(9,10,12);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setSize(canvas.clientWidth,canvas.clientHeight,false); renderer.shadowMap.enabled=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x6a7780,2.4)); const dl=new THREE.DirectionalLight(0xffffff,2.2);dl.position.set(6,12,8);dl.castShadow=true;scene.add(dl);
  const rr=Number(box.Rows||10), cc=Number(box.Columns||10), spacing=.82, w=cc*spacing+1, d=rr*spacing+1;
  const base=new THREE.Mesh(new THREE.BoxGeometry(w,.45,d),new THREE.MeshStandardMaterial({color:0xb7b4ab,roughness:.9}));base.position.y=-.25;base.receiveShadow=true;scene.add(base);
  const wallMat=new THREE.MeshStandardMaterial({color:0xc6c2b7,roughness:.9});
  [[w,.8,.25,0,d/2],[w,.8,.25,0,-d/2],[.25,.8,d,w/2,0],[.25,.8,d,-w/2,0]].forEach(([x,y,z,px,pz])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),wallMat);m.position.set(px,.15,pz);m.castShadow=true;scene.add(m)});
  const vialMeshes=[];
  positions.forEach(p=>{if(!Number(p.Vial))return; const m=/^([A-Z])(\d+)$/.exec(String(p.Slot||''));if(!m)return;const r=m[1].charCodeAt(0)-65,c=Number(m[2])-1;if(r<0||r>=rr||c<0||c>=cc)return;
    const group=new THREE.Group(); const body=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.78,24),new THREE.MeshStandardMaterial({color:0xd7ecf2,roughness:.45,transparent:true,opacity:.93}));body.position.y=.52;body.castShadow=true; const cap=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.19,24),new THREE.MeshStandardMaterial({color:0xe5e5e1,roughness:.8}));cap.position.y=1;group.add(body,cap);group.position.set((c-(cc-1)/2)*spacing,0,(r-(rr-1)/2)*spacing);group.userData={position:p,vialId:Number(p.Vial),baseY:0};scene.add(group);vialMeshes.push(group);
  });
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.4,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.03;controls.minDistance=7;controls.maxDistance=22;
  const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect();mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects(vialMeshes,true);if(!hits.length)return;let g=hits[0].object.parent;while(g&&!g.userData?.vialId)g=g.parent;if(!g)return;vialMeshes.forEach(x=>x.position.y=x.userData.baseY);g.position.y=.5;state.selectedVial=g.userData.vialId;renderVialPanel(g.userData.position);});
  if(state.selectedVial){const g=vialMeshes.find(x=>x.userData.vialId===state.selectedVial);if(g){g.position.y=.5;renderVialPanel(g.userData.position)}}
  function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
  const ro=new ResizeObserver(()=>{const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)});ro.observe(canvas);
  state.three={scene,renderer,camera,controls,ro};
}
function renderVialPanel(pos){const v=rowById('Vials',pos.Vial),a=v?rowById('Antibodies',v.Antibody):null,b=rowById('Boxes',pos.Box);const free=rows(state.data.Positions).filter(p=>Number(p.Box)===Number(pos.Box)&&!Number(p.Vial));$('#vialPanel').innerHTML=`<h3 class="section-title">Vial sélectionné</h3><div class="vial-preview"></div><h2 style="text-align:center;margin:0">${esc(a?.Name||'Vial')}</h2><p style="text-align:center;color:var(--muted)">${esc(codeFrom(v,'V'))}</p><div style="text-align:center">${statusPill(v?.FillStatus)}</div><dl class="detail-list" style="grid-template-columns:100px 1fr;margin-top:16px"><dt>Référence</dt><dd>${esc(a?.CatalogNumber)}</dd><dt>Fournisseur</dt><dd>${esc(a?.Supplier)}</dd><dt>Volume</dt><dd>~ ${esc(v?.EstimatedVolume_uL||'?')} µL</dd><dt>Position</dt><dd>${esc(pos.Slot)}</dd><dt>Congélateur</dt><dd>${esc(b?.Temperature)}</dd><dt>Rack</dt><dd>${esc(b?.Rack)}</dd><dt>Boîte</dt><dd>${esc(b?.Name)}</dd></dl><button class="btn btn-primary" style="width:100%;margin-top:10px" id="viewAb">Voir la fiche anticorps</button><button class="btn" style="width:100%;margin-top:8px" id="moveVial">Déplacer ce vial</button><button class="btn btn-danger" style="width:100%;margin-top:8px" id="emptyVial">Marquer comme vide</button>`;
  $('#viewAb').onclick=()=>{state.selectedAntibody=Number(a?.id);go('antibody-detail')};$('#moveVial').onclick=()=>showMoveModal(pos,free);$('#emptyVial').onclick=()=>markEmpty(v,pos);
}
async function markEmpty(v,pos){if(!v)return;if(!confirm('Marquer ce vial comme « Vide / à retirer » ? La position restera occupée jusqu’au retrait physique.'))return;if(!state.connected){v.FillStatus='Vide';v.Status='Vide / à retirer';toast('Mode démo : vial marqué vide.');renderVialPanel(pos);return}await grist.docApi.applyUserActions([['UpdateRecord','Vials',v.id,{FillStatus:'Vide',Status:'Vide / à retirer'}],['AddRecord','History',null,{Date:Date.now()/1000,Action:'Vial vide',EntityType:'Vial',EntityCode:v.Code||'',Details:`${v.Code||''} marqué vide; position ${pos.Slot} conservée`,User:'Grist'}]]);await loadAll();toast('Vial marqué vide.');go('box3d')}
function showMoveModal(pos,free){modal(`<h2>Déplacer le vial</h2><p>Position actuelle : <b>${esc(pos.Slot)}</b></p><div class="field"><label>Nouvelle position libre</label><select id="targetSlot">${free.map(p=>`<option value="${p.id}">${esc(p.Slot)}</option>`).join('')}</select></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="cancelMove">Annuler</button><button class="btn btn-primary" id="confirmMove">Confirmer le déplacement</button></div>`);$('#cancelMove').onclick=closeModal;$('#confirmMove').onclick=()=>moveVial(pos,Number($('#targetSlot').value));}
async function moveVial(fromPos,toId){const to=rowById('Positions',toId);if(!to||Number(to.Vial))return toast('Destination indisponible.');const vialId=Number(fromPos.Vial);if(!state.connected){fromPos.Vial=0;fromPos.Available=true;to.Vial=vialId;to.Available=false;closeModal();toast(`Déplacé vers ${to.Slot} (démo).`);go('box3d');return}const v=rowById('Vials',vialId);await grist.docApi.applyUserActions([['UpdateRecord','Positions',fromPos.id,{Vial:0,Available:true}],['UpdateRecord','Positions',to.id,{Vial:vialId,Available:false}],['AddRecord','History',null,{Date:Date.now()/1000,Action:'Déplacement',EntityType:'Vial',EntityCode:v?.Code||'',Details:`${fromPos.Slot} → ${to.Slot}`,User:'Grist'}]]);closeModal();await loadAll();toast(`Vial déplacé vers ${to.Slot}.`);go('box3d')}
function renderGridModal(box,ps){const r=Number(box.Rows||10),c=Number(box.Columns||10);const map=new Map(ps.map(p=>[p.Slot,p]));let html=`<h2>${esc(box.Name)} — Vue grille</h2><div class="grid-box" style="grid-template-columns:repeat(${c},1fr)">`;for(let y=0;y<r;y++)for(let x=0;x<c;x++){const s=`${String.fromCharCode(65+y)}${x+1}`,p=map.get(s);html+=`<div class="slot ${p&&Number(p.Vial)?'occupied':''}" title="${s}">${s}</div>`}html+='</div><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="closeGrid">Fermer</button></div>';modal(html);$('#closeGrid').onclick=closeModal}

function alerts(){const V=rows(state.data.Vials).filter(v=>/vide|ranger|faible/i.test(normalizeName(v.Status)+' '+normalizeName(v.FillStatus))||Number(v.EstimatedVolume_uL||999)<30);topbar('Alertes');content.innerHTML=`<h1 class="page-title">Alertes</h1><p class="subtitle">Stocks faibles, vials à ranger et vials vides à retirer.</p><div class="card card-pad">${miniVialTable(V)}</div>`}
function documents(){topbar('Documents');content.innerHTML=`<h1 class="page-title">Documents</h1><p class="subtitle">Datasheets, protocoles internes, publications et captures.</p><div class="card empty">Le module documentaire utilisera la table <span class="kbd">Documents</span>. Il est prêt dans le schéma ; les pièces jointes pourront être branchées ensuite.</div>`}
function journal(){topbar('Journal');const N=rows(state.data.Notes);content.innerHTML=`<h1 class="page-title">Journal expérimental</h1><p class="subtitle">Notes datées et attribuées.</p><div class="card card-pad">${N.length?`<table class="table"><tbody>${N.map(n=>`<tr><td>${esc(n.Author)}</td><td>${esc(n.Text)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune note pour le moment.</div>'}</div>`}
function admin(){
  topbar('Administration'); const ready=schemaReady(); const raw=state.tables.filter(t=>!Object.keys(CANON).includes(t));
  content.innerHTML=`<h1 class="page-title">Administration</h1><p class="subtitle">Initialisation, migration et contrôle de la BDD.</p>
  ${!state.connected?'<div class="banner error">Cette page est en mode démonstration. Pour écrire dans Grist, ouvrez-la comme widget personnalisé dans votre document.</div>':''}
  <div class="card card-pad" style="margin-top:14px"><h3 class="section-title">Structure Grist</h3><p>${ready?'<span class="pill ok">Structure principale détectée</span>':'<span class="pill warn">Structure BioDynaMit non initialisée</span>'}</p><button class="btn btn-primary" id="initSchema">Initialiser / compléter la structure</button></div>
  <div class="card card-pad" style="margin-top:14px"><h3 class="section-title">Migration Excel → BDD</h3><p>Les tables Excel d’origine restent intactes. L’import crée des lignes propres dans <span class="kbd">Antibodies</span> tout en conservant la table et l’ID source.</p><button class="btn" id="migrateAb" ${ready?'':'disabled'}>Importer « list of all antibodies »</button><p style="color:var(--muted);font-size:12px">Tables sources détectées : ${raw.map(esc).join(', ')||'aucune'}</p></div>
  <div class="card card-pad" style="margin-top:14px"><h3 class="section-title">Test 3D</h3><p>Ajoute une boîte 10×10 et un vial MFN2 en C7 pour tester l’interaction et le déplacement persistant.</p><button class="btn" id="seedDemo" ${ready?'':'disabled'}>Créer les données de test</button></div>`;
  $('#initSchema').onclick=createSchema; $('#migrateAb').onclick=migrateAntibodies; $('#seedDemo').onclick=seedTestData;
}

function setupPage(){topbar('Mise en place');content.innerHTML=`<div class="setup"><h1 class="page-title">BioDynaMit — première ouverture</h1><p class="subtitle">Le widget est connecté à Grist. Il peut créer la structure propre sans toucher aux tables Excel importées.</p><div class="card card-pad"><div class="setup-step"><div class="n">1</div><div><b>Conserver les imports Excel</b><p>Ils restent inchangés et servent d’archive/source brute.</p></div></div><div class="setup-step"><div class="n">2</div><div><b>Créer la structure relationnelle</b><p>Antibodies, Vials, Boxes, Positions, Dilutions, Documents, Notes et History.</p></div></div><div class="setup-step"><div class="n">3</div><div><b>Migrer les données</b><p>Le premier import automatise la liste générale des anticorps.</p></div></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" id="setupNow">Créer la structure dans Grist</button></div></div></div>`;$('#setupNow').onclick=createSchema}

function showAddAntibody(){modal(`<h2>Ajouter un anticorps</h2><div class="form-grid"><div class="field"><label>Nom *</label><input id="fName"></div><div class="field"><label>Référence *</label><input id="fCat"></div><div class="field"><label>Fournisseur *</label><input id="fSup"></div><div class="field"><label>Host *</label><input id="fHost"></div><div class="field"><label>Applications</label><input id="fApps"></div><div class="field"><label>Cible</label><input id="fTarget"></div></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="cancelAb">Annuler</button><button class="btn btn-primary" id="saveAb">Ajouter</button></div>`);$('#cancelAb').onclick=closeModal;$('#saveAb').onclick=saveAntibody}
async function saveAntibody(){const name=$('#fName').value.trim(),cat=$('#fCat').value.trim(),sup=$('#fSup').value.trim(),host=$('#fHost').value.trim();if(!name||!cat||!sup||!host)return toast('Nom, référence, fournisseur et host sont obligatoires.');const rec={Code:`AB-${String(rows(state.data.Antibodies).length+1).padStart(4,'0')}`,Name:name,FullName:name,CatalogNumber:cat,Supplier:sup,HostSpecies:host,ApplicationsText:$('#fApps').value,Target:$('#fTarget').value,Active:true};if(!state.connected){rec.id=Math.max(0,...rows(state.data.Antibodies).map(x=>x.id))+1;state.data.Antibodies.push(rec);closeModal();toast('Anticorps ajouté (démo).');antibodies();return}await grist.docApi.applyUserActions([['AddRecord','Antibodies',null,rec]]);closeModal();await loadAll();toast('Anticorps ajouté.');antibodies()}
function showAddBox(){modal(`<h2>Ajouter une boîte</h2><div class="form-grid"><div class="field"><label>Nom *</label><input id="bName" placeholder="Box 1"></div><div class="field"><label>Température *</label><input id="bTemp" value="-20°C"></div><div class="field"><label>Rack</label><input id="bRack" placeholder="Rack 1"></div><div class="field"><label>Lignes</label><input id="bRows" type="number" value="10"></div><div class="field"><label>Colonnes</label><input id="bCols" type="number" value="10"></div></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="cancelBox">Annuler</button><button class="btn btn-primary" id="saveBox">Créer</button></div>`);$('#cancelBox').onclick=closeModal;$('#saveBox').onclick=saveBox}
async function saveBox(){const name=$('#bName').value.trim(),temp=$('#bTemp').value.trim(),rack=$('#bRack').value.trim(),r=Number($('#bRows').value||10),c=Number($('#bCols').value||10);if(!name||!temp)return toast('Nom et température obligatoires.');const code=`BOX-${String(rows(state.data.Boxes).length+1).padStart(3,'0')}`;if(!state.connected)return toast('Création de boîte disponible dans Grist.');await grist.docApi.applyUserActions([['AddRecord','Boxes',null,{Code:code,Name:name,Temperature:temp,Rack:rack,Rows:r,Columns:c,Notes:''}]]);await loadAll();const box=rows(state.data.Boxes).find(b=>b.Code===code);const slots=[];for(let y=0;y<r;y++)for(let x=0;x<c;x++){const s=`${String.fromCharCode(65+y)}${x+1}`;slots.push({Code:`${code}-${s}`,Box:box.id,Slot:s,Vial:0,Available:true,Notes:''})}const cols=Object.keys(slots[0]),vals=Object.fromEntries(cols.map(k=>[k,slots.map(v=>v[k])]));await grist.docApi.applyUserActions([['BulkAddRecord','Positions',Array(slots.length).fill(null),vals]]);closeModal();await loadAll();toast('Boîte créée avec ses positions.');storage()}
function modal(html){$('#modalCard').innerHTML=html;$('#modal').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden')}
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()}

function render(){renderNav();if(state.connected&&!schemaReady()&&state.route!=='admin'){setupPage();return}switch(state.route){case'dashboard':dashboard();break;case'antibodies':antibodies();break;case'antibody-detail':antibodyDetail();break;case'vials':vials();break;case'storage':storage();break;case'box3d':box3d();break;case'alerts':alerts();break;case'documents':documents();break;case'journal':journal();break;case'admin':admin();break;default:dashboard()}}

(async()=>{await connectGrist();await loadAll();render();})();
