import * as T from 'three';
import {bindRobot,robotMetadata,setRobotJoint,attachRightPipette,rightToolMountMetadata} from '../../robot.js?v=environment-2';
export function createPickupDemo({scene,camera,orbit,loadModel,objects,setSash,getSash,select,status,collisionWorld,navigation}){
 let running=false;
 async function play(){
  if(running)return;running=true;
  const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),target:orbit.target.clone(),fov:camera.fov,sash:getSash(),debug:collisionWorld.debug.visible,warning:collisionWorld.warning.visible,fly:navigation.enabled};
  const group=new T.Group(),visibility=[];const controls=[...document.querySelectorAll('button,input,select')].map(e=>[e,e.disabled]);
  try{
   const response=await fetch('../../assets/demos/right_arm_tip_pickup.json');if(!response.ok)throw Error('演示轨迹加载失败');const motion=await response.json();
   const [model,box,tool,meta,mount]=await Promise.all([loadModel('robot/wheel_robot.glb'),loadModel('tipbox_detail_6p5mm.glb'),loadModel('pipette_stand_metal_tip.glb'),robotMetadata(),rightToolMountMetadata()]);
   const robot=new T.Group(),bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);robot.add(model);robot.position.fromArray(motion.robotPosition);robot.rotation.y=motion.robotYaw;bindRobot(robot,meta);attachRightPipette(robot,tool,mount);const holder=robot.getObjectByName('right_arm_pipette');
   box.position.fromArray(motion.boxPosition).add(new T.Vector3(...motion.boxNormalization));group.add(robot,box);scene.add(group);
   const tips=[];box.traverse(o=>{if(o.name.includes('A12'))tips.push(o);});if(tips.length!==2)throw Error('演示枪头或滤芯缺失');
   window.laboratoryEnvironment.ensureEditing();select(null);navigation.setEnabled(false);controls.forEach(([e])=>e.disabled=true);objects().forEach(o=>{visibility.push([o,o.visible]);o.visible=false;});collisionWorld.debug.visible=false;collisionWorld.warning.visible=false;setSash(1);camera.up.set(0,1,0);orbit.enabled=false;
   let attached=false;
   const update=time=>{
    const index=Math.min(motion.frames.length-1,Math.floor(time*motion.fps)),a=motion.frames[index],b=motion.frames[Math.min(index+1,motion.frames.length-1)],u=Math.min(1,time*motion.fps-index);
    for(const [name,value] of Object.entries(a.angles))setRobotJoint(robot,name,value+(b.angles[name]-value)*u);
    scene.updateMatrixWorld(true);if(time>=motion.attachTime&&!attached){tips.forEach(t=>holder.attach(t));attached=true;}
    // Y-up equivalents of the offline-rendered camera cuts.
    let pos,target,fov;
    if(time<4){pos=[2.1,1.9,3.3];target=[0,1.15,.2];fov=50;}
    else if(time<10.5){pos=[.62,1.30,.95];target=[.20,1.12,.23];fov=27;}
    else{pos=[1.6,1.8,2.6];target=[.10,1.15,.35];fov=47;}
    camera.position.fromArray(pos);orbit.target.fromArray(target);camera.fov=fov;camera.updateProjectionMatrix();camera.lookAt(orbit.target);
    status(time<5?'上枪头演示 · 右臂对准 A12':time<7?'上枪头演示 · 竖直下压套接':time<8?'上枪头演示 · 接口就位':'上枪头演示 · 枪头随右臂抬起');
   };
   update(0);
   await new Promise(resolve=>{const start=performance.now();function frame(now){const t=Math.min(motion.duration,(now-start)/1000);update(t);if(t<motion.duration)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
   status('上枪头演示完成 · 已恢复编辑场景；可重复播放或下载 MP4');
  }finally{
   scene.remove(group);visibility.forEach(([o,v])=>o.visible=v);controls.forEach(([e,disabled])=>e.disabled=disabled);setSash(saved.sash);camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.up.copy(saved.up);camera.fov=saved.fov;camera.updateProjectionMatrix();orbit.target.copy(saved.target);orbit.enabled=true;collisionWorld.debug.visible=saved.debug;collisionWorld.warning.visible=saved.warning;navigation.setEnabled(saved.fly);running=false;
  }
 }
 return {play};
}
