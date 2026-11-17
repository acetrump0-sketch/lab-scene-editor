import * as THREE from 'three';

// Six degrees of freedom. Rotations are local quaternion increments, avoiding
// Euler singularities while flying. Numeric fields use YXZ Euler angles.
export function createNavigation({camera,orbit,transform,canvas,onEnter}) {
 const $=id=>document.getElementById(id),keys=new Set();
 let enabled=false,dragging=false,last=performance.now(),refresh=0;
 const forward=new THREE.Vector3(),up=new THREE.Vector3(),delta=new THREE.Vector3();
 const fields=['x','y','z','pitch','yaw','roll'];
 const editable=e=>e.target.closest?.('input,select,textarea,[contenteditable="true"]');
 function sync(){
  camera.getWorldDirection(forward);orbit.target.copy(camera.position).add(forward);
  camera.up.copy(up.set(0,1,0).applyQuaternion(camera.quaternion));
 }
 function display(){
  const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');
  const values=[...camera.position.toArray(),...['x','y','z'].map(k=>THREE.MathUtils.radToDeg(e[k]))];
  fields.forEach((k,i)=>{if(document.activeElement!==$('nav_'+k))$('nav_'+k).value=values[i].toFixed(i<3?4:2);});
 }
 function release(){keys.clear();dragging=false;}
 function setEnabled(value){
  release();enabled=value;orbit.enabled=!enabled;transform.enabled=!enabled;
  if(enabled){onEnter();sync();}else if(document.pointerLockElement===canvas)document.exitPointerLock();
  $('flyMode').classList.toggle('active',enabled);$('flyMode').textContent=enabled?'退出自由探索':'进入自由探索';
  $('hint').textContent=enabled?'WASD 移动 · 空格/C 升降 · Q/E 滚转 · 方向键转向 · Shift 加速 · 拖动画面看向 · Esc 退出':'左键环绕 · 右键平移 · 滚轮缩放 · 点击器材选择';
  display();
 }
 $('flyMode').onclick=()=>setEnabled(!enabled);
 $('lockLook').onclick=async()=>{setEnabled(true);try{await canvas.requestPointerLock();}catch{$('hint').textContent='鼠标锁定不可用，请按住画面拖动转向。';}};
 document.addEventListener('pointerlockerror',()=>{$('hint').textContent='鼠标锁定不可用，请按住画面拖动转向。';});
 let wasLocked=false;
 document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;release();if(wasLocked&&!locked)setEnabled(false);wasLocked=locked;});
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
 const codes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','KeyC','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 window.addEventListener('keydown',e=>{
  if(!enabled||editable(e))return;
  if(e.code==='Escape'){setEnabled(false);return;}
  if(codes.has(e.code)){keys.add(e.code);e.preventDefault();e.stopImmediatePropagation();}
 },true);
 window.addEventListener('keyup',e=>keys.delete(e.code),true);
 document.addEventListener('focusin',e=>{if(editable(e))release();});
 canvas.addEventListener('pointerdown',e=>{if(!enabled)return;e.preventDefault();e.stopImmediatePropagation();dragging=true;canvas.setPointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointerup',e=>{if(!enabled)return;dragging=false;e.stopImmediatePropagation();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointercancel',release,true);
 function look(e){camera.rotateY(-e.movementX*.002);camera.rotateX(-e.movementY*.002);sync();e.stopImmediatePropagation();}
 canvas.addEventListener('pointermove',e=>{if(enabled&&dragging&&document.pointerLockElement!==canvas)look(e);},true);
 document.addEventListener('mousemove',e=>{if(enabled&&document.pointerLockElement===canvas)look(e);},true);
 canvas.addEventListener('wheel',e=>{if(enabled){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
 canvas.addEventListener('contextmenu',e=>{if(enabled)e.preventDefault();});
 $('applyCameraPose').onclick=()=>{
  const v=fields.map(k=>Number($('nav_'+k).value));if(!v.every(Number.isFinite))return;
  setEnabled(true);camera.position.set(...v.slice(0,3));camera.quaternion.setFromEuler(new THREE.Euler(...v.slice(3).map(THREE.MathUtils.degToRad),'YXZ'));sync();display();
 };
 $('levelCamera').onclick=()=>{const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');e.z=0;camera.quaternion.setFromEuler(e);sync();display();};
 function update(){
  const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;
  if(enabled){
   orbit.enabled=false;transform.enabled=false;
   const n=k=>keys.has(k)?1:0,speed=THREE.MathUtils.clamp(Number($('flySpeed').value)||.5,.01,20)*(n('ShiftLeft')||n('ShiftRight')?4:1);
   delta.set(n('KeyD')-n('KeyA'),n('Space')-n('KeyC'),n('KeyS')-n('KeyW'));
   if(delta.lengthSq())camera.position.add(delta.normalize().applyQuaternion(camera.quaternion).multiplyScalar(speed*dt));
   camera.rotateX((n('ArrowUp')-n('ArrowDown'))*dt);camera.rotateY((n('ArrowLeft')-n('ArrowRight'))*dt);camera.rotateZ((n('KeyQ')-n('KeyE'))*dt);
   sync();
  }
  if(now-refresh>150){display();refresh=now;}
 }
 return {update,setEnabled,sync,get enabled(){return enabled;}};
}
