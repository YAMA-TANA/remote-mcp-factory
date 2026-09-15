# Edge compiler test contract

A deployment is considered Edge-ready only after all of these succeed on the transformed build copy:

1. repository analysis reports a supported Node/TypeScript MCP shape;
2. MCP SDK v1 migration (when needed) finishes without codemod action markers;
3. stdio bootstrap is removed or an existing Web-standard handler is reused;
4. Wrangler produces a single JavaScript Worker bundle within the D1 MVP size limit;
5. local workerd starts the bundle;
6. JSON-RPC `initialize` succeeds;
7. `tools/list` succeeds and returns a tools array.

Any failure falls back to the Linux Sandbox instead of publishing a broken Edge deployment.
