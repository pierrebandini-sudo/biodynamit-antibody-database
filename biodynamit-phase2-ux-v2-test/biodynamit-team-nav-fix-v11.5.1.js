/* BioDynaMit v11.5.1 — Navigation fix */
(function(){
  'use strict';
  const team=window.BioDynaMitTeamV115;
  if(!team){console.error('BioDynaMit v11.5.1: team tools v11.5 missing.');return;}

  function injectTeamNav(){
    const nav=document.querySelector('#nav');
    if(!nav)return;
    let btn=nav.querySelector('[data-route="team-tools"]');
    if(!btn){
      btn=document.createElement('button');
      btn.className='nav-item';
      btn.dataset.route='team-tools';
      btn.innerHTML='<span>⚗</span><span>Outils équipe</span>';
      const alerts=nav.querySelector('[data-route="alerts"]');
      if(alerts)nav.insertBefore(btn,alerts); else nav.appendChild(btn);
      btn.onclick=()=>go('team-tools');
    }
    btn.classList.toggle('active',state?.route==='team-tools');
  }

  if(typeof renderNav==='function'&&!team._v1151NavWrapped){
    const baseRenderNav=renderNav;
    renderNav=function(){
      const out=baseRenderNav.apply(this,arguments);
      injectTeamNav();
      return out;
    };
    team._v1151NavWrapped=true;
  }

  try{injectTeamNav();}catch(e){console.warn(e);}

  const nav=document.querySelector('#nav');
  if(nav){
    let scheduled=false;
    const observer=new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        try{injectTeamNav();}catch(e){console.warn(e);}
      });
    });
    observer.observe(nav,{childList:true});
    team._v1151NavObserver=observer;
  }

  team.version='11.5.1';
  team.navFixVersion='11.5.1';
})();