# Production Data Ingestion, Gemini OCR, and Supabase Cutover Master Prompt

You are a senior product engineer, data migration engineer, Supabase/Postgres architect, document-AI engineer, security engineer, and industrial knowledge-governance specialist.

Implement a production-grade ingestion and retrieval pipeline inside the existing Next.js **Chandra Asri Knowledge Hub** project.

This is no longer a demo-data exercise. Treat the repository's `Data/` directory as the migration source, Supabase as the durable system of record, and Gemini as a server-side document-understanding and OCR provider. Do not rebuild the application from scratch. Inspect and extend the current architecture, migrations, roles, document workflows, equipment model, parameter registry, Gemini integration, and RAG implementation.

Do not begin remote mutations until the production-readiness gates in this prompt have passed. If a blocking condition occurs, stop and ask the project owner for a decision. Never hide, bypass, or fill a blocker with fabricated data.

## Primary objective

Migrate every valid source asset under `Data/` into private Supabase storage and normalized database records, extract its usable content with deterministic parsers and Gemini document understanding/OCR, preserve precise provenance, generate reviewable structured knowledge, index only eligible content for RAG, and switch the deployed application from demo fallback behavior to connected production behavior.

The completed system must provide:

1. A complete and auditable inventory of every source file.
2. Immutable original files in private Supabase Storage.
3. Idempotent imports based on cryptographic checksums.
4. Page- or slide-level text with reliable source locators.
5. Gemini OCR/document understanding for PDFs and technical images.
6. Deterministic parsing for Excel and PowerPoint sources.
7. Structured extraction candidates that require human review.
8. Reviewed, access-controlled document chunks and embeddings for RAG.
9. Evidence-grounded Gemini answers with exact citations.
10. A production cutover with no silent demo or local-data fallback.

## Verified local source inventory

Before implementation, independently re-run and persist an inventory scan. The current repository inspection found **99 non-hidden source files** under `Data/`:

| Source class | Count | Notes |
| --- | ---: | --- |
| PDF | 88 | Datasheets, GA drawings, interlock logic diagrams, plot plans, and One Point Lessons |
| PNG | 8 | One P&ID image per equipment set |
| XLSX | 2 | Maintenance history and Control Room/What If workbook |
| PPTX | 1 | Case 1 dataset explanation deck |
| **Total** | **99** | Reconcile this count before any upload |

The equipment-set structure currently contains eight sets. Each set has eleven PDFs and one P&ID PNG:

1. `Set_01_GA-1201A_HEXANE_FEED_PUMP`
2. `Set_02_YD-2301_POLYMER_FLUID_BED_DRYER`
3. `Set_03_DC-3401A_CATALYST_REDUCTION_REACTOR`
4. `Set_04_KC-4501_RECYCLE_GAS_COMPRESSOR`
5. `Set_05_EA-5601_SOLVENT_HEATER`
6. `Set_06_LV-6701_SEPARATOR_LEVEL_CONTROL_VALVE`
7. `Set_07_CT-7801_COOLING_TOWER_CELL_FAN`
8. `Set_08_FA-8901_REFLUX_ACCUMULATOR_DRUM`

Each set is expected to contain:

- One equipment datasheet PDF.
- One equipment GA drawing PDF.
- One interlock logic diagram PDF.
- Seven One Point Lesson PDFs.
- One plot plan PDF.
- One P&ID PNG.

Top-level controlled sources include:

- `Data/Data Set Explanation for Case 1 Manufacturing Knowledge Hub.pptx`
- `Data/Maintenance History (All Equipment).xlsx`
- `Data/[1A] CTRL ROOM_DEVIATION TEST.xlsx`

The Control Room workbook contains the logical sheets:

- `(1) control room`
- `(2) what if`

Do not trust the expected inventory blindly. The generated manifest is authoritative for the migration run. Report missing, extra, unreadable, encrypted, corrupt, or duplicate files explicitly.

## Existing implementation to preserve and extend

