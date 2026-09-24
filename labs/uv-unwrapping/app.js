import * as THREE from 'three';
import {OrbitControls} from '../../vendor/OrbitControls.js';
import {FACES,FACE_ORDER,EDGES,PRESETS,buildLayout} from './unfold.js';
import {MODELS,defaultCuts,buildCharts,packCharts,averageIslandScale,faceUV,faceUVPoint,stretchMetrics,edgeName} from './workbench.js';

const $=selector=>document.querySelector(selector);
const ns='http://www.w3.org/2000/svg';
const S=(tag,attrs={})=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
const V3=values=>new THREE.Vector3(...values);
const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
const state={model:'cube',cuts:{cube:defaultCuts('cube'),chair:defaultCuts('chair')},activePart:'cube',selected:'cube:F',selectedEdge:null,layout:null,charts:[],invalid:null,fold:1,stretchDisplay:'none'};
const host=$('#viewer'),svgFaces=$('#uv-faces'),edgeList=$('#edge-list');
let renderer,scene,camera,controls,rig,rigRoots=[],hinges=[],chairGroup,flatScale=1,dirty=true,animation=0,previewReady=false;
const cubeFaceMeshes={},chairFaceMeshes={},cubeEdges=[],chairEdges=[],cubeHits=[],chairHits=[];
const cubeView=new THREE.Vector3(4.2,3,5.4),chairView=new THREE.Vector3(5,4.3,6.3),flatView=new THREE.Vector3(0,0,8.4);

function setStatus(message,warning=false){$('#lesson-status').textContent=message;$('.status-box').classList.toggle('warning',warning);}
function currentPart(){return MODELS[state.model].find(part=>part.id===state.activePart);}
function currentCuts(){return state.cuts[state.model].get(state.activePart);}
function selectedChart(){return state.charts.find(chart=>chart.faces.some(face=>face.key===state.selected));}
function faceLabel(key){const [partId,id]=key.split(':'),part=MODELS[state.model].find(item=>item.id===partId);return `${part?.name||partId} · ${FACES[id].name}`;}

function faceTexture(id,part){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d');ctx.fillStyle=part.id==='cube'?FACES[id].color:part.color;ctx.fillRect(0,0,256,256);
 for(let y=0;y<6;y++)for(let x=0;x<6;x++){ctx.fillStyle=(x+y)%2?'#15243220':'#ffffff2a';ctx.fillRect(x*256/6,y*256/6,256/6,256/6);}
 ctx.strokeStyle='#18243155';ctx.lineWidth=5;ctx.strokeRect(3,3,250,250);
 if(part.id==='cube'||(part.id==='seat'&&id==='T')||(part.id==='back'&&id==='F')){
  ctx.fillStyle='#f9faf0dd';ctx.fillRect(20,97,216,62);ctx.textAlign='center';ctx.fillStyle='#202831';ctx.font='bold 28px Arial';ctx.fillText(part.id==='cube'?FACES[id].name.toUpperCase():part.name.toUpperCase(),128,128);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function makeCubeRig(layout){
 if(rig)scene.remove(rig);rig=new THREE.Group();scene.add(rig);rigRoots=[];hinges=[];
 const bounds=layout.bounds,mid=[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2];
 flatScale=3.8/Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
 const frames={};
 for(const component of layout.components){
  const root=component.root,flat=layout.faces[root],basis=FACES[root],rootGroup=new THREE.Group();
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(basis.u),V3(basis.v),V3(basis.n)));
  rootGroup.add(cubeFaceMeshes[root]);rig.add(rootGroup);frames[root]=rootGroup;
  rigRoots.push({group:rootGroup,flat:new THREE.Vector3(flat.center[0]-mid[0],flat.center[1]-mid[1],0),cube:V3(basis.n),quaternion});
  for(const id of component.ids.slice(1)){
   const info=layout.faces[id],parent=frames[info.parent],parentInfo=layout.faces[info.parent];
   const hinge=new THREE.Group();hinge.position.set(info.side[0],info.side[1],0);parent.add(hinge);
   const frame=new THREE.Group();frame.position.set(info.side[0],info.side[1],0);
   frame.rotation.z=Math.atan2(dot2(info.U,parentInfo.V),dot2(info.U,parentInfo.U));hinge.add(frame);frame.add(cubeFaceMeshes[id]);frames[id]=frame;
   hinges.push({group:hinge,axis:V3(info.axis)});
  }
 }
 updateFold(state.fold);
}

