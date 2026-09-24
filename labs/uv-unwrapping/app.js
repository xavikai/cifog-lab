import * as THREE from 'three';
import {OrbitControls} from '../../vendor/OrbitControls.js';
import {FACES,FACE_ORDER,EDGES,PRESETS,edgeKey,buildLayout} from './unfold.js';

const $=selector=>document.querySelector(selector);
const ns='http://www.w3.org/2000/svg';
const state={cuts:new Set(PRESETS.classic),layout:null,selected:'F',selectedEdge:null,fold:1};
const host=$('#viewer'),svgFaces=$('#uv-faces'),edgeList=$('#edge-list');
let renderer,scene,camera,controls,rig,rigRoots=[],hinges=[],faceMeshes={},edgeMeshes=[],edgeHits=[],flatScale=1,dirty=true,animation=0,previewReady=false;
const cubeView=new THREE.Vector3(4.2,3.0,5.4),flatView=new THREE.Vector3(0,0,8.4);
const V3=a=>new THREE.Vector3(...a);
const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
const S=(tag,attrs={})=>{const element=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));return element;};

function faceTexture(id){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),face=FACES[id];
 ctx.fillStyle=face.color;ctx.fillRect(0,0,512,512);
 for(let y=0;y<6;y++)for(let x=0;x<6;x++){ctx.fillStyle=(x+y)%2?'#15243217':'#ffffff21';ctx.fillRect(x*512/6,y*512/6,512/6,512/6);}
 ctx.strokeStyle='#18243155';ctx.lineWidth=10;ctx.strokeRect(6,6,500,500);
 ctx.fillStyle='#f9faf0db';ctx.fillRect(44,198,424,116);
 ctx.textAlign='center';ctx.fillStyle='#202831';ctx.font='bold 62px Arial';ctx.fillText(face.name.toUpperCase(),256,270);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function addCubeEdges(){
 const cylinder=new THREE.CylinderGeometry(1,1,1,10),axisY=new THREE.Vector3(0,1,0);
 for(const edge of EDGES){
  const a=V3(FACES[edge.a].n),b=V3(FACES[edge.b].n),direction=new THREE.Vector3().crossVectors(a,b).normalize(),center=a.add(b);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false});
  const visible=new THREE.Mesh(cylinder,material);visible.position.copy(center);visible.quaternion.setFromUnitVectors(axisY,direction);visible.scale.set(.035,2.05,.035);visible.renderOrder=8;visible.userData.edge=edge.key;scene.add(visible);edgeMeshes.push(visible);
  const hit=new THREE.Mesh(cylinder,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(center);hit.quaternion.copy(visible.quaternion);hit.scale.set(.13,2.05,.13);hit.userData.edge=edge.key;scene.add(hit);edgeHits.push(hit);
 }
}

function makeRig(layout){
 if(rig)scene.remove(rig);
 rig=new THREE.Group();scene.add(rig);rigRoots=[];hinges=[];
 const bounds=layout.bounds,mid=[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2];
 flatScale=3.8/Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
 const frames={};
 for(const component of layout.components){
  const root=component.root,flat=layout.faces[root],basis=FACES[root],rootGroup=new THREE.Group();
  const cubeQuaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(basis.u),V3(basis.v),V3(basis.n)));
  rootGroup.add(faceMeshes[root]);rig.add(rootGroup);frames[root]=rootGroup;
  rigRoots.push({group:rootGroup,flat:new THREE.Vector3(flat.center[0]-mid[0],flat.center[1]-mid[1],0),cube:V3(basis.n),quaternion:cubeQuaternion});
  for(const id of component.ids.slice(1)){
   const info=layout.faces[id],parent=frames[info.parent],parentInfo=layout.faces[info.parent];
   const hinge=new THREE.Group();hinge.position.set(info.side[0],info.side[1],0);parent.add(hinge);
   const frame=new THREE.Group();frame.position.set(info.side[0],info.side[1],0);
   frame.rotation.z=Math.atan2(dot2(info.U,parentInfo.V),dot2(info.U,parentInfo.U));
   hinge.add(frame);frame.add(faceMeshes[id]);frames[id]=frame;
   hinges.push({group:hinge,axis:V3(info.axis)});
  }
 }
 updateFold(state.fold);
}

