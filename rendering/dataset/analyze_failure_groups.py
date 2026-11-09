from pathlib import Path
import json,numpy as np
ROOT=Path(__file__).resolve().parent
results=json.loads((ROOT/'evaluation/predictions.json').read_text());groups={}
for row in results:
 d=json.loads((ROOT/'metadata/test'/(Path(row['image']).stem+'.json')).read_text())
 nozz=d['labels'][-1];eligible=sum(o['class_id']==0 and o['include_detection'] and o['keypoint_supervised'] for o in d['labels']) if nozz['include_detection'] and nozz['keypoint_supervised'] else 0
 p=np.array(d['camera_position']);t=np.array(d['camera_target']);elev=np.degrees(np.arctan2(p[1]-t[1],np.linalg.norm((p-t)[[0,2]])))
 names=['opacity_low' if d['tip_opacity']<.25 else 'opacity_high' if d['tip_opacity']>.4 else 'opacity_mid','occupancy_dense' if len(d['occupied'])>=70 else 'occupancy_sparse' if len(d['occupied'])<25 else 'occupancy_mid','near_horizontal' if elev<5 else 'higher_angle']
 for name in names:
  g=groups.setdefault(name,{'images':0,'eligible_pairs':0,'errors':[]});g['images']+=1;g['eligible_pairs']+=eligible;g['errors'] +=[x['error_l2'] for x in row['pairs']]
for g in groups.values():
 e=np.array(g.pop('errors'));g['matched_pairs']=len(e);g['coverage']=len(e)/max(g['eligible_pairs'],1);g['p90_error_px']=float(np.percentile(e,90)) if len(e) else None;g['success_within_5px']=float((e<=5).sum()/max(g['eligible_pairs'],1))
(ROOT/'evaluation/failure_groups.json').write_text(json.dumps(groups,indent=2));print(json.dumps(groups,indent=2))
