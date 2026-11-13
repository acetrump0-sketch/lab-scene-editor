import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '../vendor/spark.module.js';
export async function createLaboratoryEnvironment({scene,camera,orbit,floor,renderer}) {
 const $=id=>document.getElementById(id),walls=[];scene.traverse(o=>{if(/^laboratory_wall|^wall_lower_panel|^wall_trim|^wall_skirting|^wall_joint_/.test(o.name))walls.push(o)});
 const pose=await(await fetch('../cabinet_pose_candidate.json')).json();const scanToWorkcell=new THREE.Matrix4().set(...pose.model_to_cabinet_scan_row_major.flat()).invert();
 scene.add(new SparkRenderer({renderer,enableLod:false}));
 const root=new SplatMesh({url:'../environment_without_scanned_cabinet.sog',enableLod:false});root.matrixAutoUpdate=false;root.matrix.copy(scanToWorkcell);root.name='registered_lab_background';scene.add(root);
 const cameras=await(await fetch('../cameras.json')).json();camera.far=100;camera.updateProjectionMatrix();await root.initialized;
 $('scanStatus').textContent='环境已接入 · 独立资产可编辑';let getItems=()=>[],reference=null,loadingReference=null;
 function visibility(){const on=$('showRoom').checked,compare=$('showCeiling').checked;root.visible=on&&!compare;if(reference)reference.visible=on&&compare;floor.visible=!on;walls.forEach(o=>o.visible=!on);getItems().forEach(o=>{if(!o.isGridHelper)o.visible=!compare});}
 async function compare(){if($('showCeiling').checked&&!reference){$('scanStatus').textContent='加载扫描对照…';if(!loadingReference)loadingReference=(async()=>{reference=new SplatMesh({url:'../reference.sog',enableLod:false});reference.matrixAutoUpdate=false;reference.matrix.copy(scanToWorkcell);reference.visible=false;scene.add(reference);await reference.initialized})();await loadingReference;$('scanStatus').textContent='扫描对照已加载 · 返回编辑可恢复独立模型'}visibility()}
 function ensureEditing(){$('showCeiling').checked=false;visibility()}
 function editorView(){ensureEditing();camera.up.set(0,1,0);camera.fov=45;$('fov').value=45;camera.position.set(1.45,1.35,2.25);orbit.target.set(0,.83,0);camera.updateProjectionMatrix();orbit.update()}
 function roomOverview(){ensureEditing();camera.up.set(0,1,0);camera.fov=65;$('fov').value=65;camera.position.set(-2,1.5,3);orbit.target.set(0,.8,0);camera.updateProjectionMatrix();orbit.update()}
 function roomView(){const idx=Math.max(0,Math.min(cameras.length-1,+$('scanCamera').value||0));$('scanCamera').value=idx;const c=cameras[idx],r=c.rotation;camera.position.copy(new THREE.Vector3(...c.position).applyMatrix4(scanToWorkcell));const forward=new THREE.Vector3(r[0][2],r[1][2],r[2][2]).transformDirection(scanToWorkcell);camera.up.copy(new THREE.Vector3(-r[0][1],-r[1][1],-r[2][1]).transformDirection(scanToWorkcell));orbit.target.copy(camera.position).add(forward);camera.fov=90;$('fov').value=90;camera.updateProjectionMatrix();orbit.update()}
 $('editorView').onclick=editorView;$('roomOverview').onclick=roomOverview;$('roomView').onclick=roomView;$('scanCamera').onchange=roomView;
 $('prevScan').onclick=()=>{$('scanCamera').value=Math.max(0,+$('scanCamera').value-10);roomView()};$('nextScan').onclick=()=>{$('scanCamera').value=Math.min(cameras.length-1,+$('scanCamera').value+10);roomView()};$('showRoom').onchange=visibility;$('showCeiling').onchange=()=>compare().catch(e=>{$('scanStatus').textContent='扫描对照加载失败：'+e.message;$('showCeiling').checked=false;visibility()});
 function setWorkcellItems(v){getItems=v;for(const id of ['workView','wholeView','detailView']){const old=$(id).onclick;$(id).onclick=e=>{ensureEditing();camera.up.set(0,1,0);camera.fov=45;$('fov').value=45;camera.updateProjectionMatrix();old(e)}}visibility()}
 function restore(v){if(!v)return;$('showRoom').checked=v.enabled!==false;$('showCeiling').checked=false;$('scanCamera').value=v.scanCamera??180;visibility()}
 visibility();return {root,editorView,roomView,ensureEditing,setWorkcellItems,restore,snapshot:()=>({version:16,enabled:$('showRoom').checked,scanCamera:+$('scanCamera').value,asset:'environment_without_scanned_cabinet.sog',scanToWorkcellColumnMajor:scanToWorkcell.toArray(),registration:'coarse cabinet contour fit',backgroundEditableAsIndividualAssets:false,metricScaleVerified:false})};
}
