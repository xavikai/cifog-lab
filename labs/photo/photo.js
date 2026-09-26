// Photo Lab: a small 3D scene photographed with a physical camera.
// Depth of field, motion blur and camera shake come from averaging many renders
// (each one from a different point of the aperture and a different instant of the exposure),
// the way an accumulation buffer or a path tracer does. Exposure and ISO noise are applied at the end.
import * as THREE from 'three';
import { SUBJECT_H, BACKGROUND, WINDMILL } from './stages.js';
import { SHAKE_RATE } from './optics.js';

const canvasTexture = (w, h, draw, repeat) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
};

// The portrait subject shares the compact CC0 Blender Studio sculpt used by the Lighting Lab.
// The mesh is already Y-up, faces +Z and is centred near the head, so both labs show the same
// anatomical planes when the lesson changes light, focal length or depth of field.
function readPortraitBust(buffer) {
  const dv = new DataView(buffer);
  if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'BST1') throw new Error('Invalid portrait mesh');
  const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true);
  const min = [0, 1, 2].map(i => dv.getFloat32(12 + i * 4, true));
  const size = [0, 1, 2].map(i => dv.getFloat32(24 + i * 4, true));
  const q = new Uint16Array(buffer, 36, nv * 3), n8 = new Int8Array(buffer, 36 + nv * 6, nv * 3);
  const offset = Math.ceil((36 + nv * 9) / 4) * 4;
  const indices = nv >= 65536 ? new Uint32Array(buffer, offset, ni) : new Uint16Array(buffer, offset, ni);
  const p = new Float32Array(nv * 3), n = new Float32Array(nv * 3);
  for (let i = 0; i < p.length; i++) { p[i] = min[i % 3] + q[i] / 65535 * size[i % 3]; n[i] = n8[i] / 127; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
const portraitData = fetch(new URL('../lighting/assets/bust.bin?v=2', import.meta.url))
  .then(response => { if (!response.ok) throw new Error(response.status); return response.arrayBuffer(); });

function between(group, a, b, ra, rb, material, segments = 20) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, start.distanceTo(end), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  group.add(mesh);
  return mesh;
}

export const LIGHT_LOOKS = {
  sunny: { sky: ['#6fa6e6', '#cfe3f7'], hemi: [0xdfefff, 0x6b5a45, 1.3], sun: [0xfff2dc, 2.2], lamps: 3 },
  shade: { sky: ['#86a9cf', '#dce6ef'], hemi: [0xe6eef7, 0x5f574c, 1.6], sun: [0xfff5e6, 1.3], lamps: 3.5 },
  cloudy: { sky: ['#9aa6b3', '#d8dde2'], hemi: [0xeef1f4, 0x5c5a56, 2.0], sun: [0xffffff, 0.5], lamps: 3.5 },
  dusk: { sky: ['#3d4f78', '#f2a36b'], hemi: [0xb9c3e0, 0x4a3a35, 1.6], sun: [0xffb070, 1.1], lamps: 6 },
  indoor: { sky: ['#3b2e24', '#6b5140'], hemi: [0xffd9a8, 0x3b2e24, 1.9], sun: [0xffc080, 0.8], lamps: 8 },
  night: { sky: ['#070b1a', '#1d2644'], hemi: [0x8090c0, 0x202030, 1.2], sun: [0xffc58a, 1.0], lamps: 16 },
};

