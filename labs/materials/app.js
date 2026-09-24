import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { DEFAULT_LINKS, OUTPUTS, canConnect, connect, resolveGraph } from './graph.js';
import { installCoordinates } from './mapping.js';

const $=(q)=>document.querySelector(q);
const $$=(q)=>[...document.querySelectorAll(q)];
const status=$('#connection-status');
const world=$('#graph-world');
const viewport=$('#graph-viewport');
const svg=$('#wires');
const asset=(name)=>new URL(`./assets/textures/${name}`,import.meta.url).href;
const assets={brick:{color:asset('brick-color.jpg'),rough:asset('brick-rough.jpg'),normalTex:asset('brick-normal.jpg')},concrete:{color:asset('concrete.png')}};
const defaults={base:'#c98159',roughness:.45,metallic:0,ior:1.5,strength:1,mappingType:'Point',vectorX:0,vectorY:0,vectorZ:0,locationX:0,locationY:0,locationZ:0,rotationX:0,rotationY:0,rotationZ:0,scaleX:1,scaleY:1,scaleZ:1};
const state={links:{...DEFAULT_LINKS},values:{...defaults},preset:'brick',shape:'sphere',images:{...assets.brick},names:{color:'brick_color.jpg',rough:'brick_rough.jpg',normalTex:'brick_normal.jpg'}};
const positions={coordinates:[20,240],mapping:[235,75],color:[470,20],rough:[470,220],normalTex:[470,420],normal:[725,445],bsdf:[725,25],output:[995,25]};
let coordinateShader;
let zoom=1,panX=0,panY=0,pending=null,wirePointer=null,drag=null,activeStudy='roughness',renderer,scene,camera,controls,mesh,material,pmremTarget,renderFailed=false;
const loader=new THREE.TextureLoader();
const baseTextures=new Map();
const usedTextures=new Map();
const uploadUrls=new Map();
let applyRevision=0,renderDirty=true;

