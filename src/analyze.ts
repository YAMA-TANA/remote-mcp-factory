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
import json, os, pathlib, tomllib
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
            out["command"] = "npm start"
            out["notes"].append("Using npm start; verify that it is stdio, not an HTTP server.")

pyproject = root / "pyproject.toml"
if out["runtime"] == "unknown" and pyproject.exists():
    out["runtime"] = "python"
    data = tomllib.loads(pyproject.read_text())
    scripts = data.get("project", {}).get("scripts", {})
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
