async()=>{
 const T=await import('../../vendor/three.module.js'),s=labStudio;
 document.getElementById('physics').checked=false;
 for(const o of [...s.objects()])if(['plate','lichen_p1000'].includes(o.userData.kind)){s.select(o);document.getElementById('remove').click();}
 const rack=s.objects().find(o=>o.userData.kind==='tips2000_box');rack.position.set(0,.62993,0);s.placement.carry(rack);
 const tips=s.objects().filter(o=>o.userData.kind==='tips2000_tip');
 const root=new T.Group();root.position.copy(rack.position);s.scene.add(root);root.attach(rack);tips.forEach(o=>root.attach(o));
 root.updateMatrixWorld(true);
 const localCenters=new Map(tips.map(o=>{const b=new T.Box3().setFromObject(o),c=b.getCenter(new T.Vector3());c.y=b.max.y;return [o,root.worldToLocal(c)];}));
 const gun=await s.addObject('cad_714a4575');s.select(null);s.transform.visible=false;s.grid.visible=false;s.boxHelper.visible=false;s.setSash(1);s.cabinet.traverse(n=>{if(n.name==='WINDOW_MOVING')n.visible=false;});
 const mats=new Map();s.scene.traverse(n=>{if(n.isMesh){for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m)mats.set(m.uuid,{m,opacity:m.opacity,roughness:m.roughness,color:m.color?.clone()});}});
 const W=1280,H=960,rt=new T.WebGLRenderTarget(W,H);rt.texture.colorSpace=T.SRGBColorSpace;const ids=new T.Scene();ids.background=new T.Color(0);
 const black=new T.MeshBasicMaterial({color:0,side:T.FrontSide});const idm=new Map();
 function idmat(i){if(!idm.has(i)){const c=new T.Color().setRGB(i/255,0,0,T.SRGBColorSpace);idm.set(i,new T.MeshBasicMaterial({color:c,side:T.FrontSide,toneMapped:false}));}return idm.get(i);}
 const proxies=[];
 function proxy(o,id){o.traverse(n=>{if(!n.isMesh)return;const useID=(o===gun&&!String(n.material?.name||'').includes('蓝色'))?0:id;const m=new T.Mesh(n.geometry,useID? idmat(useID):black);m.matrixAutoUpdate=false;ids.add(m);proxies.push({source:n,proxy:m,owner:o});});}
 proxy(rack,0);tips.forEach((o,i)=>proxy(o,i+1));proxy(gun,100);proxy(s.cabinet,0);
 const pixels=new Uint8Array(W*H*4),raySamples=16;
 let sceneInfo=null;
 const randGen=seed=>{let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};};
 function worldVisible(n){for(let a=n;a;a=a.parent)if(!a.visible)return false;return true;}
 function uv(p){const q=p.clone().project(s.camera);return [(q.x+1)*W/2,(1-q.y)*H/2,q.z];}
 function sampleVisible(points,id){let hits=0;for(const p of points){const [u,v,z]=uv(p);if(z< -1||z>1)continue;let found=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=Math.round(u)+dx,y=Math.round(v)+dy;if(x>=0&&x<W&&y>=0&&y<H&&pixels[((H-1-y)*W+x)*4]===id)found=true;}if(found)hits++;}return hits/points.length;}
 function projectedBox(center,radius,below,above){const ps=[];for(const x of [-radius,radius])for(const y of [-below,above])for(const z of [-radius,radius])ps.push(uv(center.clone().add(new T.Vector3(x,y,z))));const b=[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))];return b.map((v,i)=>Math.max(0,Math.min(i%2?H:W,v)));}
 function objectLabel(o,id,cls,center,radius,below,above){const ring=[];for(let i=0;i<raySamples;i++){const a=2*Math.PI*i/raySamples;ring.push(center.clone().add(new T.Vector3(Math.cos(a)*radius,-.00012,Math.sin(a)*radius)));}
 const vis=sampleVisible(ring,id),p=uv(center),b=projectedBox(center,radius*1.15,below,above);
 let own=0;for(let y=Math.floor(b[1]);y<Math.ceil(b[3]);y+=2)for(let x=Math.floor(b[0]);x<Math.ceil(b[2]);x+=2){if(x>=0&&y>=0&&x<W&&y<H&&pixels[((H-1-y)*W+x)*4]===id)own++;}
 const inFrame=p[0]>2&&p[0]<W-2&&p[1]>2&&p[1]<H-2&&p[2]>-1&&p[2]<1;
 return {class_id:cls,instance_id:o.userData.sourcePart||'nozzle',center_world:center.toArray(),center_uv:p.slice(0,2),bbox_xyxy:b,rim_visible_fraction:vis,proxy_surface_pixels_sampled:own,in_frame:inFrame,keypoint_supervised:inFrame&&vis>=.25,include_detection:inFrame&&own>=3&&(b[2]-b[0])>=3&&(b[3]-b[1])>=3};}
 function setup(seed){const r=randGen(seed),range=(a,b)=>a+(b-a)*r();
 root.position.set(range(-.12,.12),.62993,range(-.035,.05));root.rotation.y=range(-.65,.65);
 for(const v of mats.values()){v.m.opacity=v.opacity;v.m.roughness=v.roughness;if(v.color)v.m.color.copy(v.color);}
 const opacity=range(.12,.52),roughness=range(.15,.38),shellOpacity=range(.2,.52);
 for(const {m} of mats.values()){if(m.name.startsWith('PP tips')){m.opacity=opacity;m.roughness=roughness;}if(m.name.startsWith('Frosted PP'))m.opacity=shellOpacity;if(m.name==='Blue molded plastic')m.color.setHSL(range(.56,.64),range(.55,.9),range(.22,.4));}
 const occupancy=r()<.12?96:Math.floor(range(8,70));const chosen=[...tips].sort(()=>0);for(let i=chosen.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
 const occupied=new Set(chosen.slice(0,occupancy));const edge=tips.filter(o=>/_[AH]\d\d$/.test(o.userData.sourcePart));const target=edge[Math.floor(r()*edge.length)];occupied.add(target);tips.forEach(o=>o.visible=occupied.has(o));
 root.updateMatrixWorld(true);const mouth=root.localToWorld(localCenters.get(target).clone());
 const front=target.userData.sourcePart.includes('_H');gun.rotation.set(0,root.rotation.y+(front?Math.PI/2:-Math.PI/2)+range(-.45,.45),0);gun.position.set(0,0,0);gun.updateMatrixWorld(true);
 const gap=range(.006,.045),dx=range(-.006,.006),dz=range(-.005,.005);const offset=new T.Vector3(dx,0,dz).applyAxisAngle(new T.Vector3(0,1,0),root.rotation.y);
 const nozz=gun.children[0].localToWorld(new T.Vector3(.05425,-.058,0));gun.position.copy(mouth.clone().add(offset).add(new T.Vector3(0,gap,0)).sub(nozz));gun.updateMatrixWorld(true);
 s.key.intensity=range(1.0,3.4);s.key.position.set(range(-.6,.6),range(.98,1.2),range(-.05,.5));s.key.color.setRGB(1,range(.86,1),range(.75,1));s.fill.intensity=range(.015,.16);s.renderer.toneMappingExposure=range(.5,.95);
 sceneInfo={seed,tip_opacity:opacity,tip_roughness:roughness,shell_opacity:shellOpacity,occupied:[...occupied].map(o=>o.userData.sourcePart),target:target.userData.sourcePart,gap_m:gap,offset_local_m:[dx,0,dz],rack_position:root.position.toArray(),rack_yaw:root.rotation.y,gun_position:gun.position.toArray(),gun_yaw:gun.rotation.y,exposure:s.renderer.toneMappingExposure,key_intensity:s.key.intensity,fill_intensity:s.fill.intensity,key_position:s.key.position.toArray(),key_color:s.key.color.toArray()};return sceneInfo;}
 function capture(seed){const r=randGen(seed),range=(a,b)=>a+(b-a)*r(),angle=range(-1.65,1.65),dist=range(.32,.5);root.updateMatrixWorld(true);const target=root.localToWorld(new T.Vector3(0,.13,0));const elevation=range(-.012,.13);s.camera.position.set(target.x+Math.sin(angle)*dist,target.y+elevation,target.z+Math.cos(angle)*dist);s.camera.lookAt(target);s.camera.fov=range(38,50);s.camera.aspect=W/H;s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld(true);s.scene.updateMatrixWorld(true);
 s.renderer.setPixelRatio(1);s.renderer.setSize(W,H,false);s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);const rgb=s.renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1];
 for(const p of proxies){p.proxy.matrix.copy(p.source.matrixWorld);p.proxy.visible=worldVisible(p.source);}
 const tm=s.renderer.toneMapping,exp=s.renderer.toneMappingExposure;s.renderer.toneMapping=T.NoToneMapping;s.renderer.toneMappingExposure=1;s.renderer.setRenderTarget(rt);s.renderer.render(ids,s.camera);s.renderer.readRenderTargetPixels(rt,0,0,W,H,pixels);s.renderer.setRenderTarget(null);s.renderer.toneMapping=tm;s.renderer.toneMappingExposure=exp;
 const labels=[];tips.forEach((o,i)=>{if(o.visible)labels.push(objectLabel(o,i+1,0,root.localToWorld(localCenters.get(o).clone()),.00402,.0058,.00025));});
 labels.push(objectLabel(gun,100,1,gun.children[0].localToWorld(new T.Vector3(.05425,-.058,0)),.00835,0,.011));
 return {rgb,meta:{...sceneInfo,view_seed:seed,width:W,height:H,camera_position:s.camera.position.toArray(),camera_target:target.toArray(),fov:s.camera.fov,world_to_camera:s.camera.matrixWorldInverse.toArray(),projection:s.camera.projectionMatrix.toArray(),labels,visibility_method:'opaque proxy instance-ID render; 16 rim samples, 3x3 tolerance; conservative for transparent objects'}};
 }
 window.syntheticDataset={setup,capture};return {tips:tips.length,width:W,height:H};
}