function updateFold(amount){
 state.fold=amount;$('#fold').value=Math.round(amount*100);$('#animate').innerHTML=amount>.5?'Unfold the cube <span aria-hidden="true">↘</span>':'Fold back into 3D <span aria-hidden="true">↗</span>';
 if(rig){rig.scale.setScalar(THREE.MathUtils.lerp(flatScale,1,amount));for(const root of rigRoots){root.group.position.copy(root.flat).lerp(root.cube,amount);root.group.quaternion.identity().slerp(root.quaternion,amount);}for(const hinge of hinges)hinge.group.quaternion.setFromAxisAngle(hinge.axis,Math.PI/2*amount);}
 cubeEdges.forEach(edge=>edge.visible=state.model==='cube'&&amount>.96);cubeHits.forEach(edge=>edge.visible=state.model==='cube'&&amount>.96);
 if(camera&&controls&&state.model==='cube'){camera.position.copy(flatView).lerp(cubeView,amount);controls.enabled=amount>.97;controls.target.set(0,0,0);controls.update();}
 dirty=true;
}
function animateTo(target){
 if(!state.layout?.valid||state.model!=='cube')return;
 const from=state.fold,start=performance.now(),duration=900,run=++animation;
 function tick(now){if(run!==animation)return;const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t);updateFold(from+(target-from)*ease);if(t<1)requestAnimationFrame(tick);}requestAnimationFrame(tick);
}

function mapPoint(uv){return [70+uv[0]*420,460-uv[1]*420];}
function overlayColor(score){const t=Math.min(1,score),a=[104,166,236],b=[246,102,97];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;}
function renderFace(chart,face,metrics){
 const key=face.key,corners=faceUV(chart,face).map(mapPoint),score=state.stretchDisplay==='none'?0:Math.min(1,metrics.get(key)?.[state.stretchDisplay]/(state.stretchDisplay==='angle'?25:1.6));
 const fill=state.stretchDisplay==='none'?(chart.part.id==='cube'?FACES[face.id].color:chart.part.color):overlayColor(score);
 const group=S('g',{class:`uv-face${state.selected===key?' active':''}`,tabindex:0,role:'button','aria-label':`${faceLabel(key)} in UV layout`});
 group.dataset.face=key;group.append(S('polygon',{class:'face-outline',points:corners.map(point=>point.join(',')).join(' '),fill}));
 const [w,h]=face.size.map(n=>n/2);
 for(let i=1;i<4;i++){
  const u=-w+2*w*i/4,v=-h+2*h*i/4;
  const a=mapPoint(faceUVPoint(chart,face,u,-h)),b=mapPoint(faceUVPoint(chart,face,u,h));
  const c=mapPoint(faceUVPoint(chart,face,-w,v)),d=mapPoint(faceUVPoint(chart,face,w,v));
  group.append(S('path',{d:`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} M ${c[0]} ${c[1]} L ${d[0]} ${d[1]}`,class:'uv-checker'}));
 }
 const cx=corners.reduce((sum,p)=>sum+p[0],0)/4,cy=corners.reduce((sum,p)=>sum+p[1],0)/4;
 const area=Math.abs((corners[1][0]-corners[0][0])*(corners[2][1]-corners[1][1])-(corners[1][1]-corners[0][1])*(corners[2][0]-corners[1][0]));
 const faceWidth=Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),faceHeight=Math.hypot(corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]);
 if(Math.min(faceWidth,faceHeight)>19&&area>400){const letter=S('text',{class:'face-letter',x:cx,y:cy,'font-size':Math.min(25,Math.max(12,Math.min(faceWidth,faceHeight)*.65))});letter.textContent=face.id;group.append(letter);}
 if(area>3000){const label=S('text',{class:'face-name',x:cx,y:cy+Math.min(20,Math.sqrt(area)*.2),'font-size':Math.min(13,Math.sqrt(area)*.16)});label.textContent=FACES[face.id].name;group.append(label);}
 group.addEventListener('click',()=>selectFace(key));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectFace(key);}});
 return group;
}
function renderMap(){
 svgFaces.replaceChildren();const empty=$('#map-empty');
 if(state.invalid){empty.hidden=false;const {part,layout}=state.invalid;empty.textContent=layout.cycle?`${part.name} still has a closed loop. Mark another seam, then Unwrap.`:`${part.name} has overlapping faces. Move a seam, then Unwrap.`;$('#island-count').textContent='No clear UV layout yet';return;}
 empty.hidden=true;const metrics=stretchMetrics(state.charts);for(const chart of state.charts){for(const face of chart.faces)svgFaces.append(renderFace(chart,face,metrics));if(state.model==='chair'){
  const tag={seat:'SEAT',back:'BACK', 'leg-fl':'FL LEG','leg-fr':'FR LEG','leg-bl':'BL LEG','leg-br':'BR LEG'}[chart.part.id];
  const label=S('text',{class:'island-label',x:70+(chart.x+chart.width*chart.densityScale*chart.stretchU*chart.unitScale/2)*420,y:460-(chart.y+chart.height*chart.densityScale*chart.stretchV*chart.unitScale)*420-7,'text-anchor':'middle'});label.textContent=tag;svgFaces.append(label);
 }}
 $('#island-count').textContent=`${state.charts.length} UV island${state.charts.length===1?'':'s'}`;
 $('#stretch-value').textContent=`${(selectedChart()?.stretchU||1).toFixed(2)}×`;
 $('#stretch-u').value=String(selectedChart()?.stretchU||1);
 updateSurfaceColors(metrics);
}
function updateSurfaceColors(metrics){
 const meshMap=state.model==='cube'?Object.fromEntries(Object.entries(cubeFaceMeshes).map(([id,mesh])=>[`cube:${id}`,mesh])):chairFaceMeshes;
 for(const [key,mesh] of Object.entries(meshMap)){
  const value=metrics.get(key)?.[state.stretchDisplay]||0,score=state.stretchDisplay==='none'?0:Math.min(1,value/(state.stretchDisplay==='angle'?25:1.6));
  mesh.material.color.set(state.stretchDisplay==='none'?0xffffff:overlayColor(score));
  mesh.material.emissive.set(key===state.selected?'#72500c':'#000000');mesh.material.emissiveIntensity=key===state.selected ? .3 : 0;mesh.userData.selectionOutline.visible=key===state.selected;
 }
 dirty=true;
}
function selectFace(key,announce=true){
 state.selected=key;const [partId]=key.split(':');if(state.model==='chair'&&partId!==state.activePart){state.activePart=partId;state.selectedEdge=null;$('#part-select').value=partId;renderEdgeList();updateEdgeStyles();}
 renderMap();if(announce)setStatus(`${faceLabel(key)} is highlighted in both views. Faces joined by blue edges share a UV island.`);
}

