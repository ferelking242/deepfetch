# ═══════════════════════════════════════════════════════
# Cell 2 — Clone · Build · Launch   (re-run anytime)
# ═══════════════════════════════════════════════════════
import subprocess, os, time, re, secrets, glob, shutil

def sh(cmd, cwd=None, show=0, check=True):
    env = {**os.environ, 'NPM_CONFIG_REGISTRY': 'https://registry.npmjs.org'}
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, env=env)
    out = r.stdout + r.stderr
    if r.returncode != 0 and check:
        print(out[-5000:])
        raise RuntimeError('FAILED (' + str(r.returncode) + '): ' + cmd)
    if show and out.strip():
        print('\n'.join(out.splitlines()[-show:]))
    return r.stdout.strip()

REPO = '/deepfetch'
SRV  = REPO + '/server'
DASH = REPO + '/dashboard'
DIST = SRV + '/dist/index.js'
TSC  = SRV + '/node_modules/.bin/tsc'
VITE = DASH + '/node_modules/.bin/vite'
PW   = '/ms-playwright'
PORT = 3000
DATA = '/deepfetch-data'
CFG  = REPO + '/config.yaml'
REG  = 'https://registry.npmjs.org'
NPM  = 'npm install --registry ' + REG + ' --no-audit --no-fund --no-package-lock'

os.makedirs(DATA, exist_ok=True)
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = PW
os.environ['NPM_CONFIG_REGISTRY'] = REG

subprocess.run("pkill -f 'node.*dist/index'; pkill -f cloudflared",
               shell=True, capture_output=True)
time.sleep(1)

# ── 0. Self-heal: ensure cloudflared is installed ─────────────────────
CF_BIN = '/usr/local/bin/cloudflared'
if not shutil.which('cloudflared'):
    print('📦 cloudflared (installing)...')
    sh('wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/'
       'cloudflared-linux-amd64 -O ' + CF_BIN + ' && chmod +x ' + CF_BIN)
    print('   ✅ cloudflared ' + sh('cloudflared --version').split()[-1])
else:
    print('📦 cloudflared ✅')

# ── 1. Clone / pull — always wipe dist so we run the latest code
if not os.path.exists(REPO):
    print('📥 Cloning...')
    sh('git clone --depth 1 https://github.com/ferelking242/deepfetch ' + REPO)
else:
    print('📥 Pulling latest...')
    sh('git pull --ff-only', cwd=REPO)

# Always rebuild from source — dist/ is cheap to rebuild (~15s), avoids stale code
if os.path.exists(SRV + '/dist'):
    shutil.rmtree(SRV + '/dist')
print('🗑️  Cleared dist/ — will rebuild fresh')

for d in [SRV, DASH]:
    os.makedirs(d, exist_ok=True)
    open(d + '/.npmrc', 'w').write('registry=' + REG + '\nproxy=\nhttps-proxy=\n')

# ── 2. npm install server
if not os.path.exists(TSC):
    if os.path.exists(SRV + '/node_modules'):
        print('🧹 Removing stale server/node_modules...')
        sh('rm -rf ' + SRV + '/node_modules')
    for lf in [SRV + '/package-lock.json', SRV + '/yarn.lock', SRV + '/pnpm-lock.yaml']:
        if os.path.exists(lf): os.remove(lf)
    print('📦 npm install server (~2 min, compiling native addon)...')
    sh(NPM + ' 2>&1', cwd=SRV, show=5)
else:
    print('📦 server node_modules ✅')

# ── 2c. Rebuild native addons for current Node ABI (fixes better-sqlite3 after Node upgrade)
print('🔧 Rebuilding native addons...')
sh('npm rebuild better-sqlite3 2>&1 | tail -4', cwd=SRV, show=4)
print('   ✅ native addon OK')

# ── 3. npm install dashboard
if not os.path.exists(DASH + '/node_modules/.bin/vite'):
    if os.path.exists(DASH + '/node_modules'):
        sh('rm -rf ' + DASH + '/node_modules')
    print('📦 npm install dashboard...')
    sh(NPM + ' 2>&1', cwd=DASH, show=3)
else:
    print('📦 dashboard node_modules ✅')

# ── 4. Playwright Chromium
has_pw = os.path.exists(PW) and any(d.startswith('chromium') for d in os.listdir(PW))
if not has_pw:
    print('🎭 Installing Playwright Chromium...')
    sh('node ' + SRV + '/node_modules/.bin/playwright install chromium --with-deps 2>&1', show=4)
    print('   ✅ ready')
else:
    print('🎭 Playwright Chromium ✅')

