"""Predict mouth centers and pixel deltas without using GT or assuming slot identity."""
from pathlib import Path
import argparse,json
from ultralytics import YOLO
from PIL import Image,ImageDraw
p=argparse.ArgumentParser()
p.add_argument('--weights',required=True);p.add_argument('--image',required=True);p.add_argument('--output',required=True)
p.add_argument('--device',default='cpu');p.add_argument('--confidence',type=float,default=.25)
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
r=YOLO(a.weights).predict(a.image,imgsz=960,conf=a.confidence,iou=.5,max_det=200,device=a.device,verbose=False)[0]
points=[]
if r.boxes is not None and r.keypoints is not None:
    for i,box in enumerate(r.boxes):
        kp=r.keypoints.data[i,0].cpu().tolist()
        if len(kp)>2 and kp[2]<a.confidence:continue
        points.append({'class_id':int(box.cls.item()),'center_uv':kp[:2],'detection_confidence':float(box.conf.item()),'keypoint_confidence':kp[2] if len(kp)>2 else None})
tips=[x for x in points if x['class_id']==0];nozzles=[x for x in points if x['class_id']==1]
# The scene has one nozzle. Do not silently choose among multiple candidates.
pairs=[]
if len(nozzles)==1:
    n=nozzles[0]['center_uv']
    for i,t in enumerate(tips):
        u,v=t['center_uv'];pairs.append({'prediction_index':i,'tip_uv':[u,v],'nozzle_uv':n,'delta_u_px':n[0]-u,'delta_v_px':n[1]-v})
result={'image':str(Path(a.image).resolve()),'resolution':[r.orig_shape[1],r.orig_shape[0]],'status':'ok' if len(nozzles)==1 else 'no_nozzle' if not nozzles else 'ambiguous_nozzles','tips':tips,'nozzles':nozzles,'pairs':pairs,'note':'Original-image pixels, u right/v down. prediction_index is not a rack slot ID. No guaranteed recovery of occluded tips or metric distance.'}
(out/'predictions.json').write_text(json.dumps(result,indent=2))
im=Image.open(a.image).convert('RGB');d=ImageDraw.Draw(im)
for i,t in enumerate(tips):
    u,v=t['center_uv'];d.ellipse((u-3,v-3,u+3,v+3),outline='lime',width=2);d.text((u+4,v-12),str(i),fill='lime')
for n in nozzles:
    u,v=n['center_uv'];d.line((u-6,v,u+6,v),fill='orange',width=3);d.line((u,v-6,u,v+6),fill='orange',width=3)
im.save(out/'prediction.jpg',quality=95)
print(json.dumps({'status':result['status'],'tip_count':len(tips),'nozzle_count':len(nozzles),'pairs':len(pairs)}))
