import { NODES, makeNode, makeLink, addLink, canLink, socketOf, expose, evaluate } from './core.js';
import { LABS, local, L } from './curriculum.js';
import { createPreview } from './preview.js';
import { getLang, onLangChange, initI18n } from '../../i18n.js';

const $ = q => document.querySelector(q);
const lab = Number(document.body.dataset.lab), lesson = LABS[lab];
const slugs = ['gn-flow', 'gn-fields', 'gn-scatter', 'gn-curves'];
const storageKey = `cifog-gn:${lab}:state`;
const ui = {
  all: L('All labs ↗', 'Tots els labs ↗', 'Todos los labs ↗'),
  series: L('GEOMETRY NODES / FOUR LABS', 'GEOMETRY NODES / QUATRE LABS', 'GEOMETRY NODES / CUATRO LABS'),
  editor: L('Node editor', 'Editor de nodes', 'Editor de nodos'),
  preview: L('3D preview', 'Vista 3D', 'Vista 3D'),
  sheet: L('Spreadsheet', 'Spreadsheet', 'Spreadsheet'),
  modifier: L('Modifier inputs', 'Entrades del modificador', 'Entradas del modificador'),
  modifierContext: L('Modifier', 'Modificador', 'Modificador'),
  add: L('Add a node', 'Afegeix un node', 'Añade un nodo'),
  search: L('Search nodes…', 'Cerca nodes…', 'Busca nodos…'),
  fit: L('Frame all', 'Enquadra-ho tot', 'Encuadra todo'),
  undo: L('Undo', 'Desfés', 'Deshacer'),
  redo: L('Redo', 'Refés', 'Rehacer'),
  viewMenu: L('View', 'Vista', 'Vista'),
  selectMenu: L('Select', 'Selecciona', 'Seleccionar'),
  addMenu: L('Add', 'Afegeix', 'Añadir'),
  nodeMenu: L('Node', 'Node', 'Nodo'),
  nodeSidebar: L('Node properties', 'Propietats del node', 'Propiedades del nodo'),
  noSelection: L('Select a node to inspect its sockets.', 'Selecciona un node per consultar-ne els sockets.', 'Selecciona un nodo para consultar sus sockets.'),
  closeSidebar: L('Close node properties', 'Tanca les propietats del node', 'Cierra las propiedades del nodo'),
  inputSockets: L('Inputs', 'Entrades', 'Entradas'),
  outputSockets: L('Outputs', 'Sortides', 'Salidas'),
  toolSelect: L('Select nodes', 'Selecciona nodes', 'Selecciona nodos'),
  how: L('HOW TO', 'COM FER-HO', 'CÓMO HACERLO'),
  why: L('Why:', 'Per què:', 'Por qué:'),
  notYet: L('Not yet', 'Encara no', 'Todavía no'),
  done: L('✓ Done', '✓ Fet', '✓ Hecho'),
  previous: L('Previous', 'Anterior', 'Anterior'),
  next: L('Next step →', 'Pas següent →', 'Paso siguiente →'),
  nextLab: L('Next lab →', 'Lab següent →', 'Siguiente lab →'),
  check: L('Check this step', 'Comprova aquest pas', 'Comprueba este paso'),
  solution: L('Show a solution', 'Mostra una solució', 'Muestra una solución'),
  reset: L('Reset this step', 'Reinicia aquest pas', 'Reinicia este paso'),
  exposed: L('Expose', 'Exposa', 'Expón'),
  emptyModifier: L('Expose a node input to control it here.', 'Exposa una entrada d’un node per controlar-la aquí.', 'Expón una entrada de un nodo para controlarla aquí.'),
  connections: L('connections', 'connexions', 'conexiones'),
  emptySheet: L('No point data at the output yet.', 'Encara no hi ha dades de punts a la sortida.', 'Todavía no hay datos de puntos en la salida.'),
  points: L('points', 'punts', 'puntos'),
  vertices: L('vertices', 'vèrtexs', 'vértices'),
  pieces: L('pieces', 'peces', 'piezas'),
  instances: L('instances', 'instàncies', 'instancias'),
  success: L('Good work. This step is complete.', 'Bona feina. Aquest pas està complet.', 'Buen trabajo. Este paso está completo.'),
  tryAgain: L('Not quite yet. Compare the graph with the instructions and the preview.', 'Encara falta alguna cosa. Compara el graf amb les instruccions i la vista.', 'Todavía falta algo. Compara el grafo con las instrucciones y la vista.'),
  solutionShown: L('One possible solution is shown. Change a value to see why it works.', 'Es mostra una solució possible. Canvia un valor per veure per què funciona.', 'Se muestra una solución posible. Cambia un valor para ver por qué funciona.'),
  stepReset: L('This step is ready to try again.', 'Aquest pas està a punt per tornar-ho a provar.', 'Este paso está listo para volver a intentarlo.'),
  connectHelp: L('Drag from an output socket to an input, or click them in that order. Drag a node header to move it.', 'Arrossega d’un socket de sortida a una entrada, o clica’ls en aquest ordre. Mou un node per la capçalera.', 'Arrastra de un socket de salida a una entrada, o haz clic en ambos en ese orden. Mueve un nodo por su cabecera.'),
  badLink: L('Those sockets cannot be connected, or the link would create a cycle.', 'Aquests sockets no es poden connectar, o la connexió crearia un cicle.', 'Estos sockets no se pueden conectar, o la conexión crearía un ciclo.'),
  fieldNote: L('Diamond sockets are fields: their values are evaluated at every point.', 'Els sockets en rombe són camps: el seu valor s’avalua a cada punt.', 'Los sockets en rombo son campos: su valor se evalúa en cada punto.'),
  singleNote: L('Round sockets use one value. Geometry sockets carry the whole geometry.', 'Els sockets rodons fan servir un valor. Els de geometria transporten tota la geometria.', 'Los sockets redondos usan un valor. Los de geometría transportan toda la geometría.'),
  terrainSaved: L('Using your GN 02 terrain', 'Fent servir el teu terreny del GN 02', 'Usando tu terreno del GN 02'),
  terrainSample: L('Using the sample terrain; finish GN 02 to bring yours here.', 'S’utilitza el terreny de mostra; acaba el GN 02 per portar-hi el teu.', 'Se usa el terreno de muestra; termina GN 02 para traer el tuyo.'),
  realizeNote: L('Try Realize Instances in the output path, then remove it before checking.', 'Prova Realize Instances en la ruta de sortida i després treu-lo abans de comprovar.', 'Prueba Realize Instances en la ruta de salida y luego quítalo antes de comprobar.'),
  compared: L('✓ You compared realized geometry with instances.', '✓ Has comparat la geometria real amb les instàncies.', '✓ Has comparado la geometría real con las instancias.'),
  sources: L('Blender manual · Geometry Nodes ↗', 'Manual de Blender · Geometry Nodes ↗', 'Manual de Blender · Geometry Nodes ↗'),
};
const U = key => local(ui[key], getLang());
const T = value => local(value, getLang());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = value => JSON.parse(JSON.stringify(value));
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { /* storage unavailable */ }
const S = { step: Number.isInteger(saved.step) && saved.step >= 0 && saved.step < lesson.steps.length ? saved.step : 0, graphs: Array.isArray(saved.graphs) ? saved.graphs : [], done: Array.isArray(saved.done) ? saved.done : Array(lesson.steps.length).fill(false), flags: Array.isArray(saved.flags) ? saved.flags : [], feedback: '', feedbackGood: false, tab: 'preview', selected: null, undo: [], redo: [] };
for (let i = 0; i < lesson.steps.length; i++) { if (!S.graphs[i]?.nodes || !S.graphs[i]?.links) S.graphs[i] = lesson.steps[i].starter(); if (!S.flags[i]) S.flags[i] = {}; }
const graph = () => S.graphs[S.step], current = () => lesson.steps[S.step];
const save = () => { try { localStorage.setItem(storageKey, JSON.stringify({ step: S.step, graphs: S.graphs, done: S.done, flags: S.flags })); } catch { /* private mode */ } };
const status = text => { $('#editor-status').textContent = text; };
let preview = null, result = null, scale = 1, panX = 0, panY = 0, pending = null, wirePointer = null, drag = null, panDrag = null, suppressClick = 0, counter = 1;
const categories = { 1: ['Mesh', 'Geometry', 'Utilities'], 2: ['Mesh', 'Geometry', 'Input', 'Utilities'], 3: ['Geometry', 'Points', 'Instances', 'Input', 'Utilities', 'Mesh'], 4: ['Curve', 'Mesh', 'Geometry', 'Instances', 'Utilities'] };
const categoryOrder = ['Group', 'Mesh', 'Geometry', 'Input', 'Utilities', 'Points', 'Instances', 'Curve'];
function shell() {
  document.title = `${T(lesson.title)} · CIFOG Lab`;
  $('#app').innerHTML = `<header class="site-header"><a class="brand" href="../../" aria-label="CIFOG Lab"><span class="brand-mark">cifog<span>LAB</span></span></a><span class="header-rule"></span><div class="header-title"><span class="header-label">INTERACTIVE STUDIES / GN 0${lab}</span><strong>${esc(T(lesson.title))}</strong></div><a class="home-link" href="../../">${esc(U('all'))}</a></header>
    <main><section class="lab-top"><div><span class="eyebrow">${esc(U('series'))}</span><h1>${esc(T(lesson.title))}</h1><p>${esc(T(lesson.lead))}</p></div><nav class="series" id="series" aria-label="Geometry Nodes labs"></nav></section><ol class="guide" id="guide"></ol><section class="below"><div class="step-card" id="step-card"></div></section>
    <section class="workspace" id="workspace"><div class="workspace-head"><div><b>${esc(U('editor'))}</b><span>${esc(U('connectHelp'))}</span></div><span class="blender-tag">Blender 5.x · Geometry Nodes</span></div><div class="workspace-grid"><div class="editor-column"><div class="node-editor-header"><span class="editor-type-icon" aria-hidden="true">✣</span><b>Geometry Nodes</b><span class="header-sep"></span><button type="button" data-editor-action="view">${esc(U('viewMenu'))}</button><button type="button" data-editor-action="select">${esc(U('selectMenu'))}</button><button type="button" data-editor-action="add">${esc(U('addMenu'))}</button><button type="button" data-editor-action="node">${esc(U('nodeMenu'))}</button><span class="node-tree-name">▧ &nbsp;Geometry Nodes</span><span class="node-tree-context">${esc(U('modifierContext'))}</span><button type="button" class="sidebar-toggle" data-editor-action="node" aria-label="${esc(U('nodeSidebar'))}" aria-pressed="false">N</button></div><div class="editor-toolbar"><button type="button" data-toolbar="undo" aria-label="${esc(U('undo'))}">↶ ${esc(U('undo'))}</button><button type="button" data-toolbar="redo" aria-label="${esc(U('redo'))}">↷ ${esc(U('redo'))}</button><button type="button" data-toolbar="fit">${esc(U('fit'))}</button><button type="button" data-toolbar="zoom-out" aria-label="Zoom out">−</button><span id="zoom-label">100%</span><button type="button" data-toolbar="zoom-in" aria-label="Zoom in">+</button></div><div class="editor-body"><aside class="palette"><label for="node-search">${esc(U('add'))}</label><input id="node-search" type="search" placeholder="${esc(U('search'))}" autocomplete="off"><div id="palette-list"></div></aside><div class="graph-viewport" id="graph-viewport" aria-label="${esc(U('editor'))}"><div class="node-tools" aria-label="${esc(U('editor'))}"><button type="button" data-node-tool="select" aria-label="${esc(U('toolSelect'))}" title="${esc(U('toolSelect'))}">↖</button><button type="button" data-node-tool="fit" aria-label="${esc(U('fit'))}" title="${esc(U('fit'))}">□</button><button type="button" data-node-tool="add" aria-label="${esc(U('add'))}" title="${esc(U('add'))}">＋</button></div><div class="graph-world" id="graph-world"><svg id="wire-layer" viewBox="0 0 3200 2200" aria-hidden="true"></svg><div id="node-layer"></div></div><aside class="node-sidebar" id="node-sidebar" hidden><div class="node-sidebar-head"><b>${esc(U('nodeSidebar'))}</b><button type="button" data-close-sidebar aria-label="${esc(U('closeSidebar'))}">×</button></div><div id="node-sidebar-content"></div></aside></div></div><div class="editor-status"><span id="editor-status" role="status" aria-live="polite"></span><span id="link-count"></span></div></div><aside class="preview-column"><div class="preview-tabs" id="preview-tabs"><button type="button" data-tab="preview">${esc(U('preview'))}</button><button type="button" data-tab="sheet">${esc(U('sheet'))}</button></div><div id="preview-pane"><div class="preview-canvas" id="preview-canvas"></div><div class="preview-summary" id="preview-summary"></div></div><div id="sheet-pane" hidden><div class="sheet-wrap" id="sheet-wrap"></div></div><div class="modifier"><h2>${esc(U('modifier'))}</h2><div id="modifier-list"></div></div><p id="extra-note" class="extra-note"></p></aside></div></section>
    <footer><span>CIFOG · ${esc(T(lesson.title))}</span><a href="https://docs.blender.org/manual/en/5.0/modeling/geometry_nodes/" target="_blank" rel="noopener">${esc(U('sources'))}</a><a href="../../">${esc(U('all'))}</a></footer></main>`;
}
function renderSeries() { $('#series').innerHTML = Object.values(LABS).map((l, i) => `<a class="${i + 1 === lab ? 'active' : ''}" href="../${slugs[i]}/"><b>GN 0${i + 1}</b><span>${esc(T(l.title).split(' · ')[1])}</span></a>`).join(''); }
function renderGuide() { $('#guide').innerHTML = lesson.steps.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === S.step ? 'current' : ''} ${S.done[i] ? 'done' : ''}"><b>${S.done[i] ? '✓' : i + 1}</b><span>${esc(T(s.title))}</span></button></li>`).join(''); }
function renderCard() {
  const st = current(), done = !!S.done[S.step];
  $('#step-card').classList.toggle('done', done);
  $('#step-card').innerHTML = `<div class="step-intro"><span class="eyebrow">GN 0${lab} · ${S.step + 1}/${lesson.steps.length}</span><h3>${esc(T(st.title))}</h3><p>${esc(T(st.aim))}</p><p class="why"><b>${esc(U('why'))}</b> ${esc(T(st.why))}</p></div><div class="step-how"><span class="eyebrow">${esc(U('how'))}</span><ol>${st.how.map(h => `<li>${esc(T(h))}</li>`).join('')}</ol><p class="step-feedback ${S.feedbackGood ? 'good' : ''}" role="status">${esc(S.feedback)}</p></div><div class="step-actions"><span class="step-state">${esc(U(done ? 'done' : 'notYet'))}</span>${S.step > 0 ? `<button type="button" data-act="previous">${esc(U('previous'))}</button>` : ''}<button type="button" data-act="check" class="check">${esc(U('check'))}</button>${done && S.step < lesson.steps.length - 1 ? `<button type="button" data-act="next" class="next">${esc(U('next'))}</button>` : ''}${done && S.step === lesson.steps.length - 1 && lab < 4 ? `<a class="next" href="../${slugs[lab]}/">${esc(U('nextLab'))}</a>` : ''}<button type="button" data-act="solution">${esc(U('solution'))}</button><button type="button" data-act="reset">${esc(U('reset'))}</button></div>`;
}
function renderPalette() {
  const query = $('#node-search').value.trim().toLowerCase();
  $('#palette-list').innerHTML = categoryOrder.filter(c => categories[lab].includes(c)).map(cat => {
    const items = Object.entries(NODES).filter(([type, def]) => def.category === cat && !['GroupInput', 'GroupOutput'].includes(type) && def.name.toLowerCase().includes(query));
    return items.length ? `<section><h3>${esc(cat)}</h3>${items.map(([type, def]) => `<button type="button" data-add="${type}">${esc(def.name)} <span>+</span></button>`).join('')}</section>` : '';
  }).join('') || `<p class="no-nodes">${esc(U('search'))}</p>`;
}
function inputValue(n, spec) {
  const linked = graph().links.some(l => l.to === n.id && l.input === spec.key);
  if (!('value' in spec)) return '';
  const v = n.params[spec.key] ?? spec.value, disabled = linked ? 'disabled' : '';
  const exposeButton = ['float', 'vector'].includes(spec.type) && n.type !== 'GroupOutput' && !linked ? `<button type="button" class="expose" data-expose="${esc(n.id)}|${esc(spec.key)}" title="${esc(U('exposed'))}" aria-label="${esc(U('exposed'))} ${esc(spec.label)}">↗</button>` : '';
  if (spec.type === 'bool') return `<label class="bool-value"><input type="checkbox" data-param="${esc(n.id)}|${esc(spec.key)}" ${v ? 'checked' : ''} ${disabled}><span>${v ? '✓' : ''}</span></label>`;
  if (Array.isArray(v)) return `<div class="vector-value">${v.map((x, i) => `<label>${'XYZ'[i]}<input type="number" data-param="${esc(n.id)}|${esc(spec.key)}" data-axis="${i}" value="${Number(x).toFixed(2)}" step="${spec.step || .1}" ${disabled}></label>`).join('')}${exposeButton}</div>`;
  return `<div class="number-value"><input type="number" data-param="${esc(n.id)}|${esc(spec.key)}" value="${Number(v)}" min="${spec.min ?? -100}" max="${spec.max ?? 100}" step="${spec.step || .1}" ${disabled}>${exposeButton}</div>`;
}
function socketButton(n, spec, dir) {
  const key = `${n.id}|${spec.key}`, connected = graph().links.some(l => dir === 'in' ? l.to === n.id && l.input === spec.key : l.from === n.id && l.out === spec.key);
  return `<button type="button" class="socket ${dir} ${spec.type} ${spec.field ? 'field' : ''} ${connected ? 'connected' : ''}" data-socket="${esc(key)}" data-dir="${dir}" aria-label="${dir === 'out' ? 'Output' : 'Input'} ${esc(spec.label)} · ${esc(NODES[n.type].name)}" title="${esc(spec.label)}"></button>`;
}
function nodeHtml(n) {
  const def = NODES[n.type], outputs = [...(def.outputs || [])];
  if (n.type === 'GroupInput') (graph().exposed || []).forEach(e => outputs.push({ key: e.id, label: e.label, type: e.type }));
  return `<article class="node category-${esc(def.category.toLowerCase())} ${S.selected === n.id ? 'selected' : ''}" data-node="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"><div class="node-header" data-drag="${esc(n.id)}"><span>${esc(def.name)}</span>${['GroupInput', 'GroupOutput'].includes(n.type) ? '' : `<button type="button" class="delete-node" data-delete="${esc(n.id)}" aria-label="Delete ${esc(def.name)}">×</button>`}</div><div class="node-content">${def.modes ? `<label class="mode-row"><span>Operation</span><select data-mode="${esc(n.id)}">${def.modes.map(m => `<option ${n.params.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}${def.collections ? `<label class="mode-row"><span>Collection</span><select data-collection="${esc(n.id)}">${def.collections.map(m => `<option ${n.params.collection === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}${outputs.map(s => `<div class="socket-row output-row"><span>${esc(s.label)}</span>${socketButton(n, s, 'out')}</div>`).join('')}${(def.inputs || []).map(s => `<div class="input-group"><div class="socket-row input-row">${socketButton(n, s, 'in')}<span>${esc(s.label)}</span></div>${inputValue(n, s)}</div>`).join('')}</div></article>`;
}
function renderSidebar() {
  const n = graph().nodes.find(item => item.id === S.selected);
  if (!n) { $('#node-sidebar-content').innerHTML = `<p>${esc(U('noSelection'))}</p>`; return; }
  const def = NODES[n.type];
  const outputs = [...(def.outputs || []), ...(n.type === 'GroupInput' ? (graph().exposed || []).map(e => ({ type: e.type, label: e.label })) : [])];
  $('#node-sidebar-content').innerHTML = `<strong>${esc(def.name)}</strong><small>${esc(n.id)} · ${esc(def.category)}</small><h4>${esc(U('inputSockets'))}</h4><ul>${(def.inputs || []).map(s => `<li><i class="socket-key ${esc(s.type)}"></i>${esc(s.label)}</li>`).join('')}</ul><h4>${esc(U('outputSockets'))}</h4><ul>${outputs.map(s => `<li><i class="socket-key ${esc(s.type)}"></i>${esc(s.label)}</li>`).join('')}</ul>`;
}
function renderNodes() { $('#node-layer').innerHTML = graph().nodes.map(nodeHtml).join(''); renderSidebar(); requestAnimationFrame(drawWires); }
const socketPoint = (id, key, dir) => {
  const el = [...document.querySelectorAll(`.node[data-node="${CSS.escape(id)}"] .socket.${dir}`)].find(s => s.dataset.socket === `${id}|${key}`); if (!el) return null;
  const r = el.getBoundingClientRect(), w = $('#graph-world').getBoundingClientRect(); return { x: (r.left + r.width / 2 - w.left) / scale, y: (r.top + r.height / 2 - w.top) / scale };
};
const wirePath = (a, b) => { const d = Math.max(45, Math.abs(b.x - a.x) * .45); return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`; };
function drawWires() {
  const svg = $('#wire-layer'); if (!svg) return; svg.replaceChildren();
  for (const l of graph().links) { const a = socketPoint(l.from, l.out, 'out'), b = socketPoint(l.to, l.input, 'in'); if (!a || !b) continue; const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', wirePath(a, b)); p.classList.add(socketOf(graph(), l.from, l.out, 'out')?.type || 'geometry'); if (socketOf(graph(), l.from, l.out, 'out')?.field) p.classList.add('field'); svg.append(p); }
  if (pending && wirePointer) { const a = socketPoint(pending.id, pending.key, 'out'); if (a) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', wirePath(a, wirePointer)); p.classList.add('draft'); svg.append(p); } }
}
function transformWorld() { $('#graph-world').style.transform = `translate(${panX}px,${panY}px) scale(${scale})`; $('#zoom-label').textContent = `${Math.round(scale * 100)}%`; requestAnimationFrame(drawWires); }
function fitGraph() {
  const nodes = [...document.querySelectorAll('.node')], view = $('#graph-viewport'); if (!nodes.length || !view.clientWidth) return;
  const x0 = Math.min(...nodes.map(n => n.offsetLeft)) - 25, y0 = Math.min(...nodes.map(n => n.offsetTop)) - 25, x1 = Math.max(...nodes.map(n => n.offsetLeft + n.offsetWidth)) + 25, y1 = Math.max(...nodes.map(n => n.offsetTop + n.offsetHeight)) + 25;
  scale = Math.max(.28, Math.min(1.05, (view.clientWidth - 25) / (x1 - x0), (view.clientHeight - 25) / (y1 - y0)));
  panX = (view.clientWidth - (x1 - x0) * scale) / 2 - x0 * scale; panY = (view.clientHeight - (y1 - y0) * scale) / 2 - y0 * scale; transformWorld();
}
function zoom(mult, cx, cy) {
  const view = $('#graph-viewport').getBoundingClientRect(), x = cx == null ? view.width / 2 : cx - view.left, y = cy == null ? view.height / 2 : cy - view.top, old = scale;
  scale = Math.max(.25, Math.min(1.75, scale * mult)); panX = x - (x - panX) * scale / old; panY = y - (y - panY) * scale / old; transformWorld();
}
function renderModifier() {
  const list = graph().exposed || [];
  $('#modifier-list').innerHTML = list.length ? list.map(e => `<label class="modifier-row"><span>${esc(e.label)}</span>${Array.isArray(e.value) ? `<div>${e.value.map((v, i) => `<label>${'XYZ'[i]} <input type="number" data-mod="${esc(e.id)}" data-axis="${i}" value="${Number(v).toFixed(2)}" step=".1"></label>`).join('')}</div>` : `<input type="number" data-mod="${esc(e.id)}" value="${Number(e.value)}" step=".1">`}</label>`).join('') : `<p>${esc(U('emptyModifier'))}</p>`;
}
function renderSheet() {
  const rows = result?.spreadsheet || [];
  $('#sheet-wrap').innerHTML = rows.length ? `<table><thead><tr><th>Index</th><th>Position X</th><th>Position Y</th><th>Position Z</th><th>Normal Z</th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.index}</td>${p.position.map(v => `<td>${Number(v).toFixed(2)}</td>`).join('')}<td>${Number(p.normal[2]).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p>${esc(U('emptySheet'))}</p>`;
}
function renderedBy(type) {
  const ids = graph().nodes.filter(n => n.type === type).map(n => n.id), seen = new Set(), stack = [...ids];
  while (stack.length) { const id = stack.pop(); if (id === 'output') return true; if (seen.has(id)) continue; seen.add(id); graph().links.filter(l => l.from === id).forEach(l => stack.push(l.to)); }
  return false;
}
function inputTerrain() { if (lab !== 3) return null; try { const g = JSON.parse(localStorage.getItem('cifog-gn:terrain')); return g?.surfaces?.length ? g : null; } catch { return null; } }
function renderResult(resetCamera = false) {
  const imported = inputTerrain(); result = evaluate(graph(), { lab, inputGeometry: imported }); preview?.update(result, resetCamera);
  const s = result.stats;
  $('#preview-summary').textContent = `${s.meshes} ${U('pieces')} · ${s.instances} ${U('instances')} · ${s.points} ${U('points')} · ${s.vertices} ${U('vertices')}`;
  $('#link-count').textContent = `${graph().links.length} ${U('connections')}`;
  renderSheet();
  if (lab === 2 && result.geometry.surfaces.length && s.maxZ - s.minZ > .4) { try { localStorage.setItem('cifog-gn:terrain', JSON.stringify(result.geometry)); } catch { /* private mode */ } }
  if (lab === 3 && S.step === 3 && renderedBy('RealizeInstances') && s.meshes > 0 && s.instances === 0 && !S.flags[3].realizeCompared) { S.flags[3].realizeCompared = true; save(); }
  $('#extra-note').textContent = lab === 3 ? `${imported ? U('terrainSaved') : U('terrainSample')}${S.step === 3 ? ` · ${S.flags[3].realizeCompared ? U('compared') : U('realizeNote')}` : ''}` : lab === 2 ? U('fieldNote') : U('singleNote');
}
function setTab(name) {
  S.tab = name; $('#preview-pane').hidden = name !== 'preview'; $('#sheet-pane').hidden = name !== 'sheet';
  document.querySelectorAll('#preview-tabs button').forEach(b => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-pressed', String(b.dataset.tab === name)); });
  if (name === 'sheet' && !S.flags[S.step].spreadsheet) { S.flags[S.step].spreadsheet = true; save(); }
  if (name === 'preview') requestAnimationFrame(() => preview?.update(result));
}
function changed(structure = false) { S.done[S.step] = false; S.feedback = ''; S.feedbackGood = false; save(); renderGuide(); renderCard(); if (structure) { renderNodes(); renderModifier(); } else requestAnimationFrame(drawWires); renderResult(); }
function snapshot() { S.undo.push(clone({ graph: graph(), flags: S.flags[S.step] })); if (S.undo.length > 30) S.undo.shift(); S.redo.length = 0; }
function restore(source, dest) { if (!source.length) return; dest.push(clone({ graph: graph(), flags: S.flags[S.step] })); const previous = source.pop(); S.graphs[S.step] = previous.graph; S.flags[S.step] = previous.flags; changed(true); status(U('connectHelp')); }
function showSolution() { snapshot(); S.graphs[S.step] = current().solution(); S.flags[S.step] = { spreadsheet: true, realizeCompared: true }; S.done[S.step] = true; S.feedback = U('solutionShown'); S.feedbackGood = true; save(); renderGuide(); renderCard(); renderNodes(); renderModifier(); renderResult(true); fitGraph(); }
function resetStep() { snapshot(); S.graphs[S.step] = current().starter(); S.flags[S.step] = {}; S.done[S.step] = false; S.feedback = U('stepReset'); S.feedbackGood = false; save(); renderGuide(); renderCard(); renderNodes(); renderModifier(); renderResult(true); fitGraph(); }
function checkStep() { const ok = !!current().check(graph(), result, S.flags[S.step]); S.done[S.step] = ok; S.feedback = U(ok ? 'success' : 'tryAgain'); S.feedbackGood = ok; save(); renderGuide(); renderCard(); }
function stepTo(i) { if (i < 0 || i >= lesson.steps.length) return; S.step = i; S.selected = null; S.feedback = ''; S.undo = []; S.redo = []; pending = null; wirePointer = null; save(); renderGuide(); renderCard(); renderNodes(); renderModifier(); renderResult(true); fitGraph(); setTab('preview'); }
function newId(type) { while (graph().nodes.some(n => n.id === `n${counter}`)) counter++; return `n${counter++}`; }
function addNode(type) { snapshot(); const view = $('#graph-viewport'), id = newId(type), x = Math.max(20, (view.clientWidth / 2 - panX) / scale - 100 + (counter % 3) * 18), y = Math.max(20, (view.clientHeight / 2 - panY) / scale - 100 + (counter % 3) * 18); graph().nodes.push(makeNode(id, type, Math.round(x), Math.round(y))); S.selected = id; changed(true); status(`${NODES[type].name} · ${U('connectHelp')}`); }
function deleteNode(id) { if (['input', 'output'].includes(id)) return; snapshot(); graph().nodes = graph().nodes.filter(n => n.id !== id); graph().links = graph().links.filter(l => l.from !== id && l.to !== id); graph().exposed = (graph().exposed || []).filter(e => e.targetNode !== id); S.selected = null; changed(true); }
function connect(from, to) { if (!from || !to) return; const l = makeLink(from.id, from.key, to.id, to.key); if (!addLink(graph(), l)) { status(U('badLink')); return; } changed(true); status(`${NODES[graph().nodes.find(n => n.id === from.id).type].name} → ${NODES[graph().nodes.find(n => n.id === to.id).type].name}`); }
function startWire(button) { pending = { id: button.dataset.socket.split('|')[0], key: button.dataset.socket.split('|')[1] }; wirePointer = null; document.querySelectorAll('.socket').forEach(s => { const [id, key] = s.dataset.socket.split('|'); s.classList.toggle('compatible', s.dataset.dir === 'in' && canLink(graph(), makeLink(pending.id, pending.key, id, key))); }); status(U('connectHelp')); drawWires(); }
function clearWire() { pending = null; wirePointer = null; document.querySelectorAll('.socket.compatible').forEach(s => s.classList.remove('compatible')); drawWires(); }
function joinWire(button) { if (!pending) { const [id, key] = button.dataset.socket.split('|'); const links = graph().links.filter(l => l.to === id && l.input === key); if (links.length) { snapshot(); graph().links = graph().links.filter(l => !(l.to === id && l.input === key)); changed(true); } else status(U('connectHelp')); return; } const [id, key] = button.dataset.socket.split('|'); snapshot(); connect(pending, { id, key }); clearWire(); }
function updateParameter(target) {
  const [id, key] = target.dataset.param.split('|'), n = graph().nodes.find(x => x.id === id); if (!n) return;
  snapshot(); const value = target.type === 'checkbox' ? target.checked : Number(target.value);
  if (target.dataset.axis != null) { const vector = [...n.params[key]]; vector[Number(target.dataset.axis)] = value; n.params[key] = vector; }
  else n.params[key] = value;
  changed();
}
function updateModifier(target) {
  const e = graph().exposed.find(x => x.id === target.dataset.mod); if (!e) return;
  snapshot(); const value = Number(target.value); if (target.dataset.axis != null) { const v = [...e.value]; v[Number(target.dataset.axis)] = value; e.value = v; } else e.value = value; changed();
}
function pointerInWorld(clientX, clientY) { const r = $('#graph-world').getBoundingClientRect(); return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale }; }
function toggleSidebar(force) {
  const sidebar = $('#node-sidebar');
  sidebar.hidden = typeof force === 'boolean' ? !force : !sidebar.hidden;
  $('.sidebar-toggle').setAttribute('aria-pressed', String(!sidebar.hidden));
}
function setupEvents() {
  $('#series').addEventListener('click', () => {});
  $('#guide').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) stepTo(Number(b.dataset.step)); });
  $('#step-card').addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'previous') stepTo(S.step - 1); if (a === 'next' && S.done[S.step]) stepTo(S.step + 1); if (a === 'check') checkStep(); if (a === 'solution') showSolution(); if (a === 'reset') resetStep(); });
  $('#node-search').addEventListener('input', renderPalette);
  $('#palette-list').addEventListener('click', e => { const type = e.target.closest('[data-add]')?.dataset.add; if (type) addNode(type); });
  $('#preview-tabs').addEventListener('click', e => { const tab = e.target.closest('[data-tab]')?.dataset.tab; if (tab) setTab(tab); });
  $('.node-editor-header').addEventListener('click', e => {
    const action = e.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (action === 'view') fitGraph();
    if (action === 'select') status(U('toolSelect'));
    if (action === 'add') $('#node-search').focus();
    if (action === 'node') toggleSidebar();
  });
  $('.node-tools').addEventListener('click', e => {
    const action = e.target.closest('[data-node-tool]')?.dataset.nodeTool;
    if (action === 'select') status(U('toolSelect'));
    if (action === 'fit') fitGraph();
    if (action === 'add') $('#node-search').focus();
  });
  $('#node-sidebar').addEventListener('click', e => { if (e.target.closest('[data-close-sidebar]')) toggleSidebar(false); });
  $('.editor-toolbar').addEventListener('click', e => { const a = e.target.closest('[data-toolbar]')?.dataset.toolbar; if (a === 'fit') fitGraph(); if (a === 'zoom-in') zoom(1.2); if (a === 'zoom-out') zoom(1 / 1.2); if (a === 'undo') restore(S.undo, S.redo); if (a === 'redo') restore(S.redo, S.undo); });
  $('#modifier-list').addEventListener('input', e => { if (e.target.matches('[data-mod]')) updateModifier(e.target); });
  $('#node-layer').addEventListener('input', e => { if (e.target.matches('[data-param]')) updateParameter(e.target); });
  $('#node-layer').addEventListener('change', e => { const t = e.target; if (t.matches('[data-mode]')) { snapshot(); graph().nodes.find(n => n.id === t.dataset.mode).params.mode = t.value; changed(); } if (t.matches('[data-collection]')) { snapshot(); graph().nodes.find(n => n.id === t.dataset.collection).params.collection = t.value; changed(); } });
  $('#node-layer').addEventListener('click', e => {
    if (Date.now() < suppressClick) return;
    const del = e.target.closest('[data-delete]'); if (del) { deleteNode(del.dataset.delete); return; }
    const exp = e.target.closest('[data-expose]'); if (exp) { const [id, key] = exp.dataset.expose.split('|'); snapshot(); expose(graph(), id, key, key); changed(true); return; }
    const sock = e.target.closest('[data-socket]'); if (sock) { if (sock.dataset.dir === 'out') startWire(sock); else joinWire(sock); return; }
    const node = e.target.closest('[data-node]'); if (node) { S.selected = node.dataset.node; document.querySelectorAll('.node').forEach(n => n.classList.toggle('selected', n.dataset.node === S.selected)); renderSidebar(); }
  });
  $('#graph-viewport').addEventListener('pointerdown', e => {
    if (e.target.closest('.node-tools, .node-sidebar')) return;
    const socket = e.target.closest('.socket'); if (socket?.dataset.dir === 'out') { e.preventDefault(); startWire(socket); wirePointer = pointerInWorld(e.clientX, e.clientY); return; }
    const head = e.target.closest('[data-drag]'); if (head && !e.target.closest('button')) { e.preventDefault(); const n = graph().nodes.find(x => x.id === head.dataset.drag); snapshot(); S.selected = n.id; drag = { id: e.pointerId, node: n, x: e.clientX, y: e.clientY, ox: n.x, oy: n.y }; document.querySelectorAll('.node').forEach(el => el.classList.toggle('selected', el.dataset.node === n.id)); renderSidebar(); return; }
    if (!e.target.closest('.node')) { panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: panX, py: panY }; $('#graph-viewport').classList.add('panning'); }
  });
  window.addEventListener('pointermove', e => {
    if (drag?.id === e.pointerId) { drag.node.x = Math.round(drag.ox + (e.clientX - drag.x) / scale); drag.node.y = Math.round(drag.oy + (e.clientY - drag.y) / scale); const el = document.querySelector(`.node[data-node="${drag.node.id}"]`); el.style.left = `${drag.node.x}px`; el.style.top = `${drag.node.y}px`; drawWires(); }
    if (panDrag?.id === e.pointerId) { panX = panDrag.px + e.clientX - panDrag.x; panY = panDrag.py + e.clientY - panDrag.y; transformWorld(); }
    if (pending && !drag) { wirePointer = pointerInWorld(e.clientX, e.clientY); drawWires(); }
  });
  window.addEventListener('pointerup', e => {
    if (drag?.id === e.pointerId) { drag = null; save(); }
    if (panDrag?.id === e.pointerId) { panDrag = null; $('#graph-viewport').classList.remove('panning'); }
    if (pending) { const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.socket.in'); if (target) { joinWire(target); suppressClick = Date.now() + 350; } else { wirePointer = null; drawWires(); } }
  });
  $('#graph-viewport').addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('keydown', e => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; if (e.key === 'Escape') clearWire(); if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.altKey) toggleSidebar(); if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected) deleteNode(S.selected); if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(S.undo, S.redo); } if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(S.redo, S.undo); } });
  new ResizeObserver(() => requestAnimationFrame(drawWires)).observe($('#graph-viewport'));
}
shell();
try { preview = createPreview($('#preview-canvas')); } catch (error) { $('#preview-canvas').textContent = '3D preview unavailable in this browser'; console.warn(error); }
renderSeries(); renderGuide(); renderCard(); renderPalette(); renderNodes(); renderModifier(); renderResult(true); setTab('preview'); setupEvents();
requestAnimationFrame(fitGraph); status(U('connectHelp'));
await import('../../lab-brief.js');
initI18n({ mount: '.site-header', append: true });
onLangChange(() => location.reload());
