# Production ingestion preflight

Date: 2026-09-30 (Asia/Jakarta)

Status: **Source/Gemini/target approval recorded; blocked on database-migration credentials and production account identities. No remote mutation or document transfer has occurred.**

## Executive result

The local source set is complete and internally consistent. The configured Gemini project is reachable and exposes the configured generation and embedding models. The configured Supabase project is reachable after normalizing its base URL, but the Knowledge Hub schema and private source bucket have not been provisioned on that project.

The owner confirmed the target project, authorized additive migrations, authorized Gemini processing because the source is dummy data, delegated conservative retention settings, and supplied the production origin. Remote migration still requires a scoped Supabase Management API token or the database password; neither is present in the environment. The remote Auth service currently contains zero users, so the visible demo personas cannot yet be mapped to real production accounts.

## Local source inventory

The read-only manifest scan found:

| Check | Result |
| --- | ---: |
| Total source files | 99 |
| Total source bytes | 19,586,624 |
| PDFs | 88 |
| Total PDF pages | 88 |
| P&ID PNG images | 8 |
| XLSX workbooks | 2 |
| PPTX presentations | 1 |
| Valid equipment sets | 8/8 |
| Duplicate checksum groups | 0 |
| Encrypted PDFs | 0 |
| PDF parser failures | 0 |

Every equipment set contains the expected twelve source assets: one datasheet, one GA drawing, one interlock logic diagram, seven One Point Lessons, one plot plan, and one P&ID image.

The generated source manifest is stored locally at:

```text
reports/ingestion/source-manifest.json
reports/ingestion/source-manifest.md
```

This directory is gitignored. The manifest checksum for this run is:

```text
b1c41cb8c5c39ff670c4a718de7b34b73ae4608f9ea2372c79dec2b6f7ba65d7
```

The largest source is the dataset-explanation PPTX at 9,094,819 bytes. It fits beneath the current locally declared 10,000,000-byte bucket limit. The bucket MIME allowlist still needs to be extended for XLSX and PPTX.

## Structured-source findings

| Source | Structure |
| --- | --- |
| `[1A] CTRL ROOM_DEVIATION TEST.xlsx` | 2 sheets; 100 and 272 physical XML rows |
| `Maintenance History (All Equipment).xlsx` | 2 sheets; 212 and 26 physical XML rows |
| `Data Set Explanation for Case 1 Manufacturing Knowledge Hub.pptx` | 10 slides |

Physical XML row counts include headings, blank/formatted rows, and explanatory content. The production parser must determine semantic data rows without assuming these counts are record counts.

## Application baseline

The current local application baseline passes:

- ESLint.
- 18/18 domain tests.
- Next.js production build and TypeScript validation.

Existing useful foundations include:

- Additive Supabase migrations for the current connected model.
- Equipment, document/version, maintenance, quality, processing, extraction, chunks, and parameter tables.
- Role-aware RLS foundations.
- A private-bucket declaration in the local foundation migration.
- A 38-record Control Room parameter fixture/importer.
- Server-side Gemini grounded answers.

Confirmed implementation gaps:

- The existing case-material importer only imports Set 01 and depends on temporary pre-extracted files.
- It writes a local demo catalog instead of production Supabase document/page records.
- The existing Gemini module is a grounded-answer function, not a durable OCR worker.
- Document retrieval currently uses in-memory keyword scoring and assigns page 1 to whole-document text.
- The existing storage/upload contract allows only PDF and PNG.
- The application environment is still configured for demo mode.

## Local environment findings

No credential values were printed or copied into this report.

| Setting | Current state | Required production state |
| --- | --- | --- |
| `HUB_MODE` | `demo` | `connected` after provisioning |
| `NEXT_PUBLIC_SITE_URL` | localhost | approved HTTPS production origin |
| `COOKIE_SECURE` | `false` | `true` in production |
| `NEXT_PUBLIC_SUPABASE_URL` | Set, but incorrectly includes `/rest/v1/` | project origin only |
| Supabase publishable key | Present | rotate/confirm for target environment |
| Supabase service-role key | Present | server-only; confirm target and rotate if needed |
| `GEMINI_ENABLED` | `false` | `true` only after external-processing approval |
| Gemini API key | Present | server-only; organizational approval required |
| Generation model | `gemini-2.5-flash`, available | pin after approval |
| Embedding model | `gemini-embedding-2`, available | pin with 768 dimensions after approval |

