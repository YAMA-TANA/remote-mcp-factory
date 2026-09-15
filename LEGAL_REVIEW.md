# PicoSvc paid-launch legal review checklist

The repository now includes baseline Terms of Service and a Privacy Policy, but the following business-specific items must be confirmed before a paid public launch:

- Operator/legal entity name and business address where disclosure is legally required.
- A private support/privacy contact channel. Do not direct privacy requests to public GitHub issues.
- Final payment processor and its billing/privacy disclosures.
- Final product prices, renewal intervals, taxes, cancellation flow, and refund wording.
- Any Japanese Act on Specified Commercial Transactions disclosure required by the final checkout flow.
- Whether Japan/Tokyo governing-law and venue language matches the actual operating entity.
- Final list of subprocessors and analytics/observability providers.
- Product-specific retention periods once Logs, Hooks, Mail, Files, Forms, and Monitor are implemented.
- Cookie/analytics consent behavior for jurisdictions where consent is required.

`/terms` and `/privacy` deliberately avoid inventing an operator name, postal address, support email, payment processor, or fixed retention period that has not been configured yet.
