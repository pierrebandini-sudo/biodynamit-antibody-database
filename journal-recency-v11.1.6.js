/* BioDynaMit v11.1.6 — Journal: priorité aux publications les plus récentes
   - Veille principale limitée à l'année courante.
   - Tri strict du plus récent au plus ancien.
   - Badges "Très récent" (<=30 j) et "Récent" (<=6 mois).
   - Articles des deux années précédentes chargés uniquement à la demande.
   - Ne modifie ni le stockage ni les données Grist.
*/
(function(){
  'use strict';

  const VERSION = '11.1.6';
  const EP_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
  const NOW = new Date();
  const CURRENT_YEAR = NOW.getFullYear();
  const TODAY = NOW.toISOString().slice(0,10);

  const WATCH = {
    loaded:false,
    loading:false,
    error:'',
    exact:[],
    targetAlternatives:[],
    methodAlternatives:[],
    lastRun:null,
    stats:{exact:0,target:0,method:0},
    olderLoaded:false,
    olderLoading:false,
    olderVisible:false,
    olderError:'',
    olderExact:[],
    olderTargetAlternatives:[],
    olderMethodAlternatives:[],
    olderStats:{exact:0,target:0,method:0}
  };

  const MITO_TERMS = [
    'mitochondria','mitochondrial','mitofusin','cristae','mtDNA',
    'mitochondrial dynamics','oxidative phosphorylation'
  ];

  const METHOD_MARKERS = [
    'live-cell','live cell','fluorescent protein','gfp','egfp','mcherry',
    'reporter','biosensor','probe','dye','stain',
    'crispr','knock-in','knock in','tagged','tagging',
    'proximity labeling','proximity labelling','apex','turboid',
    'mass spectrometry','proteomics','super-resolution','super resolution',
    'sted','sim','expansion microscopy','electron microscopy',
    'nanobody','affimer','aptamer','label-free','label free'
  ];

  const ANTIBODY_MARKERS = [
    'antibody','antibodies','immunofluorescence','immunoblot',
    'western blot','western-blot','immunostaining',
    'immunohistochemistry','immunoprecipitation'
  ];

  function e(v){ return esc(v); }
  function norm(v){ return normalizeName(v); }
  function targetOf(a){
    try{
      return String(window.BioDynaMitV111?.effectiveTarget?.(a) || a?.Target || '').trim();
    }catch(_){
      return String(a?.Target || '').trim();
    }
  }

  function stockItems(){
    return rows(state.data.Antibodies).map(a=>({
      id:a.id,
      name:String(a.Name||a.FullName||a.Code||'Anticorps').trim(),
      ref:String(a.CatalogNumber||'').trim(),
      target:targetOf(a),
      supplier:String(a.Supplier||'').trim()
    }));
  }

  function uniqueBy(items,keyFn){
    const seen=new Set();
    return items.filter(x=>{
      const k=keyFn(x);
      if(!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function refsForWatch(){
    return uniqueBy(
      stockItems().filter(x=>x.ref && x.ref.length>=3),
      x=>norm(x.ref)
    );
  }

  function targetsForWatch(){
    return uniqueBy(
      stockItems().filter(x=>x.target && x.target.length>=2),
      x=>norm(x.target)
    );
  }

  function splitBatches(items,termFn,maxChars=950){
    const batches=[];
    let current=[], size=0;
    for(const item of items){
      const term=termFn(item);
      if(current.length && size+term.length+4>maxChars){
        batches.push(current);
        current=[];
        size=0;
      }
      current.push(item);
      size+=term.length+4;
    }
    if(current.length) batches.push(current);
    return batches;
  }

  function currentDateClause(){
    return `FIRST_PDATE:[${CURRENT_YEAR}-01-01 TO ${TODAY}]`;
  }

  function olderDateClause(){
    const fromYear=CURRENT_YEAR-2;
    const toYear=CURRENT_YEAR-1;
    return `FIRST_PDATE:[${fromYear}-01-01 TO ${toYear}-12-31]`;
  }

  function mitoClause(){
    return '('+MITO_TERMS.map(x=>`"${x}"`).join(' OR ')+')';
  }

  async function europeSearch(query,pageSize=50){
    const url=`${EP_BASE}?format=json&pageSize=${pageSize}&sort_date:y&resultType=core&query=${encodeURIComponent(query)}`;
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    if(!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
    const data=await r.json();
    return data?.resultList?.result||[];
  }

  function publicationKey(p){
    return p.doi||p.pmid||p.pmcid||`${p.title||''}-${p.firstPublicationDate||p.pubYear||''}`;
  }

  function pubText(p){
    return [p.title,p.abstractText,p.journalTitle].filter(Boolean).join(' ');
  }

  function containsRaw(text,value){
    const raw=String(text||'').toLowerCase();
    const v=String(value||'').trim().toLowerCase();
    return !!v && raw.includes(v);
  }

  function matchingRefs(p,refs){
    const raw=pubText(p);
    const normalized=norm(raw);
    return refs.filter(x=>containsRaw(raw,x.ref) || normalized.includes(norm(x.ref)));
  }

  function matchingTargets(p,targets){
    const raw=pubText(p);
    const normalized=norm(raw);
    return targets.filter(x=>{
      const t=String(x.target||'').trim();
      return !!t && (containsRaw(raw,t) || normalized.includes(norm(t)));
    });
  }

  function methodSignals(p){
    const text=String(pubText(p)).toLowerCase();
    return METHOD_MARKERS.filter(m=>text.includes(m));
  }

  function antibodySignals(p){
    const text=String(pubText(p)).toLowerCase();
    return ANTIBODY_MARKERS.filter(m=>text.includes(m));
  }

  function mitochondriaSignal(p){
    const text=String(pubText(p)).toLowerCase();
    return MITO_TERMS.some(x=>text.includes(x.toLowerCase()));
  }

  function publicationDateValue(p){
    const raw=String(p.firstPublicationDate||'').trim();
    if(raw){
      const ts=Date.parse(raw.length===4?`${raw}-01-01`:raw);
      if(!Number.isNaN(ts)) return ts;
    }
    const year=Number(p.pubYear||0);
    return year ? Date.UTC(year,0,1) : 0;
  }

  function publicationYear(p){
    const d=publicationDateValue(p);
    return d ? new Date(d).getUTCFullYear() : 0;
  }

  function formatPublicationDate(p){
    const ts=publicationDateValue(p);
    if(!ts) return String(p.firstPublicationDate||p.pubYear||'Date inconnue');
    const d=new Date(ts);
    const hasExact=/^\d{4}-\d{2}-\d{2}/.test(String(p.firstPublicationDate||''));
    return hasExact
      ? d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})
      : String(publicationYear(p));
  }

  function ageInDays(p){
    const ts=publicationDateValue(p);
    if(!ts) return Infinity;
    return Math.max(0,Math.floor((Date.now()-ts)/86400000));
  }

  function recencyBadge(p){
    const days=ageInDays(p);
    if(days<=30) return {label:'🆕 Très récent',cl:'ok'};
    if(days<=183) return {label:'Récent',cl:'warn'};
    if(publicationYear(p)===CURRENT_YEAR) return {label:String(CURRENT_YEAR),cl:'neutral'};
    return {label:String(publicationYear(p)||'Ancien'),cl:'neutral'};
  }

  function scorePublication(p,kind,matchedCount=1){
    let score=0;
    if(kind==='exact') score+=5;
    if(kind==='target') score+=3;
    if(kind==='method') score+=3;
    if(mitochondriaSignal(p)) score+=2;
    if(matchedCount>1) score+=1;
    if(kind==='method' && methodSignals(p).length) score+=1;
    return score;
  }

  function relevance(score){
    if(score>=7) return {label:'Très pertinent',cl:'ok'};
    if(score>=5) return {label:'Pertinent',cl:'warn'};
    return {label:'À explorer',cl:'neutral'};
  }

  function strictNewestFirst(a,b){
    const diff=publicationDateValue(b)-publicationDateValue(a);
    if(diff!==0) return diff;
    return Number(b.score||0)-Number(a.score||0);
  }

  async function searchExact(refs,dateClause){
    const merged=new Map();
    const batches=splitBatches(refs,x=>`"${x.ref.replace(/"/g,'')}"`).slice(0,12);
    for(const batch of batches){
      const refClause='('+batch.map(x=>`"${x.ref.replace(/"/g,'')}"`).join(' OR ')+')';
      const pubs=await europeSearch(`${dateClause} AND ${mitoClause()} AND ${refClause}`);
      for(const p of pubs){
        const matches=matchingRefs(p,batch);
        if(!matches.length) continue;
        const key=publicationKey(p);
        const old=merged.get(key);
        if(old){
          const all=uniqueBy([...old.matches,...matches],x=>norm(x.ref));
          old.matches=all;
          old.score=scorePublication(old,'exact',all.length);
        }else{
          merged.set(key,{...p,kind:'exact',matches,score:scorePublication(p,'exact',matches.length)});
        }
      }
    }
    return [...merged.values()];
  }

  async function searchTargets(targets,exactKeys,dateClause){
    const merged=new Map();
    const batches=splitBatches(targets,x=>`"${x.target.replace(/"/g,'')}"`).slice(0,12);
    for(const batch of batches){
      const targetClause='('+batch.map(x=>`"${x.target.replace(/"/g,'')}"`).join(' OR ')+')';
      const pubs=await europeSearch(`${dateClause} AND ${mitoClause()} AND ${targetClause}`);
      for(const p of pubs){
        const key=publicationKey(p);
        if(exactKeys.has(key)) continue;
        const matches=matchingTargets(p,batch);
        if(!matches.length) continue;
        const methods=methodSignals(p);
        const abs=antibodySignals(p);
        const kind=(methods.length && !abs.length)?'method':'target';
        const old=merged.get(key);
        if(old){
          old.matches=uniqueBy([...old.matches,...matches],x=>norm(x.target));
          old.methods=uniqueBy([...(old.methods||[]),...methods],x=>x);
          if(old.kind!=='target' && kind==='target') old.kind='target';
          old.score=scorePublication(old,old.kind,old.matches.length);
        }else{
          merged.set(key,{...p,kind,matches,methods,score:scorePublication(p,kind,matches.length)});
        }
      }
    }
    return [...merged.values()];
  }

  async function runSearch(dateClause){
    const refs=refsForWatch();
    const targets=targetsForWatch();
    if(!refs.length && !targets.length){
      throw new Error('Aucune référence catalogue ni cible exploitable dans Antibodies.');
    }

    const exact=refs.length ? await searchExact(refs,dateClause) : [];
    const exactKeys=new Set(exact.map(publicationKey));
    const alternatives=targets.length ? await searchTargets(targets,exactKeys,dateClause) : [];

    return {
      exact:exact.sort(strictNewestFirst).slice(0,25),
      target:alternatives.filter(x=>x.kind==='target').sort(strictNewestFirst).slice(0,25),
      method:alternatives.filter(x=>x.kind==='method').sort(strictNewestFirst).slice(0,25)
    };
  }

  async function refreshWatch(){
    if(WATCH.loading) return;
    WATCH.loading=true;
    WATCH.error='';
    WATCH.exact=[];
    WATCH.targetAlternatives=[];
    WATCH.methodAlternatives=[];
    renderJournal();

    try{
      const result=await runSearch(currentDateClause());
      WATCH.exact=result.exact;
      WATCH.targetAlternatives=result.target;
      WATCH.methodAlternatives=result.method;
      WATCH.stats={
        exact:WATCH.exact.length,
        target:WATCH.targetAlternatives.length,
        method:WATCH.methodAlternatives.length
      };
      WATCH.lastRun=new Date();
      WATCH.loaded=true;
    }catch(err){
      console.error(err);
      WATCH.error=err.message||String(err);
    }finally{
      WATCH.loading=false;
      renderJournal();
    }
  }

  async function loadOlder(){
    if(WATCH.olderLoaded){
      WATCH.olderVisible=!WATCH.olderVisible;
      renderJournal();
      return;
    }
    if(WATCH.olderLoading) return;

    WATCH.olderLoading=true;
    WATCH.olderError='';
    WATCH.olderVisible=true;
    renderJournal();

    try{
      const result=await runSearch(olderDateClause());
      WATCH.olderExact=result.exact;
      WATCH.olderTargetAlternatives=result.target;
      WATCH.olderMethodAlternatives=result.method;
      WATCH.olderStats={
        exact:WATCH.olderExact.length,
        target:WATCH.olderTargetAlternatives.length,
        method:WATCH.olderMethodAlternatives.length
      };
      WATCH.olderLoaded=true;
    }catch(err){
      console.error(err);
      WATCH.olderError=err.message||String(err);
    }finally{
      WATCH.olderLoading=false;
      renderJournal();
    }
  }

  function pubLink(p){
    if(p.doi) return `https://doi.org/${encodeURIComponent(p.doi)}`;
    if(p.pmid) return `https://europepmc.org/article/MED/${encodeURIComponent(p.pmid)}`;
    if(p.pmcid) return `https://europepmc.org/article/PMC/${encodeURIComponent(p.pmcid)}`;
    return '';
  }

  function itemNames(p){
    return uniqueBy(
      (p.matches||[]).map(x=>({name:x.name,target:x.target,ref:x.ref})),
      x=>norm(x.name)+'|'+norm(x.target)+'|'+norm(x.ref)
    );
  }

  function publicationCard(p){
    const link=pubLink(p);
    const rel=relevance(p.score||0);
    const recent=recencyBadge(p);
    const items=itemNames(p);
    let reason='';

    if(p.kind==='exact'){
      reason=`Référence(s) exacte(s) détectée(s) : ${items.map(x=>`${x.name} (${x.ref})`).join(', ')}`;
    }
    if(p.kind==='target'){
      reason=`Alternative sur la même cible : ${items.map(x=>`${x.name} → ${x.target||'cible non nommée'}`).join(', ')}`;
    }
    if(p.kind==='method'){
      reason=`Alternative méthodologique pour : ${items.map(x=>`${x.name} → ${x.target||'cible non nommée'}`).join(', ')}`;
    }

    const methods=(p.methods||[]).slice(0,5);
    return `<article class="card card-pad" style="margin-top:12px">
      <div class="row space-between" style="gap:12px;align-items:flex-start">
        <div style="min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <span class="pill ${recent.cl}">${e(recent.label)}</span>
            <span class="pill ${rel.cl}">${e(rel.label)}</span>
            <span class="pill neutral">Score ${Number(p.score||0)}</span>
          </div>
          <div style="font-size:15px;font-weight:850;margin-bottom:5px">
            📅 ${e(formatPublicationDate(p))}
          </div>
          <h3 class="section-title" style="margin-bottom:5px">${e(p.title||'Publication sans titre')}</h3>
          <p class="subtitle">${e(p.authorString||'Auteurs non renseignés')} · ${e(p.journalTitle||'Journal non renseigné')}</p>
        </div>
        ${link?`<a class="btn btn-sm" href="${e(link)}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>`:''}
      </div>
      <p><b>Pourquoi cet article est proposé :</b> ${e(reason)}</p>
      ${methods.length?`<p><b>Méthodes / alternatives détectées :</b> ${e(methods.join(', '))}</p>`:''}
      ${p.abstractText?`<p style="color:var(--muted)">${e(String(p.abstractText).slice(0,520))}${String(p.abstractText).length>520?'…':''}</p>`:''}
    </article>`;
  }

  function cards(list,emptyText,mode='current'){
    const loading=mode==='older'?WATCH.olderLoading:WATCH.loading;
    const error=mode==='older'?WATCH.olderError:WATCH.error;
    const loaded=mode==='older'?WATCH.olderLoaded:WATCH.loaded;

    if(loading) return '<div class="empty">Recherche des publications…</div>';
    if(error) return `<div class="banner error">Veille indisponible : ${e(error)}</div>`;
    if(!loaded) return '<div class="empty">Clique sur « Actualiser la veille » pour lancer la recherche.</div>';
    if(!list.length) return `<div class="empty">${e(emptyText)}</div>`;
    return list.map(publicationCard).join('');
  }

  function olderSection(){
    const fromYear=CURRENT_YEAR-2;
    const toYear=CURRENT_YEAR-1;

    if(!WATCH.olderVisible) return '';

    if(WATCH.olderLoading){
      return `<div class="card card-pad" style="margin-top:14px"><div class="empty">Recherche des publications ${fromYear}–${toYear}…</div></div>`;
    }

    if(WATCH.olderError){
      return `<div class="card card-pad" style="margin-top:14px"><div class="banner error">${e(WATCH.olderError)}</div></div>`;
    }

    if(!WATCH.olderLoaded) return '';

    return `<div style="margin-top:18px">
      <div class="banner">
        <b>Archives ${fromYear}–${toYear}</b> — elles sont volontairement séparées de la veille principale afin de ne pas masquer les publications ${CURRENT_YEAR}.
        ${WATCH.olderStats.exact} exactes · ${WATCH.olderStats.target} alternatives anticorps · ${WATCH.olderStats.method} alternatives méthodologiques.
      </div>

      <section style="margin-top:16px">
        <h3 class="section-title">Archives — références exactes</h3>
        ${cards(WATCH.olderExact,`Aucune référence exacte trouvée en ${fromYear}–${toYear}.`,'older')}
      </section>

      <section style="margin-top:20px">
        <h3 class="section-title">Archives — mêmes cibles</h3>
        ${cards(WATCH.olderTargetAlternatives,`Aucune alternative sur les mêmes cibles trouvée en ${fromYear}–${toYear}.`,'older')}
      </section>

      <section style="margin-top:20px">
        <h3 class="section-title">Archives — alternatives méthodologiques</h3>
        ${cards(WATCH.olderMethodAlternatives,`Aucune alternative méthodologique trouvée en ${fromYear}–${toYear}.`,'older')}
      </section>
    </div>`;
  }

  function renderJournal(){
    topbar('Journal');
    const N=rows(state.data.Notes);
    const olderFrom=CURRENT_YEAR-2;
    const olderTo=CURRENT_YEAR-1;

    content.innerHTML=`
      <h1 class="page-title">Journal & veille scientifique</h1>
      <p class="subtitle">Notes internes et veille bibliographique centrée sur le stock d’anticorps et la biologie mitochondriale.</p>

      <div class="card card-pad">
        <div class="row space-between" style="align-items:flex-start;gap:16px">
          <div>
            <h3 class="section-title">🔬 Veille scientifique — priorité ${CURRENT_YEAR}</h3>
            <p class="subtitle">La veille principale affiche uniquement les publications ${CURRENT_YEAR}, triées strictement de la plus récente à la plus ancienne.</p>
          </div>
          <button class="btn btn-primary" id="v1116RefreshWatch" ${WATCH.loading?'disabled':''}>
            ${WATCH.loading?'Recherche…':'Actualiser la veille'}
          </button>
        </div>

        <div class="banner" style="margin-top:12px">
          <b>Priorité à l’actualité :</b> 🆕 « Très récent » = publication des 30 derniers jours ; « Récent » = moins de 6 mois.
          Les articles ${olderFrom}–${olderTo} restent accessibles séparément, à la demande.
        </div>

        ${WATCH.lastRun?`<p class="subtitle" style="margin-top:10px">
          Dernière recherche : ${e(WATCH.lastRun.toLocaleString('fr-FR'))} ·
          ${WATCH.stats.exact} exactes · ${WATCH.stats.target} alternatives anticorps · ${WATCH.stats.method} alternatives méthodologiques
        </p>`:''}
      </div>

      <section style="margin-top:16px">
        <div>
          <h2 class="section-title">1. Publications utilisant notre matériel — ${CURRENT_YEAR}</h2>
          <p class="subtitle">Même référence catalogue détectée dans une publication mitochondriale de l’année en cours.</p>
        </div>
        ${cards(WATCH.exact,`Aucune référence exacte détectée en ${CURRENT_YEAR} avec les critères actuels.`)}
      </section>

      <section style="margin-top:22px">
        <div>
          <h2 class="section-title">2. Alternatives sur les mêmes cibles — ${CURRENT_YEAR}</h2>
          <p class="subtitle">Même protéine/cible que notre stock, sans détection de notre référence catalogue exacte.</p>
        </div>
        ${cards(WATCH.targetAlternatives,`Aucune alternative d’anticorps détectée en ${CURRENT_YEAR} pour le moment.`)}
      </section>

      <section style="margin-top:22px">
        <div>
          <h2 class="section-title">3. Alternatives méthodologiques — ${CURRENT_YEAR}</h2>
          <p class="subtitle">Sondes, biosenseurs, tagging, protéomique ou microscopie avancée appliqués aux mêmes cibles.</p>
        </div>
        ${cards(WATCH.methodAlternatives,`Aucune alternative méthodologique détectée en ${CURRENT_YEAR} pour le moment.`)}
      </section>

      <div class="card card-pad" style="margin-top:24px">
        <div class="row space-between" style="align-items:center;gap:12px">
          <div>
            <h3 class="section-title" style="margin-bottom:4px">Publications plus anciennes</h3>
            <p class="subtitle">${olderFrom}–${olderTo}, chargées uniquement quand tu en as besoin.</p>
          </div>
          <button class="btn" id="v1116Older" ${WATCH.olderLoading?'disabled':''}>
            ${WATCH.olderLoading?'Chargement…':(WATCH.olderVisible?'Masquer les publications anciennes':`Voir les publications ${olderFrom}–${olderTo}`)}
          </button>
        </div>
        ${olderSection()}
      </div>

      <div class="card card-pad" style="margin-top:22px">
        <h3 class="section-title">Notes du laboratoire</h3>
        ${N.length?`<table class="table"><tbody>${N.slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)).map(n=>`<tr><td>${e(n.Author||'Utilisateur')}</td><td>${e(n.Text||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune note pour le moment.</div>'}
      </div>`;

    const refreshBtn=$('#v1116RefreshWatch');
    if(refreshBtn) refreshBtn.onclick=refreshWatch;

    const olderBtn=$('#v1116Older');
    if(olderBtn) olderBtn.onclick=loadOlder;
  }

  window.journal = renderJournal;
  try{ journal = renderJournal; }catch(_){}

  window.BioDynaMitPublicationWatchV1116 = {
    state:WATCH,
    refresh:refreshWatch,
    loadOlder,
    version:VERSION
  };
})();