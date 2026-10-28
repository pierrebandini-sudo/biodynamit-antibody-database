/* BioDynaMit v11.2 — pure configuration/inventory engine.
   No DOM, no Grist writes. Safe to unit-test in Node.
*/
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.BioDynaMitCoreV112=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='11.2.0';

  const DEFAULT_PALETTE={
    mouse:'#f1e96b',
    rabbit:'#a5e7ee',
    goat:'#f5a2aa',
    chicken:'#bd95ee',
    donkey:'#f4b6e5',
    rat:'#ffcf8c',
    unknown:'#d4dce3'
  };

  function normalizeText(value){
    return String(value??'')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function compact(value){ return normalizeText(value).replace(/\s+/g,''); }

  function canonicalTemperature(value){
    const n=compact(String(value??'').replace('℃','°c'));
    if(n.includes('-80')) return '-80°C';
    if(n.includes('-20')) return '-20°C';
    if(n==='4c'||n==='4°c'||(n.includes('4')&&n.includes('c'))) return '4°C';
    if(n.includes('room')||n.includes('rt')||n.includes('ambiant')) return 'RT';
    return String(value??'').trim();
  }

  function canonicalFluorophore(value){
    const n=compact(value);
    const aliases={
      af350:'AF350',alexafluor350:'AF350',
      af405:'AF405',alexafluor405:'AF405',
      af488:'AF488',alexafluor488:'AF488',
      af555:'AF555',alexafluor555:'AF555',
      af568:'AF568',alexafluor568:'AF568',
      af594:'AF594',alexafluor594:'AF594',
      af647:'AF647',alexafluor647:'AF647',
      cy3:'CY3',cydye3:'CY3',cy5:'CY5',cydye5:'CY5',
      cydye800:'CYDYE800',cy800:'CYDYE800',
      d350:'D350',d405:'D405',d649:'DYLIGHT649',dylight649:'DYLIGHT649',
      bodipy:'BODIPY',cf555:'CF555'
    };
    return aliases[n]||String(value??'').trim().toUpperCase().replace(/\s+/g,'');
  }

  function hostKey(value){
    const n=compact(value);
    return ({
      mouse:'mouse',souris:'mouse',
      rabbit:'rabbit',lapin:'rabbit',
      goat:'goat',chevre:'goat',
      chicken:'chicken',poulet:'chicken',
      donkey:'donkey',ane:'donkey',
      rat:'rat'
    })[n]||'unknown';
  }

  function parseSlot(slot){
    const m=/^([A-Z])(\d{1,2})$/i.exec(String(slot??'').trim());
    if(!m) return null;
    return {row:m[1].toUpperCase().charCodeAt(0)-65,col:Number(m[2])-1,slot:m[1].toUpperCase()+Number(m[2])};
  }

  function safeNumber(v){
    if(v===null||v===undefined||v==='') return null;
    const n=Number(v);
    return Number.isFinite(n)?n:null;
  }

  function parseSecondaryStorageLabel(raw){
    let s=String(raw??'').trim();
    const dateMatch=s.match(/(\d{2}\/\d{2}\/\d{4})/);
    const dateLabel=dateMatch?dateMatch[1]:'';
    if(dateMatch) s=s.replace(dateMatch[1],' ');
    const stockMarker=/\bSTOCK\b/i.test(s);
    s=s.replace(/\bSTOCK\b/ig,' ').replace(/\s+/g,' ').trim();
    const low=s.toLowerCase();
    if(low==='dapi') return {
      raw:String(raw??''),cleanLabel:s,kind:'other_reagent',
      hostSpecies:'',targetSpecies:'',fluorophore:'DAPI',dateLabel,stockMarker
    };
    let hostSpecies='';
    const antiPos=low.indexOf('anti');
    for(const h of ['goat','donkey','rabbit','mouse','rat','chicken']){
      const p=low.indexOf(h);
      if(p>=0 && antiPos>=0 && p<antiPos){ hostSpecies=h[0].toUpperCase()+h.slice(1); break; }
    }
    const targetMatch=low.match(/anti[\s-]*(rabbit|mouse|rat|goat|chicken)\b/);
    const targetSpecies=targetMatch?targetMatch[1][0].toUpperCase()+targetMatch[1].slice(1):'';
    let fluorophore='';
    for(const token of ['AF350','AF405','AF488','AF555','AF568','AF594','AF647','D350','D405','D649','Bodipy','Cy5','Cy3','CF555','580']){
      if(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(s)){
        fluorophore=token==='580'?'580':canonicalFluorophore(token);
        break;
      }
    }
    return {
      raw:String(raw??''),cleanLabel:s,
      kind:targetSpecies?'secondary':'unknown',
      hostSpecies,targetSpecies,fluorophore,dateLabel,stockMarker
    };
  }

  function secondaryMatchCandidates(parsed,temperature,items){
    if(!parsed || parsed.kind!=='secondary') return [];
    const temp=canonicalTemperature(temperature);
    const candidates=[];
    for(const item of items||[]){
      const target=String(item.targetSpecies||item.TargetSpecies||'').toLowerCase();
      const ptarget=String(parsed.targetSpecies||'').toLowerCase();
      const fluor=canonicalFluorophore(item.fluorophore||item.Fluorophore||'');
      const pfluor=canonicalFluorophore(parsed.fluorophore||'');
      if(ptarget && target!==ptarget) continue;
      if(pfluor && fluor!==pfluor) continue;
      let score=0;
      const reasons=[];
      if(ptarget){ score+=4; reasons.push('target_species'); }
      if(pfluor){ score+=4; reasons.push('fluorophore'); }
      if(temp && canonicalTemperature(item.storageTemperature||item.StorageTemperature||item.storage||'')===temp){
        score+=2; reasons.push('temperature');
      }
      const phost=normalizeText(parsed.hostSpecies);
      const ihost=normalizeText(item.hostSpecies||item.HostSpecies||'');
      if(phost){
        if(phost===ihost){ score+=2; reasons.push('host_species'); }
        else { score-=1; reasons.push('host_mismatch'); }
      }
      candidates.push({score,item,reasons});
    }
    return candidates.sort((a,b)=>b.score-a.score || String(a.item.code||'').localeCompare(String(b.item.code||'')));
  }

  function reconcileSecondaryLabel(rawLabel,temperature,items){
    const parsed=parseSecondaryStorageLabel(rawLabel);
    if(parsed.kind==='other_reagent') return {parsed,status:'other_reagent',candidate:null,candidates:[]};
    const candidates=secondaryMatchCandidates(parsed,temperature,items);
    if(!candidates.length) return {parsed,status:'unresolved',candidate:null,candidates:[]};
    const candidate=candidates[0];
    const status=candidate.score>=11?'auto':candidate.score>=8?'review':'unresolved';
    return {parsed,status,candidate,candidates};
  }

  function sameNonEmpty(a,b){
    const x=normalizeText(a), y=normalizeText(b);
    return !!x && !!y && x===y;
  }

  function duplicateScore(a,b){
    if(!a||!b) return {score:0,reasons:[]};
    let score=0;
    const reasons=[];
    if(sameNonEmpty(a.catalogNumber||a.CatalogNumber,b.catalogNumber||b.CatalogNumber)){
      score+=60; reasons.push('same_catalog');
      if(sameNonEmpty(a.supplier||a.Supplier,b.supplier||b.Supplier)){ score+=20; reasons.push('same_supplier'); }
    }
    if(sameNonEmpty(a.name||a.Name,b.name||b.Name)){ score+=25; reasons.push('same_name'); }
    if(sameNonEmpty(a.target||a.Target||a.targetSpecies||a.TargetSpecies,b.target||b.Target||b.targetSpecies||b.TargetSpecies)){
      score+=10; reasons.push('same_target');
    }
    if(sameNonEmpty(a.fluorophore||a.Fluorophore,b.fluorophore||b.Fluorophore)){
      score+=10; reasons.push('same_fluorophore');
    }
    if(sameNonEmpty(a.hostSpecies||a.HostSpecies,b.hostSpecies||b.HostSpecies)){
      score+=5; reasons.push('same_host');
    }
    if(score>100) score=100;
    return {score,reasons};
  }

  function findDuplicateCandidates(item,existing,threshold=50){
    return (existing||[])
      .map(x=>({record:x,...duplicateScore(item,x)}))
      .filter(x=>x.score>=threshold)
      .sort((a,b)=>b.score-a.score);
  }

  function toComparable(value){
    if(typeof value==='string') return normalizeText(value);
    return value;
  }

  function evaluateCondition(entity,rule){
    if(!rule || rule.enabled===false || rule.Enabled===false) return false;
    const field=rule.field||rule.Field||rule.conditionField||rule.ConditionField;
    const operator=rule.operator||rule.Operator||'equals';
    const expected=rule.value??rule.Value??rule.compareValue??rule.CompareValue;
    const actual=entity?.[field];
    switch(operator){
      case 'equals': return toComparable(actual)===toComparable(expected);
      case 'not_equals': return toComparable(actual)!==toComparable(expected);
      case 'contains': return normalizeText(actual).includes(normalizeText(expected));
      case 'not_contains': return !normalizeText(actual).includes(normalizeText(expected));
      case 'empty': return actual===null||actual===undefined||String(actual).trim()==='';
      case 'not_empty': return !(actual===null||actual===undefined||String(actual).trim()==='');
      case 'lt': return safeNumber(actual)!==null && safeNumber(expected)!==null && Number(actual)<Number(expected);
      case 'lte': return safeNumber(actual)!==null && safeNumber(expected)!==null && Number(actual)<=Number(expected);
      case 'gt': return safeNumber(actual)!==null && safeNumber(expected)!==null && Number(actual)>Number(expected);
      case 'gte': return safeNumber(actual)!==null && safeNumber(expected)!==null && Number(actual)>=Number(expected);
      case 'in': {
        const values=Array.isArray(expected)?expected:String(expected??'').split('|').map(x=>x.trim());
        return values.map(toComparable).includes(toComparable(actual));
      }
      case 'regex': {
        try{return new RegExp(String(expected),'i').test(String(actual??''));}catch(_){return false;}
      }
      default:return false;
    }
  }

  function buildRuleAlerts(entities,rules,entityType='item'){
    const out=[];
    for(const entity of entities||[]){
      for(const rule of rules||[]){
        if(rule.enabled===false||rule.Enabled===false) continue;
        const rt=normalizeText(rule.entityType||rule.EntityType||'');
        if(rt && rt!==normalizeText(entityType)) continue;
        if(!evaluateCondition(entity,rule)) continue;
        out.push({
          ruleKey:rule.key||rule.Key||rule.name||rule.Name||'rule',
          severity:rule.severity||rule.Severity||'warning',
          entityType,
          entityCode:entity.code||entity.Code||String(entity.id||''),
          title:rule.title||rule.Title||rule.name||rule.Name||'Alerte',
          message:String(rule.message||rule.Message||'').replace(/\{(\w+)\}/g,(_,k)=>String(entity?.[k]??''))
        });
      }
    }
    return out;
  }

  function checkStorageIntegrity({containers=[],positions=[],units=[]}={}){
    const issues=[];
    const containerIds=new Set(containers.map(x=>String(x.id??x.code??x.Code)));
    const unitIds=new Set(units.map(x=>String(x.id??x.code??x.Code)));
    const usedUnits=new Map();
    const slotKeys=new Set();
    for(const p of positions){
      const cid=String(p.containerId??p.Container??p.containerCode??p.Box??'');
      const slot=String(p.slot??p.Slot??'').toUpperCase();
      const uid=String(p.unitId??p.Unit??p.unitCode??p.Vial??'');
      if(cid && !containerIds.has(cid)){
        issues.push({severity:'error',kind:'missing_container',position:p,message:`Position ${slot||'?'} : conteneur introuvable.`});
      }
      if(slot && !parseSlot(slot)){
        issues.push({severity:'error',kind:'invalid_slot',position:p,message:`Position invalide : ${slot}.`});
      }
      const key=`${cid}|${slot}`;
      if(slotKeys.has(key)) issues.push({severity:'error',kind:'duplicate_slot',position:p,message:`Position dupliquée : ${slot}.`});
      slotKeys.add(key);
      if(uid && uid!=='0'){
        if(!unitIds.has(uid)) issues.push({severity:'error',kind:'missing_unit',position:p,message:`${slot} : unité référencée introuvable.`});
        if(usedUnits.has(uid)) issues.push({severity:'error',kind:'unit_in_multiple_positions',position:p,message:`Unité ${uid} présente dans plusieurs positions.`});
        usedUnits.set(uid,key);
      }
      const available=p.available??p.Available;
      if(uid && uid!=='0' && available===true) issues.push({severity:'warning',kind:'occupied_marked_available',position:p,message:`${slot} est occupée mais marquée disponible.`});
      if((!uid||uid==='0') && available===false) issues.push({severity:'warning',kind:'empty_marked_unavailable',position:p,message:`${slot} est vide mais marquée indisponible.`});
    }
    return issues;
  }

  function suggestSmartSlot({positions=[],units=[],targetItemId=null,containerId=null}={}){
    const pid=x=>String(x.id??x.code??x.Code);
    const uid=x=>String(x.id??x.code??x.Code);
    const unitMap=new Map(units.map(u=>[uid(u),u]));
    const positionsIn=positions
      .filter(p=>containerId===null || String(p.containerId??p.Container??p.containerCode??p.Box??'')===String(containerId))
      .map(p=>({...p,_slot:parseSlot(p.slot??p.Slot)}))
      .filter(p=>p._slot);
    const free=positionsIn.filter(p=>{
      const u=p.unitId??p.Unit??p.unitCode??p.Vial;
      return !u || String(u)==='0';
    });
    if(!free.length) return null;
    const peers=positionsIn.filter(p=>{
      const u=p.unitId??p.Unit??p.unitCode??p.Vial;
      const unit=unitMap.get(String(u??''));
      const item=unit?.itemId??unit?.Item??unit?.itemCode;
      return targetItemId!==null && String(item??'')===String(targetItemId);
    });
    function slotOrder(a,b){ return a._slot.row-b._slot.row || a._slot.col-b._slot.col; }
    if(!peers.length) return free.sort(slotOrder)[0];
    const scored=free.map(p=>{
      const dist=Math.min(...peers.map(q=>Math.abs(p._slot.row-q._slot.row)+Math.abs(p._slot.col-q._slot.col)));
      return {p,dist};
    }).sort((a,b)=>a.dist-b.dist || slotOrder(a.p,b.p));
    return {...scored[0].p,_distanceToPeer:scored[0].dist};
  }

  function classifyDocument(doc){
    const text=normalizeText(`${doc?.title||doc?.Title||''} ${doc?.type||doc?.Type||''} ${doc?.notes||doc?.Notes||''} ${doc?.link||doc?.Link||''}`);
    if(/datasheet|data sheet|fiche produit|product sheet|thermofisher|cellsignal|abcam|ptglab|sigmaaldrich|cytiva/.test(text)) return 'Datasheet';
    if(/doi org|pubmed|europepmc|publication|article|journal|pmid/.test(text)) return 'Publication';
    if(/protocol|protocole|immunofluorescence|western blot|ihc|icc|staining/.test(text)) return 'Protocole';
    if(/image|capture|microscop|western|wb|immunostain|\\.png|\\.jpg|\\.jpeg|\\.webp/.test(text)) return 'Image / capture';
    return 'Autre';
  }

  function publicationDateValue(p){
    const raw=String(p?.firstPublicationDate||p?.date||p?.Date||'').trim();
    if(raw){
      const ts=Date.parse(raw.length===4?`${raw}-01-01`:raw);
      if(!Number.isNaN(ts)) return ts;
    }
    const year=Number(p?.pubYear||p?.year||0);
    return year?Date.UTC(year,0,1):0;
  }

  function publicationRecency(p,now=Date.now()){
    const ts=publicationDateValue(p);
    if(!ts) return {key:'unknown',label:'Date inconnue',days:Infinity};
    const days=Math.max(0,Math.floor((now-ts)/86400000));
    if(days<=30) return {key:'very_recent',label:'Très récent',days};
    if(days<=183) return {key:'recent',label:'Récent',days};
    return {key:'older',label:'Plus ancien',days};
  }

  function configMap(rows,keyField='Key',valueField='Value'){
    const m={};
    for(const r of rows||[]){
      const k=r?.[keyField]??r?.key;
      if(k!==undefined&&k!==null&&String(k).trim()) m[String(k)]=r?.[valueField]??r?.value;
    }
    return m;
  }

  return {
    VERSION,DEFAULT_PALETTE,
    normalizeText,compact,canonicalTemperature,canonicalFluorophore,hostKey,parseSlot,
    parseSecondaryStorageLabel,secondaryMatchCandidates,reconcileSecondaryLabel,
    duplicateScore,findDuplicateCandidates,evaluateCondition,buildRuleAlerts,
    checkStorageIntegrity,suggestSmartSlot,classifyDocument,
    publicationDateValue,publicationRecency,configMap
  };
});
