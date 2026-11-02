/* BioDynaMit 11.8.3 TEST. View helpers only; no Grist API, no stored lab data. */
(function(){
  'use strict';
  const pages=new Map();
  function mount({table,key,items,renderRows,onDraw=()=>{},pageSize=50}){
    table._bdPager?.destroy();
    const body=table.tBodies[0],host=table.closest('.table-wrap')||table;
    const pager=document.createElement('div');
    pager.className='bd1183-pager row';pager.setAttribute('aria-label','Pagination des références');
    pager.innerHTML='<button class="btn btn-sm" data-bd-prev>← Précédent</button><span class="subtitle" role="status" aria-live="polite"></span><button class="btn btn-sm" data-bd-next>Suivant →</button>';
    host.after(pager);
    const prev=pager.querySelector('[data-bd-prev]'),next=pager.querySelector('[data-bd-next]'),label=pager.querySelector('span');
    let list=items,page=pages.get(key)||0,disposed=false;
    function draw(){
      if(disposed||!table.isConnected)return;
      const count=list.length,max=Math.max(0,Math.ceil(count/pageSize)-1);
      page=Math.max(0,Math.min(page,max));pages.set(key,page);
      const start=page*pageSize;
      body.innerHTML=renderRows(list.slice(start,start+pageSize));
      label.textContent=count?`${start+1}–${Math.min(start+pageSize,count)} sur ${count} référence(s)`:'Aucun résultat';
      prev.disabled=page===0;next.disabled=page>=max;
      pager.hidden=count<=pageSize;
      onDraw();
    }
    prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};
    const api={setItems(value,{reset=false}={}){list=value;if(reset)page=0;draw();},destroy(){disposed=true;pager.remove();if(table._bdPager===api)delete table._bdPager;},get total(){return list.length;},get page(){return page;}};
    table._bdPager=api;draw();return api;
  }
  window.BioDynaMitListViewV1183=Object.freeze({mount,pageSize:50});
})();
