// Photo Lab: a DSLR cut in half, the photo it takes, and Blender's camera.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as O from './optics.js?v=1';
import { STAGES, derive, startSettings, targetSettings, SOLUTIONS, CYCLIST, IMAGE_H } from './stages.js?v=1';
import { buildScene, PhotoCamera } from './photo.js?v=1';
import { buildDslr, shotTimeline } from './dslr.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('cifog-photo:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cifog-photo:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, s: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), hover: false, shots: [], shooting: false, d: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const locked = k => (step().lock || []).includes(k);

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 5500);
}

// ─── Data ────────────────────────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), { s: S.s, flags: S.flags }); }
function loadData() {
  const saved = store.get(key(), null);
  S.s = saved?.s ? { ...startSettings(step()), ...saved.s } : startSettings(step());
  S.flags = saved?.flags || {};
  S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.s)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.s)); S.s = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.s)); S.s = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }

// ─── The photo ───────────────────────────────────────────────────────────────
const photoCanvas = $('#photo');
const photoRenderer = new THREE.WebGLRenderer({ canvas: photoCanvas, antialias: false, preserveDrawingBuffer: true });
photoRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const world = buildScene();
const pcam = new PhotoCamera(photoRenderer);
let seed = 1;
function photoParams(d) {
  return { f: d.f, sensor: d.sensor, N: d.N, focus: d.focus, t: d.t, tripod: d.tripod, gain: d.gain, iso: step().blender ? 0 : d.iso, dist: d.dist };
}
function renderPhoto(samples) {
  const d = S.d, W = d.width, H = IMAGE_H;
  world.setLook(step().scene?.light || 'shade');
  world.cyclist.visible = !!step().scene?.cyclist;
  photoRenderer.setSize(W, H, false);
  photoCanvas.style.aspectRatio = `${W} / ${H}`;
  pcam.render(world, photoParams(d), { samples, width: W, height: H, cyclistSpeed: CYCLIST.speed, seed });
  drawHistogram();
}
let hqTimer, pending = false;
function schedulePhoto(fast = true) {
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderPhoto(fast ? 8 : 40); }); }
  clearTimeout(hqTimer);
  if (fast) hqTimer = setTimeout(() => renderPhoto(40), 220);
}
const histCanvas = $('#hist'), histCtx = histCanvas.getContext('2d'), sampler = document.createElement('canvas');
sampler.width = 160; sampler.height = 106;
function drawHistogram() {
  if (!$('#o-hist').checked) { histCanvas.hidden = true; return; }
  histCanvas.hidden = false;
  const g = sampler.getContext('2d', { willReadFrequently: true });
  g.drawImage(photoCanvas, 0, 0, sampler.width, sampler.height);
  const px = g.getImageData(0, 0, sampler.width, sampler.height).data, bins = new Array(48).fill(0);
  for (let i = 0; i < px.length; i += 4) bins[Math.min(47, Math.floor((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 256 * 48))]++;
  const max = Math.max(...bins.slice(1, 47), 1) * 1.1, W = histCanvas.width, H = histCanvas.height;
  histCtx.clearRect(0, 0, W, H); histCtx.fillStyle = 'rgba(12,14,16,.72)'; histCtx.fillRect(0, 0, W, H);
  histCtx.fillStyle = 'rgba(235,238,242,.85)';
  bins.forEach((b, i) => { const h = Math.min(H - 4, b / max * (H - 6)); histCtx.fillRect(2 + i * (W - 4) / 48, H - 2 - h, (W - 4) / 48 - 0.5, h); });
  // clipped highlights / shadows
  histCtx.fillStyle = '#ff5a4a'; if (bins[47] / (sampler.width * sampler.height) > 0.02) histCtx.fillRect(W - 5, 2, 3, H - 4);
  histCtx.fillStyle = '#4aa3ff'; if (bins[0] / (sampler.width * sampler.height) > 0.05) histCtx.fillRect(2, 2, 3, H - 4);
}
$('#o-hist').onchange = () => drawHistogram();

// Focus by clicking the photo (like moving the AF point)
photoCanvas.addEventListener('click', e => {
  const r = photoCanvas.getBoundingClientRect(), d = S.d;
  const ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  const cam = pcam.baseCamera(photoParams(d), d.width / IMAGE_H);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects(world.pickables, true).find(h => h.object.visible && (h.object.parent?.visible ?? true));
  const af = $('#af'); af.style.left = `${e.clientX - r.left}px`; af.style.top = `${e.clientY - r.top}px`; af.hidden = false; af.classList.remove('lock'); void af.offsetWidth; af.classList.add('lock');
  setTimeout(() => { af.hidden = true; }, 1200);
  if (!hit) return msg('Nothing to focus on there: the camera keeps the focus it had.');
  const dist = Math.max(0.3, cam.position.z - hit.point.z);
  pushUndo();
  if (step().blender) { S.s.blender.focusDist = Math.round(dist * 100) / 100; if (!S.s.blender.dof) msg('Focus Distance set. Turn on Depth of Field to see its effect.'); }
  else { if (locked('focus')) return; S.s.focus = Math.round(dist * 100) / 100; msg(tr('Focused at {m} m.', { m: S.s.focus.toFixed(2) })); }
  changed();
});

// ─── The camera, cut in half ─────────────────────────────────────────────────
const dslrCanvas = $('#dslr'), dslrHost = $('#dslr-host');
const dslrRenderer = new THREE.WebGLRenderer({ canvas: dslrCanvas, antialias: true, alpha: true });
dslrRenderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const dScene = new THREE.Scene();
const dCam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
dScene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2));
const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(3, 4, 5); dScene.add(dl);
const dslr = buildDslr(); dScene.add(dslr.root);
dCam.position.set(4.9, 1.4, 3.0);
const dControls = new OrbitControls(dCam, dslrCanvas);
dControls.target.set(0, 0.1, 0.6); dControls.enablePan = false; dControls.minDistance = 2.2; dControls.maxDistance = 9;
dControls.addEventListener('change', () => renderDslr());
function renderDslr() {
  dslrRenderer.render(dScene, dCam);
  const box = $('#labels');
  if (!$('#o-labels').checked) { box.innerHTML = ''; return; }
  const r = dslrCanvas.getBoundingClientRect();
  box.innerHTML = dslr.anchors().map(([name, p]) => { const v = p.clone().project(dCam); return `<span style="left:${(v.x + 1) / 2 * r.width}px;top:${(1 - v.y) / 2 * r.height}px">${esc(t(name))}</span>`; }).join('');
}
$('#o-labels').onchange = () => renderDslr();
function updateDslr() { const d = S.d; dslr.set({ f: d.f, N: isFinite(d.N) ? d.N : 22, sensor: d.sensor }); renderDslr(); }
function resize() {
  const r = dslrHost.getBoundingClientRect();
  if (r.width && r.height) { dslrRenderer.setSize(r.width, r.height, false); dCam.aspect = r.width / r.height; dCam.updateProjectionMatrix(); renderDslr(); }
}

