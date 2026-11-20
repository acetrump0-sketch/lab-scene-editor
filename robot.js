import * as THREE from 'three';
const rigs=new WeakMap(),guards=new WeakMap();
export function setRobotCollisionGuard(object,guard){guards.set(object,guard);}
let metadata;
export async function robotMetadata(){
 if(!metadata){const response=await fetch(new URL('./assets/robot/robot.json',import.meta.url));if(!response.ok)throw Error('机器人关节文件加载失败');metadata=await response.json();}
 return metadata;
}
export function bindRobot(object,meta,angles={}){
 const nodes=new Map();object.traverse(n=>{if(n.userData.urdfJoint)nodes.set(n.userData.urdfJoint,n);});
 const joints=meta.joints.filter(j=>j.type!=='fixed').map(j=>{
  const node=nodes.get(j.name);if(!node)throw Error('机器人缺少关节 '+j.name);
  return {...j,node,origin:node.quaternion.clone(),axis:new THREE.Vector3(...j.axis).normalize()};
 });
 rigs.set(object,joints);object.userData.jointAngles={};
 for(const j of joints)setRobotJoint(object,j.name,angles[j.name]??0);
}
export function setRobotJoint(object,name,value){
 const joint=rigs.get(object)?.find(j=>j.name===name);if(!joint||!Number.isFinite(value))throw Error('无效的机器人关节角');
 const v=joint.type==='continuous'?value:THREE.MathUtils.clamp(value,joint.limit.lower,joint.limit.upper);
 const apply=angle=>{joint.node.quaternion.copy(joint.origin).multiply(new THREE.Quaternion().setFromAxisAngle(joint.axis,angle));object.userData.jointAngles[name]=angle;object.updateMatrixWorld(true);};
 const guard=guards.get(object);if(guard)return guard({object,from:object.userData.jointAngles[name]??0,to:v,apply});apply(v);return v;
}
export function robotJoints(object){return rigs.get(object)||[];}
export function robotPanel(object,onChange){
 const panel=document.getElementById('robotPanel'),fields=document.getElementById('robotJoints');
 const joints=robotJoints(object);panel.hidden=!joints.length;fields.replaceChildren();document.getElementById('focusRightTool').disabled=!object?.userData.rightTool;document.getElementById('rightToolInfo').textContent=object?.userData.rightTool?'右臂已连接最新移液枪；绿色圆盘与末端法兰固定耦合，随关节运动。':'右臂未安装工具';if(!joints.length)return;
 for(const [title,predicate] of [['左臂 · 7 轴',j=>j.name.includes('08L')],['右臂 · 7 轴',j=>j.name.includes('08R')],['躯干与头部',j=>!j.name.includes('08')&&j.type==='revolute'],['车轮',j=>j.type==='continuous']]){
  const section=document.createElement('details');section.open=title.startsWith('右臂');const summary=document.createElement('summary');summary.textContent=title;section.append(summary);
  for(const j of joints.filter(predicate)){
   const row=document.createElement('label'),label=document.createElement('span');
   const names={Calf_joint:'下肢',Thigh_joint:'上肢支撑',Waist_joint:'腰部',Chest_joint:'胸部',Neck_joint:'颈部',Head_joint:'头部'};
   label.textContent=names[j.name]||(j.name.includes('08')?'关节 '+j.name.split('_').at(-1):j.name.replace('_joint',''));
   const slider=document.createElement('input');slider.type='range';slider.min=THREE.MathUtils.radToDeg(j.limit.lower??-Math.PI);slider.max=THREE.MathUtils.radToDeg(j.limit.upper??Math.PI);slider.step='0.1';slider.dataset.joint=j.name;slider.setAttribute('aria-label',title+' '+label.textContent);
   const value=document.createElement('output');const sync=()=>{const degrees=THREE.MathUtils.radToDeg(object.userData.jointAngles[j.name]);slider.value=degrees;value.textContent=degrees.toFixed(1)+'°';};sync();
   slider.oninput=()=>{setRobotJoint(object,j.name,THREE.MathUtils.degToRad(Number(slider.value)));sync();onChange();};row.append(label,value,slider);section.append(row);
  }fields.append(section);
 }
 document.getElementById('robotReset').onclick=()=>{for(const j of joints)setRobotJoint(object,j.name,0);robotPanel(object,onChange);onChange();};
}

let toolMount;
export async function rightToolMountMetadata(){
 if(!toolMount){const r=await fetch(new URL('./assets/robot/right_pipette_mount.json',import.meta.url));if(!r.ok)throw Error('右臂工具接口加载失败');toolMount=await r.json();}return toolMount;
}
export function attachRightPipette(robot,model,mount){
 let flange;robot.traverse(n=>{if(n.userData.urdfLink===mount.robotLink)flange=n;});
 if(!flange)throw Error('找不到机器人右臂法兰');
 if(robot.getObjectByName('right_arm_pipette'))throw Error('右臂已有移液枪');
 const holder=new THREE.Group();holder.name='right_arm_pipette';
 new THREE.Matrix4().fromArray(mount.toolToFlangeColumnMajor).decompose(holder.position,holder.quaternion,holder.scale);
 holder.add(model);flange.add(holder);robot.updateMatrixWorld(true);
 robot.userData.rightTool={assetFile:mount.assetFile,mountVersion:mount.version,robotLink:mount.robotLink,mountPart:mount.mountPart,toolToFlangeColumnMajor:[...mount.toolToFlangeColumnMajor],metricBasis:mount.metricBasis};
 return holder;
}
export function robotToolPose(robot){
 const tool=robot.getObjectByName('right_arm_pipette');if(!tool)return null;
 robot.updateMatrixWorld(true);const tip=tool.getObjectByName('metal_rounded_tip');
 return {matrixWorld:tool.matrixWorld.toArray(),tipCenterWorld:tip?new THREE.Box3().setFromObject(tip).getCenter(new THREE.Vector3()).toArray():null};
}
