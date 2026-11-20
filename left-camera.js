import * as T from 'three';
let metadata;
export async function leftCameraMetadata(){if(!metadata){const r=await fetch(new URL('./assets/robot/left_camera_mount.json',import.meta.url));if(!r.ok)throw Error('左法兰相机配置加载失败');metadata=await r.json();}return metadata;}
export function attachLeftCamera(robot,model,spec){
 let flange;robot.traverse(n=>{if(n.userData.urdfLink===spec.robotLink)flange=n;});if(!flange)throw Error('找不到机器人左臂法兰');if(robot.getObjectByName('left_arm_camera'))throw Error('左法兰已有相机');
 const holder=new T.Group();holder.name='left_arm_camera';holder.add(model);flange.add(holder);
 const camera=new T.PerspectiveCamera(spec.verticalFovDegrees,4/3,.005,100);camera.name='left_flange_optical_camera';new T.Matrix4().fromArray(spec.cameraToFlangeColumnMajor).decompose(camera.position,camera.quaternion,camera.scale);holder.add(camera);robot.updateMatrixWorld(true);
 robot.userData.leftCamera={assetFile:spec.assetFile,mountVersion:spec.version,robotLink:spec.robotLink,cameraToFlangeColumnMajor:[...spec.cameraToFlangeColumnMajor],verticalFovDegrees:spec.verticalFovDegrees,calibrated:false};return camera;
}
export function leftCameraPose(robot){const camera=robot.getObjectByName('left_flange_optical_camera');if(!camera)return null;robot.updateMatrixWorld(true);return {matrixWorld:camera.matrixWorld.toArray(),verticalFovDegrees:camera.fov,calibrated:false};}
