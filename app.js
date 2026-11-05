import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {TransformControls} from './vendor/TransformControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createAppearance} from './appearance.js?v=3';
import {zipSync, strToU8} from './vendor/fflate.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#293b4e');
const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
stage.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45, 1, 0.005, 30);
const orbit = new OrbitControls(camera, renderer.domElement);
const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.65);
scene.add(transform);
transform.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
transform.addEventListener('objectChange', updateFields);
scene.add(new THREE.HemisphereLight(0xe6f5ff, 0x434348, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(0.5, 2.5, 2); scene.add(key);
const fill = new THREE.PointLight(0xffffff, 0.15, 4);
fill.position.set(0, 1.2, 0); scene.add(fill);
const loader = new GLTFLoader();
const catalog = {
  plate:{label:'96 孔板', file:'plate_costar_measured.glb', axis:'x', size:0.124, calibrated:true},
  tips:{label:'枪头盒', file:'tips_structured.glb', axis:'x', size:0.125},
  bottle:{label:'瓶子', file:'bottle_inferred_textured.glb', axis:'y', size:0.18},
  rack:{label:'移液管架', file:'rack.glb', axis:'x', size:0.30},
  pipette:{label:'25 mL 移液管', file:'pipette.glb', axis:'y', size:0.31}
};
let objects = [], selected = null, cabinet, tableY = 0.625, busy = false, nextId = 1;
let cabinetNormalization, cabinetMixer, cabinetClip;
let sashFraction=0.65;
function setSash(value){sashFraction=THREE.MathUtils.clamp(value,0,1);if(cabinetMixer)cabinetMixer.setTime(sashFraction*59/24);$('sash').value=Math.round(sashFraction*100);}
const grid = new THREE.GridHelper(1.15, 23, 0x5eaeb6, 0x487382);
grid.position.y = tableY + 0.002; grid.scale.z = 0.43; scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8,8), new THREE.MeshStandardMaterial({color:0x465362,roughness:1}));
floor.rotation.x = -Math.PI/2; floor.position.y = -0.002; scene.add(floor);
const boxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x8ee3eb);
boxHelper.visible = false; scene.add(boxHelper);
const appearance = createAppearance({scene,renderer,key,fill,floor,objects:()=>objects});
grid.visible=false;

