/* BioDynaMit v11.2.4b — safe direct jump from a primary antibody vial to storage.
   Avoids forcing the 3D scene during route transition, which can lock the widget
   in some browsers/embedded Grist contexts. The user can switch back to 3D after load.
*/
(function(){
  'use strict';

  let jumping = false;

  window.openBoxForVial = function(vialId){
    if(jumping) return;

    const runtime = window.BioDynaMitIntegratedStorageV11;
    const sv = runtime?.state;

    try{
      const pos = rows(state.data.Positions).find(
        p => Number(p.Vial) === Number(vialId)
      );

      if(!pos){
        toast("Ce vial n’a pas de position attribuée.");
        return;
      }

      jumping = true;

      // Dispose an existing 3D scene before changing route.
      try{
        sv?.scene?.dispose?.();
      }catch(_){}
      if(sv) sv.scene = null;

      state.selectedVial = Number(vialId);
      state.selectedBox = Number(pos.Box);

      if(sv){
        sv.boxId = Number(pos.Box);
        sv.slot = pos.Slot;
        sv.opened = true;

        // Important hotfix:
        // direct jumps open in 2D first instead of forcing a new WebGL scene
        // during the route transition.
        sv.view = '2d';
      }

      go('storage');

      // Release the navigation guard after the new view has rendered.
      setTimeout(() => { jumping = false; }, 250);
    }catch(err){
      jumping = false;
      console.error("BioDynaMit open-box hotfix:", err);
      try{
        toast(`Erreur d’ouverture du stockage : ${err.message || err}`);
      }catch(_){}
    }
  };

  window.BioDynaMitOpenBoxHotfixV1124 = {
    version: '11.2.4b',
    mode: 'safe-2d-jump'
  };
})();