function renderEdgeList(){
 edgeList.replaceChildren();for(const edge of EDGES){const button=document.createElement('button');button.type='button';button.dataset.edge=edge.key;button.textContent=edgeName(edge);button.addEventListener('click',()=>selectEdge(edge.key));edgeList.append(button);}
}
function selectEdge(key,partId=state.activePart){
 state.activePart=partId;if(state.model==='chair')$('#part-select').value=partId;
 state.selectedEdge=key;renderEdgeList();updateEdgeStyles();setStatus(`${currentPart().name}: ${edgeName(EDGES.find(edge=>edge.key===key))} selected. Press U for Mark Seam or Clear Seam.`);
}
function updateEdgeStyles(){
 const cuts=currentCuts();for(const button of edgeList.querySelectorAll('button')){const cut=cuts.has(button.dataset.edge);button.classList.toggle('cut',cut);button.classList.toggle('selected-edge',state.selectedEdge===button.dataset.edge);button.setAttribute('aria-pressed',String(state.selectedEdge===button.dataset.edge));button.title=`${cut?'Marked seam':'Joined edge'} · ${button.textContent}`;}
 $('#seam-count').textContent=`${cuts.size} of 12 seams marked on ${currentPart().name}`;
 $('#selected-edge-label').textContent=state.selectedEdge?`${currentPart().name} · ${edgeName(EDGES.find(edge=>edge.key===state.selectedEdge))}`:'Select an edge in 3D or below';
 for(const item of cubeEdges){item.mesh.material.color.set(state.model==='cube'&&state.selectedEdge===item.key?'#ffbf00':state.cuts.cube.get('cube').has(item.key)?'#fb6b65':'#79a6ed');item.mesh.material.opacity=1;}
 for(const item of chairEdges){item.mesh.material.color.set(state.model==='chair'&&item.part===state.activePart&&state.selectedEdge===item.key?'#ffbf00':state.cuts.chair.get(item.part).has(item.key)?'#fb6b65':'#79a6ed');item.mesh.material.opacity=item.part===state.activePart?1:.25;}
 const active=state.model==='cube'?Object.entries(PRESETS).find(([,preset])=>preset.size===cuts.size&&[...preset].every(key=>cuts.has(key)))?.[0]:null;
 document.querySelectorAll('[data-preset]').forEach(button=>{button.classList.toggle('active',button.dataset.preset===active);button.setAttribute('aria-pressed',String(button.dataset.preset===active));});dirty=true;
}
function unwrap(message){
 animation++;const result=buildCharts(state.model,state.cuts[state.model]);state.charts=result.charts;state.invalid=result.invalid;
 if(!state.invalid)packCharts(state.charts,{margin:.32});
 if(state.model==='cube'){
  state.layout=buildLayout(currentCuts());if(state.layout.valid&&previewReady){makeCubeRig(state.layout);$('#fold').disabled=false;$('#animate').disabled=false;}else{$('#fold').disabled=true;$('#animate').disabled=true;}
  updateFold(1);
 }
 const fallback=state.model==='cube'?'cube:F':'seat:T';if(!state.charts.some(chart=>chart.faces.some(face=>face.key===state.selected)))state.selected=fallback;
 updateEdgeStyles();renderMap();
 if(state.invalid){const {part,layout}=state.invalid;setStatus(layout.cycle?`${part.name} is still closed. Mark another seam, then Unwrap.`:`${part.name} would overlap in 2D. Change the seams, then Unwrap.`,true);}
 else setStatus(message||`Unwrapped into ${state.charts.length} island${state.charts.length===1?'':'s'}. Select a face to trace it between 3D and 2D.`);
}
function markSelected(mark){
 if(!state.selectedEdge){setStatus('Select an edge in the 3D view or edge list first.',true);return;}
 const cuts=currentCuts();mark?cuts.add(state.selectedEdge):cuts.delete(state.selectedEdge);updateEdgeStyles();setStatus(`${mark?'Marked':'Cleared'} seam on ${currentPart().name}: ${edgeName(EDGES.find(edge=>edge.key===state.selectedEdge))}. Choose Unwrap to update the UV map.`);
}
function runCommand(command){
 closeMenu();
 if(command==='mark')markSelected(true);
 if(command==='clear')markSelected(false);
 if(command==='unwrap')unwrap();
 if(command==='cube-project'){for(const part of MODELS[state.model])state.cuts[state.model].set(part.id,new Set(EDGES.map(edge=>edge.key)));unwrap('Cube Projection: every box face has its own UV island. Compare it with a seam-based net.');}
 if(command==='reset'){state.cuts[state.model]=defaultCuts(state.model);state.selectedEdge=null;unwrap('Seams reset to the starting paper nets.');}
}
function closeMenu(){const menu=$('#u-menu');menu.hidden=true;$('#u-trigger').setAttribute('aria-expanded','false');}
$('#u-trigger').addEventListener('click',()=>{const menu=$('#u-menu');menu.hidden=!menu.hidden;$('#u-trigger').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('button')?.focus();});
$('#u-menu').addEventListener('click',event=>{const button=event.target.closest('[data-command]');if(button)runCommand(button.dataset.command);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();return;}if(event.key.toLowerCase()==='u'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){event.preventDefault();$('#u-trigger').click();}});
document.addEventListener('click',event=>{if(!event.target.closest('.u-menu-wrap'))closeMenu();});
$('#average-scale').addEventListener('click',()=>{if(state.invalid)return;averageIslandScale(state.charts);renderMap();setStatus('Average Island Scale: each island now has the same relative texture density. The preview was refitted; in Blender you can use Pack Islands afterward.');});
$('#pack-islands').addEventListener('click',()=>{if(state.invalid)return;packCharts(state.charts,{margin:.09});renderMap();setStatus('Pack Islands: the islands have moved closer together inside the 0–1 image square. Their relative scale is preserved.');});
$('#stretch-display').addEventListener('change',event=>{state.stretchDisplay=event.target.value;renderMap();setStatus(state.stretchDisplay==='none'?'Stretch overlay off.':`Display Stretch: ${state.stretchDisplay==='angle'?'Angle compares corner shapes':'Area compares texture density across faces'}. Blue is low, red is high.`);});
$('#stretch-u').addEventListener('input',event=>{const chart=selectedChart();if(!chart)return;chart.stretchU=Number(event.target.value);packCharts(state.charts,{margin:.09});renderMap();setStatus(`Stretched the selected island horizontally to ${chart.stretchU.toFixed(2)}×. Try Angle and Area in Display Stretch.`);});
$('#reset-stretch').addEventListener('click',()=>{const chart=selectedChart();if(!chart)return;chart.stretchU=1;chart.stretchV=1;packCharts(state.charts,{margin:.09});renderMap();setStatus('Selected island shape restored.');});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{state.cuts.cube.set('cube',new Set(PRESETS[button.dataset.preset]));state.selectedEdge=null;unwrap();}));
document.querySelectorAll('[data-model]').forEach(button=>button.addEventListener('click',()=>switchModel(button.dataset.model)));
$('#part-select').addEventListener('change',event=>{state.activePart=event.target.value;state.selectedEdge=null;renderEdgeList();updateEdgeStyles();setStatus(`${currentPart().name} selected. Choose an edge to mark or clear its seam.`);});
$('#animate').addEventListener('click',()=>animateTo(state.fold>.5?0:1));
$('#fold').addEventListener('input',event=>{animation++;updateFold(Number(event.target.value)/100);});

