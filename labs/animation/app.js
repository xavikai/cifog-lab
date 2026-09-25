// Animation Lab: a bouncing ball with a Blender-style Graph Editor and Timeline.
import { recalcHandles, evaluate, moveKey, moveHandle, key, contacts, tops, intervals, hangTime, matchScore, INTERPOLATIONS, HANDLE_TYPES } from './fcurve.js';
import { STAGES, CHANNELS, FPS, RANGE, REFERENCE, startData, cloneData, scaleX, scaleZ, firstBounce } from './stages.js';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('cifog-anim:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cifog-anim:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const HANDLE_COLORS = { FREE: '#2b2b2b', ALIGNED: '#d56fd1', VECTOR: '#59c35b', AUTO: '#e8c14a', AUTO_CLAMPED: '#d9674a' };
const HANDLE_LABELS = { FREE: 'Free', ALIGNED: 'Aligned', VECTOR: 'Vector', AUTO: 'Automatic', AUTO_CLAMPED: 'Auto Clamped' };
const INTERP_LABELS = { CONSTANT: 'Constant', LINEAR: 'Linear', BEZIER: 'Bezier' };
const BALL_R = 0.5;

const S = {
  stageIndex: store.get('stage', 0), step: 0, data: null, frame: 1, start: RANGE[0], end: RANGE[1],
  playing: false, active: 'locZ', hidden: new Set(), activeKey: null,
  undo: [], redo: [], done: store.get('done', {}), toggles: { path: true, ghosts: false, ref: false },
  view: null, drag: null, grab: null, hover: false,
};
const stage = () => STAGES[S.stageIndex];

// ─── Data and persistence ───────────────────────────────────────────────────
function saveData() { store.set(`data-${stage().id}-${stage().independent ? S.step : 0}`, S.data); }
function loadData() {
  const saved = store.get(`data-${stage().id}-${stage().independent ? S.step : 0}`, null);
  S.data = saved && saved.channels ? saved : startData(stage(), S.step);
  for (const k of Object.values(S.data.channels)) { k.forEach(q => { q.select = false; }); recalcHandles(k); }
  S.activeKey = null; S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.data)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function restore(json) { S.data = JSON.parse(json); S.activeKey = null; changed(false); }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.data)); restore(S.undo.pop()); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.data)); restore(S.redo.pop()); msg('Redo'); }

const editable = id => !CHANNELS[id].locked && !(id === 'sclX' && S.data.maintainVolume);
const visibleChannels = () => stage().channels.filter(id => !S.hidden.has(id) && S.data.channels[id]);
function allKeys(filter = () => true) {
  const out = [];
  for (const id of visibleChannels()) if (filter(id)) for (const k of S.data.channels[id]) out.push({ id, k });
  return out;
}
const selected = () => allKeys(editable).filter(e => e.k.select);
function valueAt(id, f) {
  if (id === 'sclX') return scaleX(S.data, f);
  if (id === 'sclZ') return scaleZ(S.data, f);
  const k = S.data.channels[id];
  return k && k.length ? evaluate(k, f) : 0;
}

// ─── Status bar ──────────────────────────────────────────────────────────────
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg');
  el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────
function fitCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function niceStep(range, px, minPx) {
  const raw = range * minPx / Math.max(1, px);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

// ─── Camera view (the ball) ─────────────────────────────────────────────────
const viewCanvas = $('#view');
function drawView() {
  const { ctx, w, h } = fitCanvas(viewCanvas);
  const X0 = -0.9, X1 = 10.2, Z0 = -0.5, Z1 = 5.4;
  const sc = Math.min(w / (X1 - X0), h / (Z1 - Z0));
  const ox = (w - (X1 - X0) * sc) / 2 - X0 * sc, oy = h - ((h - (Z1 - Z0) * sc) / 2) + Z0 * sc;
  const px = x => ox + x * sc, pz = z => oy - z * sc;
  ctx.fillStyle = '#3d3d3d'; ctx.fillRect(0, 0, w, h);
  // floor and grid (1 m)
  ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 1;
  for (let x = Math.ceil(X0); x <= X1; x++) { ctx.beginPath(); ctx.moveTo(px(x), pz(0)); ctx.lineTo(px(x), pz(Z1)); ctx.stroke(); }
  for (let z = 1; z <= Z1; z++) { ctx.beginPath(); ctx.moveTo(px(X0), pz(z)); ctx.lineTo(px(X1), pz(z)); ctx.stroke(); }
  ctx.fillStyle = '#2f2f2f'; ctx.fillRect(0, pz(0), w, h - pz(0));
  ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, pz(0)); ctx.lineTo(w, pz(0)); ctx.stroke();
  ctx.fillStyle = '#9a9a9a'; ctx.font = '10px Inter, sans-serif';
  for (let z = 1; z <= 5; z++) ctx.fillText(`${z} m`, px(X0) + 4, pz(z) - 3);
  const pose = f => ({ x: valueAt('locX', f), z: Math.max(0, valueAt('locZ', f)), sx: scaleX(S.data, f), sz: scaleZ(S.data, f) });
  // reference ball (physics)
  const showRef = S.toggles.ref && stage().id === 'weight';
  if (showRef) {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffbf00aa'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let f = S.start; f <= S.end; f += 0.5) { const x = px(valueAt('locX', f)), y = pz(REFERENCE(f) + BALL_R); f === S.start ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (S.toggles.ghosts) for (let f = S.start; f <= S.end; f += 2) drawBall(ctx, pose(f), px, pz, sc, 0.13);
  if (S.toggles.path) {
    const keyFrames = new Set(S.data.channels.locZ.map(k => k.frame));
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1; ctx.beginPath();
    for (let f = S.start; f <= S.end; f++) { const p = pose(f), x = px(p.x), y = pz(p.z + BALL_R * p.sz); f === S.start ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    for (let f = S.start; f <= S.end; f++) {
      const p = pose(f), x = px(p.x), y = pz(p.z + BALL_R * p.sz), isKey = keyFrames.has(f);
      ctx.fillStyle = f === Math.round(S.frame) ? '#6aa8ff' : isKey ? '#ffd24a' : f < S.frame ? '#d8d8d8' : '#9c9c9c';
      ctx.beginPath(); ctx.arc(x, y, isKey ? 3.4 : 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (showRef) { const r = { x: valueAt('locX', S.frame), z: REFERENCE(S.frame), sx: 1, sz: 1 }; drawBall(ctx, r, px, pz, sc, 0, '#ffbf00'); }
  // shadow + ball
  const p = pose(S.frame);
  const sh = Math.max(0.25, 1 - p.z / 6);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * sh})`; ctx.beginPath(); ctx.ellipse(px(p.x), pz(0) + 2, BALL_R * sc * p.sx * sh, 4 * sh, 0, 0, Math.PI * 2); ctx.fill();
  drawBall(ctx, p, px, pz, sc, 1);
  const secs = ((S.frame - 1) / FPS).toFixed(2);
  $('#view-overlay').innerHTML = `<b>${esc(tr('Frame {n}', { n: Math.round(S.frame) }))}</b> · ${secs} s<br>${esc(tr('Height {v} m', { v: p.z.toFixed(2) }))} · ${esc(tr('Scale {x} × {z}', { x: p.sx.toFixed(2), z: p.sz.toFixed(2) }))}`;
}
function drawBall(ctx, p, px, pz, sc, alpha, outline) {
  const cx = px(p.x), cy = pz(p.z + BALL_R * p.sz), rx = BALL_R * sc * p.sx, ry = BALL_R * sc * p.sz;
  ctx.save();
  if (outline) { ctx.strokeStyle = outline; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return; }
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.1, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, '#ffe08a'); g.addColorStop(0.55, '#f0a020'); g.addColorStop(1, '#a75b08');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  if (alpha === 1) {
    ctx.strokeStyle = '#6b3a05'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.35, ry, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  }
  ctx.restore();
}

// ─── Graph Editor ───────────────────────────────────────────────────────────
const graphCanvas = $('#graph');
const RULER = 22;
function graphSize() { const r = graphCanvas.getBoundingClientRect(); return { w: r.width, h: r.height }; }
const gx = f => { const { w } = graphSize(); return (f - S.view.f0) / (S.view.f1 - S.view.f0) * w; };
const gy = v => { const { h } = graphSize(); return RULER + (1 - (v - S.view.v0) / (S.view.v1 - S.view.v0)) * (h - RULER - 14); };
const fx = x => { const { w } = graphSize(); return S.view.f0 + x / w * (S.view.f1 - S.view.f0); };
const vy = y => { const { h } = graphSize(); return S.view.v0 + (1 - (y - RULER) / (h - RULER - 14)) * (S.view.v1 - S.view.v0); };

function frameAll(onlySelected = false) {
  let f0 = Infinity, f1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const list = onlySelected ? selected() : allKeys();
  for (const { id, k } of list) {
    if (id === 'locX' && !onlySelected && visibleChannels().length > 1) continue; // X Location is only the travel
    for (const p of [k, k.left, k.right]) { f0 = Math.min(f0, p.frame); f1 = Math.max(f1, p.frame); v0 = Math.min(v0, p.value); v1 = Math.max(v1, p.value); }
  }
  if (visibleChannels().includes('sclX') && S.data.maintainVolume && !onlySelected) { v0 = Math.min(v0, 0.5); v1 = Math.max(v1, 1.5); }
  if (!isFinite(f0)) { f0 = S.start; f1 = S.end; v0 = 0; v1 = 4; }
  if (!onlySelected) { f0 = Math.min(f0, S.start); f1 = Math.max(f1, S.end); }
  if (f1 - f0 < 6) { f0 -= 3; f1 += 3; }
  if (v1 - v0 < 0.4) { v0 -= 0.2; v1 += 0.2; }
  const pf = (f1 - f0) * 0.04, pv = (v1 - v0) * 0.12;
  S.view = { f0: f0 - pf, f1: f1 + pf, v0: v0 - pv, v1: v1 + pv };
}

function drawGraph() {
  const { ctx, w, h } = fitCanvas(graphCanvas);
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  // grid
  const fs = Math.max(1, niceStep(S.view.f1 - S.view.f0, w, 46)), vs = niceStep(S.view.v1 - S.view.v0, h, 34);
  ctx.lineWidth = 1; ctx.font = '10px Inter, sans-serif';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) { ctx.strokeStyle = '#2e2e2e'; ctx.beginPath(); ctx.moveTo(gx(f), RULER); ctx.lineTo(gx(f), h); ctx.stroke(); }
  for (let v = Math.ceil(S.view.v0 / vs) * vs; v <= S.view.v1; v += vs) {
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#444' : '#2e2e2e'; ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(w, gy(v)); ctx.stroke();
    ctx.fillStyle = '#8a8a8a'; ctx.fillText(+v.toFixed(2), 4, gy(v) - 2);
  }
  // outside the frame range
  ctx.fillStyle = '#00000040';
  if (gx(S.start) > 0) ctx.fillRect(0, RULER, gx(S.start), h);
  if (gx(S.end) < w) ctx.fillRect(gx(S.end), RULER, w - gx(S.end), h);
  // reference
  if (S.toggles.ref && stage().id === 'weight' && !S.hidden.has('locZ')) {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffbf00b0'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = gy(REFERENCE(fx(x))); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // contact intervals under the Z Location curve
  if (!S.hidden.has('locZ')) {
    const c = contacts(S.data.channels.locZ), y = gy(0) + 12;
    ctx.strokeStyle = '#6f8fb8'; ctx.fillStyle = '#9dc0ea'; ctx.lineWidth = 1;
    intervals(c).forEach((n, i) => {
      const a = gx(c[i]), b = gx(c[i + 1]);
      ctx.beginPath(); ctx.moveTo(a, y - 4); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 4); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(`${n} f`, (a + b) / 2, y + 11); ctx.textAlign = 'left';
    });
  }
  // curves
  for (const id of visibleChannels()) {
    const ch = CHANNELS[id], act = id === S.active;
    ctx.strokeStyle = ch.color; ctx.globalAlpha = act ? 1 : 0.55; ctx.lineWidth = act ? 2 : 1.4;
    if (!editable(id)) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 1.5) { const y = gy(valueAt(id, fx(x))); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) {
      if (k.select && k.interp === 'BEZIER' || k.select && prevInterp(id, k) === 'BEZIER') {
        const col = HANDLE_COLORS[k.handle];
        for (const side of ['left', 'right']) {
          const hp = k[side];
          if (side === 'left' && prevInterp(id, k) !== 'BEZIER') continue;
          if (side === 'right' && k.interp !== 'BEZIER') continue;
          ctx.strokeStyle = col === '#2b2b2b' ? '#111' : col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(gx(k.frame), gy(k.value)); ctx.lineTo(gx(hp.frame), gy(hp.value)); ctx.stroke();
          ctx.fillStyle = S.drag?.handle?.k === k && S.drag.handle.side === side ? '#fff' : col === '#2b2b2b' ? '#ddd' : col;
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(gx(hp.frame), gy(hp.value), 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
    for (const k of S.data.channels[id]) {
      ctx.fillStyle = k.select ? (k === S.activeKey ? '#ffffff' : '#ffaa33') : '#111';
      ctx.strokeStyle = k.select ? '#000' : '#e0e0e0'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(gx(k.frame), gy(k.value), 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  // box select
  if (S.drag?.box) {
    const b = S.drag.box; ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.setLineDash([]);
  }
  // ruler + current frame
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, w, RULER);
  ctx.fillStyle = '#9a9a9a';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) ctx.fillText(String(f), gx(f) + 2, 14);
  const cx = gx(S.frame);
  ctx.strokeStyle = '#4772b3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, RULER); ctx.lineTo(cx, h); ctx.stroke();
  ctx.fillStyle = '#4772b3'; const lab = String(Math.round(S.frame)), lw = ctx.measureText(lab).width + 10;
  ctx.fillRect(cx - lw / 2, 3, lw, 16); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(lab, cx, 15); ctx.textAlign = 'left';
  if (S.grab) { ctx.fillStyle = '#ffffffcc'; ctx.fillText(t(S.grab.axis ? `Move · only ${S.grab.axis === 'x' ? 'time' : 'value'}` : 'Move · X time only · Y value only · click to confirm'), 8, h - 8); }
}
function prevInterp(id, k) { const ks = S.data.channels[id], i = ks.indexOf(k); return i > 0 ? ks[i - 1].interp : null; }

function hitTest(x, y) {
  const near = (p, r = 8) => Math.hypot(gx(p.frame) - x, gy(p.value) - y) <= r;
  for (const id of visibleChannels()) {
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) if (k.select) {
      if (prevInterp(id, k) === 'BEZIER' && near(k.left, 7)) return { id, k, side: 'left' };
      if (k.interp === 'BEZIER' && near(k.right, 7)) return { id, k, side: 'right' };
    }
  }
  const order = [S.active, ...visibleChannels().filter(i => i !== S.active)];
  for (const id of order) {
    if (!visibleChannels().includes(id) || !editable(id)) continue;
    for (const k of S.data.channels[id]) if (near(k)) return { id, k };
  }
  return null;
}
function clearSelection() { for (const { k } of allKeys()) k.select = false; S.activeKey = null; }

function setupGraphInput() {
  const c = graphCanvas;
  c.addEventListener('contextmenu', e => { e.preventDefault(); if (S.grab) return cancelGrab(); openMenu('context', e.clientX, e.clientY); });
  c.addEventListener('pointerdown', e => {
    closeMenu();
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.grab) { if (e.button === 0) confirmGrab(); else cancelGrab(); return; }
    if (e.button === 1) { S.drag = { pan: true, x, y, view: { ...S.view } }; c.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (e.button !== 0) return;
    c.setPointerCapture(e.pointerId);
    if (y < RULER) { S.drag = { scrub: true }; setFrame(Math.round(fx(x))); return; }
    const hit = hitTest(x, y);
    if (hit?.side) { S.drag = { handle: hit, x, y, started: false }; S.active = hit.id; S.activeKey = hit.k; renderAll(); return; }
    if (hit) {
      if (e.shiftKey) { hit.k.select = !hit.k.select; S.activeKey = hit.k.select ? hit.k : null; }
      else if (!hit.k.select) { clearSelection(); hit.k.select = true; S.activeKey = hit.k; }
      else S.activeKey = hit.k;
      S.active = hit.id;
      S.drag = { move: true, x, y, started: false };
      renderAll(); return;
    }
    if (!e.shiftKey) clearSelection();
    S.drag = { box: { x0: x, y0: y, x1: x, y1: y }, add: e.shiftKey };
    renderAll();
  });
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.grab) { updateGrab(x, y); return; }
    const d = S.drag; if (!d) return;
    if (d.pan) {
      const df = (x - d.x) / r.width * (d.view.f1 - d.view.f0), dv = (y - d.y) / (r.height - RULER - 14) * (d.view.v1 - d.view.v0);
      S.view = { f0: d.view.f0 - df, f1: d.view.f1 - df, v0: d.view.v0 + dv, v1: d.view.v1 + dv }; drawGraph(); return;
    }
    if (d.scrub) { setFrame(Math.round(fx(x))); return; }
    if (d.box) { d.box.x1 = x; d.box.y1 = y; drawGraph(); return; }
    if (!d.started && Math.hypot(x - d.x, y - d.y) < 3) return;
    if (!d.started) { d.started = true; pushUndo(); if (d.move) startGrab(d.x, d.y, true); }
    if (d.handle) { moveHandle(d.handle.k, d.handle.side, fx(x), vy(y)); changed(); return; }
    if (d.move) updateGrab(x, y);
  });
  const end = () => {
    const d = S.drag; S.drag = null;
    if (S.grab?.byDrag) { confirmGrab(); return; }
    if (d?.box) {
      const b = d.box, xa = Math.min(b.x0, b.x1), xb = Math.max(b.x0, b.x1), ya = Math.min(b.y0, b.y1), yb = Math.max(b.y0, b.y1);
      for (const { k } of allKeys(editable)) { const X = gx(k.frame), Y = gy(k.value); if (X >= xa && X <= xb && Y >= ya && Y <= yb) k.select = true; }
      renderAll();
    }
    if (d?.handle?.k && d.started) changed(true);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const f = fx(x), v = vy(y), z = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    S.view = { f0: f - (f - S.view.f0) * z, f1: f + (S.view.f1 - f) * z, v0: v - (v - S.view.v0) * z, v1: v + (S.view.v1 - v) * z };
    drawGraph();
  }, { passive: false });
}

// G: move the selected keys with the mouse (also used when dragging).
function startGrab(x, y, byDrag = false) {
  const sel = selected();
  if (!sel.length) return msg('Select keyframes first.', true);
  if (!byDrag) pushUndo();
  S.grab = { x, y, byDrag, axis: null, orig: sel.map(({ id, k }) => ({ id, k, frame: k.frame, value: k.value, left: { ...k.left }, right: { ...k.right } })) };
  drawGraph();
}
function updateGrab(x, y) {
  const g = S.grab; if (!g) return;
  g.lastX = x; g.lastY = y;
  let df = Math.round(fx(x) - fx(g.x)), dv = vy(y) - vy(g.y);
  if (g.axis === 'x') dv = 0;
  if (g.axis === 'y') df = 0;
  for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; }
  // keys of one channel can't land on another key's frame
  const blocked = g.orig.some(o => S.data.channels[o.id].some(k => !k.select && k.frame === o.frame + df));
  if (blocked) df = 0;
  for (const o of g.orig) moveKey(o.k, o.frame + df, +(o.value + dv).toFixed(3));
  for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]);
  changed(false);
}
function confirmGrab() { if (!S.grab) return; S.grab = null; changed(true); }
function cancelGrab() {
  const g = S.grab; if (!g) return;
  for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; }
  for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]);
  S.grab = null; S.undo.pop(); changed(false);
}

// ─── Key operations ─────────────────────────────────────────────────────────
function setInterp(mode) {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo(); for (const { k } of sel) k.interp = mode;
  msg(tr('Interpolation: {m}', { m: INTERP_LABELS[mode] })); changed(true);
}
function setHandle(type) {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo(); for (const { k } of sel) k.handle = type;
  for (const id of new Set(sel.map(e => e.id))) recalcHandles(S.data.channels[id]);
  msg(tr('Handle type: {m}', { m: HANDLE_LABELS[type] })); changed(true);
}
function insertKey() {
  const id = S.active;
  if (!editable(id)) return msg(CHANNELS[id].locked ? 'This channel is locked in this lab.' : 'X Scale is calculated by Maintain Volume.', true);
  const f = Math.round(S.frame), ks = S.data.channels[id];
  pushUndo();
  let k = ks.find(q => q.frame === f);
  if (!k) { k = key(f, +valueAt(id, f).toFixed(3)); ks.push(k); }
  clearSelection(); k.select = true; S.activeKey = k;
  recalcHandles(ks);
  msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: CHANNELS[id].name, n: f })); changed(true);
}
function deleteKeys() {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo();
  for (const id of new Set(sel.map(e => e.id))) {
    const ks = S.data.channels[id], keep = ks.filter(k => !k.select);
    S.data.channels[id] = keep.length ? keep : [ks[0]];
    recalcHandles(S.data.channels[id]);
  }
  S.activeKey = null; msg('Deleted keyframes.'); changed(true);
}
function selectAll(on) { for (const { k } of allKeys(editable)) k.select = on; S.activeKey = null; renderAll(); }

// ─── Menus ──────────────────────────────────────────────────────────────────
const menuEl = $('#menu');
function menuItems(kind) {
  const interp = INTERPOLATIONS.map(m => ({ label: INTERP_LABELS[m], act: () => setInterp(m) }));
  const handles = HANDLE_TYPES.map(m => ({ label: HANDLE_LABELS[m], act: () => setHandle(m) }));
  switch (kind) {
    case 'view': return { title: 'View', items: [{ label: 'Frame All', key: 'Home', act: () => { frameAll(); drawGraph(); } }, { label: 'Frame Selected', key: 'Numpad .', act: () => { frameAll(true); drawGraph(); } }] };
    case 'select': return { title: 'Select', items: [{ label: 'All', key: 'A', act: () => selectAll(true) }, { label: 'None', key: 'Alt A', act: () => selectAll(false) }] };
    case 'interp': return { title: 'Set Keyframe Interpolation', items: interp };
    case 'handle': return { title: 'Set Keyframe Handle Type', items: handles };
    case 'key': case 'context': return {
      title: kind === 'key' ? 'Key' : 'Keyframe',
      items: [
        { label: 'Insert Keyframe', key: 'I', act: insertKey }, { label: 'Delete Keyframes', key: 'X', act: deleteKeys }, { hr: true },
        { label: 'Interpolation Mode', key: 'T', act: () => openMenu('interp', lastMenuPos.x, lastMenuPos.y) },
        { label: 'Handle Type', key: 'V', act: () => openMenu('handle', lastMenuPos.x, lastMenuPos.y) }, { hr: true },
        { label: 'Undo', key: 'Ctrl Z', act: undo },
      ],
    };
  }
}
let lastMenuPos = { x: 0, y: 0 };
function openMenu(kind, x, y) {
  const m = menuItems(kind); lastMenuPos = { x, y };
  menuEl.innerHTML = `<div class="menu-title">${esc(t(m.title))}</div>` + m.items.map((it, i) => it.hr ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}"><span class="m-label">${esc(t(it.label))}</span>${it.key ? `<span class="m-key">${esc(it.key)}</span>` : ''}</button>`).join('');
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menuEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  menuEl.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = m.items[+b.dataset.i]; closeMenu(); it.act(); };
  menuEl.querySelector('button')?.focus();
}
function closeMenu() { menuEl.hidden = true; document.querySelectorAll('.menu-button[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded')); }
document.querySelectorAll('.menu-button[data-menu]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(b.dataset.menu, r.left, r.bottom + 2); b.setAttribute('aria-expanded', 'true');
}));
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest('.menu-button')) closeMenu(); });

