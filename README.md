# Manufacturing Knowledge Hub!

A working CALIBER Case 1 pilot using Next.js App Router, React, Tailwind 4, Supabase, and Gemini. It supports an isolated local demo and an authenticated connected workspace with transactional workflow operations, RLS-scoped reads, private files, and evidence-grounded answers.

First-time users receive a role-aware spotlight tour on the equipment workspace. It introduces navigation, equipment context, reporting, evidence, retrieval, related sources, and governance where applicable. Completion is stored locally in the browser. Use the question-mark button in the global header to replay it at any time.

## Run

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Development defaults to isolated demo mode. Choose Engineer, Document controller, Technical reviewer, or Read-only engineer. Switching personas retains the workspace; signing out and entering again starts a fresh workspace. Sessions expire after eight hours.

For explicit configuration, create `.env.local` using `.env.example`. Set `NEXT_PUBLIC_SITE_URL` to the exact browser origin, including port: localhost and 127.0.0.1 are different origins. Mutations enforce this origin. Session and Candra preference cookies automatically use `secure` in production; `COOKIE_SECURE=true` is available for HTTPS environments that do not expose a production environment marker.

Production requires explicit `HUB_MODE=demo` or `HUB_MODE=connected`; backend errors never fall back to demo. Local development persists demo sessions in private `.local-data/` files. Production demo mode writes to the platform temporary directory so a serverless preview can run, but that storage is ephemeral and a session can reset between instances or deployments. Use `HUB_MODE=connected` with Supabase for a stable multi-instance deployment. Session/file cleanup is not scheduled. Do not upload confidential plant data.

### Deploying a preview

The repository root is already the Next.js application, so no subdirectory/root override is needed. Add these production environment variables in the hosting platform:

```bash
HUB_MODE=demo
NEXT_PUBLIC_SITE_URL=https://your-exact-domain.example
COOKIE_SECURE=true
GEMINI_ENABLED=false
```

Redeploy after saving the variables. Preview deployments with a different generated hostname need their own exact `NEXT_PUBLIC_SITE_URL`, or leave that variable unset so the application validates against the incoming origin. Source PDFs and P&ID originals under ignored `data/files/` are not included in Git deployments; connected deployments should place them in the private Supabase `hub-sources` bucket.

## Source data

- Eight permanent equipment identities; Set 01 alone has imported source coverage.
- GA-1201A: 11 PDFs and one original P&ID PNG, with previews and provenance.
- 26 original maintenance records, retaining workbook locators and work orders.
- Five records retain missing cost/downtime as null, not zero.
- Imported references start unapproved; printed document approval is not Hub approval.

Metadata lives in `data/catalog.json` and `data/file-manifest.json`. Source files/previews live in private, Git-ignored `data/files/` and are delivered through authenticated API routes, never public assets.

The eight supplied equipment references have been redrawn as code-native inline SVGs in the reusable `EquipmentVisual` component. It maps permanent equipment IDs to distinct vector drawings, includes accessible titles/descriptions and a fallback, and supports `thumbnail`, `compact`, and `hero` variants without loading raster assets:

```tsx
import { EquipmentVisual } from "@/components/knowledge-hub/equipment-visual";

<EquipmentVisual equipment={equipment} variant="hero" showCaption />
```

The `/equipment` directory also composes all eight SVGs into a single P&amp;ID-inspired relationship map. Solid lines show conceptual process/product routing, dashed brown lines show recycle context, and dotted blue lines show utilities. Equipment fill is derived from governed Hub records: green means no active report, blue means an active report, amber means knowledge/source attention, and red is reserved for active reports containing critical/trip/emergency language. These are Hub record states, not live DCS measurements. Because the supplied P&amp;IDs are standalone training systems rather than one master plant drawing, the integrated topology is explicitly labeled conceptual and must not be used as an operating drawing.

Run `pnpm import:pilot` to regenerate from the original Caliber workspace. It needs the previously validated extraction caches and sources referenced in `scripts/import-case-materials.mjs`. A standalone clone needs these inputs or securely transferred `data/files/`. Original source files and existing session snapshots are not changed.

## Judge's walkthrough

1. Enter as Engineer. Open GA-1201A, ask the startup question, and inspect its exact citation. Observe “Source awaits review.” Asking for a temperature trend produces an honest missing-measurements response.
2. Ask about vibration to find real historical work orders, clearly distinguished from a diagnosis.
3. Report an observation with its time and symptom. The session supplies reporter and submission time.
4. As Technical reviewer, begin triage, request clarification, review the engineer's response, and assign investigation.
5. As Engineer, append findings and submit an outcome/evidence-backed closure. Keep cause “Not established” when appropriate.
6. As Reviewer, return a closure for correction or verify it. Test refresh failure: verification remains intact, but retrieval stays unavailable. Retry refresh and retrieve the reviewed case by its symptom.
7. As Controller, confirm source metadata, equipment links, and access classification. Submit for review. A direct controller approval request is also rejected.
8. As Reviewer, approve or return the exact revision with comments. As Controller, publish and build its local keyword index. Failed replacement indexing retains the old current version.
9. Upload a PDF/PNG privately. It begins queued and unapproved. Automatic OCR is absent: use the explicit manual transcription/provenance form, then metadata/review. Processing and indexing retries have separate gates.
10. Test the permanent equipment QR and reader persona: login returns to the requested equipment, but reporting is denied.

