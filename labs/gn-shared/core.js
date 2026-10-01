// A small, deterministic Geometry Nodes interpreter for the four browser labs.
// The editor stores the same data-flow distinction as Blender: geometry is
// passed along, while fields are evaluated separately for each point.
const socket = (key, type, options = {}) => ({ key, label: options.label || key, type, ...options });
export const NODES = {
  GroupInput: { name: 'Group Input', category: 'Group', outputs: [socket('Geometry', 'geometry')] },
  GroupOutput: { name: 'Group Output', category: 'Group', inputs: [socket('Geometry', 'geometry')] },
  Cube: { name: 'Cube', category: 'Mesh', inputs: [socket('Size', 'vector', { value: [1, 1, 1], min: .1, max: 8, step: .1 })], outputs: [socket('Mesh', 'geometry')] },
  UVSphere: { name: 'UV Sphere', category: 'Mesh', inputs: [socket('Radius', 'float', { value: .5, min: .1, max: 3, step: .05 })], outputs: [socket('Mesh', 'geometry')] },
  Grid: { name: 'Grid', category: 'Mesh', inputs: [socket('Size X', 'float', { value: 6, min: 1, max: 12, step: .5 }), socket('Size Y', 'float', { value: 6, min: 1, max: 12, step: .5 }), socket('Vertices X', 'float', { value: 12, min: 2, max: 32, step: 1 }), socket('Vertices Y', 'float', { value: 12, min: 2, max: 32, step: 1 })], outputs: [socket('Mesh', 'geometry')] },
  TransformGeometry: { name: 'Transform Geometry', category: 'Geometry', inputs: [socket('Geometry', 'geometry'), socket('Translation', 'vector', { value: [0, 0, 0], min: -8, max: 8, step: .1 }), socket('Rotation Z', 'float', { value: 0, min: -180, max: 180, step: 5 }), socket('Scale', 'vector', { value: [1, 1, 1], min: .1, max: 5, step: .1 })], outputs: [socket('Geometry', 'geometry')] },
  JoinGeometry: { name: 'Join Geometry', category: 'Geometry', inputs: [socket('Geometry', 'geometry', { multi: true })], outputs: [socket('Geometry', 'geometry')] },
  Position: { name: 'Position', category: 'Input', outputs: [socket('Position', 'vector', { field: true })] },
  Index: { name: 'Index', category: 'Input', outputs: [socket('Index', 'float', { field: true })] },
  Normal: { name: 'Normal', category: 'Input', outputs: [socket('Normal', 'vector', { field: true })] },
  Math: { name: 'Math', category: 'Utilities', modes: ['Add', 'Multiply', 'Sine', 'Greater Than'], inputs: [socket('Value', 'float', { value: 0, field: true, min: -8, max: 8, step: .1 }), socket('Value_001', 'float', { label: 'Value', value: 1, field: true, min: -8, max: 8, step: .1 })], outputs: [socket('Value', 'float', { field: true })] },
  VectorMath: { name: 'Vector Math', category: 'Utilities', modes: ['Add', 'Multiply'], inputs: [socket('Vector', 'vector', { value: [0, 0, 0], field: true, min: -8, max: 8, step: .1 }), socket('Vector_001', 'vector', { label: 'Vector', value: [1, 1, 1], field: true, min: -8, max: 8, step: .1 })], outputs: [socket('Vector', 'vector', { field: true })] },
  SeparateXYZ: { name: 'Separate XYZ', category: 'Utilities', inputs: [socket('Vector', 'vector', { value: [0, 0, 0], field: true })], outputs: ['X', 'Y', 'Z'].map(k => socket(k, 'float', { field: true })) },
  CombineXYZ: { name: 'Combine XYZ', category: 'Utilities', inputs: ['X', 'Y', 'Z'].map(k => socket(k, 'float', { value: 0, field: true, min: -5, max: 5, step: .1 })), outputs: [socket('Vector', 'vector', { field: true })] },
  EulerToRotation: { name: 'Euler to Rotation', category: 'Utilities', inputs: [socket('Euler', 'vector', { value: [0, 0, 0], field: true })], outputs: [socket('Rotation', 'rotation', { field: true })] },
  SetPosition: { name: 'Set Position', category: 'Geometry', inputs: [socket('Geometry', 'geometry'), socket('Selection', 'bool', { value: true, field: true }), socket('Offset', 'vector', { value: [0, 0, 0], field: true })], outputs: [socket('Geometry', 'geometry')] },
  DistributePoints: { name: 'Distribute Points on Faces', category: 'Points', inputs: [socket('Mesh', 'geometry'), socket('Selection', 'bool', { value: true, field: true }), socket('Density', 'float', { value: 1.5, field: true, min: 0, max: 6, step: .1 }), socket('Seed', 'float', { value: 0, min: 0, max: 99, step: 1 })], outputs: [socket('Points', 'geometry')] },
  InstanceOnPoints: { name: 'Instance on Points', category: 'Instances', inputs: [socket('Points', 'geometry'), socket('Selection', 'bool', { value: true, field: true }), socket('Instance', 'geometry'), socket('Rotation', 'rotation', { value: [0, 0, 0], field: true }), socket('Scale', 'vector', { value: [1, 1, 1], field: true, min: .1, max: 2, step: .1 })], outputs: [socket('Instances', 'geometry')] },
  RandomValue: { name: 'Random Value', category: 'Utilities', inputs: [socket('Min', 'float', { value: .55, min: 0, max: 2, step: .05 }), socket('Max', 'float', { value: 1.25, min: 0, max: 3, step: .05 }), socket('Seed', 'float', { value: 0, min: 0, max: 99, step: 1 })], outputs: [socket('Value', 'float', { field: true })] },
  CollectionInfo: { name: 'Collection Info', category: 'Input', collections: ['Rocks', 'Trees'], outputs: [socket('Instances', 'geometry')] },
  RealizeInstances: { name: 'Realize Instances', category: 'Instances', inputs: [socket('Geometry', 'geometry')], outputs: [socket('Geometry', 'geometry')] },
  CurveLine: { name: 'Curve Line', category: 'Curve', inputs: [socket('Start', 'vector', { value: [-3, 0, 1], min: -8, max: 8, step: .1 }), socket('End', 'vector', { value: [3, 0, 1], min: -8, max: 8, step: .1 })], outputs: [socket('Curve', 'geometry')] },
  CurveCircle: { name: 'Curve Circle', category: 'Curve', inputs: [socket('Radius', 'float', { value: .07, min: .02, max: .5, step: .01 })], outputs: [socket('Curve', 'geometry')] },
  ResampleCurve: { name: 'Resample Curve', category: 'Curve', inputs: [socket('Curve', 'geometry'), socket('Count', 'float', { value: 9, min: 2, max: 30, step: 1 })], outputs: [socket('Curve', 'geometry')] },
  CurveToMesh: { name: 'Curve to Mesh', category: 'Curve', inputs: [socket('Curve', 'geometry'), socket('Profile Curve', 'geometry'), socket('Fill Caps', 'bool', { value: true })], outputs: [socket('Mesh', 'geometry')] },
  CurveToPoints: { name: 'Curve to Points', category: 'Curve', inputs: [socket('Curve', 'geometry')], outputs: [socket('Points', 'geometry')] },
};

