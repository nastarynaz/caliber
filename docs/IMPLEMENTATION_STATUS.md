# Implementation and verification — 1 October 2026

## Current scope

Working Set 01 local demo plus connected adapter: eight equipment identities, 12 original sources, 26 work orders, source viewer, deterministic retrieval with optional evidence-grounded Gemini synthesis, QR, role-separated document governance, manual processing, private uploads, review/publication/indexing, clarification/investigation, preserved closure revisions, unknown-cause verification, failed knowledge refresh and retry.

The first-login experience includes a role-aware spotlight walkthrough with persistent completion, replay control, Back/Next/Skip, keyboard navigation, focus trapping, inert background content, reduced-motion support, and responsive coachmark placement.

Supabase connected mode now includes Auth, RLS-scoped snapshots, private Storage, and transactional role-checked RPC mutations. Gemini grounded synthesis is implemented behind an explicit environment switch, with three-turn ephemeral context, sanitized inputs, a validated HTTP-only equipment-scope preference, and a process-local rate limit. No remote migration, live Gemini call, OCR job, or deployment was performed because no project credentials were supplied.

## Verification

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm exec next typegen` | Passed |
| `pnpm exec tsc --noEmit` | Passed |
| `pnpm test` | 21 domain/security tests passed |
| `pnpm test:e2e` | Four browser/API integration tests passed using isolated headless Brave |
| `pnpm build` | Passed (Turbopack) |
| Supabase RLS/migration | Not run: no configured authorized database |
| Live Gemini | Integration compiled; not called without a user-supplied key |
| OCR/embeddings | Foundation only; not configured or called |
| Physical-device touch/Safari | Not run |

Browser coverage: onboarding auto-start/replay/spotlight/keyboard dismissal; real source-image loading; Inter font resolution; 1440/1024/390px without page overflow; reduced-motion mode; keyboard resize; modal Escape/focus return; citation selection retaining conversation; QR return; backend permission denial; session isolation; CSRF; private uploads and duplicate rejection; clarification; correction snapshots; unknown-cause verification; refresh failure/retry; retrieval of the reviewed case.

Local screenshots: `artifacts/onboarding-desktop.png`, `onboarding-mobile.png`, `workspace-desktop.png`, `workspace-compact.png`, `workspace-mobile.png`, and `verified-case.png`.

## Product-flow traceability

| Flow | Local implementation | Remaining |
| --- | --- | --- |
| A2/A5/A7/A14 | Login return, reader access, role denials | Scoped multi-role evaluation and access administration |
| B4-B20 | Manual processing failure/recovery, metadata, review correction, publication, indexing failure/retry, atomic replacement, connected RPC transactions | Automatic parsing, durable jobs, effective dates |
| C8/C9, C14/C15/C13 | Read-only fallback, clarification retaining original observation | Photos and scoped assignment |
| C17/C18/C16, C21/C22/C19 | Append findings, closure snapshots, correction, return to investigation, connected persistence | Notifications |
| D2-D14/D17/D20-D26 | Scope, accessible sources, citation allow-listing, conflicts, insufficient evidence, no fake trend, exact source inspection, optional Gemini synthesis | Semantic retrieval, ambiguity clarification, independent partially supported claims, persisted conversations |
| E3/E6/E9/E13/E14/E22 | No matching history, open investigation, shared closure service | Scoped connected retrieval |
| E15-E18/E21 | Unknown cause allowed; verified closure separate from refresh failure/retry | Durable embedding/provider worker |

## Master-prompt acceptance status

Local pass means tested in demo mode, not certified for production.

| Criteria | Status |
| --- | --- |
| 1–6 | Local pass: identifiers, citations, unapproved upload, role checks, replacement activation, superseded exclusion |
| 7–9 | Partial: restricted source/API tests pass and provider citations are allow-listed; connected multi-asset RLS tests and live provider call remain unexecuted |
| 10–12 | Local pass: observations unverified, QR return, preserved report and reviewed closure |
| 13–14 | Deterministic fallback tested; optional grounded Gemini path compiled; no fabricated measured trends |
| 15 | Partial: duplicate upload rejection and transition guards; durable worker unimplemented |
| 16–17 | Local pass: nulls, layouts, keyboard resize, focus; physical touch untested |
| 18 | Mode separation implemented; live Supabase failures untested |
| 19–23 | Local pass: denied writes/admin, clarification, correction, unknown-cause closure, no matching history |
| 24 | Partial: source conflicts/insufficiency tracked; independent partial-support generation absent |
| 25–28 | Local workflows tested; manual processing substitutes absent OCR; scoped production review incomplete |
| 29–32 | Local pass for exercised routes/browser checks; physical devices/Safari untested |

## Design review — emil-design-eng

| Before | After | Why |
| --- | --- | --- |
| Starter page and circular font aliases | Source-first desk, distinct Inter/Geist Mono variables | Evidence hierarchy and readable identifiers |
| Long mobile filename overflow | `overflow-wrap: anywhere` on evidence text | Preserve legible provenance |
| Random sidebar skeleton width | Deterministic width | Stable server/client rendering |
| Repeated interactions could animate decoratively | Immediate tabs/source selection/keyboard resizing; reduced motion | High-frequency workflow remains responsive |
| Global AI forgot scope and follow-up context | Validated HTTP-only scope preference and three bounded in-memory turns | Preserve operator context without persisting conversation content |

Existing components retained. No fabricated KPI/telemetry or decorative AI hero added.

## Limitations

Active multi-role scope evaluation, automatic OCR/semantic workers, photos, conversation persistence, partial-evidence outcomes, effective dates, access administration, and the rest of the structured engineering schema are unfinished. Connected migrations still need execution against an authorized project. Local sessions and Gemini rate limits are process-local; distributed quotas, malware scanning, and retention/cleanup are still production work. See README for setup instructions.
