# Remote MCP Factory Web

Static Next.js frontend for Cloudflare Pages.

## Cloudflare Pages Git integration

Connect `YAMA-TANA/remote-mcp-factory` as an existing GitHub repository and use:

- Framework preset: `Next.js (Static HTML Export)`
- Production branch: `main`
- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `out`

Set these build environment variables:

- `NEXT_PUBLIC_FACTORY_API_URL` — the deployed Remote MCP Factory Worker origin, e.g. `https://remote-mcp-factory.example.workers.dev`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — the Clerk publishable key for the same Clerk application used by the Worker

The frontend uses Clerk session tokens as `Authorization: Bearer <token>` when calling the Worker API. The Worker permits authenticated cross-origin API calls from `*.pages.dev`, localhost, and any exact origins listed in `WEB_ORIGINS`.

For a custom production domain, set the Worker variable `WEB_ORIGINS=https://your-domain.example` (comma-separated for multiple origins). If `CLERK_AUTHORIZED_PARTIES` is configured on the Worker, add the Pages/custom origin there too.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Static build

```bash
npm run build
```

Output is written to `out/` and can be served directly by Cloudflare Pages.
