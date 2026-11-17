import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '../vendor/spark.module.js';

// Each scan has its own coordinate transform and camera history. Editable
// workcell meshes remain in world coordinates when the background changes.
export async function createLaboratoryEnvironment({scene,camera,orbit,floor,renderer,onWorkcellVisibility=()=>{}}) {
 const $=id=>document.getElementById(id),walls=[];
 scene.traverse(o=>{if(/^laboratory_wall|^wall_lower_panel|^wall_trim|^wall_skirting|^wall_joint_/.test(o.name))walls.push(o)});
 async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.json();}
 const config=await json('../scenes.json');
 const entries=new Map(config.scenes.map(def=>[def.id,{def,root:null,reference:null,cameras:null,load:null,referenceLoad:null,adjust:{x:0,y:0,z:0,yaw:0,scale:1},view:null,scanCamera:def.defaultCamera,scanOnly:def.id==='scene2'}]));
 const selector=$('environmentScene');
 for(const {def} of entries.values()){const option=document.createElement('option');option.value=def.id;option.textContent=def.label;selector.append(option);}
 scene.add(new SparkRenderer({renderer,enableLod:false}));camera.far=100;camera.updateProjectionMatrix();
 let active=null,getItems=()=>[],request=0;
 const matrixFor=e=>new THREE.Matrix4().compose(new THREE.Vector3(e.adjust.x,e.adjust.y,e.adjust.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(e.adjust.yaw)),new THREE.Vector3().setScalar(e.adjust.scale)).multiply(new THREE.Matrix4().fromArray(e.def.matrix));
 function rememberView(){return {position:camera.position.toArray(),target:orbit.target.toArray(),up:camera.up.toArray(),fov:camera.fov};}
 function applyView(v){camera.position.fromArray(v.position);orbit.target.fromArray(v.target);camera.up.fromArray(v.up||[0,1,0]);camera.fov=v.fov;$('fov').value=v.fov;camera.updateProjectionMatrix();orbit.update();}
 function visibility(){
  const on=$('showRoom').checked,compare=$('showCeiling').checked;
  for(const e of entries.values()){
   if(e.root)e.root.visible=e===active&&on&&(!compare||!e.def.reference);
   if(e.reference)e.reference.visible=e===active&&on&&compare;
  }
  floor.visible=!on;walls.forEach(o=>o.visible=!on);
  getItems().forEach(o=>{o.visible=o.isGridHelper?(!compare&&$('guides').checked):!compare;});
  onWorkcellVisibility(!compare);
 }
 function updateTransform(){if(!active)return;const m=matrixFor(active);for(const mesh of [active.root,active.reference])if(mesh){mesh.matrix.copy(m);mesh.matrixWorldNeedsUpdate=true;}}
 function syncControls(){
  selector.value=active.def.id;$('scanCamera').max=active.cameras.length-1;$('scanCamera').value=active.scanCamera;
  for(const key of ['x','y','z','yaw','scale'])$('background_'+key).value=active.adjust[key];
  $('environmentNote').textContent=active.def.registration;
  $('scanStatus').textContent=`${active.def.label} · ${active.cameras.length} 个机位 · 独立资产可编辑`;
 }
 async function load(e){
  if(!e.load)e.load=(async()=>{
   e.cameras=await json(e.def.cameras);
   if(!Array.isArray(e.cameras)||!e.cameras.length)throw Error('扫描机位为空');
   e.root=new SplatMesh({url:e.def.asset,enableLod:false});e.root.name='lab_background_'+e.def.id;e.root.visible=false;e.root.matrixAutoUpdate=false;e.root.matrix.copy(matrixFor(e));scene.add(e.root);
   await e.root.initialized;
  })().catch(error=>{if(e.root){scene.remove(e.root);e.root.dispose?.();e.root=null;}e.load=null;throw error;});
  await e.load;
 }
 function roomView(){
  if(!active)return;
  const idx=Math.max(0,Math.min(active.cameras.length-1,Number($('scanCamera').value)||0));active.scanCamera=idx;$('scanCamera').value=idx;
  const c=active.cameras[idx],r=c.rotation,m=matrixFor(active);
  camera.position.copy(new THREE.Vector3(...c.position).applyMatrix4(m));
  const forward=new THREE.Vector3(r[0][2],r[1][2],r[2][2]).transformDirection(m);
  camera.up.copy(new THREE.Vector3(-r[0][1],-r[1][1],-r[2][1]).transformDirection(m));orbit.target.copy(camera.position).add(forward);
  camera.fov=2*Math.atan(c.height/(2*c.fy))*180/Math.PI;$('fov').value=camera.fov;camera.updateProjectionMatrix();orbit.update();
 }
 async function setScene(id,{moveCamera=true}={}){
  const e=entries.get(id);if(!e)throw Error('不支持的环境场景：'+id);
  const token=++request;selector.disabled=true;$('scanStatus').textContent='正在加载 '+e.def.label+'…';
  try{
   await load(e);if(token!==request)return;
   if(active&&active!==e){active.view=rememberView();active.scanCamera=Number($('scanCamera').value)||0;active.scanOnly=$('showCeiling').checked;}
   active=e;$('showCeiling').checked=e.scanOnly;syncControls();updateTransform();visibility();
   if(moveCamera){if(e.view)applyView(e.view);else if(id==='original')editorView();else roomView();}
  }catch(error){if(token===request){if(active)selector.value=active.def.id;$('scanStatus').textContent='场景加载失败：'+error.message;}throw error;}
  finally{if(token===request)selector.disabled=false;}
 }
 async function compare(){
  const e=active;
  if($('showCeiling').checked&&e.def.reference&&!e.reference){
   $('scanStatus').textContent='加载原始扫描对照…';
   if(!e.referenceLoad)e.referenceLoad=(async()=>{const mesh=new SplatMesh({url:e.def.reference,enableLod:false});e.reference=mesh;mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrixFor(e));mesh.visible=false;scene.add(mesh);await mesh.initialized;})().catch(err=>{if(e.reference){scene.remove(e.reference);e.reference.dispose?.();e.reference=null;}e.referenceLoad=null;throw err;});
   await e.referenceLoad;
  }
  if(active===e)syncControls();visibility();
 }
 function ensureEditing(){$('showCeiling').checked=false;visibility();}
 function editorView(){ensureEditing();applyView({position:[1.45,1.35,2.25],target:[0,.83,0],up:[0,1,0],fov:45});}
 function roomOverview(){if(!active)return;ensureEditing();if(active.def.id==='original')applyView({position:[-2,1.5,3],target:[0,.8,0],up:[0,1,0],fov:65});else roomView();}
 selector.onchange=()=>setScene(selector.value).catch(console.error);
 $('editorView').onclick=editorView;$('roomOverview').onclick=roomOverview;$('roomView').onclick=roomView;$('scanCamera').onchange=roomView;
 $('prevScan').onclick=()=>{$('scanCamera').value=Math.max(0,Number($('scanCamera').value)-10);roomView();};
 $('nextScan').onclick=()=>{if(!active)return;$('scanCamera').value=Math.min(active.cameras.length-1,Number($('scanCamera').value)+10);roomView();};
 $('showRoom').onchange=visibility;
 $('showCeiling').onchange=()=>compare().catch(e=>{$('scanStatus').textContent='扫描对照加载失败：'+e.message;$('showCeiling').checked=false;visibility();});
 for(const key of ['x','y','z','yaw','scale'])$('background_'+key).onchange=()=>{
  if(!active)return;
  const n=Number($('background_'+key).value);
  if(!Number.isFinite(n)||(key==='scale'&&(n<=0||n>100))){$('background_'+key).value=active.adjust[key];return;}
  active.adjust[key]=n;updateTransform();
 };
 $('resetBackground').onclick=()=>{if(!active)return;active.adjust={x:0,y:0,z:0,yaw:0,scale:1};updateTransform();syncControls();};
 function setWorkcellItems(v){getItems=v;for(const id of ['workView','wholeView','detailView']){const old=$(id).onclick;$(id).onclick=e=>{ensureEditing();camera.up.set(0,1,0);camera.fov=45;$('fov').value=45;camera.updateProjectionMatrix();old(e);};}visibility();}
 async function restore(v){
  v=v||{};
  if(v.backgroundStates)for(const [id,s] of Object.entries(v.backgroundStates)){
   const e=entries.get(id);if(!e)continue;
   const a=s.adjust;
   if(a&&['x','y','z','yaw','scale'].every(k=>Number.isFinite(a[k]))&&a.scale>0&&a.scale<=100)e.adjust={...a};
   if(Number.isInteger(s.scanCamera))e.scanCamera=s.scanCamera;
   if(typeof s.scanOnly==='boolean')e.scanOnly=s.scanOnly;
   if(s.view&&['position','target','up'].every(k=>Array.isArray(s.view[k])&&s.view[k].length===3&&s.view[k].every(Number.isFinite))&&Number.isFinite(s.view.fov)&&s.view.fov>=15&&s.view.fov<=120)e.view=s.view;
  }
  await setScene(v.sceneId||'original',{moveCamera:false});
  $('showCeiling').checked=v.scanOnly===true;await compare();
  $('showRoom').checked=v.enabled!==false;$('scanCamera').value=Math.max(0,Math.min(active.cameras.length-1,v.scanCamera??active.scanCamera));active.scanCamera=Number($('scanCamera').value);visibility();
 }
 function snapshot(){
  active.view=rememberView();active.scanCamera=Number($('scanCamera').value)||0;
  return {version:17,sceneId:active.def.id,scanOnly:$('showCeiling').checked,enabled:$('showRoom').checked,scanCamera:active.scanCamera,asset:active.def.asset,scanToWorkcellColumnMajor:matrixFor(active).toArray(),backgroundStates:Object.fromEntries([...entries].map(([id,e])=>[id,{adjust:{...e.adjust},view:e.view,scanCamera:e.scanCamera,scanOnly:e===active?$('showCeiling').checked:e.scanOnly}])),registration:active.def.registration,backgroundEditableAsIndividualAssets:false,metricScaleVerified:false};
 }
 await setScene(config.defaultScene,{moveCamera:false});
 return {get root(){return active.root;},setScene,editorView,roomView,ensureEditing,setWorkcellItems,restore,snapshot};
}