// The shot: mirror up, aperture closes, curtains, mirror down
function shoot() {
  if (S.shooting) return;
  S.shooting = true; $('#shoot').disabled = true;
  const d = S.d, exposure = d.t || 1 / 250, tl = shotTimeline(exposure), t0 = performance.now();
  const note = $('#shot-note');
  note.textContent = tl.slowed ? tr('Exposure {t} s · shown slowed down', { t: O.shutterLabel(exposure) }) : tr('Exposure {t} s', { t: O.shutterLabel(exposure) });
  note.hidden = false;
  dslr.parts.button.position.y = 0.48;
  const tick = now => {
    const time = (now - t0) / 1000, st = tl.at(time);
    dslr.set({ mirror: st.mirror, stop: st.stop, first: st.first, second: st.second });
    dslr.parts.sensor.material.emissive.setHex(st.exposing ? 0x554477 : 0x000000);
    renderDslr();
    if (time < tl.total) requestAnimationFrame(tick);
    else {
      dslr.set({ mirror: 0, stop: 0, first: 0, second: 0 }); dslr.parts.button.position.y = 0.5; renderDslr();
      S.shooting = false; $('#shoot').disabled = false; note.hidden = true;
      seed++; renderPhoto(48); addShot();
      $('#photo-host').classList.remove('flash'); void $('#photo-host').offsetWidth; $('#photo-host').classList.add('flash');
    }
  };
  requestAnimationFrame(tick);
}
$('#shoot').onclick = shoot;
function addShot() {
  const c = document.createElement('canvas'); c.width = 150; c.height = Math.round(150 * IMAGE_H / S.d.width);
  c.getContext('2d').drawImage(photoCanvas, 0, 0, c.width, c.height);
  S.shots.unshift({ src: c.toDataURL('image/jpeg', 0.8), label: finderText(true) });
  S.shots = S.shots.slice(0, 6); renderShots();
}
function renderShots() {
  $('#shots').innerHTML = S.shots.length ? S.shots.map(s => `<figure><img src="${s.src}" alt=""><figcaption>${esc(s.label)}</figcaption></figure>`).join('') : `<p class="shots-empty">${esc(t('Your shots appear here: press Shoot (Space) to compare settings.'))}</p>`;
}

