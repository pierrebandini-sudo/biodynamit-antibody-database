const THREE = window.THREE;
import { palette as hosts } from './storage-data-v10.js';
const position = v => String.fromCharCode(65 + v.row) + (v.col + 1);
// Geometry estimated from the supplied photos. Coordinates and contents remain database-driven.
export function createPhotoBox(scene, vials, box = { name: 'Boîte 1', temperature: -20 }) {
    const mat = (color) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: .9, metalness: 0 });
    const cardboard = mat('#b8a18b'), outer = mat('#edeae5'), cover = mat('#f1edef'), capMaterial = mat('#42566b');
    const plastic = new THREE.MeshPhysicalMaterial({ color: '#e5edef', transparent: true, opacity: .48, roughness: .24, metalness: 0, depthWrite: false });
    const targets = [], caps = [], vialGroups = [];
    const mesh = (geometry, material, x, y, z, parent = scene) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const block = (w, h, d, m, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
    const makeTexture = (draw, w = 512, h = 256) => { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; draw(canvas.getContext('2d')); const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; return texture; };
    const textTexture = (text, bg, color) => makeTexture(c => { c.fillStyle = bg; c.fillRect(0, 0, 512, 256); c.fillStyle = color; c.font = '600 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 128, 480); });
    const plane = (texture, x, y, z, w, h, parent = scene) => { const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), x, y, z, parent); m.rotation.x = -Math.PI / 2; return m; };
    block(11.5, .24, 11.5, outer, 0, -.36, 0);
    block(10.95, .035, 10.95, cardboard, 0, -.22, 0);
    for (const sign of [-1, 1]) {
        block(11.5, 3, .13, outer, 0, 1.12, sign * 5.65);
        block(.13, 3, 11.5, outer, sign * 5.65, 1.12, 0);
        block(10.95, 2.7, .035, cardboard, 0, 1.12, sign * 5.48);
        block(.035, 2.7, 10.95, cardboard, sign * 5.48, 1.12, 0);
    }
    // Interlocking cardboard partitions; square cells replace the generic perforated tray.
    for (let i = 0; i <= 10; i++) {
        const p = i - 5;
        block(.035, 2.45, 10.05, cardboard, p, 1.015, 0);
        block(10.05, 2.45, .035, cardboard, 0, 1.015, p);
    }
    for (let n = 0; n < 10; n++) {
        plane(textTexture(String(n + 1), '#edeae5', '#304964'), n - 4.5, 2.64, -5.45, .58, .25);
        plane(textTexture(String.fromCharCode(65 + n), '#edeae5', '#304964'), -5.45, 2.64, n - 4.5, .42, .28);
    }
    for (let row = 0; row < 10; row++)
        for (let col = 0; col < 10; col++) {
            const x = col - 4.5, z = row - 4.5, v = vials.find(v => v.row === row && v.col === col);
            const cell = block(.91, .02, .91, mat('#c6b39d'), x, -.18, z);
            cell.userData = { row, col, id: v?.id };
            targets.push(cell);
            if (!v)
                continue;
            const firstPart = scene.children.length;
            mesh(new THREE.CylinderGeometry(.29, .18, .47, 24), plastic, x, .11, z);
            mesh(new THREE.CylinderGeometry(.29, .29, 1.88, 24), plastic, x, 1.27, z);
            const labelTexture = makeTexture(c => { c.fillStyle = '#fafaf7'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#283744'; c.textAlign = 'center'; c.font = 'bold 26px Arial'; const lines = v.label.split('\n').filter(Boolean).slice(0, 4); lines.forEach((line, i) => c.fillText(line, 256, 48 + i * 45, 480)); });
            mesh(new THREE.CylinderGeometry(.294, .294, 1.2, 32, 1, true), new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .8, side: THREE.DoubleSide }), x, 1.37, z);
            mesh(new THREE.CylinderGeometry(.32, .32, .14, 32), plastic, x, 2.21, z);
            const cap = mesh(new THREE.CylinderGeometry(.37, .37, .62, 40), capMaterial.clone(), x, 2.61, z);
            cap.userData = { row, col, id: v.id };
            caps.push(cap);
            targets.push(cap);
            const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(.021, .53, .035), cap.material, 32);
            const ribPose = new THREE.Object3D();
            for (let r = 0; r < 32; r++) {
                const a = r / 32 * Math.PI * 2;
                ribPose.position.set(x + Math.cos(a) * .373, 2.61, z + Math.sin(a) * .373);
                ribPose.rotation.y = -a;
                ribPose.updateMatrix();
                ribs.setMatrixAt(r, ribPose.matrix);
            }
            ribs.castShadow = true;
            scene.add(ribs);
            // Species colors are semantic markers, not a transcription of the physical stickers.
            const sticker = makeTexture(c => { c.fillStyle = hosts[v.host]?.color || '#d1d9e0'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#233447'; c.textAlign = 'center'; c.font = 'bold 45px Arial'; c.fillText(v.label.split('\n')[0], 256, 95, 440); c.font = '40px Arial'; c.fillText(position(v), 256, 176); });
            const top = mesh(new THREE.CircleGeometry(.31, 40), new THREE.MeshBasicMaterial({ map: sticker }), x, 2.925, z);
            top.rotation.x = -Math.PI / 2;
            top.userData = { row, col, id: v.id };
            targets.push(top);
            const parts = scene.children.slice(firstPart), group = new THREE.Group();
            group.userData.id = v.id;
            scene.add(group);
            for (const part of parts)
                group.add(part);
            vialGroups.push(group);
        }
    const lid = new THREE.Group();
    scene.add(lid);
    block(11.85, .16, 11.85, cover, 0, 0, 0, lid);
    for (const sign of [-1, 1]) {
        block(11.85, 2.45, .13, cover, 0, -1.2, sign * 5.87, lid);
        block(.13, 2.45, 11.85, cover, sign * 5.87, -1.2, 0, lid);
    }
    const plan = makeTexture(c => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, 1536, 1536);
        c.fillStyle = '#263547';
        c.textAlign = 'center';
        c.font = 'bold 42px Arial';
        c.fillText(`${box.name}${box.temperature === undefined ? '' : ` · ${box.temperature} °C`}`, 768, 72, 1400);
        c.font = '26px Arial';
        c.fillText('Plan des emplacements · A–J / 1–10', 768, 119);
        const x0 = 90, y0 = 200, s = 135;
        c.font = 'bold 24px Arial';
        for (let i = 0; i < 10; i++) {
            c.fillText(String(i + 1), x0 + (i + .5) * s, y0 - 20);
            c.fillText(String.fromCharCode(65 + i), 48, y0 + (i + .55) * s);
        }
        for (let row = 0; row < 10; row++)
            for (let col = 0; col < 10; col++) {
                const v = vials.find(v => v.row === row && v.col === col), x = x0 + col * s, y = y0 + row * s;
                c.fillStyle = v ? hosts[v.host]?.color || '#e0e5eb' : '#fff';
                c.fillRect(x, y, s, s);
                c.strokeStyle = '#58636d';
                c.lineWidth = 1.4;
                c.strokeRect(x, y, s, s);
                if (v) {
                    c.fillStyle = '#25313c';
                    const lines = v.label.split('\n').filter(Boolean).slice(0, 5);
                    lines.forEach((line, n) => { c.font = n === 0 ? 'bold 18px Arial' : '17px Arial'; c.fillText(line, x + s / 2, y + 27 + n * 22, s - 10); });
                }
            }
    }, 1536, 1600);
    plane(plan, 0, .091, 0, 10.65, 11.08, lid);
    const side = mesh(new THREE.PlaneGeometry(2.1, .43), new THREE.MeshBasicMaterial({ map: textTexture('Fisherbrand', '#edeae5', '#294d77') }), -3.5, .07, 5.725);
    side.rotation.set(0, 0, 0);
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let progress = 1;
    function update(open, instant = false) { const target = open ? 1 : 0; progress = instant || reduced ? target : progress + (target - progress) * .1; const t = progress; const lift = Math.min(t / .3, 1), slide = THREE.MathUtils.clamp((t - .3) / .45, 0, 1), lower = THREE.MathUtils.clamp((t - .75) / .25, 0, 1); lid.position.set(-13 * slide, 3.15 + 6 * lift - 7.08 * lower, -.3 * slide); lid.rotation.set(0, 0, 0); }
    return { targets, caps, lid, update, vialGroups };
}
