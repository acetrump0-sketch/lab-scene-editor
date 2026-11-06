from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,zipfile,numpy as np,os
ROOT=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('RENDER_OUTPUT',str(ROOT/'output')));data=json.loads((out/'coordinate_system.json').read_text())
font=os.environ.get('ANNOTATION_FONT','/System/Library/Fonts/PingFang.ttc')
if not Path(font).exists():raise SystemExit('Set ANNOTATION_FONT to a Chinese-capable .ttf/.ttc/.otf font')
def ft(n):return ImageFont.truetype(font,n)
def fmt(v):return '('+', '.join(f'{x:.2f}' for x in v)+')'
def arrow(d,a,b,color,width=7):
 d.line([a,b],fill=color,width=width);ang=math.atan2(b[1]-a[1],b[0]-a[0]);r=20
 d.polygon([b,(b[0]-r*math.cos(ang-.45),b[1]-r*math.sin(ang-.45)),(b[0]-r*math.cos(ang+.45),b[1]-r*math.sin(ang+.45))],fill=color)
labels=['正面水平','右前方 30° · 水平','左前方 30° · 水平','右侧 60° · 水平','左侧 60° · 水平','右侧 90° · 水平','右前方 · 约 4° 俯角','左前方 · 约 4° 俯角']
paths=sorted(p for p in out.glob('*.png') if not p.name.endswith('_annotated.png'))
ann=[]
for i,p in enumerate(paths):
 cam=json.loads((out/(p.stem+'_camera.json')).read_text());mat=np.array(cam['worldToCamera']).reshape((4,4),order='F');K=np.array(cam['K']);scale=.725;offset=np.array([0,300])
 def rawproj(w):
  v=mat@np.array([*w,1]);return np.array([K[0,0]*v[0]/(-v[2])+K[0,2],K[1,2]-K[1,1]*v[1]/(-v[2])])
 def proj(w):return tuple(rawproj(w)*scale+offset)
 im=Image.new('RGB',(3840,2880),'#f3f6fa');render=Image.open(p).convert('RGB').resize((2784,2088),Image.Resampling.LANCZOS);im.paste(render,(0,300));d=ImageDraw.Draw(im)
 d.text((75,55),f'{i+1:02d}  {labels[i]}',font=ft(65),fill='#152d43')
 d.text((78,165),'固定排列 · 23 支枪头 · 枪口与最近枪头的三维相对位置',font=ft(35),fill='#43596b')
 n=proj(data['nozzle']['world']);t=proj(data['selected']['world']);o=proj(data['originWorld'])
 for pt,c in [(n,'#e97022'),(t,'#19a398')]:d.ellipse((pt[0]-14,pt[1]-14,pt[0]+14,pt[1]+14),fill=c,outline='white',width=4)
 d.line([n,t],fill='#e97022',width=7)
 for pt,text,col,dy in [(n,'枪口中心 N','#a7440a',-95),(t,'H11 口沿中心 T','#08766d',40)]:
  end=(pt[0]+175,pt[1]+dy);d.line([pt,end],fill=col,width=4);d.rounded_rectangle((end[0]-8,end[1]-10,end[0]+340,end[1]+55),radius=9,fill='white');d.text(end,text,font=ft(33),fill=col)
 for axis,delta,color in [('X',[.025,0,0],'#d64a45'),('Y',[0,0,-.025],'#249658'),('Z',[0,.025,0],'#326bc6')]:
  end=proj([a+b for a,b in zip(data['originWorld'],delta)]);arrow(d,o,end,color);d.text((end[0]+8,end[1]-35),axis,font=ft(40),fill=color)
 d.text((o[0]-70,o[1]+22),'O: H01',font=ft(30),fill='#152d43')
 d.rounded_rectangle((2820,40,3795,2800),radius=28,fill='white',outline='#d5dfe8',width=3)
 x=2860;d.text((x,90),'盒坐标系 / mm',font=ft(48),fill='#152d43')
 lines=['O：H01 孔中心 / 托盘上表面','X：第 1 列 → 第 12 列','Y：H 行 → A 行','Z：垂直向上（右手系）']
 for j,l in enumerate(lines):d.text((x,180+58*j),l,font=ft(31),fill='#43596b')
 d.text((x,470),'8 × 12 孔位矩阵',font=ft(43),fill='#152d43')
 gx=x+65;gy=605;step=69
 for c in range(12):d.text((gx+c*step-14,gy-63),str(c+1),font=ft(27),fill='#43596b')
 slots={s['name']:s for s in data['slots']}
 for r,row in enumerate('ABCDEFGH'):
  d.text((x,gy+r*step-19),row,font=ft(30),fill='#43596b')
  for c in range(12):
   name=f'{row}{c+1:02}';cx=gx+c*step;cy=gy+r*step;occupied=slots[name]['occupied'];col='#149b91' if occupied else '#e4eaf0';d.ellipse((cx-21,cy-21,cx+21,cy+21),fill=col)
   if name==data['selected']['name']:d.ellipse((cx-28,cy-28,cx+28,cy+28),outline='#e97022',width=6)
 d.text((x,1190),'绿色：有枪头   灰色：空孔',font=ft(29),fill='#43596b');d.text((x,1240),'橙圈：距枪口最近的 H11',font=ft(29),fill='#a7440a')
 d.text((x,1370),'三维测量',font=ft(43),fill='#152d43')
 measurements=[('枪头 T / H11',fmt(data['selected']['boxMM'])),('枪口 N',fmt(data['nozzle']['boxMM'])),('相对位移 Δ = N − T',fmt(data['deltaMM'])),('中心间距 |Δ|',f"{data['distanceMM']:.2f} mm")]
 for j,(title,val) in enumerate(measurements):
  d.text((x,1460+j*155),title,font=ft(31),fill='#52677a');d.text((x,1510+j*155),val,font=ft(41),fill='#152d43')
 d.text((x,2170),'矩阵索引',font=ft(40),fill='#152d43')
 d.text((x,2240),'M[row, col]，A–H / 1–12',font=ft(29),fill='#43596b')
 d.text((x,2300),'M[H, 11] = 当前被测枪头',font=ft(29),fill='#43596b')
 d.text((x,2430),'坐标单位为模型毫米；非实物标定。',font=ft(27),fill='#697c8a')
 d.text((x,2485),'测量点均为端面 / 口沿中心，',font=ft(27),fill='#697c8a');d.text((x,2530),'不是两物体表面的最短距离。',font=ft(27),fill='#697c8a')
 d.text((75,2460),'红 X / 绿 Y / 蓝 Z：盒体坐标轴；橙 N：枪口；青 T：枪头口沿。',font=ft(35),fill='#43596b')
 d.text((75,2530),'标记由三维坐标投影得到，遮挡时仍显示；并不表示该点在当前视角可见。',font=ft(33),fill='#697c8a')
 d.text((75,2640),'所有视角共用同一摆放：ΔX = 0.00 mm，ΔY = 0.00 mm，ΔZ = +15.00 mm。',font=ft(37),fill='#152d43')
 dest=out/(p.stem+'_annotated.png');im.save(dest);ann.append(dest)
 (out/(p.stem+'_measurement.json')).write_text(json.dumps({'coordinateSystem':'coordinate_system.json','selectedTip':data['selected']['name'],'tipPixelInRaw':rawproj(data['selected']['world']).tolist(),'nozzlePixelInRaw':rawproj(data['nozzle']['world']).tolist(),'tipPixelAnnotated':t,'nozzlePixelAnnotated':n,'deltaBoxMM':data['deltaMM'],'distanceMM':data['distanceMM'],'markers':'projected even when occluded'},indent=2))
canvas=Image.new('RGB',(1920,1440),'white')
for i,p in enumerate(ann):
 im=Image.open(p);im.thumbnail((480,720));canvas.paste(im,((i%4)*480,(i//4)*720))
canvas.save(out/'annotated_contact_sheet.jpg',quality=94)
(out/'README.txt').write_text('右手盒坐标系：H01孔中心在托盘上表面的投影为原点，X沿列1到12，Y从H行到A行，Z向上。coordinate_system.json记录96孔坐标、有无枪头、23支枪头口沿中心、枪口中心和变换矩阵。这里的移液管按当前场景唯一助吸器的蓝色枪口解释。最近关系在三维空间按中心间欧氏距离计算。标记以相机参数投影，遮挡时仍显示。两种坐标不要混淆：毫米坐标与视角无关；图片像素坐标随视角变化。尺寸为模型值，尚未实物标定。\n')
(out/'all_views_4k.zip').unlink(missing_ok=True)
with zipfile.ZipFile(out/'horizontal_annotated_views.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in out.iterdir():
  if p.is_file() and p.suffix!='.zip':z.write(p,p.name)
print('Annotated',len(ann),'views; selected',data['selected']['name'],'delta',data['deltaMM'])
