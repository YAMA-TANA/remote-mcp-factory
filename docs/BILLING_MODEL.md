# PicoSvc billing model

PicoSvc uses one account and dashboard but does not use one suite-wide paid plan.

## Standalone products

Each product owns its own plan, price, quota, renewal, and cancellation state. A purchase for one product does not unlock another product.

Examples:

```text
mcp-tiny   -> MCP Tiny only
mock-pro   -> Mock Pro only
hooks-tiny -> Hooks Tiny only
```

The `product_entitlements` table represents these direct product subscriptions.

## Bundles

Bundles are optional discounted combinations. A bundle writes one grant per included product to `bundle_entitlements`.

Example:

```text
starter-dev bundle
  mock  -> tiny
  hooks -> tiny
  rss   -> tiny
```

The actual bundle name, composition, and price must be configured explicitly in the billing catalog. The code must never assume that every product is included or that every product uses the same price.

When standalone and bundle entitlements overlap, PicoSvc resolves the highest active tier for that product. Cancelling one standalone product does not touch bundle grants or unrelated products. Cancelling a bundle removes only grants originating from that bundle.