function resize() {
  if (busy) return;
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
function workView() {camera.position.set(0.48,tableY+0.33,1.08); orbit.target.set(0,tableY+0.10,0); orbit.update();}
function wholeView() {camera.position.set(2.3,1.8,3.0); orbit.target.set(0,0.95,0); orbit.update();}
workView(); resize();
renderer.setAnimationLoop(() => {
  if (busy) return;
  if (selected) boxHelper.setFromObject(selected);
  renderer.render(scene,camera);
});
function status(text) {$('status').textContent = text;}
function select(object) {
  selected = object;
  if (object) transform.attach(object); else transform.detach();
  boxHelper.visible = !!object && $('guides').checked;
  $('selected').textContent = object ? object.userData.label : '选择一个器材';
  renderList(); updateFields();
}
function renderList() {
  $('objects').replaceChildren();
  for (const object of objects) {
    const button = document.createElement('button');
    button.className = 'object' + (object===selected ? ' active':'');
    button.textContent = object.userData.label;
    button.onclick = () => select(object);
    $('objects').append(button);
  }
}
for (const type of ['position','rotation','scale']) {
  for (const axis of ['x','y','z']) {
    const label = document.createElement('span'); label.textContent = axis.toUpperCase();
    const input = document.createElement('input'); input.type='number'; input.step=type==='rotation'?'1':'0.01';
    input.id=type+'-'+axis;
    input.onchange = () => {
      if (!selected) return;
      const value = Number(input.value);
      if (!Number.isFinite(value) || (type==='scale' && value<=0)) return updateFields();
      selected[type][axis] = type==='rotation' ? THREE.MathUtils.degToRad(value) : value;
      updateFields();
    };
    $(type).append(label,input);
  }
}
function updateFields() {
  for (const type of ['position','rotation','scale']) for (const axis of ['x','y','z']) {
    const input = $(type+'-'+axis); input.disabled=!selected;
    if (!selected) input.value='';
    if (selected) input.value=(type==='rotation'?THREE.MathUtils.radToDeg(selected[type][axis]):selected[type][axis]).toFixed(type==='rotation'?1:4);
  }
  if (!selected) { $('dimensions').textContent=''; return; }
  selected.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(selected).getSize(new THREE.Vector3());
  $('dimensions').textContent='世界包围盒（X / Y / Z） '+size.toArray().map(v=>(v*1000).toFixed(1)).join(' / ')+' mm';
}
function drop(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  object.position.y += tableY - bounds.min.y;
  updateFields();
}
async function addObject(kind, pose=null) {
  const spec=catalog[kind]; if (!spec) throw new Error('未知模型 '+kind);
  status('加载 '+spec.label+'…');
  const gltf = await loader.loadAsync('assets/'+spec.file);
  const model=gltf.scene;
  const raw=new THREE.Box3().setFromObject(model);
  const size=raw.getSize(new THREE.Vector3());
  const factor=spec.calibrated?1:spec.size/size[spec.axis];
  const center=raw.getCenter(new THREE.Vector3());
  model.scale.multiplyScalar(factor);
  model.position.set(-center.x*factor,-raw.min.y*factor,-center.z*factor);
  const object=new THREE.Group(); object.add(model);
  object.userData={kind,id:nextId,label:spec.label+' '+nextId, normalization:{uniformScale:factor,translation:model.position.toArray()},metricBasis:spec.calibrated?'user_measured':'assumed_size'};
  nextId++;
  if (pose) {
    object.position.fromArray(pose.position); object.quaternion.fromArray(pose.quaternion); object.scale.fromArray(pose.scale);
    object.userData.id=pose.id; object.userData.label=pose.label; nextId=Math.max(nextId,pose.id+1);
  } else object.position.set((objects.length%3-1)*0.22,tableY,0.04);
  appearance.addObject(object,kind);
  scene.add(object); objects.push(object); select(object);
  status('就绪 · 可拖动坐标轴或输入三维坐标');
  return object;
}
const raycaster=new THREE.Raycaster();
let down;
renderer.domElement.addEventListener('pointerdown', e => {down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup', e => {
  if (busy || transform.axis || !down || Math.hypot(e.clientX-down[0],e.clientY-down[1])>4) return;
  const rect=renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hits=raycaster.intersectObjects(objects,true);
  if (hits.length) {let obj=hits[0].object; while (obj.parent && !objects.includes(obj)) obj=obj.parent; select(obj);}
});
function setMode(mode) {transform.setMode(mode);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
window.addEventListener('keydown',e=>{if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;const mode={w:'translate',e:'rotate',r:'scale'}[e.key.toLowerCase()];if(mode)setMode(mode);});
function run(action) {return async()=>{if(busy)return;try{await action();}catch(e){status('操作失败：'+e.message);console.error(e);}};}
$('add').onclick=run(()=>addObject($('asset').value));
$('duplicate').onclick=run(async()=>{if(!selected)return;const data=serializeObject(selected);data.id=nextId++;data.label=selected.userData.label+' 副本';data.position[0]+=0.08;await addObject(data.kind,data);});
$('remove').onclick=()=>{if(!selected||busy)return;scene.remove(selected);objects=objects.filter(o=>o!==selected);select(null);};
$('drop').onclick=()=>{if(selected)drop(selected);};
$('guides').onchange=()=>{grid.visible=$('guides').checked;boxHelper.visible=!!selected&&grid.visible;};
$('sash').oninput=()=>setSash(Number($('sash').value)/100);
$('appearance').onchange=()=>appearance.apply($('appearance').value==='studio');
$('cleanView').onclick=()=>{select(null);grid.visible=false;$('guides').checked=false;};
$('workView').onclick=workView; $('wholeView').onclick=wholeView;
$('detailView').onclick=()=>{camera.position.set(0.32,tableY+0.40,0.65);orbit.target.set(0,tableY+0.05,0);orbit.update();};
$('fov').onchange=()=>{camera.fov=THREE.MathUtils.clamp(Number($('fov').value)||45,15,100);camera.updateProjectionMatrix();};
$('exposure').oninput=()=>renderer.toneMappingExposure=Number($('exposure').value);
function serializeObject(object) {
  object.updateMatrixWorld(true);
  return {...object.userData, file:catalog[object.userData.kind].file,position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray(),matrixWorld:object.matrixWorld.toArray()};
}
function snapshot() {
  camera.updateMatrixWorld(true);
  return {appearance:appearance.settings(),version:1,units:'meters',axes:'right-handed, Y up',matrixLayout:'column-major',tableY,cabinet:{file:'hood_user_20261104.glb',normalization:cabinetNormalization,assumedWidth:1.3,heightFromSourceAspect:1.6016379,sashFraction,source:'通风橱_双模块_玻璃轨迹修正(1).blend'},objects:objects.map(serializeObject),camera:{position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov},exposure:renderer.toneMappingExposure};
}
function download(data,name,type) {
  const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('save').onclick=()=>download(JSON.stringify(snapshot(),null,2),'lab_scene.json','application/json');
$('load').onclick=()=>$('loadFile').click();
$('loadFile').onchange=run(async()=>{
  const file=$('loadFile').files[0];if(!file)return;
  const data=JSON.parse(await file.text());
  if(data.version!==1||!Array.isArray(data.objects)||data.objects.length>40)throw new Error('场景格式或物体数量不支持');
  for(const o of data.objects){if(!catalog[o.kind]||![o.position,o.quaternion,o.scale].every(a=>Array.isArray(a)&&a.every(Number.isFinite))||o.position.length!==3||o.quaternion.length!==4||o.scale.length!==3||o.scale.some(v=>v<=0))throw new Error('物体位姿无效');}
  if(!data.camera || ![data.camera.position,data.camera.target].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)) || !Number.isFinite(data.camera.fov) || data.camera.fov<15 || data.camera.fov>100 || !Number.isFinite(data.exposure)) throw new Error('相机参数无效');
  if(new Set(data.objects.map(o=>o.id)).size!==data.objects.length)throw new Error('物体标识重复');
  const offsetY=Number.isFinite(data.tableY)?tableY-data.tableY:0;
  for(const o of data.objects)o.position[1]+=offsetY;
  const old=[...objects];
  try {for(const o of data.objects)await addObject(o.kind,o);}catch(e){for(const o of objects.filter(o=>!old.includes(o)))scene.remove(o);objects=old;select(old[0]||null);throw e;}
  old.forEach(o=>scene.remove(o));objects=objects.filter(o=>!old.includes(o));select(objects[0]||null);
  camera.position.fromArray(data.camera.position);orbit.target.fromArray(data.camera.target);camera.fov=data.camera.fov;camera.updateProjectionMatrix();orbit.update();
  setSash(Number.isFinite(data.cabinet?.sashFraction)?data.cabinet.sashFraction:.65);
  appearance.apply(data.appearance?.preset!=='original_materials');
  $('appearance').value=data.appearance?.preset==='original_materials'?'original':'studio';
  renderer.toneMappingExposure=data.exposure; $('exposure').value=data.exposure;$('fov').value=camera.fov;
});
function annotations(width,height) {
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const fy=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2));
  return {cabinet:snapshot().cabinet,tableY,appearance:appearance.settings(),exposure:renderer.toneMappingExposure,width,height,K:[[fy,0,width/2],[0,fy,height/2],[0,0,1]],cameraConvention:'OpenGL camera looks -Z, +Y up; matrices column-major',cameraToWorld:camera.matrixWorld.toArray(),worldToCamera:camera.matrixWorldInverse.toArray(),objects:objects.map(o=>{
    const b=new THREE.Box3().setFromObject(o);const points=[];
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z));
    const inFront=points.every(p=>p.clone().applyMatrix4(camera.matrixWorldInverse).z<0);
    const pixels=points.map(p=>p.project(camera)).map(p=>[(p.x+1)*width/2,(1-p.y)*height/2]);
    return {...serializeObject(o),boundsWorld:[b.min.toArray(),b.max.toArray()],bbox2dUnclipped:inFront?[Math.min(...pixels.map(p=>p[0])),Math.min(...pixels.map(p=>p[1])),Math.max(...pixels.map(p=>p[0])),Math.max(...pixels.map(p=>p[1]))]:null,bboxDefinition:'projected world AABB, includes occluded areas; null when crosses camera plane'};
  })};
}
async function exportDataset(count) {
  if(busy)return;busy=true;orbit.enabled=false;
  const lockedControls=[...document.querySelectorAll('button,input,select')].map(element=>({element,disabled:element.disabled}));
  lockedControls.forEach(({element})=>element.disabled=true);
  const initial=snapshot();const files={};const width=Number($('resolution').value),height=width*3/4;
  const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),aspect:camera.aspect,grid:grid.visible,box:boxHelper.visible,controls:transform.visible};
  try {
    transform.visible=false;grid.visible=false;boxHelper.visible=false;renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    for(let i=0;i<count;i++){
      if(count>1){const angle=-0.48+0.96*i/(count-1);camera.position.set(Math.sin(angle)*0.95,tableY+0.4,Math.cos(angle)*0.95);camera.lookAt(0,tableY+0.08,0);}
      renderer.render(scene,camera);
      const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('PNG 导出失败');
      const stem=String(i).padStart(4,'0');files['rgb/'+stem+'.png']=new Uint8Array(await blob.arrayBuffer());files['annotations/'+stem+'.json']=strToU8(JSON.stringify(annotations(width,height),null,2));
      $('progress').textContent=`已渲染 ${i+1} / ${count}`;await new Promise(resolve=>setTimeout(resolve,20));
    }
    files['scene.json']=strToU8(JSON.stringify(initial,null,2));
    files['README.txt']=strToU8('RGB and camera/object poses. Units meters. Y-up right-handed. Matrices column-major. Model normalization is recorded in scene.json; apply normalization to source GLB before object matrixWorld. 2D boxes are projected world AABBs, not visibility masks. Uncalibrated model dimensions remain assumed. No rigid-body or fluid dynamics. Cabinet is the user Blender asset, uniformly scaled to assumed 1.3 m width; original geometry and sash animation retained.');
    download(zipSync(files,{level:0}),'lab_dataset_'+Date.now()+'.zip','application/zip');
    $('progress').textContent=`完成 ${count} 张图像及对应标注，已生成 ZIP`;
  } finally {
    camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.aspect=saved.aspect;camera.updateProjectionMatrix();grid.visible=saved.grid;boxHelper.visible=saved.box;transform.visible=saved.controls;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));busy=false;orbit.enabled=true;resize();
    lockedControls.forEach(({element,disabled})=>element.disabled=disabled);
  }
}
$('render').onclick=run(()=>exportDataset(1));
$('batch').onclick=run(()=>exportDataset(Math.max(2,Math.min(36,Number($('count').value)||8))));
async function init(){
  const gltf=await loader.loadAsync('assets/hood_user_20261104.glb');
  cabinet=gltf.scene;
  tableY=0.62993;
  cabinetNormalization={scale:[1,1,1],translation:[0,0,0],note:'GLB already aligned Y-up and uniformly scaled; width 1.3 m is a display assumption; see instruction.md'};
  cabinetClip=gltf.animations[0];
  if(cabinetClip){cabinetMixer=new THREE.AnimationMixer(cabinet);cabinetMixer.clipAction(cabinetClip).play();setSash(sashFraction);}
  scene.add(cabinet);grid.position.y=tableY+0.002;
  appearance.setupCabinet(cabinet,tableY);
  const plate=await addObject('plate');plate.position.set(-0.13,tableY,0.05);
  const tips=await addObject('tips');tips.position.set(0.15,tableY,-0.04);
  workView();select(plate);status('就绪 · 孔板与枪头盒已放入安全柜');
  window.labStudio={scene,camera,objects:()=>objects,addObject,select,snapshot,annotations,exportDataset,cabinet,setSash,ready:true};
}
init().catch(e=>{status('加载失败：'+e.message);console.error(e);});
