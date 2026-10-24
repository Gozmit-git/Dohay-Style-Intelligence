---
name: Payment provider requirement
description: User's required payment provider for DOHAY.
---

The user replaced the Pine Labs requirement with their GPay QR for the MVP on 2026-10-24.

Payments purchase DOHAY subscription periods; a static QR does not enable automatic recurring charges.

The user delegated pricing and free-versus-paid feature decisions, with a firm
requirement that the first 20 users receive 70% off whichever option they choose.
Do not reinterpret this cohort as the first 20 paying customers without approval.

**Why:** The user explicitly said not to use Pine Labs and supplied a GPay QR because this is an MVP.

**How to apply:** Preserve manual verification against actual transfers before granting a paid period. Do not infer success from clicking “paid,” a submitted reference, or a generic agent run. Obtain approval before introducing another gateway.

AgenticOrg hackathon access is not evidence of Plural subscription access.

**Why:** The supplied example executes agents, while the hackathon site's public
commerce description explicitly gates checkout and payment execution behind a
separately approved path. Agent-run success must not be treated as payment proof.

**How to apply:** Confirm the merchant's approved payment API and sandbox access
before implementing billing. If AgenticOrg is proposed as the payment route,
obtain its payment-specific integration documentation rather than assuming a
generic agent run creates or verifies a subscription.
