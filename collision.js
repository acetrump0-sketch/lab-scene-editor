import * as T from 'three';
import {OBB} from './vendor/OBB.js';
const EPS=.001;
export function boxOBB(box,matrix=new T.Matrix4()){const o=new OBB().fromBox3(box),e=matrix.elements,s=new T.Vector3(new T.Vector3(e[0],e[1],e[2]).length(),new T.Vector3(e[4],e[5],e[6]).length(),new T.Vector3(e[8],e[9],e[10]).length());const c0=new T.Vector3(e[0],e[1],e[2]).normalize(),c1=new T.Vector3(e[4],e[5],e[6]).normalize(),c2=new T.Vector3(e[8],e[9],e[10]).normalize();if(Math.max(Math.abs(c0.dot(c1)),Math.abs(c0.dot(c2)),Math.abs(c1.dot(c2)))>1e-6)return new OBB().fromBox3(box.clone().applyMatrix4(matrix));o.center.applyMatrix4(matrix);o.halfSize.multiply(s);o.rotation.set(e[0]/s.x,e[4]/s.y,e[8]/s.z,e[1]/s.x,e[5]/s.y,e[9]/s.z,e[2]/s.x,e[6]/s.y,e[10]/s.z);return o;}
function aabb(obb){const b=new T.Box3(),v=new T.Vector3(),r=new T.Matrix4().setFromMatrix3(obb.rotation);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])b.expandByPoint(v.set(x*obb.halfSize.x,y*obb.halfSize.y,z*obb.halfSize.z).applyMatrix4(r).add(obb.center));return b;}
function meshOBB(mesh){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();return boxOBB(mesh.geometry.boundingBox,mesh.matrixWorld);}
function transformedTriangle(tri,m){return new T.Triangle(tri.a.clone().applyMatrix4(m),tri.b.clone().applyMatrix4(m),tri.c.clone().applyMatrix4(m));}
function buildTree(tris){const bounds=new T.Box3();for(const t of tris)bounds.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);if(tris.length<=16)return {bounds,tris};const size=bounds.getSize(new T.Vector3()),axis=size.x>size.y?(size.x>size.z?'x':'z'):(size.y>size.z?'y':'z');tris.sort((a,b)=>(a.a[axis]+a.b[axis]+a.c[axis])-(b.a[axis]+b.b[axis]+b.c[axis]));const half=tris.length>>1;return {bounds,left:buildTree(tris.slice(0,half)),right:buildTree(tris.slice(half))};}
function hitTree(obb,tree){
 if(!tree)return false;const broad=aabb(obb);const m=new T.Matrix4().setFromMatrix3(obb.rotation);m.setPosition(obb.center);m.invert();const half=obb.halfSize.clone().addScalar(-EPS).max(new T.Vector3(.0001,.0001,.0001)),local=new T.Box3(half.clone().negate(),half);
 function visit(node){if(!broad.intersectsBox(node.bounds))return false;if(node.tris)return node.tris.some(t=>local.intersectsTriangle(transformedTriangle(t,m)));return visit(node.left)||visit(node.right);}
 return visit(tree);
}
export function createCollisionWorld({scene,objects,cabinet,status=()=>{},enabled=()=>true}){
 let environment=[],sceneId='original',tree=null,dynamic=[];const robotCache=new WeakMap(),objectCache=new WeakMap();
 const debug=new T.Group();debug.name='collision_debug';debug.visible=false;scene.add(debug);
 const warning=new T.Group();warning.name='collision_warning';scene.add(warning);
 function drawBox(box,color,parent){const helper=new T.Box3Helper(box,color);parent.add(helper);return helper;}
 function clear(group){for(const n of [...group.children]){group.remove(n);n.geometry?.dispose();n.material?.dispose();}}
 function refreshDebug(){clear(debug);for(const e of environment){const geometry=new T.BoxGeometry(e.obb.halfSize.x*2,e.obb.halfSize.y*2,e.obb.halfSize.z*2),lines=new T.LineSegments(new T.EdgesGeometry(geometry),new T.LineBasicMaterial({color:e.category==='地面'?0x4bddb5:0xffbd5a}));geometry.dispose();lines.matrixAutoUpdate=false;lines.matrix.setFromMatrix3(e.obb.rotation).setPosition(e.obb.center);debug.add(lines);}if(cabinet())drawBox(new T.Box3().setFromObject(cabinet()),0x50b8ff,debug);}
 function showCollision(result){clear(warning);if(!result)return;if(result.boxA)drawBox(result.boxA,0xff395c,warning);if(result.boxB)drawBox(result.boxB,0xff395c,warning);status(result.message);}
 function robotParts(robot){
  if(!robotCache.has(robot)){
   const parts=[],parents=new Map();robot.traverse(n=>{if(n.userData.urdfLink){let parent=n.parent;while(parent&&!parent.userData.urdfLink)parent=parent.parent;if(parent)parents.set(n.userData.urdfLink,parent.userData.urdfLink);}
    if(n.isMesh){let q=n,owner=null,tool=false;while(q&&q!==robot){if(q.name==='right_arm_pipette')tool=true;if(!owner&&q.userData.urdfLink)owner=q.userData.urdfLink;q=q.parent;}if(owner)parts.push({mesh:n,owner:tool?'right_tool':owner,label:tool?'右臂移液枪 / '+n.name:owner});}
   });parents.set('right_tool','AR5-5_08R-W4C1C9-ZY2_flan_link');robotCache.set(robot,{parts,parents});
  }const data=robotCache.get(robot);robot.updateMatrixWorld(true);return {...data,parts:data.parts.map(p=>({...p,obb:meshOBB(p.mesh)}))};
 }
 function distance(a,b,parents){const path=new Map();let n=a;for(let i=0;n&&i<40;i++,n=parents.get(n))path.set(n,i);n=b;for(let i=0;n&&i<40;i++,n=parents.get(n))if(path.has(n))return path.get(n)+i;return 100;}
 function rigidRelated(a,b,parents){if(a===b)return true;if(distance(a,b,parents)<=2)return true;
  // Camera frames and base-to-arm flange mounts are fixed parts of their parent body.
  const body=n=>!n.includes('08L')&&!n.includes('08R')&&n!=='right_tool';if(body(a)&&body(b))return true;
  const early=n=>/08[LR].*(?:base|link1|link2)$/.test(n);if((early(a)&&b==='Chest_link')||(early(b)&&a==='Chest_link'))return true;
  if((a==='right_tool'&&/08R.*link[67]$/.test(b))||(b==='right_tool'&&/08R.*link[67]$/.test(a)))return true;
  return false;
 }
 function ordinaryPart(o){o.updateMatrixWorld(true);if(!objectCache.has(o)){const inv=o.matrixWorld.clone().invert(),bounds=new T.Box3();o.traverse(n=>{if(n.isMesh){if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();bounds.union(n.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(n.matrixWorld)));}});objectCache.set(o,bounds);}return {owner:o.userData.label||o.name,label:o.userData.label||o.name,obb:boxOBB(objectCache.get(o),o.matrixWorld)};}
 function result(a,b,label){return {message:`碰撞：${a.label} 与 ${label}；已停止此次移动`,boxA:aabb(a.obb),boxB:b?aabb(b.obb):null,part:a.label,obstacle:label};}
 function check(moving,{self=true}={}){
  if(!enabled())return null;scene.updateMatrixWorld(true);const moved=new Set(moving),fixed=objects().filter(o=>!moved.has(o)),fixedParts=new Map(fixed.map(o=>[o,o.userData.kind==='wheel_robot'?robotParts(o).parts:[ordinaryPart(o)]]));
  for(const object of moving){const isRobot=object.userData.kind==='wheel_robot',rig=isRobot?robotParts(object):null,parts=isRobot?rig.parts:[ordinaryPart(object)];
   for(const a of parts){const bounds=aabb(a.obb);if(bounds.min.y < -.003)return result(a,null,'地面');
    const scanQuery=a.obb.clone();scanQuery.halfSize.addScalar(-EPS).max(new T.Vector3(.00001,.00001,.00001));for(const b of environment)if(b.category!=='地面'&&scanQuery.intersectsOBB(b.obb,1e-10))return result(a,b,b.label);
    if(hitTree(a.obb,tree))return result(a,null,'安全柜网格');
    for(const mesh of dynamic){const b={obb:meshOBB(mesh)};if(a.obb.intersectsOBB(b.obb,1e-10)){const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;const m=new T.Matrix4().setFromMatrix3(a.obb.rotation).setPosition(a.obb.center).invert().multiply(mesh.matrixWorld),half=a.obb.halfSize.clone().addScalar(-EPS),local=new T.Box3(half.clone().negate(),half);for(let i=0;i<(index?index.count:pos.count);i+=3){const v=[];for(let k=0;k<3;k++)v.push(new T.Vector3().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(m));if(local.intersectsTriangle(new T.Triangle(...v)))return result(a,b,'安全柜玻璃窗');}}}
    for(const other of fixed){if((object.userData.mount&&object.userData.mount.rackId===other.userData.id)||(other.userData.mount&&other.userData.mount.rackId===object.userData.id))continue;
     // Existing placement handles non-robot pairs and rack slots.
     if(!isRobot&&other.userData.kind!=='wheel_robot')continue;
     const targets=fixedParts.get(other);for(const b of targets)if(a.obb.intersectsOBB(b.obb,1e-10))return result(a,b,b.label);
    }
   }
   if(isRobot&&self)for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){const a=parts[i],b=parts[j];if(rigidRelated(a.owner,b.owner,rig.parents))continue;if(a.obb.intersectsOBB(b.obb,1e-10))return result(a,b,'自身 '+b.label);}
  }return null;
 }
 function rebuildCabinet(){const c=cabinet();if(!c)return;c.updateMatrixWorld(true);const tris=[];dynamic=[];c.traverse(mesh=>{if(!mesh.isMesh)return;let names='',n=mesh;while(n&&n!==c){names+=' '+n.name;n=n.parent;}if(/glass|sash|moving.window/i.test(names)){dynamic.push(mesh);return;}const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;for(let i=0;i<(index?index.count:pos.count);i+=3){const v=[];for(let k=0;k<3;k++)v.push(new T.Vector3().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));tris.push(new T.Triangle(...v));}});tree=tris.length?buildTree(tris):null;refreshDebug();return {triangles:tris.length,movingWindowParts:dynamic.length};}
 function setEnvironment(data,matrix){sceneId=data?.sceneId||'unavailable';environment=[];if(data){const adjustment=matrix.clone().multiply(new T.Matrix4().fromArray(data.baselineMatrix).invert());for(const p of data.proxies)for(const box of p.boxes)environment.push({id:p.id,label:p.label,category:p.category,obb:boxOBB(new T.Box3(new T.Vector3(...box.min),new T.Vector3(...box.max)),adjustment)});}refreshDebug();}
 function moveJoint({object,from,to,apply}){if(!enabled()){apply(to);return to;}const steps=Math.max(1,Math.ceil(Math.abs(to-from)/.005));if(steps>400){status('关节变化超过约114°，请分段调整');return from;}for(let i=1;i<=steps;i++){apply(from+(to-from)*i/steps);const hit=check([object]);if(hit){apply(from);showCollision(hit);return from;}}showCollision(null);status('关节运动通过碰撞检查');return to;}
 function externalCollision(moving){const hit=check(moving);if(hit)showCollision(hit);else showCollision(null);return hit?.message||null;}
 function supportHeight(box){let y=0;for(const e of environment){const b=aabb(e.obb);if(e.category==='台面/水平结构'){if(b.max.y<=box.min.y+.003&&b.max.x>box.min.x&&b.min.x<box.max.x&&b.max.z>box.min.z&&b.min.z<box.max.z)y=Math.max(y,b.max.y);}}const h=.62993*1.462;if(box.min.x<.8078&&box.max.x>-.8078&&box.min.z<.2902&&box.max.z>-.3048&&box.min.y>=h-.003)y=Math.max(y,h);return y;}
 return {check,externalCollision,moveJoint,rebuildCabinet,setEnvironment,showCollision,supportHeight,robotParts,debug,warning,setDebug(value){debug.visible=value;},getEnvironment:()=>environment,snapshot:()=>({version:1,enabled:enabled(),sceneId,environmentBoxes:environment.length,robotApproximation:'per-link and per-tool-part OBB',cabinetApproximation:'triangle surface BVH plus moving-window triangles',selfCollision:'non-adjacent arm parts against other arms/body; connected parts excluded',sampling:{translationMeters:.002,jointRadians:.005},metricScaleVerified:false})};
}
