---
name: Workspace dependency linking
description: Dependencies declared by a newly copied workspace package may not be linked by a filtered pnpm add.
---

After introducing a new workspace package from a template, run a full workspace `pnpm install` if TypeScript cannot resolve dependencies already declared in that package.

**Why:** A filtered add linked the new package to its consumer but left the new package's own dependencies unavailable; a full workspace install fixed resolution without dependency changes.

**How to apply:** Check the new package manifest before adding duplicate dependencies or changing TypeScript resolution settings.
