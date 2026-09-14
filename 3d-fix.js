
// BioDynaMit — correctif 3D robuste
// Surcharge init3D pour éviter la dépendance à OrbitControls.

(function () {
  window.init3D = function init3D(box, positions) {
    const canvas = document.querySelector('#threeCanvas');
    if (!canvas) return;

    const stage = canvas.parentElement;
    const panel = document.querySelector('#vialPanel');

    function showError(msg) {
      console.error('[BioDynaMit 3D]', msg);
      if (stage) {
        const old = stage.querySelector('.three-error');
        if (old) old.remove();
        const div = document.createElement('div');
        div.className = 'three-error';
        div.style.cssText =
          'position:absolute;inset:18px;display:grid;place-items:center;' +
          'background:rgba(255,255,255,.94);border:1px solid #dbe6f0;' +
          'border-radius:12px;padding:24px;text-align:center;color:#6c7c8f;z-index:8;';
        div.innerHTML = '<div><b style="color:#15243a">Vue 3D indisponible</b><br><br>' +
          String(msg) + '<br><br>La vue grille reste disponible.</div>';
        stage.appendChild(div);
      }
    }

    if (!window.THREE) {
      showError("Three.js n'a pas été chargé par le navigateur.");
      return;
    }

    const THREE = window.THREE;

    try {
      // Nettoyage d'une scène précédente.
      if (state && state.three) {
        try { state.three.ro?.disconnect(); } catch (_) {}
        try { state.three.renderer?.dispose(); } catch (_) {}
      }

      const width = Math.max(640, canvas.clientWidth || stage?.clientWidth || 900);
      const height = Math.max(500, canvas.clientHeight || stage?.clientHeight || 620);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xe9eef2);

      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      camera.position.set(10.5, 12.5, 13.5);
      camera.lookAt(0, 0.5, 0);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.shadowMap.enabled = true;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x72808d, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(8, 14, 10);
      key.castShadow = true;
      scene.add(key);

      const rr = Number(box.Rows || 10);
      const cc = Number(box.Columns || 10);
      const spacing = 0.82;
      const w = cc * spacing + 1.05;
      const d = rr * spacing + 1.05;

      // Fond / plateau de boîte.
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.35, d),
        new THREE.MeshStandardMaterial({ color: 0xc4c2bb, roughness: 0.92 })
      );
      base.position.y = -0.28;
      base.receiveShadow = true;
      scene.add(base);

      // Alvéoles visibles.
      const holeMat = new THREE.MeshStandardMaterial({
        color: 0xa9adb0, roughness: 0.9, metalness: 0
      });
      for (let r = 0; r < rr; r++) {
        for (let c = 0; c < cc; c++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.29, 0.035, 10, 24),
            holeMat
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(
            (c - (cc - 1) / 2) * spacing,
            -0.04,
            (r - (rr - 1) / 2) * spacing
          );
          scene.add(ring);
        }
      }

      // Parois de la boîte.
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xd2d0c8, roughness: 0.92 });
      const walls = [
        [w, 0.85, 0.20, 0, d / 2],
        [w, 0.85, 0.20, 0, -d / 2],
        [0.20, 0.85, d, w / 2, 0],
        [0.20, 0.85, d, -w / 2, 0]
      ];
      walls.forEach(([x,y,z,px,pz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x,y,z), wallMat);
        m.position.set(px, 0.12, pz);
        m.castShadow = true;
        scene.add(m);
      });

      // Repères A-J / 1-10.
      // On les garde pour la vue grille afin de ne pas alourdir le WebGL.

      const vialMeshes = [];

      (positions || []).forEach(p => {
        if (!Number(p.Vial)) return;
        const m = /^([A-Z])(\d+)$/.exec(String(p.Slot || ''));
        if (!m) return;

        const r = m[1].charCodeAt(0) - 65;
        const c = Number(m[2]) - 1;
        if (r < 0 || r >= rr || c < 0 || c >= cc) return;

        const group = new THREE.Group();

        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.25, 0.82, 24),
          new THREE.MeshStandardMaterial({
            color: 0xcfe8f0,
            roughness: 0.38,
            transparent: true,
            opacity: 0.94
          })
        );
        body.position.y = 0.52;
        body.castShadow = true;

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.27, 0.27, 0.19, 24),
          new THREE.MeshStandardMaterial({ color: 0x77848a, roughness: 0.75 })
        );
        cap.position.y = 1.02;
        cap.castShadow = true;

        group.add(body, cap);
        group.position.set(
          (c - (cc - 1) / 2) * spacing,
          0,
          (r - (rr - 1) / 2) * spacing
        );
        group.userData = {
          position: p,
          vialId: Number(p.Vial),
          baseY: 0
        };

        scene.add(group);
        vialMeshes.push(group);
      });

      // Interaction manuelle : rotation par glisser-déposer + zoom molette.
      let yaw = 0.0;
      let pitch = 0.78;
      let radius = 18.0;
      let dragging = false;
      let moved = false;
      let lastX = 0, lastY = 0;

      function updateCamera() {
        pitch = Math.max(0.28, Math.min(1.35, pitch));
        radius = Math.max(9, Math.min(28, radius));
        camera.position.set(
          Math.sin(yaw) * Math.cos(pitch) * radius,
          Math.sin(pitch) * radius,
          Math.cos(yaw) * Math.cos(pitch) * radius
        );
        camera.lookAt(0, 0.45, 0);
      }
      updateCamera();

      canvas.style.cursor = 'grab';

      canvas.addEventListener('pointerdown', e => {
        dragging = true;
        moved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture?.(e.pointerId);
        canvas.style.cursor = 'grabbing';
      });

      canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        yaw -= dx * 0.008;
        pitch += dy * 0.006;
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
      });

      canvas.addEventListener('pointerup', e => {
        dragging = false;
        canvas.style.cursor = 'grab';

        // Si le pointeur n'a pas bougé, on considère cela comme un clic vial.
        if (moved) return;

        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(vialMeshes, true);
        if (!hits.length) return;

        let g = hits[0].object;
        while (g && !g.userData?.vialId) g = g.parent;
        if (!g) return;

        vialMeshes.forEach(x => x.position.y = x.userData.baseY);
        g.position.y = 0.55;
        state.selectedVial = g.userData.vialId;

        if (typeof renderVialPanel === 'function') {
          renderVialPanel(g.userData.position);
        }
      });

      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        radius += e.deltaY * 0.012;
        updateCamera();
      }, { passive: false });

      if (state.selectedVial) {
        const g = vialMeshes.find(x => x.userData.vialId === Number(state.selectedVial));
        if (g) {
          g.position.y = 0.55;
          if (typeof renderVialPanel === 'function') renderVialPanel(g.userData.position);
        }
      }

      function animate() {
        state.three.frame = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      }

      const ro = new ResizeObserver(() => {
        const rect = stage.getBoundingClientRect();
        const nw = Math.max(320, rect.width);
        const nh = Math.max(420, rect.height);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
      });
      ro.observe(stage);

      state.three = { scene, renderer, camera, ro, vialMeshes, frame:null };
      animate();

    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  };
})();
