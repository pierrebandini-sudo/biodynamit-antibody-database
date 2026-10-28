/* BioDynaMit v11.3 — pure security policy engine.
   No DOM, no Grist calls. Safe to unit-test in Node.
*/
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.BioDynaMitSecurityCoreV113=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='11.3.0';

  const ROLES=Object.freeze({
    ADMIN:'admin',
    EDITOR:'editor',
    VIEWER:'viewer',
    UNCONFIGURED:'unconfigured'
  });

  const ACTION_CLASS={
    AddRecord:'create', BulkAddRecord:'create',
    UpdateRecord:'update', BulkUpdateRecord:'update',
    RemoveRecord:'delete', BulkRemoveRecord:'delete',
    AddTable:'schema', AddColumn:'schema', AddVisibleColumn:'schema',
    ModifyColumn:'schema', RenameColumn:'schema', RemoveColumn:'schema',
    RemoveTable:'schema', RenameTable:'schema',
    AddViewSection:'schema', RemoveViewSection:'schema'
  };

  function actionName(action){
    return Array.isArray(action)?String(action[0]||''):String(action||'');
  }

  function classifyAction(action){
    const name=actionName(action);
    return ACTION_CLASS[name]||(
      /^Add/.test(name)?'create':
      /^Update|^Modify|^Rename/.test(name)?'update':
      /^Remove|^Delete/.test(name)?'delete':
      'other'
    );
  }

  function isMutation(action){
    return ['create','update','delete','schema'].includes(classifyAction(action));
  }

  function isDelete(action){ return classifyAction(action)==='delete'; }
  function isSchema(action){ return classifyAction(action)==='schema'; }

  function canApply(role,action,enforcement=true){
    if(!enforcement) return {allowed:true,reason:'security_off'};
    if(role===ROLES.ADMIN || role===ROLES.UNCONFIGURED) return {allowed:true,reason:'admin_or_setup'};
    if(role===ROLES.VIEWER){
      return isMutation(action)
        ? {allowed:false,reason:'viewer_read_only'}
        : {allowed:true,reason:'read_only_nonmutation'};
    }
    if(role===ROLES.EDITOR){
      if(isDelete(action)) return {allowed:false,reason:'editor_no_delete'};
      if(isSchema(action)) return {allowed:false,reason:'editor_no_schema'};
      return {allowed:true,reason:'editor_create_update'};
    }
    return {allowed:false,reason:'unknown_role'};
  }

  function roleLabel(role){
    return ({
      admin:'Administrateur',
      editor:'Utilisateur labo',
      viewer:'Lecture seule',
      unconfigured:'Sécurité non configurée'
    })[role]||'Rôle inconnu';
  }

  function actionLabel(action){
    const cls=classifyAction(action);
    return ({
      create:'Création',
      update:'Modification',
      delete:'Suppression',
      schema:'Structure',
      other:'Action'
    })[cls];
  }

  function tableFromAction(action){
    return Array.isArray(action) && action.length>1 ? String(action[1]||'') : '';
  }

  return {
    VERSION,ROLES,ACTION_CLASS,actionName,classifyAction,isMutation,isDelete,isSchema,
    canApply,roleLabel,actionLabel,tableFromAction
  };
});
