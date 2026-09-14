// Canonical schema from schema.md and storage-migration.js. No mutation API.
export const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const palette={mouse:{label:'Souris',color:'#f1e96b'},rabbit:{label:'Lapin',color:'#a5e7ee'},goat:{label:'Chèvre',color:'#f5a2aa'},chicken:{label:'Poulet',color:'#bd95ee'},unknown:{label:'Non renseigné',color:'#d4dce3'}};
export function hostKey(value){const n=normalize(value);return ({mouse:'mouse',souris:'mouse',rabbit:'rabbit',lapin:'rabbit',goat:'goat',chevre:'goat',chicken:'chicken',poulet:'chicken'})[n]||'unknown';}
export function tableRows(table){if(!table||!Array.isArray(table.id))throw Error('Réponse Grist invalide : identifiants de lignes manquants.');return table.id.map((id,i)=>Object.fromEntries(Object.entries(table).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v[i]])));}
export function slotParts(slot){const m=/^([A-J])(10|[1-9])$/.exec(String(slot||'').trim().toUpperCase());return m?{row:m[1].charCodeAt(0)-65,col:Number(m[2])-1,slot:m[0]}:null;}
export function rawLabel(vial){return String(vial?.Comments||'').split(/Valeur source:\s*\n/)[1]?.trim()||'';}
export function buildInventory(tables){
 const required={Antibodies:['Name','HostSpecies','CatalogNumber','Supplier'],Vials:['Antibody','FillStatus','Status'],Boxes:['Name','Rows','Columns'],Positions:['Box','Slot','Vial','Available']};
 for(const [name,cols] of Object.entries(required)){if(!tables[name])throw Error(`Table ${name} absente. Aucune migration ne sera lancée.`);for(const col of cols)if(!Object.hasOwn(tables[name],col))throw Error(`Colonne ${name}.${col} absente. Vérifier le schéma du document.`);}
 const data=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,tableRows(v)]));
 const antibodies=new Map(data.Antibodies.map(a=>[Number(a.id),a])),vials=new Map(data.Vials.map(v=>[Number(v.id),v]));
 const warnings=[],seenVials=new Set();
 const boxes=data.Boxes.map(box=>{
  const positions=data.Positions.filter(p=>Number(p.Box)===Number(box.id)),slots=new Map();
  for(const p of positions){const parts=slotParts(p.Slot);if(!parts){warnings.push(`${box.Name} : position invalide « ${p.Slot} ».`);continue;}if(slots.has(parts.slot)){warnings.push(`${box.Name} : plusieurs lignes pour ${parts.slot}.`);continue;}
   const occupied=Number(p.Vial)>0,v=vials.get(Number(p.Vial)),a=antibodies.get(Number(v?.Antibody)),source=rawLabel(v),host=hostKey(a?.HostSpecies||source.split('\n').find(l=>hostKey(l)!=='unknown'));
   if(occupied&&!v)warnings.push(`${box.Name} / ${parts.slot} : vial référencé introuvable.`);
   if(occupied&&seenVials.has(Number(p.Vial)))warnings.push(`${v?.Code||p.Vial} est référencé par plusieurs positions.`);
   if(occupied)seenVials.add(Number(p.Vial));
   if(occupied&&normalize(v?.Status)==='archive')warnings.push(`${box.Name} / ${parts.slot} : vial archivé encore localisé.`);
   slots.set(parts.slot,{...p,...parts,occupied,vial:v,antibody:a,host,color:palette[host].color,label:a?.Name||source.split('\n')[0]||v?.Code||(occupied?'Vial non relié':'Libre'),source,blocked:!occupied&&p.Available!==true});
  }
  const capacity=Number(box.Rows)*Number(box.Columns);if(Number(box.Rows)!==10||Number(box.Columns)!==10)warnings.push(`${box.Name} : format ${box.Rows} × ${box.Columns}, la scène 3D attend 10 × 10.`);
  if(slots.size!==capacity)warnings.push(`${box.Name} : ${slots.size} positions lisibles sur ${capacity}.`);
  return {...box,slots,capacity,occupied:positions.filter(p=>Number(p.Vial)>0).length};
 });
 return {...data,boxes,antibodies,vials,warnings};
}
export async function readInventory(api){const names=await api.listTables();const required=['Antibodies','Vials','Boxes','Positions'];for(const n of required)if(!names.includes(n))throw Error(`Table ${n} absente. Ouvre le document contenant les données déjà migrées.`);const pairs=await Promise.all([...required,...(names.includes('History')?['History']:[])].map(async n=>[n,await api.fetchTable(n)]));return buildInventory(Object.fromEntries(pairs));}