The Supabase URL must be corrected from a REST endpoint URL to the project origin. The application SDK appends `/rest/v1` itself.

## Remote read-only findings

Configured Supabase project reference:

```text
iysrsmjetmtsqkyvqidh
```

After using the normalized origin:

- Supabase Auth health returned HTTP 200.
- Supabase REST/OpenAPI returned HTTP 200.
- `hub-sources` returned `Bucket not found`.
- `equipment`, `document_version`, `document_chunk`, `equipment_parameter`, `processing_job`, and `extraction_run` were absent from the public schema cache.

This indicates that the project exists and the configured privileged key can reach it, but the local Knowledge Hub migrations have not been applied there. It cannot yet be treated as the production system of record.

Gemini model discovery returned HTTP 200. Both configured model identifiers were available. No source content was sent to Gemini.

## Proposed production architecture

```text
Data/ source assets
  -> read-only inventory + SHA-256 manifest
  -> private Supabase Storage originals
  -> immutable document + version + equipment relationships
  -> deterministic XLSX/PPTX parsing
  -> durable Gemini PDF/PNG page processing jobs
  -> immutable page transcription + structured candidates
  -> Controller review + Technical Reviewer approval
  -> eligible source-aware chunks
  -> Gemini embeddings + pgvector
  -> ACL/RLS-filtered retrieval
  -> grounded streamed answers with exact source locators
```

Supabase remains the durable source of truth. Any Gemini-hosted file is an ephemeral processing copy. OCR transcription and AI interpretation remain separate records. No candidate becomes governed knowledge automatically.

## Additive migration plan

Once approved, the next migration should:

1. Apply the existing local migrations to the confirmed empty target in chronological order.
2. Add `ingestion_batch` and `ingestion_item` with checksum/idempotency constraints.
3. Add page/slide/cell provenance using `document_page` or an equivalent normalized artifact table.
4. Extend `processing_job` with lease/retry/needs-attention semantics.
5. Extend `extraction_run` with provider, model, prompt/schema versions, input checksum, timestamps, and immutable raw output.
6. Add reviewable `extraction_candidate` records.
7. Extend `document_chunk` with text checksum, locator range, metadata filters, eligibility, and a fixed vector dimension/index strategy.
8. Extend document MIME/storage constraints for XLSX and PPTX.
9. Add upload, worker-claim, review, publication, and authorized vector-search RPCs.
10. Add explicit RLS policies and negative tests for every new table/RPC.

No existing local migration should be rewritten. No destructive reset is permitted.

## Planned ingestion sequence

1. Correct and validate environment configuration.
2. Capture an empty-target schema/state snapshot before migration.
3. Apply additive migrations and RLS tests.
4. Provision and verify the private bucket.
5. Run the same manifest in dry-run mode against the remote target.
6. Create an approved ingestion batch.
7. Upload immutable originals with checksum idempotency.
8. Parse XLSX and PPTX deterministically.
9. Process PDF/PNG sources with Gemini only after external-processing approval.
10. Store page-level transcription and structured candidates.
11. Review/publish eligible knowledge.
12. Chunk, embed, and index approved/current content.
13. Replace production in-memory retrieval with RLS-filtered database retrieval.
14. Verify connected mode in staging before production cutover.

## Recorded owner decisions

- Target project: `iysrsmjetmtsqkyvqidh`.
- Intended environment: production.
- Additive migrations: approved.
- Gemini processing of the current dummy source set: approved.
- Storage policy delegated: private originals retained; ephemeral Gemini copies deleted after persisted extraction; ten-minute signed-link target.
- Production origin: `https://caliber-knowledge-hub.vercel.app`.

## Remaining blocking inputs

1. Supply either a scoped Supabase personal access token with database migration permission or the database password through a local, uncommitted environment variable. The service-role key cannot execute DDL.
2. Create or identify the four real Supabase Auth accounts and provide their email-to-role mapping. The remote project currently has zero Auth users.
3. Confirm a recoverable pre-migration project snapshot. The application schema is currently absent, but migration history should still begin from a recorded state.

Until these inputs are recorded, no migrations, uploads, OCR submissions, or production deployment should be performed.