# ── 5. Build TypeScript server (~15s)
print('🔨 Building server...')
r = subprocess.run(
    'node ' + TSC + ' --project tsconfig.json 2>&1',
    shell=True, capture_output=True, text=True, cwd=SRV,
    env={**os.environ, 'NPM_CONFIG_REGISTRY': REG}
)
out = (r.stdout + r.stderr).strip()
errs = [l for l in out.splitlines() if 'error TS' in l]
if errs: print('   ⚠️  ' + str(len(errs)) + ' type warning(s) — non-blocking')
if not os.path.exists(DIST):
    print(out[-3000:])
    raise RuntimeError(DIST + ' not created — fatal tsc error')
print('   ✅ built')

# ── 5b. Copy SQL assets src→dist
for sql_src in glob.glob(SRV + '/src/**/*.sql', recursive=True):
    rel = os.path.relpath(sql_src, SRV + '/src')
    dst = os.path.join(SRV + '/dist', rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(sql_src, dst)
print('📋 SQL assets copied ✅')

# ── 6. Build dashboard (always — code may have changed)
print('🔨 Building dashboard...')
sh(VITE + ' build 2>&1', cwd=DASH, show=10)
print('   ✅ Dashboard built')

# ── 7. Write config.yaml (idempotent)
import yaml as _yaml
# dfk_master_ prefix — recognisable like ghp_ / sk-  (70 chars total)
_new_secret = 'dfk_master_' + secrets.token_hex(32)
if os.path.exists(CFG):
    try:
        _cfg = _yaml.safe_load(open(CFG)) or {}
        _existing = _cfg.get('server', {}).get('master_secret', '')
        # Keep existing key if valid; migrate old bare-hex keys to new format
        if _existing:
            if not _existing.startswith('dfk_master_'):
                _new_secret = 'dfk_master_' + _existing  # one-time migration
            else:
                _new_secret = _existing
    except Exception:
        pass

_config = {
    'server': {
        'port': PORT,
        'host': '0.0.0.0',
        'master_secret': _new_secret,
        'log_level': 'info',
    },
    'browser': {
        'pool_size': 2,
        'timeout': 30000,
        'headless': True,
    },
    'database': {
        'path': DATA + '/deepfetch.db',
    },
    'queue': {
        'concurrency': 4,
        'max_retries': 3,
    },
}
with open(CFG, 'w') as f:
    _yaml.dump(_config, f, default_flow_style=False)
print('⚙️  config.yaml written ✅')

# ── 8. Start server
print('🚀 Starting server...')
srv_log = open('/tmp/srv.log', 'w')
subprocess.Popen(
    ['node', DIST, '--config', CFG],
    stdout=srv_log, stderr=subprocess.STDOUT,
    env={**os.environ, 'NODE_ENV': 'production', 'PLAYWRIGHT_BROWSERS_PATH': PW}
)
for _ in range(15):
    time.sleep(1)
    try:
        import urllib.request as _ur
        _ur.urlopen('http://localhost:' + str(PORT) + '/v1/health', timeout=2)
        break
    except Exception:
        pass
else:
    print(open('/tmp/srv.log').read()[-3000:])
    raise RuntimeError('Server did not start in time')
print('   ✅ server up in 3s')

# ── 9. cloudflared tunnel
print('🌐 Opening tunnel...')
cf_log = open('/tmp/cf.log', 'w')
subprocess.Popen(['cloudflared', 'tunnel', '--url', 'http://localhost:' + str(PORT)],
                 stdout=cf_log, stderr=subprocess.STDOUT)

PUBLIC_URL = None
for _ in range(30):
    time.sleep(1)
    try:
        txt = open('/tmp/cf.log').read()
        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', txt)
        if m: PUBLIC_URL = m.group(0); break
    except: pass

if not PUBLIC_URL:
    PUBLIC_URL = 'http://localhost:' + str(PORT)
    print("⚠️  Tunnel not found — link won't work on phone")

# ── 10. MCP server setup
MCP = REPO + '/mcp'
if not os.path.exists(MCP + '/node_modules'):
    print('🔌 npm install mcp...')
    sh(NPM + ' 2>&1', cwd=MCP, show=3)
else:
    print('🔌 MCP node_modules ✅')

try:
    _cfg2 = _yaml.safe_load(open(CFG))
    _master = _cfg2.get('server', {}).get('master_secret', '')
except Exception:
    _master = ''

_sep = '═' * 64
print('')
print(_sep)
print('  🎉  DeepFetch is LIVE')
print(_sep)
print('  📊  Dashboard    : ' + PUBLIC_URL + '/dashboard')
print('  📖  API Docs     : ' + PUBLIC_URL + '/docs')
print('  ❤️   Health       : ' + PUBLIC_URL + '/v1/health')
print('')
print('  🔑  Master key (full — paste into Dashboard → Settings):')
print('      ' + _master)
print('')
print('  🔌  MCP / env config:')
print('      DEEPFETCH_URL=' + PUBLIC_URL)
print('      DEEPFETCH_API_KEY=' + _master)
print(_sep)
print('  ⚠️   Store the master key securely. Generate dedicated')
print('       agent keys from Dashboard → Settings → New key.')
print(_sep)
print('')
