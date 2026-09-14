
// BioDynaMit — vue boîte "chatgpt.site" pour Grist
// Remplace uniquement l'interface de visualisation des boîtes.
// Grist reste la source de vérité.

(function () {
  const C = {
    navy:'#0d2f52',
    blue:'#0b78e3',
    pale:'#eef6fd',
    border:'#d9e5f0',
    ink:'#15243a',
    muted:'#61758a',
    cream:'#d9c7a7',
    cream2:'#eadfc9',
    paper:'#f7f7f4'
  };

  const q = s => document.querySelector(s);

  function boxPositions(boxId) {
    return rows(state.data.Positions).filter(p => Number(p.Box) === Number(boxId));
  }

  function allAntibodies() {
    return rows(state.data.Antibodies || []).slice().sort((a,b)=>
      String(a.Name||a.FullName||'').localeCompare(String(b.Name||b.FullName||''),'fr')
    );
  }

  function findSlot(ps, slot) {
    return ps.find(p => String(p.Slot) === String(slot));
  }

  function slotParts(slot) {
    const m = /^([A-Z])(\d+)$/.exec(String(slot || ''));
    return m ? {r:m[1].charCodeAt(0)-65,c:Number(m[2])-1} : null;
  }

  function capColor(vialId) {
    const palette = [0x77b8cf,0xe6d85c,0x9bcf7b,0xd78282,0x8ca1b4,0xcacaca,0x7f9fe0];
    return palette[Math.abs(Number(vialId)||0) % palette.length];
  }

  function planCellColor(vialId) {
    if (!vialId) return '#ffffff';
    const palette = ['#b8e3ef','#ffe56f','#dcecf2','#f0a3a3','#cde7ef'];
    return palette[Math.abs(Number(vialId)||0) % palette.length];
  }

  async function createVialAt(pos) {
    if (!pos || Number(pos.Vial)) return toast('Cette position est déjà occupée.');

    const antibodies = allAntibodies();
    if (!antibodies.length) return toast('Aucun anticorps disponible.');

    modal(`
      <h2>Ajouter un vial — ${esc(pos.Slot)}</h2>
      <p class="subtitle">Le vial sera créé dans Grist et placé directement dans cette position.</p>
      <div class="field">
        <label>Anticorps</label>
        <select id="siteNewAb">
          ${antibodies.map(a=>{
            const n=a.Name||a.FullName||a.Code||`Anticorps ${a.id}`;
            const cat=a.CatalogNumber?` — ${a.CatalogNumber}`:'';
            const sup=a.Supplier?` — ${a.Supplier}`:'';
            return `<option value="${a.id}">${esc(n+cat+sup)}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field">
          <label>Remplissage</label>
          <select id="siteNewFill">
            <option>Plein</option>
            <option>≈ 50 %</option>
            <option>Inconnu</option>
          </select>
        </div>
        <div class="field">
          <label>Volume estimé (µL)</label>
          <input id="siteNewVol" type="number" min="0" step="1" placeholder="ex. 100">
        </div>
      </div>
      <div class="field" style="margin-top:12px">
        <label>Commentaire</label>
        <textarea id="siteNewComment" placeholder="Optionnel"></textarea>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="siteCancelAdd">Annuler</button>
        <button class="btn btn-primary" id="siteConfirmAdd">Ajouter le vial</button>
      </div>
    `);

    q('#siteCancelAdd').onclick = closeModal;
    q('#siteConfirmAdd').onclick = async () => {
      const antibodyId = Number(q('#siteNewAb').value);
      const fill = q('#siteNewFill').value;
      const volumeText = q('#siteNewVol').value.trim();
      const volume = volumeText === '' ? null : Number(volumeText);
      const comment = q('#siteNewComment').value.trim();
      const code = `V-${Date.now().toString().slice(-9)}`;

      try {
        if (!state.connected) {
          const arr = rows(state.data.Vials);
          const id = Math.max(0,...arr.map(v=>Number(v.id)||0))+1;
          arr.push({id,Code:code,Antibody:antibodyId,FillStatus:fill,EstimatedVolume_uL:volume,Status:'En stock',Comments:comment});
          pos.Vial=id; pos.Available=false;
          closeModal(); toast(`Vial ajouté en ${pos.Slot}.`); go('box3d');
          return;
        }

        await grist.docApi.applyUserActions([
          ['AddRecord','Vials',null,{
            Code:code,
            Antibody:antibodyId,
            FillStatus:fill,
            EstimatedVolume_uL:volume,
            Status:'En stock',
            Comments:comment
          }]
        ]);

        await loadAll();
        const vial = rows(state.data.Vials).find(v=>v.Code===code);
        if (!vial) throw new Error('Vial créé mais introuvable.');

        await grist.docApi.applyUserActions([
          ['UpdateRecord','Positions',pos.id,{Vial:vial.id,Available:false}],
          ['AddRecord','History',null,{
            Date:Date.now()/1000,
            Action:'Ajout vial',
            EntityType:'Vial',
            EntityCode:code,
            Details:`Ajout direct en ${pos.Slot}`,
            User:'Grist'
          }]
        ]);

        closeModal();
        await loadAll();
        state.selectedVial=vial.id;
        toast(`Vial ajouté en ${pos.Slot}.`);
        go('box3d');
      } catch(e) {
        console.error(e);
        toast(`Erreur : ${e.message||e}`);
      }
    };
  }

  function showVialModal(pos) {
    const v = rowById('Vials', Number(pos.Vial));
    const a = v ? rowById('Antibodies', Number(v.Antibody)) : null;
    const b = rowById('Boxes', Number(pos.Box));
    const free = rows(state.data.Positions).filter(p=>Number(p.Box)===Number(pos.Box) && !Number(p.Vial));

    modal(`
      <div class="row space-between">
        <div>
          <h2 style="margin:0">${esc(a?.Name||a?.FullName||'Vial')}</h2>
          <p class="subtitle" style="margin:4px 0 0">${esc(v?.Code||'')} · position ${esc(pos.Slot)}</p>
        </div>
        ${statusPill(v?.FillStatus)}
      </div>
      <dl class="detail-list" style="margin-top:16px">
        <dt>Référence</dt><dd>${esc(a?.CatalogNumber||'—')}</dd>
        <dt>Fournisseur</dt><dd>${esc(a?.Supplier||'—')}</dd>
        <dt>Volume</dt><dd>${esc(v?.EstimatedVolume_uL ?? '—')} µL</dd>
        <dt>Température</dt><dd>${esc(b?.Temperature||'—')}</dd>
        <dt>Boîte</dt><dd>${esc(b?.Name||b?.Code||'—')}</dd>
      </dl>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap;margin-top:18px">
        <button class="btn" id="siteCloseVial">Fermer</button>
        <button class="btn" id="siteMoveVial">Déplacer</button>
        <button class="btn btn-primary" id="siteViewAb">Voir l'anticorps</button>
      </div>
    `);
    q('#siteCloseVial').onclick=closeModal;
    q('#siteMoveVial').onclick=()=>{ closeModal(); showMoveModal(pos,free); };
    q('#siteViewAb').onclick=()=>{
      closeModal();
      if(a){state.selectedAntibody=Number(a.id);go('antibody-detail')}
    };
  }

  function build2D(box, ps) {
    const r=Number(box.Rows||10), c=Number(box.Columns||10);
    const map=new Map(ps.map(p=>[String(p.Slot),p]));
    let cells='';
    for(let y=0;y<r;y++){
      for(let x=0;x<c;x++){
        const slot=`${String.fromCharCode(65+y)}${x+1}`;
        const p=map.get(slot);
        const occ=!!(p&&Number(p.Vial));
        const v=occ?rowById('Vials',Number(p.Vial)):null;
        const a=v?rowById('Antibodies',Number(v.Antibody)):null;
        cells += `
          <button class="site2d-cell ${occ?'occupied':''}" data-slot="${slot}"
            title="${esc(occ ? `${slot} — ${a?.Name||v?.Code||'Vial'}` : `${slot} — libre`)}">
            <span class="site2d-slot">${slot}</span>
            ${occ?`<span class="site2d-name">${esc(a?.Name||'Vial')}</span>`:'<span class="site2d-add">+</span>'}
          </button>`;
      }
    }

    return `
      <div class="site2d-wrap">
        <div class="site2d-cols">${Array.from({length:c},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
        <div class="site2d-rows">${Array.from({length:r},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join('')}</div>
        <div class="site2d-grid" style="grid-template-columns:repeat(${c},1fr)">${cells}</div>
      </div>`;
  }

  // The main box page now matches the ChatGPT.site composition.
  window.box3d = function box3d() {
    const box = rowById('Boxes',state.selectedBox) || rows(state.data.Boxes)[0];
    if(!box){go('storage');return;}

    const ps = boxPositions(box.id);
    const occupied = ps.filter(p=>Number(p.Vial)).length;
    const total = Number(box.Rows||10)*Number(box.Columns||10);

    topbar('Stockage');

    content.innerHTML = `
      <div class="site-box-card">
        <div class="site-box-head">
          <div>
            <h2>${esc(box.Name||box.Code)}</h2>
            <p>${Number(box.Rows||10)} × ${Number(box.Columns||10)} positions · A1 à ${String.fromCharCode(64+Number(box.Rows||10))}${Number(box.Columns||10)}</p>
          </div>
          <div class="site-box-actions">
            <div class="site-segment">
              <button class="active" id="site3DTab">3D</button>
              <button id="site2DTab">2D</button>
            </div>
            <button class="btn" id="siteCloseBox">▣ Fermer</button>
          </div>
        </div>

        <div class="site-box-body">
          <div id="site3DView" class="site-view-pane">
            <canvas id="threeCanvas"></canvas>
            <div class="site-help">Glisser pour pivoter · Molette pour zoomer · Cliquer pour sélectionner</div>
            <div class="site-bottom-left">
              <button class="btn" id="siteCenterBtn">↶ Recentrer</button>
              <button class="btn" id="siteTopBtn">▦ Vue du dessus</button>
            </div>
            <div class="site-photo-note">D'après photos · proportions estimées</div>
          </div>

          <div id="site2DView" class="site-view-pane hidden">
            <div class="site-2d-head">
              <div><b>Plan de la boîte</b><span>${occupied} / ${total} positions occupées</span></div>
              <small>Cliquez sur une case vide pour ajouter un vial.</small>
            </div>
            ${build2D(box,ps)}
          </div>
        </div>
      </div>
    `;

    injectSiteCSS();

    q('#siteCloseBox').onclick=()=>go('storage');
    q('#site3DTab').onclick=()=>switchMode('3d');
    q('#site2DTab').onclick=()=>switchMode('2d');

    document.querySelectorAll('.site2d-cell').forEach(el=>{
      el.onclick=()=>{
        const p=findSlot(ps,el.dataset.slot);
        if(!p)return;
        if(Number(p.Vial)) showVialModal(p);
        else createVialAt(p);
      };
    });

    init3D(box,ps);
  };

  function switchMode(mode){
    const is3d = mode==='3d';
    q('#site3DView')?.classList.toggle('hidden',!is3d);
    q('#site2DView')?.classList.toggle('hidden',is3d);
    q('#site3DTab')?.classList.toggle('active',is3d);
    q('#site2DTab')?.classList.toggle('active',!is3d);
  }

  function injectSiteCSS(){
    if(document.getElementById('siteBoxCSS'))return;
    const style=document.createElement('style');
    style.id='siteBoxCSS';
    style.textContent=`
      .site-box-card{background:#fff;border:1px solid ${C.border};border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(21,55,91,.06);min-height:720px}
      .site-box-head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #edf1f5}
      .site-box-head h2{margin:0;font-size:21px}
      .site-box-head p{margin:7px 0 0;color:${C.muted}}
      .site-box-actions{display:flex;gap:10px;align-items:center}
      .site-segment{display:flex;background:#edf2f7;padding:3px;border-radius:11px}
      .site-segment button{border:0;background:transparent;padding:8px 12px;border-radius:8px;color:${C.muted};cursor:pointer}
      .site-segment button.active{background:#fff;color:${C.ink};box-shadow:0 1px 4px rgba(0,0,0,.12)}
      .site-box-body{background:linear-gradient(180deg,#f6fbff,#fff);min-height:640px}
      .site-view-pane{position:relative;height:640px;overflow:hidden}
      #threeCanvas{display:block;width:100%;height:100%}
      .site-help{position:absolute;left:50%;bottom:72px;transform:translateX(-50%);background:rgba(255,255,255,.90);padding:8px 14px;border-radius:18px;color:#4f6780;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
      .site-bottom-left{position:absolute;left:18px;bottom:16px;display:flex;gap:8px}
      .site-photo-note{position:absolute;right:18px;bottom:20px;font-size:12px;color:#58708a}
      .site-2d-head{display:flex;justify-content:space-between;padding:22px 24px 6px;color:${C.ink}}
      .site-2d-head span{display:block;font-size:12px;color:${C.muted};margin-top:4px}
      .site-2d-head small{color:${C.muted}}
      .site2d-wrap{position:relative;width:min(820px,86%);margin:12px auto 0;padding:32px 0 0 32px}
      .site2d-cols{position:absolute;left:32px;right:0;top:0;display:grid;grid-template-columns:repeat(10,1fr);text-align:center;color:#607589;font-size:12px}
      .site2d-rows{position:absolute;left:0;top:32px;bottom:0;display:grid;grid-template-rows:repeat(10,1fr);align-items:center;color:#607589;font-size:12px}
      .site2d-grid{display:grid;gap:5px;background:#d9c7a7;padding:10px;border:10px solid #f4f2ec;box-shadow:0 8px 24px rgba(21,55,91,.10)}
      .site2d-cell{min-width:0;aspect-ratio:1;border:1px solid #c4b28f;background:#fffdf8;border-radius:4px;cursor:pointer;padding:3px;display:flex;flex-direction:column;justify-content:center;align-items:center;overflow:hidden}
      .site2d-cell:hover{outline:2px solid #0b78e3;z-index:2}
      .site2d-cell.occupied{background:#bde5ee}
      .site2d-slot{font-size:10px;font-weight:700;color:#5e7182}
      .site2d-name{font-size:9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .site2d-add{font-size:18px;color:#8ba1b5;line-height:1}
      @media(max-width:900px){.site-box-head{align-items:flex-start;gap:12px}.site-box-actions{flex-wrap:wrap;justify-content:flex-end}.site-view-pane{height:560px}.site-help{display:none}.site-photo-note{display:none}}
    `;
    document.head.appendChild(style);
  }

  window.init3D = function init3D(box,positions){
    const canvas=q('#threeCanvas');
    if(!canvas||!window.THREE)return;
    const THREE=window.THREE;
    const stage=canvas.parentElement;

    try{
      if(state?.three){
        try{cancelAnimationFrame(state.three.frame)}catch(_){}
        try{state.three.ro?.disconnect()}catch(_){}
        try{state.three.renderer?.dispose()}catch(_){}
      }

      const rect=stage.getBoundingClientRect();
      const w=Math.max(640,rect.width||900), h=Math.max(520,rect.height||640);
      const scene=new THREE.Scene();
      scene.background=new THREE.Color(0xf7fbfe);

      const camera=new THREE.PerspectiveCamera(34,w/h,0.1,100);
      const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.setSize(w,h,false);
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=THREE.PCFSoftShadowMap;

      scene.add(new THREE.HemisphereLight(0xffffff,0x9aa7ae,1.5));
      const key=new THREE.DirectionalLight(0xffffff,1.5);
      key.position.set(8,12,10);key.castShadow=true;scene.add(key);

      const floor=new THREE.Mesh(
        new THREE.PlaneGeometry(34,24),
        new THREE.ShadowMaterial({color:0x7b8790,opacity:.10})
      );
      floor.rotation.x=-Math.PI/2;floor.position.y=-1.15;floor.receiveShadow=true;scene.add(floor);

      const group=new THREE.Group();
      scene.add(group);

      const rr=Number(box.Rows||10),cc=Number(box.Columns||10);
      const cell=.62;
      const innerW=cc*cell,innerD=rr*cell;
      const boxW=innerW+.72,boxD=innerD+.72;

      const white=new THREE.MeshStandardMaterial({color:0xf5f3ec,roughness:.94});
      const edge=new THREE.MeshStandardMaterial({color:0xe8e3d7,roughness:.96});
      const card=new THREE.MeshStandardMaterial({color:0xbcae94,roughness:1});

      // Lower white cardboard box.
      const base=new THREE.Mesh(new THREE.BoxGeometry(boxW,.42,boxD),white);
      base.position.set(1.45,-.62,0);base.castShadow=true;base.receiveShadow=true;group.add(base);

      // Open walls.
      const wallH=.86,wallT=.15;
      [
        [boxW,wallH,wallT,1.45,boxD/2],
        [boxW,wallH,wallT,1.45,-boxD/2],
        [wallT,wallH,boxD,1.45+boxW/2,0],
        [wallT,wallH,boxD,1.45-boxW/2,0]
      ].forEach(([x,y,z,px,pz])=>{
        const m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),edge);
        m.position.set(px,-.05,pz);m.castShadow=true;group.add(m);
      });

      // Cardboard dividers like the photo.
      for(let i=1;i<cc;i++){
        const d=new THREE.Mesh(new THREE.BoxGeometry(.04,.52,innerD),card);
        d.position.set(1.45+(i-cc/2)*cell,-.17,0);group.add(d);
      }
      for(let i=1;i<rr;i++){
        const d=new THREE.Mesh(new THREE.BoxGeometry(innerW,.52,.04),card);
        d.position.set(1.45,-.17,(i-rr/2)*cell);group.add(d);
      }

      const clickSlots=[], vialGroups=[];

      positions.forEach(p=>{
        const s=slotParts(p.Slot);if(!s)return;
        const x=1.45+(s.c-(cc-1)/2)*cell;
        const z=(s.r-(rr-1)/2)*cell;

        const hit=new THREE.Mesh(
          new THREE.BoxGeometry(cell*.92,.08,cell*.92),
          new THREE.MeshBasicMaterial({transparent:true,opacity:.001,depthWrite:false})
        );
        hit.position.set(x,.02,z);hit.userData={position:p};group.add(hit);clickSlots.push(hit);

        if(!Number(p.Vial))return;

        const g=new THREE.Group();
        const body=new THREE.Mesh(
          new THREE.CylinderGeometry(.14,.13,.55,20),
          new THREE.MeshStandardMaterial({color:0xeaf7fa,transparent:true,opacity:.78,roughness:.25})
        );
        body.position.y=.18;body.castShadow=true;
        const label=new THREE.Mesh(
          new THREE.CylinderGeometry(.142,.136,.25,20),
          new THREE.MeshStandardMaterial({color:0xf7f6ef,roughness:.95})
        );
        label.position.y=.20;
        const cap=new THREE.Mesh(
          new THREE.CylinderGeometry(.17,.17,.16,20),
          new THREE.MeshStandardMaterial({color:capColor(p.Vial),roughness:.70})
        );
        cap.position.y=.55;cap.castShadow=true;
        g.add(body,label,cap);
        g.position.set(x,-.05,z);
        g.userData={position:p,vialId:Number(p.Vial),baseY:-.05};
        group.add(g);vialGroups.push(g);
      });

      // "Paper plan" standing on the left, like the target screenshot.
      const pc=document.createElement('canvas');pc.width=700;pc.height=700;
      const ctx=pc.getContext('2d');
      ctx.fillStyle='#fafaf8';ctx.fillRect(0,0,700,700);
      ctx.fillStyle='#17283b';ctx.font='bold 28px sans-serif';ctx.fillText('Plan de boîte',28,40);

      const m=new Map(positions.map(p=>[String(p.Slot),p]));
      const gx=70,gy=82,gw=54,gh=54;
      ctx.font='bold 13px sans-serif';
      for(let r=0;r<10;r++)for(let c=0;c<10;c++){
        const slot=`${String.fromCharCode(65+r)}${c+1}`,p=m.get(slot);
        ctx.fillStyle=planCellColor(Number(p?.Vial)||0);
        ctx.fillRect(gx+c*gw,gy+r*gh,gw-2,gh-2);
        ctx.strokeStyle='#8393a0';ctx.strokeRect(gx+c*gw,gy+r*gh,gw-2,gh-2);
        ctx.fillStyle='#31465a';ctx.fillText(slot,gx+c*gw+5,gy+r*gh+18);
      }
      const tex=new THREE.CanvasTexture(pc);
      const board=new THREE.Mesh(
        new THREE.PlaneGeometry(4.1,4.1),
        new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide})
      );
      board.position.set(-3.25,1.05,-.25);
      board.rotation.set(-0.20,0.38,-0.06);
      group.add(board);

      const boardBack=new THREE.Mesh(
        new THREE.BoxGeometry(4.24,.10,4.24),
        new THREE.MeshStandardMaterial({color:0xf1f1ed,roughness:.95})
      );
      boardBack.position.set(-3.32,.96,-.31);
      boardBack.rotation.set(board.rotation.x,board.rotation.y,board.rotation.z);
      group.add(boardBack);

      let targetYaw=-0.22,targetPitch=.52,distance=12.2;
      let yaw=targetYaw,pitch=targetPitch;
      const target=new THREE.Vector3(-.2,0,0);

      function cameraSet(){
        const hp=Math.cos(pitch)*distance;
        camera.position.set(
          target.x+Math.sin(yaw)*hp,
          target.y+Math.sin(pitch)*distance,
          target.z+Math.cos(yaw)*hp
        );
        camera.lookAt(target);
      }
      cameraSet();

      function recenter(){
        yaw=targetYaw;pitch=targetPitch;distance=12.2;target.set(-.2,0,0);cameraSet();
      }
      function topView(){
        target.set(.2,0,0);
        camera.position.set(.2,14,.01);
        camera.lookAt(target);
      }
      q('#siteCenterBtn').onclick=recenter;
      q('#siteTopBtn').onclick=topView;

      let dragging=false,moved=false,lastX=0,lastY=0;
      canvas.style.cursor='grab';
      canvas.addEventListener('pointerdown',e=>{
        dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;
        canvas.setPointerCapture?.(e.pointerId);canvas.style.cursor='grabbing';
      });
      canvas.addEventListener('pointermove',e=>{
        if(!dragging)return;
        const dx=e.clientX-lastX,dy=e.clientY-lastY;
        if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
        yaw-=dx*.007;pitch+=dy*.005;
        pitch=Math.max(.18,Math.min(1.25,pitch));
        lastX=e.clientX;lastY=e.clientY;cameraSet();
      });
      canvas.addEventListener('pointerup',e=>{
        dragging=false;canvas.style.cursor='grab';if(moved)return;
        const cr=canvas.getBoundingClientRect();
        const mouse=new THREE.Vector2(((e.clientX-cr.left)/cr.width)*2-1,-((e.clientY-cr.top)/cr.height)*2+1);
        const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);

        const vh=ray.intersectObjects(vialGroups,true);
        if(vh.length){
          let g=vh[0].object;
          while(g && !g.userData?.vialId)g=g.parent;
          if(g){
            vialGroups.forEach(v=>v.position.y=v.userData.baseY);
            g.position.y=g.userData.baseY+.38;
            state.selectedVial=g.userData.vialId;
            showVialModal(g.userData.position);
            return;
          }
        }

        const sh=ray.intersectObjects(clickSlots,false);
        if(sh.length){
          const p=sh[0].object.userData.position;
          if(Number(p.Vial))showVialModal(p);else createVialAt(p);
        }
      });
      canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        distance=Math.max(7.5,Math.min(18,distance+e.deltaY*.012));
        cameraSet();
      },{passive:false});

      const ro=new ResizeObserver(()=>{
        const r=stage.getBoundingClientRect(),nw=Math.max(500,r.width),nh=Math.max(460,r.height);
        camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh,false);
      });
      ro.observe(stage);

      function animate(){state.three.frame=requestAnimationFrame(animate);renderer.render(scene,camera)}
      state.three={scene,renderer,camera,ro,vialMeshes:vialGroups,frame:null,recenter,topView};
      animate();

    }catch(e){
      console.error('[BioDynaMit site-style 3D]',e);
      toast(`Erreur 3D : ${e.message||e}`);
    }
  };

  window.createVialAt = createVialAt;
})();