Inspect the current repository before editing. The project already contains useful foundations that must be extended rather than replaced blindly:

- A private `hub-sources` storage bucket.
- Equipment, users, roles, document, version, equipment-document, maintenance, audit, quality, processing, extraction, chunk, parameter, reading, and locator structures.
- Row Level Security and authenticated access policies.
- A Set 01-oriented importer.
- A Control Room parameter importer.
- A Gemini grounded-answer implementation.
- Demo and connected hub modes.

Known gaps that must be resolved:

- The current case-material importer covers only Set 01 and relies on pre-extracted temporary artifacts.
- The current Gemini integration answers questions but is not a durable OCR/ingestion worker.
- Current retrieval is primarily in-memory/keyword-oriented and does not constitute production pgvector retrieval with exact page provenance.
- Some document representations assume PDF/PNG only.
- The current storage object size limit may be insufficient for one or more actual files; measure before changing it.
- Production can still fall back to demo/local state in some failure paths.

Preserve working behavior and user data. Use additive, reversible migrations. Do not drop production tables, truncate user data, reset the linked Supabase project, or rewrite migration history.

## Non-negotiable trust rules

- The original bytes are immutable after upload.
- Supabase Storage is the durable source of truth; Gemini Files API is only an ephemeral processing copy.
- Preserve the original relative path, filename, MIME type, byte size, checksum, import batch, and import timestamp.
- Never silently replace one revision with another.
- Never silently merge conflicting sources.
- Never convert null, unavailable, unreadable, or blocked values into zero.
- Never treat OCR confidence as engineering approval.
- Never treat AI-extracted thresholds, setpoints, voting logic, SIL data, procedures, or safeguards as approved until reviewed by an authorized person.
- Never treat a historical work order as proof of the current root cause.
- Never claim that imported workbook values are live DCS, historian, laboratory, or condition-monitoring signals.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to the browser.
- Never place proprietary source files in a public bucket.
- Never index content that is blocked, unauthorized, superseded, or otherwise ineligible for retrieval.
- Never fabricate missing pages, citations, document metadata, equipment mappings, or extracted text.

Keep the existing safety statement visible in relevant AI and knowledge surfaces:

> This interface is an engineering knowledge and training workspace. It is not a live DCS/SIS display and does not replace approved plant procedures, C&E, SRS, permits, isolation, or field verification.

## Mandatory approval gates before remote mutation

Complete a read-only preflight and show the result to the project owner before uploading or migrating anything remotely.

Require explicit confirmation of:

1. The exact target Supabase project URL and project reference.
2. Whether the target is development, staging, or production.
3. A current database schema dump or recoverable backup.
4. The private storage bucket and retention policy.
5. That sending these proprietary documents to the configured Gemini API/project is approved by the organization, including applicable privacy, retention, region, and data-governance requirements.
6. The authorized source/review/publication rules for each document class.
7. The accounts or roles allowed to review and publish extracted knowledge.

If any of these are unknown, stop and ask. Do not infer approval from the presence of an API key.

The preflight must also verify, without printing secrets:

- Required environment variables are present.
- The Supabase project is reachable.
- The current authenticated user has the intended migration authority.
- Migrations applied remotely match the local migration history.
- The `vector` extension and intended embedding dimension are compatible.
- The storage bucket is private.
- Existing RLS policies remain enabled.
- Required Gemini model names are available to the configured project.
- No source file exceeds the selected Gemini or storage limits.

## Environment and deployment configuration

Use server-only variables for privileged credentials. Update `.env.example` with descriptive placeholders, never real secrets.

The production target should include equivalents of:

```dotenv
APP_ENV=production
HUB_MODE=connected
NEXT_PUBLIC_SITE_URL=https://<approved-production-domain>
COOKIE_SECURE=true

NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>

GEMINI_ENABLED=true
GEMINI_API_KEY=<server-only-gemini-key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768
```