export function buildScene() {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-4, 8, 6); scene.add(sun);
  const std = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  // Warm stone paving, with a restrained metre grid that still makes depth easy to judge.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({
    roughness: 0.95, map: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#aaa398'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const v = 160 + ((row * 31 + col * 19) % 17);
        g.fillStyle = `rgb(${v},${v - 8},${v - 19})`;
        g.fillRect(col * 64 + 2 + (row % 2) * 8, row * 64 + 2, 59, 59);
      }
      g.strokeStyle = 'rgba(67,62,57,.22)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, [200, 200]),
  }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // Portrait subject: a tailored coat and natural limb proportions around a proper sculpted head.
  // Feet remain at the origin and height remains 1.75 m so the teaching measurements still apply.
  const person = new THREE.Group();
  const jacket = std(0x2a565b, 0.86), coatTrim = std(0x21444b, 0.9), trousers = std(0x303742, 0.9);
  const skin = std(0xd2c4b0, 0.82), leather = std(0x362b28, 0.74), scarf = std(0xb87853, 0.85);
  for (const s of [-1, 1]) {
    between(person, [s * 0.105, 0.78, -0.005], [s * 0.112, 0.41, 0], 0.105, 0.087, trousers);
    between(person, [s * 0.112, 0.42, 0], [s * 0.112, 0.12, 0.025], 0.087, 0.065, trousers);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.115, 0.29), leather);
    shoe.position.set(s * 0.112, 0.058, 0.075); person.add(shoe);
    between(person, [s * 0.175, 1.37, -0.005], [s * 0.247, 1.06, 0.01], 0.082, 0.07, jacket);
    between(person, [s * 0.247, 1.065, 0.01], [s * 0.255, 0.83, 0.06], 0.07, 0.06, jacket);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.084, 20, 16), jacket);
    shoulder.position.set(s * 0.18, 1.37, -0.005); shoulder.scale.set(1, 0.86, 0.92); person.add(shoulder);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.071, 20, 16), jacket);
    elbow.position.set(s * 0.247, 1.063, 0.01); person.add(elbow);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.047, 20), coatTrim);
    cuff.position.set(s * 0.255, 0.83, 0.06); person.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), skin);
    hand.position.set(s * 0.255, 0.77, 0.065); person.add(hand);
  }
  const coatProfile = [new THREE.Vector2(0, 0.72), new THREE.Vector2(0.205, 0.73), new THREE.Vector2(0.195, 0.89), new THREE.Vector2(0.17, 1.08), new THREE.Vector2(0.205, 1.31), new THREE.Vector2(0.19, 1.41), new THREE.Vector2(0.155, 1.47), new THREE.Vector2(0.095, 1.495)];
  const coat = new THREE.Mesh(new THREE.LatheGeometry(coatProfile, 32), jacket);
  coat.scale.z = 0.78; person.add(coat);
  // The front is closed, with a narrow placket and small buttons, so the coat reads as one
  // tailored garment instead of several disconnected primitives in the portrait crop.
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.47, 0.008), coatTrim);
  placket.position.set(0.012, 1.03, 0.162); person.add(placket);
  for (const y of [1.22, 1.09, 0.96, 0.83]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), leather);
    button.position.set(0.032, y, 0.168); person.add(button);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.093, 0.028, 10, 32), scarf);
  collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.495, 0.005); person.add(collar);
  const scarfEnd = new THREE.Mesh(new THREE.BoxGeometry(0.061, 0.14, 0.018), scarf);
  scarfEnd.position.set(-0.067, 1.39, 0.163); scarfEnd.rotation.z = -0.12; person.add(scarfEnd);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 16), skin);
  head.position.set(0, 1.61, 0); person.add(head);
  const ready = portraitData.then(buffer => {
    head.geometry.dispose(); head.geometry = readPortraitBust(buffer);
    head.position.set(0, 1.625, 0); head.scale.setScalar(0.88);
  }).catch(error => console.warn('Portrait bust unavailable; using the simple preview head.', error));
  const beanieProfile = [new THREE.Vector2(0.116, 1.68), new THREE.Vector2(0.118, 1.71), new THREE.Vector2(0.106, 1.745), new THREE.Vector2(0.07, 1.774), new THREE.Vector2(0, 1.784)];
  const beanie = new THREE.Mesh(new THREE.LatheGeometry(beanieProfile, 32), std(0x4b3438, 0.96));
  beanie.scale.z = 0.91; person.add(beanie);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.012, 8, 32), std(0x33282d, 0.98));
  rim.rotation.x = Math.PI / 2; rim.scale.y = 0.91; rim.position.y = 1.69; person.add(rim);
  person.scale.setScalar(SUBJECT_H / 1.75);
  scene.add(person);
  // A pair of photographic test boards gives a real sharpness reference without repeating the same
  // high-contrast chart across the entire horizon. They stay 5 m behind the subject for the DoF lesson.
  const chart = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#f0e9d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#202d34'; const cx = 154, cy = 232, R = 117;
    for (let i = 0; i < 48; i += 2) { g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, i * Math.PI / 24, (i + 1) * Math.PI / 24); g.closePath(); g.fill(); }
    for (let i = 0; i < 7; i++) { const bw = Math.max(2, 13 - i * 2); for (let k = 0; k < 4; k++) g.fillRect(305 + i * 26 + k * bw * 0.5, 70 + k * 39, bw, 25); }
    g.strokeStyle = '#b57c51'; g.lineWidth = 8; g.strokeRect(20, 20, w - 40, h - 40);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#ca9b68' : '#455f6a'; g.fillRect(34 + i * 37, 413, 37, 54); }
  });
  const colorCard = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#e9e1d0'; g.fillRect(0, 0, w, h);
    const colors = ['#234b57', '#b87055', '#e1b26f', '#728d74', '#d5c5ad', '#4e545b', '#8d677b', '#c4a96e', '#677c87', '#b89180', '#323d46', '#eee9dd'];
    colors.forEach((color, i) => { g.fillStyle = color; g.fillRect(36 + (i % 4) * 111, 72 + Math.floor(i / 4) * 116, 91, 91); });
    g.fillStyle = '#283b43'; g.fillRect(36, 440, 440, 20);
  });
  const posters = [];
  for (const [x, texture] of [[-3.1, colorCard], [3.1, chart]]) {
    const board = new THREE.Group(); board.position.set(x, 0, -5); scene.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.64, 1.46, 0.075), std(0x40545a)); frame.position.y = 1.65; board.add(frame);
    const image = new THREE.Mesh(new THREE.PlaneGeometry(1.47, 1.29), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.93 }));
    image.position.set(0, 1.65, 0.046); board.add(image); posters.push(image);
    for (const side of [-0.58, 0.58]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.98, 8), std(0x40545a)); leg.position.set(side, 0.49, -0.04); board.add(leg);
    }
  }
  // A festoon 10 m behind the subject: bulbs are instanced so the live camera can render many samples.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lamps = new THREE.Group(), count = 35;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.052, 10, 8), lampMat, count);
  const dummy = new THREE.Object3D(), cablePoints = [];
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.48, y = 2.58 - 0.28 * (1 - Math.cos(x * 0.42));
    dummy.position.set(x, y, -BACKGROUND); dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix);
    cablePoints.push(new THREE.Vector3(x, y + 0.055, -BACKGROUND));
  }
  bulbs.instanceMatrix.needsUpdate = true; lamps.add(bulbs); scene.add(lamps);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePoints), 90, 0.009, 4, false), std(0x2c3031)); scene.add(wire);
  // A small courtyard of varied facades and round trees gives meaningful depth and perspective.
  const facade = (x, z, w, h, wall, trim) => {
    const building = new THREE.Group(); building.position.set(x, 0, z); scene.add(building);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.1), std(wall)); body.position.y = h / 2; building.add(body);
    const front = 1.07, edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, 0.16, 2.34), std(trim)); edge.position.y = h + 0.04; building.add(edge);
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.19, h, 0.12), std(trim));
      pier.position.set(side * (w / 2 - 0.16), h / 2, front); building.add(pier);
    }
    const floors = Math.max(2, Math.floor(h / 2.6)), cols = Math.max(2, Math.floor(w / 2.5));
    const windowMat = std(0x263e4d, 0.3), frameMat = std(trim);
    for (let row = 0; row < floors; row++) for (let col = 0; col < cols; col++) {
      const wx = (col - (cols - 1) / 2) * (w / cols), wy = 1.45 + row * 2.25;
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.34, 0.09), frameMat); f.position.set(wx, wy, front); building.add(f);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.18), windowMat); pane.position.set(wx, wy, front + 0.052); building.add(pane);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.18, 0.025), frameMat); mullion.position.set(wx, wy, front + 0.07); building.add(mullion);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.11, 0.24), frameMat); sill.position.set(wx, wy - 0.7, front + 0.08); building.add(sill);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.34, 2.2, 0.12), windowMat); door.position.set(0, 1.1, front + 0.08); building.add(door);
    const doorHead = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.26), frameMat); doorHead.position.set(0, 2.25, front + 0.12); building.add(doorHead);
    const steps = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.55), frameMat); steps.position.set(0, 0.08, front + 0.31); building.add(steps);
  };
  facade(-9, -25, 9, 10, 0xb89d87, 0xe2d1b6);
  facade(0, -31, 9.5, 13, 0x8eaaa7, 0xd2d9cc);
  facade(9, -27, 8, 11, 0xc3ad92, 0xe4d5ba);
  const foliage = [std(0x426d58), std(0x638466), std(0x79966b)];
  const tree = (x, z, s) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.095 * s, 0.14 * s, 1.65 * s, 8), std(0x645446)); trunk.position.set(x, 0.82 * s, z); scene.add(trunk);
    for (const [dx, dy, dz, r, color] of [[0, 2.25, 0, .9, 0], [-.46, 2.0, .05, .62, 1], [.49, 2.13, -.04, .67, 2], [.1, 2.78, -.08, .62, 1]]) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), foliage[color]);
      leaf.position.set(x + dx * s, dy * s, z + dz * s); leaf.scale.y = 0.78; scene.add(leaf);
    }
  };
  for (const [x, z, s] of [[-6, -15, 1.1], [6, -17, 1.15], [-10, -24, 1.35], [11, -23, 1.3]]) tree(x, z, s);
  // Planted foreground edges frame the subject when the lens widens, while the empty centre keeps
  // the windmill and the focus boards unobstructed.
  const potMat = std(0xa7664d, 0.94), soil = std(0x463d35, 1);
  for (const [x, z, s] of [[-3.1, -2.7, 1], [3.1, -2.7, 1], [-5.6, -8, 1.3], [5.6, -8, 1.3]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.33 * s, 0.24 * s, 0.56 * s, 12), potMat);
    pot.position.set(x, 0.28 * s, z); scene.add(pot);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.355 * s, 0.35 * s, 0.07 * s, 12), potMat);
    lip.position.set(x, 0.57 * s, z); scene.add(lip);
    const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.315 * s, 0.315 * s, 0.012, 12), soil);
    earth.position.set(x, 0.61 * s, z); scene.add(earth);
    for (const [dx, dy, dz, radius, color] of [[0, .95, 0, .34, 0], [-.25, .88, .02, .25, 1], [.23, .89, -.03, .26, 2], [.02, 1.2, 0, .27, 1]]) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * s, 1), foliage[color]);
      leaf.position.set(x + dx * s, dy * s, z + dz * s); scene.add(leaf);
    }
  }
  // A timber-and-plaster windmill, 3 m behind the portrait subject. Its sails still rotate at the
  // exact radius and speed used by the motion-blur exercises.
  const windmill = new THREE.Group();
  const stone = std(0xd7c4a6, 0.92), roofM = std(0x4b5b60, 0.8), wood = std(0x654c39, 0.84);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.12, 16), std(0x8d8071)); base.position.y = 0.06; windmill.add(base);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.42, WINDMILL.hub + 0.02, 16), stone); tower.position.y = (WINDMILL.hub + 0.02) / 2; windmill.add(tower);
  for (const y of [0.25, 0.78, 1.3]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.405 - y * 0.075, 0.015, 6, 16), std(0xb29c7d)); ring.rotation.x = Math.PI / 2; ring.position.y = y; windmill.add(ring); }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.46, 16), roofM); roof.position.y = WINDMILL.hub + 0.28; windmill.add(roof);
  const roofTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 16), wood); roofTrim.position.y = WINDMILL.hub + 0.055; windmill.add(roofTrim);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.42), wood); door.position.set(0, 0.27, 0.405); windmill.add(door);
  const doorTop = new THREE.Mesh(new THREE.CircleGeometry(0.115, 12, 0, Math.PI), wood); doorTop.position.set(0, 0.48, 0.407); windmill.add(doorTop);
  const blades = new THREE.Group(); blades.position.set(0, WINDMILL.hub, 0.42);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.045, WINDMILL.r, 0.045), wood); spar.position.y = WINDMILL.r / 2; arm.add(spar);
    const shape = new THREE.Shape(); shape.moveTo(0.06, 0.11); shape.lineTo(0.245, 0.22); shape.lineTo(0.245, 0.69); shape.lineTo(0.06, 0.63); shape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0xe7dec8, roughness: 0.96, side: THREE.DoubleSide })); sail.position.z = 0.04; arm.add(sail);
    for (const y of [0.23, 0.36, 0.49, 0.62]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.014), wood); rib.position.set(0.151, y, 0.055); arm.add(rib);
    }
    blades.add(arm);
  }
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12), wood); hubM.rotation.x = Math.PI / 2; blades.add(hubM);
  const hubPin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(0xb98c5d, 0.45)); hubPin.position.z = 0.08; blades.add(hubPin);
  windmill.add(blades);
  windmill.position.set(WINDMILL.x, 0, -WINDMILL.behind);
  scene.add(windmill);
  const PHASE = 0.35; blades.rotation.z = PHASE;

  function setLook(kind) {
    const L = LIGHT_LOOKS[kind] || LIGHT_LOOKS.shade;
    scene.background = canvasTexture(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, L.sky[0]); gr.addColorStop(1, L.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sun[0]); sun.intensity = L.sun[1];
    lampMat.color.setRGB(1.0 * L.lamps, 0.78 * L.lamps, 0.45 * L.lamps);
  }
  setLook('shade');
  return { scene, person, windmill, blades, phase: PHASE, setLook, ready, pickables: [person, ground, ...posters, lamps, windmill] };
}