// ─── Viewfinder information line ─────────────────────────────────────────────
function finderText(short = false) {
  const d = S.d;
  if (step().blender) {
    const b = S.s.blender;
    return `${b.focal} mm · ${b.size} mm${b.dof ? ` · f/${b.fstop}` : ''}${b.mblur ? ` · ${b.shutter} fr @ ${b.fps} fps` : ''}`;
  }
  return `${S.s.mode}  ${O.shutterLabel(d.t)}  f/${d.N}  ISO ${d.iso}${short ? '' : ''}`;
}
function renderFinder() {
  const d = S.d, box = $('#finder');
  if (step().blender) {
    const b = S.s.blender;
    box.innerHTML = `<span class="f-item">${esc(t('Render'))}</span><span class="f-item"><b>${b.focal}</b> mm</span><span class="f-item">${esc(t('Sensor'))} <b>${b.size}</b> mm</span><span class="f-item">${b.dof ? `DoF <b>f/${b.fstop}</b> @ ${b.focusDist} m` : esc(t('DoF off'))}</span><span class="f-item">${b.mblur ? `${esc(t('Motion Blur'))} <b>${b.shutter}</b> fr = ${O.shutterLabel(O.blenderShutterSeconds(b.shutter, b.fps))} s` : esc(t('Motion Blur off'))}</span>`;
    return;
  }
  const err = Math.max(-3.4, Math.min(3.4, d.err)), off = Math.abs(d.err) > 3;
  const ticks = [-3, -2, -1, 0, 1, 2, 3].map(v => `<i class="${v === 0 ? 'zero' : ''}" style="left:${(v + 3) / 6 * 100}%"></i>`).join('');
  box.innerHTML = `<span class="f-mode">${S.s.mode}</span>
    <span class="f-item${d.auto === 't' ? ' auto' : ''}">${O.shutterLabel(d.t)}</span>
    <span class="f-item${d.auto === 'N' ? ' auto' : ''}">f/${d.N}</span>
    <span class="f-item">ISO ${d.iso}</span>
    <span class="meter${off ? ' off' : ''}" title="${esc(t('Exposure meter'))}"><span class="m-scale">${ticks}<b style="left:${(err + 3) / 6 * 100}%"></b></span><span class="m-labels"><span>−3</span><span>0</span><span>+3</span></span></span>
    <span class="f-item err ${Math.abs(d.err) <= 0.5 ? 'ok' : ''}">${d.err > 0 ? '+' : ''}${d.err.toFixed(1)} EV</span>`;
}

