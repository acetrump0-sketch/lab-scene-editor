from pathlib import Path
import json,tarfile,shutil,hashlib,math,os
from PIL import Image,ImageDraw
root=Path(os.environ['DATASET_OUTPUT']).resolve()
source=Path(__file__).resolve().parent
stats={};scene_sets={};hashes={};all_meta=[]
for split,expected in [('train',3200),('val',400),('test',400)]:
    paths=sorted((root/'metadata'/split).glob('*.json'))
    assert len(paths)==expected,(split,len(paths))
    scene_sets[split]=set();points=[0,0];dense=horizontal=empty=0
    for p in paths:
        m=json.loads(p.read_text());scene_sets[split].add(m['scene_id']);all_meta.append(p)
        assert m['palette']=='blue-tips-red-tray'
        im=root/'images'/split/(p.stem+'.jpg')
        with Image.open(im) as img: assert img.size==(1280,960);img.verify()
        digest=hashlib.sha256(im.read_bytes()).hexdigest()
        assert digest not in hashes,im
        hashes[digest]=str(im.relative_to(root))
        for o in m['labels']:
            if o['include_detection'] and o['keypoint_supervised']:points[o['class_id']]+=1
        labels=[line for line in (root/'labels'/split/(p.stem+'.txt')).read_text().splitlines() if line.strip()]
        assert len(labels)==sum(o['include_detection'] for o in m['labels'])
        empty+=not labels
        for line in labels:
            x=list(map(float,line.split()));assert len(x)==8 and x[0] in [0,1] and x[7] in [0,2]
            assert all(math.isfinite(v) and 0<=v<=1 for v in x[1:7])
        dense+=len(m['occupied'])>=70
        a=m['camera_position'];b=m['camera_target'];elev=math.degrees(math.atan2(a[1]-b[1],math.hypot(a[0]-b[0],a[2]-b[2])))
        horizontal+=elev<5
    stats[split]={'images':len(paths),'scenes':len(scene_sets[split]),'supervised_keypoints':points,'dense_images':dense,'near_horizontal_images':horizontal,'empty_label_images':empty}
assert not (scene_sets['train']&scene_sets['val'] or scene_sets['train']&scene_sets['test'] or scene_sets['val']&scene_sets['test'])
manifest={'version':2,'palette':'blue-tips-red-tray','images':4000,'scenes':2000,'stats':stats,'unique_images':len(hashes),'scene_disjoint':True,'scene_seed_base':302611090,'view_seed_base':1998271,'tip_alpha_range':[.28,.58],'tip_color_srgb':'#1684cf','tray_hsl_ranges':[[.985,1.015],[.72,.9],[.34,.46]],'note':'same mesh/background; opaque proxy visibility; not real-photo accuracy'}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2))
(root/'image_hashes.json').write_text(json.dumps(hashes,indent=2))
(root/'dataset.yaml').write_text('path: /root/autodl-tmp/synthetic_keypoints_blue_red_v2\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: tip_opening\n  1: nozzle_opening\nkpt_shape: [1, 3]\nflip_idx: [0]\n')
for p in source.iterdir():
    if p.is_file():shutil.copy2(p,root/p.name)
canvas=Image.new('RGB',(1600,960),'white');draw=ImageDraw.Draw(canvas)
for i in range(12):
    p=all_meta[i*(len(all_meta)-1)//11];m=json.loads(p.read_text())
    im=Image.open(root/'images'/p.parent.name/(p.stem+'.jpg')).convert('RGB');d=ImageDraw.Draw(im)
    for o in m['labels']:
        if o['include_detection'] and o['keypoint_supervised']:
            u,v=o['center_uv'];d.ellipse((u-3,v-3,u+3,v+3),fill='lime' if o['class_id']==0 else 'orange')
    im.thumbnail((400,300));x=i%4*400;y=i//4*320;canvas.paste(im,(x,y));draw.text((x+5,y+301),f'{p.stem} alpha={m["tip_opacity"]:.2f} tips={len(m["occupied"])}',fill='black')
canvas.save(root/'dataset_preview.jpg',quality=92)
archive=root.parent/'synthetic_keypoints_v2_dataset.tar.gz'
with tarfile.open(archive,'w:gz',compresslevel=3) as t:
    for p in sorted(root.rglob('*')):
        if p.is_file():t.add(p,arcname=p.relative_to(root))
sha=hashlib.sha256(archive.read_bytes()).hexdigest();(root/'archive_sha256.txt').write_text(sha+'\n')
print(json.dumps(manifest,indent=2));print('ARCHIVE',archive.stat().st_size,sha)
