// Baking Lab: bake a high poly crate into maps for a low poly cube, with a Blender-style Bake panel.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { buildHigh, buildLow, FACES } from './mesh.js?v=1';
import { buildBVH } from './bvh.js?v=1';
import { createBake, rasterize, lowFrame, castTexel, decodeTexel } from './bake.js?v=1';
import { STAGES, startState, bakeInto, metaOf, IMAGE_OF, IMAGE_NAMES } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('cifog-bake:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cifog-bake:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), hover: false, pix: {}, job: null, jobType: null,
  view: { show: 'low', rays: false, cage: true, light: true }, img: { slot: 'normal', chan: 'rgb', uv: true, miss: true }, hoverTexel: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ─── Geometry and ray caster ─────────────────────────────────────────────────
const HIGH = buildHigh(96);
const GEO = { high: HIGH, bvh: buildBVH(HIGH.positions, HIGH.indices) };

// ─── Data, undo, persistence ─────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), { st: S.st, flags: S.flags }); }
const metaKey = m => m ? JSON.stringify({ ...m, stats: undefined }) : '';
// Make the pixels match the images described in the state (after loading, undo or a solution).
function syncPixels() {
  for (const slot of ['normal', 'ao', 'diffuse']) {
    const m = S.st.images[slot];
    if (!m) { delete S.pix[slot]; continue; }
    if (S.pix[slot]?.key === metaKey(m)) continue;
    const low = buildLow({ shading: m.shading, uv: m.uv });
    const job = createBake(low, GEO.high, GEO.bvh, { type: m.type, selectedToActive: m.selectedToActive, cage: m.cage, extrusion: m.extrusion, maxRay: m.maxRay, margin: m.margin, res: m.res, swizzle: m.swizzle, samples: m.samples, passes: m.passes }).run();
    S.pix[slot] = { key: metaKey(m), img: job.img, miss: job.miss, res: job.res, low };
    uploadTexture(slot);
  }
}
function loadData() {
  const saved = store.get(key(), null);
  if (saved?.st?.bake) { S.st = saved.st; S.flags = saved.flags || {}; }
  else {
    const { state, prebake } = startState(step());
    S.st = state; S.flags = {};
    for (const p of prebake) { const b = bakeInto(S.st, GEO, p.type, p.extra); b.job.run(); b.commit(); }
  }
  S.undo = []; S.redo = [];
  syncPixels();
}
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); syncPixels(); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); syncPixels(); changed(); msg('Redo'); }