// ─── Channels list and sidebar ──────────────────────────────────────────────
function renderChannels() {
  const box = $('#channels');
  box.innerHTML = `<div class="ch-group">${esc(t('Ball · Object Transforms'))}</div>` + stage().channels.map(id => {
    const ch = CHANNELS[id], driven = id === 'sclX' && S.data.maintainVolume;
    return `<div class="channel${id === S.active ? ' active' : ''}${ch.locked ? ' locked' : ''}${driven ? ' driven' : ''}" data-ch="${id}" title="${esc(t(ch.locked ? 'Locked in this lab: the ball travels at a constant speed.' : driven ? 'Calculated by Maintain Volume.' : 'Click to make it the active channel.'))}"><button type="button" class="eye" data-eye="${id}" aria-pressed="${!S.hidden.has(id)}" aria-label="Show ${ch.name}">${S.hidden.has(id) ? '◌' : '◉'}</button><span class="swatch" style="background:${ch.color}"></span><span class="ch-name" data-no-i18n>${ch.name}</span>${ch.locked ? '<span class="ch-lock" aria-hidden="true">🔒</span>' : ''}</div>`;
  }).join('');
}
$('#channels').addEventListener('click', e => {
  const eye = e.target.closest('[data-eye]');
  if (eye) { const id = eye.dataset.eye; S.hidden.has(id) ? S.hidden.delete(id) : S.hidden.add(id); renderAll(); return; }
  const row = e.target.closest('[data-ch]'); if (!row) return;
  S.active = row.dataset.ch; renderAll();
});

