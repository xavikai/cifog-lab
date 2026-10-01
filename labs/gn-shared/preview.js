import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';

const material = (colour, roughness = .82) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: .06, side: THREE.DoubleSide });
const MAT = { cube: material(0xd6a56f), sphere: material(0x78b6d8), rock: material(0x9eabb0), tree: material(0x78b882), surface: material(0x729274), tube: material(0xd3a873), point: material(0xffbf00) };
export function createPreview(container) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x172329);
  const camera = new THREE.PerspectiveCamera(44, 1, .1, 150); camera.up.set(0, 0, 1); camera.position.set(8, -11, 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .07; controls.target.set(0, 0, .5); controls.maxDistance = 55;
  scene.add(new THREE.HemisphereLight(0xdceeff, 0x334442, 2.3));
  const light = new THREE.DirectionalLight(0xffebd4, 2.4); light.position.set(6, -4, 9); scene.add(light);
  const floor = new THREE.GridHelper(20, 20, 0x607076, 0x37494d); floor.rotation.x = Math.PI / 2; floor.position.z = -.04; scene.add(floor);
  const axes = new THREE.AxesHelper(1.1); axes.position.set(-4.4, -4.4, .02); scene.add(axes);
  let content = new THREE.Group(); scene.add(content);
  function size() { const w = Math.max(100, container.clientWidth), h = Math.max(100, container.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }
  const resize = new ResizeObserver(size); resize.observe(container); size();
  function meshFor(m) {
    let geo;
    if (m.kind === 'sphere') geo = new THREE.SphereGeometry(.5, 18, 12);
    else if (m.kind === 'rock') geo = new THREE.IcosahedronGeometry(.6, 0);
    else if (m.kind === 'tree') {
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, .8, 7), material(0x836045)); trunk.position.z = .4; trunk.rotation.x = Math.PI / 2; group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.2, 9), MAT.tree); crown.position.z = 1.25; crown.rotation.x = Math.PI / 2; group.add(crown);
      group.position.set(...m.position); group.scale.set(...m.size); group.rotation.z = m.rotationZ || 0; return group;
    } else if (m.kind === 'tube') {
      if (!m.path || m.path.length < 2) return null;
      geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(m.path.map(p => new THREE.Vector3(...p))), Math.max(8, m.path.length * 3), m.radius || .05, 8, false);
      const obj = new THREE.Mesh(geo, MAT.tube); obj.position.set(...m.position); return obj;
    } else geo = new THREE.BoxGeometry(1, 1, 1);
    const obj = new THREE.Mesh(geo, MAT[m.kind] || MAT.cube); obj.position.set(...m.position); obj.scale.set(...m.size); obj.rotation.z = m.rotationZ || 0; return obj;
  }
  function surfaceFor(s) {
    const vertices = [], indices = [];
    s.points.forEach(p => vertices.push(...p.position));
    for (let y = 0; y < s.ny - 1; y++) for (let x = 0; x < s.nx - 1; x++) { const a = y * s.nx + x, b = a + 1, c = a + s.nx, d = c + 1; indices.push(a, b, c, b, d, c); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, MAT.surface); mesh.material = MAT.surface; return mesh;
  }
  function update(result, resetCamera = false) {
    scene.remove(content); content.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    content = new THREE.Group(); scene.add(content);
    const g = result.geometry;
    g.surfaces.forEach(s => content.add(surfaceFor(s)));
    g.meshes.forEach(m => { const o = meshFor(m); if (o) content.add(o); });
    const marker = new THREE.SphereGeometry(.055, 8, 6);
    g.points.slice(0, 300).forEach(p => { const o = new THREE.Mesh(marker, MAT.point); o.position.set(...p.position); content.add(o); });
    g.curves.forEach(c => { if (c.points.length < 2) return; const geo = new THREE.BufferGeometry().setFromPoints(c.points.map(p => new THREE.Vector3(...p))); content.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffc450 }))); });
    if (resetCamera) { const box = new THREE.Box3().setFromObject(content), center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3()), span = box.isEmpty() ? 5 : Math.max(3, box.getSize(new THREE.Vector3()).length()); controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(span * .9, -span * 1.25, span * .85)); controls.update(); }
  }
  let running = true;
  function tick() { if (!running) return; requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); }
  tick();
  return { update, dispose() { running = false; resize.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); } };
}