function updateFold(amount){
 state.fold=amount;$('#fold').value=Math.round(amount*100);$('#animate').innerHTML=amount>.5?'Unfold the cube <span aria-hidden="true">↘</span>':'Fold back into 3D <span aria-hidden="true">↗</span>';
 if(rig){rig.scale.setScalar(THREE.MathUtils.lerp(flatScale,1,amount));for(const root of rigRoots){root.group.position.copy(root.flat).lerp(root.cube,amount);root.group.quaternion.identity().slerp(root.quaternion,amount);}for(const hinge of hinges)hinge.group.quaternion.setFromAxisAngle(hinge.axis,Math.PI/2*amount);}
 edgeMeshes.forEach(edge=>edge.visible=amount>.96);edgeHits.forEach(edge=>edge.visible=amount>.96);
 if(camera&&controls){camera.position.copy(flatView).lerp(cubeView,amount);controls.enabled=amount>.97;controls.target.set(0,0,0);controls.update();}
 dirty=true;
}

function animateTo(target){
 if(!state.layout?.valid)return;
 const from=state.fold,start=performance.now(),duration=900,run=++animation;
 function tick(now){if(run!==animation)return;const x=Math.min(1,(now-start)/duration),ease=x*x*(3-2*x);updateFold(from+(target-from)*ease);if(x<1)requestAnimationFrame(tick);}
 requestAnimationFrame(tick);
}

function svgFace(id,info,scale,mid){
 const cx=280+(info.center[0]-mid[0])*scale,cy=250-(info.center[1]-mid[1])*scale;
 const angle=-Math.atan2(info.U[1],info.U[0])*180/Math.PI,size=2*scale;
 const group=S('g',{class:`uv-face${state.selected===id?' active':''}`,transform:`translate(${cx} ${cy}) rotate(${angle})`,tabindex:0,role:'button','aria-label':`${FACES[id].name} face in UV layout`});
 group.dataset.face=id;
 group.append(S('rect',{class:'face-outline',x:-scale,y:-scale,width:size,height:size,fill:FACES[id].color}));
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)if((x+y)%2)group.append(S('rect',{x:-scale+x*size/4,y:-scale+y*size/4,width:size/4,height:size/4,fill:'#fff','fill-opacity':'.14','pointer-events':'none'}));
 const letter=S('text',{class:'face-letter',x:0,y:scale<39?2:6,'font-size':Math.min(31,scale*.74)});letter.textContent=id;group.append(letter);
 if(scale>=40){const name=S('text',{class:'face-name',x:0,y:scale*.55,'font-size':Math.min(15,scale*.3)});name.textContent=FACES[id].name;group.append(name);}
 group.addEventListener('click',()=>selectFace(id));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectFace(id);}});
 return group;
}

function renderMap(){
 svgFaces.replaceChildren();const layout=state.layout;
 const empty=$('#map-empty');
 if(!layout.valid){empty.hidden=false;empty.textContent=layout.cycle?'This surface is still closed. Cut another blue edge to open the loop.':'These faces would overlap. Move or add a cut to make a clear net.';$('#island-count').textContent='No flat paper net yet';return;}
 empty.hidden=true;const b=layout.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY,scale=Math.min(420/w,420/h),mid=[(b.minX+b.maxX)/2,(b.minY+b.maxY)/2];
 for(const id of FACE_ORDER)svgFaces.append(svgFace(id,layout.faces[id],scale,mid));
 $('#island-count').textContent=`${layout.components.length} UV island${layout.components.length===1?'':'s'}`;
}

