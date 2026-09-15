# Compatibility Runtime

Remote MCP Factory keeps the product surface small (`GitHub URL -> Deploy`) and moves compatibility work into the runtime/compiler.

## Runtime classes

- `edge` — fully verified in a Dynamic Worker.
- `edge-with-bridge-candidate` — source analysis found an allowlisted external binary such as `ffmpeg`, `ffprobe`, `git`, `pandoc`, `jq`, `curl`, `wget`, `zip`, `unzip`, or `rg`. The report records the source file, line, and nearby MCP tool registration when possible.
- `heavy` — browser automation or an unknown/native subprocess still requires Linux Sandbox.

The current compiler only marks bridge candidates. It does **not** rewrite arbitrary child processes into bridge calls yet. This is intentional: the bridge must stay capability-based rather than become an arbitrary shell proxy.

## R2 edge artifacts

Without an R2 binding, Factory retains the legacy behavior: a single JavaScript Worker bundle up to 1.8 MB may be stored in D1.

With an R2 binding named `ARTIFACTS`, the compiler stores a manifest plus individual emitted modules under:

```text
edge/<server-id>/<bundle-hash>/manifest.json
edge/<server-id>/<bundle-hash>/modules/...
```

This supports JS, CommonJS, text, JSON, data modules and Wasm artifacts, with per-module SHA-256 verification when the Dynamic Worker is loaded. The current Factory safety cap is 60 MB per compiled artifact.

Create and bind the bucket before enabling this path:

```bash
npx wrangler r2 bucket create remote-mcp-factory-artifacts
```

Then add:

```jsonc
"r2_buckets": [
  {
    "binding": "ARTIFACTS",
    "bucket_name": "remote-mcp-factory-artifacts"
  }
]
```

to `wrangler.jsonc`.

## D1 migration

Apply migration `0004_edge_artifacts.sql` before deploying compiler v0.2.0:

```bash
npm run db:migrate
```

## Binary Bridge v1

The Sandbox image now preinstalls `ffmpeg`, `ffprobe` and `jq`. There is no arbitrary command execution API. Authenticated deployment owners can inspect capability availability through:

```text
GET /api/servers/:id/bridge-status
```

Compatibility diagnostics are available at:

```text
GET /api/servers/:id/compatibility
```

The next bridge step is tool-level rewriting for a very small allowlist, beginning with ffmpeg operations backed by typed request schemas and bounded input/output objects.
