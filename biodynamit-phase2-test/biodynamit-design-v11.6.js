/* Optional DOM decoration only: no Grist access, navigation, or calculations. */
(()=>{
 'use strict';
 let scheduled=false;
 function decorate(){
  scheduled=false;
  document.querySelectorAll('.v115-panel-form [data-v115-primary]').forEach(select=>{
   const field=select.closest('.field');
   if(field)field.dataset.bdSelected=String(Boolean(select.value));
  });
  document.querySelectorAll('.v115-spectrum>span').forEach(span=>{
   const name=span.textContent.toLowerCase();
   // Decorative marker only; labels and compatibility results are untouched.
   const color=/488|fitc|gfp/.test(name)?'green':/647|594|cy5/.test(name)?'red':/405|dapi|350/.test(name)?'violet':/555|568|cy3|tritc/.test(name)?'orange':'';
   if(color)span.dataset.bdFluor=color;else delete span.dataset.bdFluor;
  });
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(decorate);}}
 new MutationObserver(schedule).observe(document.getElementById('content'),{childList:true,subtree:true});
 document.addEventListener('change',e=>{if(e.target.matches('[data-v115-primary]'))schedule();});
 decorate();
})();
