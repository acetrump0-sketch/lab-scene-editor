import * as THREE from 'three';
import {OBB} from '../../vendor/OBB.js';
export function createPlacement({objects,tableY,status,enabled}){
 const saved=new WeakMap(),bounds=new WeakMap();
 const pose=o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});
 const restore=(o,p)=>{o.position.copy(p.p);o.quaternion.copy(p.q);o.scale.copy(p.s);o.updateMatrixWorld(true);};
 function remember(o){saved.set(o,pose(o));}
 function localBounds(o){if(!bounds.has(o)){o.updateMatrixWorld(true);const inv=o.matrixWorld.clone().invert(),b=new THREE.Box3();o.traverse(n=>{if(n.isMesh){n.geometry.computeBoundingBox();b.union(n.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(n.matrixWorld)));}});bounds.set(o,b);}return bounds.get(o);}
 function obb(o){o.updateMatrixWorld(true);const b=new OBB().fromBox3(localBounds(o));b.halfSize.addScalar(-.0001).max(new THREE.Vector3(.00001,.00001,.00001));return b.applyMatrix4(o.matrixWorld);}
 function family(o){return [o,...objects().filter(t=>t.userData.mount?.rackId===o.userData.id)];}
 function carry(o){o.updateMatrixWorld(true);for(const t of family(o).slice(1)){o.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(t.userData.mount.localMatrix)).decompose(t.position,t.quaternion,t.scale);t.updateMatrixWorld(true);}}
 function related(a,b){return a.userData.mount?.rackId===b.userData.id||b.userData.mount?.rackId===a.userData.id;}
 function collision(moving){const set=new Set(moving);const fixed=objects().filter(o=>!set.has(o));const fixedBoxes=fixed.map(o=>[o,obb(o)]);
  for(const a of moving){const world=localBounds(a).clone().applyMatrix4(a.matrixWorld);if(world.min.y<tableY()-.0002)return '不能穿过台面';const ab=obb(a);for(const [b,bb] of fixedBoxes){if(related(a,b))continue;if(ab.intersectsOBB(bb,1e-9))return '与「'+b.userData.label+'」发生碰撞';}}
  return null;
 }
 function apply(o,{allowMounted=false}={}){
  const old=saved.get(o)||pose(o),target=pose(o),group=family(o),previous=group.map(x=>[x,saved.get(x)||pose(x)]);
  if(enabled()&&o.userData.mount&&!allowMounted){restore(o,old);status('枪头仍在孔位内，请先点击“取出枪头”');return false;}
  if(!enabled()){if(o.userData.mount)delete o.userData.mount;carry(o);group.forEach(remember);return true;}
  const distance=old.p.distanceTo(target.p),angle=old.q.angleTo(target.q);const steps=Math.max(1,Math.ceil(distance/.002),Math.ceil(angle/.04),Math.ceil(old.s.distanceTo(target.s)/.02));
  if(steps>600){restore(o,old);status('移动距离过大，请分段移动');return false;}
  let error=null;
  for(let i=1;i<=steps;i++){const f=i/steps;o.position.lerpVectors(old.p,target.p,f);o.quaternion.slerpQuaternions(old.q,target.q,f);o.scale.lerpVectors(old.s,target.s,f);o.updateMatrixWorld(true);carry(o);error=collision(group);if(error)break;}
  if(error){previous.forEach(([a,p])=>restore(a,p));status(error+'，已保留上一次有效位置');return false;}
  group.forEach(remember);status('摆放有效');return true;
 }
 function bind(rack,tips){rack.updateMatrixWorld(true);rack.userData.slots={};for(const tip of tips){tip.updateMatrixWorld(true);const local=rack.matrixWorld.clone().invert().multiply(tip.matrixWorld).toArray();const slot=tip.userData.sourcePart;rack.userData.slots[slot]=local;tip.userData.mount={rackId:rack.userData.id,slot,localMatrix:local};remember(tip);}remember(rack);}
 function extract(tip){const mount=tip?.userData.mount;if(!mount){status('请选择盒内枪头');return false;}const rack=objects().find(o=>o.userData.id===mount.rackId);if(!rack)return false;const up=new THREE.Vector3(0,1,0).applyQuaternion(rack.quaternion);tip.position.addScaledVector(up,.11*rack.scale.y);if(!apply(tip,{allowMounted:true}))return false;delete tip.userData.mount;remember(tip);status('枪头已沿孔轴抬出，可自由移动');return true;}
 function insert(tip){if(tip?.userData.kind!=='tips2000_tip'||tip.userData.mount){status('请选择已取出的单支枪头');return false;}
  let best=null;for(const rack of objects().filter(o=>o.userData.slots)){rack.updateMatrixWorld(true);for(const [slot,local] of Object.entries(rack.userData.slots)){if(objects().some(o=>o.userData.mount?.rackId===rack.userData.id&&o.userData.mount.slot===slot))continue;const matrix=rack.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(local));const p=new THREE.Vector3().setFromMatrixPosition(matrix),d=p.distanceTo(tip.position);if(!best||d<best.d)best={rack,slot,local,matrix,p,d};}}
  if(!best||best.d>.16){status('请先把枪头移到空孔附近（16 cm内）');return false;}
  const old=pose(tip),up=new THREE.Vector3(0,1,0).applyQuaternion(best.rack.quaternion);best.matrix.decompose(tip.position,tip.quaternion,tip.scale);tip.position.addScaledVector(up,.11*best.rack.scale.y);
  if(!apply(tip)){restore(tip,old);remember(tip);return false;}
  tip.userData.mount={rackId:best.rack.userData.id,slot:best.slot,localMatrix:best.local};best.matrix.decompose(tip.position,tip.quaternion,tip.scale);
  if(!apply(tip,{allowMounted:true})){delete tip.userData.mount;restore(tip,old);remember(tip);return false;}
  status('已沿孔轴插入空孔 '+best.slot.replace('Tip_2000uL_',''));return true;
 }
 function settle(o){if(o.userData.mount){status('盒内枪头请先取出');return;}remember(o);o.updateMatrixWorld(true);const b=localBounds(o).clone().applyMatrix4(o.matrixWorld);let height=tableY();for(const other of objects()){if(family(o).includes(other))continue;other.updateMatrixWorld(true);const bb=localBounds(other).clone().applyMatrix4(other.matrixWorld);if(bb.max.y<=b.min.y+.0002&&bb.max.x>b.min.x&&bb.min.x<b.max.x&&bb.max.z>b.min.z&&bb.min.z<b.max.z)height=Math.max(height,bb.max.y);}o.position.y+=height-b.min.y;apply(o);}
 return {remember,apply,bind,extract,insert,settle,carry,collision,family};
}
