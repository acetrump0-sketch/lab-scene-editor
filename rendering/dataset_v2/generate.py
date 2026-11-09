from pathlib import Path
from playwright.sync_api import sync_playwright
import json,base64,time,os
ROOT=Path(__file__).resolve().parent
root=Path(os.environ.get('DATASET_OUTPUT',str(ROOT/'output')));root.mkdir(exist_ok=True)
for split in ['train','val','test']:
 for kind in ['images','labels','metadata']:(root/kind/split).mkdir(parents=True,exist_ok=True)
t0=time.time();total=int(os.environ.get('SCENE_COUNT','2000'))
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist'])
 page=b.new_page(viewport={'width':1280,'height':960});page.goto(os.environ.get('RENDER_URL','http://127.0.0.1:8792/rendering/engine/'),wait_until='networkidle');page.wait_for_function('window.labStudio?.ready',timeout=120000)
 print(page.evaluate((ROOT/'domain_randomization.js').read_text()),flush=True)
 for scene in range(total):
  split='train' if scene<1600 else 'val' if scene<1800 else 'test'
  if all((root/'metadata'/split/f's{scene:04d}_v{v}.json').exists() for v in range(2)):continue
  page.evaluate('(s)=>syntheticDataset.setup(s)',302611090+scene*101)
  for view in range(2):
   name=f's{scene:04d}_v{view}';d=page.evaluate('(s)=>syntheticDataset.capture(s)',1998271+scene*103+view*7919);m=d['meta'];m.update(scene_id=scene,split=split)
   (root/'images'/split/(name+'.jpg')).write_bytes(base64.b64decode(d['rgb']))
   lines=[]
   for o in m['labels']:
    if not o['include_detection']:continue
    x1,y1,x2,y2=o['bbox_xyxy'];u,v=o['center_uv'];vis=2 if o['keypoint_supervised'] else 0
    lines.append(f"{o['class_id']} {(x1+x2)/2/1280:.8f} {(y1+y2)/2/960:.8f} {(x2-x1)/1280:.8f} {(y2-y1)/960:.8f} {u/1280:.8f} {v/960:.8f} {vis}")
   (root/'labels'/split/(name+'.txt')).write_text('\n'.join(lines)+'\n')
   (root/'metadata'/split/(name+'.json')).write_text(json.dumps(m,separators=(',',':')))
  if scene%10==0:print(f'scenes={scene+1}/{total} images={(scene+1)*2} elapsed={time.time()-t0:.1f}s',flush=True)
 b.close()
print('COMPLETE',time.time()-t0,flush=True)