export const makeNode = (id, type, x, y, params = {}) => ({ id, type, x, y, params: { ...Object.fromEntries((NODES[type]?.inputs || []).filter(s => 'value' in s).map(s => [s.key, Array.isArray(s.value) ? [...s.value] : s.value])), ...(NODES[type]?.modes ? { mode: NODES[type].modes[0] } : {}), ...(NODES[type]?.collections ? { collection: NODES[type].collections[0] } : {}), ...params } });
export const makeLink = (a, out, b, input) => ({ from: a, out, to: b, input });
export function socketOf(graph, id, key, dir) {
  const n = graph.nodes.find(x => x.id === id); if (!n) return null;
  if (n.type === 'GroupInput' && dir === 'out' && key.startsWith('param:')) {
    const e = graph.exposed?.find(x => x.id === key); return e ? socket(key, e.type) : null;
  }
  return NODES[n.type]?.[dir === 'out' ? 'outputs' : 'inputs']?.find(s => s.key === key) || null;
}
export function canLink(graph, link) {
  const a = socketOf(graph, link.from, link.out, 'out'), b = socketOf(graph, link.to, link.input, 'in');
  if (!a || !b || link.from === link.to) return false;
  if (a.type !== b.type && !(a.type === 'float' && ['vector', 'bool'].includes(b.type)) && !(a.type === 'bool' && b.type === 'float')) return false;
  // Do not allow a wire to close a loop through the graph.
  const seen = new Set(), stack = [link.to];
  while (stack.length) { const id = stack.pop(); if (id === link.from) return false; if (seen.has(id)) continue; seen.add(id); graph.links.filter(l => l.from === id).forEach(l => stack.push(l.to)); }
  return true;
}
export function addLink(graph, link) {
  if (!canLink(graph, link)) return false;
  const input = socketOf(graph, link.to, link.input, 'in');
  graph.links = graph.links.filter(l => !(l.to === link.to && l.input === link.input && (!input.multi || l.from === link.from && l.out === link.out)));
  graph.links.push(link); return true;
}
export function expose(graph, nodeId, key, label) {
  const target = socketOf(graph, nodeId, key, 'in'); if (!target || !('value' in target)) return false;
  const id = `param:${nodeId}:${key}`;
  if (!graph.exposed) graph.exposed = [];
  if (!graph.exposed.some(e => e.id === id)) graph.exposed.push({ id, label: label || key, type: target.type, value: graph.nodes.find(n => n.id === nodeId).params[key], targetNode: nodeId, targetSocket: key });
  return addLink(graph, makeLink('input', id, nodeId, key));
}
const empty = () => ({ meshes: [], surfaces: [], points: [], curves: [] });
const copy = g => g ? JSON.parse(JSON.stringify(g)) : empty();
const field = (type, fn) => ({ field: true, type, fn });
const get = (v, p) => v?.field ? v.fn(p) : v;
const mapped = (type, values, fn) => values.some(v => v?.field) ? field(type, p => fn(...values.map(v => get(v, p)))) : fn(...values);
const vec = v => Array.isArray(v) ? v : [Number(v) || 0, Number(v) || 0, Number(v) || 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (i, seed = 0) => { const x = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); };
const merge = geometries => geometries.reduce((a, b) => { if (!b) return a; for (const k of ['meshes', 'surfaces', 'points', 'curves']) a[k].push(...(b[k] || [])); return a; }, empty());
const point = (position, index, normal = [0, 0, 1]) => ({ position, index, normal });
function grid(sx, sy, nx, ny) {
  nx = clamp(Math.round(nx), 2, 32); ny = clamp(Math.round(ny), 2, 32);
  const points = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) points.push(point([(x / (nx - 1) - .5) * sx, (y / (ny - 1) - .5) * sy, 0], y * nx + x));
  return { nx, ny, points };
}
function defaultGeometry(lab) {
  const g = empty();
  if (lab === 1) g.meshes.push({ kind: 'cube', position: [0, 0, 0], size: [1, 1, 1] });
  if (lab === 3) {
    const s = grid(7, 7, 17, 17);
    for (const p of s.points) p.position[2] = .45 * Math.sin(p.position[0] * .8) * Math.cos(p.position[1] * .65);
    g.surfaces.push(s);
  }
  return g;
}
function transform(g, translation, scale, rotation) {
  const r = copy(g), t = vec(translation), s = vec(scale), angle = Number(rotation) * Math.PI / 180;
  const move = p => { const x = p[0] * s[0], y = p[1] * s[1]; return [x * Math.cos(angle) - y * Math.sin(angle) + t[0], x * Math.sin(angle) + y * Math.cos(angle) + t[1], p[2] * s[2] + t[2]]; };
  r.meshes.forEach(m => { m.position = move(m.position); m.size = m.size.map((v, i) => v * s[i]); m.rotationZ = (m.rotationZ || 0) + angle; });
  r.surfaces.forEach(sf => sf.points.forEach(p => { p.position = move(p.position); }));
  r.points.forEach(p => { p.position = move(p.position); });
  r.curves.forEach(c => { c.points = c.points.map(move); });
  return r;
}
function heightOnSurface(s, x, y) {
  const left = s.points[0].position[0], right = s.points[s.nx - 1].position[0], bottom = s.points[0].position[1], top = s.points[(s.ny - 1) * s.nx].position[1];
  const u = clamp((x - left) / (right - left || 1) * (s.nx - 1), 0, s.nx - 1), v = clamp((y - bottom) / (top - bottom || 1) * (s.ny - 1), 0, s.ny - 1);
  const ix = Math.min(s.nx - 2, Math.floor(u)), iy = Math.min(s.ny - 2, Math.floor(v)), fx = u - ix, fy = v - iy;
  const z = (a, b) => s.points[b * s.nx + a].position[2];
  return (1 - fy) * ((1 - fx) * z(ix, iy) + fx * z(ix + 1, iy)) + fy * ((1 - fx) * z(ix, iy + 1) + fx * z(ix + 1, iy + 1));
}
export function evaluate(graph, options = {}) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), memo = new Map(), visiting = new Set(), errors = [];
  const base = options.inputGeometry ? copy(options.inputGeometry) : defaultGeometry(options.lab || 1);
  const source = (id, key) => {
    const k = `${id}:${key}`; if (memo.has(k)) return memo.get(k);
    if (visiting.has(k)) { errors.push('Cycle in graph'); return null; }
    const n = nodes.get(id); if (!n) return null; visiting.add(k);
    const input = name => {
      const spec = socketOf(graph, id, name, 'in');
      const links = graph.links.filter(l => l.to === id && l.input === name);
      if (spec?.multi) return links.map(l => source(l.from, l.out)).filter(Boolean);
      if (links[0]) return source(links[0].from, links[0].out);
      return n.params[name] ?? spec?.value;
    };
    let value = null;
    try {
      switch (n.type) {
        case 'GroupInput': value = key === 'Geometry' ? base : graph.exposed?.find(e => e.id === key)?.value; break;
        case 'Cube': value = { ...empty(), meshes: [{ kind: 'cube', position: [0, 0, 0], size: vec(input('Size')) }] }; break;
        case 'UVSphere': { const d = Number(input('Radius')) * 2; value = { ...empty(), meshes: [{ kind: 'sphere', position: [0, 0, 0], size: [d, d, d] }] }; break; }
        case 'Grid': value = { ...empty(), surfaces: [grid(Number(input('Size X')), Number(input('Size Y')), Number(input('Vertices X')), Number(input('Vertices Y')))] }; break;
        case 'TransformGeometry': value = transform(input('Geometry'), input('Translation'), input('Scale'), input('Rotation Z')); break;
        case 'JoinGeometry': value = merge(input('Geometry')); break;
        case 'Position': value = field('vector', p => p.position); break;
        case 'Index': value = field('float', p => p.index); break;
        case 'Normal': value = field('vector', p => p.normal); break;
        case 'Math': { const a = input('Value'), b = input('Value_001'); value = mapped('float', [a, b], (x, y) => n.params.mode === 'Sine' ? Math.sin(Number(x)) : n.params.mode === 'Multiply' ? Number(x) * Number(y) : n.params.mode === 'Greater Than' ? Number(x) > Number(y) : Number(x) + Number(y)); break; }
        case 'VectorMath': { const a = input('Vector'), b = input('Vector_001'); value = mapped('vector', [a, b], (x, y) => vec(x).map((v, i) => n.params.mode === 'Multiply' ? v * vec(y)[i] : v + vec(y)[i])); break; }
        case 'SeparateXYZ': value = mapped('float', [input('Vector')], v => vec(v)[{ X: 0, Y: 1, Z: 2 }[key]]); break;
        case 'CombineXYZ': value = mapped('vector', ['X', 'Y', 'Z'].map(input), (x, y, z) => [Number(x), Number(y), Number(z)]); break;
        case 'EulerToRotation': value = mapped('rotation', [input('Euler')], v => vec(v)); break;
        case 'SetPosition': {
          const g = copy(input('Geometry')), selection = input('Selection'), offset = input('Offset');
          let i = 0;
          for (const sf of g.surfaces) for (const p of sf.points) { p.index = i++; if (get(selection, p)) { const o = vec(get(offset, p)); p.position = p.position.map((v, j) => v + o[j]); } }
          for (const p of g.points) { p.index = i++; if (get(selection, p)) { const o = vec(get(offset, p)); p.position = p.position.map((v, j) => v + o[j]); } }
          value = g; break;
        }
        case 'DistributePoints': {
          const g = input('Mesh') || empty(), result = empty(), density = input('Density'), selection = input('Selection'), seed = Number(input('Seed'));
          for (const sf of g.surfaces) {
            const x0 = sf.points[0].position[0], x1 = sf.points[sf.nx - 1].position[0], y0 = sf.points[0].position[1], y1 = sf.points[(sf.ny - 1) * sf.nx].position[1];
            const area = Math.abs((x1 - x0) * (y1 - y0)), candidates = Math.min(400, Math.max(64, Math.ceil(area * 8)));
            for (let i = 0; i < candidates; i++) {
              const x = x0 + (x1 - x0) * hash(i * 3, seed), y = y0 + (y1 - y0) * hash(i * 3 + 1, seed);
              const p = point([x, y, heightOnSurface(sf, x, y)], i);
              if (get(selection, p) && hash(i * 3 + 2, seed) < clamp(Number(get(density, p)) * area / candidates, 0, 1)) result.points.push(p);
            }
          }
          value = result; break;
        }
        case 'InstanceOnPoints': {
          const points = input('Points')?.points || [], template = input('Instance')?.meshes || [], selection = input('Selection'), scales = input('Scale'), rotation = input('Rotation');
          const r = empty(); r.points = copy({ points }).points;
          points.forEach((p, i) => {
            if (!get(selection, p) || !template.length) return;
            const m = template[Math.floor(hash(i, 4) * template.length)], s = vec(get(scales, p)), rot = vec(get(rotation, p));
            r.meshes.push({ ...copy({ meshes: [m] }).meshes[0], position: m.position.map((v, j) => v * s[j] + p.position[j]), size: m.size.map((v, j) => v * s[j]), rotationZ: (m.rotationZ || 0) + rot[2], instance: true });
          });
          value = r; break;
        }
        case 'RandomValue': { const min = Number(input('Min')), max = Number(input('Max')), seed = Number(input('Seed')); value = field('float', p => min + (max - min) * hash(p.index, seed)); break; }
        case 'CollectionInfo': value = { ...empty(), meshes: n.params.collection === 'Trees' ? [{ kind: 'tree', position: [0, 0, 0], size: [1, 1, 1] }, { kind: 'tree', position: [0, 0, 0], size: [.75, .75, 1.15] }] : [{ kind: 'rock', position: [0, 0, 0], size: [.7, .6, .45] }, { kind: 'rock', position: [0, 0, 0], size: [.5, .8, .35] }] }; break;
        case 'RealizeInstances': value = copy(input('Geometry')); value.meshes.forEach(m => { m.instance = false; }); break;
        case 'CurveLine': value = { ...empty(), curves: [{ points: [vec(input('Start')), vec(input('End'))] }] }; break;
        case 'CurveCircle': { const radius = Number(input('Radius')); value = { ...empty(), curves: [{ points: Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6) * radius, Math.sin(i * Math.PI / 6) * radius, 0]), closed: true }] }; break; }
        case 'ResampleCurve': {
          const r = copy(input('Curve')), count = clamp(Math.round(Number(input('Count'))), 2, 30);
          r.curves.forEach(c => { const a = c.points[0], b = c.points.at(-1); c.points = Array.from({ length: count }, (_, i) => a.map((v, j) => v + (b[j] - v) * i / (count - 1))); }); value = r; break;
        }
        case 'CurveToMesh': { const curves = input('Curve')?.curves || [], profile = input('Profile Curve')?.curves?.[0]; const radius = profile ? Math.hypot(...profile.points[0].slice(0, 2)) : 0; value = { ...empty(), meshes: radius ? curves.map(c => ({ kind: 'tube', path: c.points, radius, position: [0, 0, 0], size: [1, 1, 1] })) : [] }; break; }
        case 'CurveToPoints': { const curves = input('Curve')?.curves || []; value = { ...empty(), points: curves.flatMap(c => c.points).map((p, i) => point(p, i)) }; break; }
      }
    } catch (error) { errors.push(`${n.type}: ${error.message}`); }
    visiting.delete(k); memo.set(k, value); return value;
  };
  const link = graph.links.find(l => l.to === 'output' && l.input === 'Geometry');
  const geometry = link ? source(link.from, link.out) || empty() : empty();
  const surfacePoints = geometry.surfaces.flatMap(s => s.points), allPoints = [...surfacePoints, ...geometry.points];
  const heights = allPoints.map(p => p.position[2]);
  return { geometry, errors, spreadsheet: allPoints.slice(0, 120), stats: { meshes: geometry.meshes.length, instances: geometry.meshes.filter(m => m.instance).length, surfaces: geometry.surfaces.length, points: geometry.points.length, vertices: surfacePoints.length, curves: geometry.curves.length, tubes: geometry.meshes.filter(m => m.kind === 'tube').length, minZ: heights.length ? Math.min(...heights) : 0, maxZ: heights.length ? Math.max(...heights) : 0 } };
}