// ─── 3D viewport ─────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
camera.position.set(4.2, 3.2, 5.6);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = true; controls.minDistance = 2.2; controls.maxDistance = 40;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
controls.addEventListener('change', () => requestRender());
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(keyLight);
const lightDir = new THREE.Vector3(0.5, 0.7, 0.6).normalize();
// High poly: vertex colours (sRGB → linear)
const highGeo = new THREE.BufferGeometry();
highGeo.setAttribute('position', new THREE.BufferAttribute(HIGH.positions, 3));
highGeo.setAttribute('normal', new THREE.BufferAttribute(HIGH.normals, 3));
highGeo.setAttribute('color', new THREE.BufferAttribute(HIGH.colors.map(c => Math.pow(c, 2.2)), 3));
highGeo.setIndex(new THREE.BufferAttribute(HIGH.indices, 1));
const highMesh = new THREE.Mesh(highGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
scene.add(highMesh);
// Low poly with the baked maps, in a shader that reads the normal map like a game engine does
const blank = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
const TEX = { normal: blank(128, 128, 255), ao: blank(255, 255, 255), diffuse: blank(160, 160, 160) };
const lowMat = new THREE.ShaderMaterial({
  uniforms: { nMap: { value: TEX.normal }, cMap: { value: TEX.diffuse }, aoMap: { value: TEX.ao }, useN: { value: false }, nSRGB: { value: false }, nDirect: { value: false }, useC: { value: false }, useAO: { value: false }, ySign: { value: 1 }, L: { value: new THREE.Vector3() } },
  vertexShader: `attribute vec4 tangent; varying vec3 vN; varying vec3 vT; varying vec3 vB; varying vec2 vUv; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); vT = normalize(normalMatrix * tangent.xyz); vB = cross(vN, vT) * tangent.w; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D nMap, cMap, aoMap; uniform bool useN, nSRGB, nDirect, useC, useAO; uniform float ySign; uniform vec3 L;
    varying vec3 vN; varying vec3 vT; varying vec3 vB; varying vec2 vUv; varying vec3 vV;
    void main(){
      vec3 N = normalize(vN);
      if (useN) {
        vec3 tx = texture2D(nMap, vUv).rgb;
        if (nSRGB) tx = pow(tx, vec3(2.2));
        vec3 n = tx * 2.0 - 1.0; n.y *= ySign;
        if (nDirect) N = normalize(mat3(viewMatrix) * n);
        else N = normalize(normalize(vT) * n.x + normalize(vB) * n.y + N * n.z);
      }
      vec3 base = useC ? pow(texture2D(cMap, vUv).rgb, vec3(2.2)) : vec3(0.5);
      float ao = useAO ? texture2D(aoMap, vUv).r : 1.0;
      vec3 V = normalize(vV);
      float d = max(dot(N, L), 0.0), sp = pow(max(dot(reflect(-L, N), V), 0.0), 40.0) * 0.35;
      vec3 col = base * (0.2 * ao + 0.95 * d * mix(1.0, ao, 0.35)) + sp * ao;
      gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    }`,
});
let lowMesh = null, lowWire = null, cageLines = null, lowNow = null;
const rayLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
const inspectLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
const inspectDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
inspectLine.renderOrder = inspectDot.renderOrder = 20; inspectLine.visible = inspectDot.visible = false;
scene.add(rayLines, inspectLine, inspectDot);
function buildLowMesh() {
  if (lowMesh) { scene.remove(lowMesh, lowWire); lowMesh.geometry.dispose(); }
  lowNow = buildLow(S.st.low);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(lowNow.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(lowNow.normals, 3));
  g.setAttribute('tangent', new THREE.BufferAttribute(lowNow.tangents, 4));
  g.setAttribute('uv', new THREE.BufferAttribute(lowNow.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(lowNow.indices, 1));
  lowMesh = new THREE.Mesh(g, lowMat);
  const edges = [];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const a = f * 4 + k, b = f * 4 + (k + 1) % 4; edges.push(...lowNow.positions.slice(a * 3, a * 3 + 3), ...lowNow.positions.slice(b * 3, b * 3 + 3)); }
  lowWire = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edges, 3)), new THREE.LineBasicMaterial({ color: 0xff9a2e }));
  scene.add(lowMesh, lowWire);
}
function updateCage() {
  if (cageLines) { scene.remove(cageLines); cageLines.geometry.dispose(); }
  const b = S.st.bake, e = b.extrusion, P = lowNow.positions, R = b.cage ? lowNow.cageNormals : lowNow.normals, pts = [];
  const at = i => [P[i * 3] + R[i * 3] * e, P[i * 3 + 1] + R[i * 3 + 1] * e, P[i * 3 + 2] + R[i * 3 + 2] * e];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) pts.push(...at(f * 4 + k), ...at(f * 4 + (k + 1) % 4));
  cageLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineDashedMaterial({ color: 0x6ad1ff, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.8 }));
  cageLines.computeLineDistances();
  cageLines.visible = S.view.cage && b.selectedToActive && S.view.show !== 'high';
  scene.add(cageLines);
}
// A sample of the rays the next bake would cast (current settings)
function updateRays() {
  rayLines.visible = S.view.rays;
  if (!S.view.rays) return;
  const b = S.st.bake, R = rasterize(lowNow, 40), pos = [], col = [];
  for (let i = 0; i < R.tri.length; i += 2) {
    if (R.tri[i] < 0) continue;
    const fr = lowFrame(lowNow, R.tri[i], R.b1[i], R.b2[i]);
    if (!b.selectedToActive) { pos.push(...fr.P, ...fr.P.map((v, k) => v + fr.N[k] * 0.12)); col.push(0.5, 0.5, 1, 0.5, 0.5, 1); continue; }
    const c = castTexel(GEO.high, GEO.bvh, fr, b);
    const end = c.hit ? c.hit.X : c.O.map((v, k) => v + c.D[k] * Math.min(c.tMax, 0.5));
    const rgb = !c.hit ? [1, 0.25, 0.2] : c.hit.wrong ? [1, 0.85, 0.1] : [0.35, 0.95, 0.4];
    pos.push(...c.O, ...end); col.push(...rgb, ...rgb);
  }
  rayLines.geometry.dispose();
  rayLines.geometry = new THREE.BufferGeometry();
  rayLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rayLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}
