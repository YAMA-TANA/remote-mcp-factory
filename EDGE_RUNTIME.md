# Edge-first MCP runtime

Remote MCP Factory now treats Linux containers as the fallback, not the default.

## Build path

1. Clone the GitHub repository into an isolated Cloudflare Sandbox.
2. Detect the MCP runtime and stdio start command.
3. For Node/TypeScript MCPs, run the Edge compatibility analyzer.
4. If the project uses MCP SDK v1, run the official `@modelcontextprotocol/codemod` v1→v2 migration on the build copy.
5. Replace supported stdio bootstrap patterns with a Web-standard `createMcpHandler` entrypoint.
6. Install dependencies with lifecycle scripts disabled.
7. Bundle with Wrangler for the Cloudflare Workers runtime.
8. Start the bundle under local workerd and require a successful MCP `initialize` + `tools/list` smoke test.
9. Store successful single-module bundles in D1 and serve them through the Dynamic Worker loader.
10. If any step is incompatible or fails, preserve the existing Linux Sandbox path.

## Intentionally unsupported on Edge

The initial compiler rejects or falls back for obvious heavy/native cases such as subprocess execution, Playwright/Puppeteer, native SQLite bindings, ffmpeg/native media stacks, and other runtime requirements that cannot preserve their semantics in Workers.

Local-bound MCPs are also not useful to move to the cloud when their core value is access to the caller's own filesystem or desktop environment.

## Runtime routing

`/mcp/:id` performs auth, quota and rate limiting in the dispatch Worker first. It then:

- loads a successful compiled bundle with `LOADER.get(stableId, callback)` and forwards the MCP request to its Dynamic Worker, or
- lazily starts the Linux Sandbox fallback when no valid Edge build exists or the Edge runtime throws.

A stable loader ID includes the bundle SHA-256, so a new build naturally creates a new Dynamic Worker identity while repeated calls to the same build can reuse a warm isolate.

## MVP bundle storage

The current MVP stores Edge bundles in D1 and limits them to 1.8 MB. This keeps the first version on the existing Workers Paid stack. Multi-module or larger bundles fall back to Sandbox until an R2-backed artifact store is added.

## Security status

The Edge compiler disables npm lifecycle scripts during its low-cost build path. This is not the complete public-hosting security model: outbound-network policy, build resource limits, abuse controls, encrypted per-deployment secrets and source commit pinning still need to be completed before arbitrary untrusted public signup is enabled.
