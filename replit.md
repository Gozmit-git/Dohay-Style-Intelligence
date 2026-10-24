# DOHAY Wardrobe

A private, chatbot-first personal styling app. DOHAY chat is the main interface; wardrobe review, profile preferences, and saved outfit boards support that conversation.

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

- `artifacts/dohay-wardrobe/src/App.tsx` — landing, authentication, navigation, and page routing
- `artifacts/dohay-wardrobe/src/pages/` — persistent chat, wardrobe management, profile, and saved outfits
- `artifacts/dohay-wardrobe/src/index.css` — warm editorial theme and responsive layout
- `artifacts/api-server/src/routes/` — authenticated storage and wardrobe APIs
- `artifacts/api-server/fastapi/main.py` — vision detection and conversational styling
- `artifacts/api-server/src/lib/outfitEngine.ts` — deterministic, owned-item outfit assembly and scoring
- `lib/db/src/schema/` — private uploads, garments, profiles, threads, scan jobs, outfits, and feedback
- `lib/api-spec/openapi.yaml` and `mvp.openapi.yaml` — public API contract; regenerate rather than editing generated clients

## Architecture decisions

- Keep FastAPI for AI processing because the supplied product brief explicitly requests it. Reuse the existing Express gateway for Clerk, database ownership checks, and storage rather than replacing the project's backend.
- FastAPI binds only to loopback. Public clients call the gateway, which authenticates users and loads only their private images and records.
- Wardrobe capture is exclusively Upload photos or Take photo in Wardrobe. The user explicitly replaced manual first-review approval with automatic saving of detected items; retain AI-estimate provenance and allow optional editing afterward.
- Treat visual guesses as estimates. Exact composition, brand, price, GSM, and quality must not be asserted from appearance alone.
- Keep DOHAY branding and the existing app. Chat remains the primary interface because the user explicitly chose a full chatbot-first MVP, not a separate FitCheck product.
- Outfit boards use saved, available, owned garments only. Autosaved estimates are not user-verified facts. Apply occasion, dress-code, exclusion, and layering constraints before ranking; never invent garments to fill three boards.
- Scan jobs are persisted and resumed after restart. The current worker runs within the API process and processes one image batch at a time.

## Product

- Chat with persistent conversation history.
- Styling chat has no Add to wardrobe action. Outfit selfies automatically queue a private AI-edited styling simulation; show it as the primary result, with text review notes optional. The user explicitly requested this visual simulation despite its exclusion from the original MVP brief. Label it AI-generated, never a guarantee of fit, identity fidelity, or ownership. Preserve the original and never infer body measurements or change body shape.
- Automatic image edits require an assessable outfit in the first image. For unclear/non-outfit inputs, ask for a clearer photo instead of starting a paid image edit. Queue image generation as a persisted background job rather than holding the chat request open.
- Voice currently uses browser dictation and speech synthesis, as explicitly chosen by the user without connecting ElevenLabs. Label it browser-powered, make microphone activation and auto-read opt-in, and keep text chat available when unsupported.
- Explicit image consent before JPEG, PNG, or WebP uploads; up to ten photos per batch, each at most 10 MB.
- Background photo detection automatically saves individual garments/accessories with separate masked cutout images, not the full selfie. Preserve only visible garment pixels; do not reconstruct hidden fabric. Contour edges and attributes are estimates. Existing records remain unless explicitly edited/deleted; re-uploading a matching old source can upgrade its item image without overwriting manual attribute corrections.
- Manage availability, edit garments, remove private assets, and use saved outfit boards.
- Chat exposes saved style, palette, comfort restrictions, and default workplace dress code, plus per-request occasion, dress code, activities, exclusions, and weather. These remain optional for quick chat and selfie reviews, as agreed with the user; only wardrobe outfit boards require confirmed occasion and dress code.
- Apply request details explicitly before using them in chat. Saved preferences persist across conversations; request details reset for a new conversation. Use opt-in Open-Meteo weather or manual temperature/rain, and never retain precise coordinates in chat history.
- Initial normalized outfit weights: occasion/dress 30%, compatibility 25%, weather 20%, style 15%, layering/variety 10%.
- Detect repeated copies of the same primary photo during autosave; do not duplicate saved items or overwrite manual attribute corrections. Separate occurrences of the same garment/accessory type within one image remain distinct.

## User preferences

- The user chose to create their first account through normal sign-up rather than provisioning a shared default login.

## Gotchas

- Run workspace dependency installation after adding a new workspace package.
- The gateway starts the FastAPI process and waits for its health check before accepting requests.
- Regenerate API hooks and Zod schemas after contract changes.
- Clerk development and production accounts are separate; development-key warnings are expected in preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
