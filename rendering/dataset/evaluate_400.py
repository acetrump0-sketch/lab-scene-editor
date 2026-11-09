from pathlib import Path
import json,time,numpy as np
from scipy.optimize import linear_sum_assignment
from ultralytics import YOLO
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent;out=ROOT/'evaluation_400';out.mkdir(exist_ok=True)
model=YOLO(str(ROOT/'runs/pose_400/weights/best.pt'));rows=[];single={0:[],1:[]};pair_errors=[];nearest=[];eligible_pairs=0;eligible_points={0:0,1:0};matched_points={0:0,1:0};detections={0:0,1:0};matched_boxes={0:0,1:0};gt_boxes={0:0,1:0};latency=[]
def iou(a,b):
 lo=np.maximum(a[:2],b[:2]);hi=np.minimum(a[2:],b[2:]);inter=np.prod(np.maximum(hi-lo,0));return float(inter/max(1e-8,np.prod(np.maximum(np.array(a[2:])-a[:2],0))+np.prod(np.maximum(np.array(b[2:])-b[:2],0))-inter))
files=sorted((ROOT/'metadata/test').glob('*.json'))
for ix,path in enumerate(files):
 meta=json.loads(path.read_text());image=ROOT/'images/test'/(path.stem+'.jpg');t=time.perf_counter();r=model.predict(str(image),imgsz=960,conf=.25,iou=.5,device=0,verbose=False,max_det=200)[0];latency.append(time.perf_counter()-t)
 preds=[]
 if r.boxes is not None:
  for j,b in enumerate(r.boxes):
   k=r.keypoints.data[j,0].cpu().numpy();preds.append({'class_id':int(b.cls.item()),'bbox':b.xyxy[0].cpu().numpy().tolist(),'confidence':float(b.conf.item()),'uv':k[:2].tolist(),'keypoint_confidence':float(k[2]) if len(k)>2 else 1.})
 gt=[o for o in meta['labels'] if o['include_detection']];matches={}
 for cls in [0,1]:
  gi=[i for i,o in enumerate(gt) if o['class_id']==cls];pi=[i for i,o in enumerate(preds) if o['class_id']==cls];detections[cls]+=len(pi);gt_boxes[cls]+=len(gi)
  for g in gi:
   if gt[g]['keypoint_supervised']:eligible_points[cls]+=1
  if gi and pi:
   costs=np.array([[1-iou(gt[g]['bbox_xyxy'],preds[p]['bbox']) for p in pi] for g in gi]);rr,cc=linear_sum_assignment(costs)
   for a,b in zip(rr,cc):
    if costs[a,b]>.7:continue
    g,p=gi[a],pi[b];matched_boxes[cls]+=1
    if gt[g]['keypoint_supervised'] and preds[p]['keypoint_confidence']>=.25:
     matches[g]=p;matched_points[cls]+=1;single[cls].append(float(np.linalg.norm(np.array(preds[p]['uv'])-gt[g]['center_uv'])))
 nozz=next((i for i,o in enumerate(gt) if o['class_id']==1 and o['keypoint_supervised']),None);framepairs=[]
 if nozz is not None:
  for g,o in enumerate(gt):
   if o['class_id']!=0 or not o['keypoint_supervised']:continue
   eligible_pairs+=1
   if g in matches and nozz in matches:
    delta=np.array(preds[matches[nozz]]['uv'])-preds[matches[g]]['uv'];actual=np.array(gt[nozz]['center_uv'])-o['center_uv'];err=delta-actual;pair_errors.append(err.tolist());framepairs.append({'instance':o['instance_id'],'delta_gt':actual.tolist(),'delta_pred':delta.tolist(),'error':err.tolist(),'error_l2':float(np.linalg.norm(err))})
  nearest_gt=min([o for o in meta['labels'] if o['class_id']==0],key=lambda o:np.linalg.norm(np.array(o['center_world'])-gt[nozz]['center_world']))
  near_idx=next((g for g,o in enumerate(gt) if o['instance_id']==nearest_gt['instance_id'] and o['keypoint_supervised']),None)
  if near_idx is not None:
   error=next((q['error_l2'] for q in framepairs if q['instance']==nearest_gt['instance_id']),None);nearest.append(error)
 rows.append({'image':image.name,'predictions':preds,'matched_points':len(matches),'pairs':framepairs,'nozzle_gt_eligible':nozz is not None})
 if ix in [0,10,30,60,100,140,180,199]:
  im=Image.open(image);d=ImageDraw.Draw(im)
  for o in gt:
   if o['keypoint_supervised']:
    u,v=o['center_uv'];d.ellipse((u-3,v-3,u+3,v+3),outline='lime',width=2)
  for o in preds:
   u,v=o['uv'];d.line((u-4,v,u+4,v),fill='red',width=2);d.line((u,v-4,u,v+4),fill='red',width=2)
  im.save(out/(path.stem+'_prediction.jpg'))
 if ix%20==0:print('evaluated',ix+1,len(files),flush=True)
def quant(x):
 return None if not len(x) else {'mean':float(np.mean(x)),'median':float(np.median(x)),'p90':float(np.percentile(x,90)),'p95':float(np.percentile(x,95))}
errors=np.array(pair_errors);norm=np.linalg.norm(errors,axis=1) if len(errors) else np.array([])
summary={'images':len(files),'resolution':[1280,960],'inference_imgsz':960,'model':'YOLO26n-pose, one keypoint per instance, two classes','match_rule':'class-wise Hungarian box IoU >= 0.3; detection confidence >=.25; keypoint confidence >=.25','visibility':'opaque proxy rim >=25%; not measured optical visibility','eligible_keypoints':eligible_points,'matched_keypoints':matched_points,'single_center_error_px':{str(c):quant(single[c]) for c in [0,1]},'box_counts':{'gt':gt_boxes,'predicted':detections,'matched':matched_boxes},'eligible_pairs':eligible_pairs,'matched_pairs':len(errors),'pair_coverage':len(errors)/max(eligible_pairs,1),'delta_error_l2_px':quant(norm),'delta_xy_mae_px':np.abs(errors).mean(axis=0).tolist() if len(errors) else None,'delta_xy_bias_px':errors.mean(axis=0).tolist() if len(errors) else None,'pair_success_all_eligible':{str(t):float((norm<=t).sum()/max(eligible_pairs,1)) for t in [2,5,10]},'nearest_pair_eligible_frames':len(nearest),'nearest_pair_success':{str(t):sum(e is not None and e<=t for e in nearest)/max(len(nearest),1) for t in [2,5,10]},'latency_seconds_excluding_first':quant(latency[1:]),'scope':'held-out randomized scenes of same mesh and renderer; not real-photo accuracy; offline GT matching does not establish deployable slot assignment'}
(out/'summary.json').write_text(json.dumps(summary,indent=2));(out/'predictions.json').write_text(json.dumps(rows,separators=(',',':')));print(json.dumps(summary,indent=2),flush=True)
