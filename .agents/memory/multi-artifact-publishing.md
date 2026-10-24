---
name: Multi-artifact publishing
description: Why secondary creative artifacts can block a DOHAY publish.
---

Validate every production-enabled artifact before recommending a DOHAY republish, not only the wardrobe app.

**Why:** A partially completed walkthrough video blocked publication of payment fixes even though the API and wardrobe production builds passed. Publishing builds all configured production services.

**How to apply:** When investigating publish failures, identify the artifact named in the actual build logs. Repair its build without assuming the customer-facing app caused the failure. Keep unfinished creative work buildable.