// ─── The physical camera ─────────────────────────────────────────────────────
const quadGeo = new THREE.PlaneGeometry(2, 2);
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export class PhotoCamera {
  constructor(renderer) {
    this.r = renderer;
    this.cam = new THREE.PerspectiveCamera();
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(quadGeo); this.quad.frustumCulled = false; this.quadScene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.accMat = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, w: { value: 1 } }, vertexShader: VERT, fragmentShader: 'uniform sampler2D t; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb * w, 1.0); }', blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, gain: { value: 1 }, noise: { value: 0 }, seed: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D t; uniform float gain, noise, seed; uniform vec2 res; varying vec2 vUv;
        float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main(){
          vec3 c = texture2D(t, vUv).rgb * gain;
          vec2 px = floor(vUv * res) + seed;
          float l = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
          float n = h(px) + h(px * 1.37 + 11.1) - 1.0;
          vec3 chroma = vec3(h(px + 3.1), h(px + 7.7), h(px + 13.3)) - 0.5;
          c += noise * (0.35 + 0.65 * (1.0 - l)) * (vec3(n) + chroma * 0.7);
          c = clamp(c, 0.0, 1.0);
          gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.size = [0, 0];
  }
  ensureTargets(w, h) {
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    this.sample?.dispose(); this.acc?.dispose();
    const opt = { type: THREE.HalfFloatType, depthBuffer: true };
    this.sample = new THREE.WebGLRenderTarget(w, h, opt);
    this.acc = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  }
  // p: { f (mm), sensor {w, h}, N (Infinity = pinhole), focus (m), t (s), tripod, gain, iso, dist (m) }
  render(world, p, { samples = 32, width, height, target = null, spin = 0, time = 0, seed = 0 } = {}) {
    const r = this.r, cam = this.cam;
    this.ensureTargets(width, height);
    const prevTarget = r.getRenderTarget(), prevAuto = r.autoClear;
    r.setRenderTarget(this.acc); r.setClearColor(0x000000, 1); r.clear(); r.setRenderTarget(prevTarget);
    const near = 0.05, far = 500, eye = new THREE.Vector3(0, 1.35, p.dist);
    const halfW = near * p.sensor.w / (2 * p.f), halfH = near * p.sensor.h / (2 * p.f);
    const R = isFinite(p.N) ? (p.f / p.N) / 2000 : 0; // aperture radius in metres
    const s = Math.max(0.1, p.focus);
    const rnd = mulberry(seed * 7919 + 1);
    const shakeDir = rnd() * Math.PI * 2, shake = p.tripod ? 0 : SHAKE_RATE;
    this.lastShakeDir = shakeDir;
    for (let k = 0; k < samples; k++) {
      // lens position: a sunflower pattern fills the aperture evenly
      const rr = R * Math.sqrt((k + 0.5) / samples), th = k * 2.399963 + seed;
      const ox = rr * Math.cos(th), oy = rr * Math.sin(th);
      // instant of the exposure (stratified, in a different order than the lens samples)
      const tau = p.t ? (((k * 7) % samples) + rnd()) / samples * p.t - p.t / 2 : 0;
      world.blades.rotation.z = world.phase - spin * (time + tau); // the sails turn clockwise
      // camera shake: the camera turns slowly while the shutter is open
      const ang = shake * (tau + p.t / 2);
      cam.position.set(eye.x + ox, eye.y + oy, eye.z);
      cam.rotation.set(Math.sin(shakeDir) * ang, Math.cos(shakeDir) * ang, 0);
      cam.updateMatrixWorld(true);
      // off-axis frustum: points on the focus plane land on the same pixel from every lens position
      const jx = (rnd() - 0.5) * 2 * halfW / width, jy = (rnd() - 0.5) * 2 * halfH / height;
      const sx = -ox * near / s + jx, sy = -oy * near / s + jy;
      cam.projectionMatrix.makePerspective(-halfW + sx, halfW + sx, halfH + sy, -halfH + sy, near, far);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      r.setRenderTarget(this.sample); r.setClearColor(0x000000, 1); r.clear(); r.render(world.scene, cam);
      this.accMat.uniforms.t.value = this.sample.texture; this.accMat.uniforms.w.value = 1 / samples;
      this.quad.material = this.accMat; r.autoClear = false; r.setRenderTarget(this.acc); r.render(this.quadScene, this.ortho); r.autoClear = prevAuto;
    }
    world.blades.rotation.z = world.phase - spin * time;
    this.finalMat.uniforms.t.value = this.acc.texture;
    this.finalMat.uniforms.gain.value = p.gain;
    this.finalMat.uniforms.noise.value = p.iso ? 0.011 * Math.sqrt(p.iso / 100) - 0.006 : 0;
    this.finalMat.uniforms.seed.value = (seed * 37.3) % 97;
    this.finalMat.uniforms.res.value.set(width, height);
    this.quad.material = this.finalMat;
    r.setRenderTarget(target); r.render(this.quadScene, this.ortho);
    r.setRenderTarget(prevTarget);
  }
  // The base camera (centre of the lens, no shake), for picking the focus point.
  baseCamera(p, aspect) {
    const c = new THREE.PerspectiveCamera(2 * Math.atan(p.sensor.h / (2 * p.f)) * 180 / Math.PI, aspect, 0.05, 500);
    c.position.set(0, 1.35, p.dist); c.updateMatrixWorld(true);
    return c;
  }
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