Role switching and failure scenarios are demo simulations with real server-side transition validation. Index activation is local keyword eligibility, not generated embeddings. Original uploaded bytes/checksums and closure snapshots are retained.

## Verification

```bash
pnpm lint
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Browser tests need a running development server and a Chromium browser:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Alternatively, set `TEST_BROWSER_PATH` to an existing Chromium executable. Recorded QA used an isolated headless Brave process, not a personal profile:

```bash
TEST_BROWSER_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' pnpm test:e2e
```

Set `TEST_BASE_URL` for a different server origin. Screenshots go to ignored `artifacts/`; failures/traces to `test-results/`. Inter and Geist Mono use next/font; initial builds require Google Fonts access. See [verification and coverage](docs/IMPLEMENTATION_STATUS.md).

## Supabase connected mode

No remote project was created, migrated, seeded, or deployed by this repository. Connected mode is implemented, but you must point it at a Supabase development project you control.

To evaluate on an explicitly authorized development project:

1. Review/apply `supabase/migrations/202609240001_foundation.sql`, then `supabase/migrations/202609270001_connected_operations.sql`, in that order.
2. Run `node scripts/export-supabase-seed.mjs` offline. Review `artifacts/caliber-training-seed.sql` before applying it to a training database. Re-imports do not overwrite existing rows/review state.
3. Upload the imported `data/files/` objects into private bucket `hub-sources`, retaining manifest filenames. New controller uploads are handled by the application and registered transactionally.
4. Create Auth users, then adapt and run `supabase/provision-user.example.sql`. New users start as deny-by-default readers. A document needs its own grant **and every linked asset's grant**. The reviewers classification additionally requires controller/reviewer responsibility.
5. Copy `.env.example` to `.env.local`; set `HUB_MODE=connected`, the Supabase URL, publishable key, server-only service role, exact site origin, and cookie flag. Never expose the service-role or Gemini key with a `NEXT_PUBLIC_` prefix.
6. Run `psql -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql` against an authorized disposable development database. It creates synthetic fixtures and rolls back. This script is supplied but **not executed here**.

Client-facing tables have RLS and SELECT-only grants. Mutations go through narrowly exposed, role-checking, transaction-safe RPC functions; clients do not receive direct table writes. JSONB is used for command/snapshot transport, not core entity storage. Durable job/chunk/extraction tables and embedding metadata remain foundations rather than a running extraction worker.

## Gemini grounded answers

Set `GEMINI_ENABLED=true`, add the server-only `GEMINI_API_KEY`, and choose models in `.env.local`. Both grounded chat (`GEMINI_ANSWER_MODEL`) and document understanding/OCR (`GEMINI_MODEL`) default to the cost-efficient `gemini-3.1-flash-lite`; raise the OCR model only for an explicitly approved exceptional job. If disabled, the hub continues to use deterministic retrieval. If enabled, the question endpoint:

- builds evidence only from the caller's already RLS-filtered snapshot;
- includes approved, published, indexed, current documents plus verified case closures and scoped historical records;
- adds governed equipment profiles and document-lifecycle metadata without exposing unapproved document bodies;
- expands common Indonesian engineering terms into bilingual retrieval terms before ranking evidence;
- caps each answer at six ranked passages and a 20,000-character evidence budget to control token spend;
- uses a stateless Gemini Generate Content request with structured JSON output;
- rejects citations that are not in the authorized evidence set;
- accepts at most three sanitized in-memory conversation turns for follow-up context; conversations are not persisted;
- remembers the last authorized equipment scope in an HTTP-only preference cookie;
- exposes the provider, evidence, citations, conflicts, and limitations in the response;
- never sends live measurements because no historian connection exists.

`GEMINI_EMBEDDING_MODEL` and dimensions are included for the future semantic-index worker. Current retrieval is governed keyword selection followed by Gemini synthesis; it does not claim a vector index. The in-process 10-requests/minute guard limits accidental local usage, but production deployments should add a shared distributed limiter.

Schema deviations from the full Supersheets: plant/area masters, asset aliases, engineering facts/protection rules, attachments, notifications, and conversations remain unfinished. Scoped multi-role membership is modeled, but the current UI/auth adapter uses one primary role.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security](https://supabase.com/docs/guides/database/functions).

## Next slice

- Scoped multi-role evaluation and executable local Supabase integration tests.
- Durable worker claiming/retries, PDF/OCR extraction, chunk embeddings, and semantic retrieval.
- Optional photos, private persisted conversations, independent partial-evidence/conflict outcomes, effective-date publication, and access administration.
- Distributed quotas, retention/cleanup, malware scanning, deployment hardening, and production operational review.

Canonical requirements: [MASTER_PROMPT.md](docs/MASTER_PROMPT.md). All 32 production acceptance criteria are **not** claimed complete.
