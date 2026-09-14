
// BioDynaMit — 3D/2D storage patch v4
// Open cardboard freezer box, clickable occupied/empty slots, direct vial creation.

(function () {
  function slotParts(slot) {
    const m = /^([A-Z])(\d+)$/.exec(String(slot || ''));
    if (!m) return null;
    return {r: m[1].charCodeAt(0)-65, c:Number(m[2])-1};
  }

  function allAntibodies() {
    return rows(state.data.Antibodies || []).slice().sort((a,b)=>
      String(a.Name||a.FullName||'').localeCompare(String(b.Name||b.FullName||''),'fr')
    );
  }

  async function addVialToPosition(pos) {
    if (!pos || Number(pos.Vial)) return toast('Cette position est déjà occupée.');

    const abs = allAntibodies();
    if (!abs.length) return toast('Aucun anticorps disponible.');

    const options = abs.map(a => {
      const name = a.Name || a.FullName || a.Code || `Anticorps ${a.id}`;
      const ref = a.CatalogNumber ? ` — ${a.CatalogNumber}` : '';
      const sup = a.Supplier ? ` — ${a.Supplier}` : '';
      return `<option value="${a.id}">${esc(name)}${esc(ref)}${esc(sup)}</option>`;
    }).join('');

    modal(`
      <h2>Ajouter un vial en ${esc(pos.Slot)}</h2>
      <p class="subtitle" style="margin-bottom:14px">Le vial sera créé dans Grist et placé directement dans cette position.</p>
      <div class="field">
        <label>Anticorps</label>
        <select id="newVialAb">${options}</select>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field">
          <label>Remplissage</label>
          <select id="newVialFill">
            <option>Plein</option>
            <option>≈ 50 %</option>
            <option>Inconnu</option>
          </select>
        </div>
        <div class="field">
          <label>Volume estimé (µL)</label>
          <input id="newVialVol" type="number" min="0" step="1" placeholder="ex. 100">
        </div>
      </div>
      <div class="field" style="margin-top:12px">
        <label>Commentaire</label>
        <textarea id="newVialComment" placeholder="Optionnel"></textarea>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="cancelNewVial">Annuler</button>
        <button class="btn btn-primary" id="confirmNewVial">Ajouter le vial</button>
      </div>
    `);

    $('#cancelNewVial').onclick = closeModal;
    $('#confirmNewVial').onclick = async () => {
      const abId = Number($('#newVialAb').value);
      const fill = $('#newVialFill').value;
      const volRaw = $('#newVialVol').value.trim();
      const vol = volRaw === '' ? null : Number(volRaw);
      const comment = $('#newVialComment').value.trim();
      const code = `V-${Date.now().toString().slice(-9)}`;

      if (!state.connected) {
        const nextId = Math.max(0, ...rows(state.data.Vials).map(v=>Number(v.id)||0)) + 1;
        state.data.Vials.push({
          id:nextId, Code:code, Antibody:abId, FillStatus:fill,
          EstimatedVolume_uL:vol, Status:'En stock', Comments:comment
        });
        pos.Vial = nextId;
        pos.Available = false;
        closeModal(); toast(`Vial ajouté en ${pos.Slot} (démo).`); go('box3d');
        return;
      }

      try {
        await grist.docApi.applyUserActions([
          ['AddRecord','Vials',null,{
            Code:code,
            Antibody:abId,
            FillStatus:fill,
            EstimatedVolume_uL:vol,
            Status:'En stock',
            Comments:comment
          }]
        ]);
        await loadAll();

        const vial = rows(state.data.Vials).find(v=>v.Code===code);
        if (!vial) throw new Error("Le vial a été créé mais n'a pas été retrouvé.");

        await grist.docApi.applyUserActions([
          ['UpdateRecord','Positions',pos.id,{Vial:vial.id,Available:false}],
          ['AddRecord','History',null,{
            Date:Date.now()/1000,
            Action:'Ajout vial',
            EntityType:'Vial',
            EntityCode:code,
            Details:`Ajout direct dans ${pos.Slot}`,
            User:'Grist'
          }]
        ]);

        closeModal();
        await loadAll();
        state.selectedVial = vial.id;
        toast(`Vial ajouté en ${pos.Slot}.`);
        go('box3d');
      } catch (e) {
        console.error(e);
        toast(`Erreur : ${e.message || e}`);
      }
    };
  }

  // 2D grid becomes interactive.
  window.renderGridModal = function renderGridModal(box, ps) {
    const r = Number(box.Rows||10), c = Number(box.Columns||10);
    const map = new Map(ps.map(p=>[p.Slot,p]));

    let html = `
      <div class="row space-between">
        <div>
          <h2 style="margin:0">${esc(box.Name)} — Vue 2D</h2>
          <p class="subtitle" style="margin:4px 0 0">Cliquez sur une position vide pour ajouter un vial.</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:34px 1fr;grid-template-rows:28px 1fr;gap:6px;margin-top:16px">
        <div></div>
        <div style="display:grid;grid-template-columns:repeat(${c},1fr);gap:5px;text-align:center;font-size:12px;color:#6c7c8f">
          ${Array.from({length:c},(_,i)=>`<div>${i+1}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-rows:repeat(${r},1fr);gap:5px;text-align:center;font-size:12px;color:#6c7c8f">
          ${Array.from({length:r},(_,i)=>`<div style="display:grid;place-items:center">${String.fromCharCode(65+i)}</div>`).join('')}
        </div>
        <div class="grid-box" style="grid-template-columns:repeat(${c},1fr);background:#efe6d3">
    `;

    for (let y=0;y<r;y++) {
      for (let x=0;x<c;x++) {
        const s = `${String.fromCharCode(65+y)}${x+1}`;
        const p = map.get(s);
        const occ = p && Number(p.Vial);
        const vial = occ ? rowById('Vials', Number(p.Vial)) : null;
        const ab = vial ? rowById('Antibodies', Number(vial.Antibody)) : null;
        const title = occ
          ? `${s} — ${ab?.Name || ab?.FullName || vial?.Code || 'Vial'}`
          : `${s} — libre`;
        html += `<button class="slot ${occ?'occupied':''}" data-slot="${s}" title="${esc(title)}"
          style="border-radius:8px;aspect-ratio:1;background:${occ?'#a9d8e8':'#fbf8f0'}">
          <span style="font-size:10px">${s}</span>
        </button>`;
      }
    }

    html += `
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" id="closeGrid">Fermer</button>
      </div>
    `;

    modal(html);
    $('#closeGrid').onclick = closeModal;

    document.querySelectorAll('.slot[data-slot]').forEach(el => {
      el.onclick = () => {
        const p = map.get(el.dataset.slot);
        if (!p) return;
        if (Number(p.Vial)) {
          state.selectedVial = Number(p.Vial);
          closeModal();
          go('box3d');
        } else {
          addVialToPosition(p);
        }
      };
    });
  };

  window.init3D = function init3D(box, positions) {
    const canvas = document.querySelector('#threeCanvas');
    if (!canvas) return;
    const stage = canvas.parentElement;

    if (!window.THREE) {
      stage.innerHTML += '<div class="three-error">Three.js indisponible.</div>';
      return;
    }
    const THREE = window.THREE;

    try {
      if (state?.three) {
        try { cancelAnimationFrame(state.three.frame); } catch (_) {}
        try { state.three.ro?.disconnect(); } catch (_) {}
        try { state.three.renderer?.dispose(); } catch (_) {}
      }

      // Prominent 2D button inside the scene.
      const existing2D = stage.querySelector('#open2DInside');
      if (!existing2D) {
        const b = document.createElement('button');
        b.id = 'open2DInside';
        b.className = 'btn btn-primary';
        b.textContent = '▦ Vue 2D';
        b.style.cssText = 'position:absolute;right:14px;top:14px;z-index:7;box-shadow:0 4px 14px rgba(0,0,0,.12)';
        b.onclick = () => renderGridModal(box, positions);
        stage.appendChild(b);
      }

      const rr = Number(box.Rows||10), cc = Number(box.Columns||10);
      const cell = 0.86;
      const innerW = cc*cell;
      const innerD = rr*cell;
      const outerW = innerW + 0.85;
      const outerD = innerD + 0.85;

      const rect = stage.getBoundingClientRect();
      const width = Math.max(480, rect.width || 900);
      const height = Math.max(520, rect.height || 700);
      const aspect = width/height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf3f5f6);

      const viewSize = 13.1;
      const camera = new THREE.OrthographicCamera(
        -viewSize*aspect/2, viewSize*aspect/2, viewSize/2, -viewSize/2, 0.1, 100
      );
      camera.position.set(10.2, 11.7, 11.8);
      camera.lookAt(0,0.15,0);

      const renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.setSize(width,height,false);
      renderer.shadowMap.enabled = true;

      scene.add(new THREE.HemisphereLight(0xffffff,0x80909a,1.45));
      const light = new THREE.DirectionalLight(0xffffff,1.25);
      light.position.set(8,12,9); light.castShadow=true; scene.add(light);

      // Neutral ground.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40,40),
        new THREE.MeshStandardMaterial({color:0xe8edef,roughness:1})
      );
      floor.rotation.x=-Math.PI/2; floor.position.y=-0.65; floor.receiveShadow=true; scene.add(floor);

      // Actual box is cardboard: cream base + square dividers.
      const cardboard = new THREE.MeshStandardMaterial({color:0xd9ccb3,roughness:0.96});
      const cardboardEdge = new THREE.MeshStandardMaterial({color:0xc4b396,roughness:0.98});
      const paper = new THREE.MeshStandardMaterial({color:0xf0eee8,roughness:0.94});

      const base = new THREE.Mesh(new THREE.BoxGeometry(outerW,0.24,outerD),paper);
      base.position.y=-0.23; base.receiveShadow=true; scene.add(base);

      // Outer walls resembling the open freezer box in the photos.
      const wallH = 1.65;
      const wallT = 0.18;
      [
        [outerW,wallH,wallT,0,outerD/2],
        [outerW,wallH,wallT,0,-outerD/2],
        [wallT,wallH,outerD,outerW/2,0],
        [wallT,wallH,outerD,-outerW/2,0]
      ].forEach(([x,y,z,px,pz])=>{
        const m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),paper);
        m.position.set(px,wallH/2-0.18,pz); m.castShadow=true; scene.add(m);
      });

      // Cardboard grid dividers, like the photographed box.
      for (let i=1;i<cc;i++) {
        const d=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.72,innerD),cardboard);
        d.position.set((i-cc/2)*cell,0.18,0); scene.add(d);
      }
      for (let i=1;i<rr;i++) {
        const d=new THREE.Mesh(new THREE.BoxGeometry(innerW,0.72,0.055),cardboard);
        d.position.set(0,0.18,(i-rr/2)*cell); scene.add(d);
      }

      // Thin bottom strips make empty square compartments readable.
      for (let r=0;r<rr;r++) for(let c=0;c<cc;c++) {
        const pad=new THREE.Mesh(
          new THREE.BoxGeometry(cell*0.90,0.035,cell*0.90),
          new THREE.MeshStandardMaterial({color:0xe8dcc4,roughness:1})
        );
        pad.position.set((c-(cc-1)/2)*cell,-0.075,(r-(rr-1)/2)*cell);
        pad.userData={kind:'slot',slot:`${String.fromCharCode(65+r)}${c+1}`};
        scene.add(pad);
      }

      const vialGroups = [];
      const clickableSlots = [];

      // Add transparent click planes for all positions.
      (positions||[]).forEach(p=>{
        const sc=slotParts(p.Slot); if(!sc) return;
        const click = new THREE.Mesh(
          new THREE.BoxGeometry(cell*0.88,0.08,cell*0.88),
          new THREE.MeshBasicMaterial({transparent:true,opacity:0.001,depthWrite:false})
        );
        click.position.set((sc.c-(cc-1)/2)*cell,0.02,(sc.r-(rr-1)/2)*cell);
        click.userData={kind:'slot-click',position:p};
        scene.add(click); clickableSlots.push(click);

        if (!Number(p.Vial)) return;

        const g=new THREE.Group();

        // Transparent polypropylene tube body.
        const body=new THREE.Mesh(
          new THREE.CylinderGeometry(0.21,0.19,0.82,24),
          new THREE.MeshStandardMaterial({
            color:0xe7f3f5,transparent:true,opacity:0.72,roughness:0.25,metalness:0
          })
        );
        body.position.y=0.48; body.castShadow=true;

        // Lower conical tip.
        const tip=new THREE.Mesh(
          new THREE.CylinderGeometry(0.19,0.10,0.30,24),
          new THREE.MeshStandardMaterial({color:0xe7f3f5,transparent:true,opacity:0.72,roughness:0.25})
        );
        tip.position.y=-0.08; tip.castShadow=true;

        // Dark grey screw cap like the real vial photo.
        const cap=new THREE.Mesh(
          new THREE.CylinderGeometry(0.255,0.255,0.30,24),
          new THREE.MeshStandardMaterial({color:0x4b5b68,roughness:0.72})
        );
        cap.position.y=1.02; cap.castShadow=true;

        // Label band.
        const label=new THREE.Mesh(
          new THREE.CylinderGeometry(0.215,0.205,0.36,24),
          new THREE.MeshStandardMaterial({color:0xf5f4ef,roughness:0.95})
        );
        label.position.y=0.48;

        g.add(body,tip,label,cap);
        g.position.set((sc.c-(cc-1)/2)*cell,0.18,(sc.r-(rr-1)/2)*cell);
        g.userData={kind:'vial',position:p,vialId:Number(p.Vial),baseY:0.18};
        scene.add(g); vialGroups.push(g);
      });

      let yaw=-0.67, pitch=0.78, distance=18;
      function updateCamera(){
        pitch=Math.max(0.38,Math.min(1.25,pitch));
        const h=Math.cos(pitch)*distance;
        camera.position.set(Math.sin(yaw)*h,Math.sin(pitch)*distance,Math.cos(yaw)*h);
        camera.lookAt(0,0.25,0);
      }
      updateCamera();

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
        yaw-=dx*0.008; pitch+=dy*0.005;
        lastX=e.clientX;lastY=e.clientY;updateCamera();
      });
      canvas.addEventListener('pointerup',e=>{
        dragging=false;canvas.style.cursor='grab';if(moved)return;
        const cr=canvas.getBoundingClientRect();
        const mouse=new THREE.Vector2(((e.clientX-cr.left)/cr.width)*2-1,-((e.clientY-cr.top)/cr.height)*2+1);
        const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);

        // Vials have priority.
        const vh=ray.intersectObjects(vialGroups,true);
        if(vh.length){
          let g=vh[0].object;
          while(g && g.userData?.kind!=='vial') g=g.parent;
          if(g){
            vialGroups.forEach(v=>{v.position.y=v.userData.baseY;v.scale.setScalar(1)});
            g.position.y=g.userData.baseY+0.48;g.scale.setScalar(1.06);
            state.selectedVial=g.userData.vialId;
            if(typeof renderVialPanel==='function') renderVialPanel(g.userData.position);
            return;
          }
        }

        // Empty or occupied slot click.
        const sh=ray.intersectObjects(clickableSlots,false);
        if(sh.length){
          const p=sh[0].object.userData.position;
          if(Number(p.Vial)){
            state.selectedVial=Number(p.Vial);
            if(typeof renderVialPanel==='function') renderVialPanel(p);
          }else{
            addVialToPosition(p);
          }
        }
      });
      canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        camera.zoom=Math.max(0.70,Math.min(1.85,camera.zoom*(e.deltaY>0?0.92:1.08)));
        camera.updateProjectionMatrix();
      },{passive:false});

      const ro=new ResizeObserver(()=>{
        const r=stage.getBoundingClientRect(),w=Math.max(360,r.width),h=Math.max(460,r.height),a=w/h;
        camera.left=-viewSize*a/2;camera.right=viewSize*a/2;camera.top=viewSize/2;camera.bottom=-viewSize/2;
        camera.updateProjectionMatrix();renderer.setSize(w,h,false);
      });
      ro.observe(stage);

      function animate(){state.three.frame=requestAnimationFrame(animate);renderer.render(scene,camera)}
      state.three={scene,renderer,camera,ro,vialMeshes:vialGroups,frame:null};
      animate();

    } catch(e) {
      console.error('[BioDynaMit 3D v4]',e);
      toast(`Erreur 3D : ${e.message || e}`);
    }
  };

  // Expose helper for future UI additions.
  window.addVialToPosition = addVialToPosition;
})();