Confirm model availability rather than changing model identifiers casually. Pin the effective OCR/extraction prompt version, JSON schema version, embedding model, and embedding dimensions in database metadata so results can be reproduced.

Production behavior must fail closed:

- If connected mode cannot reach Supabase, show an explicit service error.
- Do not substitute demo equipment, documents, parameters, or AI evidence.
- Do not silently use local JSON/catalog data.
- Do not label simulated data as connected or live.
- Health/readiness endpoints must distinguish application availability, database access, storage access, and Gemini worker readiness without leaking credentials.

## Source manifest and dry run

Build an idempotent import CLI with at least these modes:

```bash
pnpm ingest:data --dry-run
pnpm ingest:data --apply --batch <approved-batch-id>
pnpm ingest:data --resume --batch <batch-id>
pnpm ingest:data --verify --batch <batch-id>
```

The exact command name may follow existing project conventions, but the capabilities are mandatory.

The dry run must not mutate Supabase. It must generate a machine-readable manifest and a human-readable report containing:

- Stable manifest item ID.
- Relative source path.
- Filename and extension.
- Detected MIME type from file contents, not extension alone.
- File size.
- SHA-256 checksum.
- Equipment set and equipment tag inferred from folder structure.
- Proposed document type.
- Proposed document number and revision, when present in the source.
- Proposed parser/processor.
- Page, slide, sheet, and row counts where deterministically available.
- Duplicate/checksum match status.
- Existing Supabase document/version match.
- Proposed storage path.
- Eligibility warnings.
- Blocking errors.

Write migration artifacts to a non-public, gitignored reports directory. Do not commit proprietary extracted text or source copies to Git.

Use a deterministic storage path, for example:

```text
hub-sources/<equipment-permanent-id>/<document-permanent-id>/<version-id>/<sanitized-original-filename>
```

For cross-equipment sources, use a controlled `shared` namespace. Do not rely on mutable display names as permanent identifiers.

## Idempotency, batches, and auditability

Add or extend normalized structures for ingestion without replacing existing production tables. At minimum, support:

- `ingestion_batch`
- `ingestion_item`
- `document`
- `document_version`
- `document_page` or an equivalent page/slide-level artifact table
- `processing_job`
- `extraction_run`
- `extraction_candidate`
- `document_chunk`
- `equipment_document`
- `parameter_source`
- `audit_event`

Recommended semantics:

### `ingestion_batch`

- Permanent UUID.
- Manifest checksum.
- Source root label.
- Environment/project reference.
- Created by and timestamps.
- Status: `draft`, `approved`, `running`, `partially_failed`, `completed`, `cancelled`.
- File counts and byte counts.
- Never store secrets.

### `ingestion_item`

- Batch and manifest item.
- Source relative path.
- SHA-256 checksum and byte size.
- Proposed and resolved equipment/document relationships.
- Storage object path.
- Import status and retry count.
- Structured error code and sanitized error message.
- Existing-version/deduplication decision.

### `document_version`

- Immutable original storage object reference.
- Original checksum, MIME type, filename, and size.
- Revision/effective metadata.
- Applicability, confidentiality, review, and publication states.
- Source import batch.
- Never overwrite original extraction or original file.

### `document_page`

- Document-version foreign key.
- Locator type: PDF page, image, PowerPoint slide, workbook sheet/range.
- One-based human-facing page/slide number where applicable.
- Raw extracted text.
- Normalized display text stored separately if needed.
- OCR state and extraction confidence.
- Optional bounding-box/region JSON.
- Rendered derivative path and checksum when page rendering is used.
- Model/parser/prompt/schema version.

### `extraction_run`

- Provider and model.
- Prompt version and response schema version.
- Started/completed timestamps.
- Status, retry count, and sanitized error.
- Input file/page checksum.
- Raw immutable structured response or a reference to its protected location.
- Token/usage metadata when available.

### `extraction_candidate`

