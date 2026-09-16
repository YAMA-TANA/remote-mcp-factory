# PicoSvc billing model

PicoSvc uses one account and dashboard. Product usage and entitlements remain independent internally, while paid pricing is standardized across the suite.

## Standalone products

Every PicoSvc service uses the same paid tier names and monthly prices:

| Public plan | Internal tier ID | Price |
| --- | --- | ---: |
| Free | `free` | $0 |
| Pico | `tiny` | $1 / month per service |
| PicoPlus | `pro` | $5 / month per service |
| Custom | n/a | Contact PicoSvc |

The internal IDs `tiny` and `pro` are retained for database and entitlement compatibility. They must not be exposed as the public plan names.

Product-specific quotas still differ. For example, the same Pico plan can mean 10 Mock endpoints, 10,000 Hooks events, or another product-specific allowance. Buying Pico or PicoPlus for one service upgrades only that service.

Examples:

```text
mcp-tiny   -> MCP Pico ($1/month)
mock-pro   -> Mock PicoPlus ($5/month)
hooks-tiny -> Hooks Pico ($1/month)
```

The `product_entitlements` table represents direct product subscriptions.

## Bundles

Two suite bundles are active:

| Bundle | Price | Grant |
| --- | ---: | --- |
| Bundle Pico | $5 / month | Pico (`tiny`) tier across PicoSvc products |
| Bundle Pro | $22 / month | PicoPlus (`pro`) tier across PicoSvc products |

Bundle grants are stored in `bundle_entitlements`, one product grant per bundle. Product-specific quota limits still apply after the tier is granted.

When standalone and bundle entitlements overlap, PicoSvc resolves the highest active tier for that product. Cancelling one standalone product does not touch bundle grants or unrelated products. Cancelling a bundle removes only grants originating from that bundle.

## Custom usage

Usage above PicoPlus, custom quotas, negotiated business terms, or unusual infrastructure requirements are handled through the PicoSvc contact channel rather than another self-serve tier.

## Billing implementation rule

`src/picosvc/catalog.ts` is the backend source of truth for public product pricing and bundle grants. Web UI constants mirror those values in `web/app/pricing-data.ts`, and CI verifies the public pricing page and catalog source so accidental pricing drift is caught before merge.
