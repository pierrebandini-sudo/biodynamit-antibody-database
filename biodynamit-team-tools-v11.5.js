/* BioDynaMit v11.5 — Outils d'équipe
   Additive module. It does not alter the validated v10 storage geometry.
   Data are stored in dedicated Grist tables and all writes pass through the v11.3 security guard.
*/
(function(){
  'use strict';

  const VERSION='11.5.0';
  const v112=window.BioDynaMitV112||{};
  const v113=window.BioDynaMitV113||{};
  const team=window.BioDynaMitTeamV115=window.BioDynaMitTeamV115||{};

  const TEAM_SCHEMAS={
    LabReviews:[
      {id:'Date',type:'DateTime'},{id:'InventoryType',type:'Text'},{id:'ItemCode',type:'Text'},{id:'ItemName',type:'Text'},
      {id:'UnitCode',type:'Text'},{id:'LotNumber',type:'Text'},{id:'Application',type:'Text'},{id:'Sample',type:'Text'},
      {id:'Fixation',type:'Text'},{id:'Dilution',type:'Text'},{id:'Rating',type:'Int'},{id:'Outcome',type:'Text'},
      {id:'Comment',type:'Text'},{id:'Author',type:'Text'},{id:'AttachmentLink',type:'Text'}
    ],
    LabUsage:[
      {id:'Date',type:'DateTime'},{id:'InventoryType',type:'Text'},{id:'ItemCode',type:'Text'},{id:'ItemName',type:'Text'},
      {id:'UnitCode',type:'Text'},{id:'Project',type:'Text'},{id:'Experiment',type:'Text'},{id:'Quantity',type:'Text'},
      {id:'User',type:'Text'},{id:'Notes',type:'Text'}
    ],
    LabUnitMeta:[
      {id:'InventoryType',type:'Text'},{id:'UnitCode',type:'Text'},{id:'ItemCode',type:'Text'},{id:'LotNumber',type:'Text'},
      {id:'DateReceived',type:'Date'},{id:'DateOpened',type:'Date'},{id:'ExpiryDate',type:'Date'},{id:'OpenedBy',type:'Text'},
      {id:'Notes',type:'Text'}
    ],
    LabOrders:[
      {id:'DateRequested',type:'DateTime'},{id:'InventoryType',type:'Text'},{id:'ItemCode',type:'Text'},{id:'ItemName',type:'Text'},
      {id:'Supplier',type:'Text'},{id:'CatalogNumber',type:'Text'},{id:'Reason',type:'Text'},{id:'Quantity',type:'Text'},
      {id:'Status',type:'Text'},{id:'RequestedBy',type:'Text'},{id:'DateOrdered',type:'DateTime'},{id:'DateReceived',type:'DateTime'},
      {id:'Notes',type:'Text'}
    ],
    MicroscopeProfiles:[
      {id:'Code',type:'Text'},{id:'Name',type:'Text'},{id:'Mode',type:'Text'},{id:'ChannelLabels',type:'Text'},
      {id:'Excitation_nm',type:'Text'},{id:'EmissionRanges',type:'Text'},{id:'Notes',type:'Text'},{id:'Active',type:'Bool'}
    ],
    LabInventoryChecks:[
      {id:'Date',type:'DateTime'},{id:'SessionCode',type:'Text'},{id:'InventoryType',type:'Text'},
      {id:'ContainerCode',type:'Text'},{id:'ContainerName',type:'Text'},{id:'Slot',type:'Text'},{id:'UnitCode',type:'Text'},
      {id:'ExpectedItem',type:'Text'},{id:'CheckStatus',type:'Text'},{id:'ObservedCode',type:'Text'},
      {id:'User',type:'Text'},{id:'Notes',type:'Text'}
    ]
  };

  const TEAM_TABLES=Object.keys(TEAM_SCHEMAS);
  team.version=VERSION;
  team.data=team.data||{};
  team.ready=false;
  team.loading=false;
  team.checked=false;
  team.tab=team.tab||'overview';
  team.selectedUnitKey=team.selectedUnitKey||'';
  team.selectedSession=team.selectedSession||'';
  team.panelSelections=team.panelSelections||['','','',''];
  team.panelMicroscope=team.panelMicroscope||'';
  team.panelResult=null;
  team.labelSelection=team.labelSelection||new Set();
  team.labelSearch=team.labelSearch||'';
  team.searchQuery=team.searchQuery||'';
  team._observer=null;

  function eh(v){
    try{return esc(v);}catch(_){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  }
  function norm(v){
    try{return normalizeName(v);}catch(_){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  }
  function nowSec(){return Date.now()/1000;}
  function fmtDate(v,withTime=false){
    if(!v)return '—';
    const n=Number(v); const d=new Date(n<1e12?n*1000:n);
    if(Number.isNaN(d.getTime()))return String(v);
    return withTime?d.toLocaleString('fr-FR'):d.toLocaleDateString('fr-FR');
  }
  function htmlDate(v){
    if(!v)return '';
    const n=Number(v);const d=new Date(n<1e12?n*1000:n);
    if(Number.isNaN(d.getTime()))return '';
    return d.toISOString().slice(0,10);
  }
  function dateSec(s){
    if(!s)return null;
    const n=Date.parse(String(s)+'T00:00:00');
    return Number.isFinite(n)?n/1000:null;
  }
  function tableRows(name){
    try{return rows(team.data[name])||[];}catch(_){return [];}
  }
  function canAdminSchema(){
    return !v113.securityEnabled || v113.role==='admin' || v113.role==='unconfigured' || !v113.role;
  }
  async function refreshTeamData(){
    if(!state?.connected || !window.grist){team.ready=false;return false;}
    if(team.loading)return false;
    team.loading=true;
    try{
      const tables=await grist.docApi.listTables();
      for(const name of TEAM_TABLES){
        if(tables.includes(name)){
          try{team.data[name]=await grist.docApi.fetchTable(name);}catch(_){team.data[name]=null;}
        }else team.data[name]=null;
      }
      team.ready=TEAM_TABLES.every(t=>tables.includes(t));
      team.checked=true;
      return team.ready;
    }finally{team.loading=false;}
  }
  async function initTeamSchema(){
    if(!state?.connected)return toast('Connexion Grist requise.');
    if(!canAdminSchema())return toast('Initialisation réservée à un administrateur.');
    try{
      const current=new Set(await grist.docApi.listTables());
      const created=[];
      for(const [name,cols] of Object.entries(TEAM_SCHEMAS)){
        if(current.has(name))continue;
        await grist.docApi.applyUserActions([['AddTable',name,cols]]);
        current.add(name);created.push(name);
      }
      await refreshTeamData();
      toast(created.length?`${created.length} table(s) d'équipe créée(s).`:'Structure d’équipe déjà complète.');
      renderTeamTools();
    }catch(err){console.error(err);toast(`Erreur : ${err.message||err}`);}
  }
  async function write(actions){
    if(!state?.connected)throw new Error('Connexion Grist requise.');
    const out=await grist.docApi.applyUserActions(actions);
    await refreshTeamData();
    return out;
  }

  function usableStatus(status,fill){
    const n=norm(`${status||''} ${fill||''}`);
    return !/(archive|vide a retirer|vide)/.test(n);
  }
  function primaryItems(){
    const A=rows(state.data.Antibodies||[]), V=rows(state.data.Vials||[]);
    return A.map(a=>{
      const units=V.filter(v=>Number(v.Antibody)===Number(a.id));
      const usable=units.filter(v=>usableStatus(v.Status,v.FillStatus));
      const low=usable.filter(v=>Number(v.EstimatedVolume_uL||999)<30 || /50|20|faible/i.test(String(v.FillStatus||'')));
      return {
        id:a.id,inventoryType:'primary_antibody',kind:'primary',code:a.Code||`AB-${a.id}`,name:a.Name||a.FullName||a.Code,
        target:a.Target||a.Name||'',hostSpecies:a.HostSpecies||'',targetSpecies:'',fluorophore:'',excitation_nm:null,emission_nm:null,
        applications:a.ApplicationsText||'',supplier:a.Supplier||'',catalogNumber:a.CatalogNumber||'',temperature:'',raw:a,
        units,stock:usable.length,lowCount:low.length,totalUnits:units.length
      };
    });
  }
  function secondaryData(){
    try{return v112.inventoryData?.('secondary_antibody')||null;}catch(_){return null;}
  }
  function secondaryItems(){
    const d=secondaryData();if(!d)return [];
    return (d.items||[]).map(i=>{
      const units=(d.units||[]).filter(u=>String(u.itemCode||'')===String(i.code));
      const usable=units.filter(u=>usableStatus(u.status,u.fillStatus));
      return {
        id:i.id,inventoryType:'secondary_antibody',kind:'secondary',code:i.code,name:i.name||i.code,
        target:i.target||'',hostSpecies:i.hostSpecies||'',targetSpecies:i.targetSpecies||'',fluorophore:i.fluorophore||'',
        excitation_nm:Number(i.excitation_nm||0)||null,emission_nm:Number(i.emission_nm||0)||null,
        applications:Object.values(i.attributes||{}).join(' '),supplier:i.supplier||'',catalogNumber:i.catalogNumber||'',
        temperature:i.storageTemperature||'',raw:i,units,stock:usable.length,lowCount:0,totalUnits:units.length
      };
    });
  }
  function allItems(){return [...primaryItems(),...secondaryItems()];}
  function itemByCode(code,type=''){
    return allItems().find(i=>String(i.code)===String(code)&&(!type||i.inventoryType===type))||null;
  }

  function allUnits(){
    const out=[];
    const A=new Map(primaryItems().map(i=>[Number(i.id),i]));
    const P=rows(state.data.Positions||[]), B=new Map(rows(state.data.Boxes||[]).map(b=>[Number(b.id),b]));
    const pByVial=new Map(P.filter(p=>Number(p.Vial)>0).map(p=>[Number(p.Vial),p]));
    for(const v of rows(state.data.Vials||[])){
      const item=A.get(Number(v.Antibody));if(!item)continue;
      const p=pByVial.get(Number(v.id)),box=p?B.get(Number(p.Box)):null;
      out.push({
        inventoryType:'primary_antibody',unitCode:v.Code||`V-${v.id}`,unitId:v.id,itemCode:item.code,itemName:item.name,
        status:v.Status||'',fillStatus:v.FillStatus||'',volume:v.EstimatedVolume_uL,containerCode:box?.Code||'',containerName:box?.Name||'',slot:p?.Slot||'',
        supplier:item.supplier,catalogNumber:item.catalogNumber,raw:v
      });
    }
    const d=secondaryData();
    if(d){
      const posByUnit=new Map((d.positions||[]).filter(p=>p.unitCode).map(p=>[String(p.unitCode),p]));
      const contByCode=new Map((d.containers||[]).map(c=>[String(c.code),c]));
      for(const u of d.units||[]){
        const p=posByUnit.get(String(u.code));const c=contByCode.get(String(p?.containerCode||u.containerCode||''));
        out.push({
          inventoryType:'secondary_antibody',unitCode:u.code,unitId:u.id,itemCode:u.itemCode||u.candidateItemCode||'',
          itemName:u.item?.name||u.candidateItem?.name||u.rawLabel||u.code,status:u.status||'',fillStatus:u.fillStatus||'',volume:u.estimatedVolume_uL,
          containerCode:c?.code||p?.containerCode||u.containerCode||'',containerName:c?.name||'',slot:p?.slot||u.slot||'',
          supplier:u.item?.supplier||u.candidateItem?.supplier||'',catalogNumber:u.item?.catalogNumber||u.candidateItem?.catalogNumber||'',raw:u
        });
      }
    }
    return out;
  }
  function unitKey(u){return `${u.inventoryType}|${u.unitCode}`;}
  function unitByKey(key){return allUnits().find(u=>unitKey(u)===String(key))||null;}
  function unitMeta(u){return tableRows('LabUnitMeta').find(r=>r.InventoryType===u.inventoryType&&String(r.UnitCode)===String(u.unitCode))||null;}

  function allContainers(){
    const out=[];
    const boxes=rows(state.data.Boxes||[]),positions=rows(state.data.Positions||[]),vials=new Map(rows(state.data.Vials||[]).map(v=>[Number(v.id),v])),abs=new Map(rows(state.data.Antibodies||[]).map(a=>[Number(a.id),a]));
    for(const b of boxes){
      const ps=positions.filter(p=>Number(p.Box)===Number(b.id)&&Number(p.Vial)>0).map(p=>{
        const v=vials.get(Number(p.Vial)),a=v?abs.get(Number(v.Antibody)):null;
        return {slot:p.Slot,unitCode:v?.Code||`V-${v?.id||''}`,itemName:a?.Name||a?.FullName||'—'};
      });
      out.push({key:`primary_antibody|${b.Code}`,inventoryType:'primary_antibody',code:b.Code,name:b.Name||b.Code,temperature:b.Temperature||'',positions:ps});
    }
    const d=secondaryData();
    if(d){
      const unitMap=new Map((d.units||[]).map(u=>[String(u.code),u]));
      for(const c of d.containers||[]){
        const ps=(d.positions||[]).filter(p=>String(p.containerCode)===String(c.code)&&p.unitCode).map(p=>{
          const u=unitMap.get(String(p.unitCode));
          return {slot:p.slot,unitCode:p.unitCode,itemName:u?.item?.name||u?.candidateItem?.name||u?.rawLabel||'—'};
        });
        out.push({key:`secondary_antibody|${c.code}`,inventoryType:'secondary_antibody',code:c.code,name:c.name||c.code,temperature:c.temperature||'',positions:ps});
      }
    }
    return out;
  }

  function invLabel(t){return t==='primary_antibody'?'Primaire':t==='secondary_antibody'?'Secondaire':t||'Inventaire';}
  function stars(n){const x=Math.max(0,Math.min(5,Number(n||0)));return `<span class="v115-stars" title="${x}/5">${'★'.repeat(x)}${'☆'.repeat(5-x)}</span>`;}
  function stockPill(i){return i.stock>1?`<span class="pill ok">${i.stock} en stock</span>`:i.stock===1?'<span class="pill warn">1 en stock</span>':'<span class="pill bad">0 en stock</span>';}
  function outcomePill(v){const n=norm(v);const cl=/tres bon|bon|valide/.test(n)?'ok':/mauvais|echec/.test(n)?'bad':/moyen|confirmer/.test(n)?'warn':'neutral';return `<span class="pill ${cl}">${eh(v||'—')}</span>`;}

  // -----------------------------------------------------------------------
  // Local QR generator — byte mode, QR versions 1–5, error correction L.
  // It encodes only local inventory identifiers; no data are sent externally.
  // -----------------------------------------------------------------------
  const QR_SPEC={
    1:{data:19,ecc:7,cap:17},2:{data:34,ecc:10,cap:32},3:{data:55,ecc:15,cap:53},
    4:{data:80,ecc:20,cap:78},5:{data:108,ecc:26,cap:106}
  };
  const GF_EXP=new Array(512),GF_LOG=new Array(256);
  (function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
  function gfMul(a,b){if(!a||!b)return 0;return GF_EXP[GF_LOG[a]+GF_LOG[b]];}
  function polyMul(a,b){const out=new Array(a.length+b.length-1).fill(0);for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)out[i+j]^=gfMul(a[i],b[j]);return out;}
  function rsEcc(data,n){let gen=[1];for(let i=0;i<n;i++)gen=polyMul(gen,[1,GF_EXP[i]]);const msg=data.concat(new Array(n).fill(0));for(let i=0;i<data.length;i++){const f=msg[i];if(!f)continue;for(let j=0;j<gen.length;j++)msg[i+j]^=gfMul(gen[j],f);}return msg.slice(data.length);}
  function pushBits(arr,val,n){for(let i=n-1;i>=0;i--)arr.push((val>>>i)&1);}
  function bitLen(v){let n=0;while(v){n++;v>>>=1;}return n;}
  function formatBits(mask=0){const data=(1<<3)|mask;let rem=data<<10;const gen=0x537;while(bitLen(rem)>=bitLen(gen))rem^=gen<<(bitLen(rem)-bitLen(gen));return ((data<<10)|rem)^0x5412;}
  function qrMatrix(text){
    const bytes=Array.from(new TextEncoder().encode(String(text)));
    const version=Number(Object.keys(QR_SPEC).find(v=>bytes.length<=QR_SPEC[v].cap)||0);
    if(!version)throw new Error('Texte trop long pour le QR local.');
    const spec=QR_SPEC[version],bits=[];pushBits(bits,0b0100,4);pushBits(bits,bytes.length,8);bytes.forEach(b=>pushBits(bits,b,8));
    const maxBits=spec.data*8;for(let i=0;i<Math.min(4,maxBits-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|(bits[i+j]||0);data.push(b);}let pad=0;while(data.length<spec.data)data.push((pad++%2)?0x11:0xec);
    const code=data.concat(rsEcc(data,spec.ecc)),stream=[];code.forEach(b=>pushBits(stream,b,8));
    const size=17+4*version,m=Array.from({length:size},()=>Array(size).fill(false)),res=Array.from({length:size},()=>Array(size).fill(false));
    const set=(r,c,v,lock=true)=>{if(r<0||c<0||r>=size||c>=size)return;m[r][c]=!!v;if(lock)res[r][c]=true;};
    const finder=(r0,c0)=>{for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++){const inside=dr>=0&&dr<=6&&dc>=0&&dc<=6;const dark=inside&&(dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4));set(r0+dr,c0+dc,dark,true);}};
    finder(0,0);finder(0,size-7);finder(size-7,0);
    for(let i=8;i<size-8;i++){if(!res[6][i])set(6,i,i%2===0,true);if(!res[i][6])set(i,6,i%2===0,true);}
    if(version>=2){const centers=[6,size-7];for(const cy of centers)for(const cx of centers){if(res[cy][cx])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));set(cy+dy,cx+dx,d===2||d===0,true);}}}
    const fpos=[];for(let i=0;i<15;i++){if(i<6)fpos.push([i,8]);else if(i<8)fpos.push([i+1,8]);else fpos.push([size-15+i,8]);if(i<8)fpos.push([8,size-i-1]);else if(i<9)fpos.push([8,15-i]);else fpos.push([8,14-i]);}
    fpos.forEach(([r,c])=>{if(!res[r][c])set(r,c,false,true);});set(size-8,8,true,true);
    let bi=0,up=true;for(let col=size-1;col>0;col-=2){if(col===6)col--;for(let ii=0;ii<size;ii++){const r=up?size-1-ii:ii;for(let k=0;k<2;k++){const c=col-k;if(res[r][c])continue;let b=bi<stream.length?stream[bi++]:0;if((r+c)%2===0)b^=1;m[r][c]=!!b;}}up=!up;}
    const fb=formatBits(0);for(let i=0;i<15;i++){const b=((fb>>>i)&1)===1;let r,c;if(i<6){r=i;c=8;}else if(i<8){r=i+1;c=8;}else{r=size-15+i;c=8;}set(r,c,b,true);if(i<8){r=8;c=size-i-1;}else if(i<9){r=8;c=15-i;}else{r=8;c=14-i;}set(r,c,b,true);}set(size-8,8,true,true);
    return m;
  }
  function qrSvg(text){
    const m=qrMatrix(text),q=4,n=m.length+q*2;let rect='';for(let r=0;r<m.length;r++)for(let c=0;c<m.length;c++)if(m[r][c])rect+=`<rect x="${c+q}" y="${r+q}" width="1" height="1"/>`;
    return `<svg viewBox="0 0 ${n} ${n}" role="img" aria-label="QR ${eh(text)}" xmlns="http://www.w3.org/2000/svg"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#000">${rect}</g></svg>`;
  }

  function tabButton(key,label){return `<button class="tab ${team.tab===key?'active':''}" data-v115-tab="${key}">${eh(label)}</button>`;}
  function tabsHtml(){
    return `<div class="v115-tabs">
      ${tabButton('overview','Vue équipe')}${tabButton('search','Recherche avancée')}${tabButton('panel','Panel IF')}
      ${tabButton('reviews','Retours')}${tabButton('usage','Utilisation & lots')}${tabButton('orders','Commandes')}
      ${tabButton('inventory','Inventaire physique')}${tabButton('microscopes','Microscopes')}${tabButton('labels','Étiquettes QR')}
    </div>`;
  }
  function bindTabs(){
    document.querySelectorAll('[data-v115-tab]').forEach(b=>b.onclick=()=>{team.tab=b.dataset.v115Tab;renderTeamTools();});
  }
  function shell(body){
    topbar('Outils équipe',`<span class="pill ok">v${VERSION}</span>`);
    content.innerHTML=`<div class="v115-wrap"><h1 class="page-title">Outils d’équipe</h1>
      <p class="subtitle">Stock, retours expérimentaux, panels IF, lots, commandes et inventaires physiques — directement reliés aux données Grist.</p>
      ${tabsHtml()}<div id="v115Body">${body}</div></div>`;
    bindTabs();
  }
  function loadingHtml(){return '<div class="card card-pad"><div class="empty">Chargement des outils d’équipe…</div></div>';}
  function setupHtml(){
    const allowed=canAdminSchema();
    return `<div class="card card-pad">
      <h2>Activer les outils d’équipe</h2>
      <p>Cette extension crée uniquement six tables supplémentaires dans Grist. Les tables existantes, les boîtes 3D et les inventaires actuels ne sont pas modifiés.</p>
      <div class="v115-info"><b>Données ajoutées :</b> retours expérimentaux, journal d’utilisation, métadonnées de lots, commandes, profils microscope et contrôles d’inventaire.</div>
      ${allowed?'<button class="btn btn-primary" id="v115Init">Initialiser les outils d’équipe</button>':'<div class="v115-warn">L’initialisation de la structure doit être faite par un administrateur.</div>'}
    </div>`;
  }

  function recentReviews(n=5){return tableRows('LabReviews').slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)).slice(0,n);}
  function pendingOrders(){return tableRows('LabOrders').filter(o=>!['Rangé','Annulé'].includes(String(o.Status||''))).sort((a,b)=>Number(b.DateRequested||0)-Number(a.DateRequested||0));}
  function lowStockItems(){
    return allItems().filter(i=>i.stock===0 || (i.stock===1&&i.lowCount>0) || (i.stock>0&&i.lowCount>=i.stock)).sort((a,b)=>a.stock-b.stock||a.name.localeCompare(b.name));
  }
  function openInventorySessions(){
    const grouped=new Map();for(const r of tableRows('LabInventoryChecks')){const k=r.SessionCode||'';if(!k)continue;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r);}
    return [...grouped.entries()].filter(([,list])=>list.some(x=>String(x.CheckStatus||'À vérifier')==='À vérifier'));
  }
  function overviewHtml(){
    const reviews=recentReviews(5),orders=pendingOrders(),low=lowStockItems(),sessions=openInventorySessions();
    const monthAgo=Date.now()/1000-31*86400;
    const usesMonth=tableRows('LabUsage').filter(x=>Number(x.Date||0)>=monthAgo).length;
    const reviewsMonth=tableRows('LabReviews').filter(x=>Number(x.Date||0)>=monthAgo).length;
    return `<div class="v115-hero">
      <div class="card card-pad">
        <div class="v115-card-title"><div><h2>Vue équipe</h2><p class="subtitle">Les informations utiles avant de commencer une expérience ou un inventaire.</p></div><button class="btn" data-v115-tabgo="search">Recherche avancée</button></div>
        <div class="v115-metric-grid">
          <div class="v115-metric"><b>${low.length}</b><span>références à surveiller</span></div>
          <div class="v115-metric"><b>${orders.length}</b><span>commandes ouvertes</span></div>
          <div class="v115-metric"><b>${usesMonth}</b><span>utilisations sur 31 jours</span></div>
          <div class="v115-metric"><b>${reviewsMonth}</b><span>retours sur 31 jours</span></div>
        </div>
      </div>
      <div class="card card-pad">
        <h3 class="section-title">Accès rapide</h3>
        <div class="v115-list">
          <button class="btn" data-v115-tabgo="panel">Construire un panel IF</button>
          <button class="btn" data-v115-tabgo="usage">Enregistrer une utilisation</button>
          <button class="btn" data-v115-tabgo="inventory">Faire un inventaire physique</button>
          <button class="btn" data-v115-tabgo="labels">Imprimer des étiquettes QR</button>
        </div>
      </div>
    </div>
    <div class="v115-grid-2" style="margin-top:16px">
      <div class="card card-pad"><div class="v115-card-title"><h3>Stock à surveiller</h3><span class="pill warn">${low.length}</span></div>
        ${low.length?`<div class="v115-list">${low.slice(0,8).map(i=>`<div class="v115-list-row"><div class="meta"><b>${eh(i.name)}</b><small>${eh(i.supplier)} · ${eh(i.catalogNumber||i.code)}</small></div><div>${stockPill(i)} <button class="btn btn-sm" data-v115-order="${eh(i.inventoryType)}|${eh(i.code)}">Commander</button></div></div>`).join('')}</div>`:'<div class="empty">Aucun stock critique détecté.</div>'}
      </div>
      <div class="card card-pad"><div class="v115-card-title"><h3>Commandes ouvertes</h3><span class="pill neutral">${orders.length}</span></div>
        ${orders.length?`<div class="v115-list">${orders.slice(0,8).map(o=>`<div class="v115-list-row"><div class="meta"><b>${eh(o.ItemName||o.ItemCode)}</b><small>${eh(o.Status||'À commander')} · ${fmtDate(o.DateRequested)}</small></div><span class="v115-code">${eh(o.CatalogNumber||o.ItemCode)}</span></div>`).join('')}</div>`:'<div class="empty">Aucune commande ouverte.</div>'}
      </div>
    </div>
    <div class="v115-grid-2" style="margin-top:16px">
      <div class="card card-pad"><h3>Derniers retours expérimentaux</h3>${reviews.length?reviews.map(reviewCard).join(''):'<div class="empty">Aucun retour enregistré.</div>'}</div>
      <div class="card card-pad"><h3>Inventaires en cours</h3>${sessions.length?sessions.slice(0,6).map(([k,l])=>{const done=l.filter(x=>x.CheckStatus&&x.CheckStatus!=='À vérifier').length;return `<div class="v115-list-row"><div class="meta"><b>${eh(l[0]?.ContainerName||l[0]?.ContainerCode)}</b><small>${eh(k)}</small></div><span>${done}/${l.length}</span></div>`}).join(''):'<div class="empty">Aucun inventaire en cours.</div>'}</div>
    </div>`;
  }
  function bindOverview(){
    document.querySelectorAll('[data-v115-tabgo]').forEach(b=>b.onclick=()=>{team.tab=b.dataset.v115Tabgo;renderTeamTools();});
    bindOrderButtons();
  }

  function parseSearch(q){
    const tokens=(String(q||'').match(/(?:[^\s"]+|"[^"]*")+/g)||[]).map(x=>x.replace(/^"|"$/g,''));
    const filters={},free=[];
    for(const tok of tokens){const m=/^([a-zA-ZÀ-ÿ]+):(.*)$/.exec(tok);if(m){const k=norm(m[1]).replace(/\s+/g,''),v=m[2].replace(/^"|"$/g,'');(filters[k]||(filters[k]=[])).push(v);}else free.push(tok);}
    return {filters,free};
  }
  function searchMatch(item,q){
    const {filters,free}=parseSearch(q),bag=norm([item.name,item.code,item.target,item.hostSpecies,item.targetSpecies,item.fluorophore,item.supplier,item.catalogNumber,item.applications,item.temperature].join(' '));
    if(free.some(t=>!bag.includes(norm(t))))return false;
    for(const [k,vals] of Object.entries(filters))for(const raw of vals){const v=norm(raw);let ok=true;
      if(['host','hote'].includes(k))ok=norm(item.hostSpecies).includes(v);
      else if(['target','cible'].includes(k))ok=norm(item.target||item.targetSpecies).includes(v);
      else if(['app','application'].includes(k))ok=norm(item.applications).includes(v);
      else if(['supplier','fournisseur'].includes(k))ok=norm(item.supplier).includes(v);
      else if(['ref','reference','catalog'].includes(k))ok=norm(item.catalogNumber).includes(v);
      else if(['fluor','fluorophore'].includes(k))ok=norm(item.fluorophore).includes(v);
      else if(['type'].includes(k))ok=norm(invLabel(item.inventoryType)).includes(v)||norm(item.inventoryType).includes(v);
      else if(['temp','temperature'].includes(k))ok=norm(item.temperature).includes(v);
      else if(k==='stock'){if(/^>\s*0/.test(raw))ok=item.stock>0;else if(/^0$/.test(raw.trim()))ok=item.stock===0;else if(/low|faible/.test(v))ok=item.stock<=1||item.lowCount>0;else ok=String(item.stock)===raw.trim();}
      else ok=bag.includes(norm(`${k} ${raw}`));
      if(!ok)return false;
    }
    return true;
  }
  function searchHtml(){
    const q=team.searchQuery,items=allItems().filter(i=>searchMatch(i,q));
    return `<div class="card card-pad">
      <h2>Recherche expérimentale</h2><p class="subtitle">Recherche simultanée dans les primaires et les secondaires, avec filtres simples.</p>
      <div class="searchbar"><input id="v115Search" value="${eh(q)}" placeholder="Ex. host:rabbit app:IF stock:>0"><button class="btn btn-primary" id="v115SearchGo">Rechercher</button><button class="btn" id="v115SearchClear">Effacer</button></div>
      <div class="v115-search-help">Filtres : <span class="v115-code">host:</span> <span class="v115-code">target:</span> <span class="v115-code">app:</span> <span class="v115-code">supplier:</span> <span class="v115-code">ref:</span> <span class="v115-code">fluor:</span> <span class="v115-code">stock:0</span> <span class="v115-code">stock:&gt;0</span> <span class="v115-code">stock:low</span> <span class="v115-code">type:</span></div>
    </div>
    <div class="card table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Type</th><th>Nom</th><th>Cible / espèce</th><th>Host</th><th>Fluor</th><th>Référence</th><th>Stock</th></tr></thead><tbody>
    ${items.slice(0,250).map(i=>`<tr class="v115-search-result" data-v115-openitem="${eh(i.inventoryType)}|${eh(i.code)}"><td>${eh(invLabel(i.inventoryType))}</td><td><b>${eh(i.name)}</b><small style="display:block">${eh(i.supplier)}</small></td><td>${eh(i.target||i.targetSpecies||'—')}</td><td>${eh(i.hostSpecies||'—')}</td><td>${eh(i.fluorophore||'—')}</td><td>${eh(i.catalogNumber||i.code)}</td><td>${stockPill(i)}</td></tr>`).join('')}
    </tbody></table></div><p class="subtitle">${items.length} résultat(s)${items.length>250?' · affichage limité aux 250 premiers':''}.</p>`;
  }
  function bindSearch(){
    const input=document.querySelector('#v115Search');
    const run=()=>{team.searchQuery=input?.value||'';renderTeamTools();};
    if(input)input.onkeydown=e=>{if(e.key==='Enter')run();};
    document.querySelector('#v115SearchGo')?.addEventListener('click',run);
    document.querySelector('#v115SearchClear')?.addEventListener('click',()=>{team.searchQuery='';renderTeamTools();});
    document.querySelectorAll('[data-v115-openitem]').forEach(r=>r.onclick=()=>openItemKey(r.dataset.v115Openitem));
  }
  function openItemKey(key){
    const [type,...rest]=String(key).split('|'),code=rest.join('|');const item=itemByCode(code,type);if(!item)return;
    if(type==='primary_antibody'){state.selectedAntibody=Number(item.id);go('antibody-detail');return;}
    if(type==='secondary_antibody'&&v112.inventoryData){v112.inventoryView[type]='detail';v112.inventorySelected[type]=item.id;go(`inv:${type}`);}
  }

  function microscopeProfiles(){return tableRows('MicroscopeProfiles').filter(x=>x.Active!==false);}
  function parseNums(s){return String(s||'').split(/[,;\s]+/).map(Number).filter(Number.isFinite);}
  function microCompat(item,profile){
    if(!profile||!item.excitation_nm)return {rank:1,label:'Non évalué'};
    const lines=parseNums(profile.Excitation_nm);if(!lines.length)return {rank:1,label:'Profil sans λ'};
    const d=Math.min(...lines.map(x=>Math.abs(x-Number(item.excitation_nm))));
    if(d<=25)return {rank:3,label:`Proche (${d} nm)`};
    if(d<=55)return {rank:2,label:`À vérifier (${d} nm)`};
    return {rank:0,label:`Peu adapté (${d} nm)`};
  }
  function secondaryCandidates(primary,profile){
    const h=norm(primary.hostSpecies);if(!h)return [];
    return secondaryItems().filter(s=>s.stock>0&&norm(s.targetSpecies)===h).map(s=>({...s,compat:microCompat(s,profile)})).sort((a,b)=>b.compat.rank-a.compat.rank||b.stock-a.stock||Number(a.emission_nm||999)-Number(b.emission_nm||999));
  }
  function analyzePanel(){
    const primaries=team.panelSelections.map(c=>itemByCode(c,'primary_antibody')).filter(Boolean),profile=microscopeProfiles().find(p=>String(p.id)===String(team.panelMicroscope))||null;
    const warnings=[];const hosts=new Map();for(const p of primaries){const h=norm(p.hostSpecies);if(h){hosts.set(h,(hosts.get(h)||0)+1);}else warnings.push(`${p.name} : espèce hôte non renseignée.`);if(p.applications&&!/(if|icc|ihc|immunoflu)/i.test(p.applications))warnings.push(`${p.name} : l’IF n’est pas explicitement indiquée dans les applications enregistrées.`);}
    for(const [h,n] of hosts)if(n>1)warnings.push(`${n} primaires partagent le même host (${h}) : des secondaires classiques risquent de ne pas permettre de les distinguer.`);
    const groups=primaries.map(p=>({primary:p,candidates:secondaryCandidates(p,profile)}));
    groups.filter(g=>!g.candidates.length).forEach(g=>warnings.push(`${g.primary.name} : aucun secondaire en stock détecté contre ${g.primary.hostSpecies||'le host non renseigné'}.`));
    const top=groups.map(g=>g.candidates[0]).filter(Boolean);for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++){if(top[i].emission_nm&&top[j].emission_nm&&Math.abs(top[i].emission_nm-top[j].emission_nm)<30)warnings.push(`Les premiers choix ${top[i].fluorophore} / ${top[j].fluorophore} ont des émissions proches : vérifier les filtres et le chevauchement spectral.`);}
    return {primaries,profile,warnings,groups};
  }
  function panelHtml(){
    const prim=primaryItems().filter(i=>i.stock>0),profiles=microscopeProfiles(),r=team.panelResult;
    const opts='<option value="">— choisir —</option>'+prim.map(i=>`<option value="${eh(i.code)}">${eh(i.name)} · ${eh(i.hostSpecies||'?')} · ${i.stock} vial(s)</option>`).join('');
    return `<div class="card card-pad">
      <h2>Assistant de panel d’immunofluorescence</h2><p class="subtitle">Choisis jusqu’à quatre primaires présents dans le stock. BioDynaMit vérifie les hosts, cherche les secondaires disponibles et effectue un pré-filtrage spectral indicatif.</p>
      <div class="v115-panel-form">
        ${[0,1,2,3].map(i=>`<div class="field"><label>Primaire ${i+1}</label><select data-v115-primary="${i}">${opts}</select></div>`).join('')}
        <div class="field"><label>Microscope / profil optique</label><select id="v115PanelMicroscope"><option value="">Sans profil</option>${profiles.map(p=>`<option value="${p.id}">${eh(p.Name)}</option>`).join('')}</select></div>
      </div>
      <div class="v115-info" style="margin-top:12px">Le résultat est une aide de préparation. Il ne remplace pas la vérification des datasheets, filtres, contrôles monomarqués et compensations éventuelles.</div>
      <button class="btn btn-primary" id="v115AnalyzePanel" style="margin-top:12px">Analyser le panel</button>
    </div>
    ${r?panelResultHtml(r):''}`;
  }
  function panelResultHtml(r){
    return `<div style="margin-top:16px">${r.warnings.length?r.warnings.map(w=>`<div class="v115-warn">${eh(w)}</div>`).join(''):'<div class="v115-ok">Aucun conflit simple détecté avec les informations actuellement enregistrées.</div>'}
      <div class="v115-grid-2" style="margin-top:12px">${r.groups.map(g=>`<div class="v115-panel-result"><h4>${eh(g.primary.name)} <small>(${eh(g.primary.hostSpecies||'?')})</small></h4>
      ${g.candidates.length?g.candidates.slice(0,5).map((s,idx)=>`<div class="v115-secondary-option"><div><b>${idx===0?'★ ':''}${eh(s.name)}</b><div class="v115-spectrum"><span>${eh(s.fluorophore||'sans fluor')}</span>${s.excitation_nm?`<small>Ex ${eh(s.excitation_nm)} nm</small>`:''}${s.emission_nm?`<small>Em ${eh(s.emission_nm)} nm</small>`:''}</div><small>${eh(s.supplier)} · ${eh(s.catalogNumber)}</small></div><div>${stockPill(s)}<br><small>${eh(s.compat.label)}</small></div></div>`).join(''):'<div class="empty">Aucun secondaire correspondant en stock.</div>'}</div>`).join('')}</div></div>`;
  }
  function bindPanel(){
    document.querySelectorAll('[data-v115-primary]').forEach(s=>{const i=Number(s.dataset.v115Primary);s.value=team.panelSelections[i]||'';s.onchange=()=>team.panelSelections[i]=s.value;});
    const ms=document.querySelector('#v115PanelMicroscope');if(ms){ms.value=team.panelMicroscope||'';ms.onchange=()=>team.panelMicroscope=ms.value;}
    document.querySelector('#v115AnalyzePanel')?.addEventListener('click',()=>{team.panelResult=analyzePanel();renderTeamTools();});
  }

  function reviewCard(r){return `<article class="v115-review"><header><div><b>${eh(r.ItemName||r.ItemCode)}</b><small style="display:block">${fmtDate(r.Date,true)} · ${eh(r.Application||'Application non précisée')} · ${eh(r.Author||'Utilisateur')}</small></div><div>${stars(r.Rating)}</div></header><div style="margin-top:6px">${outcomePill(r.Outcome)} ${r.LotNumber?`<span class="pill neutral">Lot ${eh(r.LotNumber)}</span>`:''}</div>${r.Comment?`<p>${eh(r.Comment)}</p>`:''}${r.Dilution||r.Fixation?`<p class="v115-compact">${r.Dilution?`Dilution : ${eh(r.Dilution)}. `:''}${r.Fixation?`Fixation : ${eh(r.Fixation)}.`:''}</p>`:''}${r.AttachmentLink?`<a class="btn btn-sm" href="${eh(r.AttachmentLink)}" target="_blank" rel="noopener noreferrer">Pièce jointe ↗</a>`:''}</article>`;}
  function reviewsHtml(){
    const list=tableRows('LabReviews').slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0));
    return `<div class="card card-pad"><div class="v115-card-title"><div><h2>Retours expérimentaux</h2><p class="subtitle">Capitalise les dilutions, fixations, lots et résultats réellement observés par l’équipe.</p></div><button class="btn btn-primary" id="v115AddReviewFree">+ Ajouter un retour</button></div></div>
      <div class="v115-grid-2" style="margin-top:14px">${list.length?list.map(reviewCard).join(''):'<div class="card card-pad empty">Aucun retour expérimental enregistré.</div>'}</div>`;
  }
  function showReviewModal(item=null){
    const items=allItems();
    modal(`<h2>Ajouter un retour expérimental</h2>
      <div class="form-grid"><div class="field"><label>Référence *</label><select id="v115RevItem">${items.map(i=>`<option value="${eh(i.inventoryType)}|${eh(i.code)}">${eh(invLabel(i.inventoryType))} — ${eh(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Application</label><input id="v115RevApp" placeholder="IF, WB, IHC…"></div>
      <div class="field"><label>Lot</label><input id="v115RevLot"></div><div class="field"><label>Dilution</label><input id="v115RevDil" placeholder="1/500"></div>
      <div class="field"><label>Échantillon</label><input id="v115RevSample" placeholder="MEF, nerf sciatique…"></div><div class="field"><label>Fixation / préparation</label><input id="v115RevFix"></div>
      <div class="field"><label>Évaluation</label><select id="v115RevRating"><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select></div>
      <div class="field"><label>Résultat</label><select id="v115RevOutcome"><option>Très bon</option><option>Bon</option><option>Moyen</option><option>À confirmer</option><option>Mauvais</option></select></div>
      <div class="field"><label>Auteur</label><input id="v115RevAuthor" placeholder="Nom / initiales"></div><div class="field"><label>Lien image / document</label><input id="v115RevLink" placeholder="https://…"></div></div>
      <div class="field"><label>Commentaire</label><textarea id="v115RevComment" rows="4" placeholder="Signal, bruit de fond, conditions particulières…"></textarea></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="v115RevCancel">Annuler</button><button class="btn btn-primary" id="v115RevSave">Enregistrer</button></div>`);
    if(item)document.querySelector('#v115RevItem').value=`${item.inventoryType}|${item.code}`;
    document.querySelector('#v115RevCancel').onclick=closeModal;
    document.querySelector('#v115RevSave').onclick=saveReview;
  }
  async function saveReview(){
    const key=document.querySelector('#v115RevItem').value,[type,...rest]=key.split('|'),code=rest.join('|'),item=itemByCode(code,type);if(!item)return toast('Référence introuvable.');
    const rec={Date:nowSec(),InventoryType:type,ItemCode:item.code,ItemName:item.name,UnitCode:'',LotNumber:document.querySelector('#v115RevLot').value.trim(),Application:document.querySelector('#v115RevApp').value.trim(),Sample:document.querySelector('#v115RevSample').value.trim(),Fixation:document.querySelector('#v115RevFix').value.trim(),Dilution:document.querySelector('#v115RevDil').value.trim(),Rating:Number(document.querySelector('#v115RevRating').value||0),Outcome:document.querySelector('#v115RevOutcome').value,Comment:document.querySelector('#v115RevComment').value.trim(),Author:document.querySelector('#v115RevAuthor').value.trim(),AttachmentLink:document.querySelector('#v115RevLink').value.trim()};
    try{await write([['AddRecord','LabReviews',null,rec]]);closeModal();toast('Retour expérimental enregistré.');render();}catch(err){toast(`Erreur : ${err.message||err}`);}
  }
  function bindReviews(){document.querySelector('#v115AddReviewFree')?.addEventListener('click',()=>showReviewModal());}

  function orderStatusClass(s){return /recu|range/.test(norm(s))?'ok':/commande/.test(norm(s))?'warn':/annule/.test(norm(s))?'neutral':'warn';}
  function ordersHtml(){
    const list=tableRows('LabOrders').slice().sort((a,b)=>Number(b.DateRequested||0)-Number(a.DateRequested||0)),low=lowStockItems();
    return `<div class="v115-grid-2"><div class="card card-pad"><h2>Suggestions de réapprovisionnement</h2><p class="subtitle">Calculées à partir du stock actuel. Rien n’est commandé automatiquement.</p>${low.length?`<div class="v115-list">${low.slice(0,20).map(i=>`<div class="v115-list-row"><div class="meta"><b>${eh(i.name)}</b><small>${eh(i.supplier)} · ${eh(i.catalogNumber||i.code)}</small></div><div>${stockPill(i)} <button class="btn btn-sm" data-v115-order="${eh(i.inventoryType)}|${eh(i.code)}">Ajouter</button></div></div>`).join('')}</div>`:'<div class="empty">Aucune suggestion.</div>'}</div>
      <div class="card card-pad"><h2>À traiter</h2><p class="subtitle">Cycle : À commander → Commandé → Reçu → Rangé.</p>${list.length?`<div class="v115-list">${list.map(o=>`<div class="v115-list-row"><div class="meta"><b>${eh(o.ItemName||o.ItemCode)}</b><small>${eh(o.Supplier)} · ${eh(o.CatalogNumber)} · ${fmtDate(o.DateRequested)}</small><span>${eh(o.Reason||'')}</span></div><div style="text-align:right"><span class="pill ${orderStatusClass(o.Status)}">${eh(o.Status||'À commander')}</span><div style="margin-top:6px">${orderActionButton(o)}</div></div></div>`).join('')}</div>`:'<div class="empty">Aucune commande enregistrée.</div>'}</div></div>`;
  }
  function orderActionButton(o){const s=String(o.Status||'À commander');if(s==='À commander')return `<button class="btn btn-sm" data-v115-order-next="${o.id}|Commandé">Marquer commandé</button>`;if(s==='Commandé')return `<button class="btn btn-sm" data-v115-order-next="${o.id}|Reçu">Marquer reçu</button>`;if(s==='Reçu')return `<button class="btn btn-sm" data-v115-order-next="${o.id}|Rangé">Marquer rangé</button>`;return '';}
  function bindOrderButtons(){document.querySelectorAll('[data-v115-order]').forEach(b=>b.onclick=()=>{const [type,...rest]=b.dataset.v115Order.split('|');showOrderModal(itemByCode(rest.join('|'),type));});}
  function bindOrders(){bindOrderButtons();document.querySelectorAll('[data-v115-order-next]').forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.v115OrderNext.split('|'),payload={Status:status};if(status==='Commandé')payload.DateOrdered=nowSec();if(status==='Reçu')payload.DateReceived=nowSec();try{await write([['UpdateRecord','LabOrders',Number(id),payload]]);toast(`Commande : ${status}.`);renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}});}
  function showOrderModal(item){if(!item)return toast('Référence introuvable.');modal(`<h2>Ajouter à la liste de commande</h2><p><b>${eh(item.name)}</b><br>${eh(item.supplier)} · ${eh(item.catalogNumber||item.code)}</p><div class="form-grid"><div class="field"><label>Quantité</label><input id="v115OrdQty" value="1"></div><div class="field"><label>Demandé par</label><input id="v115OrdBy" placeholder="Nom / initiales"></div></div><div class="field"><label>Motif</label><input id="v115OrdReason" value="${item.stock===0?'Stock épuisé':'Stock faible'}"></div><div class="field"><label>Notes</label><textarea id="v115OrdNotes" rows="3"></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn" id="v115OrdCancel">Annuler</button><button class="btn btn-primary" id="v115OrdSave">Ajouter</button></div>`);document.querySelector('#v115OrdCancel').onclick=closeModal;document.querySelector('#v115OrdSave').onclick=async()=>{const rec={DateRequested:nowSec(),InventoryType:item.inventoryType,ItemCode:item.code,ItemName:item.name,Supplier:item.supplier,CatalogNumber:item.catalogNumber,Reason:document.querySelector('#v115OrdReason').value.trim(),Quantity:document.querySelector('#v115OrdQty').value.trim(),Status:'À commander',RequestedBy:document.querySelector('#v115OrdBy').value.trim(),DateOrdered:null,DateReceived:null,Notes:document.querySelector('#v115OrdNotes').value.trim()};try{await write([['AddRecord','LabOrders',null,rec]]);closeModal();toast('Ajouté à la liste de commande.');render();}catch(err){toast(`Erreur : ${err.message||err}`);}};}

  function unitSelectOptions(){return allUnits().slice().sort((a,b)=>a.itemName.localeCompare(b.itemName)||a.unitCode.localeCompare(b.unitCode)).map(u=>`<option value="${eh(unitKey(u))}">${eh(invLabel(u.inventoryType))} — ${eh(u.itemName)} — ${eh(u.unitCode)}</option>`).join('');}
  function usageHtml(){
    const units=allUnits();if(!team.selectedUnitKey&&units.length)team.selectedUnitKey=unitKey(units[0]);const u=unitByKey(team.selectedUnitKey),meta=u?unitMeta(u):null;
    const logs=u?tableRows('LabUsage').filter(x=>x.InventoryType===u.inventoryType&&String(x.UnitCode)===String(u.unitCode)).sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)):[];
    const expiring=meta?.ExpiryDate&&Number(meta.ExpiryDate)<Date.now()/1000+30*86400;
    return `<div class="card card-pad"><h2>Utilisation & lots</h2><p class="subtitle">Historise qui a utilisé un vial, pour quel projet, et conserve lot, ouverture et péremption sans modifier automatiquement le volume estimé.</p><div class="field"><label>Vial / unité</label><select id="v115UnitSelect">${unitSelectOptions()}</select></div></div>
    ${u?`<div class="v115-grid-2" style="margin-top:14px"><div class="card card-pad"><div class="v115-card-title"><div><h3>${eh(u.itemName)}</h3><p class="subtitle"><span class="v115-code">${eh(u.unitCode)}</span> · ${eh(u.containerName||'Non rangé')} ${u.slot?`· ${eh(u.slot)}`:''}</p></div><button class="btn" id="v115EditMeta">Lot / dates</button></div><div class="v115-meta-grid"><b>Lot</b><span>${eh(meta?.LotNumber||'—')}</span><b>Reçu</b><span>${fmtDate(meta?.DateReceived)}</span><b>Ouvert</b><span>${fmtDate(meta?.DateOpened)} ${meta?.OpenedBy?`par ${eh(meta.OpenedBy)}`:''}</span><b>Péremption</b><span class="${expiring?'v115-expiring':''}">${fmtDate(meta?.ExpiryDate)}</span><b>Notes</b><span>${eh(meta?.Notes||'—')}</span></div><button class="btn btn-primary" id="v115LogUsage" style="margin-top:14px">Enregistrer une utilisation</button></div>
      <div class="card card-pad"><h3>Historique d’utilisation</h3>${logs.length?`<div class="v115-list">${logs.map(x=>`<div class="v115-list-row"><div class="meta"><b>${fmtDate(x.Date,true)} · ${eh(x.User||'Utilisateur')}</b><small>${eh(x.Project||'')} ${x.Experiment?`· ${eh(x.Experiment)}`:''}</small><span>${eh(x.Quantity||'')} ${eh(x.Notes||'')}</span></div></div>`).join('')}</div>`:'<div class="empty">Aucune utilisation enregistrée.</div>'}</div></div>`:'<div class="card card-pad empty" style="margin-top:14px">Aucun vial disponible.</div>'}`;
  }
  function bindUsage(){
    const s=document.querySelector('#v115UnitSelect');if(s){s.value=team.selectedUnitKey;s.onchange=()=>{team.selectedUnitKey=s.value;renderTeamTools();};}
    const u=unitByKey(team.selectedUnitKey);if(!u)return;
    document.querySelector('#v115EditMeta')?.addEventListener('click',()=>showMetaModal(u));
    document.querySelector('#v115LogUsage')?.addEventListener('click',()=>showUsageModal(u));
  }
  function showMetaModal(u){const m=unitMeta(u);modal(`<h2>Lot et dates — ${eh(u.unitCode)}</h2><div class="form-grid"><div class="field"><label>Numéro de lot</label><input id="v115MetaLot" value="${eh(m?.LotNumber||'')}"></div><div class="field"><label>Date de réception</label><input type="date" id="v115MetaReceived" value="${htmlDate(m?.DateReceived)}"></div><div class="field"><label>Date d’ouverture</label><input type="date" id="v115MetaOpened" value="${htmlDate(m?.DateOpened)}"></div><div class="field"><label>Date de péremption</label><input type="date" id="v115MetaExpiry" value="${htmlDate(m?.ExpiryDate)}"></div><div class="field"><label>Ouvert par</label><input id="v115MetaBy" value="${eh(m?.OpenedBy||'')}"></div></div><div class="field"><label>Notes</label><textarea id="v115MetaNotes" rows="3">${eh(m?.Notes||'')}</textarea></div><div class="row" style="justify-content:flex-end"><button class="btn" id="v115MetaCancel">Annuler</button><button class="btn btn-primary" id="v115MetaSave">Enregistrer</button></div>`);document.querySelector('#v115MetaCancel').onclick=closeModal;document.querySelector('#v115MetaSave').onclick=async()=>{const rec={InventoryType:u.inventoryType,UnitCode:u.unitCode,ItemCode:u.itemCode,LotNumber:document.querySelector('#v115MetaLot').value.trim(),DateReceived:dateSec(document.querySelector('#v115MetaReceived').value),DateOpened:dateSec(document.querySelector('#v115MetaOpened').value),ExpiryDate:dateSec(document.querySelector('#v115MetaExpiry').value),OpenedBy:document.querySelector('#v115MetaBy').value.trim(),Notes:document.querySelector('#v115MetaNotes').value.trim()};try{const action=m?['UpdateRecord','LabUnitMeta',Number(m.id),rec]:['AddRecord','LabUnitMeta',null,rec];await write([action]);closeModal();toast('Lot et dates enregistrés.');renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}};}
  function showUsageModal(u){modal(`<h2>Utilisation — ${eh(u.unitCode)}</h2><p><b>${eh(u.itemName)}</b></p><div class="form-grid"><div class="field"><label>Projet</label><input id="v115UseProject" placeholder="Projet / axe"></div><div class="field"><label>Expérience</label><input id="v115UseExperiment" placeholder="Nom ou identifiant"></div><div class="field"><label>Quantité / prélèvement</label><input id="v115UseQty" placeholder="ex. 2 µL ou aliquot"></div><div class="field"><label>Utilisateur</label><input id="v115UseUser" placeholder="Nom / initiales"></div></div><div class="field"><label>Notes</label><textarea id="v115UseNotes" rows="3"></textarea></div><div class="v115-info">Cette action enregistre l’utilisation mais ne décrémente pas automatiquement le volume : on évite ainsi de transformer une estimation en mesure fausse.</div><div class="row" style="justify-content:flex-end"><button class="btn" id="v115UseCancel">Annuler</button><button class="btn btn-primary" id="v115UseSave">Enregistrer</button></div>`);document.querySelector('#v115UseCancel').onclick=closeModal;document.querySelector('#v115UseSave').onclick=async()=>{const rec={Date:nowSec(),InventoryType:u.inventoryType,ItemCode:u.itemCode,ItemName:u.itemName,UnitCode:u.unitCode,Project:document.querySelector('#v115UseProject').value.trim(),Experiment:document.querySelector('#v115UseExperiment').value.trim(),Quantity:document.querySelector('#v115UseQty').value.trim(),User:document.querySelector('#v115UseUser').value.trim(),Notes:document.querySelector('#v115UseNotes').value.trim()};try{await write([['AddRecord','LabUsage',null,rec]]);closeModal();toast('Utilisation enregistrée.');renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}};}

  function inventorySessions(){const map=new Map();for(const r of tableRows('LabInventoryChecks')){if(!r.SessionCode)continue;if(!map.has(r.SessionCode))map.set(r.SessionCode,[]);map.get(r.SessionCode).push(r);}return [...map.entries()].sort((a,b)=>Math.max(...b[1].map(x=>Number(x.Date||0)))-Math.max(...a[1].map(x=>Number(x.Date||0))));}
  function inventoryHtml(){
    const containers=allContainers(),sessions=inventorySessions();if(!team.selectedSession&&sessions.length)team.selectedSession=sessions[0][0];const current=sessions.find(([k])=>k===team.selectedSession),list=current?.[1]||[],done=list.filter(x=>x.CheckStatus&&x.CheckStatus!=='À vérifier').length,pct=list.length?Math.round(done/list.length*100):0;
    return `<div class="card card-pad"><h2>Inventaire physique</h2><p class="subtitle">Crée une session à partir des positions censées être occupées. Le contrôle ne modifie jamais automatiquement la position réelle dans la BDD.</p><div class="v115-toolbar"><select id="v115InvContainer"><option value="">— choisir une boîte —</option>${containers.map(c=>`<option value="${eh(c.key)}">${eh(invLabel(c.inventoryType))} — ${eh(c.name)} · ${eh(c.temperature)} · ${c.positions.length} occupé(s)</option>`).join('')}</select><input id="v115InvUser" placeholder="Nom / initiales"><button class="btn btn-primary" id="v115InvStart">Démarrer une session</button></div></div>
      ${sessions.length?`<div class="card card-pad" style="margin-top:14px"><div class="v115-toolbar"><label>Session</label><select id="v115SessionSelect">${sessions.map(([k,l])=>`<option value="${eh(k)}">${eh(l[0]?.ContainerName||l[0]?.ContainerCode)} — ${eh(k)}</option>`).join('')}</select><span class="pill neutral">${done}/${list.length}</span></div><div class="v115-progress"><i style="width:${pct}%"></i></div>${list.length?`<div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Slot</th><th>Attendu</th><th>Vial</th><th>Contrôle</th></tr></thead><tbody>${list.slice().sort((a,b)=>String(a.Slot).localeCompare(String(b.Slot),undefined,{numeric:true})).map(r=>`<tr><td><b>${eh(r.Slot)}</b></td><td>${eh(r.ExpectedItem)}</td><td><span class="v115-code">${eh(r.UnitCode)}</span></td><td><div class="v115-check-actions">${['Présent','Absent','Vide','Déplacé'].map(s=>`<button class="btn v115-status-btn ${r.CheckStatus===s?'active':''}" data-v115-check="${r.id}|${s}">${s}</button>`).join('')}</div>${r.ObservedCode?`<small>Observé : ${eh(r.ObservedCode)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Session vide.</div>'}</div>`:'<div class="card card-pad empty" style="margin-top:14px">Aucune session d’inventaire.</div>'}`;
  }
  function bindInventory(){
    document.querySelector('#v115InvStart')?.addEventListener('click',async()=>{const key=document.querySelector('#v115InvContainer').value,user=document.querySelector('#v115InvUser').value.trim(),c=allContainers().find(x=>x.key===key);if(!c)return toast('Choisis une boîte.');if(!c.positions.length)return toast('Aucune position occupée à contrôler dans cette boîte.');const stamp=new Date().toISOString().replace(/[-:T]/g,'').slice(0,12),session=`INV-${stamp}-${c.code}`;const recs=c.positions.map(p=>({Date:nowSec(),SessionCode:session,InventoryType:c.inventoryType,ContainerCode:c.code,ContainerName:c.name,Slot:p.slot,UnitCode:p.unitCode,ExpectedItem:p.itemName,CheckStatus:'À vérifier',ObservedCode:'',User:user,Notes:''}));const cols=Object.keys(recs[0]),vals=Object.fromEntries(cols.map(k=>[k,recs.map(r=>r[k])]));try{await write([['BulkAddRecord','LabInventoryChecks',Array(recs.length).fill(null),vals]]);team.selectedSession=session;toast('Session d’inventaire créée.');renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}});
    const ss=document.querySelector('#v115SessionSelect');if(ss){ss.value=team.selectedSession;ss.onchange=()=>{team.selectedSession=ss.value;renderTeamTools();};}
    document.querySelectorAll('[data-v115-check]').forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.v115Check.split('|');let observed='';if(status==='Déplacé')observed=window.prompt('Où / quel code as-tu observé ?', '')||'';try{await write([['UpdateRecord','LabInventoryChecks',Number(id),{CheckStatus:status,ObservedCode:observed}]]);renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}});
  }

  function microscopesHtml(){const list=tableRows('MicroscopeProfiles').slice().sort((a,b)=>String(a.Name).localeCompare(String(b.Name)));return `<div class="card card-pad"><div class="v115-card-title"><div><h2>Profils microscope</h2><p class="subtitle">Renseigne les canaux réellement disponibles dans le labo. L’assistant de panel utilise ces valeurs comme pré-filtre indicatif.</p></div><button class="btn btn-primary" id="v115AddMicro">+ Ajouter</button></div></div><div class="v115-grid-3" style="margin-top:14px">${list.length?list.map(m=>`<div class="v115-microscope-card"><div class="v115-card-title"><h4>${eh(m.Name)}</h4><span class="pill ${m.Active!==false?'ok':'neutral'}">${m.Active!==false?'Actif':'Inactif'}</span></div><p><b>Mode :</b> ${eh(m.Mode||'—')}</p><p><b>Canaux :</b> ${eh(m.ChannelLabels||'—')}</p><p><b>Excitation :</b> ${eh(m.Excitation_nm||'—')} nm</p><p><b>Émission :</b> ${eh(m.EmissionRanges||'—')}</p><p class="v115-compact">${eh(m.Notes||'')}</p><button class="btn btn-sm" data-v115-microtoggle="${m.id}|${m.Active!==false?'off':'on'}">${m.Active!==false?'Désactiver':'Activer'}</button></div>`).join(''):'<div class="card card-pad empty">Aucun profil. Ajoute les microscopes / filtres réellement disponibles.</div>'}</div>`;}
  function bindMicroscopes(){document.querySelector('#v115AddMicro')?.addEventListener('click',showMicroscopeModal);document.querySelectorAll('[data-v115-microtoggle]').forEach(b=>b.onclick=async()=>{const [id,mode]=b.dataset.v115Microtoggle.split('|');try{await write([['UpdateRecord','MicroscopeProfiles',Number(id),{Active:mode==='on'}]]);renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}});}
  function showMicroscopeModal(){modal(`<h2>Ajouter un profil microscope</h2><div class="form-grid"><div class="field"><label>Nom *</label><input id="v115MicName" placeholder="Nikon Ti2"></div><div class="field"><label>Mode</label><input id="v115MicMode" placeholder="Épifluorescence, confocal, STED…"></div><div class="field"><label>Canaux</label><input id="v115MicChannels" placeholder="DAPI, 488, 555, 647"></div><div class="field"><label>Excitations / lignes (nm)</label><input id="v115MicExc" placeholder="405, 488, 561, 640"></div><div class="field"><label>Fenêtres d’émission</label><input id="v115MicEm" placeholder="430-480; 500-550; 570-620; 650-750"></div></div><div class="field"><label>Notes</label><textarea id="v115MicNotes" rows="3" placeholder="Filtres installés, limitations, objectif…"></textarea></div><div class="v115-info">Entre uniquement les valeurs réellement présentes sur l’instrument. BioDynaMit n’invente pas la configuration optique.</div><div class="row" style="justify-content:flex-end"><button class="btn" id="v115MicCancel">Annuler</button><button class="btn btn-primary" id="v115MicSave">Ajouter</button></div>`);document.querySelector('#v115MicCancel').onclick=closeModal;document.querySelector('#v115MicSave').onclick=async()=>{const name=document.querySelector('#v115MicName').value.trim();if(!name)return toast('Nom obligatoire.');const next=tableRows('MicroscopeProfiles').length+1,rec={Code:`MIC-${String(next).padStart(3,'0')}`,Name:name,Mode:document.querySelector('#v115MicMode').value.trim(),ChannelLabels:document.querySelector('#v115MicChannels').value.trim(),Excitation_nm:document.querySelector('#v115MicExc').value.trim(),EmissionRanges:document.querySelector('#v115MicEm').value.trim(),Notes:document.querySelector('#v115MicNotes').value.trim(),Active:true};try{await write([['AddRecord','MicroscopeProfiles',null,rec]]);closeModal();toast('Profil microscope ajouté.');renderTeamTools();}catch(err){toast(`Erreur : ${err.message||err}`);}};}

  function qrPayload(u){return `BDM|${u.inventoryType==='primary_antibody'?'P':'S'}|${u.unitCode}|${u.itemCode}`;}
  function labelHtml(u){const m=unitMeta(u),payload=qrPayload(u);return `<div class="v115-label">${qrSvg(payload)}<div><h4>${eh(u.itemName)}</h4><p><b>${eh(u.unitCode)}</b></p><p>${eh(u.itemCode||'')} ${m?.LotNumber?`· Lot ${eh(m.LotNumber)}`:''}</p><p>${eh(u.containerName||'')} ${u.slot?`· ${eh(u.slot)}`:''}</p></div></div>`;}
  function labelsHtml(){const q=norm(team.labelSearch),units=allUnits().filter(u=>!q||norm([u.unitCode,u.itemName,u.itemCode,u.containerName,u.slot].join(' ')).includes(q));const selected=allUnits().filter(u=>team.labelSelection.has(unitKey(u)));return `<div class="card card-pad v115-no-print"><h2>Étiquettes QR locales</h2><p class="subtitle">Le QR contient uniquement un identifiant BioDynaMit (ex. vial + référence). Il est généré localement dans le navigateur : aucune donnée n’est envoyée à un service QR externe.</p><div class="v115-label-controls"><div class="field"><label>Rechercher un vial</label><div class="searchbar"><input id="v115LabelSearch" value="${eh(team.labelSearch)}" placeholder="Code, anticorps, boîte…"><button class="btn" id="v115LabelSearchGo">Filtrer</button></div></div><div class="v115-toolbar"><button class="btn" id="v115SelectVisible">Sélectionner visibles</button><button class="btn" id="v115ClearLabels">Vider</button><button class="btn btn-primary" id="v115PrintLabels" ${selected.length?'':'disabled'}>Imprimer ${selected.length} étiquette(s)</button></div></div><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="table"><thead><tr><th></th><th>Vial</th><th>Référence</th><th>Localisation</th></tr></thead><tbody>${units.slice(0,150).map(u=>`<tr><td><input type="checkbox" data-v115-label="${eh(unitKey(u))}" ${team.labelSelection.has(unitKey(u))?'checked':''}></td><td><b>${eh(u.unitCode)}</b></td><td>${eh(u.itemName)}</td><td>${eh(u.containerName||'—')} ${u.slot?`· ${eh(u.slot)}`:''}</td></tr>`).join('')}</tbody></table></div><div class="v115-info">Après scan, le texte obtenu ressemble à <span class="v115-code">BDM|P|V-047|AB-001</span>. Tu peux le coller dans la recherche de scan ci-dessous.</div><div class="searchbar"><input id="v115ScanInput" placeholder="Coller un code QR ou un code vial"><button class="btn" id="v115ResolveScan">Ouvrir</button></div></div><div class="v115-label-sheet">${selected.map(labelHtml).join('')}</div>`;}
  function bindLabels(){
    const ls=document.querySelector('#v115LabelSearch');const lrun=()=>{team.labelSearch=ls?.value||'';renderTeamTools();};if(ls)ls.onkeydown=e=>{if(e.key==='Enter')lrun();};document.querySelector('#v115LabelSearchGo')?.addEventListener('click',lrun);
    document.querySelectorAll('[data-v115-label]').forEach(c=>c.onchange=()=>{if(c.checked)team.labelSelection.add(c.dataset.v115Label);else team.labelSelection.delete(c.dataset.v115Label);renderTeamTools();});
    document.querySelector('#v115SelectVisible')?.addEventListener('click',()=>{const q=norm(team.labelSearch);allUnits().filter(u=>!q||norm([u.unitCode,u.itemName,u.itemCode,u.containerName,u.slot].join(' ')).includes(q)).slice(0,150).forEach(u=>team.labelSelection.add(unitKey(u)));renderTeamTools();});
    document.querySelector('#v115ClearLabels')?.addEventListener('click',()=>{team.labelSelection.clear();renderTeamTools();});
    document.querySelector('#v115PrintLabels')?.addEventListener('click',()=>{document.body.classList.add('v115-print-labels');window.print();setTimeout(()=>document.body.classList.remove('v115-print-labels'),300);});
    document.querySelector('#v115ResolveScan')?.addEventListener('click',()=>resolveScan(document.querySelector('#v115ScanInput').value));
  }
  function resolveScan(value){const s=String(value||'').trim();let code=s;if(s.startsWith('BDM|')){const parts=s.split('|');code=parts[2]||'';}const u=allUnits().find(x=>norm(x.unitCode)===norm(code));if(!u)return toast('Vial introuvable pour ce code.');if(u.inventoryType==='primary_antibody'){const v=rows(state.data.Vials||[]).find(x=>String(x.Code||`V-${x.id}`)===String(u.unitCode));if(v&&typeof openBoxForVial==='function'){openBoxForVial(Number(v.id));return;}}team.selectedUnitKey=unitKey(u);team.tab='usage';go('team-tools');}

  function alternativesFor(item){const items=allItems().filter(x=>x.inventoryType===item.inventoryType&&x.code!==item.code);if(item.inventoryType==='primary_antibody'){const t=norm(item.target||item.name);return items.filter(x=>norm(x.target||x.name)===t).sort((a,b)=>b.stock-a.stock);}const ts=norm(item.targetSpecies),fl=norm(item.fluorophore);return items.filter(x=>norm(x.targetSpecies)===ts&&(fl?norm(x.fluorophore)===fl:true)).sort((a,b)=>b.stock-a.stock);}
  function showAlternatives(item){const list=alternativesFor(item);modal(`<h2>Alternatives — ${eh(item.name)}</h2><p class="subtitle">Correspondance basée sur la cible enregistrée${item.inventoryType==='secondary_antibody'?' et, si renseigné, le fluorophore':''}. Vérifie toujours la datasheet avant substitution.</p>${list.length?`<table class="table"><thead><tr><th>Nom</th><th>Fournisseur</th><th>Référence</th><th>Stock</th></tr></thead><tbody>${list.map(i=>`<tr><td><b>${eh(i.name)}</b></td><td>${eh(i.supplier)}</td><td>${eh(i.catalogNumber)}</td><td>${stockPill(i)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune alternative détectée dans cet inventaire.</div>'}<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="v115AltClose">Fermer</button></div>`);document.querySelector('#v115AltClose').onclick=closeModal;}

  function currentContextItem(){
    try{if(state.route==='antibody-detail'){const a=rows(state.data.Antibodies||[]).find(x=>Number(x.id)===Number(state.selectedAntibody));return a?itemByCode(a.Code||`AB-${a.id}`,'primary_antibody'):null;}if(String(state.route||'').startsWith('inv:')){const type=String(state.route).slice(4);if(v112.inventoryView?.[type]==='detail'){const d=v112.inventoryData?.(type),id=v112.inventorySelected?.[type],raw=d?.items?.find(x=>String(x.id)===String(id));return raw?itemByCode(raw.code,type):null;}}}catch(_){}return null;
  }
  function injectContextCard(){
    if(!team.ready||state.route==='team-tools'||document.querySelector('.v115-context-card'))return;const item=currentContextItem();if(!item)return;const rev=tableRows('LabReviews').filter(r=>r.InventoryType===item.inventoryType&&String(r.ItemCode)===String(item.code)).sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)),alts=alternativesFor(item);
    const card=document.createElement('div');card.className='card card-pad v115-context-card';card.innerHTML=`<div class="v115-card-title"><div><h3 class="section-title">Outils équipe</h3><p class="subtitle">Mémoire expérimentale et actions liées à cette référence.</p></div><span class="pill neutral">${rev.length} retour${rev.length>1?'s':''}</span></div><div class="v115-context-actions"><button class="btn btn-primary" data-v115-ctx-review>+ Retour expérimental</button><button class="btn" data-v115-ctx-order>Ajouter à commander</button><button class="btn" data-v115-ctx-alt>Alternatives (${alts.length})</button></div>${rev[0]?`<div style="margin-top:12px">${reviewCard(rev[0])}</div>`:''}`;document.querySelector('#content')?.appendChild(card);card.querySelector('[data-v115-ctx-review]').onclick=()=>showReviewModal(item);card.querySelector('[data-v115-ctx-order]').onclick=()=>showOrderModal(item);card.querySelector('[data-v115-ctx-alt]').onclick=()=>showAlternatives(item);
  }

  function bindVialPanelUsage(){
    if(typeof renderVialPanel!=='function'||team._vialWrapped)return;const base=renderVialPanel;renderVialPanel=function(pos){base(pos);requestAnimationFrame(()=>{const panel=document.querySelector('#vialPanel');if(!panel||panel.querySelector('[data-v115-vialuse]'))return;const v=rows(state.data.Vials||[]).find(x=>Number(x.id)===Number(pos?.Vial));if(!v)return;const b=document.createElement('button');b.className='btn';b.style.cssText='width:100%;margin-top:8px';b.dataset.v115Vialuse='1';b.textContent='Utilisation / lot';b.onclick=()=>{const code=v.Code||`V-${v.id}`;const u=allUnits().find(x=>x.inventoryType==='primary_antibody'&&String(x.unitCode)===String(code));if(!u)return toast('Vial introuvable.');team.selectedUnitKey=unitKey(u);team.tab='usage';go('team-tools');};panel.appendChild(b);});};team._vialWrapped=true;
  }

  function renderTeamTools(){
    if(!state?.connected){shell('<div class="card card-pad"><div class="v115-warn">Les outils d’équipe nécessitent la connexion au document Grist.</div></div>');return;}
    if(!team.ready){shell(team.loading?loadingHtml():setupHtml());if(!team.loading&&!team.checked)refreshTeamData().then(()=>{if(state.route==='team-tools')renderTeamTools();});document.querySelector('#v115Init')?.addEventListener('click',initTeamSchema);return;}
    let body='';switch(team.tab){case'search':body=searchHtml();break;case'panel':body=panelHtml();break;case'reviews':body=reviewsHtml();break;case'usage':body=usageHtml();break;case'orders':body=ordersHtml();break;case'inventory':body=inventoryHtml();break;case'microscopes':body=microscopesHtml();break;case'labels':body=labelsHtml();break;default:body=overviewHtml();}
    shell(body);switch(team.tab){case'search':bindSearch();break;case'panel':bindPanel();break;case'reviews':bindReviews();break;case'usage':bindUsage();break;case'orders':bindOrders();break;case'inventory':bindInventory();break;case'microscopes':bindMicroscopes();break;case'labels':bindLabels();break;default:bindOverview();}
  }

  function installRoute(){
    try{if(typeof navItems!=='undefined'&&!navItems.some(x=>x[0]==='team-tools')){const idx=navItems.findIndex(x=>x[0]==='alerts');navItems.splice(idx>=0?idx:navItems.length,0,['team-tools','⚗','Outils équipe']);}}catch(err){console.warn('v11.5 nav:',err);}
    if(typeof render==='function'&&!team._renderWrapped){const base=render;render=function(){if(state.route==='team-tools'){renderNav();renderTeamTools();return;}const out=base.apply(this,arguments);requestAnimationFrame(injectContextCard);return out;};team._renderWrapped=true;}
    bindVialPanelUsage();
  }
  function installObserver(){if(team._observer)return;let scheduled=false;team._observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;try{injectContextCard();}catch(err){console.warn('v11.5 context:',err);}});});team._observer.observe(document.body,{childList:true,subtree:true});}
  async function bootstrap(){installRoute();installObserver();let n=0;const wait=async()=>{n++;if(state?.connected){await refreshTeamData();injectContextCard();return;}if(n<40)setTimeout(wait,250);};wait();}

  team.refresh=refreshTeamData;team.initSchema=initTeamSchema;team.render=renderTeamTools;team.allItems=allItems;team.allUnits=allUnits;team.qrMatrix=qrMatrix;team.qrSvg=qrSvg;team.resolveScan=resolveScan;
  bootstrap();
})();