function uploadTexture(slot) {
  const p = S.pix[slot]; if (!p) return;
  TEX[slot]?.dispose?.();
  const tx = new THREE.DataTexture(p.img, p.res, p.res, THREE.RGBAFormat, THREE.UnsignedByteType);
  tx.colorSpace = THREE.NoColorSpace; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.magFilter = THREE.LinearFilter; tx.anisotropy = 4; tx.needsUpdate = true;
  TEX[slot] = tx;
}
function updateMaterial() {
  const m = S.st.material, pv = S.st.preview, u = lowMat.uniforms;
  u.nMap.value = TEX.normal; u.cMap.value = TEX.diffuse; u.aoMap.value = TEX.ao;
  u.useN.value = !!S.pix.normal && m.normalLink !== 'none';
  u.nSRGB.value = m.normalCS === 'sRGB'; u.nDirect.value = m.normalLink === 'direct';
  u.useC.value = !!S.pix.diffuse && m.colorLink; u.useAO.value = !!S.pix.ao && m.aoLink;
  u.ySign.value = (pv.engine === 'unreal' ? -1 : 1) * (pv.engine === 'unreal' && pv.flipGreen ? -1 : 1);
}
function updateVisibility() {
  highMesh.visible = S.view.show !== 'low';
  lowMesh.visible = S.view.show === 'low';
  lowWire.visible = S.view.show === 'both';
  if (cageLines) cageLines.visible = S.view.cage && S.st.bake.selectedToActive && S.view.show !== 'high';
}
let renderQueued = false;
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(renderNow); }
let lightT = 0.7;
function renderNow(now) {
  renderQueued = false;
  if (S.view.light) { lightT = now / 2400; requestRender(); }
  const L = new THREE.Vector3(Math.cos(lightT) * 0.85, 0.55, 0.55 + Math.sin(lightT) * 0.35).normalize();
  lowMat.uniforms.L.value.copy(L);
  keyLight.position.copy(L.clone().applyMatrix4(camera.matrixWorld.clone().setPosition(0, 0, 0)).multiplyScalar(10));
  renderer.render(scene, camera);
}
function resize() {
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); requestRender();
}
function drawOverlay() {
  const m = S.st.material, pv = S.st.preview;
  const lines = [t('User Perspective'), S.view.show === 'low' ? tr('{o} · with the baked maps', { o: 'Crate_low' }) : S.view.show === 'high' ? 'Crate_high · 110,592 tris' : t('High poly + low poly wireframe')];
  if (S.view.show === 'low') lines.push(tr('Preview: {e}', { e: pv.engine === 'unreal' ? `Unreal (DirectX, Y−)${pv.flipGreen ? ' · Flip Green' : ''}` : pv.engine === 'unity' ? 'Unity (OpenGL, Y+)' : 'Blender (OpenGL, Y+)' }));
  $('#view-overlay').innerHTML = lines.map(l => `<div data-no-i18n>${esc(l)}</div>`).join('') + (m.normalCS === 'sRGB' || m.normalLink === 'direct' ? `<div class="warn">${esc(t('The normal map is not connected correctly.'))}</div>` : '');
}

