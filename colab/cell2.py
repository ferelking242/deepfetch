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
    sql_dst = sql_src.replace(SRV + '/src', SRV + '/dist')
    os.makedirs(os.path.dirname(sql_dst), exist_ok=True)
    shutil.copy2(sql_src, sql_dst)
print('📋 SQL assets copied ✅')

# ── 6. Build dashboard (always rebuild — code may have changed after git pull)
print('🔨 Building dashboard...')
sh('node ' + VITE + ' build 2>&1', cwd=DASH, show=4)
print('   ✅ Dashboard built')

# ── 7. Config
if not os.path.exists(CFG):
    try: import yaml
    except:
        sh('pip install pyyaml -q')
        import yaml
    cfg_data = {
        'server':   {'port': PORT, 'host': '0.0.0.0', 'master_secret': secrets.token_hex(32)},
        'browser':  {'pool_max': 0, 'pool_reserved': 1, 'context_ttl_seconds': 300,
                     'navigation_timeout_ms': 30000, 'headless': True},
        'resources':{'cpu_threshold_pct': 85, 'ram_threshold_pct': 80},
        'queue':    {'max_retries': 3, 'retry_base_delay_ms': 2000, 'result_ttl_seconds': 86400},
        'ai_engine':{'enabled': True, 'trigger': 'on_selector_failure',
                     'max_html_chars': 50000, 'timeout_ms': 15000,
                     'providers': [
                         {'name':'ollama','local':True,'model':'llama3.2','base_url':'http://localhost:11434'},
                         {'name':'groq',  'api_key':'','model':'llama-3.3-70b-versatile'},
                         {'name':'gemini','api_key':'','model':'gemini-2.0-flash'},
                         {'name':'openai','api_key':'','model':'gpt-4o-mini'},
                     ]},
        'sessions': {'encryption_key': secrets.token_hex(32), 'check_interval_seconds': 1800},
        'data_dir': DATA,
    }
    yaml.dump(cfg_data, open(CFG, 'w'), default_flow_style=False)
    print('⚙️  config.yaml written ✅')
else:
    print('⚙️  config.yaml ✅ (edit AI keys in dashboard)')

# ── 8. Launch server
print('🚀 Starting server...')
srv_log = open('/tmp/deepfetch.log', 'w')
subprocess.Popen(
    ['node', DIST],
    env={**os.environ, 'DF_CONFIG': CFG, 'NODE_ENV': 'production'},
    stdout=srv_log, stderr=srv_log, cwd=REPO
)

import urllib.request, urllib.error
for i in range(40):
    time.sleep(1)
    try:
        urllib.request.urlopen('http://localhost:' + str(PORT) + '/v1/health', timeout=2)
        print('   ✅ server up in ' + str(i+1) + 's')
        break
    except urllib.error.HTTPError as e:
        if e.code < 500:
            print('   ✅ server up in ' + str(i+1) + 's')
            break
    except: pass
else:
    print('❌ Server failed. Logs:')
    print(open('/tmp/deepfetch.log').read()[-4000:])
    raise RuntimeError('Server did not start — see logs above')

# ── 9. cloudflared tunnel
print('🌐 Opening tunnel...')
cf_log = open('/tmp/cf.log', 'w')
subprocess.Popen(['cloudflared','tunnel','--url','http://localhost:'+str(PORT)],
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



# ── 10. MCP server setup ──────────────────────────────────────────────
MCP = REPO + '/mcp'
if not os.path.exists(MCP + '/node_modules'):
    print('🔌 npm install mcp...')
    sh(NPM + ' 2>&1', cwd=MCP, show=3)
else:
    print('🔌 MCP node_modules ✅')

try:
    import yaml as _yaml
    _cfg = _yaml.safe_load(open(CFG))
    _master = _cfg.get('server', {}).get('master_secret', '')
except Exception:
    _master = ''

print('')
print('═══════════════════════════════════════════════════════')
print('  🎉  DeepFetch is LIVE — open on any device')
print('═══════════════════════════════════════════════════════')
print('  📊  Dashboard : ' + PUBLIC_URL + '/dashboard')
print('  🔌  MCP config  :')
print('      DEEPFETCH_URL=' + PUBLIC_URL)
print('      DEEPFETCH_API_KEY=' + _master[:8] + '...')
print('  📖  API Docs  : ' + PUBLIC_URL + '/docs')
print('  ❤️   Health    : ' + PUBLIC_URL + '/v1/health')
print('═══════════════════════════════════════════════════════')
print('  Configure AI keys from the Dashboard ↑')
print('')