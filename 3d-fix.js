
// BioDynaMit — correctif 3D v3
// Vue isométrique centrée + contraste amélioré + clic sur vial.

(function () {
  window.init3D = function init3D(box, positions) {
    const canvas = document.querySelector('#threeCanvas');
    if (!canvas) return;

    const stage = canvas.parentElement;
    const panel = document.querySelector('#vialPanel');

    function showError(msg) {
      console.error('[BioDynaMit 3D]', msg);
      const old = stage.querySelector('.three-error');
      if (old) old.remove();
      const div = document.createElement('div');
      div.className = 'three-error';
      div.style.cssText =
        'position:absolute;inset:18px;display:grid;place-items:center;' +
        'background:rgba(255,255,255,.96);border:1px solid #dbe6f0;' +
        'border-radius:12px;padding:24px;text-align:center;color:#6c7c8f;z-index:8;';
      div.innerHTML = '<div><b style="color:#15243a">Vue 3D indisponible</b><br><br>' +
        String(msg) + '<br><br>La vue grille reste disponible.</div>';
      stage.appendChild(div);
    }

    if (!window.THREE) {
      showError("Three.js n'a pas été chargé.");
      return;
    }

    const THREE = window.THREE;

    try {
      if (state?.three) {
        try { cancelAnimationFrame(state.three.frame); } catch (_) {}
        try { state.three.ro?.disconnect(); } catch (_) {}
        try { state.three.renderer?.dispose(); } catch (_) {}
      }

      const rr = Number(box.Rows || 10);
      const cc = Number(box.Columns || 10);
      const spacing = 0.82;
      const boxW = cc * spacing + 1.10;
      const boxD = rr * spacing + 1.10;

      const rect0 = stage.getBoundingClientRect();
      const width = Math.max(420, rect0.width || 900);
      const height = Math.max(480, rect0.height || 700);
      const aspect = width / height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xdfe7ed);

      // Orthographic camera: stable même dans une iframe étroite.
      const viewSize = 13.0;
      const camera = new THREE.OrthographicCamera(
        -viewSize * aspect / 2,
         viewSize * aspect / 2,
         viewSize / 2,
        -viewSize / 2,
        0.1,
        100
      );
      camera.position.set(10.5, 12.5, 12.5);
      camera.lookAt(0, 0.25, 0);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.shadowMap.enabled = true;
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      // Lumière moins agressive.
      scene.add(new THREE.AmbientLight(0xffffff, 0.70));

      const key = new THREE.DirectionalLight(0xffffff, 1.05);
      key.position.set(6, 10, 8);
      key.castShadow = true;
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xb9d7ee, 0.45);
      fill.position.set(-7, 7, -4);
      scene.add(fill);

      // Sol d'arrière-plan pour lire les volumes.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({ color: 0xcfd9e0, roughness: 1 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.52;
      floor.receiveShadow = true;
      scene.add(floor);

      // Plateau de boîte.
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(boxW, 0.36, boxD),
        new THREE.MeshStandardMaterial({ color: 0x9fa8ad, roughness: 0.9 })
      );
      base.position.y = -0.25;
      base.receiveShadow = true;
      scene.add(base);

      // Alvéoles.
      const holeMat = new THREE.MeshStandardMaterial({
        color: 0x66737c,
        roughness: 0.95
      });

      for (let r = 0; r < rr; r++) {
        for (let c = 0; c < cc; c++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.285, 0.032, 10, 24),
            holeMat
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(
            (c - (cc - 1) / 2) * spacing,
            -0.035,
            (r - (rr - 1) / 2) * spacing
          );
          scene.add(ring);
        }
      }

      // Parois.
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xb7bec2,
        roughness: 0.92
      });
      [
        [boxW, 0.74, 0.18, 0,  boxD / 2],
        [boxW, 0.74, 0.18, 0, -boxD / 2],
        [0.18, 0.74, boxD,  boxW / 2, 0],
        [0.18, 0.74, boxD, -boxW / 2, 0]
      ].forEach(([x,y,z,px,pz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x,y,z), wallMat);
        m.position.set(px, 0.10, pz);
        m.castShadow = true;
        scene.add(m);
      });

      const vialMeshes = [];

      (positions || []).forEach(p => {
        if (!Number(p.Vial)) return;

        const match = /^([A-Z])(\d+)$/.exec(String(p.Slot || ''));
        if (!match) return;

        const r = match[1].charCodeAt(0) - 65;
        const c = Number(match[2]) - 1;
        if (r < 0 || r >= rr || c < 0 || c >= cc) return;

        const group = new THREE.Group();

        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.245, 0.78, 24),
          new THREE.MeshStandardMaterial({
            color: 0x9ed3e8,
            roughness: 0.36,
            transparent: true,
            opacity: 0.96
          })
        );
        body.position.y = 0.52;
        body.castShadow = true;

        const liquid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.195, 0.34, 20),
          new THREE.MeshStandardMaterial({
            color: 0x2b87b8,
            roughness: 0.25,
            transparent: true,
            opacity: 0.78
          })
        );
        liquid.position.y = 0.36;

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.27, 0.27, 0.18, 24),
          new THREE.MeshStandardMaterial({
            color: 0x4d5f69,
            roughness: 0.78
          })
        );
        cap.position.y = 0.99;
        cap.castShadow = true;

        group.add(body, liquid, cap);

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

      // Centre la vue sur la boîte.
      let yaw = -0.66;
      let pitch = 0.76;
      let distance = 18;

      function setCamera() {
        const horiz = Math.cos(pitch) * distance;
        camera.position.set(
          Math.sin(yaw) * horiz,
          Math.sin(pitch) * distance,
          Math.cos(yaw) * horiz
        );
        camera.lookAt(0, 0.25, 0);
      }
      setCamera();

      // Rotation souris + zoom orthographique.
      let dragging = false;
      let moved = false;
      let lastX = 0;
      let lastY = 0;

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
        pitch += dy * 0.005;
        pitch = Math.max(0.38, Math.min(1.25, pitch));

        lastX = e.clientX;
        lastY = e.clientY;
        setCamera();
      });

      canvas.addEventListener('pointerup', e => {
        dragging = false;
        canvas.style.cursor = 'grab';

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

        vialMeshes.forEach(v => {
          v.position.y = v.userData.baseY;
          v.scale.setScalar(1);
        });

        g.position.y = 0.52;
        g.scale.setScalar(1.08);

        state.selectedVial = g.userData.vialId;

        if (typeof renderVialPanel === 'function') {
          renderVialPanel(g.userData.position);
        }
      });

      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoom = e.deltaY > 0 ? 0.92 : 1.08;
        camera.zoom = Math.max(0.65, Math.min(1.8, camera.zoom * zoom));
        camera.updateProjectionMatrix();
      }, { passive:false });

      if (state.selectedVial) {
        const g = vialMeshes.find(v => v.userData.vialId === Number(state.selectedVial));
        if (g) {
          g.position.y = 0.52;
          g.scale.setScalar(1.08);
          if (typeof renderVialPanel === 'function') {
            renderVialPanel(g.userData.position);
          }
        }
      }

      const ro = new ResizeObserver(() => {
        const rect = stage.getBoundingClientRect();
        const w = Math.max(360, rect.width);
        const h = Math.max(460, rect.height);
        const a = w / h;

        camera.left = -viewSize * a / 2;
        camera.right = viewSize * a / 2;
        camera.top = viewSize / 2;
        camera.bottom = -viewSize / 2;
        camera.updateProjectionMatrix();

        renderer.setSize(w, h, false);
      });
      ro.observe(stage);

      function animate() {
        state.three.frame = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      }

      state.three = {
        scene, renderer, camera, ro,
        vialMeshes,
        frame:null
      };

      animate();

    } catch (err) {
      showError(err?.message || String(err));
    }
  };
})();