function renderSidebar() {
  const k = S.activeKey, id = S.active;
  let html = `<h4>${esc(t('F-Curve'))}</h4><div class="sb-stat"><span>${esc(t('Active'))}</span><b data-no-i18n>${esc(CHANNELS[id].name)}</b></div><div class="sb-stat"><span>${esc(t('Value now'))}</span><b>${valueAt(id, S.frame).toFixed(2)}</b></div><div class="sb-sep"></div><h4>${esc(t('Active Keyframe'))}</h4>`;
  const owner = k && Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k));
  if (k && owner && editable(owner)) {
    html += `<label>${esc(t('Frame'))}<input type="number" step="1" data-kf="frame" value="${k.frame}"></label>
      <label>${esc(t('Value'))}<input type="number" step="0.05" data-kf="value" value="${+k.value.toFixed(3)}"></label>
      <label>${esc(t('Interpolation'))}<select data-kf="interp">${INTERPOLATIONS.map(m => `<option value="${m}"${k.interp === m ? ' selected' : ''}>${INTERP_LABELS[m]}</option>`).join('')}</select></label>
      <label>${esc(t('Handles'))}<select data-kf="handle">${HANDLE_TYPES.map(m => `<option value="${m}"${k.handle === m ? ' selected' : ''}>${HANDLE_LABELS[m]}</option>`).join('')}</select></label>`;
  } else html += `<p class="sb-empty">${esc(t('Click a keyframe to see and edit it here.'))}</p>`;
  const z = S.data.channels.locZ, c = contacts(z), tp = tops(z);
  html += `<div class="sb-sep"></div><h4>${esc(t('Bounces'))}</h4>`;
  html += `<div class="sb-stat"><span>${esc(t('Heights'))}</span><b>${tp.map(q => q.value.toFixed(1)).join(' › ') || '—'}</b></div>`;
  html += `<div class="sb-stat"><span>${esc(t('Frames'))}</span><b>${intervals(c).join(' › ') || '—'}</b></div>`;
  const fb = firstBounce(z);
  if (stage().id === 'weight') {
    if (fb) html += `<div class="sb-stat"><span>${esc(t('Hang time'))}</span><b>${Math.round(hangTime(z, fb[0], fb[1]) * 100)}%</b></div>`;
    if (S.toggles.ref) html += `<div class="sb-stat"><span>${esc(t('Match'))}</span><b>${matchScore(z, REFERENCE, 1, 60)}%</b></div>`;
  }
  if (stage().id === 'squash') html += `<div class="sb-stat"><span>${esc(t('Z Scale now'))}</span><b>${scaleZ(S.data, S.frame).toFixed(2)}</b></div>`;
  $('#sidebar').innerHTML = html;
}
$('#sidebar').addEventListener('change', e => {
  const f = e.target.dataset.kf, k = S.activeKey; if (!f || !k) return;
  const id = Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k)); if (!id) return;
  pushUndo();
  if (f === 'frame') {
    const n = Math.round(+e.target.value);
    if (S.data.channels[id].some(q => q !== k && q.frame === n)) { msg('There is already a keyframe on that frame.', true); S.undo.pop(); renderSidebar(); return; }
    moveKey(k, n, k.value);
  }
  if (f === 'value') moveKey(k, k.frame, +e.target.value);
  if (f === 'interp') k.interp = e.target.value;
  if (f === 'handle') k.handle = e.target.value;
  recalcHandles(S.data.channels[id]);
  changed(true);
});

