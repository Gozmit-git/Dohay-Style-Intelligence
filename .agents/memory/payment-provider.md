---
name: Payment provider requirement
description: User's required payment provider for DOHAY.
---

Pine Labs is required for payment integration.

Payments are for a recurring DOHAY subscription, not one-time purchases.

The user delegated pricing and free-versus-paid feature decisions, with a firm
requirement that the first 20 users receive 70% off whichever option they choose.
Do not reinterpret this cohort as the first 20 paying customers without approval.

**Why:** The user explicitly chose to keep Pine Labs after being offered Stripe and Whop alternatives, and selected recurring subscriptions as the billing model.

**How to apply:** Do not substitute another payment gateway without explicit approval. Confirm the applicable Pine Labs product and its official integration documentation before implementing payments.

AgenticOrg hackathon access is not evidence of Plural subscription access.

**Why:** The supplied example executes agents, while the hackathon site's public
commerce description explicitly gates checkout and payment execution behind a
separately approved path. Agent-run success must not be treated as payment proof.

**How to apply:** Confirm the merchant's approved payment API and sandbox access
before implementing billing. If AgenticOrg is proposed as the payment route,
obtain its payment-specific integration documentation rather than assuming a
generic agent run creates or verifies a subscription.
