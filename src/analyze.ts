import type { Sandbox } from '@cloudflare/sandbox';

export interface Detection {
  runtime: 'node' | 'python' | 'unknown';
  command: string | null;
  install: string[];
  build: string[];
  notes: string[];
}

function cleanDir(subdir: string): string {
  const value = subdir.trim().replace(/^\/+|\/+$/g, '');
  if (!value) return '/workspace/repo';
  if (value.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(value)) {
    throw new Error('Invalid subdir');
  }
  return `/workspace/repo/${value}`;
}

export async function detectMcp(sandbox: Sandbox, subdir: string): Promise<Detection> {
  const cwd = cleanDir(subdir);
  const script = String.raw`
import json, os, pathlib, re
try:
    import tomllib
except ModuleNotFoundError:
    tomllib = None

root = pathlib.Path(os.environ['TARGET'])
out = {"runtime":"unknown","command":None,"install":[],"build":[],"notes":[]}

pkg = root / "package.json"
if pkg.exists():
    p = json.loads(pkg.read_text())
    out["runtime"] = "node"
    if (root / "pnpm-lock.yaml").exists(): out["install"] = ["npx --yes pnpm@latest install --frozen-lockfile"]
    elif (root / "yarn.lock").exists(): out["install"] = ["yarn install --frozen-lockfile"]
    elif (root / "package-lock.json").exists(): out["install"] = ["npm ci"]
    else: out["install"] = ["npm install"]
    scripts = p.get("scripts", {})
    if "build" in scripts: out["build"] = ["npm run build"]
    if "start:stdio" in scripts:
        out["command"] = "npm run start:stdio"
    elif "stdio" in scripts:
        out["command"] = "npm run stdio"
    else:
        binv = p.get("bin")
        path = None
        if isinstance(binv, str): path = binv
        elif isinstance(binv, dict) and binv: path = next(iter(binv.values()))
        if path:
            out["command"] = "node " + path
        elif "start" in scripts:
            start = str(scripts.get("start") or "").strip()
            # Peel the npm wrapper when the start script is already one direct JS/TS
            # entry command. This improves both Edge entrypoint resolution and Linux
            # fallback while leaving compound shell scripts behind npm's lifecycle.
            if re.match(r'^(?:node|tsx|ts-node)\\s+[^;&|]+$', start):
                out["command"] = start
                out["notes"].append("Resolved package.json start script to its direct entry command.")
            else:
                out["command"] = "npm start"
                out["notes"].append("Using npm start; verify that it is stdio, not an HTTP server.")

pyproject = root / "pyproject.toml"
if out["runtime"] == "unknown" and pyproject.exists():
    out["runtime"] = "python"
    text = pyproject.read_text()
    scripts = {}
    if tomllib is not None:
        data = tomllib.loads(text)
        scripts = data.get("project", {}).get("scripts", {})
    else:
        # Python 3.10 (used by current Sandbox images) has no stdlib tomllib.
        # We only need the first console-script key, so parse that narrow TOML table
        # without adding a runtime dependency just for MCP detection.
        in_scripts = False
        for raw in text.splitlines():
            line = raw.strip()
            if line.startswith('[') and line.endswith(']'):
                in_scripts = line == '[project.scripts]'
                continue
            if in_scripts:
                m = re.match(r'([A-Za-z0-9_.-]+)\\s*=\\s*[\"\\\']', line)
                if m:
                    scripts[m.group(1)] = True
                    break
        out["notes"].append("Detected pyproject.toml using Python 3.10-compatible fallback parser.")
    if scripts:
        name = next(iter(scripts.keys()))
        out["command"] = name
    out["install"] = ["python3 -m venv .venv", ".venv/bin/pip install -e ."]

if out["runtime"] == "unknown" and (root / "requirements.txt").exists():
    out["runtime"] = "python"
    out["install"] = ["python3 -m venv .venv", ".venv/bin/pip install -r requirements.txt"]
    for candidate in ["server.py", "main.py", "app.py"]:
        if (root / candidate).exists():
            out["command"] = ".venv/bin/python " + candidate
            break

print(json.dumps(out))
`;

  await sandbox.writeFile('/tmp/detect_mcp.py', script);
  const result = await sandbox.exec(`TARGET=${JSON.stringify(cwd)} python3 /tmp/detect_mcp.py`);
  if (!result.success) throw new Error(result.stderr || 'MCP detection failed');
  return JSON.parse(result.stdout) as Detection;
}
