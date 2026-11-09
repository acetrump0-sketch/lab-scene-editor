from pathlib import Path
import os,json,time,torch
from ultralytics import YOLO
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
model=YOLO(str(ROOT/'yolo26n-pose.pt'))
start=time.time()
model.train(data=str(ROOT/'dataset_400.yaml'),epochs=50,patience=12,imgsz=960,batch=24,device=0,workers=6,project=str(ROOT/'runs'),name='pose_400',exist_ok=True,seed=20261109,deterministic=True,optimizer='AdamW',lr0=.001,cos_lr=True,amp=True,mosaic=0,mixup=0,copy_paste=0,degrees=0,translate=.03,scale=.1,fliplr=0,flipud=0,hsv_h=.01,hsv_s=.2,hsv_v=.2,plots=True,save=True,cache=False)
(ROOT/'training_400_complete.json').write_text(json.dumps({'seconds':time.time()-start,'best':str(ROOT/'runs/pose_400/weights/best.pt')},indent=2))
print('TRAINING_COMPLETE',flush=True)