// ─── Image Editor ────────────────────────────────────────────────────────────
const imgCanvas = $('#image'), imgHost = $('#image-host'), off = document.createElement('canvas');
function currentImage() {
  if (S.job && IMAGE_OF[S.jobType] === S.img.slot) return { img: S.job.img, res: S.job.res, miss: S.job.miss, low: S.job.low, live: true };
  const p = S.pix[S.img.slot];
  return p ? { img: p.img, res: p.res, miss: p.miss, low: p.low } : null;
}
function drawImage() {
  const r = imgHost.getBoundingClientRect(), size = Math.max(64, Math.floor(Math.min(r.width, r.height) - 16));
  const dpr = Math.min(2, devicePixelRatio || 1);
  imgCanvas.width = size * dpr; imgCanvas.height = size * dpr; imgCanvas.style.width = imgCanvas.style.height = size + 'px';
  const g = imgCanvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // checker background (empty image)
  for (let y = 0; y < size; y += 16) for (let x = 0; x < size; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#2a2a2a' : '#333'; g.fillRect(x, y, 16, 16); }
  const im = currentImage();
  $('#image-empty').textContent = im ? '' : tr('{i} is empty: press Bake.', { i: IMAGE_NAMES[S.img.slot] });
  if (im) {
    off.width = off.height = im.res;
    const data = new ImageData(im.res, im.res), src = im.img, ch = S.img.chan;
    for (let y = 0; y < im.res; y++) for (let x = 0; x < im.res; x++) {
      const i = ((im.res - 1 - y) * im.res + x) * 4, o = (y * im.res + x) * 4; // v goes up
      if (src[i + 3] === 0) { data.data[o + 3] = 0; continue; }
      if (ch === 'rgb') { data.data[o] = src[i]; data.data[o + 1] = src[i + 1]; data.data[o + 2] = src[i + 2]; }
      else { const v = src[i + { r: 0, g: 1, b: 2 }[ch]]; data.data[o] = data.data[o + 1] = data.data[o + 2] = v; }
      data.data[o + 3] = 255;
      if (S.img.miss && im.miss[(im.res - 1 - y) * im.res + x]) { const m = im.miss[(im.res - 1 - y) * im.res + x]; data.data[o] = 255; data.data[o + 1] = m === 2 ? 210 : 40; data.data[o + 2] = 30; }
    }
    off.getContext('2d').putImageData(data, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(off, 0, 0, size, size);
  }
  if (S.img.uv) {
    const low = im?.low || lowNow;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
    for (let f = 0; f < 6; f++) { g.beginPath(); for (let k = 0; k <= 4; k++) { const i = f * 4 + (k % 4); const x = low.uvs[i * 2] * size, y = (1 - low.uvs[i * 2 + 1]) * size; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '10px Inter, sans-serif';
    if (low.uv === 'unique') for (let f = 0; f < 6; f++) { const i = f * 4 + 3; g.fillText(FACES[f].id, low.uvs[i * 2] * size + 3, (1 - low.uvs[i * 2 + 1]) * size + 11); }
  }
  if (S.hoverTexel && im) { const [x, y] = S.hoverTexel, s = size / im.res; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x * s - 2, (im.res - 1 - y) * s - 2, s + 4, s + 4); }
}
function texelAt(e) {
  const im = currentImage(); if (!im) return null;
  const r = imgCanvas.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = 1 - (e.clientY - r.top) / r.height;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { x: Math.floor(u * im.res), y: Math.floor(v * im.res), im };
}
imgCanvas.addEventListener('pointermove', e => {
  const tx = texelAt(e); if (!tx) return;
  S.hoverTexel = [tx.x, tx.y];
  const { im } = tx, i = (tx.y * im.res + tx.x) * 4, rgb = [im.img[i], im.img[i + 1], im.img[i + 2]];
  let h = `<span data-no-i18n>${esc(IMAGE_NAMES[S.img.slot])} · ${tx.x}, ${tx.y}</span>`;
  if (im.img[i + 3] === 0) h += ` · ${esc(t('empty (outside the islands)'))}`;
  else {
    h += ` · <span class="sw" style="background:rgb(${rgb.join(',')})"></span> R ${(rgb[0] / 255).toFixed(2)} G ${(rgb[1] / 255).toFixed(2)} B ${(rgb[2] / 255).toFixed(2)}`;
    if (S.img.slot === 'normal') { const n = decodeTexel(...rgb); h += ` → <b>(${n.map(v => v.toFixed(2)).join(', ')})</b> ${esc(t(describe(n)))}`; }
    const mm = im.miss[tx.y * im.res + tx.x]; if (mm) h += ` · <span class="bad">${esc(t(mm === 2 ? 'wrong hit' : 'miss'))}</span>`;
  }
  $('#inspector').innerHTML = h;
  showInspectRay(tx);
  drawImage();
});
imgCanvas.addEventListener('pointerleave', () => { S.hoverTexel = null; inspectLine.visible = inspectDot.visible = false; requestRender(); drawImage(); });
imgCanvas.addEventListener('click', e => {
  const tx = texelAt(e); if (!tx || S.img.slot !== 'normal') return;
  const i = (tx.y * tx.im.res + tx.x) * 4; if (tx.im.img[i + 3] === 0) return;
  const r = tx.im.img[i] / 255, g = tx.im.img[i + 1] / 255;
  if (r >= 0.75 && !S.flags.red) { S.flags.red = true; msg('Red ≥ 0.75: this texel tilts to the right (+X of the island).'); }
  else if (g >= 0.75 && !S.flags.green) { S.flags.green = true; msg('Green ≥ 0.75: this texel tilts up (+Y of the island).'); }
  else if (r < 0.75 && g < 0.75) msg(tr('R {r} · G {g}: look for a texel on a bevel or on the side of a bolt.', { r: r.toFixed(2), g: g.toFixed(2) }));
  saveData(); checkProgress(); renderGuide(); renderStepCard();
});
function describe(n) {
  if (n[2] > 0.97) return 'flat: faces straight out';
  const dirs = [];
  if (n[0] > 0.25) dirs.push('right'); if (n[0] < -0.25) dirs.push('left');
  if (n[1] > 0.25) dirs.push('up'); if (n[1] < -0.25) dirs.push('down');
  return dirs.length ? `tilts ${dirs.join(' and ')}` : 'almost flat';
}
function showInspectRay(tx) {
  const m = S.st.images[S.img.slot], p = S.pix[S.img.slot];
  if (!m || !p) return;
  const R = rasterize(p.low, p.res), i = tx.y * p.res + tx.x;
  if (R.tri[i] < 0 || !m.selectedToActive) { inspectLine.visible = inspectDot.visible = false; requestRender(); return; }
  const fr = lowFrame(p.low, R.tri[i], R.b1[i], R.b2[i]), c = castTexel(GEO.high, GEO.bvh, fr, m);
  const end = c.hit ? c.hit.X : c.O.map((v, k) => v + c.D[k] * Math.min(c.tMax, 0.5));
  inspectLine.geometry.dispose(); inspectLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...c.O), new THREE.Vector3(...end)]);
  inspectLine.material.color.set(!c.hit ? 0xff4030 : c.hit.wrong ? 0xffd21a : 0xffffff);
  inspectDot.position.set(...end); inspectLine.visible = inspectDot.visible = true;
  requestRender();
}
const rasterCache = new Map();
$('#i-slot').onchange = e => { S.img.slot = e.target.value; drawImage(); };
$('#i-chan').addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (!b) return; S.img.chan = b.dataset.ch; document.querySelectorAll('#i-chan button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawImage(); });
$('#i-uv').onchange = e => { S.img.uv = e.target.checked; drawImage(); };
$('#i-miss').onchange = e => { S.img.miss = e.target.checked; drawImage(); };

// ─── Baking ─────────────────────────────────────────────────────────────────
function startBake() {
  if (S.job) return;
  const sel = S.st.sel, b = S.st.bake;
  if (sel.active !== 'low') return msg('The active object must be Crate_low: it receives the bake. Click it last (Shift-click).', true);
  if (b.selectedToActive && !sel.high) return msg('Selected to Active needs the high poly selected too: click Crate_high, then Shift-click Crate_low.', true);
  pushUndo();
  const bk = bakeInto(S.st, GEO, b.type);
  S.job = bk.job; S.job.low = buildLow(S.st.low); S.jobType = b.type; S.jobCommit = bk.commit; S.jobT0 = performance.now();
  S.img.slot = IMAGE_OF[b.type]; $('#i-slot').value = S.img.slot;
  $('#bake-progress').hidden = false; renderProps();
  requestAnimationFrame(bakeTick);
}
function bakeTick() {
  if (!S.job) return;
  const t0 = performance.now();
  while (!S.job.done && performance.now() - t0 < 14) S.job.step(S.jobType === 'AO' ? 1 : 4);
  const pr = S.job.progress();
  $('#bake-progress i').style.setProperty('--p', pr.toFixed(3));
  $('#bake-progress span').textContent = tr('Baking {i}… {p}%', { i: IMAGE_NAMES[IMAGE_OF[S.jobType]], p: Math.round(pr * 100) });
  drawImage();
  if (!S.job.done) { requestAnimationFrame(bakeTick); return; }
  const job = S.jobCommit(), slot = IMAGE_OF[S.jobType], secs = ((performance.now() - S.jobT0) / 1000).toFixed(1);
  S.pix[slot] = { key: metaKey(S.st.images[slot]), img: job.img, miss: job.miss, res: job.res, low: S.job.low };
  uploadTexture(slot);
  S.job = null; $('#bake-progress').hidden = true;
  if (S.view.show !== 'low') { S.view.show = 'low'; $('#v-show').value = 'low'; }
  const st = job.stats;
  msg(tr('Baked {i} in {s} s: {m} misses, {w} wrong hits.', { i: IMAGE_NAMES[slot], s: secs, m: st.misses, w: st.wrongHits }), st.misses > 0 || st.wrongHits > 0);
  changed();
}
function cancelBake() { if (!S.job) return; S.job = null; $('#bake-progress').hidden = true; S.undo.pop(); drawImage(); renderProps(); msg('Bake cancelled.'); }

// ─── Properties ─────────────────────────────────────────────────────────────
const opt = (v, cur, label = v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
function renderProps() {
  const s = S.st, b = s.bake, m = s.material, pv = s.preview;
  let h = `<div class="panel"><h4>Outliner<small>${esc(t('click · Shift click'))}</small></h4><div class="ol-list">`;
  for (const [k, name, tris] of [['high', 'Crate_high', '110,592'], ['low', 'Crate_low', '12']]) {
    const sel = s.sel[k], act = s.sel.active === k;
    h += `<button type="button" class="ol-row${sel ? ' sel' : ''}${act ? ' active' : ''}" data-obj="${k}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 3.5v5L6 11 1 8.5v-5z" fill="none" stroke="currentColor"/></svg><span data-no-i18n>${name}</span><small>${tris} ${esc(t('tris'))}</small></button>`;
  }
  h += `</div><p class="sb-empty">${esc(t(s.sel.active === 'low' && s.sel.high ? 'Crate_high selected, Crate_low active: ready for Selected to Active.' : s.sel.active === 'low' ? 'Only Crate_low is selected.' : 'Crate_low must be the active object (click it last).'))}</p></div>`;
  h += `<div class="panel bl" data-no-i18n><h4>Crate_low<small>Object Data</small></h4>
    <div class="bl-row stack"><span>Shading</span><div class="seg small">${[['flat', 'Flat'], ['smooth', 'Smooth'], ['auto', 'Auto Smooth']].map(([v, l]) => `<button type="button" data-shade="${v}" aria-pressed="${s.low.shading === v}">${l}</button>`).join('')}</div></div>
    <label class="bl-row"><span>UV Maps</span><select data-low="uv">${opt('unique', s.low.uv, 'UVMap')}${opt('overlap', s.low.uv, 'UVMap_stacked')}</select></label></div>`;
  h += `<div class="panel bl" data-no-i18n><h4>Bake<small>Render Properties · Cycles</small></h4>
    <label class="bl-row"><span>Bake Type</span><select data-bake="type">${opt('NORMAL', b.type, 'Normal')}${opt('AO', b.type, 'Ambient Occlusion')}${opt('DIFFUSE', b.type, 'Diffuse')}</select></label>`;
  if (b.type === 'NORMAL') h += `<label class="bl-row"><span>Space</span><span class="bl-fixed">Tangent</span></label>
    <div class="bl-row"><span>Swizzle</span><div class="swz"><select data-swz="0">${opt('+X', b.swizzle[0])}${opt('-X', b.swizzle[0])}</select><select data-swz="1">${opt('+Y', b.swizzle[1])}${opt('-Y', b.swizzle[1])}</select><select data-swz="2">${opt('+Z', b.swizzle[2])}</select></div></div>`;
  if (b.type === 'DIFFUSE') h += `<div class="bl-row"><span>Contributions</span><div class="chk">${['direct', 'indirect', 'color'].map(k => `<label><input type="checkbox" data-pass="${k}"${b.passes[k] ? ' checked' : ''}>${k[0].toUpperCase() + k.slice(1)}</label>`).join('')}</div></div>`;
  if (b.type === 'AO') h += `<label class="bl-row"><span>Samples</span><input type="number" data-bake="samples" min="1" max="256" step="1" value="${b.samples}"></label>`;
  h += `<div class="bl-sec"><label class="bl-check"><input type="checkbox" data-bake="selectedToActive"${b.selectedToActive ? ' checked' : ''}>Selected to Active</label></div>
    <div class="${b.selectedToActive ? '' : 'bl-off'}"><label class="bl-check sub"><input type="checkbox" data-bake="cage"${b.cage ? ' checked' : ''}>Cage</label>
    ${b.cage ? `<label class="bl-row"><span>Cage Object</span><span class="bl-fixed">Crate_low_cage</span></label>` : ''}
    <label class="bl-row"><span>Extrusion</span><input type="number" data-bake="extrusion" min="0" max="2" step="0.01" value="${b.extrusion}"><em>m</em></label>
    <label class="bl-row"><span>Max Ray Distance</span><input type="number" data-bake="maxRay" min="0" max="5" step="0.01" value="${b.maxRay}"><em>m</em></label></div>
    <div class="bl-sec">Output</div>
    <label class="bl-row"><span>Target</span><span class="bl-fixed">Image Textures</span></label>
    <label class="bl-row"><span>Margin</span><input type="number" data-bake="margin" min="0" max="64" step="1" value="${b.margin}"><em>px</em></label>
    <label class="bl-row"><span>Image Size</span><select data-bake="res">${opt(256, +b.res, '256 × 256')}${opt(512, +b.res, '512 × 512')}</select></label>
    <button type="button" class="bake-btn" id="bake-btn"${S.job ? ' disabled' : ''}>${S.job ? 'Baking…' : 'Bake'}</button>
    <p class="sb-empty">→ ${esc(IMAGE_NAMES[IMAGE_OF[b.type]])}</p></div>`;
  h += `<div class="panel bl" data-no-i18n><h4>Material<small>Crate_low · Shader Editor</small></h4>
    <label class="bl-row"><span>Normal_Map › Color Space</span><select data-mat="normalCS">${opt('sRGB', m.normalCS)}${opt('Non-Color', m.normalCS)}</select></label>
    <label class="bl-row"><span>Normal_Map › Color</span><select data-mat="normalLink">${opt('normalmap', m.normalLink, '→ Normal Map node → Normal')}${opt('direct', m.normalLink, '→ BSDF Normal (direct)')}${opt('none', m.normalLink, 'not connected')}</select></label>
    <label class="bl-check"><input type="checkbox" data-mat="colorLink"${m.colorLink ? ' checked' : ''}>Color_Map → Base Color</label>
    <label class="bl-check"><input type="checkbox" data-mat="aoLink"${m.aoLink ? ' checked' : ''}>AO_Map → Multiply › Base Color</label></div>`;
  h += `<div class="panel"><h4>${esc(t('Preview'))}<small>${esc(t('as the engine reads it'))}</small></h4>
    <label class="bl-row"><span>${esc(t('Engine'))}</span><select data-pv="engine">${opt('blender', pv.engine, 'Blender (OpenGL, Y+)')}${opt('unity', pv.engine, 'Unity (OpenGL, Y+)')}${opt('unreal', pv.engine, 'Unreal (DirectX, Y−)')}</select></label>
    ${pv.engine === 'unreal' ? `<label class="bl-check"><input type="checkbox" data-pv="flipGreen"${pv.flipGreen ? ' checked' : ''}><span data-no-i18n>Flip Green Channel</span></label>` : ''}</div>`;
  h += `<div class="panel" id="report">${reportHtml()}</div>`;
  $('#props').innerHTML = h;
}
function reportHtml() {
  const m = S.st.images[S.img.slot] || S.st.images.normal;
  const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
  let h = `<h4>${esc(t('Bake report'))}<small data-no-i18n>${m ? IMAGE_NAMES[IMAGE_OF[m.type]] : ''}</small></h4>`;
  if (!m) return h + `<p class="sb-empty">${esc(t('Nothing baked yet.'))}</p>`;
  const st = m.stats;
  h += row('Selected to Active', t(m.selectedToActive ? 'on' : 'off'), m.selectedToActive);
  h += row('Texels', st.texels.toLocaleString());
  if (m.selectedToActive) { h += row('Misses', st.misses, st.misses === 0); h += row('Wrong hits', st.wrongHits, st.wrongHits === 0); }
  h += row('Overlapping texels', st.overlaps, st.overlaps === 0);
  if (m.selectedToActive) h += row('Largest ray angle', `${st.maxRayAngle.toFixed(0)}°`);
  h += row('Margin', `${m.margin} px`, m.margin >= 8);
  if (m.type === 'NORMAL') h += row('Swizzle', m.swizzle.join(' '));
  if (m.type === 'AO') h += row('Samples', m.samples, m.samples >= 16);
  if (m.type === 'DIFFUSE') h += row('Contributions', ['direct', 'indirect', 'color'].filter(k => m.passes[k]).map(k => t(k)).join(' + ') || '—', m.passes.color && !m.passes.direct && !m.passes.indirect);
  if (JSON.stringify({ s: m.shading, u: m.uv }) !== JSON.stringify({ s: S.st.low.shading, u: S.st.low.uv })) h += `<p class="c-hint">${esc(t('Crate_low has changed since this bake: bake again.'))}</p>`;
  return h;
}
$('#props').addEventListener('click', e => {
  const o = e.target.closest('[data-obj]');
  if (o) {
    const k = o.dataset.obj, sel = S.st.sel; pushUndo();
    if (e.shiftKey || e.ctrlKey) { if (sel[k] && sel.active === k) { sel[k] = false; sel.active = sel.high ? 'high' : sel.low ? 'low' : null; } else { sel[k] = true; sel.active = k; } }
    else { sel.high = k === 'high'; sel.low = k === 'low'; sel.active = k; }
    changed(); return;
  }
  const sh = e.target.closest('[data-shade]'); if (sh) { pushUndo(); S.st.low.shading = sh.dataset.shade; changed(true, true); msg(sh.dataset.shade === 'smooth' ? 'Shade Smooth: the normals are averaged across the edges.' : sh.dataset.shade === 'auto' ? 'Auto Smooth 30°: on a cube every edge is sharper than 30°, so it looks flat.' : 'Shade Flat: hard edges.'); return; }
  if (e.target.closest('#bake-btn')) startBake();
});
$('#props').addEventListener('change', e => {
  const d = e.target.dataset, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (d.bake) { pushUndo(); S.st.bake[d.bake] = ['extrusion', 'maxRay'].includes(d.bake) ? Math.max(0, +v || 0) : ['margin', 'samples', 'res'].includes(d.bake) ? Math.max(0, Math.round(+v || 0)) : v; changed(); return; }
  if (d.swz) { pushUndo(); S.st.bake.swizzle[+d.swz] = v; changed(); return; }
  if (d.pass) { pushUndo(); S.st.bake.passes[d.pass] = v; changed(); return; }
  if (d.low) { pushUndo(); S.st.low[d.low] = v; changed(true, true); return; }
  if (d.mat) { pushUndo(); S.st.material[d.mat] = v; changed(); return; }
  if (d.pv) { pushUndo(); S.st.preview[d.pv] = v; changed(); return; }
});

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b || S.job) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st, S.flags) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'); g.classList.toggle('three', st.steps.length === 3);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li || S.job) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id; if (S.job && id) return;
  if (id === 'reset-step') { pushUndo(); const { state, prebake } = startState(step()); S.st = state; S.flags = {}; for (const p of prebake) { const b = bakeInto(S.st, GEO, p.type, p.extra); b.job.run(); b.commit(); } syncPixels(); changed(true, true); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); const bakes = step().solve(S.st, S.flags); for (const type of bakes) { const b = bakeInto(S.st, GEO, type); b.job.run(); b.commit(); } syncPixels(); changed(true, true); msg('This is one possible solution. Ctrl Z brings your settings back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) setTimeout(() => msg(tr('✓ Step done: {s}', { s: t(step().title) })), 1400);
  lastOk = ok;
}

