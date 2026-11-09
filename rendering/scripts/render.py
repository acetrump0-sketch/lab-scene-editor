from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw
import json,zipfile,math,os
ROOT=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('RENDER_OUTPUT',str(ROOT/'output')));out.mkdir(parents=True,exist_ok=True)
source=ROOT/'scenes/horizontal.json';original=json.loads(source.read_text())
views=[('01_level_front',[0,.765,.565],42),('02_level_right30',[.24,.765,.501],42),('03_level_left30',[-.24,.765,.501],42),('04_level_right60',[.416,.765,.325],42),('05_level_left60',[-.416,.765,.325],42),('06_level_right90',[.48,.765,.085],42),('07_low_angle_right',[.24,.80,.501],42),('08_low_angle_left',[-.24,.80,.501],42)]
target=[0,.765,.085]
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist'])
 page=b.new_page(viewport={'width':1600,'height':1100},accept_downloads=True)
 page.goto(os.environ.get('RENDER_URL','http://127.0.0.1:8792/rendering/engine/'),wait_until='networkidle');page.wait_for_function('window.labStudio?.ready',timeout=120000)
 page.set_input_files('#loadFile',str(source))
 page.wait_for_function("labStudio.objects().filter(o=>o.userData.kind==='tips2000_tip').length===23 && labStudio.objects().some(o=>o.userData.kind==='cad_714a4575')",timeout=120000)
 page.wait_for_function("!document.getElementById('load').disabled",timeout=120000)
 page.evaluate("()=>{labStudio.select(null);labStudio.cabinet.traverse(n=>{if(n.name==='WINDOW_MOVING')n.visible=false;});document.getElementById('guides').checked=false;}")
 alignment=page.evaluate("""async()=>{const T=await import('../../vendor/three.module.js');const a=labStudio.objects().find(o=>o.userData.kind==='cad_714a4575');a.updateMatrixWorld(true);const n=a.children[0].localToWorld(new T.Vector3(.05425,-.058,0));const tip=labStudio.objects().find(o=>o.userData.sourcePart==='Tip_2000uL_H11');const b=new T.Box3().setFromObject(tip),c=b.getCenter(new T.Vector3());return {gap:n.y-b.max.y,lateral:Math.hypot(n.x-c.x,n.z-c.z),asset:a.userData.assetFile};}""")
 assert abs(alignment['gap']-.015)<1e-7 and alignment['lateral']<1e-7,alignment
 (out/'nozzle_alignment.json').write_text(json.dumps(alignment,indent=2))
 coordinates=page.evaluate((ROOT/'scripts/box_coordinates.js').read_text())
 slots={x['name']:x for x in coordinates['slots']}
 coordinates['matrixIndexing']={'rows':list('ABCDEFGH'),'columns':list(range(1,13)),'arrayIndex':'zero-based: [7][10] = H11'}
 coordinates['occupancyMatrix']=[[int(slots[f'{r}{c:02}']['occupied']) for c in range(1,13)] for r in 'ABCDEFGH']
 coordinates['holeCoordinateMatrixMM']=[[slots[f'{r}{c:02}']['boxMM'] for c in range(1,13)] for r in 'ABCDEFGH']
 assert sum(map(sum,coordinates['occupancyMatrix']))==23
 (out/'coordinate_system.json').write_text(json.dumps(coordinates,ensure_ascii=False,indent=2))
 before=page.evaluate('labStudio.snapshot().objects')
 expected={o['id']:o for o in original['objects']}
 for o in before:
  for k in ['position','quaternion','scale']:
   assert all(abs(a-b)<1e-8 for a,b in zip(o[k],expected[o['id']][k])),(o['id'],k)
 page.select_option('#resolution','3840')
 for name,pos,fov in views:
  page.evaluate('''({pos,target,fov})=>{const c=labStudio.camera;c.position.fromArray(pos);c.lookAt(...target);c.fov=fov;c.updateProjectionMatrix();}''',dict(pos=pos,target=target,fov=fov))
  with page.expect_download(timeout=120000) as dl:page.evaluate('labStudio.exportDataset(1)')
  tmp=out/'tmp.zip';dl.value.save_as(tmp)
  with zipfile.ZipFile(tmp) as z:
   (out/(name+'.png')).write_bytes(z.read('rgb/0000.png'))
   (out/(name+'_camera.json')).write_bytes(z.read('annotations/0000.json'))
  tmp.unlink();print('rendered',name,flush=True)
 after=page.evaluate('labStudio.snapshot().objects')
 assert before==after,'Scene objects changed'
 original['appearance']=page.evaluate('labStudio.appearance.settings()')
 b.close()
(out/'scene.json').write_text(json.dumps(original,ensure_ascii=False,indent=2))
(out/'verification.json').write_text(json.dumps({'objectTransformsUnchanged':True,'objects':len(before),'tipCount':23,'nozzleGapMeters':.015,'sourceScene':'rendering/scenes/horizontal.json','views':views,'target':target,'resolution':[3840,2880]},indent=2))
canvas=Image.new('RGB',(1600,990),'#e8ecef');draw=ImageDraw.Draw(canvas)
for i,(name,_,_) in enumerate(views):
 im=Image.open(out/(name+'.png'));im.thumbnail((400,300));x=i%4*400;y=i//4*330;canvas.paste(im,(x,y));draw.text((x+10,y+308),name,fill='#17232c')
canvas.save(out/'contact_sheet.jpg',quality=92)
with zipfile.ZipFile(out/'all_views_4k.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in out.iterdir():
  if f.suffix!='.zip':z.write(f,f.name)
print('Verified unchanged arrangement and rendered horizontal views',flush=True)
