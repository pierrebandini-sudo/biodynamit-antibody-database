/* BioDynaMit v11.2 — automations, alerts, enrichment queue and configurable scientific watch. */
(function(){
  'use strict';

  const core=window.BioDynaMitCoreV112;
  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  if(!core||!ns){console.error('BioDynaMit v11.2 automation: dependencies missing.');return;}

  const EP_BASE='https://www.ebi.ac.uk/europepmc/webservices/rest/search';
  const AUTO={watch:{loaded:false,loading:false,error:'',exact:[],target:[],method:[],olderLoaded:false,olderLoading:false,olderVisible:false,olderError:'',olderExact:[],olderTarget:[],olderMethod:[],lastRun:null}};

  function e(v){return esc(v);}
  function tr(name){return rows(state.data[name]||ns.data?.[name]);}
  function norm(v){return core.normalizeText(v);}
  function flag(key,fallback=false){return ns.featureEnabled?.(key,fallback)??fallback;}

  function currentYear(){return new Date().getFullYear();}
  function today(){return new Date().toISOString().slice(0,10);}

  function watchProfile(){
    return ns.activeWatchProfile?.('primary_mito')||{Key:'primary_mito',CurrentYearOnly:true,ArchiveYears:2,MaxResults:25};
  }
  function watchTerms(){
    const terms=ns.watchTerms?.('primary_mito')||[];
    return terms.filter(x=>x.Active!==false&&x.Kind==='context').map(x=>String(x.Term||'').trim()).filter(Boolean);
  }
  function scoreWeights(){
    const out={exact_reference:5,same_target:3,mitochondrial_context:2,multiple_matches:1,method_signal:1};
    for(const r of ns.watchScoring?.('primary_mito')||[])if(r.Active!==false&&r.Factor)out[r.Factor]=Number(r.Weight||0);
    return out;
  }
  function contextClause(){
    const terms=watchTerms();
    const use=terms.length?terms:['mitochondria','mitochondrial','mitofusin','cristae','mtDNA'];
    return '('+use.map(x=>`"${String(x).replace(/"/g,'')}"`).join(' OR ')+')';
  }
  function currentDateClause(){
    const p=watchProfile();
    if(p.CurrentYearOnly!==false)return `FIRST_PDATE:[${currentYear()}-01-01 TO ${today()}]`;
    const d=new Date();d.setFullYear(d.getFullYear()-Math.max(1,Number(p.ArchiveYears||2)));
    return `FIRST_PDATE:[${d.toISOString().slice(0,10)} TO ${today()}]`;
  }
  function olderDateClause(){
    const p=watchProfile(),years=Math.max(1,Number(p.ArchiveYears||2)),y=currentYear();
    return `FIRST_PDATE:[${y-years}-01-01 TO ${y-1}-12-31]`;
  }

  async function epSearch(query,pageSize=25){
    const url=`${EP_BASE}?format=json&pageSize=${Math.min(100,Math.max(1,pageSize))}&sort_date:y&resultType=core&query=${encodeURIComponent(query)}`;
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    if(!r.ok)throw Error(`Europe PMC HTTP ${r.status}`);
    const data=await r.json();return data?.resultList?.result||[];
  }

  function pubKey(p){return p.doi||p.pmid||p.pmcid||`${p.title||''}-${p.firstPublicationDate||p.pubYear||''}`;}
  function pubText(p){return [p.title,p.abstractText,p.journalTitle].filter(Boolean).join(' ');}
  function contains(text,value){return String(text||'').toLowerCase().includes(String(value||'').trim().toLowerCase());}
  function publicationLink(p){
    if(p.doi)return `https://doi.org/${encodeURIComponent(p.doi)}`;
    if(p.pmid)return `https://europepmc.org/article/MED/${encodeURIComponent(p.pmid)}`;
    if(p.pmcid)return `https://europepmc.org/article/PMC/${encodeURIComponent(p.pmcid)}`;
    return '';
  }
  function methodSignals(p){
    const text=String(pubText(p)).toLowerCase();
    const markers=['live-cell','live cell','fluorescent protein','gfp','egfp','mcherry','reporter','biosensor','probe','dye','stain','crispr','knock-in','tagging','proximity labeling','apex','turboid','mass spectrometry','proteomics','super-resolution','sted','sim','expansion microscopy','electron microscopy','nanobody','aptamer','label-free'];
    return markers.filter(x=>text.includes(x));
  }
  function antibodySignals(p){
    const text=String(pubText(p)).toLowerCase();
    return ['antibody','antibodies','immunofluorescence','immunoblot','western blot','immunostaining','immunohistochemistry','immunoprecipitation'].filter(x=>text.includes(x));
  }
  function contextSignal(p){const text=String(pubText(p)).toLowerCase();return watchTerms().some(t=>text.includes(String(t).toLowerCase()));}

  function primaryStock(){
    const effective=a=>{try{return String(window.BioDynaMitV111?.effectiveTarget?.(a)||a.Target||'').trim();}catch(_){return String(a.Target||'').trim();}};
    return tr('Antibodies').map(a=>({id:Number(a.id),code:a.Code||`AB-${a.id}`,name:a.Name||a.FullName||a.Code,ref:String(a.CatalogNumber||'').trim(),target:effective(a),supplier:a.Supplier||'',website:a.Website||''}));
  }

  function uniqueBy(list,key){const seen=new Set();return list.filter(x=>{const k=key(x);if(!k||seen.has(k))return false;seen.add(k);return true;});}
  function splitBatches(items,term,max=900){
    const out=[];let cur=[],size=0;
    for(const x of items){const s=term(x);if(cur.length&&size+s.length+4>max){out.push(cur);cur=[];size=0;}cur.push(x);size+=s.length+4;}
    if(cur.length)out.push(cur);return out;
  }
  function scorePub(p,kind,count=1){
    const w=scoreWeights();let s=0;
    if(kind==='exact')s+=Number(w.exact_reference||0);
    if(kind==='target'||kind==='method')s+=Number(w.same_target||0);
    if(contextSignal(p))s+=Number(w.mitochondrial_context||0);
    if(count>1)s+=Number(w.multiple_matches||0);
    if(kind==='method'&&methodSignals(p).length)s+=Number(w.method_signal||0);
    return s;
  }

  async function watchSearchExact(stock,dateClause){
    const refs=uniqueBy(stock.filter(x=>x.ref&&x.ref.length>=3),x=>norm(x.ref));
    const map=new Map();
    for(const batch of splitBatches(refs,x=>`"${x.ref.replace(/"/g,'')}"`).slice(0,12)){
      const clause='('+batch.map(x=>`"${x.ref.replace(/"/g,'')}"`).join(' OR ')+')';
      const pubs=await epSearch(`${dateClause} AND ${contextClause()} AND ${clause}`,50);
      for(const p of pubs){
        const matches=batch.filter(x=>contains(pubText(p),x.ref));if(!matches.length)continue;
        const k=pubKey(p),old=map.get(k);
        if(old){old.matches=uniqueBy([...old.matches,...matches],x=>norm(x.ref));old.score=scorePub(old,'exact',old.matches.length);}
        else map.set(k,{...p,kind:'exact',matches,score:scorePub(p,'exact',matches.length)});
      }
    }
    return [...map.values()];
  }

  async function watchSearchTargets(stock,dateClause,exactKeys){
    const targets=uniqueBy(stock.filter(x=>x.target&&x.target.length>=2),x=>norm(x.target));
    const map=new Map();
    for(const batch of splitBatches(targets,x=>`"${x.target.replace(/"/g,'')}"`).slice(0,12)){
      const clause='('+batch.map(x=>`"${x.target.replace(/"/g,'')}"`).join(' OR ')+')';
      const pubs=await epSearch(`${dateClause} AND ${contextClause()} AND ${clause}`,50);
      for(const p of pubs){
        const k=pubKey(p);if(exactKeys.has(k))continue;
        const text=pubText(p),matches=batch.filter(x=>contains(text,x.target));if(!matches.length)continue;
        const methods=methodSignals(p),abs=antibodySignals(p),kind=(methods.length&&!abs.length)?'method':'target';
        const old=map.get(k);
        if(old){old.matches=uniqueBy([...old.matches,...matches],x=>norm(x.target));old.methods=uniqueBy([...(old.methods||[]),...methods],x=>x);if(old.kind!=='target'&&kind==='target')old.kind='target';old.score=scorePub(old,old.kind,old.matches.length);}
        else map.set(k,{...p,kind,matches,methods,score:scorePub(p,kind,matches.length)});
      }
    }
    return [...map.values()];
  }

  function sortNewest(a,b){return core.publicationDateValue(b)-core.publicationDateValue(a)||Number(b.score||0)-Number(a.score||0);}
  async function runWatch(dateClause){
    const stock=primaryStock(),exact=await watchSearchExact(stock,dateClause),keys=new Set(exact.map(pubKey));
    const alternatives=await watchSearchTargets(stock,dateClause,keys);
    const max=Math.max(5,Number(watchProfile().MaxResults||25));
    return {exact:exact.sort(sortNewest).slice(0,max),target:alternatives.filter(x=>x.kind==='target').sort(sortNewest).slice(0,max),method:alternatives.filter(x=>x.kind==='method').sort(sortNewest).slice(0,max)};
  }

  async function refreshWatch(){
    if(AUTO.watch.loading)return;
    AUTO.watch.loading=true;AUTO.watch.error='';AUTO.watch.exact=[];AUTO.watch.target=[];AUTO.watch.method=[];renderJournal();
    try{const r=await runWatch(currentDateClause());AUTO.watch.exact=r.exact;AUTO.watch.target=r.target;AUTO.watch.method=r.method;AUTO.watch.loaded=true;AUTO.watch.lastRun=new Date();}
    catch(err){console.error(err);AUTO.watch.error=err.message||String(err);}
    finally{AUTO.watch.loading=false;renderJournal();}
  }
  async function toggleOlder(){
    if(AUTO.watch.olderLoaded){AUTO.watch.olderVisible=!AUTO.watch.olderVisible;renderJournal();return;}
    if(AUTO.watch.olderLoading)return;
    AUTO.watch.olderLoading=true;AUTO.watch.olderVisible=true;AUTO.watch.olderError='';renderJournal();
    try{const r=await runWatch(olderDateClause());AUTO.watch.olderExact=r.exact;AUTO.watch.olderTarget=r.target;AUTO.watch.olderMethod=r.method;AUTO.watch.olderLoaded=true;}
    catch(err){AUTO.watch.olderError=err.message||String(err);}
    finally{AUTO.watch.olderLoading=false;renderJournal();}
  }

  function rel(score){if(score>=7)return{label:'Très pertinent',cl:'ok'};if(score>=5)return{label:'Pertinent',cl:'warn'};return{label:'À explorer',cl:'neutral'};}
  function pubDate(p){const ts=core.publicationDateValue(p);return ts?new Date(ts).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):String(p.firstPublicationDate||p.pubYear||'Date inconnue');}
  function pubCard(p){
    const r=rel(Number(p.score||0)),rec=core.publicationRecency(p),link=publicationLink(p);
    const recClass=rec.key==='very_recent'?'ok':rec.key==='recent'?'warn':'neutral';
    let why='';
    if(p.kind==='exact')why='Référence exacte détectée : '+(p.matches||[]).map(x=>`${x.name} (${x.ref})`).join(', ');
    if(p.kind==='target')why='Même cible : '+(p.matches||[]).map(x=>`${x.name} → ${x.target}`).join(', ');
    if(p.kind==='method')why='Alternative méthodologique autour de : '+(p.matches||[]).map(x=>`${x.name} → ${x.target}`).join(', ');
    return `<article class="card card-pad v112-pub">
      <div class="row space-between" style="align-items:flex-start;gap:12px"><div>
        <div class="row" style="gap:7px;flex-wrap:wrap"><span class="pill ${recClass}">${rec.key==='very_recent'?'🆕 ':''}${e(rec.label)}</span><span class="pill ${r.cl}">${e(r.label)}</span><span class="pill neutral">Score ${Number(p.score||0)}</span></div>
        <div class="v112-pub-date">📅 ${e(pubDate(p))}</div><h3>${e(p.title||'Publication sans titre')}</h3>
        <p class="subtitle">${e(p.authorString||'Auteurs non renseignés')} · ${e(p.journalTitle||'Journal non renseigné')}</p>
      </div>${link?`<a class="btn btn-sm" href="${e(link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:''}</div>
      <p><b>Pourquoi :</b> ${e(why)}</p>
      ${(p.methods||[]).length?`<p><b>Méthodes détectées :</b> ${e((p.methods||[]).slice(0,5).join(', '))}</p>`:''}
      ${p.abstractText?`<p class="subtitle">${e(String(p.abstractText).slice(0,500))}${String(p.abstractText).length>500?'…':''}</p>`:''}
    </article>`;
  }
  function pubList(list,empty,older=false){
    const loading=older?AUTO.watch.olderLoading:AUTO.watch.loading,error=older?AUTO.watch.olderError:AUTO.watch.error,loaded=older?AUTO.watch.olderLoaded:AUTO.watch.loaded;
    if(loading)return '<div class="empty">Recherche des publications…</div>';if(error)return `<div class="banner error">${e(error)}</div>`;if(!loaded)return '<div class="empty">Clique sur « Actualiser la veille ».</div>';if(!list.length)return `<div class="empty">${e(empty)}</div>`;return list.map(pubCard).join('');
  }

  function renderJournal(){
    topbar('Journal');
    const p=watchProfile(),y=currentYear(),archive=Math.max(1,Number(p.ArchiveYears||2));
    const notes=tr('Notes');
    content.innerHTML=`<h1 class="page-title">Journal & veille scientifique</h1>
      <p class="subtitle">La veille est maintenant pilotée par WatchProfiles, WatchTerms et WatchScoring dans Administration.</p>
      <div class="card card-pad">
        <div class="row space-between" style="align-items:flex-start;gap:16px"><div><h3 class="section-title">🔬 ${e(p.Name||'Veille scientifique')}</h3>
        <p class="subtitle">${p.CurrentYearOnly!==false?`Priorité exclusive aux publications ${y}.`:'Fenêtre récente configurable.'} Les termes et scores peuvent être modifiés sans toucher au code.</p></div>
        <button class="btn btn-primary" id="v112WatchRefresh" ${AUTO.watch.loading?'disabled':''}>${AUTO.watch.loading?'Recherche…':'Actualiser la veille'}</button></div>
        <div class="v112-watch-config"><span class="pill neutral">${watchTerms().length} termes</span><span class="pill neutral">Max ${Number(p.MaxResults||25)} / catégorie</span><span class="pill neutral">${archive} an(s) d’archives</span></div>
        ${AUTO.watch.lastRun?`<p class="subtitle">Dernière recherche : ${e(AUTO.watch.lastRun.toLocaleString('fr-FR'))}</p>`:''}
      </div>
      <section class="v112-watch-section"><h2>1. Publications utilisant notre matériel — ${y}</h2>${pubList(AUTO.watch.exact,`Aucune référence exacte détectée en ${y}.`)}</section>
      <section class="v112-watch-section"><h2>2. Alternatives sur les mêmes cibles — ${y}</h2>${pubList(AUTO.watch.target,`Aucune alternative de cible détectée en ${y}.`)}</section>
      <section class="v112-watch-section"><h2>3. Alternatives méthodologiques — ${y}</h2>${pubList(AUTO.watch.method,`Aucune alternative méthodologique détectée en ${y}.`)}</section>
      <div class="card card-pad" style="margin-top:22px"><div class="row space-between"><div><h3 class="section-title">Publications plus anciennes</h3><p class="subtitle">${y-archive}–${y-1}, chargées uniquement à la demande.</p></div>
      <button class="btn" id="v112WatchOlder">${AUTO.watch.olderLoading?'Chargement…':AUTO.watch.olderVisible?'Masquer':`Voir ${y-archive}–${y-1}`}</button></div>
      ${AUTO.watch.olderVisible?`<div style="margin-top:14px"><h4>Références exactes</h4>${pubList(AUTO.watch.olderExact,'Aucune.',true)}<h4> mêmes cibles</h4>${pubList(AUTO.watch.olderTarget,'Aucune.',true)}<h4>Alternatives méthodologiques</h4>${pubList(AUTO.watch.olderMethod,'Aucune.',true)}</div>`:''}</div>
      <div class="card card-pad" style="margin-top:22px"><h3 class="section-title">Notes du laboratoire</h3>${notes.length?`<table class="table"><tbody>${notes.slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)).map(n=>`<tr><td>${e(n.Author||'Utilisateur')}</td><td>${e(n.Text||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune note.</div>'}</div>`;
    $('#v112WatchRefresh').onclick=refreshWatch;$('#v112WatchOlder').onclick=toggleOlder;
  }
  journal=renderJournal;
  ns.refreshScientificWatch=refreshWatch;

  // -------- Enrichment queue --------
  function supplierConfigFor(name){
    const n=norm(name);return tr('SupplierConfig').find(s=>s.Active!==false&&[s.Name,s.CanonicalName,...String(s.Aliases||'').split('|')].some(x=>norm(x)===n));
  }
  function supplierSearchLink(a){
    const cfg=supplierConfigFor(a.Supplier||a.supplier),ref=String(a.CatalogNumber||a.catalogNumber||'').trim();
    if(!ref)return '';
    if(cfg?.SearchTemplate)return String(cfg.SearchTemplate).replace(/\{catalog\}/g,encodeURIComponent(ref)).replace(/\{supplier\}/g,encodeURIComponent(cfg.CanonicalName||cfg.Name||''));
    const domain=String(cfg?.Domains||'').split('|').map(x=>x.trim()).filter(Boolean)[0];
    const q=domain?`site:${domain} "${ref}" antibody datasheet`:`"${a.Supplier||a.supplier||''}" "${ref}" antibody datasheet`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
  function queueRows(){return tr('EnrichmentQueue');}
  function queueExists(targetCode,link,title){return queueRows().some(q=>q.TargetCode===targetCode&&((link&&q.Link===link)||(title&&norm(q.Title)===norm(title))));}
  async function addQueue(records){
    if(!state.connected||!state.tables.includes('EnrichmentQueue')||!records.length)return;
    const filtered=records.filter(r=>!queueExists(r.TargetCode,r.Link,r.Title));if(!filtered.length)return;
    const cols=Object.keys(filtered[0]),vals=Object.fromEntries(cols.map(c=>[c,filtered.map(r=>r[c]??null)]));
    await grist.docApi.applyUserActions([['BulkAddRecord','EnrichmentQueue',Array(filtered.length).fill(null),vals]]);
    const fresh=await grist.docApi.fetchTable('EnrichmentQueue');state.data.EnrichmentQueue=fresh;ns.data.EnrichmentQueue=fresh;
  }

  function officialWebsiteCertain(a){
    const link=String(a.Website||'').trim();if(!/^https?:\/\//i.test(link))return false;
    const cfg=supplierConfigFor(a.Supplier);if(!cfg)return false;
    try{const host=new URL(link).hostname.toLowerCase();return String(cfg.Domains||'').split('|').map(x=>x.trim().toLowerCase()).filter(Boolean).some(d=>host===d||host.endsWith('.'+d));}catch(_){return false;}
  }

  async function enrichPrimary(a){
    if(!flag('auto_enrichment_on_create',true)||!state.connected||!state.tables.includes('EnrichmentQueue'))return;
    const created=Date.now()/1000,base={TargetTable:'Antibodies',TargetId:Number(a.id),TargetCode:a.Code||`AB-${a.id}`,InventoryType:'primary_antibody',Status:'Pending',CreatedAt:created};
    const suggestions=[];
    if(a.Website&&/^https?:\/\//i.test(String(a.Website))){
      suggestions.push({...base,Kind:'Datasheet',Title:`Fiche fournisseur — ${a.Name||a.FullName}`,Link:String(a.Website),Confidence:officialWebsiteCertain(a)?100:85,Reason:'Lien fournisseur déjà présent dans la fiche.',PayloadJSON:''});
    }else if(a.CatalogNumber){
      const link=supplierSearchLink(a);if(link)suggestions.push({...base,Kind:'SupplierSearch',Title:`Rechercher la datasheet officielle — ${a.CatalogNumber}`,Link:link,Confidence:55,Reason:'Recherche limitée au domaine fournisseur lorsqu’il est configuré. À valider avant ajout aux Documents.',PayloadJSON:''});
    }
    const ref=String(a.CatalogNumber||'').trim(),target=String(window.BioDynaMitV111?.effectiveTarget?.(a)||a.Target||'').trim();
    const tasks=[];
    if(ref.length>=3)tasks.push(epSearch(`${currentDateClause()} AND ${contextClause()} AND "${ref.replace(/"/g,'')}"`,6).then(rs=>rs.slice(0,3).map(p=>({...base,Kind:'Publication',Title:p.title||'Publication',Link:publicationLink(p),Confidence:95,Reason:`Référence catalogue exacte ${ref} détectée dans Europe PMC.`,PayloadJSON:JSON.stringify({doi:p.doi||'',pmid:p.pmid||'',target,match:'exact'})}))));
    if(target)tasks.push(epSearch(`${currentDateClause()} AND ${contextClause()} AND "${target.replace(/"/g,'')}"`,6).then(rs=>rs.slice(0,3).map(p=>({...base,Kind:'Publication',Title:p.title||'Publication',Link:publicationLink(p),Confidence:75,Reason:`Publication récente sur la cible ${target} en contexte configuré.`,PayloadJSON:JSON.stringify({doi:p.doi||'',pmid:p.pmid||'',target,match:'target'})}))));
    const results=await Promise.allSettled(tasks);for(const r of results)if(r.status==='fulfilled')suggestions.push(...r.value);
    await addQueue(suggestions.filter(x=>x.Link));
    if(flag('auto_add_official_datasheet',false)&&officialWebsiteCertain(a)&&a.Website){
      const q=queueRows().find(x=>x.TargetCode===base.TargetCode&&x.Kind==='Datasheet'&&x.Link===a.Website&&x.Status==='Pending');
      if(q)await acceptQueue(q,true);
    }
  }
  ns.enrichPrimary=enrichPrimary;

  const baseSaveAntibody=saveAntibody;
  saveAntibody=async function(){
    const name=$('#fName')?.value?.trim()||'',cat=$('#fCat')?.value?.trim()||'';
    const before=new Set(tr('Antibodies').map(x=>Number(x.id)));
    await baseSaveAntibody();
    const created=tr('Antibodies').find(x=>!before.has(Number(x.id)))||tr('Antibodies').find(x=>norm(x.Name)===norm(name)&&norm(x.CatalogNumber)===norm(cat));
    if(created){
      if(state.connected&&state.tables.includes('History')&&!tr('History').some(h=>h.Action==='Ajout anticorps'&&h.EntityCode===created.Code)){
        try{await grist.docApi.applyUserActions([['AddRecord','History',null,{Date:Date.now()/1000,Action:'Ajout anticorps',EntityType:'Antibody',EntityCode:created.Code||'',Details:`${created.Name||created.FullName} · ${created.Supplier||''} · ${created.CatalogNumber||''}`,User:'Grist'}]]);}catch(_){}
      }
      setTimeout(()=>enrichPrimary(created).then(()=>{if(state.route==='dashboard'||state.route==='documents')render();}).catch(err=>console.warn('Enrichment:',err)),20);
    }
  };
  ns.baseSaveAntibody=baseSaveAntibody;

  function pendingQueue(){return queueRows().filter(q=>q.Status==='Pending').sort((a,b)=>Number(b.Confidence||0)-Number(a.Confidence||0)||Number(b.CreatedAt||0)-Number(a.CreatedAt||0));}
  async function acceptQueue(q,silent=false){
    if(!state.connected)return toast('Connexion Grist requise.');
    try{
      if(q.Kind==='SupplierSearch'){
        if(!silent)window.open(q.Link,'_blank','noopener');
        return;
      }
      const type=core.classifyDocument({title:q.Title,type:q.Kind,link:q.Link,notes:q.Reason});
      const actions=[];
      if(q.TargetTable==='Antibodies'){
        const exists=tr('Documents').some(d=>Number(d.Antibody)===Number(q.TargetId)&&((q.Link&&d.Link===q.Link)||norm(d.Title)===norm(q.Title)));
        if(!exists)actions.push(['AddRecord','Documents',null,{Antibody:Number(q.TargetId),Title:q.Title,Type:type,Link:q.Link||'',Notes:`Ajout depuis EnrichmentQueue. ${q.Reason||''}`}]);
      }else if(q.TargetTable==='InventoryItems'){
        const exists=tr('InventoryDocuments').some(d=>Number(d.Item)===Number(q.TargetId)&&((q.Link&&d.Link===q.Link)||norm(d.Title)===norm(q.Title)));
        if(!exists)actions.push(['AddRecord','InventoryDocuments',null,{Item:Number(q.TargetId),InventoryType:q.InventoryType||'',Title:q.Title,Type:type,Link:q.Link||'',Notes:`Ajout depuis EnrichmentQueue. ${q.Reason||''}`}]);
      }
      actions.push(['UpdateRecord','EnrichmentQueue',Number(q.id),{Status:'Accepted'}]);
      await grist.docApi.applyUserActions(actions);await loadAll();if(!silent)toast('Suggestion ajoutée aux documents.');
    }catch(err){console.error(err);if(!silent)toast(`Erreur : ${err.message||err}`);}
  }
  async function rejectQueue(q){
    await grist.docApi.applyUserActions([['UpdateRecord','EnrichmentQueue',Number(q.id),{Status:'Rejected'}]]);await loadAll();toast('Suggestion ignorée.');documents();
  }
  ns.acceptQueue=acceptQueue;

  function queueHtml(limit=50){
    const q=pendingQueue().slice(0,limit);
    if(!state.tables.includes('EnrichmentQueue'))return '<div class="empty">Initialise la structure v11.2 pour activer la file d’enrichissement.</div>';
    if(!q.length)return '<div class="empty">Aucune suggestion en attente.</div>';
    return `<div class="v112-queue">${q.map(x=>`<article class="v112-queue-card">
      <div><span class="pill ${Number(x.Confidence)>=90?'ok':Number(x.Confidence)>=70?'warn':'neutral'}">${Number(x.Confidence||0)} %</span> <span class="pill neutral">${e(x.Kind)}</span>
      <h4>${e(x.Title)}</h4><p class="subtitle">${e(x.TargetCode)} · ${e(x.Reason||'')}</p></div>
      <div class="v112-queue-actions">${x.Link?`<a class="btn btn-sm" href="${e(x.Link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:''}
      ${x.Kind==='SupplierSearch'?'<span class="pill neutral">Validation manuelle requise</span>':`<button class="btn btn-sm btn-primary" data-v112-accept="${x.id}">Ajouter</button>`}
      <button class="btn btn-sm" data-v112-reject="${x.id}">Ignorer</button></div>
    </article>`).join('')}</div>`;
  }
  function bindQueue(){
    document.querySelectorAll('[data-v112-accept]').forEach(b=>b.onclick=()=>{const q=queueRows().find(x=>Number(x.id)===Number(b.dataset.v112Accept));if(q)acceptQueue(q).then(()=>documents());});
    document.querySelectorAll('[data-v112-reject]').forEach(b=>b.onclick=()=>{const q=queueRows().find(x=>Number(x.id)===Number(b.dataset.v112Reject));if(q)rejectQueue(q);});
  }

  const baseDocuments=documents;
  documents=function(){
    topbar('Documents');
    const pdocs=tr('Documents'),gdocs=tr('InventoryDocuments');
    content.innerHTML=`<h1 class="page-title">Documents & enrichissement</h1><p class="subtitle">Datasheets, protocoles, publications, images et suggestions automatiques à valider.</p>
      <div class="card card-pad"><div class="row space-between"><div><h3 class="section-title">Suggestions automatiques</h3><p class="subtitle">La détection est automatique ; les éléments incertains restent soumis à validation.</p></div><span class="pill neutral">${pendingQueue().length} en attente</span></div>${queueHtml()}</div>
      <div class="card card-pad" style="margin-top:16px"><h3 class="section-title">Documents des anticorps primaires</h3>${pdocs.length?`<table class="table"><thead><tr><th>Titre</th><th>Type</th><th>Lien</th><th>Notes</th></tr></thead><tbody>${pdocs.map(d=>`<tr><td>${e(d.Title||'Sans titre')}</td><td>${e(d.Type||'')}</td><td>${/^https?:/i.test(d.Link||'')?`<a href="${e(d.Link)}" target="_blank">Ouvrir ↗</a>`:e(d.Link||'')}</td><td>${e(d.Notes||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun document.</div>'}</div>
      <div class="card card-pad" style="margin-top:16px"><h3 class="section-title">Documents des inventaires génériques</h3>${gdocs.length?`<table class="table"><thead><tr><th>Inventaire</th><th>Titre</th><th>Type</th><th>Lien</th></tr></thead><tbody>${gdocs.map(d=>`<tr><td>${e(d.InventoryType||'')}</td><td>${e(d.Title||'')}</td><td>${e(d.Type||'')}</td><td>${/^https?:/i.test(d.Link||'')?`<a href="${e(d.Link)}" target="_blank">Ouvrir ↗</a>`:e(d.Link||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun document générique.</div>'}</div>`;
    bindQueue();
  };
  ns.baseDocuments=baseDocuments;

  // -------- Alerts --------
  function collectAlerts(){
    const rules=tr('AlertRules').length?tr('AlertRules'):[
      {Key:'low_volume',Name:'Volume faible',EntityType:'unit',Field:'EstimatedVolume_uL',Operator:'lt',CompareValue:'30',Severity:'warning',Message:'{Code} : volume faible.',Enabled:true},
      {Key:'to_store',Name:'À ranger',EntityType:'unit',Field:'Status',Operator:'equals',CompareValue:'À ranger',Severity:'warning',Message:'{Code} doit être rangé.',Enabled:true}
    ];
    const primary=tr('Vials').map(v=>({...v,Code:v.Code||`V-${v.id}`}));
    const generic=tr('InventoryUnits').map(v=>({...v,Code:v.Code||`U-${v.id}`}));
    const a=[...core.buildRuleAlerts(primary,rules,'unit').map(x=>({...x,scope:'Primaires'})),...core.buildRuleAlerts(generic,rules,'unit').map(x=>({...x,scope:'Inventaires'}))];
    if(flag('integrity_checks',true)&&ns.integrityReport){
      const r=ns.integrityReport();
      for(const x of r.primary)a.push({severity:x.severity,scope:'Primaires',title:'Intégrité',entityCode:'',message:x.message});
      for(const x of r.generic)a.push({severity:x.severity,scope:'Inventaires',title:'Intégrité',entityCode:'',message:x.message});
    }
    const seen=new Set();return a.filter(x=>{const k=[x.scope,x.title,x.entityCode,x.message].join('|');if(seen.has(k))return false;seen.add(k);return true;});
  }
  ns.collectAlerts=collectAlerts;

  const baseAlerts=alerts;
  alerts=function(){
    const a=collectAlerts();topbar('Alertes');
    content.innerHTML=`<h1 class="page-title">Alertes automatiques</h1><p class="subtitle">Règles configurées dans Administration + contrôles d’intégrité.</p>
      <div class="grid grid-3"><div class="card card-pad"><div class="metric-value">${a.length}</div><div class="subtitle">Alertes actives</div></div>
      <div class="card card-pad"><div class="metric-value">${a.filter(x=>x.severity==='error').length}</div><div class="subtitle">Erreurs d’intégrité</div></div>
      <div class="card card-pad"><div class="metric-value">${pendingQueue().length}</div><div class="subtitle">Enrichissements à valider</div></div></div>
      <div class="card card-pad" style="margin-top:16px">${a.length?`<table class="table"><thead><tr><th>Niveau</th><th>Portée</th><th>Alerte</th><th>Élément</th><th>Détail</th></tr></thead><tbody>${a.map(x=>`<tr><td><span class="pill ${x.severity==='error'?'warn':x.severity==='warning'?'warn':'neutral'}">${e(x.severity||'info')}</span></td><td>${e(x.scope||'')}</td><td>${e(x.title||'')}</td><td>${e(x.entityCode||'')}</td><td>${e(x.message||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune alerte calculée.</div>'}</div>`;
  };
  ns.baseAlerts=baseAlerts;

  // -------- Dashboard augmentation --------
  const baseDashboard=dashboard;
  dashboard=function(){
    baseDashboard();
    const m=window.BioDynaMitSecondary2025,data=ns.inventoryData?.('secondary_antibody'),pending=pendingQueue().length;
    let integrity=0;try{const r=ns.integrityReport?.();integrity=(r?.primary?.length||0)+(r?.generic?.length||0);}catch(_){}
    const section=document.createElement('div');section.className='card card-pad v112-dashboard';section.style.marginTop='16px';
    section.innerHTML=`<div class="row space-between"><div><h3 class="section-title">⚙ Automatisation v11.2</h3><p class="subtitle">Configuration Grist, nouveaux inventaires et enrichissement automatique.</p></div><button class="btn" id="v112DashAdmin">Administration</button></div>
      <div class="grid grid-4" style="margin-top:12px"><div><b>${ns.ready?'OK':'À initialiser'}</b><small> configuration</small></div>
      <div><b>${data?.items?.length||m?.summary?.items||0}</b><small> secondaires</small></div><div><b>${data?.units?.filter?.(u=>u.status==='À réconcilier')?.length||m?.summary?.reviewUnits+m?.summary?.unresolvedUnits+m?.summary?.otherReagentUnits||0}</b><small> à réconcilier</small></div>
      <div><b>${pending}</b><small> enrichissements en attente</small></div></div>
      ${integrity?`<div class="banner" style="margin-top:12px">${integrity} point(s) d’intégrité à examiner dans Administration.</div>`:''}
      <div class="row" style="margin-top:12px"><button class="btn" id="v112DashSecondary">Anticorps secondaires</button><button class="btn" id="v112DashDocs">Enrichissement</button></div>`;
    content.appendChild(section);
    $('#v112DashAdmin').onclick=()=>go('admin');$('#v112DashSecondary').onclick=()=>go('inv:secondary_antibody');$('#v112DashDocs').onclick=()=>go('documents');
  };
  ns.baseDashboard=baseDashboard;

  setTimeout(()=>{try{if(state.route==='dashboard')dashboard();}catch(_){}},180);
})();