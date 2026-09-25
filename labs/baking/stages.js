// Stages of the Baking Lab. Every step loads its own settings (and, when needed, images already baked).
import { buildLow } from './mesh.js';
import { createBake, BAKE_DEFAULTS } from './bake.js';

export const IMAGE_OF = { NORMAL: 'normal', AO: 'ao', DIFFUSE: 'diffuse' };
export const IMAGE_NAMES = { normal: 'Normal_Map', ao: 'AO_Map', diffuse: 'Color_Map' };

export function defaultState() {
  return {
    sel: { high: false, low: true, active: 'low' },
    bake: JSON.parse(JSON.stringify(BAKE_DEFAULTS)),
    low: { shading: 'flat', uv: 'unique' },
    material: { normalCS: 'Non-Color', normalLink: 'normalmap', colorLink: true, aoLink: true },
    preview: { engine: 'blender', flipGreen: false },
    images: { normal: null, ao: null, diffuse: null },
  };
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = JSON.parse(JSON.stringify(v)); } return a; };
const GOOD = { selectedToActive: true, cage: true, extrusion: 0.1, maxRay: 0 };
const BOTH = { high: true, low: true, active: 'low' };

// Bake into the state (used by the app, the tests and the starting scenes). geo = { high, bvh }.
export function bakeInto(state, geo, type, extra = {}) {
  const low = buildLow(state.low);
  const opts = { ...state.bake, ...extra, type };
  const job = createBake(low, geo.high, geo.bvh, opts);
  return { job, commit: () => { state.images[IMAGE_OF[type]] = metaOf(state, job); return job; } };
}
export function metaOf(state, job) {
  const o = job.options;
  return { type: o.type, selectedToActive: o.selectedToActive, cage: o.cage, extrusion: o.extrusion, maxRay: o.maxRay, margin: o.margin, res: o.res, swizzle: [...o.swizzle], samples: o.samples, passes: { ...o.passes }, shading: state.low.shading, uv: state.low.uv, stats: { ...job.stats } };
}
const clean = m => !!m && m.selectedToActive && m.stats.misses === 0 && m.stats.wrongHits === 0;

