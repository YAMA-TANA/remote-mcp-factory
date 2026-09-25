export const EDGE_ASSESS_SCRIPT = String.raw`
import json, os, pathlib, re

root = pathlib.Path(os.environ['TARGET'])
command = os.environ.get('COMMAND', '').strip()
out = {
    'eligible': False,
    'strategy': 'unsupported',
    'sdk': 'unknown',
    'entry': None,
    'reason': 'unsupported entry pattern',
    'packageName': None,
}

pkg_path = root / 'package.json'
if not pkg_path.exists():
    out['reason'] = 'Edge compiler currently supports Node/npm packages only'
    print(json.dumps(out)); raise SystemExit
try:
    pkg = json.loads(pkg_path.read_text())
except Exception:
    out['reason'] = 'package.json could not be parsed'
    print(json.dumps(out)); raise SystemExit

out['packageName'] = pkg.get('name')
deps = {}
for key in ('dependencies', 'optionalDependencies', 'peerDependencies'):
    deps.update(pkg.get(key) or {})
if '@modelcontextprotocol/server' in deps:
    out['sdk'] = 'v2'
elif '@modelcontextprotocol/sdk' in deps:
    out['sdk'] = 'v1'

heavy = {
    'playwright','playwright-core','puppeteer','puppeteer-core','better-sqlite3','sqlite3',
    'sharp','canvas','node-pty','selenium-webdriver','chromedriver','ffmpeg-static',
    '@ffmpeg-installer/ffmpeg','node-libcurl','isolated-vm'
}
found_heavy = sorted([d for d in deps if d in heavy or d.startswith('@sparticuz/chromium')])
if found_heavy:
    out['reason'] = 'native/heavy dependency: ' + ', '.join(found_heavy[:4])
    print(json.dumps(out)); raise SystemExit

skip = {'node_modules','.git','dist','build','coverage','.next','.turbo','vendor','examples','example','test','tests','fixtures'}
source_suffixes = {'.js','.mjs','.cjs','.ts','.mts','.cts','.jsx','.tsx'}
files = []
for path in root.rglob('*'):
    if not path.is_file():
        continue
    try:
        rel_path = path.relative_to(root)
    except ValueError:
        continue
    # Only ignore generated/test directories *inside* the selected package root.
    # The selected root itself may legitimately live under monorepo paths such as
    # fixtures/foo, examples/bar, or tests/mcp-server.
    if any(part in skip for part in rel_path.parts[:-1]):
        continue
    if path.suffix.lower() not in source_suffixes:
        continue
    try:
        if path.stat().st_size > 500000:
            continue
        text = path.read_text(errors='ignore')
    except Exception:
        continue
    files.append((path, text, str(rel_path).replace('\\', '/')))


def script_entry(value):
    value = str(value or '').strip()
    m = re.match(r'^(?:node|tsx|ts-node)\s+([^\s;&|]+)', value)
    return m.group(1) if m else None

entry_hint = script_entry(command)
if not entry_hint and command.startswith('npm run '):
    parts = command.split()
    name = parts[2] if len(parts) > 2 else ''
    entry_hint = script_entry((pkg.get('scripts') or {}).get(name))
if not entry_hint and command == 'npm start':
    entry_hint = script_entry((pkg.get('scripts') or {}).get('start'))
if not entry_hint:
    bin_value = pkg.get('bin')
    if isinstance(bin_value, str):
        entry_hint = bin_value
    elif isinstance(bin_value, dict) and bin_value:
        entry_hint = next(iter(bin_value.values()))

normalized_hint = None
if entry_hint:
    normalized_hint = entry_hint.replace('\\', '/').lstrip('./')

best = None
best_score = -1
for path, text, rel in files:
    score = 0
    if normalized_hint and rel.lstrip('./') == normalized_hint:
        score += 1000
    if '@modelcontextprotocol/' in text:
        score += 50
    if 'StdioServerTransport' in text or 'serveStdio' in text:
        score += 40
    if re.search(r'new\s+(?:McpServer|Server)\s*\(', text):
        score += 35
    if 'createMcpHandler' in text:
        score += 60
    if re.search(r'\.connect\s*\(', text):
        score += 10
    if score > best_score:
        best = (path, text, rel)
        best_score = score

if not best or best_score < 50:
    out['reason'] = 'Could not locate an MCP server entrypoint'
    print(json.dumps(out)); raise SystemExit

path, src, rel = best
out['entry'] = rel

# Runtime subprocesses must have been removed by the compatibility compiler before
# this assessor can promote the repo to Edge.
if re.search(r"(?:from\s+['\"](?:node:)?child_process['\"]|require\(['\"](?:node:)?child_process['\"]\))", src):
    out['reason'] = 'runtime child_process dependency'
    print(json.dumps(out)); raise SystemExit
if re.search(r'\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(', src) and 'child_process' in src:
    out['reason'] = 'runtime subprocess execution'
    print(json.dumps(out)); raise SystemExit
if re.search(r'\b(?:createServer|listen)\s*\(', src) and ('node:http' in src or "'http'" in src or '"http"' in src):
    out['reason'] = 'entrypoint starts its own Node HTTP server'
    print(json.dumps(out)); raise SystemExit

if 'createMcpHandler' in src and re.search(r'export\s+default', src):
    out['eligible'] = True
    out['strategy'] = 'native-http'
    out['reason'] = 'native Web MCP handler'
elif re.search(r'\b(?:StreamableHTTPServerTransport|SSEServerTransport|WebStandardStreamableHTTPServerTransport)\b', src) or re.search(r'\b(?:app|server|httpServer)\.listen\s*\(', src):
    out['reason'] = 'entrypoint already hosts an HTTP server; PicoSvc Edge conversion supports stdio servers or createMcpHandler'
elif 'serveStdio' in src:
    out['eligible'] = True
    out['strategy'] = 'v2-serve-stdio'
    out['reason'] = 'stdio MCP entry convertible to Web handler'
elif ('StdioServerTransport' in src or re.search(r'new\s+(?:McpServer|Server)\s*\(', src)):
    out['eligible'] = True
    out['strategy'] = 'stdio-main'
    out['reason'] = 'stdio MCP entry convertible to Web handler'
else:
    out['reason'] = 'MCP entry found but no supported transport pattern was recognized'

print(json.dumps(out))
`;