// ─── Updates ────────────────────────────────────────────────────────────────
function changed(save = true, lowChanged = false) {
  if (lowChanged || !lowNow || lowNow.uv !== S.st.low.uv || lowNow.shading !== S.st.low.shading) buildLowMesh();
  updateCage(); updateRays(); updateMaterial(); updateVisibility(); drawOverlay(); requestRender();
  if (save) saveData();
  checkProgress(); renderProps(); renderGuide(); renderStepCard(); drawImage();
}
function enterStep() {
  loadData(); lastOk = null;
  lastOk = stepDone(S.step);
  S.img.slot = S.st.images.normal || !S.st.images.ao ? 'normal' : 'ao'; $('#i-slot').value = S.img.slot;
  buildLowMesh();
  renderStageSwitch();
  changed(false, false);
}
function renderAll() { renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); drawOverlay(); drawImage(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// Viewport toggles
$('#v-show').onchange = e => { S.view.show = e.target.value; updateVisibility(); drawOverlay(); requestRender(); };
$('#v-rays').onchange = e => { S.view.rays = e.target.checked; updateRays(); requestRender(); };
$('#v-cage').onchange = e => { S.view.cage = e.target.checked; updateVisibility(); requestRender(); };
$('#v-light').onchange = e => { S.view.light = e.target.checked; requestRender(); };

// Keyboard
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape' && S.job) { cancelBake(); e.preventDefault(); return; }
  if (!S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z' && !S.job) { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y' && !S.job) { redo(); e.preventDefault(); }
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(() => { resize(); drawImage(); }).observe(host);
new ResizeObserver(() => drawImage()).observe(imgHost);
onLangChange(() => renderAll());
controls.target.set(0, 0, 0); controls.update();
enterStep(); resize(); translateTitles(); requestRender();
window.__bake = { S, startBake, GEO, camera }; // for tests and curious students