function setStatus(message,warning=false){$('#lesson-status').textContent=message;$('.status-box').classList.toggle('warning',warning);}
function selectFace(id,announce=true){state.selected=id;for(const [key,mesh] of Object.entries(faceMeshes)){mesh.material.emissive.set(key===id?'#72500c':'#000000');mesh.material.emissiveIntensity=key===id ? 0.28 : 0;mesh.userData.selectionOutline.visible=key===id;}renderMap();if(announce)setStatus(`${FACES[id].name} is the same face in 3D and in the UV layout. Its 2D position tells the texture where to appear.${id==='B'?' Its label turns with the face as the paper cube opens.':''}`);dirty=true;}
function updateEdgeStyles(){
 EDGES.forEach((edge,i)=>{const cut=state.cuts.has(edge.key),button=edgeList.querySelector(`[data-edge="${edge.key}"]`);button.classList.toggle('cut',cut);button.classList.toggle('selected-edge',state.selectedEdge===edge.key);button.setAttribute('aria-pressed',String(cut));button.title=`${cut?'Clear':'Mark'} seam: ${FACES[edge.a].name} / ${FACES[edge.b].name}`;edgeMeshes[i].material.color.set(cut?'#fb6b65':'#79a6ed');});
 $('#seam-count').textContent=`${state.cuts.size} of 12 edges cut`;
 const active=Object.entries(PRESETS).find(([,cuts])=>cuts.size===state.cuts.size&&[...cuts].every(key=>state.cuts.has(key)))?.[0];
 document.querySelectorAll('[data-preset]').forEach(button=>{button.classList.toggle('active',button.dataset.preset===active);button.setAttribute('aria-pressed',String(button.dataset.preset===active));});dirty=true;
}
function applyCuts(){
 animation++;state.layout=buildLayout(state.cuts);state.selectedEdge=null;updateEdgeStyles();renderMap();
 if(state.layout.valid){$('#fold').disabled=!previewReady;$('#animate').disabled=!previewReady;if(previewReady)makeRig(state.layout);updateFold(1);const count=state.layout.components.length;setStatus(count===1?'The seams open into one connected UV island. Unfold the cube to see how its faces lie on an image.':`${count} UV islands: more cuts have separated the surface into more pieces. Select a face to trace it between views.`);}
 else{$('#fold').disabled=true;$('#animate').disabled=true;updateFold(1);setStatus(state.layout.cycle?'These blue edges still make a closed loop. A rigid paper cube needs another cut before it can lie flat.':'Two faces would overlap on the image. Move or add a cut to give each face its own space.',true);}
}
function toggleEdge(key){const wasCut=state.cuts.has(key);wasCut?state.cuts.delete(key):state.cuts.add(key);applyCuts();state.selectedEdge=key;updateEdgeStyles();const edge=EDGES.find(item=>item.key===key),detail=$('#lesson-status').textContent;setStatus(`${wasCut?'Joined':'Cut'} ${FACES[edge.a].name} / ${FACES[edge.b].name}. ${detail}`,!state.layout.valid);}
for(const edge of EDGES){const button=document.createElement('button');button.type='button';button.dataset.edge=edge.key;button.textContent=`${FACES[edge.a].name} / ${FACES[edge.b].name}`;button.addEventListener('click',()=>toggleEdge(edge.key));edgeList.append(button);}
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{state.cuts=new Set(PRESETS[button.dataset.preset]);applyCuts();}));
$('#animate').addEventListener('click',()=>animateTo(state.fold>.5?0:1));
$('#fold').addEventListener('input',event=>{animation++;updateFold(Number(event.target.value)/100);});

function start3D(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x242a31,0);host.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive cube. Drag to orbit; click a red or blue edge to change its seam.');renderer.domElement.setAttribute('role','img');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.copy(cubeView);scene.add(new THREE.AmbientLight(0xffffff,2.1));const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(4,6,7);scene.add(light);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.enableZoom=false;controls.minDistance=4;controls.maxDistance=13;renderer.domElement.style.touchAction=matchMedia('(max-width:760px)').matches?'pan-y':'none';controls.addEventListener('change',()=>dirty=true);controls.addEventListener('end',()=>{if(state.fold>.97)cubeView.copy(camera.position);});controls.update();
  for(const id of FACE_ORDER){const material=new THREE.MeshStandardMaterial({map:faceTexture(id),side:THREE.DoubleSide,roughness:1,metalness:0});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.userData.face=id;
   const outline=new THREE.Group(),outlineMat=new THREE.MeshBasicMaterial({color:0xffbf00,depthTest:true});
   for(const side of [-.88,.88]){const horizontal=new THREE.Mesh(new THREE.BoxGeometry(1.78,.025,.015),outlineMat);horizontal.position.set(0,side,.02);outline.add(horizontal);const vertical=new THREE.Mesh(new THREE.BoxGeometry(.025,1.78,.015),outlineMat);vertical.position.set(side,0,.02);outline.add(vertical);}
   outline.visible=false;mesh.add(outline);mesh.userData.selectionOutline=outline;faceMeshes[id]=mesh;
  }
  addCubeEdges();const raycaster=new THREE.Raycaster(),point=new THREE.Vector2(),cubeGuard=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());let down;
  renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
   if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>6){down=null;return;}down=null;
   const rect=renderer.domElement.getBoundingClientRect();point.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(point,camera);
   const face=raycaster.intersectObjects(Object.values(faceMeshes),false)[0];
   if(state.fold>.97){const edge=raycaster.intersectObjects(edgeHits)[0],surface=raycaster.intersectObject(cubeGuard,false)[0];if(edge&&(!surface||edge.distance<surface.distance+.17)){toggleEdge(edge.object.userData.edge);return;}}
   if(face)selectFace(face.object.userData.face);
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('#canvas-hint').textContent='The 3D view paused. Reload this page to restore it.';$('#canvas-hint').hidden=false;});
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}).observe(host);
  previewReady=true;$('#canvas-hint').hidden=true;applyCuts();selectFace('F',false);
  function frame(){requestAnimationFrame(frame);if(document.hidden)return;controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}}frame();
 }catch(error){previewReady=false;$('#canvas-hint').textContent='3D preview unavailable in this browser. The UV layout and edge controls still work.';console.error('Cube preview failed',error);applyCuts();}
}
start3D();