// ─── Timeline ───────────────────────────────────────────────────────────────
const tlCanvas = $('#timeline');
function drawTimeline() {
  const { ctx, w, h } = fitCanvas(tlCanvas);
  const f0 = 0, f1 = Math.max(S.end + 4, 76), X = f => 10 + (f - f0) / (f1 - f0) * (w - 20);
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#00000045'; ctx.fillRect(0, 0, X(S.start), h); ctx.fillRect(X(S.end), 0, w - X(S.end), h);
  ctx.font = '10px Inter, sans-serif';
  for (let f = 0; f <= f1; f++) {
    const big = f % 10 === 0, mid = f % 5 === 0;
    ctx.strokeStyle = big ? '#555' : '#353535'; ctx.beginPath(); ctx.moveTo(X(f), big ? 0 : mid ? 10 : 16); ctx.lineTo(X(f), h); ctx.stroke();
    if (big || (mid && w > 700)) { ctx.fillStyle = '#9a9a9a'; ctx.fillText(String(f), X(f) + 2, 11); }
  }
  const frames = new Map();
  for (const { id, k } of allKeys()) if (!CHANNELS[id].locked) frames.set(k.frame, (frames.get(k.frame) || false) || k.select);
  for (const [f, sel] of frames) {
    const x = X(f), y = h / 2 + 8;
    ctx.fillStyle = sel ? '#ffaa33' : '#dcdcdc'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const cx = X(S.frame);
  ctx.strokeStyle = '#4772b3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke(); ctx.lineWidth = 1;
  tlCanvas._X = X; tlCanvas._inv = x => f0 + (x - 10) / (w - 20) * (f1 - f0);
}
function setupTimeline() {
  let down = false;
  const at = e => { const r = tlCanvas.getBoundingClientRect(); setFrame(Math.round(tlCanvas._inv(e.clientX - r.left))); };
  tlCanvas.addEventListener('pointerdown', e => { down = true; tlCanvas.setPointerCapture(e.pointerId); at(e); });
  tlCanvas.addEventListener('pointermove', e => { if (down) at(e); });
  tlCanvas.addEventListener('pointerup', () => { down = false; });
  $('#b-play').onclick = togglePlay;
  $('#b-start').onclick = () => setFrame(S.start);
  $('#b-end').onclick = () => setFrame(S.end);
  $('#b-nextkey').onclick = () => jumpKey(1);
  $('#b-prevkey').onclick = () => jumpKey(-1);
  $('#f-cur').onchange = e => setFrame(+e.target.value);
  $('#f-start').onchange = e => { S.start = Math.max(0, Math.min(+e.target.value, S.end - 1)); renderAll(); };
  $('#f-end').onchange = e => { S.end = Math.max(S.start + 1, +e.target.value); renderAll(); };
}
function setFrame(f) { S.frame = Math.max(0, Math.min(250, f)); renderLive(); }
function jumpKey(dir) {
  const frames = [...new Set(allKeys(id => !CHANNELS[id].locked).map(e => e.k.frame))].sort((a, b) => a - b);
  const cur = Math.round(S.frame);
  const f = dir > 0 ? frames.find(x => x > cur) : [...frames].reverse().find(x => x < cur);
  if (f != null) setFrame(f);
}
let raf = 0, lastT = 0;
function togglePlay() {
  S.playing = !S.playing;
  $('#b-play').textContent = S.playing ? '❚❚' : '▶'; $('#b-play').setAttribute('aria-pressed', String(S.playing));
  if (S.playing) { lastT = performance.now(); if (S.frame >= S.end) S.frame = S.start; raf = requestAnimationFrame(tick); }
  else cancelAnimationFrame(raf);
}
function tick(now) {
  if (!S.playing) return;
  const df = (now - lastT) / 1000 * FPS;
  if (df >= 1) { lastT = now; S.frame = S.frame + 1 > S.end ? S.start : S.frame + 1; renderLive(); }
  raf = requestAnimationFrame(tick);
}

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  const box = $('#stage-switch');
  box.innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]'); if (!b) return;
  saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStage();
});
function stepDone(i) {
  const st = stage();
  if (st.independent) return i === S.step ? st.steps[i].check(S.data) : !!S.done[`${st.id}-${i}`];
  return st.steps[i].check(S.data);
}
function currentStep() {
  const st = stage();
  if (st.independent) return S.step;
  const i = st.steps.findIndex((_, j) => !stepDone(j));
  return S.focus != null ? S.focus : (i < 0 ? st.steps.length - 1 : i);
}
function renderGuide() {
  const st = stage(), cur = currentStep();
  const g = $('#guide'); g.classList.toggle('three', st.steps.length === 3);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === cur ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === cur ? 'Now' : st.independent ? 'Click to load' : 'Next'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => {
  const li = e.target.closest('[data-step]'); if (!li) return;
  const i = +li.dataset.step, st = stage();
  if (st.independent) { saveData(); S.step = i; loadData(); S.toggles.ref = !!st.steps[i].reference; syncToggles(); frameAll(); renderAll(); }
  else { S.focus = i; renderAll(); }
});
function renderStepCard() {
  const st = stage(), i = currentStep(), s = st.steps[i], ok = stepDone(i);
  const card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-stage">${esc(t(st.independent ? 'Reset this step' : 'Reset stage'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const st = stage();
  if (e.target.id === 'reset-stage') { pushUndo(); S.data = startData(st, S.step); S.focus = null; changed(true); frameAll(); renderAll(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (e.target.id === 'show-solution') {
    pushUndo();
    const i = currentStep();
    if (st.independent) { S.data = startData(st, i); st.steps[i].solve(S.data); }
    else { const d = startData(st); for (let j = 0; j <= i; j++) st.steps[j].solve(d); S.data = d; }
    for (const k of Object.values(S.data.channels)) recalcHandles(k);
    S.activeKey = null; changed(true); msg('This is one possible solution. Ctrl Z brings your version back.');
  }
  if (e.target.id === 'next-step') {
    if (st.independent) { saveData(); S.step++; loadData(); S.toggles.ref = !!st.steps[S.step].reference; syncToggles(); frameAll(); }
    else S.focus = null;
    renderAll();
  }
  if (e.target.id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStage(); }
});

let lastDone = null;
function checkProgress() {
  const st = stage(), cur = currentStep();
  const states = st.steps.map((_, i) => stepDone(i));
  if (st.independent && states[S.step]) S.done[`${st.id}-${S.step}`] = true;
  store.set('done', S.done);
  if (lastDone) states.forEach((d, i) => { if (d && !lastDone[i]) msg(tr('✓ Step done: {s}', { s: t(st.steps[i].title) })); });
  lastDone = states;
  if (S.focus != null && states[S.focus] && S.focus === cur) { /* keep focus */ }
}

// ─── Rendering and updates ──────────────────────────────────────────────────
function syncToggles() {
  $('#t-path').checked = S.toggles.path; $('#t-ghosts').checked = S.toggles.ghosts; $('#t-ref').checked = S.toggles.ref;
  $('#t-volume').checked = !!S.data.maintainVolume;
  $('#volume-toggle').hidden = stage().id !== 'squash';
  $('#ref-toggle').hidden = stage().id !== 'weight';
}
function renderLive() {
  drawView(); drawGraph(); drawTimeline();
  $('#f-cur').value = Math.round(S.frame);
  $('#time-sec').textContent = `${((S.frame - 1) / FPS).toFixed(2)} s`;
  if (!S.playing) renderSidebar();
}
function renderAll() {
  renderStageSwitch(); renderChannels(); renderGuide(); renderStepCard(); syncToggles();
  $('#f-start').value = S.start; $('#f-end').value = S.end;
  renderLive(); renderSidebar();
}
function changed(commit = true) {
  if (commit) { saveData(); checkProgress(); renderGuide(); renderStepCard(); renderChannels(); }
  renderLive();
}
function enterStage() {
  S.focus = null; lastDone = null; S.hidden.clear(); S.hidden.add('locX'); // the travel curve is shown on demand
  S.active = 'locZ';
  loadData();
  S.toggles.ref = stage().independent ? !!stage().steps[S.step].reference : false;
  frameAll(); renderAll(); checkProgress();
}

$('#t-path').onchange = e => { S.toggles.path = e.target.checked; renderLive(); };
$('#t-ghosts').onchange = e => { S.toggles.ghosts = e.target.checked; renderLive(); };
$('#t-ref').onchange = e => { S.toggles.ref = e.target.checked; renderAll(); };
$('#t-volume').onchange = e => { pushUndo(); S.data.maintainVolume = e.target.checked; msg(e.target.checked ? 'Maintain Volume on: X Scale = 1 / √(Z Scale).' : 'Maintain Volume off.'); changed(true); renderChannels(); };

// ─── Keyboard (only while the pointer is over the workspace, like Blender) ──
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
let lastPointer = { x: 0, y: 0 };
graphCanvas.addEventListener('pointermove', e => { const r = graphCanvas.getBoundingClientRect(); lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY }; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (!S.hover && !S.grab && e.key !== 'Escape') return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (S.grab) {
    if (k === 'Escape') { cancelGrab(); e.preventDefault(); return; }
    if (k === 'Enter') { confirmGrab(); e.preventDefault(); return; }
    if (k === 'x' || k === 'X') { S.grab.axis = S.grab.axis === 'x' ? null : 'x'; updateGrab(S.grab.lastX ?? S.grab.x, S.grab.lastY ?? S.grab.y); e.preventDefault(); return; }
    if (k === 'y' || k === 'Y') { S.grab.axis = S.grab.axis === 'y' ? null : 'y'; updateGrab(S.grab.lastX ?? S.grab.x, S.grab.lastY ?? S.grab.y); e.preventDefault(); return; }
    return;
  }
  let handled = true;
  if (ctrl && (k === 'z' || k === 'Z')) e.shiftKey ? redo() : undo();
  else if (ctrl && (k === 'y' || k === 'Y')) redo();
  else if (k === ' ') togglePlay();
  else if (k === 'ArrowRight') e.shiftKey ? setFrame(S.end) : setFrame(Math.round(S.frame) + 1);
  else if (k === 'ArrowLeft') e.shiftKey ? setFrame(S.start) : setFrame(Math.round(S.frame) - 1);
  else if (k === 'ArrowUp') jumpKey(1);
  else if (k === 'ArrowDown') jumpKey(-1);
  else if (k === 'Home') { frameAll(); drawGraph(); }
  else if (k === '.') { frameAll(true); drawGraph(); }
  else if ((k === 'a' || k === 'A') && e.altKey) selectAll(false);
  else if (k === 'a' || k === 'A') selectAll(true);
  else if (k === 'g' || k === 'G') startGrab(lastPointer.x, lastPointer.y);
  else if (k === 'i' || k === 'I') insertKey();
  else if (k === 'x' || k === 'X' || k === 'Delete') deleteKeys();
  else if (k === 't' || k === 'T') openMenu('interp', lastPointer.cx || innerWidth / 2, lastPointer.cy || innerHeight / 2);
  else if (k === 'v' || k === 'V') openMenu('handle', lastPointer.cx || innerWidth / 2, lastPointer.cy || innerHeight / 2);
  else if (k === 'Escape') closeMenu();
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
setupGraphInput(); setupTimeline();
new ResizeObserver(() => renderLive()).observe($('#graph-host'));
new ResizeObserver(() => renderLive()).observe($('#view-host'));
onLangChange(() => renderAll());
enterStage();
window.__anim = S; // for tests and curious students
