---
name: API contract generation pitfalls
description: Runtime nullable-reference behavior and barrel regeneration differences in Orval.
---

Do not rely on generated TypeScript types alone to validate nullable response fields. For nullable referenced objects in this project's OpenAPI generation, use an explicit nullable object with an `allOf` reference and test the generated runtime validator.

**Why:** A plain `$ref` with a nullable sibling produced a client type that accepted null but a Zod validator that rejected it. Ordinary chat then returned 502 despite a successful AI response.

**How to apply:** Cover both null and populated variants in contract tests whenever a response contains an optional referenced object.

Keep explicit disambiguating exports for runtime request validators that share names with generated request-body types.

**Why:** Regeneration appends the generated type barrel export again if it is removed. Deleting that export is not a durable fix for ambiguous names.

**How to apply:** Select the intended validator through an explicit named export rather than removing automatic type exports after each generation.