function switchModel(model){
 if(state.model===model)return;animation++;state.model=model;state.activePart=model==='cube'?'cube':'seat';state.selected=model==='cube'?'cube:F':'seat:T';state.selectedEdge=null;
 document.querySelectorAll('[data-model]').forEach(button=>{button.classList.toggle('active',button.dataset.model===model);button.setAttribute('aria-pressed',String(button.dataset.model===model));});
 $('#object-title').textContent=model==='cube'?'The 3D cube':'The 3D chair';$('#viewer-tip').textContent='Drag to turn · Click an edge to select';
 $('#fold-controls').hidden=model!=='cube';$('#chair-hint').hidden=model!=='chair';$('#preset-section').hidden=model!=='cube';$('#part-select').hidden=model!=='chair';
 if(rig)rig.visible=model==='cube';if(chairGroup)chairGroup.visible=model==='chair';
 cubeEdges.forEach(item=>item.mesh.visible=model==='cube'&&state.fold>.96);cubeHits.forEach(item=>item.visible=model==='cube'&&state.fold>.96);
 chairEdges.forEach(item=>item.mesh.visible=model==='chair');chairHits.forEach(item=>item.visible=model==='chair');
 if(camera&&controls){controls.enabled=true;controls.target.set(0,model==='cube'?0:1.45,0);camera.position.copy(model==='cube'?cubeView:chairView);controls.update();}
 const select=$('#part-select');if(model==='chair'){select.replaceChildren(...MODELS.chair.map(part=>{const option=document.createElement('option');option.value=part.id;option.textContent=part.name;return option;}));select.value='seat';}
 renderEdgeList();unwrap(model==='cube'?'Cube ready. Select an edge and press U.':'Chair ready. Its six separate box parts create UV islands of very different physical sizes.');dirty=true;
}

