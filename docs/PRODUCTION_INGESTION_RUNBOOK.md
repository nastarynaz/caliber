# Production ingestion runbook

This runbook operates on the approved Chandra Asri Knowledge Hub production target. Do not paste credentials into commands, Git, screenshots, or chat. Store them only in the local ignored `.env` or an approved secret manager.

## Retention and access policy

- Original source files: retained indefinitely in the private `hub-sources` bucket unless a governed retention decision supersedes this policy.
- Gemini processing copies: delete immediately after extraction persistence; provider expiry is only a fallback.
- Signed source URLs: target lifetime 600 seconds.
- Browser access: authenticated proxy/download with `private, no-store` remains preferred when a signed URL is unnecessary.
- Extracted text and raw model output: immutable and retained with document-version provenance.
- Candidate knowledge: not RAG-eligible before authorized review/publication.

## Required secrets

Application runtime:

```text
APP_ENV=production
HUB_MODE=connected
NEXT_PUBLIC_SITE_URL=https://caliber-knowledge-hub.vercel.app/
COOKIE_SECURE=true
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

Local development defaults to `APP_ENV=development`, `HUB_MODE=demo`,
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`, and `COOKIE_SECURE=false`, so the
four persona flow runs without depending on remote migrations. To test the real
Supabase path locally, temporarily use `HUB_MODE=connected`; keep
`APP_ENV=development` so localhost and non-secure development cookies remain
valid. Vercel production must use `APP_ENV=production`, `HUB_MODE=connected`,
the approved HTTPS origin, and `COOKIE_SECURE=true`.

Migration operator, choose one official route:

```text
SUPABASE_ACCESS_TOKEN  # scoped PAT with database migration permission
```

or:

```text
SUPABASE_DB_PASSWORD   # supplied to Supabase CLI without committing it
```

The service-role key is not a database password and cannot apply DDL.

## 1. Re-run source preflight

```bash
pnpm preflight:data
pnpm ingest:data --dry-run
```

Expected approved manifest checksum:

```text
b1c41cb8c5c39ff670c4a718de7b34b73ae4608f9ea2372c79dec2b6f7ba65d7
```

Stop if file count, checksum, duplicate state, encryption state, or equipment-set completeness changes.

## 2. Capture pre-migration state

Record:

- Target project reference.
- Current migration history.
- Existing schema dump or confirmed empty application schema.
- Existing Auth user count.
- Existing buckets and public/private state.
- Timestamp and operator.

Do not use `db reset` against the hosted project.

## 3. Validate and apply migrations

Preferred CLI sequence:

```bash
pnpm exec supabase link --project-ref iysrsmjetmtsqkyvqidh
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

Expected migrations, in order:

1. `202609240001_foundation.sql`
2. `202609270001_connected_operations.sql`
3. `202609290001_control_room.sql`
4. `202609300001_production_ingestion.sql`

After migration, run the RLS test only against local or an explicitly authorized test database:

```bash
psql "$AUTHORIZED_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

Never run synthetic RLS fixtures against production.

## 4. Provision production accounts

Create or identify four real Supabase Auth accounts, then map them deliberately:

| UI persona | Role |
| --- | --- |
| Field Operator | `engineer` |
| Field Observer | `reader` |
| Control Room Admin | `controller` |
| Technical Reviewer | `reviewer` |

Use `supabase/provision-user.example.sql` as a reviewed template. Grant equipment scope deliberately. Do not infer an email address from a persona label.

## 5. Verify empty connected foundation

Verify:

- `/api/health` reports database and private storage ready.
- `hub-sources` is private.
- Allowed MIME types include PDF, PNG, XLSX, and PPTX.
- File size limit is 10,000,000 bytes.
- All new tables have RLS enabled.
- Anonymous users cannot execute snapshot, vector search, or worker activation RPCs.
- Authenticated users cannot write immutable evidence tables directly.

## 6. Import originals

