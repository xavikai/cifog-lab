// Photo Lab: a small 3D scene photographed with a physical camera.
// Depth of field, motion blur and camera shake come from averaging many renders
// (each one from a different point of the aperture and a different instant of the exposure),
// the way an accumulation buffer or a path tracer does. Exposure and ISO noise are applied at the end.
import * as THREE from 'three';
import { SUBJECT_H, BACKGROUND, CYCLIST } from './stages.js';
import { SHAKE_RATE } from './optics.js';

const canvasTexture = (w, h, draw, repeat) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
};

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
  // Ground: 1 m tiles, useful to judge depth and blur
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({
    roughness: 0.95, map: canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#8c8f86'; g.fillRect(0, 0, w, h); g.fillStyle = '#7b7e75'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.strokeStyle = '#6a6c64'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [200, 200]),
  }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // The person (subject), feet at the origin, facing the camera (+Z)
  const person = new THREE.Group();
  const jacket = std(0xd9673a, 0.7), trousers = std(0x2f3a52), skin = std(0xe0b090, 0.6), hair = std(0x3a2a20);
  const cap = (r, l, m, x, y) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 16), m); o.position.set(x, y, 0); person.add(o); return o; };
  cap(0.1, 0.72, trousers, -0.11, 0.46); cap(0.1, 0.72, trousers, 0.11, 0.46);
  cap(0.2, 0.42, jacket, 0, 1.14);
  const armL = cap(0.07, 0.55, jacket, -0.28, 1.1), armR = cap(0.07, 0.55, jacket, 0.28, 1.1); armL.rotation.z = -0.12; armR.rotation.z = 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), skin); head.position.set(0, 1.62, 0); person.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair); hairM.position.set(0, 1.64, -0.01); person.add(hairM);
  const eyes = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.04, 0.04]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyes); e.position.set(x, 1.64, 0.105); person.add(e); }
  person.scale.setScalar(SUBJECT_H / 1.75);
  scene.add(person);
  // Poster wall with fine detail (to judge sharpness), 5 m behind
  const posterTex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#f1ede4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#20242a'; g.font = 'bold 92px Arial'; g.fillText('CIFOG', 40, 120);
    g.font = '28px Arial'; g.fillText('photo · lab · 2026', 44, 170);
    for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#ffbf00' : '#2a6fd6'; g.fillRect(i * w / 24, 210, w / 24, 46); }
  });
  const posters = [];
  for (const x of [-4.2, -1.4, 1.4, 4.2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.9 })); p.position.set(x, 1.5, -5); scene.add(p); posters.push(p); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), std(0x44474d)); post.position.set(x, 1.05, -5.05); scene.add(post); }
  // String of lights, BACKGROUND m behind the person: they turn into discs when out of focus
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lamps = new THREE.Group();
  for (let x = -9; x <= 9.01; x += 0.45) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lampMat); m.position.set(x, 2.4 + 0.25 * Math.cos(x * 0.7), -BACKGROUND); lamps.add(m); }
  scene.add(lamps);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(18, 0.01, 0.01), std(0x222222)); wire.position.set(0, 2.55, -BACKGROUND); scene.add(wire);
  // Trees and buildings far away
  const tree = (x, z, s) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.6 * s, 8), std(0x5a4232)); t.position.set(x, 0.8 * s, z); scene.add(t); const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.6 * s, 10), std(0x3f6e3a)); c.position.set(x, 2.6 * s, z); scene.add(c); };
  for (const [x, z, s] of [[-7, -16, 1.2], [6, -18, 1.4], [-2.5, -22, 1.5], [10, -26, 1.6], [-12, -28, 1.7], [2, -34, 1.9]]) tree(x, z, s);
  const windows = canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, w, h); g.fillStyle = '#4c5866'; for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) g.fillRect(16 + i * 40, 12 + j * 30, 24, 18); });
  for (const [x, w, h] of [[-14, 10, 12], [0, 12, 16], [14, 10, 10]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), new THREE.MeshStandardMaterial({ map: windows, roughness: 0.9 })); b.position.set(x, h / 2, -48); scene.add(b); }
  // Cyclist, CYCLIST.behind m behind the person, riding along X
  const cyclist = new THREE.Group();
  const frameM = std(0x2f8fd6, 0.4), tyre = std(0x1a1a1a, 0.9);
  for (const x of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), tyre); w.position.set(x, 0.36, 0); cyclist.add(w); for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.012, 0.012), std(0xcccccc, 0.3)); sp.position.copy(w.position); sp.rotation.z = k * Math.PI / 4; cyclist.add(sp); } }
  const bar = (a, b) => { const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, v.length(), 6), frameM); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); cyclist.add(m); };
  const P = (x, y) => new THREE.Vector3(x, y, 0);
  bar(P(-0.55, 0.36), P(-0.05, 0.36)); bar(P(-0.05, 0.36), P(0.35, 0.85)); bar(P(-0.55, 0.36), P(-0.2, 0.85)); bar(P(-0.2, 0.85), P(0.35, 0.85)); bar(P(0.35, 0.85), P(0.55, 0.36)); bar(P(-0.05, 0.36), P(-0.2, 0.85));
  const rider = std(0xf2c230, 0.6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.45, 6, 12), rider); body.position.set(0, 1.2, 0); body.rotation.z = -0.6; cyclist.add(body);
  const rhead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), std(0xeeeeee, 0.3)); rhead.position.set(0.32, 1.52, 0); cyclist.add(rhead);
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 6, 12), std(0x222222)); leg.position.set(-0.08, 0.72, 0.08); leg.rotation.z = 0.3; cyclist.add(leg);
  cyclist.position.set(1.7, 0, -CYCLIST.behind);
  scene.add(cyclist);

  function setLook(kind) {
    const L = LIGHT_LOOKS[kind] || LIGHT_LOOKS.shade;
    scene.background = canvasTexture(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, L.sky[0]); gr.addColorStop(1, L.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sun[0]); sun.intensity = L.sun[1];
    lampMat.color.setRGB(1.0 * L.lamps, 0.78 * L.lamps, 0.45 * L.lamps);
  }
  setLook('shade');
  return { scene, person, cyclist, setLook, pickables: [person, ground, ...posters, lamps, cyclist] };
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
  render(world, p, { samples = 32, width, height, target = null, cyclistSpeed = 0, seed = 0 } = {}) {
    const r = this.r, cam = this.cam;
    this.ensureTargets(width, height);
    const prevTarget = r.getRenderTarget(), prevAuto = r.autoClear;
    r.setRenderTarget(this.acc); r.setClearColor(0x000000, 1); r.clear(); r.setRenderTarget(prevTarget);
    const near = 0.05, far = 500, eye = new THREE.Vector3(0, 1.35, p.dist);
    const halfW = near * p.sensor.w / (2 * p.f), halfH = near * p.sensor.h / (2 * p.f);
    const R = isFinite(p.N) ? (p.f / p.N) / 2000 : 0; // aperture radius in metres
    const s = Math.max(0.1, p.focus);
    const base = world.cyclist.position.x;
    const rnd = mulberry(seed * 7919 + 1);
    const shakeDir = rnd() * Math.PI * 2, shake = p.tripod ? 0 : SHAKE_RATE;
    for (let k = 0; k < samples; k++) {
      // lens position: a sunflower pattern fills the aperture evenly
      const rr = R * Math.sqrt((k + 0.5) / samples), th = k * 2.399963 + seed;
      const ox = rr * Math.cos(th), oy = rr * Math.sin(th);
      // instant of the exposure (stratified, in a different order than the lens samples)
      const tau = p.t ? (((k * 7) % samples) + rnd()) / samples * p.t - p.t / 2 : 0;
      world.cyclist.position.x = base + cyclistSpeed * tau;
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
    world.cyclist.position.x = base;
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