function makeCube3D(){
 for(const id of FACE_ORDER){const material=new THREE.MeshStandardMaterial({map:faceTexture(id,MODELS.cube[0]),side:THREE.DoubleSide,roughness:1});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.userData.face=`cube:${id}`;
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.8,1.8)),new THREE.LineBasicMaterial({color:0xffbf00}));outline.position.z=.02;outline.visible=false;mesh.add(outline);mesh.userData.selectionOutline=outline;cubeFaceMeshes[id]=mesh;
 }
 const cylinder=new THREE.CylinderGeometry(1,1,1,10),axisY=new THREE.Vector3(0,1,0);
 for(const edge of EDGES){const a=V3(FACES[edge.a].n),b=V3(FACES[edge.b].n),direction=new THREE.Vector3().crossVectors(a,b).normalize(),center=a.add(b);
  const mesh=new THREE.Mesh(cylinder,new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true}));mesh.position.copy(center);mesh.quaternion.setFromUnitVectors(axisY,direction);mesh.scale.set(.035,2.05,.035);mesh.renderOrder=8;scene.add(mesh);cubeEdges.push({key:edge.key,mesh});
  const hit=new THREE.Mesh(cylinder,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(center);hit.quaternion.copy(mesh.quaternion);hit.scale.set(.13,2.05,.13);hit.userData.edge=edge.key;scene.add(hit);cubeHits.push(hit);
 }
}