Start the approved batch:

```bash
pnpm ingest:data --apply --environment production
```

Record the returned batch UUID. If interrupted:

```bash
pnpm ingest:data --resume --batch <batch-uuid>
```

Verify stored bytes:

```bash
pnpm ingest:data --verify --batch <batch-uuid>
```

Expected outcome before OCR:

- 99 ingestion items.
- 99 immutable document versions.
- 99 private storage objects.
- 88 PDF OCR jobs.
- 8 PNG OCR jobs.
- Two XLSX sources parsed deterministically.
- One PPTX source parsed deterministically.
- No approved/published records created automatically.

## 7. Process Gemini OCR

Run controlled batches:

```bash
pnpm ingest:ocr --limit 5
```

Repeat while queued jobs remain. Each worker run must:

- Claim one queued job at a time.
- Download the authorized private original.
- Upload a temporary provider copy.
- Produce schema-constrained page transcription and candidates.
- Persist raw output, page text, model, prompt/schema versions, and usage metadata.
- Delete the provider copy in `finally`.
- Retry transient failures at most three times.
- End repeated failures in `needs_attention`.

Do not run more concurrency until provider rate limits and extraction quality are observed.

## 8. Review and publish

Controllers verify metadata and extraction candidates. Technical Reviewers approve technical applicability where required. Publication must never rewrite the original bytes, raw OCR, or original extraction response.

Only an approved document version may become published. Only approved and published content may be indexed.

## 9. Create embeddings

For documents whose indexing state is queued:

```bash
pnpm ingest:index --limit 5
```

The indexer creates 768-dimensional `gemini-embedding-2` vectors, records chunk checksums and exact locators, and activates a version atomically through the service-role-only worker RPC.

## 10. Production verification

Verify:

```bash
pnpm lint
pnpm test
pnpm build
```

Then verify in the deployed application:

- Connected login works for every role.
- If judge access is enabled, the four persona actions create normal Supabase
  sessions and remain subject to RLS; local/demo data is never loaded.
- Documents download only when authorized.
- Knowledge Base shows persisted extracted text and parameters.
- Search respects equipment and document ACLs.
- Gemini answers use database vector retrieval and exact citations.
- Missing evidence produces a refusal/limitation.
- No imported value is labeled live.
- `/api/health` returns ready without credential details.

## Failure recovery

- Upload interrupted: run `--resume` with the same batch UUID.
- Storage object exists but registration failed: keep the ingestion item failed, reconcile checksum/path, then resume.
- OCR transient failure: allow bounded retry; never duplicate extraction/page records.
- OCR terminal failure: inspect `needs_attention`, retain the immutable source, and do not fabricate text.
- Index failure: keep the prior current revision active and retry only after resolving the recorded error.
- Checksum mismatch: block the item and investigate; never overwrite the stored original.
- Migration failure: stop. Do not run `db reset`; inspect transaction rollback and migration history before retrying.
## Judge persona access

The four presentation personas can remain available in connected mode without
restoring local/demo data. They are ordinary Supabase Auth users and therefore
receive the same RLS enforcement as every other account.

1. Set `JUDGE_DEMO_ENABLED=true` and all eight `JUDGE_*_EMAIL` / `JUDGE_*_PASSWORD`
   server-only variables. Use a distinct email and a strong password for each role.
2. Preview the account plan with `pnpm accounts:judges --dry-run`.
3. After migrations and the source import are complete, run
   `pnpm accounts:judges --apply`.
4. Re-run the apply command after adding new document records so their ACL rows
   are granted to the judge accounts.
5. Rotate or disable these four accounts after judging. Turning
   `JUDGE_DEMO_ENABLED=false` removes the one-click login surface but does not
   delete audit history.

The browser never receives the judge passwords. Selecting a persona asks the
server to create a normal Supabase session for the corresponding account. The
server verifies that the resulting `app_user.role` matches the selected persona.
