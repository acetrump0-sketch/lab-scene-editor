import * as THREE from 'three';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {Reflector} from './vendor/Reflector.js';

export function createAppearance({scene,renderer,key,fill,floor}) {
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,0.025);room.dispose();pmrem.dispose();
  const details=new THREE.Group();details.name='studio_environment_v3';scene.add(details);
  const records=[],cache=new Map();let enabled=true,tableY=.63;
  const steel=new THREE.MeshStandardMaterial({color:0xb9c3ca,metalness:.82,roughness:.28,envMapIntensity:.9});
  const paint=new THREE.MeshPhysicalMaterial({color:0xdce2e5,roughness:.32,metalness:.04,clearcoat:.22});
  const glass=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.045,metalness:0,transmission:1,thickness:.004,ior:1.5,envMapIntensity:.65,side:THREE.DoubleSide});
  const clearTip=new THREE.MeshPhysicalMaterial({color:0xfcfeff,roughness:.10,metalness:0,transmission:.96,thickness:.00035,ior:1.49,envMapIntensity:1.05,side:THREE.DoubleSide});
  const boxPlastic=new THREE.MeshPhysicalMaterial({color:0xf1f5f6,roughness:.22,transmission:.7,thickness:.0012,ior:1.49,envMapIntensity:.8});
  const pink=new THREE.MeshPhysicalMaterial({color:0xd97d9d,roughness:.37,clearcoat:.18});
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');let seed=14327;
  for(let y=0;y<256;y++){seed=(seed*1664525+1013904223)>>>0;let c=195+seed%30;ctx.fillStyle=`rgb(${c},${c},${c})`;ctx.fillRect(0,y,256,1);}
  const brush=new THREE.CanvasTexture(canvas);brush.wrapS=brush.wrapT=THREE.RepeatWrapping;brush.repeat.set(2,8);steel.roughnessMap=brush;steel.bumpMap=brush;steel.bumpScale=.000018;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-.85,right:.85,top:.85,bottom:-.85,near:.01,far:4});key.shadow.bias=-.00003;key.shadow.normalBias=.0003;scene.add(key.target);
  floor.receiveShadow=true;floor.material.color.set(0x87979e);floor.material.roughness=.72;
  function remember(mesh,material){records.push({mesh,original:mesh.material,material});if(enabled)mesh.material=material;}
  function refine(original,kind='') {
    const id=original.uuid+kind;if(cache.has(id))return cache.get(id);
    let m=original.clone();m.envMapIntensity=.65;
    if(kind==='plate' && original.transmission>.3){m.color.set(0xffffff);m.transmission=.95;m.roughness=.095;m.thickness=.0007;m.ior=1.49;m.envMapIntensity=1;m.metalness=0;}
    cache.set(id,m);return m;
  }
  function addObject(object,kind){object.traverse(mesh=>{
    if(!mesh.isMesh)return;if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();
    mesh.receiveShadow=true;mesh.castShadow=kind!=='plate'&&kind!=='tips'&&kind!=='tips1000'&&kind!=='tips1000_tip';
    let names=[];for(let p=mesh;p&&p!==object;p=p.parent)names.push(p.name);let name=names.join(' ');
    const material=kind==='tips'?(name.includes('Pink')?pink:/Tip_R\d/.test(name)?clearTip:boxPlastic):Array.isArray(mesh.material)?mesh.material.map(m=>refine(m,kind)):refine(mesh.material,kind);
    remember(mesh,material);
    // Thin transparent parts must not cast the opaque silhouette used by basic shadow maps.
    if(kind==='tips'&&name.includes('Pink'))mesh.castShadow=true;
  });}
  function removeObjects(objects){
    const meshes=new Set();
    for(const object of objects)object.traverse(mesh=>{if(mesh.isMesh)meshes.add(mesh);});
    let count=0;
    for(const record of records)if(!meshes.has(record.mesh))records[count++]=record;
    records.length=count;
  }
  function box(name,size,pos,material){let m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.set(...pos);m.receiveShadow=true;details.add(m);return m;}
  function setupCabinet(cabinet,height){tableY=height;
    cabinet.traverse(mesh=>{if(!mesh.isMesh)return;if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();mesh.receiveShadow=true;
      let mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const replacements=mats.map(m=>{if(m.name.includes('sash glass'))return glass;if(m.name.includes('Metal panels'))return paint;return refine(m);});
      remember(mesh,Array.isArray(mesh.material)?replacements:replacements[0]);
      // Cabinet shell is open; avoid baking its old lighting a second time into hard shadows.
      mesh.castShadow=false;
    });
    box('brushed_work_surface',[1.105,.004,.407],[0,tableY-.002,-.005],steel);
    const mirror=new Reflector(new THREE.PlaneGeometry(1.10,.40),{textureWidth:1024,textureHeight:1024,color:0xb8c5ce,clipBias:.0003});
    mirror.name='subtle_worktop_reflection';mirror.rotation.x=-Math.PI/2;mirror.position.set(0,tableY+.00015,-.005);
    mirror.material.transparent=true;mirror.material.depthWrite=false;mirror.material.fragmentShader=mirror.material.fragmentShader.replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4( blendOverlay( base.rgb, color ), 0.19 )');details.add(mirror);
    const lamp=new THREE.MeshStandardMaterial({color:0xf7fbff,emissive:0xe3efff,emissiveIntensity:2});
    box('task_light_diffuser',[.96,.008,.035],[0,1.011,-.09],lamp);
    box('laboratory_wall',[8,3.6,.08],[0,1.8,-1.20],new THREE.MeshStandardMaterial({color:0xc6d1d5,roughness:.86}));
    box('wall_lower_panel',[8,.86,.025],[0,.43,-1.145],new THREE.MeshStandardMaterial({color:0x9baeb5,roughness:.65}));
    box('wall_trim',[8,.015,.018],[0,.865,-1.12],steel);
    box('wall_skirting',[8,.085,.025],[0,.0425,-1.12],new THREE.MeshStandardMaterial({color:0x667c85,roughness:.5}));
    for(let i=-3;i<=3;i++)box('wall_joint_'+i,[.002,2.7,.002],[i*1.2,2.22,-1.155],new THREE.MeshStandardMaterial({color:0xb4c3c9,roughness:.8}));
    apply(enabled);
  }
  function apply(value){enabled=value;scene.environment=value?environment.texture:null;details.visible=value;renderer.shadowMap.enabled=value;key.castShadow=value;
    key.intensity=value?2.1:1.2;key.position.set(-.3,tableY+.55,.42);key.target.position.set(.05,tableY,-.06);fill.position.set(.35,tableY+.27,-.07);fill.intensity=value?.045:.15;
    for(let r of records)r.mesh.material=value?r.material:r.original;scene.background.set(value?0xbdcbd1:0x293b4e);
  }
  function settings(){return {version:3,preset:enabled?'studio_materials':'original_materials',environment:'procedural_RoomEnvironment',shadowMap:'PCFSoft_2048',tableReflection:'planar_1024_blend_0.19',overrides:enabled?['user_cabinet','clear_PS_plate','clear_PP_tips','brushed_worktop','glass_sash','task_light','laboratory_wall']:[],note:'Physically based visual approximations, not measured optical properties. Thin transparent parts do not cast opaque shadow-map silhouettes.'};}
  return {addObject,removeObjects,setupCabinet,apply,settings};
}
