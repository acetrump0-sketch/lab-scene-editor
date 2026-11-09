from pathlib import Path
import yaml
root = Path(__file__).resolve().parent
images = sorted((root / 'images/train').glob('*.jpg'))
selected = [p for p in images if int(p.stem.split('_')[0][1:]) < 200]
if len(selected) != 400:
    raise ValueError(f'Expected 400 images from scenes 0-199; got {len(selected)}')
(root / 'train_400.txt').write_text('\n'.join(str(p) for p in selected) + '\n')
config = yaml.safe_load((root / 'dataset.yaml').read_text())
config['path'] = str(root)
config['train'] = str(root / 'train_400.txt')
(root / 'dataset_400.yaml').write_text(yaml.safe_dump(config))