function socket(key,dir,type,label){return `<button class="socket ${dir} ${type}" data-key="${key}" data-dir="${dir}" aria-label="${dir==='input'?'Input':'Output'} ${label}" title="${dir==='input'?'Input':'Output'}: ${label}"></button>`;}
function row(key,dir,type,label,extra=''){return `<div class="socket-row ${dir==='output'?'out':''}">${socket(key,dir,type,label)}<span class="socket-label">${label}</span>${extra}</div>`;}
// Blender-style factor field: the label and value sit inside a filled bar.
function range(key,label,min,max,step,value,inputSocket=''){
 return `<div class="field" data-field="${key}"><div class="socket-row slider-row">${inputSocket?socket(inputSocket,'input','value',label):''}<span class="linked-label">${label}</span><label class="bslider" for="${key}"><input id="${key}" data-value="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span class="bs-label">${label}</span><output for="${key}" id="${key}-value">${Number(value).toFixed(3)}</output></label></div>${inputSocket?`<p class="driven" data-driven="${key}">Controlled by a texture</p>`:''}</div>`;
}
function setFill(input){if(input?.type==='range')input.parentElement.style.setProperty('--p',`${(input.value-input.min)/(input.max-input.min)*100}%`);}
function node(id,title,kind,body,width=204){const el=document.createElement('article');el.className=`node ${kind}`;el.id=`node-${id}`;el.dataset.node=id;el.style.cssText=`left:${positions[id][0]}px;top:${positions[id][1]}px;width:${width}px`;el.setAttribute('aria-label',`${title} node`);el.innerHTML=`<div class="node-header" data-drag="${id}"><span>${title}</span><span aria-hidden="true">⋮⋮</span></div><div class="node-body">${body}</div>`;$('#nodes').append(el);}
function vectorField(key,label,input){return `<div class="vector-field" data-vector-field="${key}">${row(input,'input','vector',label)}<div class="axis-fields">${['X','Y','Z'].map(axis=>`<label for="${key+axis}"><span>${axis}</span><input id="${key+axis}" data-value="${key+axis}" type="number" step="${key==='rotation'?1:.1}" min="-10000" max="10000" value="${defaults[key+axis]}" aria-label="${label} ${axis}"><span class="unit">${key==='rotation'?'°':key==='location'?'m':''}</span></label>`).join('')}</div></div>`;}
node('coordinates','Texture Coordinate','coordinates',`${[['generated','Generated'],['normal','Normal'],['uv','UV'],['object','Object'],['camera','Camera'],['window','Window'],['reflection','Reflection']].map(([id,label])=>row('coordinates:'+id,'output','vector',label)).join('')}<p class="node-caption coordinate-note">Object: preview mesh<br>UV: active mesh UVs</p>`,190);
node('mapping','Mapping','mapping',`${row('mapping:vector','output','vector','Vector')}<label class="mapping-type" for="mappingType">Type <select id="mappingType" aria-label="Mapping Type" data-value="mappingType"><option>Point</option><option>Texture</option><option>Vector</option><option>Normal</option></select></label>${vectorField('vector','Vector','mapping:input')}${vectorField('location','Location','mapping:location')}${vectorField('rotation','Rotation','mapping:rotation')}${vectorField('scale','Scale','mapping:scale')}`,190);
for(const [id,label] of [['color','Base Color'],['rough','Roughness'],['normalTex','Normal']])node(id,'Image Texture','texture',`${row(id+':color','output','color','Color')}<div class="image-strip"><img id="thumb-${id}" src="${state.images[id]}" alt="${label} texture"><span class="image-name" id="name-${id}">${label}</span><button data-upload="${id}" title="Open a local ${label} image" aria-label="Open ${label} image">Open</button><input type="file" class="image-upload" id="upload-${id}" accept="image/png,image/jpeg,image/webp"></div><div class="color-space"><span>Color Space</span><strong>${id==='color'?'sRGB':'Non-Color'}</strong></div>${row(id+':vector','input','vector','Vector')}`);
node('normal','Normal Map','normal',`${row('normal:normal','output','vector','Normal')}<p class="node-caption">Tangent Space</p>${range('strength','Strength',0,2,.01,1)}${row('normal:color','input','color','Color')}`);
node('bsdf','Principled BSDF','principled',`${row('bsdf:bsdf','output','shader','BSDF')}<div class="field" data-field="base">${row('bsdf:base','input','color','Base Color','<input id="base" data-value="base" type="color" value="#c98159" aria-label="Base Color">')}<p class="driven" data-driven="base">Controlled by a texture</p></div><div class="thin-rule"></div>${range('metallic','Metallic',0,1,.01,0,'bsdf:metallic')}${range('roughness','Roughness',0,1,.01,.45,'bsdf:roughness')}${range('ior','IOR',1,2.5,.01,1.5)}${row('bsdf:normal','input','vector','Normal')}`,221);
node('output','Material Output','output',`${row('output:surface','input','shader','Surface')}<p class="node-caption">Surface appearance</p>`,177);