export const STAGES = [
  {
    id: 'normal', name: 'Normal map', sub: 'High → low',
    steps: [
      {
        id: 'n1', title: 'Selected to Active',
        text: 'The crate has two versions: Crate_high, with bevels, bolts and grooves (110,000 triangles), and Crate_low, a cube of 12 triangles with UVs. Baking copies the detail of the high poly into an image that the low poly uses. Press Bake now: with only the low poly selected, Blender bakes the low poly onto itself, and the normal map is flat blue. Then select both and bake from the high to the low.',
        how: ['In the <b>Outliner</b>, click <b>Crate_high</b>, then <kbd>Shift</kbd>-click <b>Crate_low</b>: the low poly must be the active object (it receives the bake).', 'In <b>Render Properties › Bake</b>, tick <b>Selected to Active</b>.', 'Press <b>Bake</b> and watch the Image Editor fill up.'],
        why: 'The bake is written into the image of the active object. The selected objects (the high poly) are only read.',
        start: {},
        check: s => !!s.images.normal?.selectedToActive,
        solve: s => { s.sel = { ...BOTH }; s.bake.selectedToActive = true; return ['NORMAL']; },
      },
      {
        id: 'n2', title: 'Reach the bolts',
        text: 'The bolts look strange (olive in the map) and the Bake report shows "wrong hits". Every texel casts a ray from the low poly surface inwards. The bolts stick out 6 cm above the low poly, so their rays start inside them, miss them and hit the far side of the crate. Extrusion pushes the start of the rays outwards.',
        how: ['Turn on <b>Rays</b> in the viewport and look at the rays of the bolts.', 'Raise <b>Extrusion</b> until every detail is inside (the bolts are 0.06 m high, so try 0.1 m) and press <b>Bake</b>.', 'The report must show 0 wrong hits. A few misses at the corners are the next step.'],
        why: 'Extrusion (or a cage) must enclose the whole high poly. Too little misses details; far too much can hit other parts of concave models.',
        start: { sel: BOTH, bake: { selectedToActive: true, extrusion: 0 }, prebake: ['NORMAL'] },
        check: s => { const m = s.images.normal; return !!m && m.selectedToActive && m.stats.wrongHits === 0 && m.stats.misses <= m.stats.texels * 0.01 && m.extrusion > 0; },
        solve: s => { s.bake.extrusion = 0.1; return ['NORMAL']; },
      },
      {
        id: 'n3', title: 'Close the corners',
        text: 'The low poly has hard edges (Shade Flat), so its rays go straight out of each face. At the corners, the high poly is rounded and the straight rays miss it: the red texels in the map. Keep the hard edges and bake with a Cage: the rays then start from a copy of the low poly inflated along averaged normals, and fan out around the corners.',
        how: ['Look at the red misses in the Image Editor (turn on <b>Misses</b>).', 'Tick <b>Cage</b> in the Bake panel and press <b>Bake</b> again.', 'The report must show 0 misses and 0 wrong hits. Keep <b>Shade Flat</b> on Crate_low.'],
        why: 'Hard edges need a UV seam on the same edge (this crate has one on every edge) and a cage to bake without gaps. The cage tilts the rays near the edges, so details close to an edge can look slightly skewed.',
        start: { sel: BOTH, bake: { selectedToActive: true, extrusion: 0.1 }, prebake: ['NORMAL'] },
        check: s => clean(s.images.normal) && s.images.normal.shading !== 'smooth',
        solve: s => { s.bake.cage = true; s.low.shading = 'flat'; return ['NORMAL']; },
      },
    ],
  },
  {
    id: 'tangent', name: 'Tangent space', sub: 'Colours · green · UVs',
    steps: [
      {
        id: 't1', title: 'Read the colours',
        text: 'A tangent-space normal map stores a direction in each texel: red = how much the surface tilts to the right of the UV island (+X), green = how much it tilts up (+Y), blue = how much it faces out (+Z). Flat areas are (0.5, 0.5, 1): that blue-violet. Find a texel that tilts clearly right and one that tilts clearly up.',
        how: ['In the Image Editor, hover the map: the bar shows the colour and the direction.', 'Click a texel with <b>R</b> ≥ 0.75 (the right side of a bolt, or the right bevel of an island).', 'Click a texel with <b>G</b> ≥ 0.75 (the top side of a bolt or a bevel). Try the R and G channel buttons.'],
        why: 'Reading the colours tells you at a glance if a map is correct, or if a channel is flipped.',
        start: { sel: BOTH, bake: GOOD, prebake: ['NORMAL'] },
        check: (s, f) => !!(f.red && f.green),
        solve: (s, f) => { f.red = true; f.green = true; return []; },
      },
      {
        id: 't2', title: 'OpenGL or DirectX',
        text: 'Blender and Unity use OpenGL normal maps (green = up, Y+). Unreal uses DirectX normal maps (green = down, Y−). The preview now shows the crate as Unreal would: the bolts look pushed in and the grooves stick out. Fix it, either when baking or when importing.',
        how: ['Option 1: in the Bake panel set <b>Swizzle G</b> to <b>−Y</b> and bake again.', 'Option 2: in the Preview panel tick Unreal\'s <b>Flip Green Channel</b>.', 'Only one of the two: doing both flips it back.'],
        why: 'A flipped green channel is one of the most common export mistakes. The light seems to come from below.',
        start: { sel: BOTH, bake: GOOD, preview: { engine: 'unreal' }, prebake: ['NORMAL'] },
        check: s => s.preview.engine === 'unreal' && !!s.images.normal && ((s.images.normal.swizzle[1] === '-Y') !== !!s.preview.flipGreen),
        solve: s => { s.preview.flipGreen = true; return []; },
      },
      {
        id: 't3', title: 'No overlapping UVs',
        text: 'This low poly uses a UV map where the six faces are stacked on the same space. Every texel belongs to six places at once, so the bake writes them on top of each other and the last face wins. Switch to the UV map with one island per face and bake again.',
        how: ['In <b>Crate_low › UV Maps</b>, choose <b>UVMap</b> (one island per face).', 'Press <b>Bake</b>.', 'The report must show 0 overlapping texels. (Mirrored or stacked UVs are fine for colour, never for a unique bake.)'],
        why: 'Normal maps and AO need unique UVs: every point of the surface needs its own texels.',
        start: { sel: BOTH, bake: GOOD, low: { uv: 'overlap' }, prebake: ['NORMAL'] },
        check: s => clean(s.images.normal) && s.images.normal.uv === 'unique' && s.images.normal.stats.overlaps === 0 && s.low.uv === 'unique',
        solve: s => { s.low.uv = 'unique'; return ['NORMAL']; },
      },
    ],
  },
  {
    id: 'maps', name: 'Maps & engine', sub: 'AO · colour · material',
    steps: [
      {
        id: 'm1', title: 'Ambient Occlusion',
        text: 'Ambient Occlusion darkens the places where light hardly reaches: inside the grooves and around the bolts. Bake it from the high poly into AO_Map. It uses the render samples: with 4 samples it is very noisy.',
        how: ['Set <b>Bake Type</b> to <b>Ambient Occlusion</b>.', 'Raise <b>Samples</b> to 16 or more.', 'Press <b>Bake</b>. The image goes into AO_Map.'],
        why: 'AO adds contact shadows that a game engine would not compute at that level of detail.',
        start: { sel: BOTH, bake: { ...GOOD, samples: 4 }, prebake: ['NORMAL'] },
        check: s => { const m = s.images.ao; return !!m && m.type === 'AO' && m.selectedToActive && m.samples >= 16 && m.stats.misses === 0; },
        solve: s => { s.bake.type = 'AO'; s.bake.samples = 16; return ['AO']; },
      },
      {
        id: 'm2', title: 'Only the colour',
        text: 'Diffuse bakes the colour of the high poly (paint, steel bolts, the yellow plate). By default it also bakes the light of the scene (Direct and Indirect), which is wrong for a game: the engine adds its own light. Bake only the Color contribution into Color_Map.',
        how: ['Set <b>Bake Type</b> to <b>Diffuse</b>.', 'Under <b>Contributions</b>, untick <b>Direct</b> and <b>Indirect</b>, keep <b>Color</b>.', 'Press <b>Bake</b>.'],
        why: 'A colour map with baked light looks wrong as soon as the light changes in the engine.',
        start: { sel: BOTH, bake: GOOD, prebake: ['NORMAL'] },
        check: s => { const m = s.images.diffuse; return !!m && m.type === 'DIFFUSE' && m.selectedToActive && m.passes.color && !m.passes.direct && !m.passes.indirect && m.stats.misses === 0; },
        solve: s => { s.bake.type = 'DIFFUSE'; s.bake.passes = { direct: false, indirect: false, color: true }; return ['DIFFUSE']; },
      },
      {
        id: 'm3', title: 'Connect the maps',
        text: 'The maps are baked, but the material of Crate_low uses them badly: the normal map is read as a colour (sRGB) and plugged straight into the Normal socket. Fix the material so the preview looks like the high poly.',
        how: ['Set the <b>Color Space</b> of Normal_Map to <b>Non-Color</b>: it stores directions, not colours.', 'Connect it through a <b>Normal Map</b> node (Tangent Space) to the BSDF Normal.', 'Connect <b>Color_Map</b> to Base Color and multiply it by <b>AO_Map</b>.'],
        why: 'Data images (normal, roughness, AO in games) must not be converted from sRGB, and a normal map needs the Normal Map node to use the tangents.',
        start: { sel: BOTH, bake: GOOD, material: { normalCS: 'sRGB', normalLink: 'direct', colorLink: false, aoLink: false }, prebake: ['NORMAL', 'AO', ['DIFFUSE', { passes: { direct: false, indirect: false, color: true } }]] },
        check: s => s.material.normalCS === 'Non-Color' && s.material.normalLink === 'normalmap' && s.material.colorLink && s.material.aoLink && !!s.images.normal && !!s.images.diffuse && !!s.images.ao,
        solve: s => { s.material = { normalCS: 'Non-Color', normalLink: 'normalmap', colorLink: true, aoLink: true }; return []; },
      },
      {
        id: 'm4', title: 'Margin for the engine',
        text: 'This normal map was baked with Margin 0: outside the islands the image is black. Seen from far away, the engine uses smaller versions of the texture (mipmaps) that mix the black in, and dark seams appear along the UV borders. Bake again with a margin.',
        how: ['Zoom out in the viewport (wheel) and look at the edges of the crate.', 'Set <b>Margin</b> to 8 px or more (Blender uses 16 px by default) and set <b>Bake Type</b> back to Normal.', 'Press <b>Bake</b>: the border texels are extended outwards.'],
        why: 'Margin (or padding) protects the islands from filtering and mipmaps. Bigger textures need a bigger margin.',
        start: { sel: BOTH, bake: { ...GOOD, margin: 0 }, prebake: ['NORMAL', 'AO', ['DIFFUSE', { passes: { direct: false, indirect: false, color: true }, margin: 16 }]] },
        check: s => clean(s.images.normal) && s.images.normal.margin >= 8,
        solve: s => { s.bake.type = 'NORMAL'; s.bake.margin = 16; return ['NORMAL']; },
      },
    ],
  },
];

// The state a step starts with, and the bakes to run before showing it.
export function startState(step) {
  const s = defaultState();
  const { prebake = [], ...rest } = step.start;
  merge(s, rest);
  return { state: s, prebake: prebake.map(p => Array.isArray(p) ? { type: p[0], extra: p[1] } : { type: p, extra: {} }) };
}
