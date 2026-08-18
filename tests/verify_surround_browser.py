import base64
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
chrome = shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser')
if not chrome:
    raise SystemExit('Chrome/Chromium is required for surround browser verification')

userscript_path = ROOT / 'dist' / 'Tumblr-UltraWide-Deck-v8.5.0.user.js'
if not userscript_path.is_file():
    raise SystemExit(f'missing built userscript: {userscript_path}')
userscript = userscript_path.read_text(encoding='utf-8')

posts = ''.join(
    f'<div tabindex="-1" data-id="{i}"><article><header>Post {i}</header><p>synthetic retained post {i}</p><button aria-label="Like">Like</button></article></div>'
    for i in range(1, 9)
)
html = f'''<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:#111;color:#eee}} [data-timeline]{{width:620px;margin:90px auto 0}} [data-id]{{width:540px;min-height:160px;margin:12px auto;background:#222}} article{{width:540px;min-height:160px;padding:12px;box-sizing:border-box}}
</style></head><body><div data-timeline="dashboard" data-timeline-id="dashboard">{posts}</div>
<script>{userscript}</script>
<script>
(() => {{
  const finish = (payload) => {{ document.body.dataset.surroundResult = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); }};
  setTimeout(() => {{
    try {{
      const api = window.__UltraDeck;
      if (!api) return finish({{ok:false,stage:'api-missing'}});
      const source = document.querySelector('[data-id="1"]');
      const shell = document.getElementById('tu-ultrawide-deck-shell');
      const off = {{
        marked: source?.dataset?.tuNativeSource === '1',
        visibility: source ? getComputedStyle(source).visibility : 'missing',
        surround: api.diagnostics().surroundMode === true,
      }};
      api.setSettings({{surroundMode:true}});
      setTimeout(() => {{
        const onDiag = api.diagnostics();
        const on = {{
          htmlMode: document.documentElement.dataset.tuSurround,
          shellMode: shell?.dataset?.tuSurround,
          visibility: source ? getComputedStyle(source).visibility : 'missing',
          pointerEvents: source ? getComputedStyle(source).pointerEvents : 'missing',
          surround: onDiag.surroundMode === true,
          requestedColumns: onDiag.requestedColumns,
          retained: onDiag.cachedPosts,
          center: onDiag.surroundCenterWidth,
          side: onDiag.surroundSideWidth,
        }};
        api.setSettings({{surroundMode:false}});
        setTimeout(() => {{
          const offAgain = {{
            htmlMode: document.documentElement.dataset.tuSurround,
            visibility: source ? getComputedStyle(source).visibility : 'missing',
            surround: api.diagnostics().surroundMode === true,
          }};
          finish({{ok:true,off,on,offAgain}});
        }}, 180);
      }}, 220);
    }} catch (error) {{ finish({{ok:false,error:String(error?.stack || error)}}); }}
  }}, 1800);
}})();
</script></body></html>'''

with tempfile.TemporaryDirectory(prefix='ultradeck-surround-') as td:
    page = Path(td) / 'verify.html'
    page.write_text(html, encoding='utf-8')
    proc = subprocess.run(
        [chrome, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1920,1080', '--virtual-time-budget=4200', '--dump-dom', page.as_uri()],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=45,
    )
    if proc.returncode:
        raise SystemExit(f'headless browser failed ({proc.returncode}):\n{proc.stderr[-4000:]}')
    match = re.search(r'data-surround-result="([A-Za-z0-9+/=]+)"', proc.stdout)
    if not match:
        raise SystemExit(f'surround result missing from browser DOM\nSTDERR:\n{proc.stderr[-2500:]}\nDOM tail:\n{proc.stdout[-4000:]}')
    payload = json.loads(base64.b64decode(match.group(1)).decode('utf-8'))

assert payload.get('ok') is True, payload
assert payload['off']['marked'] is True, payload
assert payload['off']['visibility'] == 'hidden', payload
assert payload['off']['surround'] is False, payload
assert payload['on']['htmlMode'] == '1', payload
assert payload['on']['shellMode'] == '1', payload
assert payload['on']['visibility'] == 'visible', payload
assert payload['on']['pointerEvents'] == 'auto', payload
assert payload['on']['surround'] is True, payload
assert payload['on']['requestedColumns'] == 2, payload
assert payload['on']['retained'] >= 2, payload
assert payload['on']['center'] >= 440, payload
assert payload['on']['side'] >= 150, payload
assert payload['offAgain']['htmlMode'] == '0', payload
assert payload['offAgain']['visibility'] == 'hidden', payload
assert payload['offAgain']['surround'] is False, payload

print(json.dumps(payload, indent=2, sort_keys=True))
print('real headless browser surround toggle verified')
