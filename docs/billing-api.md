# DOHAY billing API

The billing API foundation is available under `/api/billing`. It does **not**
process payments yet. No AgenticOrg credential is used. Adding credentials alone
does not enable checkout: provider-contract verification and a payment adapter
are still required.

## Endpoints

| Method | Path | Authentication | Behavior |
| --- | --- | --- | --- |
| GET | `/plans` | Public | Free/Plus/Pro catalog, planned limits, readiness blockers |
| GET | `/subscription` | Existing Clerk session | Free billing state and known launch-offer membership |
| POST | `/quotes` | Existing Clerk session | Persist a base-price quote, valid for 15 minutes |
| GET | `/quotes/:quoteId` | Existing Clerk session | Retrieve only the caller's quote; other owners receive 404 |
| POST | `/checkout` | Existing Clerk session | Validate quote ownership/expiry, then return 503 `PAYMENTS_NOT_READY` |

All amounts are integer **paise**, in INR. Quote responses are `payable: false`,
with `taxStatus: not_configured`. They are not final payable invoices.
All responses have `Cache-Control: no-store`.

### Create a quote

```json
{
  "plan": "plus",
  "interval": "month",
  "requestKey": "a4d3a9e5-4491-4bd3-bc9c-7120cbf30fc0"
}
```

Allowed paid plans: `plus`, `pro`. Allowed intervals: `month`, `year`.
Generate a new UUID for each new quote request. Retrying an unexpired request
with the same UUID and selection returns the same saved quote. Changing selection
with that UUID returns 409. An expired replay requires a new UUID.
Limit: ten new quotes per user per 15 minutes; subsequent attempts return 429.
Only server-calculated prices and authenticated ownership are stored.

An eligible Plus monthly quote has `regularAmount: 19900`,
`firstTermAmount: 5970`, `discountPercent: 70`, `renewalAmount: 19900`.

### Request checkout

```json
{ "quoteId": "<UUID from the quote response>" }
```

Unknown or other-user quotes return 404; expired quotes return 409; otherwise
checkout returns 503 with a specific explanation. There is no success redirect,
payment receipt, subscription activation, or offer redemption.

## Launch offer

The server reads the oldest 20 accounts from the current Clerk environment, in
signup order, and permanently records cohort slots under a database transaction
lock. The caller does not get precedence. No identities are exposed in responses.
Missing Clerk access fails the quote explicitly rather than guessing eligibility.
Quote creation never redeems the discount.

Existing cohort records remain even when a user is deleted. Historical accounts
deleted **before initial cohort synchronization** cannot be reconstructed from
the live Clerk list. Audit that history before enabling payments, and do not mix
development cohort records with production accounts. Current paid state is always
`no_paid_subscription` because there is no verified payment integration yet.
`not_yet_evaluated` means no membership has been recorded, not a promise of eligibility.

## Remaining integration work

- Merchant subscription sandbox access; credentials entered securely.
- Verify discounted first-term/full-price-renewal mandate support.
- Hosted checkout, verified webhooks, reconciliation, idempotent payment ledger.
- Atomic offer redemption on verified payment success, not quote/redirect.
- Subscription activation, cancellation, plan changes, renewals and recovery.
- Tax configuration and final totals, refund policy and customer support details.
- Pricing/account UI and actual server-side usage-limit enforcement.

No existing styling feature is paywalled by this change.

## Verification

`pnpm --filter @workspace/api-server run test:billing`

`pnpm run typecheck`

Contract: `lib/api-spec/openapi.yaml`; regenerate clients with
`pnpm --filter @workspace/api-spec run codegen` after contract changes.
