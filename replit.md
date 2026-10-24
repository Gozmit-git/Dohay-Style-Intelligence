# DOHAY Wardrobe

A private, camera-first wardrobe with garment analysis, conversational refinement, explicit save approval, and outfit ideas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API gateway on its managed `PORT`; it starts an internal FastAPI AI service on loopback port 8765
- `pnpm --filter @workspace/dohay-wardrobe run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required services: PostgreSQL, managed Clerk authentication, Replit App Storage, and managed OpenAI AI Integrations. Never print their credential values.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 gateway with a private Python/FastAPI AI service
- DB: PostgreSQL + Drizzle ORM
- Validation: generated Zod API schemas and Pydantic AI response models
- API codegen: Orval (from OpenAPI spec)
- Build: Vite frontend, esbuild ESM gateway; Python dependencies managed through `pyproject.toml` and `uv.lock`

## Where things live

- `artifacts/dohay-wardrobe/src/App.tsx` — landing, authentication, wardrobe, capture, review, chat, and outfit UI
- `artifacts/dohay-wardrobe/src/index.css` — warm editorial theme and responsive layout
- `artifacts/api-server/src/routes/` — authenticated storage and wardrobe APIs
- `artifacts/api-server/fastapi/main.py` — vision analysis, garment conversation, and outfit generation
- `lib/db/src/schema/wardrobe.ts` — user-owned uploads and saved garments
- `lib/api-spec/openapi.yaml` — public API contract; regenerate rather than editing generated clients

## Architecture decisions

- Keep FastAPI for AI processing because the supplied product brief explicitly requests it. Reuse the existing Express gateway for Clerk, database ownership checks, and storage rather than replacing the project's backend.
- FastAPI binds only to loopback. Public clients call the gateway, which authenticates users and loads only their private images and records.
- Photos may upload privately for analysis before approval; a final wardrobe record is created only by the explicit save action.
- Treat visual guesses as estimates. Exact composition, brand, price, GSM, and quality must not be asserted from appearance alone.

## Product

- Capture or upload up to five JPEG, PNG, or WebP images per garment.
- Analyze, chat, edit details and their sources, then confirm saving.
- Persist private garment records and generate outfits using the selected saved record and the user's wardrobe.
- Detect repeated copies of the same primary photo and require a separate confirmation to save another copy.

## User preferences

- The user chose to create their first account through normal sign-up rather than provisioning a shared default login.

## Gotchas

- Run workspace dependency installation after adding a new workspace package.
- The gateway starts the FastAPI process and waits for its health check before accepting requests.
- Regenerate API hooks and Zod schemas after contract changes.
- Clerk development and production accounts are separate; development-key warnings are expected in preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