function updateFields(){
 for(const [key,value] of Object.entries(state.values)){const el=$(`#${key}`);if(!el)continue;el.value=/^(vector|location|scale)[XYZ]$/.test(key)?Number(value).toFixed(3):value;const output=$(`#${key}-value`);if(output)output.textContent=Number(value).toFixed(3);setFill(el);}
 for(const [key,input] of [['base','bsdf:base'],['roughness','bsdf:roughness'],['metallic','bsdf:metallic']]){const linked=!!state.links[input];$(`#${key}`).disabled=linked;$(`[data-field="${key}"]`).classList.toggle('disabled',linked);$(`[data-driven="${key}"]`).classList.toggle('show',linked);}
 for(const [key,input] of [['vector','input'],['location','location'],['rotation','rotation'],['scale','scale']]){const field=$(`[data-vector-field="${key}"]`);field.querySelector('.axis-fields').hidden=!!state.links[`mapping:${input}`];field.hidden=key==='location'&&['Vector','Normal'].includes(state.values.mappingType);}
 $$('.socket.input').forEach(el=>{const linked=!!state.links[el.dataset.key];el.classList.toggle('connected',linked);el.title=linked?`${el.getAttribute('aria-label')} · Click to disconnect`:`${el.getAttribute('aria-label')} · Connect an output`;});
 $('#link-count').textContent=`${Object.keys(state.links).length} connections`;
 requestAnimationFrame(drawWires);
}
function socketPoint(key,dir){const el=$(`.socket[data-dir="${dir}"][data-key="${key}"]`);if(!el||!el.getClientRects().length)return null;const r=el.getBoundingClientRect(),b=world.getBoundingClientRect();return{x:(r.left+r.width/2-b.left)/zoom,y:(r.top+r.height/2-b.top)/zoom};}
function curve(a,b){const d=Math.max(50,Math.abs(b.x-a.x)*.5);return `M${a.x},${a.y} C${a.x+d},${a.y} ${b.x-d},${b.y} ${b.x},${b.y}`;}
function drawWires(){
 svg.replaceChildren();
 for(const [to,from] of Object.entries(state.links)){const a=socketPoint(from,'output'),b=socketPoint(to,'input');if(!a||!b)continue;const p=document.createElementNS('http://www.w3.org/2000/svg','path');let d=curve(a,b);if(a.x>=b.x){const source=$(`#node-${from.split(':')[0]}`);const bottom=source.offsetTop+source.offsetHeight+18;const right=a.x+25,left=b.x-27;d=`M${a.x},${a.y} C${right},${a.y} ${right},${bottom} ${a.x},${bottom} L${left+10},${bottom} Q${left},${bottom} ${left},${bottom-10} L${left},${b.y+10} Q${left},${b.y} ${left+10},${b.y} L${b.x},${b.y}`;}p.setAttribute('d',d);p.dataset.to=to;p.setAttribute('stroke',{color:'#e5c663',vector:'#9690ea',shader:'#86c396'}[OUTPUTS[from]]);svg.append(p);}
 if(cut&&cut.points.length>1){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M'+cut.points.map(pt=>`${pt.x},${pt.y}`).join(' L'));p.classList.add('cut-line');svg.append(p);}
 if(pending&&wirePointer){const a=socketPoint(pending,'output');if(a){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',curve(a,wirePointer));p.classList.add('draft');svg.append(p);}}
}
function setTransform(){world.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;$('#zoom-label').value=`${Math.round(zoom*100)}%`;requestAnimationFrame(drawWires);}
function fitGraph(){const w=viewport.clientWidth,h=viewport.clientHeight;let maxX=1190,maxY=640,minX=0,minY=0;$$('.node').forEach(n=>{maxX=Math.max(maxX,n.offsetLeft+n.offsetWidth+18);maxY=Math.max(maxY,n.offsetTop+n.offsetHeight+18);minX=Math.min(minX,n.offsetLeft-18);minY=Math.min(minY,n.offsetTop-18);});zoom=Math.max(.2,Math.min(1.25,(w-26)/(maxX-minX),(h-24)/(maxY-minY)));panX=(w-(maxX-minX)*zoom)/2-minX*zoom;panY=(h-(maxY-minY)*zoom)/2-minY*zoom;setTransform();}
function changeZoom(mult,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=THREE.MathUtils.clamp(zoom*mult,.35,1.8);panX=cx-(cx-panX)*next/zoom;panY=cy-(cy-panY)*next/zoom;zoom=next;setTransform();}
$('#fit').onclick=fitGraph;$('#zoom-in').onclick=()=>changeZoom(1.18);$('#zoom-out').onclick=()=>changeZoom(1/1.18);
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();changeZoom(e.deltaY>0?.92:1.08,e.clientX-r.left,e.clientY-r.top);},{passive:false});
// "Principled BSDF › Normal" from a socket key.
function socketName(key,dir){const el=$(`.socket[data-dir="${dir}"][data-key="${key}"]`),node=el?.closest('.node')?.querySelector('.node-header span')?.textContent||key.split(':')[0];return `${node} › ${el?.getAttribute('aria-label').replace(/^(Input|Output) /,'')||key.split(':')[1]}`;}
function clearPending(){pending=null;wirePointer=null;$$('.socket.selected').forEach(el=>el.classList.remove('selected'));$$('.socket.compatible').forEach(el=>el.classList.remove('compatible'));viewport.classList.remove('wiring');drawWires();}
// While a link is being dragged, light up only the inputs it can plug into.
function markCompatible(){viewport.classList.add('wiring');$$('.socket.input').forEach(el=>el.classList.toggle('compatible',canConnect(pending,el.dataset.key)));}
function pickOutput(key,text='Drop the link on a highlighted input. Esc cancels.'){clearPending();pending=key;$(`.socket.output[data-key="${key}"]`).classList.add('selected');markCompatible();status.textContent=text;}
function finishConnection(to){
 if(!pending)return;
 if(!connect(state.links,pending,to)){status.textContent='These sockets do not match in this lab. Choose a compatible input.';return;}
 const from=pending;clearPending();status.textContent=`Connected ${socketName(from,'output')} → ${socketName(to,'input')}.`;updateFields();applyMaterial();
}
let socketDown=null,suppressClickUntil=0;
let detached=null,cut=null;
viewport.addEventListener('pointerdown',e=>{
 // Blender: Ctrl + right-drag cuts links. Middle-drag pans anywhere.
 if(e.button===2&&(e.ctrlKey||e.metaKey)){const b=world.getBoundingClientRect();cut={id:e.pointerId,points:[{x:(e.clientX-b.left)/zoom,y:(e.clientY-b.top)/zoom}]};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;}
 if(e.button===1){e.preventDefault();drag={kind:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,left:panX,top:panY};viewport.setPointerCapture(e.pointerId);return;}
 if(e.button!==0)return;
 const s=e.target.closest('.socket');
 if(s){
  e.stopPropagation();
  if(s.dataset.dir==='output'){socketDown={id:e.pointerId,x:e.clientX,y:e.clientY,key:s.dataset.key};pickOutput(s.dataset.key);return;}
  // Blender: dragging a connected input picks its link up so it can be moved or dropped.
  if(!pending&&state.links[s.dataset.key]){const from=state.links[s.dataset.key];detached={to:s.dataset.key,from};delete state.links[s.dataset.key];socketDown={id:e.pointerId,x:e.clientX,y:e.clientY,key:from};pickOutput(from,'Drop on another input to move the link, or on empty space to remove it.');updateFields();}
  return;
 }
 const header=e.target.closest('.node-header');
 if(header){const n=header.closest('.node');selectNode(n);drag={kind:'node',el:n,id:e.pointerId,x:e.clientX,y:e.clientY,left:n.offsetLeft,top:n.offsetTop};header.setPointerCapture(e.pointerId);return;}
 if(e.target.closest('.node')){selectNode(e.target.closest('.node'));return;}
 selectNode(null);
 drag={kind:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,left:panX,top:panY};viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener('contextmenu',e=>e.preventDefault());
viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
function selectNode(n){$$('.node.active').forEach(el=>el.classList.remove('active'));if(n)n.classList.add('active');}
function segmentsCross(a,b,c,d){const o=(p,q,r)=>Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b);}
function finishCut(){
 const removed=[];
 for(const path of svg.querySelectorAll('path[data-to]')){
  const length=path.getTotalLength(),samples=[];for(let i=0;i<=40;i++){const p=path.getPointAtLength(length*i/40);samples.push({x:p.x,y:p.y});}
  let hit=false;for(let i=1;i<cut.points.length&&!hit;i++)for(let j=1;j<samples.length&&!hit;j++)hit=segmentsCross(cut.points[i-1],cut.points[i],samples[j-1],samples[j]);
  if(hit)removed.push(path.dataset.to);
 }
 cut=null;
 for(const to of removed)delete state.links[to];
 status.textContent=removed.length?`Cut ${removed.length} link${removed.length>1?'s':''} (Ctrl + right-drag).`:'No links crossed. Drag the cut line across a wire.';
 updateFields();if(removed.length)applyMaterial();
}
window.addEventListener('pointermove',e=>{
 if(cut&&cut.id===e.pointerId){const b=world.getBoundingClientRect();cut.points.push({x:(e.clientX-b.left)/zoom,y:(e.clientY-b.top)/zoom});drawWires();return;}
 if(pending){const b=world.getBoundingClientRect();wirePointer={x:(e.clientX-b.left)/zoom,y:(e.clientY-b.top)/zoom};drawWires();}
 if(!drag||drag.id!==e.pointerId)return;
 if(drag.kind==='node'){drag.el.style.left=`${Math.max(5,Math.min(1600,drag.left+(e.clientX-drag.x)/zoom))}px`;drag.el.style.top=`${Math.max(5,Math.min(1100,drag.top+(e.clientY-drag.y)/zoom))}px`;drawWires();}
 else{panX=drag.left+e.clientX-drag.x;panY=drag.top+e.clientY-drag.y;setTransform();}
});
window.addEventListener('pointerup',e=>{
 drag=null;
 if(cut&&cut.id===e.pointerId){finishCut();return;}
 if(!socketDown||socketDown.id!==e.pointerId)return;
 const moved=Math.hypot(e.clientX-socketDown.x,e.clientY-socketDown.y)>5,target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.socket.input');
 if(detached){
  const was=detached;detached=null;suppressClickUntil=performance.now()+300;
  if(!moved){state.links[was.to]=was.from;clearPending();status.textContent='Tip: drag a connected input away to move or remove its link.';updateFields();}
  else if(target&&canConnect(was.from,target.dataset.key))finishConnection(target.dataset.key);
  else{clearPending();status.textContent=`Removed the link into ${socketName(was.to,'input')}. Drag from an output to connect it again.`;updateFields();applyMaterial();}
 }else if(moved){if(target)finishConnection(target.dataset.key);else{clearPending();status.textContent='Link dropped on empty space. Drag from an output to a highlighted input.';}suppressClickUntil=performance.now()+300;}
 socketDown=null;
});
window.addEventListener('pointercancel',()=>{drag=null;socketDown=null;cut=null;if(detached){state.links[detached.to]=detached.from;detached=null;updateFields();}clearPending();});
// Click output, then input: a touch- and keyboard-friendly alternative to dragging.
$$('.socket').forEach(el=>el.addEventListener('click',e=>{
 if(performance.now()<suppressClickUntil)return;
 if(el.dataset.dir==='output'){pickOutput(el.dataset.key,'Now click a highlighted input (or drag next time). Esc cancels.');return;}
 if(pending){finishConnection(el.dataset.key);return;}
 if(e.detail===0&&state.links[el.dataset.key]){delete state.links[el.dataset.key];status.textContent='Link removed with the keyboard.';updateFields();applyMaterial();return;}
 status.textContent=state.links[el.dataset.key]?'Drag this input away to move or remove its link.':'Start from an output socket (right side of a node), then drop on this input.';
}));
let overEditor=false;viewport.addEventListener('pointerenter',()=>overEditor=true);viewport.addEventListener('pointerleave',()=>overEditor=false);
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(detached){state.links[detached.to]=detached.from;detached=null;socketDown=null;updateFields();}clearPending();status.textContent='Cancelled.';return;}
 if(e.key==='Home'&&(overEditor||document.activeElement===viewport)){e.preventDefault();fitGraph();status.textContent='View All (Home): every node fits in the editor.';}
});
$$('[data-value]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.value,text=['base','mappingType'].includes(key);let v=text?input.value:Number(input.value);if(!text){if(!Number.isFinite(v)||input.value==='')return;v=THREE.MathUtils.clamp(v,Number(input.min),Number(input.max));}state.values[key]=v;const output=$(`#${key}-value`);if(output)output.textContent=v.toFixed(3);setFill(input);if(key==='mappingType')updateFields();applyMaterial();}));
$$('input[type="number"]').forEach(el=>el.addEventListener('change',()=>{el.value=state.values[el.dataset.value];}));

async function getBaseTexture(url){
 if(!baseTextures.has(url))baseTextures.set(url,loader.loadAsync(url).catch(error=>{baseTextures.delete(url);throw error;}));
 return baseTextures.get(url);
}
async function textureFor(nodeId,role){
 if(!nodeId||!state.images[nodeId])return null;
 const url=state.images[nodeId],key=`${url}|${role}`;
 if(!usedTextures.has(key)){
  const source=await getBaseTexture(url);
  if(!usedTextures.has(key)){const t=source.clone();t.needsUpdate=true;t.colorSpace=role==='base'?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer?Math.min(8,renderer.capabilities.getMaxAnisotropy()):1;usedTextures.set(key,t);}
 }
 return usedTextures.get(key);
}
async function applyMaterial(){
 if(!material||renderFailed)return;
 const rev=++applyRevision;
 const graph=resolveGraph(state.links);
 try{
  const [base,rough,metal,normal]=await Promise.all([textureFor(graph.base,'base'),textureFor(graph.rough,'rough'),textureFor(graph.metallic,'metal'),textureFor(graph.normal,'normal')]);
  if(rev!==applyRevision)return;
  const oldMaps=[material.map,material.roughnessMap,material.metalnessMap,material.normalMap];
  material.map=base;material.roughnessMap=rough;material.metalnessMap=metal;material.normalMap=normal;
  material.color.set(base?'#ffffff':state.values.base);
  material.roughness=rough?1:state.values.roughness;
  material.metalness=metal?1:state.values.metallic;
  material.ior=state.values.ior;
  material.normalScale.set(state.values.strength,state.values.strength);
  coordinateShader.update(state.links,state.values,graph,mesh.geometry);
  mesh.material=graph.visible?material:emptyMaterial;
  if(oldMaps.some((m,i)=>Boolean(m)!==Boolean([base,rough,metal,normal][i])))material.needsUpdate=true;
  renderDirty=true;
  if(!graph.visible)status.textContent='Material Output is disconnected. Connect BSDF to Surface.';
  $('#render-status').classList.add('hidden');
 }catch(error){if(rev!==applyRevision)return;$('#render-status').textContent='A texture could not be loaded. Try another image or reset the scene.';$('#render-status').classList.remove('hidden');console.error('Texture loading failed',error);}
}
const emptyMaterial=new THREE.MeshBasicMaterial({color:0x080808});
function applyPreset(preset){
 clearPending();state.preset=preset;state.values={...defaults};state.links={...DEFAULT_LINKS};state.images={...assets.brick};state.names={color:'brick_color.jpg',rough:'brick_rough.jpg',normalTex:'brick_normal.jpg'};
 if(preset==='brick'){state.values.base='#ffffff';state.values.roughness=.8;}
 if(preset==='concrete'){state.images.color=assets.concrete.color;state.names.color='concrete_ai.png';delete state.links['bsdf:roughness'];delete state.links['bsdf:normal'];state.values.base='#ffffff';state.values.roughness=.84;}
 if(preset==='metal'||preset==='plain'){delete state.links['bsdf:base'];delete state.links['bsdf:roughness'];delete state.links['bsdf:normal'];state.values.metallic=preset==='metal'?1:0;state.values.roughness=preset==='metal'?.24:.42;state.values.base=preset==='metal'?'#d0b079':'#be6c48';}
 for(const id of ['color','rough','normalTex']){$(`#thumb-${id}`).src=state.images[id];$(`#name-${id}`).textContent=state.names[id];}
 $$('[data-preset]').forEach(b=>{b.classList.toggle('active',b.dataset.preset===preset);b.setAttribute('aria-pressed',String(b.dataset.preset===preset));});
 $('#material-name').textContent={brick:'Brick / PBR',concrete:'Concrete / base color',metal:'Metal / uniform values',plain:'Plain / uniform values'}[preset];
 status.textContent=preset==='concrete'?'Concrete uses a base-color image. Roughness and Normal maps are disconnected.':'Material ready. Drag from an output to an input to connect; drag a connected input away to disconnect.';
 updateFields();applyMaterial();
}
$$('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
function setShape(shape){
 state.shape=shape;
 if(mesh){mesh.geometry.dispose();mesh.geometry=shape==='sphere'?new THREE.SphereGeometry(1.15,96,64):shape==='cube'?new THREE.BoxGeometry(1.85,1.85,1.85,1,1,1):new THREE.PlaneGeometry(2.7,2.7);mesh.rotation.set(0,shape==='cube'?.48:0,0);mesh.position.y=shape==='cube'?.05:.12;coordinateShader.update(state.links,state.values,resolveGraph(state.links),mesh.geometry);material.side=shape==='plane'?THREE.DoubleSide:THREE.FrontSide;material.needsUpdate=true;camera.position.set(shape==='plane'?.1:3.5,shape==='plane'?.5:2.1,shape==='plane'?4.5:4.3);controls.target.set(0,.1,0);controls.update();renderDirty=true;}
 $$('[data-shape]').forEach(b=>{b.classList.toggle('active',b.dataset.shape===shape);b.setAttribute('aria-pressed',String(b.dataset.shape===shape));});
}
$$('[data-shape]').forEach(b=>b.onclick=()=>setShape(b.dataset.shape));
$('#rotate').onclick=()=>{if(!controls)return;controls.autoRotate=!controls.autoRotate;$('#rotate').setAttribute('aria-pressed',String(controls.autoRotate));renderDirty=true;};
$$('[data-upload]').forEach(b=>b.onclick=()=>$(`#upload-${b.dataset.upload}`).click());
for(const id of ['color','rough','normalTex'])$(`#upload-${id}`).addEventListener('change',async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)){status.textContent='Choose a PNG, JPEG or WebP image.';return;}
 if(file.size>20*1024*1024){status.textContent='Choose an image smaller than 20 MB.';return;}
 const url=URL.createObjectURL(file);
 try{const tex=await getBaseTexture(url);const max=renderer?.capabilities.maxTextureSize??4096;if(tex.image.width>max||tex.image.height>max){tex.dispose();baseTextures.delete(url);URL.revokeObjectURL(url);status.textContent=`This device supports textures up to ${max} pixels. Choose a smaller image.`;return;}
  const previous=uploadUrls.get(id);if(previous){for(const [k,t]of usedTextures)if(k.startsWith(previous+'|')){t.dispose();usedTextures.delete(k);}baseTextures.get(previous)?.then(t=>t.dispose());baseTextures.delete(previous);URL.revokeObjectURL(previous);}
  uploadUrls.set(id,url);state.images[id]=url;state.names[id]=file.name;$(`#thumb-${id}`).src=url;$(`#name-${id}`).textContent=file.name;status.textContent='Image opened locally. Connect its Color output to use it.';applyMaterial();
 }catch{URL.revokeObjectURL(url);status.textContent='This image could not be opened. Try a PNG, JPEG or WebP file.';}
});
const studies={roughness:{count:'01 / 03',title:'One material. Different reflections.',copy:'Drag the Roughness bar in the Principled BSDF node from 0 to 1. Watch the reflection go from sharp to soft.',target:'[data-field="roughness"]',insight:'<strong>Roughness spreads the reflection.</strong> A low value gives sharper reflections. A high value makes them broader and less defined.'},normal:{count:'02 / 03',title:'Detail without more geometry.',copy:'Drag the link off the Normal input of Principled BSDF and drop it on empty space. Then drag from Normal Map › Normal back to it. The joints change; the silhouette does not.',target:'.socket[data-key="bsdf:normal"]',insight:'<strong>A normal map changes the lighting, not the mesh.</strong> Feed the image into Normal Map first, then connect its Normal output to the shader.'},tiling:{count:'03 / 03',title:'One image. A much larger surface.',copy:'In the Mapping node, set Scale X and Scale Y from 1 to 4. More repetitions make each brick smaller. Look for a repeating stain.',target:'[data-vector-field="scale"]',insight:'<strong>All maps should stay aligned.</strong> The same Mapping output feeds each image, so color, roughness and normal detail repeat together.'}};
function selectStudy(key){activeStudy=key;const s=studies[key];$('#study-count').textContent=s.count;$('#study-title').textContent=s.title;$('#study-copy').textContent=s.copy;$$('[data-study]').forEach(b=>{b.classList.toggle('active',b.dataset.study===key);b.setAttribute('aria-pressed',String(b.dataset.study===key));});}
$$('[data-study]').forEach(b=>b.onclick=()=>selectStudy(b.dataset.study));
$('#start-study').onclick=()=>{applyPreset(activeStudy==='roughness'?'metal':'brick');setShape(activeStudy==='tiling'?'plane':'sphere');$('#insight-copy').innerHTML=studies[activeStudy].insight;fitGraph();pointAt(studies[activeStudy].target);status.textContent='Experiment ready. The control to use is highlighted in the Shader Editor.';};
// Draw attention to the control an experiment needs.
function pointAt(selector){$$('.pulse').forEach(el=>el.classList.remove('pulse'));const el=$(selector);if(!el)return;const target=el.classList.contains('socket')?el.closest('.socket-row'):el;void target.offsetWidth;target.classList.add('pulse');selectNode(target.closest('.node'));setTimeout(()=>target.classList.remove('pulse'),6000);}
$('#reset').onclick=()=>{applyPreset('brick');setShape('sphere');selectStudy('roughness');if(controls){controls.autoRotate=false;$('#rotate').setAttribute('aria-pressed','false');}for(const [id,[x,y]]of Object.entries(positions)){const n=$(`#node-${id}`);n.style.left=`${x}px`;n.style.top=`${y}px`;}$('#insight-copy').innerHTML='<strong>Images carry different kinds of data.</strong> Use sRGB for Base Color and Non-Color for roughness and normal maps.';fitGraph();status.textContent='Scene reset. All default connections restored.';};
for(const [button,dialog] of [['#help','#help-dialog'],['#credits','#credits-dialog']])$(button).onclick=()=>$(dialog).showModal();
$$('dialog').forEach(d=>{d.querySelectorAll('.dialog-close,.dialog-close-action').forEach(b=>b.onclick=()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});

async function startRenderer(){
 const host=$('#viewer');
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x202329,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;host.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive 3D object');renderer.domElement.setAttribute('role','img');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,60);camera.position.set(3.5,2.1,4.3);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.1,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;controls.minDistance=2.3;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.87;controls.autoRotateSpeed=.8;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:null};controls.addEventListener('change',()=>renderDirty=true);
  const env=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);pmremTarget=pmrem.fromScene(env,.04);scene.environment=pmremTarget.texture;scene.environmentIntensity=.8;env.dispose();pmrem.dispose();
  const key=new THREE.DirectionalLight(0xfff2df,2.1);key.position.set(-3,6,5);scene.add(key);const fill=new THREE.DirectionalLight(0xcbdcff,.9);fill.position.set(4,1,-3);scene.add(fill);
  material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.6,metalness:0,ior:1.5});coordinateShader=installCoordinates(material);mesh=new THREE.Mesh(new THREE.SphereGeometry(1.15,96,64),material);mesh.position.y=.12;scene.add(mesh);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(2.7,96),new THREE.MeshStandardMaterial({color:0x282b30,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.045;scene.add(ground);
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);coordinateShader.resize(renderer);camera.aspect=w/h;camera.updateProjectionMatrix();renderDirty=true;};new ResizeObserver(resize).observe(host);resize();
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();renderFailed=true;$('#render-status').textContent='The 3D preview paused. Reload the page to restore it.';$('#render-status').classList.remove('hidden');});
  function frame(){requestAnimationFrame(frame);if(document.hidden||renderFailed)return;controls.update();if(renderDirty||controls.autoRotate){renderer.render(scene,camera);renderDirty=false;}}frame();
  await applyMaterial();
 }catch(error){renderFailed=true;$('#render-status').textContent='This browser could not start the 3D preview. Try an updated browser with hardware acceleration enabled. The node editor still works.';$('#render-status').classList.remove('hidden');console.error('Renderer setup failed',error);}
}
new ResizeObserver(()=>{fitGraph();}).observe(viewport);
applyPreset('brick');fitGraph();startRenderer();


