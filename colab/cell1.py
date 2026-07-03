# ═══════════════════════════════════════════════════════
# Cell 1 — System install  (idempotent — safe to re-run anytime)
# ═══════════════════════════════════════════════════════
import subprocess, os, shutil

def sh(cmd, check=True, **kw):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)
    if r.returncode != 0 and check:
        print((r.stdout + r.stderr)[-3000:])
        raise RuntimeError(f'FAILED: {cmd}')
    return r.stdout.strip()

ok = lambda msg: print(f'   ✅ {msg}')

# ── Node.js 22 ────────────────────────────────────────────
print('📦 Node.js 22...')
node_ver = sh('node --version 2>/dev/null', check=False)
if node_ver.startswith('v22'):
    ok(f'Node {node_ver}  npm {sh("npm --version")}')
else:
    sh('curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 | tail -2')
    sh('apt-get install -y nodejs 2>&1 | tail -2')
    ok(f'Node {sh("node --version")}  npm {sh("npm --version")}')

# ── Build tools (native C++ addon for better-sqlite3) ─────
print('📦 Build tools...')
if shutil.which('g++'):
    ok('already installed')
else:
    sh('apt-get install -y --no-install-recommends build-essential python3 python3-dev make g++ 2>&1 | tail -2')
    ok('done')

# ── Playwright system libs ─────────────────────────────────
print('📦 Playwright libs...')
libs_ok = sh("dpkg -l libnss3 2>/dev/null | grep -c '^ii'", check=False).strip()
if libs_ok == '1':
    ok('already installed')
else:
    sh('apt-get install -y --no-install-recommends '
       'libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 '
       'libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 '
       'libpango-1.0-0 libpangocairo-1.0-0 2>&1 | tail -2')
    ok('done')

# ── cloudflared ───────────────────────────────────────────
print('📦 cloudflared...')
cf_ver = sh('cloudflared --version 2>/dev/null', check=False)
if cf_ver:
    ok(cf_ver.split()[2] if len(cf_ver.split()) > 2 else cf_ver)
else:
    sh('pkill -f cloudflared 2>/dev/null; sleep 1', check=False)
    sh('wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 '
       '-O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared')
    ok(sh('cloudflared --version').split()[2])

# ── npm registry (always force — cheap & safe) ─────────────
print('🔒 npm registry...')
PUBLIC_REG = 'https://registry.npmjs.org'
with open('/root/.npmrc', 'w') as f:
    f.write(f'registry={PUBLIC_REG}\nproxy=\nhttps-proxy=\n')
sh(f'npm config set registry {PUBLIC_REG}')
sh('npm cache clean --force 2>&1 | tail -1')
ok(sh('npm config get registry'))

print()
print('🎉 Ready — now run Cell 2.')