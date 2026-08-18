from __future__ import annotations
import hashlib, json, os, shutil, stat, subprocess
from pathlib import Path

RUNTIME_HOME = Path(os.environ.get('ULTRADECK_BROWSER_RUNTIME_HOME', '/tmp/ultradeck-browser-lab'))

def _discover_system_browser() -> Path:
    configured=os.environ.get('ULTRADECK_SYSTEM_CHROMIUM','').strip()
    candidates=[]
    if configured: candidates.append(Path(configured).expanduser())
    candidates.extend([
        Path('/usr/lib/chromium/chromium'),
        Path('/opt/google/chrome/chrome'),
        Path('/opt/google/chrome/google-chrome'),
    ])
    for command in ('chromium','chromium-browser','google-chrome-stable','google-chrome'):
        found=shutil.which(command)
        if found: candidates.append(Path(found))
    seen=set()
    for candidate in candidates:
        try: resolved=candidate.resolve()
        except Exception: continue
        if resolved in seen: continue
        seen.add(resolved)
        if resolved.is_file(): return resolved
    return Path('/usr/lib/chromium/chromium')

SYSTEM_CHROMIUM = _discover_system_browser()
SYSTEM_DIR = SYSTEM_CHROMIUM.parent
if 'google/chrome' in SYSTEM_CHROMIUM.as_posix():
    SYSTEM_POLICY_ROOT = b'/etc/opt/chrome'
    ISOLATED_POLICY_ROOT = b'/tmp/udpolicyxx'
else:
    SYSTEM_POLICY_ROOT = b'/etc/chromium'
    ISOLATED_POLICY_ROOT = b'/tmp/udpolicy'
if len(SYSTEM_POLICY_ROOT) != len(ISOLATED_POLICY_ROOT):
    raise RuntimeError('UltraDeck policy relocation roots must have equal byte length')

def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def explicit_browser() -> Path | None:
    value=os.environ.get('ULTRADECK_CHROMIUM_EXECUTABLE','').strip()
    if not value: return None
    p=Path(value).expanduser().resolve()
    if not p.is_file(): raise FileNotFoundError(p)
    return p

def ensure_isolated_browser() -> Path:
    explicit=explicit_browser()
    if explicit is not None:
        return explicit
    if not SYSTEM_CHROMIUM.is_file(): raise FileNotFoundError(SYSTEM_CHROMIUM)
    st=SYSTEM_CHROMIUM.stat()
    fingerprint=hashlib.sha256(f'{SYSTEM_CHROMIUM}:{st.st_size}:{st.st_mtime_ns}:{sha256(SYSTEM_CHROMIUM)}:{SYSTEM_POLICY_ROOT!r}'.encode()).hexdigest()[:16]
    runtime_dir=RUNTIME_HOME/f'chromium-policy-isolated-{fingerprint}'
    executable=runtime_dir/'chromium'; marker=runtime_dir/'ultradeck-runtime.json'
    expected={'schema':'ultradeck.browser-runtime/2','system':str(SYSTEM_CHROMIUM),'systemSha256':sha256(SYSTEM_CHROMIUM),'policyFrom':SYSTEM_POLICY_ROOT.decode(),'policyTo':ISOLATED_POLICY_ROOT.decode()}
    if executable.is_file() and marker.is_file():
        try:
            current=json.loads(marker.read_text())
            if all(current.get(k)==v for k,v in expected.items()):
                _prepare_policy_root(); return executable
        except Exception: pass
    runtime_dir.mkdir(parents=True,exist_ok=True)
    for item in SYSTEM_DIR.iterdir():
        target=runtime_dir/item.name
        if item.name==SYSTEM_CHROMIUM.name or target.exists() or target.is_symlink(): continue
        try: target.symlink_to(item,target_is_directory=item.is_dir())
        except FileExistsError: pass
    tmp=runtime_dir/'.chromium.tmp'; shutil.copy2(SYSTEM_CHROMIUM,tmp); data=tmp.read_bytes(); count=data.count(SYSTEM_POLICY_ROOT)
    if count<1:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f'Chromium policy root literal not found: {SYSTEM_POLICY_ROOT.decode()} in {SYSTEM_CHROMIUM}')
    patched=data.replace(SYSTEM_POLICY_ROOT,ISOLATED_POLICY_ROOT)
    if len(patched)!=len(data): tmp.unlink(missing_ok=True); raise RuntimeError('Policy relocation changed executable length')
    tmp.write_bytes(patched); tmp.chmod(tmp.stat().st_mode|stat.S_IXUSR|stat.S_IXGRP|stat.S_IXOTH); os.replace(tmp,executable)
    _prepare_policy_root(); expected.update({'runtimeSha256':sha256(executable),'policyLiteralReplacements':count,'hostPoliciesModified':False}); marker.write_text(json.dumps(expected,indent=2)+'\n')
    return executable

def _prepare_policy_root() -> Path:
    root=Path(ISOLATED_POLICY_ROOT.decode()); (root/'policies'/'managed').mkdir(parents=True,exist_ok=True); (root/'policies'/'recommended').mkdir(parents=True,exist_ok=True); return root

def diagnostics() -> dict:
    p=ensure_isolated_browser()
    try: version=subprocess.check_output([str(p),'--version'],text=True,stderr=subprocess.STDOUT,timeout=15).strip()
    except Exception as exc: version=f'unavailable: {exc}'
    marker=p.parent/'ultradeck-runtime.json'; data=json.loads(marker.read_text()) if marker.is_file() else {}
    explicit=explicit_browser()
    system_sha = data.get('systemSha256')
    if not system_sha and SYSTEM_CHROMIUM.is_file(): system_sha=sha256(SYSTEM_CHROMIUM)
    return {
        'path':str(p), 'version':version, 'sha256':sha256(p),
        'policyIsolated':data.get('policyTo')==ISOLATED_POLICY_ROOT.decode(),
        'explicitCleanBrowser':explicit is not None,
        'isolationMode':'relocated-policy-root' if data.get('policyTo')==ISOLATED_POLICY_ROOT.decode() else ('explicit-clean-profile' if explicit is not None else 'system'),
        'policyRoot':data.get('policyTo',''), 'hostPoliciesModified':False,
        'systemChromium':str(SYSTEM_CHROMIUM) if SYSTEM_CHROMIUM.is_file() else '',
        'systemSha256':system_sha or '', 'policyLiteralReplacements':data.get('policyLiteralReplacements',0),
    }

if __name__=='__main__': print(json.dumps(diagnostics(),indent=2))