- Candidate kind: equipment identity, instrument tag, parameter, limit, procedure, failure mode, safeguard, inspection step, topology relation, or maintenance fact.
- Exact source document version and locator.
- Source excerpt.
- Extracted value and unit without silent conversion.
- Extraction confidence.
- Review status: `pending`, `accepted`, `rejected`, `needs_clarification`.
- Reviewer, decision timestamp, and review note.
- Link to the published governed record when accepted.

### `document_chunk`

- Exact document version and page/slide range.
- Text checksum.
- Chunking strategy/version.
- Token or character count.
- Embedding model/dimensions.
- Metadata filters for equipment, source class, review/publication state, confidentiality, and active revision.
- Active/RAG-eligible flag.

Use foreign keys, constraints, stable IDs, optimistic concurrency where governed records are edited, and immutable audit events. New RLS policies must be tested for every role.

## File-type processing strategy

Choose the processor by content type. Gemini is not a replacement for reliable deterministic extraction where structured source data exists.

### PDF

Use Gemini's native document understanding for page-aware extraction of text, tables, diagrams, and visible labels. Inspect whether a usable embedded text layer exists, but do not assume that a text-bearing PDF is visually complete. Technical drawings, scanned tables, stamps, annotations, and diagram labels still require page-image understanding.

For every PDF:

1. Validate the file and determine page count.
2. Preserve the original in private Supabase Storage.
3. Create page-level processing records.
4. Submit the PDF or controlled page batches to Gemini from a server-side worker.
5. Store faithful per-page transcription separately from structured candidates.
6. Preserve page numbers and source boundaries.
7. Record unreadable/low-confidence regions instead of guessing.
8. Generate chunks only after the full extraction record is stored.

### PNG P&ID images

Process each P&ID PNG with Gemini multimodal understanding, but treat results as candidates:

- Transcribe visible title-block metadata and tags.
- Extract visible equipment/instrument tags and line labels.
- Propose relationships only when visibly supported.
- Preserve image dimensions and, where practical, bounding boxes.
- Do not infer hidden connections, process conditions, or approved logic.
- Do not replace the existing approved code-native topology automatically.
- Require engineering review before a proposed topology relation becomes governed knowledge.

### XLSX

Parse workbooks deterministically with a spreadsheet library. Do not OCR cell data that can be read structurally.

Preserve:

- Workbook filename/checksum.
- Sheet names.
- Cell/range locators.
- Raw values.
- Formula text.
- Cached/displayed values when available.
- Number formats and units.
- Merged-cell context.
- Row provenance.
- Blank versus zero distinction.

Use the Control Room workbook to reconcile the existing initial parameter import. The current implementation expects 38 parameter records; verify this against the workbook and report any discrepancy rather than forcing the count.

Use the maintenance-history workbook to populate or reconcile maintenance records using immutable raw row snapshots and source-cell locators. Discover the actual row count during import; do not hardcode it.

Gemini may help classify or explain ambiguous spreadsheet text only after deterministic parsing. It must not replace formulas, change units, correct values silently, or publish engineering conclusions.

### PPTX

Parse PowerPoint deterministically from slide XML and embedded assets:

- Preserve slide number and order.
- Extract text runs, table contents, notes if present, and image references.
- Retain layout/source locators.
- Use Gemini vision only for diagrams or rasterized content whose meaning is not captured by slide XML.
- Do not flatten the entire deck into a contextless text blob.

## Gemini OCR and document-understanding pipeline

All Gemini calls must run server-side in a durable job or worker path. Do not call Gemini directly from React components or expose credentials in client bundles.

Use Gemini Files API or the current recommended server-side file mechanism for larger or repeatedly processed documents. Treat Gemini-hosted copies as temporary processing inputs, not durable storage. Persist every accepted output and its provenance to Supabase.

The OCR pipeline must be resumable and idempotent:

1. Claim an eligible processing job with a lease.
2. Confirm the input checksum and document version.
3. Upload or reference the processing copy.
4. Wait for provider processing state with bounded polling.
5. Request page-aware faithful transcription.
6. Request schema-constrained structured extraction separately.
7. Validate all model output server-side with a versioned schema.
8. Reject malformed output; do not coerce unsafe values silently.
9. Persist raw response, normalized result, model, prompt version, source locator, and timestamps.
10. Generate chunks and embeddings only for eligible text.
11. Mark the job completed atomically.
12. Delete the temporary provider file when supported, or record its documented expiry behavior.

Use bounded retries with exponential backoff and jitter for transient failures. Recommended maximum: three automated attempts, followed by explicit `needs_attention`. Never create duplicate pages, candidates, chunks, or embeddings during retry.

Separate prompts and schemas for:

- Faithful transcription.
- Technical table extraction.
- Equipment and instrument tag candidates.
- Parameter and threshold candidates.
- Procedure/OPL step candidates.
- Failure-mode and safeguard candidates.
- Drawing-label and topology-relation candidates.

Do not ask one giant prompt to OCR, interpret, approve, and summarize a whole source in a single untraceable step.

### Transcription requirements

The transcription output must:

- Preserve source wording.
- Preserve meaningful headings, paragraphs, list numbering, tables, tags, symbols, and units.
- Include explicit page/slide/source locators.
- Mark illegible content as unreadable rather than hallucinating it.
- Avoid adding summaries or recommendations to the transcription.
- Avoid correcting apparent technical errors silently.
- Preserve handwritten/stamped annotations when legible and mark their nature.
- Distinguish visually present text from model interpretation.

### Structured-output requirements

Use versioned structured output schemas and validate them server-side. Each extracted fact must contain:

- `candidate_type`
- `raw_text`
- `normalized_value`, only when safely parsed
- `unit`, nullable
- `equipment_tag`, nullable
- `instrument_tag`, nullable
- `document_version_id`
- `locator_type`
- `page_or_slide`
- `source_excerpt`
- `confidence`
- `ambiguity_note`, nullable
- `requires_engineering_review`

Confidence means extraction confidence only. It is not an approval score, correctness guarantee, safety classification, or authorization decision.

## Review and publication workflow

No Gemini extraction becomes governed knowledge automatically.

Required lifecycle:

```text
Inventory
→ Upload immutable original
→ Deterministic metadata extraction
→ Page/slide processing
→ Gemini transcription/OCR where applicable
→ Structured candidate extraction
→ Validation
→ Controller review
→ Technical Reviewer approval where required
→ Publication
→ Chunking and embedding
→ RAG eligibility
→ Superseded by a reviewed revision when updated
```

Controllers may correct proposed metadata and accept/reject candidates within their authority. Technical approval boundaries must follow the existing role model and separation of duties. Operators and readers must not publish governed thresholds, SIL classifications, interlock logic, or approved procedures.

Corrections must create reviewed revisions or review decisions. Do not rewrite the original transcription or raw model output.

## Embeddings and RAG indexing

Use Supabase/Postgres with pgvector or the project's supported vector mechanism. Keep the embedding model and dimensions consistent with the schema.

Chunking must be source-aware:

- Preserve page boundaries and headings.
- Keep tables and procedure steps coherent.
- Do not combine unrelated equipment or source revisions in one chunk.
- Attach exact source version and page/slide range.
- Preserve equipment, document type, source class, publication status, confidentiality, and active-revision filters.
- Store a chunk checksum to prevent duplicates.

For long documents, embed extracted text chunks rather than treating an entire document as one embedding input. Do not use a whole-PDF multimodal embedding call in a way that loses page-level citation fidelity or exceeds provider limits.

Only index content that passes the configured RAG eligibility policy. Candidate, blocked, superseded, or unauthorized content must be excluded or clearly isolated from standard retrieval.

Replace production in-memory evidence retrieval with database-backed retrieval:

1. Authenticate the caller.
2. Resolve role and equipment/document access.
3. Apply SQL/RLS metadata filters before ranking.
4. Create a query embedding server-side.
5. Perform vector similarity retrieval with appropriate lexical support if available.
6. Return exact authorized chunks and provenance.
7. Re-rank only within the authorized result set.
8. Generate the answer from retrieved evidence.
9. Stream the response to the client when supported.
10. Persist an auditable interaction record without leaking restricted document text.

Every AI answer must cite:

- Document title.
- Document number when present.
- Revision.
- Page or slide.
- Equipment tag.
- Source/review/publication classification.

If evidence is missing, conflicting, blocked, or insufficient, the answer must say so. It must not invent a value or operational conclusion.

## Supabase Storage

Use a private bucket. Rely on RLS and short-lived signed access for authorized source viewing.

Before changing bucket settings:

- Measure the largest actual source file.
- Compare actual MIME types with the allowlist.
- Increase the object-size limit only to the smallest justified ceiling.
- Extend the MIME allowlist to the actual required types, including XLSX and PPTX if originals are stored in the same bucket.
- Confirm that no public-read policy exists.

Recommended MIME coverage, subject to the verified inventory:

- `application/pdf`
- `image/png`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`

Uploading an original and creating its database version record must be coordinated safely. If one side fails, leave a recoverable, auditable state and provide reconciliation tooling. Do not orphan storage objects silently.

## Security and RLS

Test permissions for at least:

- Field Operator (`engineer`)
- Field Observer (`reader`)
- Control Room Admin (`controller`)
- Technical Reviewer (`reviewer`)
- Unauthenticated user

Verify:

- Originals remain private.
- Signed URLs expire.
- Users only retrieve chunks/documents allowed by their access scope.
- Operators cannot change governed parameters or publish document knowledge.
- Readers cannot submit or mutate field/governed data beyond existing permission rules.
- Controllers can manage allowed metadata/candidates but cannot bypass required review.
- Reviewers can make authorized review decisions without rewriting immutable evidence.
- Service-role operations exist only in server scripts/workers.
- Audit rows cannot be modified by ordinary application roles.
- Search and vector RPCs cannot bypass RLS through `security definer` mistakes.

Add automated negative tests, not only successful-path tests.

## Production UI requirements

Use the existing application architecture and visual system. This prompt is primarily about data ingestion and production connectivity; do not redesign unrelated pages.

Update affected surfaces so users can see truthful processing state:

- Document inventory/import status.
- Original upload status.
- Parsing/OCR progress by document and page.
- Extraction candidate count.
- Review/publication status.
- Index/RAG eligibility.
- Structured failure reason and retry action for authorized users.
- Source provenance and immutable-original link.

Do not show fake progress. Do not mark a document searchable until eligible chunks and embeddings exist. Do not label a Gemini transcription as approved merely because processing succeeded.

Use clear states such as:

- `inventoried`
- `uploading`
- `uploaded`
- `parsing`
- `ocr_processing`
- `extracted`
- `needs_attention`
- `awaiting_review`
- `approved`
- `indexed`
- `blocked`
- `failed`

Keep processing state separate from review/publication state.

## Demo-to-production cutover

Remove demo behavior from the production path without deleting useful fixtures needed for automated tests or local design development.

The judging build may retain four one-click persona choices (Field Operator,
Field Observer, Control Room Admin, and Technical Reviewer), but these must be
real Supabase Auth accounts backed by the connected dataset. Their credentials
must remain server-only, their stored `app_user` role must match the selected
persona, and all access must pass normal RLS. This convenience surface must
never reactivate the local catalog, ephemeral demo sessions, or a client-side
role switch. It must be independently disableable after judging.

Requirements:

- Production deployment uses `HUB_MODE=connected`.
- Connected data comes only from the approved Supabase project.
- Login/session behavior uses the connected auth implementation.
- Document and Knowledge Base pages query persisted sources/chunks.
- Parameter and maintenance views query persisted records.
- Gemini AI retrieves authorized database evidence.
- No production route silently imports demo state when a database/API call fails.
- Demo fixtures remain explicitly scoped to test or local demo mode and cannot be selected accidentally in production.
- UI labels clearly distinguish historical/imported values from live data.

Add a startup/configuration guard that refuses a production build or deployment configuration when a dangerous combination is detected, such as production URL plus demo hub mode, missing server secret, or public source bucket.

Do not print secrets in build logs, migration reports, browser errors, or audit records.

## Blockers that require contacting the project owner

Stop and request direction when any of the following occurs:

- Target Supabase project reference is missing or ambiguous.
- A remote migration would drop, truncate, or irreversibly rewrite existing data.
- A recoverable backup/schema snapshot is unavailable.
- Organizational approval to send source documents to Gemini is not confirmed.
- A document is password-protected, encrypted, corrupt, unsupported, or above provider limits.
- Duplicate checksums map to conflicting document identities or revisions.
- Equipment mapping or document revision cannot be resolved reliably.
- A source contains a confidentiality/access classification not represented by current policies.
- RLS tests fail.
- Embedding dimensions conflict with existing indexed data.
- Required model access is unavailable.
- OCR repeatedly fails or yields materially unreadable technical content.
- A workbook formula/value discrepancy could change governed engineering meaning.
- Source counts no longer reconcile with the approved manifest.
- An external service outage prevents a verifiable migration.

Provide the owner with:

1. The affected item(s).
2. The exact non-secret error.
3. What has and has not been mutated.
4. The safest options.
5. Your recommended option and trade-off.

Do not continue past a safety, provenance, authorization, or destructive-migration blocker.

## Implementation stages

### Stage 0 — Inspect and preflight

1. Inspect repository structure, package scripts, migrations, API routes, server actions, workers, and deployment configuration.
2. Re-inventory `Data/` and produce the dry-run manifest.
3. Inspect current remote schema and storage settings read-only.
4. Identify migration gaps and data conflicts.
5. Present the preflight and obtain the mandatory approvals.

### Stage 1 — Additive schema and policy migrations

1. Add ingestion batches/items and page-level provenance where missing.
2. Extend extraction runs/candidates/chunks without destroying current records.
3. Extend MIME constraints and bucket settings only as justified.
4. Add indexes and vector/search RPCs.
5. Add or refine RLS policies.
6. Add migration and policy tests.

### Stage 2 — Production importer

1. Build dry-run, apply, resume, and verify modes.
2. Upload originals with checksum-based idempotency.
3. Create immutable document/version/equipment relationships.
4. Write audit events and reconciliation reports.
5. Prove a repeated run creates no duplicates.

### Stage 3 — Deterministic structured-source parsing

1. Parse both Excel workbooks with cell-level provenance.
2. Reconcile Control Room parameters without overwriting governed revisions.
3. Import maintenance history with raw-row provenance.
4. Parse PowerPoint slides and preserve slide locators.

### Stage 4 — Gemini OCR/document processing

1. Add durable processing jobs and bounded retries.
2. Process PDFs and P&ID PNGs.
3. Store per-page transcription and immutable raw structured output.
4. Validate schemas and surface unreadable regions.
5. Add reviewable extraction candidates.

### Stage 5 — Review, chunking, and embeddings

1. Implement candidate review and revision behavior.
2. Define and enforce RAG eligibility.
3. Chunk approved/eligible content with exact locators.
4. Generate embeddings and verify dimensions.
5. Add checksum-based re-indexing and supersession behavior.

### Stage 6 — Production RAG

1. Replace in-memory production retrieval with authorized database retrieval.
2. Add vector and metadata filters.
3. Stream grounded Gemini responses.
4. Render source citations linked to authorized document versions/pages.
5. Add refusal and insufficient-evidence tests.

### Stage 7 — Connected cutover

1. Set and validate connected production configuration.
2. Eliminate silent fallback paths.
3. Verify auth, RLS, storage access, search, knowledge pages, AI, and document viewing.
4. Deploy only after staging verification and owner approval.
5. Produce a signed-off migration/reconciliation report.

## Testing requirements

Run and pass:

- Lint.
- Type-check.
- Production build.
- Unit tests.
- Importer dry-run tests.
- Checksum/idempotency tests.
- Parser tests for PDF metadata, XLSX, PPTX, and PNG inventory.
- Structured-output schema validation tests.
- Retry/resume tests.
- RLS and signed-URL negative tests.
- Vector retrieval authorization tests.
- Citation-integrity tests.
- Browser tests for upload, processing state, review, search, AI citations, and failure states.
- Secret-scanning/client-bundle checks.

Use representative copies or fixtures in tests without committing proprietary full extracted content. Ensure production source files remain outside public web paths.

## Acceptance criteria

The work is complete only when all of the following are true:

1. A fresh inventory reconciles all 99 currently observed source files or documents every approved difference.
2. All eight equipment sets are mapped to permanent equipment records.
3. All 88 PDFs, 8 PNGs, 2 XLSX files, and 1 PPTX file are represented by immutable versioned source records, unless an explicitly approved exception is recorded.
4. Every stored original has a matching SHA-256 checksum, byte size, MIME type, and source path.
5. All originals are in private Supabase Storage.
6. No proprietary original is served from `public/` or committed as a new Git asset.
7. Re-running the importer produces no duplicate document versions, pages, candidates, chunks, or embeddings.
8. Every PDF page and P&ID image has a successful processing record or an explicit actionable failure; nothing is silently omitted.
9. XLSX values, formulas, blank cells, units, sheet names, and cell/range provenance are preserved.
10. PPTX text and tables retain slide-level provenance.
11. Gemini outputs are stored with model, prompt/schema version, checksum, and source locator.
12. Original transcription and raw extraction output are immutable.
13. Structured candidates require authorized human review before publication.
14. The expected 38 initial parameter records are reconciled against the Control Room workbook, with discrepancies reported rather than concealed.
15. Maintenance rows are imported/reconciled with workbook and cell provenance.
16. Approved RAG chunks have exact document-version and page/slide citations.
17. Blocked, superseded, unauthorized, or unreviewed content does not leak into standard retrieval.
18. Gemini answers stream from server-side routes and cite only retrieved authorized evidence.
19. Gemini states when evidence is insufficient and does not invent live process conditions or root causes.
20. Search finds documents and knowledge by equipment tag, instrument tag, document number, title, document type, parameter, and full text where authorized.
21. Field Operator, Field Observer, Control Room Admin, Technical Reviewer, and unauthenticated RLS tests pass.
22. The service-role key and Gemini API key are absent from client bundles and responses.
23. Production uses connected mode and cannot silently fall back to demo data.
24. No imported or scenario value is represented as live DCS/historian data.
25. Migration, reconciliation, unresolved-item, and rollback/recovery reports are produced.
26. Lint, type-check, build, unit, integration, RLS, and relevant browser tests pass.

## Final deliverables

Deliver:

1. Concise architecture and migration plan.
2. Read-only preflight report.
3. Machine-readable source manifest.
4. Additive Supabase migrations.
5. RLS and storage policies.
6. Production ingestion CLI with dry-run/apply/resume/verify modes.
7. Deterministic XLSX and PPTX parsers.
8. Durable Gemini OCR/extraction worker.
9. Candidate review and publication flow.
10. Chunking, embedding, and database retrieval pipeline.
11. Server-side streaming grounded-answer integration.
12. Connected-mode configuration and safety guards.
13. Automated tests.
14. Post-migration reconciliation report.
15. Runbook covering retries, failed items, reprocessing, new revisions, key rotation, and rollback/recovery.

Do not stop after generating schemas, scripts, or UI mockups. Complete and verify the end-to-end production path, but pause at every explicit approval gate before remote mutation, external processing of proprietary data, destructive change, or production deployment.
