// Stages of the Material Lab. Every step loads a material (links, values, images, colour spaces)
// and checks what the student changes. Pure JS: no DOM, so it can be tested.
import { DEFAULT_LINKS, resolveGraph, sourceFor } from './graph.js';

export const DEFAULT_VALUES = {
 base:'#c98159', roughness:.45, metallic:0, ior:1.5, alpha:1, strength:1,
 transmission:0, coat:0, coatRough:.03, emission:'#ffffff', emissionStrength:0,
 bumpStrength:1, dispScale:.1, dispMid:.5,
 mappingType:'Point', vectorX:0, vectorY:0, vectorZ:0, locationX:0, locationY:0, locationZ:0, rotationX:0, rotationY:0, rotationZ:0, scaleX:1, scaleY:1, scaleZ:1,
};
export const DEFAULT_CS = { color:'sRGB', rough:'Non-Color', normalTex:'Non-Color', mask:'Non-Color', height:'Non-Color' };
export const NODE_SETS = {
 basic: ['coordinates','mapping','color','rough','normalTex','normal','bsdf','output'],
 core: ['bsdf','output'],
 mask: ['coordinates','mapping','color','rough','normalTex','normal','mask','bsdf','output'],
 invert: ['coordinates','mapping','color','rough','normalTex','normal','invert','mask','bsdf','output'],
 relief: ['coordinates','mapping','color','height','bump','disp','bsdf','output'],
 leaf: ['coordinates','mapping','color','mask','bsdf','output'],
};
const without = (links, ...keys) => { const l = { ...links }; for (const k of keys) delete l[k]; return l; };
const ONLY_OUTPUT = { 'output:surface':'bsdf:bsdf' };

// ─── Colour helpers ──────────────────────────────────────────────────────────
export function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function hsv(hex) {
 const [r, g, b] = hexRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
 let h = 0;
 if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
 return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
const between = (v, a, b) => v >= a && v <= b;

export function defaultState() {
 return {
  set:'brick', nodes:NODE_SETS.basic, links:{ ...DEFAULT_LINKS }, values:{ ...DEFAULT_VALUES, base:'#ffffff', roughness:.8 }, cs:{ ...DEFAULT_CS },
  shape:'sphere', subdiv:7, env:'room', open:{ transmission:false, coat:false, emission:false }, flags:{},
 };
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && k !== 'links') merge(a[k], v); else a[k] = JSON.parse(JSON.stringify(v)); } return a; };
export function startState(step) { return merge(defaultState(), step.start || {}); }
const graphOf = s => resolveGraph(s.links);

