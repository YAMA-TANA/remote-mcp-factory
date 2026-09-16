# PicoSvc Web (Cloudflare Pages)

Static Next.js frontend for PicoSvc's 16 services. **Frontend and Worker are separate deployments.** Start with the [documentation index](../docs/README.md), [user quickstart](../docs/PICOSVC_QUICKSTART.md), [service/API guide](../docs/PICOSVC_API_GUIDE.md), and [operator deployment runbook](../docs/PICOSVC_DEPLOYMENT.md).

## Cloudflare Pages Git integration

Connect `YAMA-TANA/remote-mcp-factory` as an existing GitHub repository and use:

- Framework preset: `Next.js (Static HTML Export)`
- Production branch: `main`
- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `out`

Set these **public build environment variables**:

- `NEXT_PUBLIC_FACTORY_API_URL` — **deployed Worker origin**, e.g. `https://YOUR_DEPLOYED_WORKER_ORIGIN` (not the Pages URL).
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — publishable key for the same Clerk application used by the Worker.

Never set `CLERK_SECRET_KEY`, deployment encryption keys or any product API token as a `NEXT_PUBLIC_` variable. The frontend uses Clerk session tokens as `Authorization: Bearer <token>` when calling the Worker. Ensure the real Pages/custom origin is allowed by the Worker's `WEB_ORIGINS` and, when configured, `CLERK_AUTHORIZED_PARTIES`.

### A deployment is skipped for include/exclude paths

If Cloudflare reports **“The deployment was skipped because no changed files matched your configured include and exclude paths.”**, check **which project** generated the message. A backend Worker skipping a frontend-only `web/` change can be expected. If the **Pages project** skips a change under `web/`, open Cloudflare Workers & Pages → that Pages project → Settings → Build → **Build watch paths**. Inspect both Include and Exclude for conflicting or incorrect path patterns relative to the repository root. Follow the Cloudflare dashboard's documented glob semantics; removing the path filter temporarily can isolate the problem, but may cause Pages to build on unrelated backend changes. Confirm that the `main` branch and root directory above are actually saved.

**GitHub Web CI passing does not deploy to Cloudflare or prove that Pages did not skip a build.** After changing the filter, retry a suitable deployment or make a new matching change, then check the published page. See the [deployment runbook](../docs/PICOSVC_DEPLOYMENT.md) for the separate Worker, D1 and production-verification steps.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Static build

```bash
npm run typecheck
npm run build
```

Output is written to `out/` and can be served by Cloudflare Pages. This is a frontend build, **not** a verification of the deployed API, database migrations, Browser Run, Email Routing or billing.
