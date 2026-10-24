---
name: Stable browser verification
description: Avoid false React hook-order failures caused by live edits during a browser test.
---

Finish hook changes before starting a browser verification pass, and do not change hook structure while the tester is interacting with the app.

**Why:** Hot reload during an active pass produced a hook-order error even though the final source used unconditional hooks. A cold page load confirmed the final code was sound.

**How to apply:** Freeze the implementation for a pass. If a hook-order failure coincides with live edits, inspect the source for real conditional hooks, restart the web workflow, and cold-load the page before diagnosing further. Continue only the blocked checks rather than repeating unrelated flows.
