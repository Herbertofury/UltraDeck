from __future__ import annotations
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
OUT=ROOT/'releases'/f'v{VERSION}'
FIXED=(2020,1,1,0,0,0)
EXCLUDED={'.git','bootstrap','bootstrap-v83','bootstrap-v84','bootstrap-v85','releases','dist','dist-manual','src','node_modules','.wxt','__pycache__','.pytest_cache'}

subprocess.run([sys.executable,str(ROOT/'scripts/build_portable.py')],check=True)
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)

for site in ('Tumblr','Patreon','X','TikTok'):
    src=ROOT/'dist'/f'{site}-UltraWide-Deck-v{VERSION}.user.js'
    if not src.is_file(): raise FileNotFoundError(src)
    shutil.copy2(src,OUT/src.name)
for src,dst in [
    (ROOT/'docs'/f'VERIFICATION-v{VERSION}.md',OUT/'VERIFICATION.md'),
    (ROOT/'docs'/f'VERIFICATION-v{VERSION}.json',OUT/'VERIFICATION.json'),
]:
    if not src.is_file(): raise FileNotFoundError(src)
    shutil.copy2(src,dst)

def add_file(z:zipfile.ZipFile,path:Path,arcname:Path|str):
    info=zipfile.ZipInfo(str(arcname).replace('\\','/'),date_time=FIXED)
    info.compress_type=zipfile.ZIP_DEFLATED
    info.external_attr=(path.stat().st_mode & 0xffff)<<16
    z.writestr(info,path.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)

def zip_tree(src:Path,out:Path):
    with zipfile.ZipFile(out,'w') as z:
        for path in sorted(src.rglob('*')):
            if path.is_file(): add_file(z,path,path.relative_to(src))

zip_tree(ROOT/'dist-manual'/'chromium-mv3',OUT/f'UltraDeck-Extension-v{VERSION}-chromium-mv3.zip')
zip_tree(ROOT/'dist-manual'/'firefox-mv3',OUT/f'UltraDeck-Extension-v{VERSION}-firefox-mv3.zip')
source_zip=OUT/f'UltraDeck-Extension-v{VERSION}-source.zip'
with zipfile.ZipFile(source_zip,'w') as z:
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file(): continue
        rel=path.relative_to(ROOT)
        if any(part in EXCLUDED for part in rel.parts): continue
        add_file(z,path,Path(f'UltraDeck-Extension-v{VERSION}')/rel)

def sha(path:Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

asset_names=[
    f'Patreon-UltraWide-Deck-v{VERSION}.user.js',
    f'TikTok-UltraWide-Deck-v{VERSION}.user.js',
    f'Tumblr-UltraWide-Deck-v{VERSION}.user.js',
    f'X-UltraWide-Deck-v{VERSION}.user.js',
    f'UltraDeck-Extension-v{VERSION}-chromium-mv3.zip',
    f'UltraDeck-Extension-v{VERSION}-firefox-mv3.zip',
    f'UltraDeck-Extension-v{VERSION}-source.zip',
    'VERIFICATION.md','VERIFICATION.json',
]
checks=''.join(f'{sha(OUT/name)}  {name}\n' for name in asset_names)
(OUT/'SHA256SUMS.txt').write_text(checks,encoding='utf-8')

bundle=OUT/f'UltraDeck-v{VERSION}-release-bundle.zip'
bundle_names=asset_names+['SHA256SUMS.txt']
with zipfile.ZipFile(bundle,'w') as z:
    for name in sorted(bundle_names): add_file(z,OUT/name,name)
(OUT/'BUNDLE-SHA256.txt').write_text(f'{sha(bundle)}  {bundle.name}\n',encoding='utf-8')

manifest={name:{'size':(OUT/name).stat().st_size,'sha256':sha(OUT/name)} for name in asset_names+['SHA256SUMS.txt',bundle.name,'BUNDLE-SHA256.txt']}
(OUT/'RELEASE-MANIFEST.json').write_text(json.dumps({'version':VERSION,'files':manifest},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':VERSION,'out':str(OUT),'files':manifest},indent=2))
