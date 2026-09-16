# PicoSvc all-services implementation

This branch activates the remaining PicoSvc products in one shared Worker architecture.

Implementation targets:

- RSS: monitored Web → RSS feeds
- Mail: Email Service `email()` handler → public HTTPS webhook
- Shot: Browser Run screenshot/PDF quick actions
- Fetch: URL → rendered Markdown / metadata
- QR: dynamic redirect links
- Cron: scheduled HTTP jobs, driven by a minutely Worker Cron Trigger
- Functions: tiny JavaScript fetch functions on Dynamic Workers
- JSON: token-protected tiny key/value JSON stores
- Files: R2-backed public file delivery
- License: license key issuance and validation
- Flags: public feature-flag configuration
- Monitor: scheduled page-change checks with optional webhook notification
- Forms: public JSON/form submission endpoints

All products use the shared PicoSvc account, product entitlements, monthly usage counters, Bundle grants, and the Free / Pico / PicoPlus pricing model.
