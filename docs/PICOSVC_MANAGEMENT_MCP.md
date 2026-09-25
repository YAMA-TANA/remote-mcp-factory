# PicoSvc Management MCP

PicoSvc exposes a built-in Remote MCP endpoint for managing the authenticated owner's PicoSvc MCP deployments.

## Endpoint

```text
POST https://<worker-origin>/mcp/picosvc
Authorization: Bearer psm_...
```

The endpoint uses the current MCP TypeScript SDK and supports the modern 2026-07-28 protocol plus the SDK's stateless legacy compatibility mode.

## Create a management key

Management keys are created only through the Clerk-authenticated management API. A management MCP key can never mint, list, or revoke other management keys.

```http
POST /api/picosvc/mcp/keys
Content-Type: application/json

{
  "name": "ChatGPT",
  "scopes": ["read", "mcp:manage"]
}
```

The response contains a `psm_...` token exactly once. Only its SHA-256 hash is stored in D1.

Available scopes:

- `read` — catalog/account information, deployment inspection, secret-name listing.
- `mcp:manage` — create deployments, change visibility/enabled state, rebuild, rotate deployment bearer tokens.
- `secrets:write` — create/replace/delete encrypted deployment secrets.

For a Pixiv MCP, create the deployment with `visibility: "token"` and store `PIXIV_REFRESH_TOKEN` as an encrypted deployment secret. Secret values cannot be read back through the management MCP.

List and revoke keys:

```http
GET /api/picosvc/mcp/keys
DELETE /api/picosvc/mcp/keys/<key-id>
```

## Tools

| Tool | Required scope | Purpose |
| --- | --- | --- |
| `list_products` | read | Product catalog, tiers and bundles |
| `get_account` | read | MCP plan, usage and PicoSvc entitlements |
| `list_mcp_deployments` | read | List deployments without secret/token hashes |
| `get_mcp_deployment` | read | Deployment runtime, tools and secret names |
| `create_mcp_deployment` | mcp:manage | Deploy a public GitHub MCP repository |
| `update_mcp_deployment` | mcp:manage | Toggle visibility and enabled state |
| `rebuild_mcp_deployment` | mcp:manage | Queue a rebuild |
| `rotate_mcp_bearer_token` | mcp:manage | Rotate and return a new one-time deployment token |
| `list_mcp_secret_names` | read | List secret names only |
| `put_mcp_secrets` | secrets:write | Create/replace encrypted secrets |
| `delete_mcp_secret` | secrets:write | Delete one encrypted secret |

Private GitHub repositories still use the existing GitHub App deployment flow. The management MCP's `create_mcp_deployment` tool intentionally accepts public repository URLs only; this avoids treating an installation ID as authorization.

## Database and deployment

Apply migration `0031_picosvc_management_mcp.sql` before issuing management keys:

```bash
npm run db:migrate
```

Deploy the Worker after the migration. A GitHub CI pass does not apply the production migration or deploy the Worker.

## Security notes

- Management key plaintext is shown once and never stored.
- Deployment bearer tokens are shown only on deployment creation or rotation.
- Deployment secrets are encrypted with the existing AES-GCM `DEPLOYMENT_SECRETS_KEY` flow.
- No MCP tool returns deployment secret values.
- Use a key without `secrets:write` unless the client actually needs to mutate secrets.
- Revoking a management key immediately prevents future MCP calls using that key.
