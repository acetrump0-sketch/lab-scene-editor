from pathlib import Path
import numpy as np,json,zipfile,io,hashlib
from PIL import Image
from scipy.ndimage import gaussian_filter1d,binary_closing,label
from scipy.signal import find_peaks
import argparse
parser=argparse.ArgumentParser(description='Build opacity-only cleaned SOG and supported scan-plane proxies from decoded NPZ caches.')
parser.add_argument('--decoded-root',type=Path,required=True,help='Directory containing scene1_denoise/decoded.npz and scene2_denoise/decoded.npz')
args=parser.parse_args()
p=Path(__file__).resolve().parents[1];defs=json.loads((p/'v16/scenes.json').read_text())['scenes'];reports=[]
for folder,e in zip(['scene1_denoise','scene2_denoise'],defs):
 data=np.load(args.decoded_root/folder/'decoded.npz');raw=data['p'];a=data['alpha'];s=np.sort(data['scales'],axis=1);dist=data['d'];median=float(np.median(dist));factor=median/.03310168
 # Keep thin surfaces; remove only with opacity+density or opacity+3D thickness evidence.
 diffuse=(s[:,0]>.018*factor)&(s[:,0]/np.maximum(s[:,2],1e-9)>.20)&(s[:,2]>.09*factor)&(a<.60)
 isolated=(dist>max(.18*factor,np.quantile(dist,.97)))&(a<.65)
 extreme=(dist>np.quantile(dist,.998))&(a<.85)
 mask=diffuse|isolated|extreme
 jobs=[('reference.sog','scenes/original/reference_clean_v2.sog'),('environment_without_scanned_cabinet.sog','scenes/original/environment_clean_v2.sog')] if e['id']=='original' else [('scenes/scene2/environment.sog','scenes/scene2/environment_clean_v2.sog')]
 stats=[]
 for src,dest in jobs:
  src=p/'v16'/src;dst=p/'v16'/dest
  with zipfile.ZipFile(src) as z:
   rgba=np.array(Image.open(io.BytesIO(z.read('sh0.webp'))).convert('RGBA'));flat=rgba.reshape(-1,4)[:len(mask)];prior=flat[:,3].copy();flat[mask,3]=0
   b=io.BytesIO();Image.fromarray(rgba).save(b,format='WEBP',lossless=True,exact=True)
   with zipfile.ZipFile(dst,'w',compression=zipfile.ZIP_STORED) as out:
    for name in z.namelist():out.writestr(name,b.getvalue() if name=='sh0.webp' else z.read(name))
   with zipfile.ZipFile(dst) as new:
    assert all(z.read(name)==new.read(name) for name in z.namelist() if name!='sh0.webp')
    edited=np.array(Image.open(io.BytesIO(new.read('sh0.webp'))).convert('RGBA')).reshape(-1,4)[:len(mask)];assert np.array_equal(edited[:,:3],flat[:,:3]);assert np.array_equal(edited[~mask,3],prior[~mask])
  stats.append({'source':str(src.relative_to(p)),'output':str(dst.relative_to(p)),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'newlyHidden':int(np.sum(mask&(prior>0)))})
 report={'scene':e['id'],'total':len(mask),'candidateCount':int(mask.sum()),'fraction':float(mask.mean()),'rules':{'diffuseVolume':int(diffuse.sum()),'sparseLowOpacity':int(isolated.sum()),'extremeSparse':int(extreme.sum())},'outputs':stats,'method':'Opacity-only masking; requires opacity and spatial evidence. Thin surfaces protected from diffuse rule. Surviving geometry, covariance, colors and SH byte-identical.','limitations':'Not semantic deletion. Dense ghosts may remain. Original scans preserved.'};reports.append(report)
 print(e['id'],report['candidateCount'],flush=True)
 if e['id']!='original':continue
 M=np.array(e['matrix']).reshape(4,4,order='F');world=raw@M[:3,:3].T+M[:3,3]
 keep=(a>.7)&(~mask)&(dist<np.quantile(dist,.85))
 # Exclude the scanned cabinet already replaced by the editable mesh.
 keep&=~((raw[:,0]>.05)&(raw[:,0]<1.65)&(raw[:,1]>-1.45)&(raw[:,1]<2.75)&(raw[:,2]>-2.25)&(raw[:,2]<1.1))
 pts=world[keep];lo,hi=np.percentile(pts,[1,99],axis=0);proxies=[];step=.12
 for axis in [1,0,2]:
  edges=np.arange(lo[axis],hi[axis]+.025,.025);hist,_=np.histogram(pts[:,axis],edges);smooth=gaussian_filter1d(hist.astype(float),1)
  peaks,_=find_peaks(smooth,prominence=max(150,float(smooth.max())*.05),distance=8)
  for peak in sorted(peaks,key=lambda i:hist[i],reverse=True)[:10]:
   c=(edges[peak]+edges[peak+1])/2;sel=np.abs(pts[:,axis]-c)<.025;patch=pts[sel];other=[i for i in range(3) if i!=axis]
   start=np.floor(lo[other]/step)*step;shape=np.ceil((hi[other]-start)/step).astype(int)+1;uv=np.floor((patch[:,other]-start)/step).astype(int);ok=np.all((uv>=0)&(uv<shape),axis=1);uv=uv[ok];counts=np.zeros(shape,dtype=int);np.add.at(counts,(uv[:,0],uv[:,1]),1)
   occupied=counts>=3;components,n=label(occupied)
   for comp in range(1,n+1):
    cells=np.argwhere(components==comp)
    if len(cells)<12:continue
    sizes=(cells.max(0)-cells.min(0)+1)*step
    if axis!=1 and (sizes[other.index(1)]<.8 or sizes.min()<.35):continue
    if axis==1 and sizes.min()<.35:continue
    category='地面' if axis==1 and abs(c)<.15 else '顶面' if axis==1 and c>2.4 else '台面/水平结构' if axis==1 else '墙壁/立面结构'
    # Greedy rectangle tiling preserves observed gaps instead of filling a component AABB.
    grid=(components==comp).copy();rects=[]
    while grid.any():
     u,v=np.argwhere(grid)[0];end=v
     while end+1<grid.shape[1] and grid[u,end+1]:end+=1
     endu=u
     while endu+1<grid.shape[0] and grid[endu+1,v:end+1].all():endu+=1
     grid[u:endu+1,v:end+1]=False
     mn=np.zeros(3);mx=np.zeros(3);mn[axis]=c-.025;mx[axis]=c+.025
     mn[other]=start+np.array([u,v])*step;mx[other]=start+np.array([endu+1,end+1])*step
     rects.append({'min':mn.tolist(),'max':mx.tolist()})
    proxies.append({'id':'scan_plane_'+str(len(proxies)+1),'label':category+' '+str(len(proxies)+1),'category':category,'axis':axis,'planeCoordinate':float(c),'supportPoints':int(counts[components==comp].sum()),'observedArea':float(len(cells)*step*step),'boxes':rects,'source':'high-opacity scanned surface support; gaps retained'})
 out={'version':1,'sceneId':'original','baselineMatrix':e['matrix'],'metricScaleVerified':False,'method':'Axis-aligned histogram planes + connected supported cells + rectangle tiling; not full semantic reconstruction.','proxies':proxies}
 (p/'v16/scenes/original/collision_surfaces.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('proxies',len(proxies),'boxes',sum(len(o['boxes']) for o in proxies),flush=True)
(p/'v16/cleanup_audit_v2.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