// ─── Settings panel ──────────────────────────────────────────────────────────
const logSlider = { toPos: m => Math.log(m / 0.5) / Math.log(100), toVal: p => 0.5 * Math.pow(100, p) };
function stepper(k, label, value, disabled, hint) {
  return `<div class="st-row${disabled ? ' disabled' : ''}"><span>${esc(t(label))}</span><button type="button" data-step="${k}" data-dir="-1"${disabled ? ' disabled' : ''} aria-label="${esc(t('Less'))}">−</button><b>${value}</b><button type="button" data-step="${k}" data-dir="1"${disabled ? ' disabled' : ''} aria-label="${esc(t('More'))}">+</button>${hint ? `<small>${esc(t(hint))}</small>` : ''}</div>`;
}
const LOCK_TITLE = 'Fixed in this step.';
function renderProps() {
  const d = S.d, s = S.s;
  if (step().blender) return renderBlenderProps();
  let h = `<div class="panel"><h4>${esc(t('Mode'))}</h4><div class="seg" role="group">${['M', 'Av', 'Tv'].map(m => `<button type="button" data-mode="${m}" aria-pressed="${s.mode === m}"${locked('mode') && s.mode !== m ? ` disabled title="${esc(t(LOCK_TITLE))}"` : ''}>${m}</button>`).join('')}</div>
    <p class="sb-empty">${esc(t(s.mode === 'M' ? 'Manual: you choose aperture, shutter and ISO.' : s.mode === 'Av' ? 'Aperture priority: you choose the aperture, the camera the shutter speed.' : 'Shutter priority: you choose the shutter speed, the camera the aperture.'))}</p></div>`;
  h += `<div class="panel"><h4>${esc(t('Exposure'))}<small>${esc(tr('Light: {l} · EV {e}', { l: t(O.LIGHTS[step().scene?.light || 'shade'].name), e: d.ev }))}</small></h4>
    ${stepper('N', 'Aperture', `f/${d.N}`, s.mode === 'Tv', s.mode === 'Tv' ? 'auto' : '')}
    ${stepper('t', 'Shutter', O.shutterLabel(d.t), s.mode === 'Av', s.mode === 'Av' ? 'auto' : '')}
    ${stepper('iso', 'ISO', d.iso, false)}
    <label class="live-toggle tripod${locked('tripod') ? ' disabled' : ''}"><input type="checkbox" data-set="tripod"${s.tripod ? ' checked' : ''}${locked('tripod') ? ' disabled' : ''}><span class="switch" aria-hidden="true"></span>${esc(t('Tripod'))}</label></div>`;
  h += `<div class="panel"><h4>${esc(t('Lens & sensor'))}</h4>
    <label class="sl-row"><span>${esc(t('Focal length'))}</span><input type="range" min="16" max="200" step="1" data-set="f" value="${s.f}"${locked('f') ? ' disabled' : ''}><output>${s.f} mm</output></label>
    <label class="sl-row"><span>${esc(t('Focus'))}</span><input type="range" min="0" max="1" step="0.001" data-set="focus" value="${logSlider.toPos(Math.min(50, s.focus)).toFixed(3)}"${locked('focus') ? ' disabled' : ''}><output>${s.focus >= 49.9 ? '∞' : s.focus.toFixed(2) + ' m'}</output></label>
    <label class="sl-row${locked('dist') ? ' disabled' : ''}"><span>${esc(t('Distance'))}</span><input type="range" min="1.5" max="20" step="0.1" data-set="dist" value="${s.dist}"${locked('dist') ? ` disabled title="${esc(t(LOCK_TITLE))}"` : ''}><output>${s.dist.toFixed(1)} m</output></label>
    <label class="sel-row"><span>${esc(t('Sensor'))}</span><select data-set="sensor"${locked('sensor') ? ' disabled' : ''}>${Object.entries(O.SENSORS).map(([k, v]) => `<option value="${k}"${s.sensor === k ? ' selected' : ''}>${esc(t(v.name))} (${v.w}×${v.h})</option>`).join('')}</select></label></div>`;
  h += `<div class="panel" id="readout">${readoutHtml()}</div>`;
  $('#props').innerHTML = h;
}
function readoutHtml() {
  const d = S.d, sc = step().scene || {}, bl = !!step().blender;
  const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
  let h = `<h4>${esc(t('Readout'))}</h4>`;
  if (!bl) h += row('Exposure', `${d.err > 0 ? '+' : ''}${d.err.toFixed(1)} EV`, Math.abs(d.err) <= 0.5);
  h += row('Depth of field', isFinite(d.N) ? `${d.dof.near.toFixed(2)} – ${isFinite(d.dof.far) ? d.dof.far.toFixed(1) : '∞'} m` : t('all sharp'));
  h += row('The person', t(d.inFocus ? 'in focus' : 'out of focus'), d.inFocus);
  h += row('Background blur', `${d.bgBlurPx.toFixed(1)} px`);
  if (sc.cyclist) h += row('Motion blur', `${d.motionPx.toFixed(1)} px`);
  if (!bl) h += row('Camera shake', `${d.shakePx.toFixed(1)} px`, d.shakePx <= 2);
  if (!bl && !d.tripod) h += row('Hand-held limit', O.shutterLabel(O.handheldLimit(d.f, d.sensor)));
  h += row('The person fills', `${Math.round(d.coverage * 100)}%`);
  h += row('Angle of view', `${O.fovDeg(d.f, d.sensor.w).toFixed(1)}°`);
  h += row('Full-frame equivalent', `${Math.round(d.equivalent)} mm`);
  if (step().track) h += row('Shots done', `${S.flags.wide ? '✓' : '·'} ${t('wide')}   ${S.flags.tele ? '✓' : '·'} ${t('tele')}`, !!(S.flags.wide && S.flags.tele));
  return h;
}
function renderBlenderProps() {
  const b = S.s.blender;
  const num = (k, label, v, min, max, stp, unit = '') => `<label class="bl-row"><span>${esc(label)}</span><input type="number" data-bl="${k}" min="${min}" max="${max}" step="${stp}" value="${v}"><em>${unit}</em></label>`;
  const chk = (k, label) => `<label class="bl-check"><input type="checkbox" data-bl="${k}"${b[k] ? ' checked' : ''}>${esc(label)}</label>`;
  let h = `<div class="panel bl" data-no-i18n><h4>${esc(t('Camera Properties'))}<small>Blender</small></h4>
    <div class="bl-sec">Lens</div>
    <label class="bl-row"><span>Type</span><span class="bl-fixed">Perspective</span></label>
    ${num('focal', 'Focal Length', b.focal, 1, 500, 1, 'mm')}
    <label class="bl-row"><span>Lens Unit</span><span class="bl-fixed">Millimeters</span></label>
    <div class="bl-sec">Camera</div>
    <label class="bl-row"><span>Sensor Fit</span><select data-bl="fit">${['Auto', 'Horizontal', 'Vertical'].map(v => `<option${b.fit === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    ${num('size', 'Size', b.size, 1, 100, 0.1, 'mm')}
    <div class="bl-sec">${chk('dof', 'Depth of Field')}</div>
    <div class="${b.dof ? '' : 'bl-off'}">${num('focusDist', 'Focus Distance', b.focusDist, 0.1, 100, 0.1, 'm')}${num('fstop', 'F-Stop', b.fstop, 0.5, 64, 0.1)}${num('blades', 'Blades', b.blades, 0, 16, 1)}</div></div>
    <div class="panel bl" data-no-i18n><h4>${esc(t('Render Properties'))}<small>Blender</small></h4>
    <div class="bl-sec">${chk('mblur', 'Motion Blur')}</div>
    <div class="${b.mblur ? '' : 'bl-off'}">${num('shutter', 'Shutter', b.shutter, 0, 2, 0.01, 'fr')}</div></div>
    <div class="panel bl" data-no-i18n><h4>${esc(t('Output Properties'))}<small>Blender</small></h4>
    <label class="bl-row"><span>Frame Rate</span><select data-bl="fps">${[24, 25, 30, 60].map(v => `<option value="${v}"${b.fps === v ? ' selected' : ''}>${v} fps</option>`).join('')}</select></label></div>`;
  h += `<div class="panel" id="readout">${readoutHtml()}</div>`;
  $('#props').innerHTML = h;
}
const LISTS = { N: O.APERTURES, t: O.SHUTTERS, iso: O.ISOS };
function stepSetting(k, dir) {
  const list = LISTS[k], cur = S.s[k];
  let i = list.findIndex(v => Math.abs(Math.log2(v / cur)) < 0.01); if (i < 0) i = 0;
  // aperture: + = smaller opening (bigger f-number); shutter: + = faster; ISO: + = higher
  const j = Math.max(0, Math.min(list.length - 1, i + dir));
  if (j === i) return msg('That is the end of the scale.');
  pushUndo(); S.s[k] = list[j]; changed();
}
let sliderUndo = false;
$('#props').addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (b) { stepSetting(b.dataset.step, +b.dataset.dir); return; }
  const m = e.target.closest('[data-mode]'); if (m && !m.disabled && S.s.mode !== m.dataset.mode) { pushUndo(); S.s.mode = m.dataset.mode; changed(); }
});
$('#props').addEventListener('input', e => {
  const k = e.target.dataset.set; if (!k || e.target.type !== 'range') return;
  if (!sliderUndo) { pushUndo(); sliderUndo = true; }
  const v = +e.target.value;
  if (k === 'focus') S.s.focus = Math.round(logSlider.toVal(v) * 100) / 100;
  else S.s[k] = v;
  if (k === 'dist' && stage().id === 'lens') S.s.focus = v; // continuous autofocus keeps the person sharp
  e.target.nextElementSibling.textContent = k === 'f' ? `${v} mm` : k === 'focus' ? (S.s.focus >= 49.9 ? '∞' : S.s.focus.toFixed(2) + ' m') : `${v.toFixed(1)} m`;
  changed(false);
});
$('#props').addEventListener('change', e => {
  const k = e.target.dataset.set, bl = e.target.dataset.bl;
  if (k && e.target.type === 'range') { sliderUndo = false; changed(); return; }
  if (k) { pushUndo(); S.s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; changed(); return; }
  if (bl) {
    pushUndo();
    const b = S.s.blender;
    if (e.target.type === 'checkbox') b[bl] = e.target.checked;
    else if (bl === 'fit') b.fit = e.target.value;
    else { const v = +e.target.value; if (!isFinite(v)) return; b[bl] = bl === 'fps' ? Math.round(v) : Math.max(+e.target.min, Math.min(+e.target.max, v)); }
    changed();
  }
});

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.d, S.flags, S.s) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.classList.toggle('three', n === 3); g.classList.toggle('five', n === 5);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t(s.blender ? 'HOW, IN BLENDER' : 'HOW, ON A CAMERA'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.s = startSettings(step()); S.flags = {}; changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); const s = startSettings(step()); SOLUTIONS[step().id](s, S.flags); S.s = s; changed(); msg('This is one possible solution. Ctrl Z brings your settings back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null;
function checkProgress() {
  if (step().track) { const k = step().track(S.d); if (k && !S.flags[k]) { S.flags[k] = true; msg(k === 'wide' ? 'Wide-angle shot done. Now the telephoto one.' : 'Telephoto shot done.'); } }
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) msg(tr('✓ Step done: {s}', { s: t(step().title) }));
  lastOk = ok;
}

// ─── Updates ────────────────────────────────────────────────────────────────
function changed(full = true) {
  S.d = derive(S.s, step());
  checkProgress();
  schedulePhoto(true); updateDslr(); renderFinder();
  if (full) { saveData(); renderProps(); renderGuide(); renderStepCard(); }
  else { const r = $('#readout'); if (r) r.innerHTML = readoutHtml(); }
}
function renderReference() {
  const box = $('#reference');
  if (!step().blender) { box.hidden = true; return; }
  const ts = targetSettings(step()), d = derive(ts, step()), c = $('#ref');
  world.setLook(step().scene?.light || 'shade'); world.cyclist.visible = !!step().scene?.cyclist;
  photoRenderer.setSize(d.width, IMAGE_H, false);
  pcam.render(world, photoParams(d), { samples: 40, width: d.width, height: IMAGE_H, cyclistSpeed: CYCLIST.speed, seed: 3 });
  c.width = 240; c.height = Math.round(240 * IMAGE_H / d.width);
  c.getContext('2d').drawImage(photoCanvas, 0, 0, c.width, c.height);
  box.hidden = false;
}
function enterStep() {
  loadData(); lastOk = null; S.shots = [];
  S.d = derive(S.s, step());
  $('#photo-title').textContent = t(step().blender ? 'Render (Blender camera)' : 'Photo');
  renderReference();
  lastOk = stepDone(S.step);
  renderStageSwitch(); renderGuide(); renderStepCard(); renderProps(); renderFinder(); renderShots();
  renderPhoto(40); updateDslr();
}
function renderAll() { renderStageSwitch(); renderGuide(); renderStepCard(); renderProps(); renderFinder(); renderShots(); renderDslr(); $('#photo-title').textContent = t(step().blender ? 'Render (Blender camera)' : 'Photo'); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// ─── Keyboard ───────────────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !S.hover) return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, bl = !!step().blender;
  let handled = true;
  if (ctrl && (k === 'z' || k === 'Z')) e.shiftKey ? redo() : undo();
  else if (ctrl && (k === 'y' || k === 'Y')) redo();
  else if (k === ' ') shoot();
  else if (!bl && k === '[' && S.s.mode !== 'Tv') stepSetting('N', -1);
  else if (!bl && k === ']' && S.s.mode !== 'Tv') stepSetting('N', 1);
  else if (!bl && k === ',' && S.s.mode !== 'Av') stepSetting('t', -1);
  else if (!bl && k === '.' && S.s.mode !== 'Av') stepSetting('t', 1);
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(resize).observe(dslrHost);
onLangChange(() => renderAll());
enterStep(); resize(); translateTitles();
window.__photo = { S, O, STAGES, derive, shoot, renderPhoto, dslr, renderDslr }; // for tests and curious students
