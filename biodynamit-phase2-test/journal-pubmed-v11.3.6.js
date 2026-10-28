/* BioDynaMit v11.3.6 — Journal scientifique via PubMed / NCBI E-utilities.
   Purpose:
   - Keep the validated v11.1.6 Journal UX.
   - Avoid Europe PMC's cross-origin failure inside the Grist/DINUM custom-widget iframe.
   - Use NCBI E-utilities, whose public API is designed for programmatic access and
     returns CORS-enabled responses.
   - No proxy account, no token and no external server are required.

   Network flow:
   1. ESearch (JSON) -> PubMed IDs.
   2. EFetch (XML) -> titles, abstracts, authors, journal, DOI and publication dates.
   Requests are throttled to respect the anonymous E-utilities rate limit.
*/
(function(){
  'use strict';

  const VERSION = '11.3.6';
  const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
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
    olderStats:{exact:0,target:0,method:0},
    source:'PubMed / NCBI'
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
  function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

  // NCBI permits a limited anonymous request rate. We deliberately remain below it.
  let lastNcbiRequestAt = 0;
  async function ncbiGate(){
    const elapsed = Date.now() - lastNcbiRequestAt;
    const wait = Math.max(0, 400 - elapsed);
    if(wait) await sleep(wait);
    lastNcbiRequestAt = Date.now();
  }

  async function ncbiFetch(url, as='json'){
    await ncbiGate();
    const response = await fetch(url,{
      method:'GET',
      mode:'cors',
      credentials:'omit',
      cache:'no-store',
      referrerPolicy:'no-referrer'
    });
    if(!response.ok) throw new Error(`NCBI HTTP ${response.status}`);
    if(as==='text') return response.text();
    return response.json();
  }

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

  function splitBatches(items,termFn,maxChars=700){
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

  function dateRangeCurrent(){
    return {
      from:`${CURRENT_YEAR}/01/01`,
      to:TODAY.replace(/-/g,'/')
    };
  }

  function dateRangeOlder(){
    return {
      from:`${CURRENT_YEAR-2}/01/01`,
      to:`${CURRENT_YEAR-1}/12/31`
    };
  }

  function quotePubMed(v){
    return String(v||'').replace(/["\\]/g,' ').replace(/\s+/g,' ').trim();
  }

  function contextClause(){
    return '('+MITO_TERMS.map(x=>`"${quotePubMed(x)}"[Title/Abstract]`).join(' OR ')+')';
  }

  function refClause(batch){
    return '('+batch.map(x=>`"${quotePubMed(x.ref)}"[All Fields]`).join(' OR ')+')';
  }

  function targetClause(batch){
    return '('+batch.map(x=>`"${quotePubMed(x.target)}"[Title/Abstract]`).join(' OR ')+')';
  }

  function textOf(node,selector){
    const el=node?.querySelector(selector);
    return el ? String(el.textContent||'').replace(/\s+/g,' ').trim() : '';
  }

  function monthNumber(raw){
    const s=String(raw||'').trim().toLowerCase();
    if(!s) return '';
    if(/^\d{1,2}$/.test(s)) return String(Math.min(12,Math.max(1,Number(s)))).padStart(2,'0');
    const map={
      jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',
      apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',
      aug:'08',august:'08',sep:'09',sept:'09',september:'09',
      oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'
    };
    return map[s]||map[s.slice(0,3)]||'';
  }

  function articleDate(article){
    const ad=article.querySelector('ArticleDate');
    const pd=article.querySelector('JournalIssue > PubDate');
    const source=ad||pd;

    let year=textOf(source,'Year');
    let month=monthNumber(textOf(source,'Month'));
    let day=textOf(source,'Day');

    if(!year && pd){
      const med=textOf(pd,'MedlineDate');
      const m=med.match(/\b(19|20)\d{2}\b/);
      if(m) year=m[0];
    }
    if(!year){
      const hist=article.querySelector('PubMedPubDate[PubStatus="pubmed"], PubMedPubDate[PubStatus="entrez"]');
      year=textOf(hist,'Year');
      month=monthNumber(textOf(hist,'Month'));
      day=textOf(hist,'Day');
    }

    if(!year) return '';
    if(!month) return year;
    if(!day) day='01';
    return `${year}-${month}-${String(day).padStart(2,'0')}`;
  }

  function parsePubmedXml(xmlText){
    const doc=new DOMParser().parseFromString(xmlText,'application/xml');
    if(doc.querySelector('parsererror')){
      throw new Error('Réponse PubMed XML invalide.');
    }

    return Array.from(doc.querySelectorAll('PubmedArticle')).map(article=>{
      const pmid=textOf(article,'MedlineCitation > PMID');
      const title=textOf(article,'Article > ArticleTitle') || 'Publication sans titre';

      const abstracts=Array.from(article.querySelectorAll('Article > Abstract > AbstractText')).map(x=>{
        const label=String(x.getAttribute('Label')||'').trim();
        const value=String(x.textContent||'').replace(/\s+/g,' ').trim();
        return label && value ? `${label}: ${value}` : value;
      }).filter(Boolean);

      const authors=Array.from(article.querySelectorAll('Article > AuthorList > Author')).map(a=>{
        const collective=textOf(a,'CollectiveName');
        if(collective) return collective;
        const last=textOf(a,'LastName');
        const fore=textOf(a,'ForeName') || textOf(a,'Initials');
        return [fore,last].filter(Boolean).join(' ');
      }).filter(Boolean);

      const journalTitle=
        textOf(article,'Article > Journal > Title') ||
        textOf(article,'Article > Journal > ISOAbbreviation');

      let doi='';
      let pmcid='';
      for(const idNode of article.querySelectorAll('PubmedData > ArticleIdList > ArticleId')){
        const type=String(idNode.getAttribute('IdType')||'').toLowerCase();
        const value=String(idNode.textContent||'').trim();
        if(type==='doi' && !doi) doi=value;
        if((type==='pmc'||type==='pmcid') && !pmcid) pmcid=value;
      }
      if(!doi){
        for(const node of article.querySelectorAll('Article > ELocationID')){
          if(String(node.getAttribute('EIdType')||'').toLowerCase()==='doi'){
            doi=String(node.textContent||'').trim();
            break;
          }
        }
      }

      const firstPublicationDate=articleDate(article);
      const pubYear=(String(firstPublicationDate).match(/\b(19|20)\d{2}\b/)||[])[0]||'';

      return {
        pmid,
        pmcid,
        doi,
        title,
        abstractText:abstracts.join(' '),
        authorString:authors.join(', '),
        journalTitle,
        firstPublicationDate,
        pubYear
      };
    }).filter(x=>x.pmid || x.title);
  }

  async function pubmedSearch(query,range,pageSize=50){
    const params=new URLSearchParams({
      db:'pubmed',
      retmode:'json',
      retmax:String(Math.min(100,Math.max(1,pageSize))),
      sort:'pub date',
      datetype:'pdat',
      mindate:range.from,
      maxdate:range.to,
      tool:'BioDynaMit',
      term:query
    });
    const searchUrl=`${EUTILS}/esearch.fcgi?${params.toString()}`;
    const searchData=await ncbiFetch(searchUrl,'json');
    const ids=searchData?.esearchresult?.idlist||[];
    if(!ids.length) return [];

    const fetchParams=new URLSearchParams({
      db:'pubmed',
      id:ids.join(','),
      retmode:'xml',
      rettype:'abstract',
      tool:'BioDynaMit'
    });
    const xml=await ncbiFetch(`${EUTILS}/efetch.fcgi?${fetchParams.toString()}`,'text');
    return parsePubmedXml(xml);
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
    const exact=/^\d{4}-\d{2}-\d{2}/.test(String(p.firstPublicationDate||''));
    return exact
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

  async function searchExact(refs,range){
    const merged=new Map();
    const batches=splitBatches(refs,x=>`"${x.ref}"`).slice(0,12);

    for(const batch of batches){
      const pubs=await pubmedSearch(`${contextClause()} AND ${refClause(batch)}`,range,50);
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

  async function searchTargets(targets,exactKeys,range){
    const merged=new Map();
    const batches=splitBatches(targets,x=>`"${x.target}"`).slice(0,12);

    for(const batch of batches){
      const pubs=await pubmedSearch(`${contextClause()} AND ${targetClause(batch)}`,range,50);
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

  async function runSearch(range){
    const refs=refsForWatch();
    const targets=targetsForWatch();

    if(!refs.length && !targets.length){
      throw new Error('Aucune référence catalogue ni cible exploitable dans Antibodies.');
    }

    const exact=refs.length ? await searchExact(refs,range) : [];
    const exactKeys=new Set(exact.map(publicationKey));
    const alternatives=targets.length ? await searchTargets(targets,exactKeys,range) : [];

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
      const result=await runSearch(dateRangeCurrent());
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
      console.error('[BioDynaMit PubMed watch]',err);
      const raw=err?.message||String(err);
      WATCH.error=/NetworkError|Failed to fetch|Load failed/i.test(raw)
        ? 'Connexion PubMed/NCBI bloquée par le navigateur ou le réseau.'
        : raw;
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
      const result=await runSearch(dateRangeOlder());
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
      console.error('[BioDynaMit PubMed archive]',err);
      WATCH.olderError=err?.message||String(err);
    }finally{
      WATCH.olderLoading=false;
      renderJournal();
    }
  }

  function pubLink(p){
    if(p.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p.pmid)}/`;
    if(p.doi) return `https://doi.org/${encodeURIComponent(p.doi)}`;
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
            <span class="pill neutral">PubMed</span>
          </div>
          <div style="font-size:15px;font-weight:850;margin-bottom:5px">📅 ${e(formatPublicationDate(p))}</div>
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

    if(loading) return '<div class="empty">Recherche PubMed en cours…</div>';
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
      return `<div class="card card-pad" style="margin-top:14px"><div class="empty">Recherche PubMed ${fromYear}–${toYear}…</div></div>`;
    }
    if(WATCH.olderError){
      return `<div class="card card-pad" style="margin-top:14px"><div class="banner error">${e(WATCH.olderError)}</div></div>`;
    }
    if(!WATCH.olderLoaded) return '';

    return `<div style="margin-top:18px">
      <div class="banner">
        <b>Archives ${fromYear}–${toYear}</b> —
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
          <button class="btn btn-primary" id="v1136RefreshWatch" ${WATCH.loading?'disabled':''}>
            ${WATCH.loading?'Recherche…':'Actualiser la veille'}
          </button>
        </div>

        <div class="banner" style="margin-top:12px">
          <b>Source :</b> PubMed / NCBI E-utilities · aucun compte ni proxy externe.
          🆕 « Très récent » = publication des 30 derniers jours ; « Récent » = moins de 6 mois.
          Les articles ${olderFrom}–${olderTo} restent accessibles séparément.
        </div>

        ${WATCH.lastRun?`<p class="subtitle" style="margin-top:10px">
          Dernière recherche : ${e(WATCH.lastRun.toLocaleString('fr-FR'))} ·
          ${WATCH.stats.exact} exactes · ${WATCH.stats.target} alternatives anticorps · ${WATCH.stats.method} alternatives méthodologiques
        </p>`:''}
      </div>

      <section style="margin-top:16px">
        <h2 class="section-title">1. Publications utilisant notre matériel — ${CURRENT_YEAR}</h2>
        <p class="subtitle">Même référence catalogue détectée dans le titre ou le résumé d’une publication mitochondriale.</p>
        ${cards(WATCH.exact,`Aucune référence exacte détectée en ${CURRENT_YEAR} avec les critères actuels.`)}
      </section>

      <section style="margin-top:22px">
        <h2 class="section-title">2. Alternatives sur les mêmes cibles — ${CURRENT_YEAR}</h2>
        <p class="subtitle">Même protéine/cible que notre stock, sans détection de notre référence catalogue exacte.</p>
        ${cards(WATCH.targetAlternatives,`Aucune alternative d’anticorps détectée en ${CURRENT_YEAR} pour le moment.`)}
      </section>

      <section style="margin-top:22px">
        <h2 class="section-title">3. Alternatives méthodologiques — ${CURRENT_YEAR}</h2>
        <p class="subtitle">Sondes, biosenseurs, tagging, protéomique ou microscopie avancée appliqués aux mêmes cibles.</p>
        ${cards(WATCH.methodAlternatives,`Aucune alternative méthodologique détectée en ${CURRENT_YEAR} pour le moment.`)}
      </section>

      <div class="card card-pad" style="margin-top:24px">
        <div class="row space-between" style="align-items:center;gap:12px">
          <div>
            <h3 class="section-title" style="margin-bottom:4px">Publications plus anciennes</h3>
            <p class="subtitle">${olderFrom}–${olderTo}, chargées uniquement quand tu en as besoin.</p>
          </div>
          <button class="btn" id="v1136Older" ${WATCH.olderLoading?'disabled':''}>
            ${WATCH.olderLoading?'Chargement…':(WATCH.olderVisible?'Masquer les publications anciennes':`Voir les publications ${olderFrom}–${olderTo}`)}
          </button>
        </div>
        ${olderSection()}
      </div>

      <div class="card card-pad" style="margin-top:22px">
        <h3 class="section-title">Notes du laboratoire</h3>
        ${N.length?`<table class="table"><tbody>${N.slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0)).map(n=>`<tr><td>${e(n.Author||'Utilisateur')}</td><td>${e(n.Text||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune note pour le moment.</div>'}
      </div>`;

    const refreshBtn=$('#v1136RefreshWatch');
    if(refreshBtn) refreshBtn.onclick=refreshWatch;

    const olderBtn=$('#v1136Older');
    if(olderBtn) olderBtn.onclick=loadOlder;
  }

  // Loaded last: deliberately overrides the v11.2 configurable journal renderer.
  window.journal=renderJournal;
  try{ journal=renderJournal; }catch(_){}

  window.BioDynaMitPublicationWatchV1136={
    state:WATCH,
    refresh:refreshWatch,
    loadOlder,
    version:VERSION,
    source:'PubMed / NCBI E-utilities'
  };
})();