export const STAGES = [
 {
  id:'nodes', name:'Nodes & mapping', sub:'Roughness · normal map · tiling',
  steps:[
   {
    id:'n1', title:'Sharp and blurry reflections',
    text:'Roughness decides how the reflection spreads. At 0 the surface is a perfect mirror; at 1 the reflection is spread so much that it becomes a soft sheen. This is a plain metal with no textures. Drag the Roughness bar down to 0.1 or less, look at the reflections, then up to 0.8 or more.',
    how:['In the <b>Principled BSDF</b> node, drag along the <b>Roughness</b> bar.','Go below 0.1 and look at the sharp reflections of the room.','Then go above 0.8: the reflections blur into a soft highlight.'],
    why:'Roughness is the most important value of a PBR material: it tells worn from polished, matte from glossy.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:1, base:'#d0b079', roughness:.35 } },
    check:s => !!(s.flags.roughLow && s.flags.roughHigh),
    solve:s => { s.flags.roughLow = s.flags.roughHigh = true; s.values.roughness = .8; },
   },
   {
    id:'n2', title:'Detail without geometry',
    text:'A normal map stores the direction of the surface in every pixel, so the light behaves as if there were bumps where the mesh is flat. The brick normal map is loaded, but it is not connected. Connect it through the Normal Map node: the joints between the bricks appear, but the silhouette of the sphere does not change.',
    how:['Drag from <b>Image Texture (Normal) › Color</b> to <b>Normal Map › Color</b>.','Drag from <b>Normal Map › Normal</b> to <b>Principled BSDF › Normal</b>.','Look at the edge of the sphere: it stays perfectly round.'],
    why:'A normal map changes the lighting, not the mesh. It needs the Normal Map node to turn colours into directions.',
    start:{ set:'brick', links:without(DEFAULT_LINKS, 'normal:color', 'bsdf:normal') },
    check:s => graphOf(s).normal === 'normalTex' && s.cs.normalTex === 'Non-Color' && s.values.strength > 0,
    solve:s => { s.links['normal:color'] = 'normalTex:color'; s.links['bsdf:normal'] = 'normal:normal'; },
   },
   {
    id:'n3', title:'Repeat the texture',
    text:'The Mapping node scales the texture coordinates: Scale 4 repeats the image four times, so each brick is four times smaller. But one of the three images is not connected to Mapping: it takes the UVs directly and will not repeat with the others. Repeat the bricks four times and keep the three maps aligned.',
    how:['In <b>Mapping</b>, set <b>Scale X</b> and <b>Scale Y</b> to 4 (or more).','Look for the map that does not follow: its <b>Vector</b> input comes straight from Texture Coordinate.','Connect <b>Mapping › Vector</b> to that image\'s <b>Vector</b> input.'],
    why:'All the maps of a material must share the same coordinates, or colour, roughness and relief stop matching.',
    start:{ set:'brick', shape:'plane', links:{ ...DEFAULT_LINKS, 'rough:vector':'coordinates:uv' } },
    check:s => s.values.scaleX >= 3 && s.values.scaleX === s.values.scaleY && ['color', 'rough', 'normalTex'].every(t => s.links[`${t}:vector`] === 'mapping:vector'),
    solve:s => { s.values.scaleX = s.values.scaleY = 4; s.links['rough:vector'] = 'mapping:vector'; },
   },
  ],
 },
 {
  id:'metal', name:'Metal or not', sub:'Metallic · Base Color · albedo',
  steps:[
   {
    id:'m1', title:'Gold',
    text:'A metal has no diffuse colour: all its colour is in its reflection. With Metallic at 1, Base Color becomes the colour of the reflection. Make gold: a warm, bright yellow, fairly polished.',
    how:['Set <b>Metallic</b> to 1.','Pick a bright warm yellow for <b>Base Color</b> (gold is about #FFE29B).','Keep <b>Roughness</b> at 0.35 or less, and turn the preview to see the coloured reflections.'],
    why:'In PBR, the difference between a metal and a non-metal is not a colour: it is how the surface reflects light.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:0, base:'#9a9a9a', roughness:.5 } },
    check:s => { const c = hsv(s.values.base); return s.values.metallic >= .95 && between(c.h, 30, 55) && between(c.s, .25, .75) && c.v >= .75 && s.values.roughness <= .35; },
    solve:s => Object.assign(s.values, { metallic:1, base:'#ffe29b', roughness:.25 }),
   },
   {
    id:'m2', title:'Red plastic',
    text:'Plastic, paint, wood and stone are dielectrics (non-metals): the colour is in the diffuse light, and the reflection on top is white and weak (about 4% facing the camera, much more at grazing angles). This red ball is set as a metal, so its reflections are red. Turn it into red plastic.',
    how:['Set <b>Metallic</b> to 0.','Keep a saturated red <b>Base Color</b>.','Set <b>Roughness</b> between 0.15 and 0.6 and look at the highlights: they are white now.'],
    why:'The white highlight on a coloured object is what tells the eye “this is not metal”. The brighter edges are the Fresnel effect.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:1, base:'#c02a1e', roughness:.3 } },
    check:s => { const c = hsv(s.values.base); return s.values.metallic <= .05 && (c.h <= 15 || c.h >= 345) && c.s >= .5 && between(c.v, .3, .95) && between(s.values.roughness, .15, .6); },
    solve:s => Object.assign(s.values, { metallic:0, roughness:.35 }),
   },
   {
    id:'m3', title:'Half metal?',
    text:'Metallic 0.5 is not a real material: a surface is either metal or not. In-between values only make sense in the transition between two materials, like the edge of a scratch in the paint, and they come from a texture. Decide what this surface is.',
    how:['Set <b>Metallic</b> to 0 (a painted or stone surface) or to 1 (bare metal).','Choose the Base Color that goes with your choice.','Compare the two: a half metal looks like dirty plastic.'],
    why:'Real-world PBR guides agree: Metallic is 0 or 1 almost everywhere. Grey values are for blending masks, not for a whole material.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:.5, base:'#8a7a6a', roughness:.45 } },
    check:s => s.values.metallic <= .02 || s.values.metallic >= .98,
    solve:s => { s.values.metallic = 1; },
   },
   {
    id:'m4', title:'Whiter than white',
    text:'Nothing in nature reflects all the light that falls on it. Fresh snow reflects about 80-90%, white paint about 80%, charcoal about 4%. A Base Color of pure white (255) makes a surface brighter than anything real and breaks the balance with the lights. Make a believable white paint.',
    how:['Open the <b>Base Color</b> picker.','Lower the value to 240 or less (about 0.85 in Blender\'s linear colour), keep it neutral and above 200.','Compare it with the pure white: the shading gets richer.'],
    why:'Real albedo ranges keep materials consistent with each other and with the lighting, which is the whole point of PBR.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:0, base:'#ffffff', roughness:.6 } },
    check:s => { const [r, g, b] = s.values.base ? [...hexRgb(s.values.base)] : [255, 255, 255], c = hsv(s.values.base); return Math.max(r, g, b) <= 240 && Math.max(r, g, b) >= 200 && c.s <= .15 && s.values.metallic <= .05; },
    solve:s => { s.values.base = '#e6e6e6'; },
   },
  ],
 },
 {
  id:'maps', name:'Maps & colour space', sub:'sRGB · Non-Color · masks',
  steps:[
   {
    id:'c1', title:'Colour or data?',
    text:'An image can hold colour or data. Base Color is colour: it is stored with the sRGB curve of screens. Roughness, metallic, masks and normal maps are data: numbers that must be read as they are (Non-Color). Here every Color Space is wrong: the bricks look washed out, the roughness is off and the normal map bends the light the wrong way.',
    how:['In the <b>Image Texture</b> of Base Color, set <b>Color Space</b> to <b>sRGB</b>.','In the Roughness and Normal images, set <b>Color Space</b> to <b>Non-Color</b>.','Compare before and after with Ctrl Z.'],
    why:'Wrong colour spaces are one of the most common reasons a material “looks wrong” without an obvious cause.',
    start:{ set:'brick', cs:{ color:'Non-Color', rough:'sRGB', normalTex:'sRGB' } },
    check:s => s.cs.color === 'sRGB' && s.cs.rough === 'Non-Color' && s.cs.normalTex === 'Non-Color' && graphOf(s).base === 'color' && graphOf(s).normal === 'normalTex',
    solve:s => Object.assign(s.cs, { color:'sRGB', rough:'Non-Color', normalTex:'Non-Color' }),
   },
   {
    id:'c2', title:'Painted metal',
    text:'This panel is painted steel with scratches. The paint is a dielectric and the steel is a metal, so Metallic must be 0 on the paint and 1 in the scratches. A black and white mask says where the metal is. Connect it to Metallic.',
    how:['Find the <b>Image Texture</b> called Metallic (a black and white mask). Its Color Space must be <b>Non-Color</b>.','Drag its <b>Color</b> output to <b>Principled BSDF › Metallic</b>.','Zoom into a scratch: the steel reflects like a metal, the paint around it does not.'],
    why:'Texture sets (Base Color, Roughness, Metallic, Normal) are how game engines and Substance Painter describe complex surfaces.',
    start:{ set:'painted', nodes:NODE_SETS.mask, links:{ ...DEFAULT_LINKS, 'mask:vector':'mapping:vector' } },
    check:s => graphOf(s).metallic === 'mask' && !sourceFor(s.links, 'bsdf:metallic').invert && s.cs.mask === 'Non-Color' && graphOf(s).base === 'color' && graphOf(s).rough === 'rough',
    solve:s => { s.links['bsdf:metallic'] = 'mask:color'; s.cs.mask = 'Non-Color'; },
   },
   {
    id:'c3', title:'Gloss is not roughness',
    text:'This roughness image came from a program that uses glossiness (or smoothness, as in Unity): white means shiny. Blender\'s Roughness is the opposite: white means rough. Connected directly, the scratches look rough and the paint looks polished. Invert the map with an Invert Color node.',
    how:['Drag <b>Image Texture (Roughness) › Color</b> to <b>Invert Color › Color</b>.','Drag <b>Invert Color › Color</b> to <b>Principled BSDF › Roughness</b>.','Now the bare steel in the scratches is polished and the paint is satin.'],
    why:'Roughness and gloss (smoothness) are the same information upside down. Always check which convention an image uses.',
    start:{ set:'gloss', nodes:NODE_SETS.invert, links:{ ...DEFAULT_LINKS, 'mask:vector':'mapping:vector', 'bsdf:metallic':'mask:color' } },
    check:s => { const r = sourceFor(s.links, 'bsdf:roughness'); return !!r && r.node === 'rough' && r.invert && s.cs.rough === 'Non-Color'; },
    solve:s => { s.links['invert:color'] = 'rough:color'; s.links['bsdf:roughness'] = 'invert:color'; },
   },
  ],
 },
 {
  id:'relief', name:'Relief', sub:'Bump · displacement · subdivisions',
  steps:[
   {
    id:'r1', title:'Bump from a height map',
    text:'A height map is a black and white image: white is high, black is low. The Bump node reads how fast the height changes and bends the shading normals, like a normal map made on the fly. Use it to add the relief of these tiles.',
    how:['Drag <b>Image Texture (Height) › Color</b> to <b>Bump › Height</b>.','Drag <b>Bump › Normal</b> to <b>Principled BSDF › Normal</b>.','Try the <b>Strength</b> of the Bump node. The height image must be <b>Non-Color</b>.'],
    why:'Bump is quick and needs no special image, but it only changes the shading: silhouettes and shadows stay flat.',
    start:{ set:'tiles', nodes:NODE_SETS.relief, shape:'cube', links:{ 'mapping:input':'coordinates:uv', 'color:vector':'mapping:vector', 'height:vector':'mapping:vector', 'bsdf:base':'color:color', 'output:surface':'bsdf:bsdf' }, values:{ base:'#ffffff', roughness:.55 } },
    check:s => graphOf(s).bump === 'height' && s.cs.height === 'Non-Color' && s.values.bumpStrength > 0,
    solve:s => { s.links['bump:height'] = 'height:color'; s.links['bsdf:normal'] = 'bump:normal'; },
   },
   {
    id:'r2', title:'Real displacement',
    text:'Displacement really moves the surface: the mesh changes shape, so the silhouette and the shadows change too. It goes into the Displacement input of the Material Output, not into the shader. Displace this plane with the height map.',
    how:['Drag <b>Image Texture (Height) › Color</b> to <b>Displacement › Height</b>.','Drag <b>Displacement › Displacement</b> to <b>Material Output › Displacement</b>.','Turn the view to a grazing angle: the tiles really stick out. Try <b>Scale</b> and <b>Midlevel</b>.'],
    why:'In Blender, the material setting Displacement must be “Displacement Only” or “Displacement and Bump” to move the mesh; with “Bump Only” it only changes the shading.',
    start:{ set:'tiles', nodes:NODE_SETS.relief, shape:'plane', subdiv:7, links:{ 'mapping:input':'coordinates:uv', 'color:vector':'mapping:vector', 'height:vector':'mapping:vector', 'bsdf:base':'color:color', 'output:surface':'bsdf:bsdf' }, values:{ base:'#ffffff', roughness:.55 } },
    check:s => graphOf(s).displacement === 'height' && s.values.dispScale > 0,
    solve:s => { s.links['disp:height'] = 'height:color'; s.links['output:displacement'] = 'disp:displacement'; },
   },
   {
    id:'r3', title:'Enough vertices',
    text:'Displacement can only move vertices that exist. This plane has one face and four corners, so the displacement does nothing. Subdivide the plane until the tiles appear: 64 × 64 faces or more.',
    how:['Raise <b>Subdivisions</b> under the preview (it works like a Subdivision Surface modifier set to Simple).','Watch the tiles appear, first blocky, then clean.','In Cycles, Adaptive Subdivision does this automatically near the camera.'],
    why:'Displacement is powerful but expensive: it needs dense geometry. Use it for close-ups and big shapes; use bump and normal maps for fine detail.',
    start:{ set:'tiles', nodes:NODE_SETS.relief, shape:'plane', subdiv:0, links:{ 'mapping:input':'coordinates:uv', 'color:vector':'mapping:vector', 'height:vector':'mapping:vector', 'bsdf:base':'color:color', 'output:surface':'bsdf:bsdf', 'disp:height':'height:color', 'output:displacement':'disp:displacement' }, values:{ base:'#ffffff', roughness:.55 } },
    check:s => graphOf(s).displacement === 'height' && s.subdiv >= 6,
    solve:s => { s.subdiv = 7; },
   },
  ],
 },
 {
  id:'beyond', name:'Beyond the basics', sub:'Emission · glass · coat · alpha',
  steps:[
   {
    id:'b1', title:'Emission',
    text:'Emission makes a surface give off light of its own: screens, LEDs, lava, neon. It is added on top of everything else and it does not depend on the lights of the scene. Make this ball glow.',
    how:['Open the <b>Emission</b> panel of the Principled BSDF.','Pick an <b>Emission Color</b> and raise <b>Strength</b> to 1 or more.','In Blender, Cycles also lights the scene with it; Eevee does it more approximately.'],
    why:'Emission is how you make light sources that are objects, and it is what makes a screen or a sign readable in a dark shot.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:0, base:'#2a2a2a', roughness:.4 }, open:{ emission:true } },
    check:s => s.values.emissionStrength >= 1 && hsv(s.values.emission).v >= .2,
    solve:s => Object.assign(s.values, { emission:'#39b7ff', emissionStrength:3 }),
   },
   {
    id:'b2', title:'Glass',
    text:'Glass lets the light go through and bends it (refraction). Transmission sends the light through the surface, IOR (index of refraction) sets how much it bends: water is 1.33, glass about 1.5, diamond 2.42. Make clear glass.',
    how:['Open the <b>Transmission</b> panel and set <b>Weight</b> to 1.','Set <b>Roughness</b> to 0.1 or less (frosted glass is rougher) and <b>Metallic</b> to 0.','Set <b>IOR</b> between 1.4 and 1.6. Turn the environment to see the refraction.'],
    why:'Glass, water and plastic bottles are transmission materials. Metallic must be 0: a metal is never transparent.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:0, base:'#ffffff', roughness:.4, ior:1.1 }, env:'overcast', open:{ transmission:true } },
    check:s => s.values.transmission >= .95 && s.values.roughness <= .1 && between(s.values.ior, 1.4, 1.6) && s.values.metallic <= .05,
    solve:s => Object.assign(s.values, { transmission:1, roughness:.02, ior:1.5, metallic:0 }),
   },
   {
    id:'b3', title:'Car paint',
    text:'Car paint, varnished wood and lacquered plastic have two layers: a coloured base and a thin clear coat on top. The coat gives sharp reflections while the base stays softer. Add a clear coat to this red paint.',
    how:['Open the <b>Coat</b> panel and set <b>Weight</b> to 1.','Keep the coat <b>Roughness</b> at 0.1 or less.','Keep the base <b>Roughness</b> at 0.3 or more: two reflections, one sharp, one soft.'],
    why:'Layered materials are one of the ways Principled BSDF covers most real surfaces with one node.',
    start:{ set:'plain', nodes:NODE_SETS.core, links:ONLY_OUTPUT, values:{ metallic:0, base:'#9b1010', roughness:.45 }, open:{ coat:true } },
    check:s => s.values.coat >= .9 && s.values.coatRough <= .1 && s.values.roughness >= .3,
    solve:s => Object.assign(s.values, { coat:1, coatRough:.03, roughness:Math.max(.3, s.values.roughness) }),
   },
   {
    id:'b4', title:'A cut-out leaf',
    text:'A leaf is one flat quad: the shape comes from an alpha mask, white where the leaf is and black where it is not. Connect the mask to Alpha to cut the leaf out of the quad.',
    how:['Drag <b>Image Texture (Alpha) › Color</b> to <b>Principled BSDF › Alpha</b>. The mask must be <b>Non-Color</b>.','The leaf appears with its shape; the rest of the quad disappears.','In Eevee, check that the material\'s render method allows transparency.'],
    why:'Alpha cut-outs are how games and scenes draw foliage, hair cards, fences and decals with very few polygons.',
    start:{ set:'leaf', nodes:NODE_SETS.leaf, shape:'plane', links:{ 'mapping:input':'coordinates:uv', 'color:vector':'mapping:vector', 'mask:vector':'mapping:vector', 'bsdf:base':'color:color', 'output:surface':'bsdf:bsdf' }, values:{ base:'#ffffff', roughness:.5 } },
    check:s => graphOf(s).alpha === 'mask' && s.cs.mask === 'Non-Color',
    solve:s => { s.links['bsdf:alpha'] = 'mask:color'; s.cs.mask = 'Non-Color'; },
   },
  ],
 },
];