function makeChair3D(){
 chairGroup=new THREE.Group();scene.add(chairGroup);chairGroup.visible=false;
 const cylinder=new THREE.CylinderGeometry(1,1,1,10),axisY=new THREE.Vector3(0,1,0);
 for(const part of MODELS.chair){
  const root=new THREE.Group();root.position.set(...part.position);chairGroup.add(root);
  for(const id of FACE_ORDER){const basis=FACES[id],size=[basis.u,basis.v].map(axis=>axis.reduce((sum,n,i)=>sum+Math.abs(n)*part.size[i],0)),depth=basis.n.reduce((sum,n,i)=>sum+Math.abs(n)*part.size[i],0)/2;
   const material=new THREE.MeshStandardMaterial({map:faceTexture(id,part),side:THREE.DoubleSide,roughness:1});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...size),material);mesh.position.copy(V3(basis.n).multiplyScalar(depth+.003));mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(basis.u),V3(basis.v),V3(basis.n)));
   mesh.userData.face=`${part.id}:${id}`;const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(Math.max(.01,size[0]-.035),Math.max(.01,size[1]-.035))),new THREE.LineBasicMaterial({color:0xffbf00,depthTest:false}));outline.position.z=.015;outline.visible=false;mesh.add(outline);mesh.userData.selectionOutline=outline;root.add(mesh);chairFaceMeshes[mesh.userData.face]=mesh;
  }
  for(const edge of EDGES){const a=V3(FACES[edge.a].n),b=V3(FACES[edge.b].n),direction=new THREE.Vector3().crossVectors(a,b).normalize(),center=new THREE.Vector3();for(let i=0;i<3;i++)center.setComponent(i,(a.getComponent(i)+b.getComponent(i))*part.size[i]/2);
   const length=Math.abs(direction.x)*part.size[0]+Math.abs(direction.y)*part.size[1]+Math.abs(direction.z)*part.size[2];
   const material=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true});const mesh=new THREE.Mesh(cylinder,material);mesh.position.copy(center);mesh.quaternion.setFromUnitVectors(axisY,direction);mesh.scale.set(.018,length+.015,.018);mesh.renderOrder=8;root.add(mesh);chairEdges.push({key:edge.key,part:part.id,mesh});
   const hit=new THREE.Mesh(cylinder,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(center);hit.quaternion.copy(mesh.quaternion);hit.scale.set(.07,length+.06,.07);hit.userData.edge=edge.key;hit.userData.part=part.id;root.add(hit);chairHits.push(hit);
  }
 }
}

function start3D(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x242a31,0);host.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive 3D object. Drag to orbit; click an edge to select it.');renderer.domElement.setAttribute('role','img');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.copy(cubeView);scene.add(new THREE.AmbientLight(0xffffff,2.1));const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(4,6,7);scene.add(light);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.enableZoom=false;renderer.domElement.style.touchAction=matchMedia('(max-width:760px)').matches?'pan-y':'none';controls.addEventListener('change',()=>dirty=true);controls.addEventListener('end',()=>{if(state.model==='cube'&&state.fold>.97)cubeView.copy(camera.position);if(state.model==='chair')chairView.copy(camera.position);});controls.update();
  makeCube3D();makeChair3D();const raycaster=new THREE.Raycaster(),point=new THREE.Vector2(),cubeGuard=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());let down;
  renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
   if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>6){down=null;return;}down=null;
   const rect=renderer.domElement.getBoundingClientRect();point.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(point,camera);
   if(state.model==='cube'){
    const face=raycaster.intersectObjects(Object.values(cubeFaceMeshes),false)[0];
    if(state.fold>.97){const edge=raycaster.intersectObjects(cubeHits)[0],surface=raycaster.intersectObject(cubeGuard,false)[0];if(edge&&(!surface||edge.distance<surface.distance+.17)){selectEdge(edge.object.userData.edge);return;}}
    if(face)selectFace(face.object.userData.face);
   }else{
    const face=raycaster.intersectObjects(Object.values(chairFaceMeshes),false)[0],edge=raycaster.intersectObjects(chairHits)[0];
    if(edge&&(!face||edge.distance<face.distance+.09)){selectEdge(edge.object.userData.edge,edge.object.userData.part);return;}
    if(face)selectFace(face.object.userData.face);
   }
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('#canvas-hint').textContent='The 3D view paused. Reload this page to restore it.';$('#canvas-hint').hidden=false;});
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}).observe(host);
  previewReady=true;$('#canvas-hint').hidden=true;renderEdgeList();unwrap('Select an edge, press U to mark a seam, then Unwrap to update the UV map.');selectFace('cube:F',false);
  function frame(){requestAnimationFrame(frame);if(document.hidden)return;controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}}frame();
 }catch(error){previewReady=false;$('#canvas-hint').textContent='3D preview unavailable in this browser. The UV layout and edge tools still work.';console.error('3D preview failed',error);renderEdgeList();unwrap();}
}
start3D();
