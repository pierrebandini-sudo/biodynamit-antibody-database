/* BioDynaMit Phase 2 TEST — explicit data service. No persistent storage,
 * credentials, schema changes or API monkey-patching. Grist remains authoritative.
 * Atomic publication is client-side; this is NOT a server lock/transactional read.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BioDynaMitDataEnginePhase2=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  function equal(a,b){
    if(Object.is(a,b))return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)!==Array.isArray(b))return false;
    if(Array.isArray(a)){
      if(a.length!==b.length)return false;
      // Grist RPC transports dense JSON arrays. Avoid allocating two lists
      // of thousands of numeric property names for every column comparison.
      for(let i=0;i<a.length;i++)if(!equal(a[i],b[i]))return false;
      return true;
    }
    const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
    for(const key of keys)if(!Object.prototype.hasOwnProperty.call(b,key)||!equal(a[key],b[key]))return false;
    return true;
  }
  function asRows(table){
    if(Array.isArray(table))return table;
    if(Array.isArray(table?.records))return table.records;
    if(!table||typeof table!=='object')throw Error('Réponse de table invalide.');
    const keys=Object.keys(table),n=Array.isArray(table.id)?table.id.length:0;
    return Array.from({length:n},(_,i)=>Object.fromEntries(keys.map(k=>[k,table[k]?.[i]])));
  }
  function validTable(table,name){
    if(!table||typeof table!=='object')throw Error(`Réponse Grist invalide : ${name}`);
    if(!Array.isArray(table)&&!Array.isArray(table.records)&&!Array.isArray(table.id))throw Error(`Colonne id absente : ${name}`);
    return table;
  }
  class ConflictError extends Error{constructor(message){super(message);this.name='ConflictError';}}
  class UnconfirmedWrite extends Error{constructor(message){super(message);this.name='UnconfirmedWrite';}}

  class DependencyGraph{
    constructor(){this.verified=false;this.reason='Métadonnées non lues';this.tables=new Map();this.columns=new Map();this.edges=new Map();this.incoming=new Map();this.dynamic=[];this.signature='';}
    build(tableData,columnData,visible){
      const tables=asRows(tableData),columns=asRows(columnData),known=new Set(visible);
      const byRef=new Map(tables.filter(t=>t.tableId&&known.has(t.tableId)).map(t=>[Number(t.id),t.tableId]));
      if([...known].some(t=>![...byRef.values()].includes(t)))throw Error('Métadonnées de tables incomplètes');
      this.tables=new Map(tables.filter(t=>known.has(t.tableId)).map(t=>[t.tableId,t]));this.columns=new Map();this.edges=new Map();this.incoming=new Map();this.dynamic=[];
      const addEdge=(source,dest)=>{if(!this.edges.has(source))this.edges.set(source,new Set());this.edges.get(source).add(dest);};
      for(const c of columns){
        const owner=byRef.get(Number(c.parentId));if(!owner)continue;
        if(!c.colId||!c.type)throw Error(`Métadonnées de colonne incomplètes : ${owner}`);
        if(!this.columns.has(owner))this.columns.set(owner,new Map());this.columns.get(owner).set(c.colId,c);
        const ref=/^Ref(?:List)?:(.+)$/.exec(String(c.type||''));
        if(ref){
          if(!known.has(ref[1]))this.dynamic.push({table:owner,column:c.colId,reason:'cible de référence inaccessible'});
          else{addEdge(ref[1],owner);if(!this.incoming.has(ref[1]))this.incoming.set(ref[1],[]);this.incoming.get(ref[1]).push({table:owner,column:c.colId,list:String(c.type).startsWith('RefList:')});}
        }
      }
      for(const t of tables){const source=byRef.get(Number(t.summarySourceTable));if(source&&known.has(t.tableId))addEdge(source,t.tableId);}
      // We only certify a deliberately restricted, statically resolvable formula
      // language. Imports, indirect names, custom Python and ambiguous formulas
      // force a full-read fallback. No heuristic is accepted as a complete graph.
      const safeFunctions=new Set(['SUM','MIN','MAX','AVERAGE','COUNT','COUNTA','IF','IFERROR','ABS','ROUND','FLOOR','CEILING','len','sum','min','max','round','abs','bool','str','int','float','any','all']);
      const safeWords=new Set(['True','False','None','and','or','not','if','else','in','return','rec','id']);
      for(const [owner,cols] of this.columns)for(const c of cols.values()){
        const formula=String(c.formula||'').trim();if(!formula)continue; // include trigger formulas too
        const stripped=formula.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'0');
        let ambiguous=/[\[\]{};#`\\]|\b(?:import|from|lambda|def|class|for|while|eval|exec|getattr|globals|locals|__\w*)\b/.test(stripped);
        const selfRefs=[...stripped.matchAll(/\$([A-Za-z_]\w*)/g)].map(x=>x[1]);
        for(const name of selfRefs)if(name!=='id'&&!cols.has(name))ambiguous=true;
        const normalized=stripped.replace(/\$[A-Za-z_]\w*/g,'rec');
        for(const m of normalized.matchAll(/[A-Za-z_]\w*/g)){
          const name=m[0],before=normalized.slice(0,m.index).trimEnd(),after=normalized.slice(m.index+name.length).trimStart();
          if(before.endsWith('.')){if(after.startsWith('(')&&!['lookupRecords','lookupOne'].includes(name))ambiguous=true;continue;}
          if(known.has(name)){addEdge(name,owner);continue;}
          if(safeWords.has(name)||safeFunctions.has(name)||after.startsWith('='))continue;
          ambiguous=true;
        }
        if(ambiguous)this.dynamic.push({table:owner,column:c.colId,reason:'formule non certifiable statiquement'});
      }
      for(const table of known)if(!this.columns.has(table))throw Error(`Colonnes non inspectables : ${table}`);
      this.verified=true;this.reason=this.dynamic.length?'Formules/références ambiguës : relecture complète':'Métadonnées inspectées';
      this.signature=JSON.stringify([tables.map(t=>[t.id,t.tableId,t.summarySourceTable]),columns.map(c=>[c.id,c.parentId,c.colId,c.type,c.isFormula,c.formula,c.recalcWhen])]);
      return this;
    }
    affected(touched,loaded){
      if(!this.verified||this.dynamic.length)return [...new Set([...loaded,...touched])];
      const seen=new Set(touched),queue=[...touched];
      for(let i=0;i<queue.length;i++)for(const t of this.edges.get(queue[i])||[])if(!seen.has(t)){seen.add(t);queue.push(t);}
      return [...seen];
    }
    report(){return {verified:this.verified,reason:this.reason,ambiguous:this.dynamic.slice(),edges:[...this.edges].map(([source,dests])=>({source,dependents:[...dests]})),tables:this.tables.size,columns:[...this.columns.values()].reduce((n,c)=>n+c.size,0)};}
  }

  class DataService{
    constructor({api,publish=()=>{},onError=()=>{},clock=()=>performance.now(),requestTimeoutMs=30000,yieldTask=async()=>{}}){
      this.api=api;this.publish=publish;this.onError=onError;this.clock=clock;
      this.yieldTask=yieldTask;
      this.requestTimeoutMs=requestTimeoutMs;
      this.snapshots=new Map();this.indices=new Map();this.epochs=new Map();this.inFlight=new Map();this.dirty=new Set();this.errors=new Map();this.catalogue=null;this.cataloguePromise=null;
      this.registered=new Set();this.graph=new DependencyGraph();this.listeners=new Set();this.activeNative=new Set();this.activeOperation=false;this.writeTail=Promise.resolve();this.modal=null;this.refreshCounter=0;this.metrics=[];this.pendingExternal=new Set();this.lastSync=0;this.closed=false;
      this.recordIndices=new WeakMap();this.codeIndices=new WeakMap();this.viewBaseline=null;
      this.readSequence=0;this.publishedReads=new Map();
    }
    epoch(name){return this.epochs.get(name)||0;}
    invalidate(names){for(const name of names){this.epochs.set(name,this.epoch(name)+1);this.dirty.add(name);}}
    register(names){for(const n of names)this.registered.add(n);}
    async listTables({fresh=false}={}){
      if(this.catalogue&&!fresh)return this.catalogue.slice();
      if(!this.cataloguePromise)this.cataloguePromise=this._measure('listTables','',()=>this.api.listTables()).then(x=>{
        if(!Array.isArray(x))throw Error('Liste des tables invalide');
        this.catalogue=[...new Set(x.filter(t=>typeof t==='string'&&t))];
        for(const name of this.snapshots.keys())if(!this.catalogue.includes(name)){
          const error=Error(`Table devenue inaccessible ou absente : ${name}`);this.errors.set(name,error);this.dirty.add(name);this.onError(error,[name]);
        }
        this.publish({},{reason:'catalogue',changed:[]});return this.catalogue;
      }).finally(()=>{this.cataloguePromise=null});
      return (await this.cataloguePromise).slice();
    }
    async _measure(kind,table,run){
      const t=this.clock();let timer;
      try{
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(kind==='applyUserActions'?new UnconfirmedWrite('Délai Grist dépassé : résultat de l’écriture inconnu. Ne pas répéter automatiquement ; actualiser et vérifier les données.'):Error(`Délai Grist dépassé : ${table||kind}.`)),this.requestTimeoutMs);});
        const value=await Promise.race([Promise.resolve().then(run),timeout]);this._log({kind,table,ms:this.clock()-t,ok:true});return value;
      }catch(error){this._log({kind,table,ms:this.clock()-t,ok:false});throw error;}
      finally{clearTimeout(timer);}
    }
    _log(value){this.metrics.push(value);if(this.metrics.length>1000)this.metrics.splice(0,200);}
    async _read(name){
      for(let attempt=0;attempt<4;attempt++){
        const epoch=this.epoch(name),key=JSON.stringify([name,epoch]);let request=this.inFlight.get(key);
        if(!request){request=this._measure('fetchTable',name,async()=>validTable(await this.api.fetchTable(name),name));request.readSequence=++this.readSequence;this.inFlight.set(key,request);request.finally(()=>{if(this.inFlight.get(key)===request)this.inFlight.delete(key)}).catch(()=>{});}
        try{const data=await request;if(epoch!==this.epoch(name))continue;return {name,data,epoch,serial:request.readSequence};}
        catch(error){if(epoch!==this.epoch(name))continue;throw error;}
      }
      throw new ConflictError(`Modifications répétées pendant la lecture de ${name}. Réessayer une actualisation.`);
    }
    async auditSchema(){
      const old=this.graph.signature;
      try{
        let visible=await this.listTables();
        const [t,c]=await Promise.all([this._read('_grist_Tables'),this._read('_grist_Tables_column')]);
        const listed=asRows(t.data).map(x=>x.tableId).filter(Boolean);
        if(listed.some(n=>!visible.includes(n))||visible.some(n=>!listed.includes(n)))visible=await this.listTables({fresh:true});
        const graphStart=this.clock();const graph=new DependencyGraph().build(t.data,c.data,visible);this.graph=graph;
        for(const [source,dest] of this.applicationEdges||[])if(visible.includes(source)&&visible.includes(dest)){
          if(!graph.edges.has(source))graph.edges.set(source,new Set());graph.edges.get(source).add(dest);
        }
        this._log({kind:'schemaAnalysis',table:'',ms:this.clock()-graphStart,ok:true});
        if(old&&old!==graph.signature){this.invalidate([...this.snapshots.keys()]);this.catalogue=null;await this.listTables({fresh:true});}
      }catch(error){this.graph=new DependencyGraph();this.graph.reason='Métadonnées indisponibles : relecture complète';this._log({kind:'schemaFallback',table:'',ms:0,ok:false});}
      return this.graph;
    }
    async ensure(names,{fresh=false,reason='ensure',optional=false,publish=true}={}){
      const present=new Set(await this.listTables());
      const unavailable=[...new Set(names)].filter(n=>!present.has(n)&&this.snapshots.has(n));
      if(unavailable.length&&!optional)throw Error(`Tables devenues inaccessibles : ${unavailable.join(', ')}`);
      const wanted=[...new Set(names)].filter(n=>present.has(n));
      const needed=wanted.filter(n=>fresh||this.dirty.has(n)||!this.snapshots.has(n));
      if(!needed.length)return {changed:[],tables:wanted};
      for(let attempt=0;attempt<3;attempt++){
        const results=await Promise.allSettled(needed.map(n=>this._read(n)));const pairs=[],failures=[];
        for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled')pairs.push(r.value);else failures.push({table:needed[i],error:r.reason});}
        if(failures.length&&!optional){for(const f of failures)this.errors.set(f.table,f.error);const error=new Error(`Lecture Grist incomplète (${failures.map(x=>x.table).join(', ')}) : ${failures[0].error.message||failures[0].error}`);this.onError(error,failures.map(f=>f.table));throw error;}
        const obsolete=()=>pairs.some(p=>p.epoch!==this.epoch(p.name)||p.serial<(this.publishedReads.get(p.name)||0));
        if(obsolete())continue;
        const staged=new Map();let transformMs=0;
        for(const {name,data} of pairs){
          const t=this.clock(),previous=this.snapshots.get(name),different=!previous||!equal(previous,data);transformMs+=this.clock()-t;
          if(different){const prepared=await this._prepareCopies(data,previous);staged.set(name,prepared);transformMs+=prepared.cpuMs;}
        }
        // Preparation can yield. No partial snapshot may escape, and an older
        // read must never overtake a newer publication from the same epoch.
        if(obsolete())continue;
        const changed=[],published={},commitStart=this.clock();
        for(const {name,serial} of pairs){
          this.errors.delete(name);this.dirty.delete(name);this.publishedReads.set(name,serial);
          const prepared=staged.get(name);
          if(prepared){this.snapshots.set(name,prepared.raw);this.indices.delete(name);published[name]=prepared.view;changed.push(name);}
        }
        for(const f of failures)this.errors.set(f.table,f.error);
        // The commit is synchronous after all reads have succeeded. It does not
        // assert a server-wide transaction across fetchTable RPCs.
        if(publish&&changed.length)this.publish(published,{reason,changed});
        if(changed.length)for(const fn of this.listeners)fn({reason,changed});
        this._log({kind:'publishTransform',table:needed.join(','),ms:transformMs+this.clock()-commitStart,ok:true,changed:changed.length});
        this.refreshCounter++;return {changed,tables:wanted,failures};
      }
      throw new ConflictError('Les tables ont changé pendant leur lecture. Actualisation reportée.');
    }
    async _prepareCopies(data,previous){
      let sliceStart=this.clock(),cpuMs=0;
      if(Array.isArray(data)||Array.isArray(data.records)||!Array.isArray(data.id))return {raw:clone(data),view:clone(data),cpuMs:this.clock()-sliceStart};
      const raw=[],view=[];
      for(const [key,column] of Object.entries(data)){
        const value=previous&&Object.prototype.hasOwnProperty.call(previous,key)&&equal(previous[key],column)?previous[key]:clone(column);
        raw.push([key,value]);view.push([key,clone(value)]);
        if(this.clock()-sliceStart>=8){cpuMs+=this.clock()-sliceStart;await this.yieldTask();sliceStart=this.clock();}
      }
      const result={raw:Object.fromEntries(raw),view:Object.fromEntries(view)};
      return {...result,cpuMs:cpuMs+this.clock()-sliceStart};
    }
    async readTable(name,{fresh=false}={}){
      const present=await this.listTables();if(!present.includes(name))throw Error(`Table Grist absente : ${name}`);
      if(!fresh&&this.errors.has(name)&&!this.dirty.has(name))throw this.errors.get(name);
      await this.ensure([name],{fresh,reason:'readTable'});
      return clone(this.snapshots.get(name));
    }
    tableRows(name){
      if(!this.indices.has(name)){const t=this.clock();const rows=asRows(this.snapshots.get(name)||{id:[]});this.indices.set(name,{rows,byId:new Map(rows.map(r=>[Number(r.id),r]))});this._log({kind:'indexTransform',table:name,ms:this.clock()-t,ok:true});}
      return this.indices.get(name);
    }
    recordById(name,id){
      return this._record(this.snapshots.get(name),id);
    }
    _record(data,id){
      if(!data)return undefined;
      if(Array.isArray(data)||Array.isArray(data.records)){
        if(!this.recordIndices.has(data))this.recordIndices.set(data,new Map(asRows(data).map(row=>[Number(row.id),row])));
        return this.recordIndices.get(data).get(Number(id));
      }
      let index=this.recordIndices.get(data);
      if(!index){index=new Map(data.id.map((v,i)=>[Number(v),i]));this.recordIndices.set(data,index);}
      const i=index.get(Number(id));if(i===undefined)return undefined;
      return Object.fromEntries(Object.keys(data).map(k=>[k,data[k]?.[i]]));
    }
    _hasCode(data,code){
      if(!data)return false;
      if(!this.codeIndices.has(data)){
        const codes=Array.isArray(data)||Array.isArray(data.records)?asRows(data).map(r=>r.Code):(data.Code||[]);
        this.codeIndices.set(data,new Set(codes.map(String)));
      }
      return this.codeIndices.get(data).has(String(code));
    }
    onChange(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
    captureView(){this.viewBaseline=new Map(this.snapshots);}
    beginEdit(){if(!this.modal)this.modal={baseline:new Map(this.viewBaseline||this.snapshots)};}
    endEdit(){this.modal=null;}
    get editing(){return !!this.modal;}
    async consume(names){
      const dirty=[...this.dirty];await this.ensure([...new Set([...names,...dirty])],{reason:'consume'});return true;
    }
    async fullRefresh({reason='manual',discover=true}={}){
      if(discover)await this.listTables({fresh:true});await this.auditSchema();
      const names=[...new Set([...this.registered,...this.snapshots.keys()])];
      const security=new Set(['SecurityAdminGate','SecurityEditorGate','PublicSettings','AuditLog','ActivityLog']);
      await this.ensure(names.filter(n=>!security.has(n)),{fresh:true,reason});
      await this.ensure(names.filter(n=>security.has(n)),{fresh:true,reason,optional:true});
      return true;
    }
    _records(actions){
      const records=[];
      for(const action of actions){const [kind,table,ids,fields]=action;
        if(kind==='UpdateRecord'||kind==='RemoveRecord')records.push({kind,table,id:Number(ids),fields:fields||{}});
        else if(kind==='BulkUpdateRecord'||kind==='BulkRemoveRecord')for(let i=0;i<ids.length;i++)records.push({kind:kind==='BulkUpdateRecord'?'UpdateRecord':'RemoveRecord',table,id:Number(ids[i]),fields:fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v[i]])):{}});
      }
      return records;
    }
    _row(table,id,source){
      return this._record(source.get(table),id);
    }
    dataNames(){return [...this.snapshots.keys()].filter(n=>!['SecurityAdminGate','SecurityEditorGate'].includes(n));}
    async prepare(actions){
      await this.auditSchema();const touched=[...new Set(actions.map(a=>String(a[1]||'')).filter(Boolean))];
      if(this.graph.verified)for(const [name,table] of this.snapshots){
        const columns=this.graph.columns.get(name);
        if(!columns||Object.keys(table).some(k=>k!=='id'&&!columns.has(k))){this.graph.verified=false;this.graph.reason='Métadonnées de colonnes partielles : relecture complète';break;}
      }
      const baseline=this.modal?.baseline||this.viewBaseline||new Map(this.snapshots);
      const affected=this.graph.affected(touched,this.dataNames());
      for(const record of this._records(actions))if(record.kind==='RemoveRecord')for(const ref of this.graph.incoming.get(record.table)||[])affected.push(ref.table);
      for(const record of this._records(actions))if(record.kind==='RemoveRecord')for(const ref of this.semanticReferences||[])if(ref.target===record.table)affected.push(ref.table);
      await this.ensure(affected,{fresh:true,reason:'preflight'});
      const transformStart=this.clock();
      const prepared=[];
      for(const action of actions){const [kind,table,ids,fields]=action;
        if(!['UpdateRecord','BulkUpdateRecord','RemoveRecord','BulkRemoveRecord','AddRecord','BulkAddRecord'].includes(kind)){prepared.push(clone(action));continue;}
        if(kind==='RemoveRecord'||kind==='BulkRemoveRecord'){
          const records=this._records([action]);
          for(const r of records){const before=this._row(table,r.id,baseline),latest=this.recordById(table,r.id);if(before&&latest&&!equal(before,latest))throw new ConflictError(`La référence ${table} #${r.id} a changé depuis son ouverture. Suppression annulée.`);}
          prepared.push(clone(action));continue;
        }
        if(kind==='AddRecord'||kind==='BulkAddRecord'){
          const drafts=kind==='AddRecord'?[fields]:ids.map((_,i)=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v[i]])));
          for(const draft of drafts)if(draft.Code){
            const existing=this._hasCode(this.snapshots.get(table),draft.Code);
            const wasThere=this._hasCode(baseline.get(table),draft.Code);
            if(existing&&!wasThere)throw new ConflictError(`Le code ${draft.Code} vient d’être créé par une autre session.`);
          }
          prepared.push(clone(action));continue;
        }
        const updates=this._records([action]);
        for(const update of updates){
          const before=this._row(table,update.id,baseline),latest=this.recordById(table,update.id);
          if(!latest)throw new ConflictError(`L’enregistrement ${table} #${update.id} n’existe plus.`);
          const delta={};
          for(const [field,desired] of Object.entries(update.fields)){
            if(before&&equal(before[field],desired))continue; // preserve another user's unchanged field
            if(before&&!equal(before[field],latest[field])&&!equal(desired,latest[field]))throw new ConflictError(`Conflit dans ${table} #${update.id}, champ ${field}. Les nouvelles données ont été relues.`);
            if(!equal(desired,latest[field]))delta[field]=clone(desired);
          }
          if(Object.keys(delta).length)prepared.push(['UpdateRecord',table,update.id,delta]);
        }
      }
      this._validateReferences(prepared);
      const records=this._records(prepared),removed=new Set(records.filter(r=>r.kind==='RemoveRecord').map(r=>r.table+':'+r.id));
      const updated=new Map(records.filter(r=>r.kind==='UpdateRecord').map(r=>[r.table+':'+r.id,r.fields]));
      for(const r of this._records(prepared))if(r.kind==='RemoveRecord')for(const ref of this.semanticReferences||[])if(ref.target===r.table){
        const target=this.tableRows(r.table).byId.get(r.id);
        const targetKey=target?.[ref.targetColumn||'Code'];
        if(targetKey&&this.tableRows(ref.table).rows.some(source=>{
          if(removed.has(ref.table+':'+source.id))return false;
          const row={...source,...updated.get(ref.table+':'+source.id)};
          return String(row[ref.column]||'')===String(targetKey)&&(!ref.inventoryType||row.InventoryType===ref.inventoryType)&&(!ref.matchInventory||row.InventoryType===target.InventoryType);
        }))throw new ConflictError(`Suppression refusée : ${ref.table}.${ref.column} référence encore ${targetKey}.`);
      }
      this._log({kind:'writeTransform',table:touched.join(','),ms:this.clock()-transformStart,ok:true});
      return {actions:prepared,requested:actions,affected:[...new Set(affected)],baseline};
    }
    _validateReferences(actions){
      const removed=new Set(this._records(actions).filter(r=>r.kind==='RemoveRecord').map(r=>r.table+':'+r.id));
      const updated=new Map(this._records(actions).filter(r=>r.kind==='UpdateRecord').map(r=>[r.table+':'+r.id,r.fields]));
      for(const r of this._records(actions))if(r.kind==='RemoveRecord')for(const ref of this.graph.incoming.get(r.table)||[]){
        for(const source of this.tableRows(ref.table).rows){
          if(removed.has(ref.table+':'+source.id))continue;
          const value=Object.assign({},source,updated.get(ref.table+':'+source.id))[ref.column];
          const linked=ref.list?Array.isArray(value)&&value.slice(value[0]==='L'?1:0).includes(r.id):Number(value)===r.id;
          if(linked)throw new ConflictError(`Suppression refusée : ${ref.table}.${ref.column} référence encore ${r.table} #${r.id}.`);
        }
      }
    }
    async nativeWrite(actions,rawApply){
      if(!actions.length)return {retValues:[]};
      const touched=[...new Set(actions.map(a=>a[1]).filter(Boolean))],before=new Map(this.snapshots);
      this.invalidate(this.graph.affected(touched,this.dataNames()));
      const job=this._measure('applyUserActions','',()=>rawApply(actions));this.activeNative.add(job);
      try{
        const result=await job;this.invalidate(this.graph.affected(touched,this.dataNames()));
        if(actions.some(a=>!['AddRecord','UpdateRecord','RemoveRecord','BulkAddRecord','BulkUpdateRecord','BulkRemoveRecord'].includes(a[0]))){
          // Existing explicit administration operations may change the catalogue.
          // This branch does not create/migrate anything on its own.
          this.catalogue=null;await this.listTables({fresh:true});await this.auditSchema();this.invalidate(this.dataNames());
        }
        if(this.activeOperation)this.writeReceipts.push({actions:clone(actions),result,before});
        else{
          await this.ensure(this.graph.affected(touched,this.dataNames()),{fresh:true,reason:'native-write'});
          this._verify([{actions,result,before}]);
        }
        return result;
      }catch(error){
        this.invalidate(this.graph.affected(touched,this.dataNames()));
        if(!this.activeOperation)try{await this.ensure(this.graph.affected(touched,this.dataNames()),{fresh:true,reason:'native-write-recovery'});}catch(readError){this.onError(readError,touched);}
        throw error;
      }
      finally{this.activeNative.delete(job);}
    }
    async write(actions,worker){
      const run=async()=>{
        this.activeOperation=true;this.writeReceipts=[];let prepared;
        this.showStatus?.('Phase 2 TEST · Enregistrement en cours…');
        try{
          prepared=await this.prepare(actions);
          const result=await worker(prepared.actions);
          if(this.activeNative.size)await Promise.allSettled([...this.activeNative]);
          const touched=[...new Set([...this.dirty,...this.writeReceipts.flatMap(r=>r.actions.map(a=>a[1]))])];
          await this.ensure([...new Set([...prepared.affected,...this.graph.affected(touched,this.dataNames())])],{fresh:true,reason:'write-confirmation'});
          this._verify(this.writeReceipts);
          this.captureView();this.lastWriteAt=this.clock();
          this.showStatus?.('Phase 2 TEST · Enregistrement confirmé après relecture'+(this.graph.verified&&!this.graph.dynamic.length?'':' · Mode complet'));
          // Give the browser a task boundary before the legacy form handler
          // builds the next view; do not combine readback copying and rendering.
          await this.yieldTask();
          return result;
        }catch(error){
          try{if(this.dirty.size)await this.ensure([...this.dirty],{fresh:true,reason:'write-recovery'});}catch(readError){this.onError(readError,[...this.dirty]);}
          this.onError(error,[]);throw error;
        }finally{this.activeOperation=false;this.writeReceipts=[];this.lastWriteAt=this.clock();}
      };
      const job=this.writeTail.then(run,run);this.writeTail=job.catch(()=>{});return job;
    }
    _verify(receipts){
      const transformStart=this.clock();
      // Compare the final intent, including bulk actions and repeated updates.
      const expected=new Map();
      const set=(table,id,fields,remove=false)=>{
        const key=JSON.stringify([table,Number(id)]),previous=expected.get(key);
        expected.set(key,{table,id:Number(id),remove,fields:remove?{}:{...previous?.fields,...fields}});
      };
      for(const receipt of receipts)for(let i=0;i<receipt.actions.length;i++){
        const [kind,table,id,fields]=receipt.actions[i],returned=receipt.result?.retValues?.[i];
        if(kind==='UpdateRecord'||kind==='RemoveRecord')set(table,id,fields,kind==='RemoveRecord');
        if(kind==='BulkUpdateRecord'||kind==='BulkRemoveRecord')for(let j=0;j<id.length;j++)set(table,id[j],fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v[j]])):{},kind==='BulkRemoveRecord');
        if(kind==='AddRecord'||kind==='BulkAddRecord'){
          const drafts=kind==='AddRecord'?[fields||{}]:id.map((_,j)=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v[j]])));
          const ids=kind==='AddRecord'?[returned]:returned;
          for(let j=0;j<drafts.length;j++){
            let rowId=ids?.[j];
            if(typeof rowId!=='number'){
              const before=new Set(asRows(receipt.before.get(table)||{id:[]}).map(r=>r.id));
              const matches=this.tableRows(table).rows.filter(r=>!before.has(r.id)&&Object.entries(drafts[j]).every(([k,v])=>equal(r[k],v)));
              if(matches.length!==1)throw new UnconfirmedWrite(`Identifiant d’ajout non confirmé dans ${table}.`);rowId=matches[0].id;
            }
            set(table,rowId,drafts[j]);
          }
        }
      }
      for(const {table,id,fields,remove} of expected.values()){
        const row=this.recordById(table,id);
        if(remove?!!row:(!row||Object.entries(fields).some(([k,v])=>!equal(row[k],v))))throw new UnconfirmedWrite(`Enregistrement non confirmé dans ${table} #${id}. Les valeurs relues diffèrent de la demande ; aucun verrou serveur n’est supposé.`);
      }
      this._log({kind:'verifyTransform',table:'',ms:this.clock()-transformStart,ok:true});
    }
    async synchronize({names=null,reason='periodic',force=false}={}){
      if(this.activeOperation||this.activeNative.size||this.editing)return {deferred:true,changed:[]};
      const t=this.clock();if(!force&&t-this.lastSync<60000)return {throttled:true,changed:[]};
      this.lastSync=t;
      if(!names){await this.listTables({fresh:true});await this.auditSchema();}
      const requested=names?this.graph.affected(names,this.dataNames()):[...this.snapshots.keys()];
      const security=new Set(['SecurityAdminGate','SecurityEditorGate','PublicSettings','AuditLog','ActivityLog']);
      const a=await this.ensure(requested.filter(n=>!security.has(n)),{fresh:true,reason});
      const b=await this.ensure(requested.filter(n=>security.has(n)),{fresh:true,reason,optional:true});
      this._log({kind:'sync',table:'',ms:this.clock()-t,ok:true,changed:a.changed.length+b.changed.length});
      return {changed:[...a.changed,...b.changed],ms:this.clock()-t};
    }
    diagnostics(){return {version:'Phase2-TEST',loaded:[...this.snapshots.keys()],dirty:[...this.dirty],errors:[...this.errors.keys()],dependencies:this.graph.report(),activeWrites:this.activeNative.size+(this.activeOperation?1:0),metrics:this.metrics.slice()};}
  }
  return {DataService,DependencyGraph,ConflictError,UnconfirmedWrite,equal,asRows};
});
