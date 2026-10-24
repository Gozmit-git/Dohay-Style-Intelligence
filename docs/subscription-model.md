# DOHAY subscription and payment model

Status: product specification with a catalog/quote API foundation; not an
implemented payment integration. See `billing-api.md` for current capabilities.
Provider: Pine Labs Online Payments / Plural. Start in sandbox only.

## Plans

Prices below are base prices in INR. Applicable taxes must be configured and
the full payable total disclosed before live checkout; tax treatment is not
yet established.

| Capability | Free | Plus | Pro |
| --- | --- | --- | --- |
| Monthly price | ₹0 | ₹199 | ₹499 |
| Annual price | — | ₹1,990 | ₹4,990 |
| AI chat replies per month | 10 | 100 | 300 |
| Outfit photo reviews per month | 2 | 20 | 60 |
| Saved wardrobe items | 25 | 150 | 500 |
| Outfit recommendation requests per month | 1 | 20 | 60 |
| Profile, styling preferences, manual wardrobe edits | Included | Included | Included |
| Browser dictation and spoken replies, when supported | Included | Included | Included |
| View saved chats, outfits, and wardrobe | Included | Included | Included |

Annual pricing is equivalent to ten monthly payments. Annual plans renew yearly,
but AI usage allowances reset monthly, not yearly. No unlimited AI claims.
Usage caps are launch assumptions and require monitoring against actual provider
costs; they are not a claim of validated profitability.

## Usage accounting

- Free quotas use UTC calendar months; paid quotas use monthly subscription
  anniversaries, clamped to the last day when a month is shorter.
- Each successful normal assistant reply counts as one chat reply.
- A successful fit check counts as one photo review, not also a chat reply.
- One recommendation request counts as one request, regardless of the number
  of outfit boards returned.
- Automatic garment identification consumes one chat unit per successful scan
  job; existing server-side attachment limits continue to apply.
- Failed provider operations do not consume usage. Retries and duplicate
  requests must not consume twice. Reserve quota atomically before provider work,
  finalize on success, and release it on failure.
- Item limits count saved wardrobe items, not photographs. Enforce limits when
  confirming scanned items as well as when creating items manually.
- Show remaining allowance and reset date. Do not bill overages automatically.

## Launch offer: first 20 users

The user requires a 70% discount for the first 20 users on any plan they choose.
Implementation interpretation: the first 20 registered DOHAY accounts, not the
first 20 payments. Include existing real accounts in chronological signup order.
Verify the authoritative account creation source before allocating eligibility.

| Selection | Regular first term | Launch first term |
| --- | --- | --- |
| Plus monthly | ₹199 | ₹59.70 |
| Plus annual | ₹1,990 | ₹597 |
| Pro monthly | ₹499 | ₹149.70 |
| Pro annual | ₹4,990 | ₹1,497 |

- Discount applies once to the first successfully paid subscription term.
  Monthly buyers receive one discounted month; annual buyers receive one
  discounted year. Subsequent renewals use the disclosed regular price.
- Eligibility does not expire for these 20 accounts at launch.
- Allocate eligibility on the server, uniquely and atomically; never use a
  browser coupon or browser-supplied amount as authority.
- A failed or abandoned checkout must not consume the discount. Only verified
  payment success redeems it, with safeguards against parallel checkouts.
- A refund does not create another promotional redemption. Deleted eligible
  accounts do not release slots for new accounts.
- Plan changes and resubscriptions do not earn a second discount.
- Every checkout must show the discounted initial total, billing interval,
  regular renewal total/date, and cancellation terms before authorization.

The first-term-only duration is a business decision made under the user's
delegated authority to avoid unbounded recurring discounts; it was not an
explicit duration supplied by the user.

## Subscription lifecycle

- Free access requires no card or mandate. No separate paid trial at launch.
- Use provider-hosted authorization/checkout; DOHAY must not collect card data.
- Unlock paid capabilities only after server-verified successful payment and
  the required mandate state. A redirect alone is not proof of payment.
- Support cancellation of future billing while preserving already-paid access
  through the end of the paid term. Confirm provider cancellation semantics
  before implementation.
- Schedule plan and billing-interval changes for the next renewal; no mid-cycle
  proration at launch. The UI must clearly state when a change takes effect.
- On renewal failure, retain access only through the paid-through date, then
  fall back to Free. Show an explicit payment-recovery action.
- Never delete saved data because of downgrade or cancellation. Preserve viewing,
  export where available, and deletion; block new additions above the new cap.
- Use provider-supported pre-debit notification and collection rules. Confirm
  who schedules recurring debit requests; do not assume mandate creation alone
  schedules renewals.
- Validate provider support for discounted first terms followed by full-price
  renewals, including authorized mandate amount. Do not silently substitute
  manual one-time payments or recurring 70% discounts.

## Implementation prerequisites and safeguards

1. Merchant sandbox client credentials and subscription product enablement.
2. Confirm recurring payment methods, hosted mandate flow, recurring collection
   scheduling, and introductory-pricing support against the merchant's API version.
3. Obtain webhook event format, authenticity verification, retry behavior,
   and subscription/payment reconciliation documentation.
4. Define legal business details, tax treatment, refund policy, and customer
   support contact before real charges.
5. Persist provider references and payment events with ownership, idempotency,
   replay protection, atomic entitlement changes, and auditability.
6. Keep credentials server-side. Verify amounts/currency and match every payment
   to the authenticated user's subscription.
7. Test successful, failed, cancelled, duplicate, and delayed payment events;
   renewal, downgrade, and discount races before enabling live billing.

## Official references

- https://www.pinelabs.com/docs/online-payments/api/authentication/generate-token
- https://www.pinelabs.com/docs/online-payments/api/subscriptions-subscriptions/create-subscription
- https://www.pinelabs.com/docs/online-payments/api/subscriptions-plans
- https://www.pinelabs.com/docs/online-payments/api/subscriptions-presentations
