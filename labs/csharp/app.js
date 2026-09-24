import { compile, Runner, CSharpError, literal } from './interpreter.js';
import { LEVELS, CHALLENGES, API, checkRequirements } from './levels.js';
import { prepare, verifySeeds } from './evaluate.js';
import { compare } from './world.js';
import { IsoView, PALETTE } from './render.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('cifog-csharp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cifog-csharp:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const SPEEDS = [{ label: 'Slow', ms: 900 }, { label: 'Normal', ms: 380 }, { label: 'Fast', ms: 130 }, { label: 'Very fast', ms: 35 }, { label: 'Instant', ms: 0 }];
const LH = 21;

const ta = $('#code'), layer = $('#code-layer'), gutter = $('#gutter'), editor = $('#editor');
const view = new IsoView($('#scene'));
const S = {
  index: 0, challenge: null, done: new Set(store.get('done', [])),
  mode: 'idle', runner: null, gen: null, world: null, target: {}, seed: 1, compiled: null,
  event: null, prevLine: null, breakpoints: new Set(), timer: null, errorLines: new Map(),
  result: null, outEl: null, speed: store.get('speed', 1),
};

// ─── Syntax highlighting ─────────────────────────────────────────────────────
const KW = new Set(['int', 'float', 'double', 'bool', 'string', 'var', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'true', 'false', 'using', 'return', 'void', 'new', 'null', 'foreach', 'in', 'class', 'static', 'public', 'private', 'switch', 'case', 'const']);
const TYPES = new Set(['Color', 'Direction', 'Console', 'Math', 'Drone']);
function highlight(line, st) {
  let out = '', i = 0;
  const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
  while (i < line.length) {
    const rest = line.slice(i);
    if (st.comment) {
      const end = rest.indexOf('*/');
      const seg = end < 0 ? rest : rest.slice(0, end + 2);
      out += span('t-com', seg); i += seg.length; if (end >= 0) st.comment = false; continue;
    }
    if (rest.startsWith('//')) { out += span('t-com', rest); break; }
    if (rest.startsWith('/*')) { st.comment = true; out += span('t-com', '/*'); i += 2; continue; }
    let m;
    if ((m = rest.match(/^\$?"(?:[^"\\]|\\.)*"?/))) { out += span('t-str', m[0]); i += m[0].length; continue; }
    if ((m = rest.match(/^\d[\d_]*(\.\d+)?[fFdD]?/))) { out += span('t-num', m[0]); i += m[0].length; continue; }
    if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const w = m[0], after = rest.slice(w.length);
      const cls = KW.has(w) ? 't-kw' : TYPES.has(w) ? 't-type' : w === 'drone' ? 't-drone' : /^\s*\(/.test(after) ? 't-method' : 't-id';
      out += span(cls, w); i += w.length; continue;
    }
    if ((m = rest.match(/^\s+/))) { out += m[0]; i += m[0].length; continue; }
    out += span('t-punc', rest[0]); i++;
  }
  return out;
}

// ─── Editor rendering ────────────────────────────────────────────────────────
function renderCode() {
  const lines = ta.value.split('\n');
  const st = { comment: false };
  const ev = S.event, active = S.mode === 'running' || S.mode === 'paused';
  const r = S.runner, notes = r?.notes, counts = r?.lineCounts;
  const fresh = r?.log.at(-1)?.line;
  let code = '', gut = '';
  lines.forEach((l, i) => {
    const n = i + 1;
    let cls = 'ln';
    const isCur = active && ev && ev.line === n;
    if (isCur) cls += ev.kind === 'cond' ? (ev.value ? ' current-cond-true' : ' current-cond-false') : ' current';
    if (S.errorLines.has(n)) cls += ' error';
    if (n === fresh && active) cls += ' fresh';
    const note = notes?.get(n);
    code += `<div class="${cls}">${highlight(l, st) || ' '}${note ? `<span class="annot">// ${esc(note)}</span>` : ''}</div>`;
    const cnt = counts?.get(n);
    gut += `<div class="gl${S.breakpoints.has(n) ? ' bp' : ''}${isCur ? ' current' : ''}${S.errorLines.has(n) ? ' error' : ''}" data-line="${n}" title="Toggle breakpoint"><span class="cnt">${cnt ? '×' + cnt : ''}</span><span class="n">${n}</span></div>`;
  });
  layer.innerHTML = code;
  gutter.innerHTML = gut;
  ta.style.height = (lines.length * LH + 52) + 'px';
  ta.style.width = Math.max(editor.clientWidth - gutter.offsetWidth, layer.scrollWidth) + 'px';
}
function scrollToLine(n) {
  const top = (n - 1) * LH + 12, h = editor.clientHeight;
  if (top < editor.scrollTop + 20 || top > editor.scrollTop + h - 60) editor.scrollTo({ top: Math.max(0, top - h / 3), behavior: 'smooth' });
}

// ─── Editing helpers ─────────────────────────────────────────────────────────
function insertText(text, start = ta.selectionStart, end = ta.selectionEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  if (!document.execCommand || !document.execCommand('insertText', false, text)) { ta.setRangeText(text, start, end, 'end'); onCodeInput(); }
}
function lineBounds(pos) {
  const v = ta.value, s = v.lastIndexOf('\n', pos - 1) + 1;
  let e = v.indexOf('\n', pos); if (e < 0) e = v.length;
  return [s, e];
}
ta.addEventListener('keydown', e => {
  if (ta.readOnly) return;
  const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
  if (e.key === 'Tab') {
    e.preventDefault();
    const [s] = lineBounds(a), [, eEnd] = lineBounds(b);
    if (a === b && !e.shiftKey) { insertText('    '); return; }
    const block = v.slice(s, eEnd).split('\n');
    const next = block.map(l => e.shiftKey ? l.replace(/^ {1,4}/, '') : '    ' + l).join('\n');
    insertText(next, s, eEnd);
    ta.setSelectionRange(s, s + next.length);
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const [s] = lineBounds(a);
    const before = v.slice(s, a);
    let indent = before.match(/^\s*/)[0];
    if (/\{\s*$/.test(before)) indent += '    ';
    const afterChar = v[b];
    if (/\{\s*$/.test(before) && afterChar === '}') { insertText('\n' + indent + '\n' + indent.slice(4)); ta.setSelectionRange(a + 1 + indent.length, a + 1 + indent.length); return; }
    insertText('\n' + indent);
  } else if (e.key === '}') {
    const [s] = lineBounds(a);
    const before = v.slice(s, a);
    if (/^\s+$/.test(before) && a === b) { e.preventDefault(); insertText(before.slice(Math.min(4, before.length)) + '}', s, a); }
  } else if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const [s] = lineBounds(a), [, eEnd] = lineBounds(b);
    const block = v.slice(s, eEnd).split('\n');
    const allCommented = block.every(l => /^\s*\/\//.test(l) || !l.trim());
    const next = block.map(l => allCommented ? l.replace(/^(\s*)\/\/ ?/, '$1') : (l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
    insertText(next, s, eEnd);
    ta.setSelectionRange(s, s + next.length);
  }
});
let saveTimer = null;
function onCodeInput() {
  if (S.mode === 'finished' || S.mode === 'error') { S.mode = 'idle'; resetScene(); }
  S.errorLines.clear();
  renderCode();
  updateStats();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set('code:' + S.challenge.id, ta.value), 300);
}
ta.addEventListener('input', onCodeInput);
function updateStats() {
  const c = compile(ta.value);
  $('#code-stats').textContent = c.stats ? `${c.stats.statements} INSTRUCTION${c.stats.statements === 1 ? '' : 'S'}` : '—';
}
gutter.addEventListener('click', e => {
  const g = e.target.closest('.gl'); if (!g) return;
  const n = Number(g.dataset.line);
  S.breakpoints.has(n) ? S.breakpoints.delete(n) : S.breakpoints.add(n);
  renderCode();
});

// ─── Console ─────────────────────────────────────────────────────────────────
const consoleEl = $('#console');
function logLine(cls, text) { const d = document.createElement('div'); d.className = 'c-line ' + cls; d.textContent = text; consoleEl.append(d); consoleEl.scrollTop = consoleEl.scrollHeight; return d; }
function logProblem(err, kind) {
  const d = document.createElement('div');
  d.className = kind === 'warning' ? 'c-warn' : 'c-error';
  const loc = err.kind === 'runtime'
    ? `Unhandled exception · line ${err.line}`
    : `Program.cs(${err.line},${err.col}): ${kind} ${err.code || ''}`.trim();
  const msg = err.kind === 'runtime' ? `System.${err.exception}: ${err.message}`.replace('System.DroneException', 'DroneException') : err.message;
  d.innerHTML = `<div class="c-loc">${esc(loc)}</div><div class="c-msg">${esc(msg)}</div>${err.hint ? `<div class="c-hint">${esc(err.hint)}</div>` : ''}`;
  d.title = 'Go to the line';
  d.onclick = () => goToLine(err.line, err.col);
  consoleEl.append(d); consoleEl.scrollTop = consoleEl.scrollHeight;
}
function goToLine(line, col = 1) {
  const lines = ta.value.split('\n');
  let pos = 0; for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  const len = (lines[line - 1] || '').length;
  ta.focus(); ta.setSelectionRange(pos + Math.min(col - 1, len), pos + len);
  scrollToLine(line);
}
function setBuild(text, cls = '') { const b = $('#build-status'); b.textContent = text; b.className = 'build-status ' + cls; }
$('#clear-console').onclick = () => { consoleEl.innerHTML = ''; S.outEl = null; };
function renderOutput() {
  if (!S.outEl || !S.runner) return;
  const out = S.runner.output;
  S.outEl.innerHTML = out.slice(-400).map(o => `<div class="c-line c-out">${esc(o.text) || ' '}</div>`).join('');
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ─── Challenge panel ─────────────────────────────────────────────────────────
function renderLevels() {
  const cur = S.challenge;
  $('#levels').innerHTML = LEVELS.map(l => {
    const real = l.challenges.filter(c => !c.sandbox);
    const allDone = real.length && real.every(c => S.done.has(c.id));
    return `<div class="level${cur.level.id === l.id ? ' current' : ''}${allDone ? ' done' : ''}">
      <span class="level-num">${allDone ? '✓' : l.id}</span>
      <span class="level-name">${esc(l.name)}<small>${esc(l.concept)}</small></span>
      <div class="pills">${l.challenges.map(c => `<button class="pill${c.id === cur.id ? ' active' : ''}${S.done.has(c.id) ? ' done' : ''}" data-id="${c.id}" title="${esc(c.title)}">${c.sandbox ? 'Free' : c.id}</button>`).join('')}</div>
    </div>`;
  }).join('');
}
$('#levels').addEventListener('click', e => {
  const p = e.target.closest('.pill'); if (!p) return;
  loadChallenge(CHALLENGES.findIndex(c => c.id === p.dataset.id));
});
function renderRequirements(stats = null, result = null) {
  const ch = S.challenge;
  const items = [];
  if (!ch.sandbox) items.push({ label: 'Build the target shape', ok: result ? result.ok : null });
  const reqs = stats ? checkRequirements(ch, stats) : (ch.requires || []).map(r => ({ ...r, ok: null }));
  items.push(...reqs.map(r => ({ label: r.label, ok: r.ok })));
  if (ch.randomized) items.push({ label: 'Works on any starting world', ok: result && 'verified' in result ? result.verified : null });
  $('#requirements').innerHTML = items.map(i => `<li class="${i.ok === true ? 'ok' : i.ok === false ? 'fail' : ''}">${esc(i.label)}</li>`).join('');
}
function renderToolbox() {
  const lvl = S.challenge.level.id;
  $('#toolbox-items').innerHTML = API.filter(a => a.level <= lvl).map((a, i) =>
    `<button class="tool${a.level === lvl && lvl < 5 ? ' new' : ''}" data-i="${API.indexOf(a)}"><pre>${esc(a.code)}</pre><p>${a.text}</p></button>`).join('');
}
$('#toolbox-items').addEventListener('click', e => {
  const b = e.target.closest('.tool'); if (!b || ta.readOnly) return;
  const snippet = API[Number(b.dataset.i)].code;
  const [s, end] = lineBounds(ta.selectionStart);
  const line = ta.value.slice(s, end), indent = line.match(/^\s*/)[0];
  const body = snippet.split('\n').map((l, i) => (i ? indent : '') + l).join('\n');
  if (line.trim()) insertText('\n' + indent + body, end, end);
  else insertText(indent + body, s, end);
});

function loadChallenge(index) {
  if (index < 0 || index >= CHALLENGES.length) return;
  stop(true);
  S.index = index;
  const ch = S.challenge = CHALLENGES[index];
  store.set('index', index);
  history.replaceState(null, '', '#' + ch.id);
  $('#challenge-level').textContent = `LEVEL ${ch.level.id} · ${ch.level.name.toUpperCase()}`;
  $('#challenge-count').textContent = `${index + 1} / ${CHALLENGES.length}`;
  $('#challenge-title').textContent = ch.title;
  $('#challenge-goal').textContent = ch.goal;
  $('#challenge-brief').innerHTML = ch.brief;
  $('#hint').hidden = true; $('#hint').textContent = ch.hint; $('#hint-button').textContent = 'Show hint';
  ta.value = store.get('code:' + ch.id, ch.starter);
  S.breakpoints.clear();
  consoleEl.innerHTML = ''; S.outEl = null;
  logLine('c-info', `${ch.level.name}: ${ch.level.intro}`);
  logLine('c-info', 'Press Run ▶ (F5) to run everything, or Step (F10) to go line by line.');
  setBuild('Ready');
  renderLevels(); renderToolbox(); renderRequirements();
  resetScene(true);
  updateStats();
  editor.scrollTo(0, 0);
}
$('#hint-button').onclick = () => { const h = $('#hint'); h.hidden = !h.hidden; $('#hint-button').textContent = h.hidden ? 'Show hint' : 'Hide hint'; };
$('#reset-code').onclick = () => {
  if (ta.value !== S.challenge.starter && !confirmReset()) return;
  stop(true);
  ta.value = S.challenge.starter; store.set('code:' + S.challenge.id, ta.value);
  onCodeInput();
};
function confirmReset() {
  const b = $('#reset-code');
  if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Reset code ↺'; return true; }
  b.dataset.armed = '1'; b.textContent = 'Click again to reset';
  setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset code ↺'; }, 2500);
  return false;
}

// ─── Scene ───────────────────────────────────────────────────────────────────
function resetScene(newSeed = false) {
  const ch = S.challenge;
  if (newSeed || ch.randomized) S.seed = ch.randomized ? (Math.random() * 1e9) >>> 0 : 1;
  const { world, target } = prepare(ch, S.seed);
  S.world = world; S.target = target; S.runner = null; S.gen = null; S.event = null; S.result = null;
  view.update(world, { target, reset: true });
  $('#result').hidden = true;
  renderAll();
}
function renderProgress() {
  const chip = $('#progress-chip');
  if (S.challenge.sandbox) { chip.innerHTML = `<b>${S.world.blockCount()}</b> blocks`; return; }
  const r = compare(S.world, S.target);
  chip.innerHTML = `<b>${r.correct}</b> / ${r.total} target blocks${r.wrong.length + r.extra.length ? ` · <span style="color:#ff9a9a">${r.wrong.length + r.extra.length} wrong</span>` : ''}`;
}

// ─── Memory & execution panels ───────────────────────────────────────────────
function valueHtml(type, value, assigned = true) {
  if (!assigned || value === undefined) return '<span class="vl unassigned">unassigned</span>';
  const cls = type === 'string' ? 'str' : ['int', 'float', 'double'].includes(type) ? 'num' : type === 'bool' ? 'bool' : '';
  const sw = type === 'Color' && value !== 'None' ? `<i class="swatch" style="background:${PALETTE[value]}"></i>` : '';
  return `<span class="vl ${cls}">${sw}${esc(literal(value, type))}</span>`;
}
const varRow = (type, name, value, { changed = false, assigned = true } = {}) =>
  `<div class="var${changed ? ' changed' : ''}"><span class="ty t-${type}">${esc(type || '?')}</span><span class="nm">${esc(name)}</span>${valueHtml(type, value, assigned)}</div>`;

function renderMemory() {
  const w = S.world, r = S.runner, lvl = S.challenge.level.id;
  let html = `<div class="scope object"><div class="scope-head"><span>drone</span><span>object · Drone</span></div>${varRow('int', 'X', w.drone.x)}${varRow('int', 'Z', w.drone.z)}${lvl >= 3 ? varRow('int', 'Height', w.height()) : ''}${lvl >= 4 ? varRow('Color', 'Ground', w.groundColor()) : ''}</div>`;
  const scopes = r?.scopes || [];
  if (!scopes.length) html += '<p class="empty">Variables appear here while the program runs. Each one is a box with a <b>type</b>, a <b>name</b> and a <b>value</b>.</p>';
  else {
    const scopeHtml = i => {
      if (i >= scopes.length) return '';
      const s = scopes[i], vars = [...s.vars.values()];
      const rows = vars.map(v => varRow(v.type, v.name, v.value, { changed: r.changed.has(v), assigned: v.assigned })).join('');
      const empty = !rows && i === 0 ? '<p class="empty">No variables yet.</p>' : '';
      return `<div class="scope"><div class="scope-head"><span>${esc(s.label)}</span><span>${i === 0 ? 'scope' : 'inner scope'}</span></div>${rows}${empty}${scopeHtml(i + 1)}</div>`;
    };
    html += scopeHtml(0);
  }
  const mem = $('#memory');
  mem.innerHTML = html;
  $('.memory').classList.toggle('finished', S.mode === 'finished');
}

function lineText(n) { return (ta.value.split('\n')[n - 1] || '').trim(); }
function renderNow() {
  const ev = S.event, el = $('#now');
  if (S.mode === 'idle' || !S.runner) { el.innerHTML = '<span class="label">READY</span>Press <b>Run</b> to run the whole program, or <b>Step</b> to run it one line at a time.'; return; }
  if (S.mode === 'error') { el.innerHTML = `<span class="label">RUNTIME ERROR · LINE ${S.runner.line}</span>The program stopped here. Read the Console to see why.`; return; }
  if (S.mode === 'finished') { el.innerHTML = `<span class="label">FINISHED · ${S.runner.steps} STEPS</span>The program reached the last line. Its variables stay in memory only while it runs (faded).`; return; }
  if (!ev) return;
  if (ev.kind === 'cond') {
    const parts = ev.text.split('  →  ');
    const chips = parts.map((p, i) => i === parts.length - 1 ? `<span class="${ev.value}">${esc(p)}</span>` : `<span>${esc(p)}</span>`).join('<i>→</i>');
    el.innerHTML = `<span class="label">CONDITION · LINE ${ev.line}</span><div class="eval">${chips}</div><div class="outcome">${esc(ev.outcome)}</div>`;
  } else {
    let extra = '';
    if (ev.phase === 'init') extra = '<div class="outcome">Loop start: runs once, before the first turn.</div>';
    if (ev.phase === 'update') extra = '<div class="outcome">Loop step: runs after every turn, then the condition is checked again.</div>';
    el.innerHTML = `<span class="label">NEXT · LINE ${ev.line}</span><code>${esc(lineText(ev.line))}</code>${extra}`;
  }
}
function renderTrace() {
  const log = S.runner?.log || [];
  $('#trace').innerHTML = log.slice(-10).reverse().map(l => `<li><span class="tl">L${l.line}</span><span>${esc(l.text)}</span></li>`).join('');
  $('#step-count').textContent = `STEP ${S.runner?.steps || 0}`;
}
function renderControls() {
  const running = S.mode === 'running', paused = S.mode === 'paused';
  $('#run-label').textContent = running ? 'Pause' : paused ? 'Continue' : 'Run';
  $('#run').firstElementChild.textContent = running ? '❚❚' : '▶';
  $('#run').classList.toggle('paused', running);
  $('#stop').disabled = !(running || paused);
  ta.readOnly = running || paused;
  $('#editing-note').hidden = !(running || paused);
  $('#drone-status').textContent = `DRONE (${S.world.drone.x}, ${S.world.drone.z})${S.world.height() ? ` · HEIGHT ${S.world.height()}` : ''}`;
}
function renderAll({ instant = false } = {}) {
  view.update(S.world, { target: S.target, result: S.result, instant });
  renderCode(); renderMemory(); renderNow(); renderTrace(); renderOutput(); renderProgress(); renderControls();
  if (S.event && (S.mode === 'running' || S.mode === 'paused')) scrollToLine(S.event.line);
}

// ─── Running ─────────────────────────────────────────────────────────────────
function build() {
  S.errorLines.clear();
  consoleEl.innerHTML = ''; S.outEl = null;
  const compiled = compile(ta.value);
  S.compiled = compiled;
  logLine('c-info', 'Build started…');
  for (const w of compiled.warnings) logProblem(w, 'warning');
  if (!compiled.ok) {
    for (const e of compiled.errors) { logProblem(e, 'error'); S.errorLines.set(e.line, e); }
    const n = compiled.errors.length;
    logLine('c-info', `Build failed · ${n} error${n === 1 ? '' : 's'}. Nothing was run.`);
    setBuild(`Build failed · ${n} error${n === 1 ? '' : 's'}`, 'bad');
    S.mode = 'error';
    renderRequirements(compiled.stats, null);
    resetSceneKeepMode();
    return false;
  }
  setBuild('Build succeeded', 'ok');
  logLine('c-ok', `Build succeeded · ${compiled.warnings.length} warning${compiled.warnings.length === 1 ? '' : 's'}`);
  S.outEl = document.createElement('div'); consoleEl.append(S.outEl);
  resetScene();
  S.runner = new Runner(compiled.ast, S.world);
  S.gen = S.runner.run();
  return true;
}
function resetSceneKeepMode() { const m = S.mode; resetScene(); S.mode = m; renderAll(); }

function advance() {
  S.prevLine = S.event?.line;
  try {
    const r = S.gen.next();
    if (r.done) { finish(); return false; }
    S.event = r.value;
    return true;
  } catch (e) {
    const err = e instanceof CSharpError ? e : new CSharpError({ kind: 'runtime', exception: 'LabException', message: String(e?.message || e), line: S.runner?.line || 1 });
    if (!(e instanceof CSharpError)) console.error(e);
    fail(err);
    return false;
  }
}
const hitBreakpoint = () => S.event && S.breakpoints.has(S.event.line) && S.event.line !== S.prevLine;
function clearTimer() { clearTimeout(S.timer); S.timer = null; }
function loop() {
  clearTimer();
  if (S.mode !== 'running') return;
  const ms = SPEEDS[S.speed].ms;
  if (ms === 0) {
    for (let n = 0; n < 3000; n++) {
      if (!advance()) return;
      if (hitBreakpoint()) { S.mode = 'paused'; renderAll(); return; }
    }
    renderAll({ instant: true });
    S.timer = setTimeout(loop, 0);
    return;
  }
  if (!advance()) return;
  if (hitBreakpoint()) S.mode = 'paused';
  renderAll();
  if (S.mode === 'running') S.timer = setTimeout(loop, ms);
}
function run() {
  if (S.mode === 'running') { S.mode = 'paused'; clearTimer(); renderAll(); return; }
  if (S.mode === 'paused') { S.mode = 'running'; loop(); return; }
  if (!build()) return;
  S.mode = 'running';
  loop();
}
function step() {
  if (S.mode === 'running') { S.mode = 'paused'; clearTimer(); renderAll(); return; }
  if (S.mode !== 'paused') { if (!build()) return; S.mode = 'paused'; }
  if (advance()) renderAll();
}
function stop(silent = false) {
  clearTimer();
  const wasActive = S.mode === 'running' || S.mode === 'paused';
  if (S.gen) { try { S.gen.return(); } catch { /* ignore */ } }
  S.mode = 'idle';
  if (S.challenge) {
    if (wasActive && !silent) logLine('c-info', 'Program stopped.');
    resetScene();
  }
}
function finish() {
  S.mode = 'finished';
  const r = S.runner, ch = S.challenge;
  logLine('c-info', `Program finished · ${r.steps} steps · ${S.world.actions} drone actions`);
  if (ch.sandbox) { S.result = null; showResult('ok', 'Program finished', `${S.world.blockCount()} blocks built in ${r.steps} steps.`, false); renderRequirements(S.compiled.stats, null); renderAll({ instant: SPEEDS[S.speed].ms === 0 }); return; }
  const result = compare(S.world, S.target);
  const reqs = checkRequirements(ch, S.compiled.stats);
  if (result.ok && ch.randomized) {
    const seeds = [1, 2, 3].map(() => (Math.random() * 1e9) >>> 0);
    const checks = verifySeeds(ch, ta.value, seeds);
    result.verified = checks.every(c => c.ok);
    result.verifiedCount = checks.filter(c => c.ok).length;
  }
  S.result = result;
  renderRequirements(S.compiled.stats, result);
  const success = result.ok && reqs.every(q => q.ok) && (!ch.randomized || result.verified);
  if (success) {
    S.done.add(ch.id); store.set('done', [...S.done]);
    renderLevels();
    const extra = ch.randomized ? ' It also worked on 3 other random worlds.' : '';
    showResult('ok', 'Challenge complete', `${result.total} blocks in ${r.steps} steps with ${S.compiled.stats.statements} instructions.${extra}`, S.index < CHALLENGES.length - 1);
  } else {
    const bits = [];
    if (result.missing.length) bits.push(`${result.missing.length} missing`);
    if (result.wrong.length) bits.push(`${result.wrong.length} wrong color`);
    if (result.extra.length) bits.push(`${result.extra.length} extra`);
    let msg = bits.length ? `Blocks: ${bits.join(' · ')}. Ghost blocks show what is still missing; red outlines mark wrong blocks.` : '';
    const failed = reqs.filter(q => !q.ok).map(q => q.label);
    if (failed.length) msg += `${msg ? ' ' : ''}Still to do: ${failed.join(', ')}.`;
    if (result.ok && ch.randomized && !result.verified) msg = `It works on this world, but only on ${result.verifiedCount} of 3 other random worlds. Read the world with the drone instead of using fixed numbers.`;
    showResult('bad', result.ok ? 'Almost there' : 'Not yet', msg, false);
  }
  renderAll({ instant: SPEEDS[S.speed].ms === 0 });
}
function fail(err) {
  S.mode = 'error';
  S.errorLines.set(err.line, err);
  logProblem(err, 'error');
  showResult('bad', `Runtime error on line ${err.line}`, err.message, false);
  renderAll();
}
function showResult(kind, title, text, next) {
  const el = $('#result');
  el.className = 'result ' + kind;
  el.innerHTML = `<span class="result-icon">${kind === 'ok' ? '✓' : '!'}</span><p class="result-text"><strong>${esc(title)}</strong>${esc(text)}</p>${next ? '<button class="next">Next challenge →</button>' : ''}<button class="tiny close" aria-label="Close">×</button>`;
  el.hidden = false;
  el.querySelector('.next')?.addEventListener('click', () => loadChallenge(S.index + 1));
  el.querySelector('.close').addEventListener('click', () => { el.hidden = true; });
}

$('#run').onclick = run;
$('#step').onclick = step;
$('#stop').onclick = () => stop();
document.addEventListener('keydown', e => {
  if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); stop(); }
  else if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); run(); }
  else if (e.key === 'F10') { e.preventDefault(); step(); }
});
const speed = $('#speed');
function applySpeed() {
  speed.value = S.speed;
  $('#speed-label').textContent = SPEEDS[S.speed].label;
  view.animMs = Math.min(240, Math.max(0, SPEEDS[S.speed].ms * 0.75));
}
speed.oninput = () => { S.speed = Number(speed.value); store.set('speed', S.speed); applySpeed(); };
applySpeed();

$('#help').onclick = () => $('#help-dialog').showModal();
for (const b of document.querySelectorAll('.dialog-close,.dialog-close-action')) b.onclick = () => b.closest('dialog').close();
new ResizeObserver(() => renderCode()).observe(editor);

window.addEventListener('hashchange', () => {
  const i = CHALLENGES.findIndex(c => c.id === location.hash.slice(1));
  if (i >= 0 && i !== S.index) loadChallenge(i);
});

if (window.matchMedia('(max-width: 760px)').matches) $('#toolbox').open = false;

// ─── Start ───────────────────────────────────────────────────────────────────
const fromHash = CHALLENGES.findIndex(c => c.id === location.hash.slice(1));
loadChallenge(fromHash >= 0 ? fromHash : Math.min(store.get('index', 0), CHALLENGES.length - 1));
if (!store.get('seen-help', false)) { store.set('seen-help', true); }
