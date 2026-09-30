import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();
const sourceRoot = path.resolve(projectRoot, "../Data");
const manifestPath = path.resolve(projectRoot, "reports/ingestion/source-manifest.json");
const equipment = [
  { id: "EQP-000001", tag: "GA-1201A", name: "Hexane Feed Pump", set_number: "01", area: "Feed preparation & purification" },
  { id: "EQP-000002", tag: "YD-2301", name: "Polymer Fluid Bed Dryer", set_number: "02", area: "Drying" },
  { id: "EQP-000003", tag: "DC-3401A", name: "Catalyst Reduction Reactor", set_number: "03", area: "Reaction" },
  { id: "EQP-000004", tag: "KC-4501", name: "Recycle Gas Compressor", set_number: "04", area: "Recycle gas" },
  { id: "EQP-000005", tag: "EA-5601", name: "Solvent Heater", set_number: "05", area: "Feed heating" },
  { id: "EQP-000006", tag: "LV-6701", name: "Separator Level Control Valve", set_number: "06", area: "Separation" },
  { id: "EQP-000007", tag: "CT-7801", name: "Cooling Tower Cell Fan", set_number: "07", area: "Utilities" },
  { id: "EQP-000008", tag: "FA-8901", name: "Reflux Accumulator Drum", set_number: "08", area: "Separation" },
].map(item => ({ ...item, location: "Training dataset · location not verified" }));

function loadDotEnv() {
  const text = execFileSync("/bin/sh", ["-c", "test -f .env && /bin/cat .env || true"], { cwd: projectRoot, encoding: "utf8" });
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const name = line.slice(0, index).trim();
    if (!(name in process.env)) process.env[name] = line.slice(index + 1).trim();
  }
}

function argumentsFrom(argv) {
  const result = { mode: "", batch: "", environment: "production" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--dry-run", "--apply", "--resume", "--verify"].includes(value)) result.mode = value.slice(2);
    else if (value === "--batch") result.batch = argv[++index] || "";
    else if (value === "--environment") result.environment = argv[++index] || "";
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!result.mode) throw new Error("Choose --dry-run, --apply, --resume, or --verify.");
  if (!["development", "staging", "production"].includes(result.environment)) throw new Error("Environment must be development, staging, or production.");
  if (["resume", "verify"].includes(result.mode) && !/^[a-f0-9-]{36}$/i.test(result.batch)) throw new Error(`--${result.mode} requires --batch <uuid>.`);
  return result;
}

function stableUuid(namespace, value) {
  const bytes = Buffer.from(createHash("sha256").update(`${namespace}\0${value}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sanitizeFilename(filename) {
  return filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}

function metadata(item) {
  const title = item.filename.replace(/\.[^.]+$/, "").replaceAll("_", " ");
  const opl = title.match(/(OPL-[A-Z0-9-]+-\d{2})/i)?.[1]?.toUpperCase();
  const number = opl || `${item.equipment_tag || "SHARED"}-${item.proposed_document_type}`;
  return { title, number, revision: null };
}

function requireData(value, error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
  return value;
}

function parserResult(sourcePath) {
  const pythonPath = process.env.INGESTION_PYTHONPATH || path.resolve(projectRoot, "../tmp/pdf_deps");
  const output = execFileSync("python3", [path.join(projectRoot, "scripts/structured-source-parser.py"), sourcePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: pythonPath },
    maxBuffer: 64_000_000,
  });
  return JSON.parse(output);
}

async function currentManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = [];
  for (const item of manifest.items) {
    const bytes = await readFile(path.join(sourceRoot, item.relative_path));
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== item.sha256 || bytes.length !== item.byte_size) errors.push(item.relative_path);
  }
  if (errors.length) throw new Error(`Manifest is stale for ${errors.length} source(s). Re-run pnpm preflight:data.`);
  return manifest;
}

async function connectedClient() {
  loadDotEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and server-only service-role key are required.");
  if (new URL(url).pathname !== "/") throw new Error("NEXT_PUBLIC_SUPABASE_URL must contain only the project origin.");
  return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), projectRef: new URL(url).hostname.split(".")[0] };
}

async function ensureSchema(db) {
  const { error } = await db.from("ingestion_batch").select("id").limit(1);
  if (error) throw new Error("Production ingestion schema is unavailable. Apply all Supabase migrations before importing.");
}

async function ensureBatch(db, manifest, options, projectRef) {
  if (options.batch) {
    const { data, error } = await db.from("ingestion_batch").select("*").eq("id", options.batch).single();
    return requireData(data, error, "Load ingestion batch");
  }
  const existing = await db.from("ingestion_batch").select("*").eq("manifest_checksum", manifest.manifest_checksum).maybeSingle();
  if (existing.error) throw new Error(`Find ingestion batch: ${existing.error.message}`);
  if (existing.data) return existing.data;
  const created = await db.from("ingestion_batch").insert({
    manifest_checksum: manifest.manifest_checksum,
    source_root_label: manifest.source_root_label,
    environment: options.environment,
    project_ref: projectRef,
    status: "approved",
    total_files: manifest.summary.total_files,
    total_bytes: manifest.summary.total_bytes,
    created_by_name: "Approved production ingestion",
  }).select("*").single();
  return requireData(created.data, created.error, "Create ingestion batch");
}

async function linkDocumentAcl(db, documentId, equipmentIds) {
  const access = await db.from("equipment_access").select("user_id,equipment_id").in("equipment_id", equipmentIds);
  if (access.error) throw new Error(`Load equipment access: ${access.error.message}`);
  const rows = [...new Set((access.data || []).map(item => item.user_id))].map(user_id => ({ user_id, document_id: documentId }));
  if (rows.length) {
    const result = await db.from("document_acl").upsert(rows, { onConflict: "user_id,document_id", ignoreDuplicates: true });
    if (result.error) throw new Error(`Link document ACL: ${result.error.message}`);
  }
}

async function persistStructuredSource(db, versionId, ingestionItemId, item, sourcePath) {
  const parsed = parserResult(sourcePath);
  const jobId = randomUUID();
  const jobKey = `extract:${versionId}:${item.sha256}:structured-source-v1`;
  const job = await db.from("processing_job").upsert({
    id: jobId, idempotency_key: jobKey, version_id: versionId, kind: "extract", status: "running", attempts: 1, started_at: new Date().toISOString(), lease_owner: "ingest-production-data",
  }, { onConflict: "idempotency_key" }).select("id").single();
  const effectiveJobId = requireData(job.data, job.error, "Create structured extraction job").id;
  const extractionId = randomUUID();
  const run = await db.from("extraction_run").upsert({
    id: extractionId, version_id: versionId, job_id: effectiveJobId, method: `deterministic_${parsed.kind}`,
    provider: "local_parser", model: null, prompt_version: null, schema_version: parsed.schema_version,
    input_checksum: item.sha256, status: "succeeded", started_at: new Date().toISOString(), completed_at: new Date().toISOString(), raw_output: parsed,
  }, { onConflict: "job_id" }).select("id").single();
  if (run.error) throw new Error(`Create extraction run: ${run.error.message}`);
  const pages = parsed.pages.map(page => ({
    id: stableUuid("page", `${versionId}:${page.locator_type}:${page.locator_label}`), version_id: versionId,
    locator_type: page.locator_type, locator_label: page.locator_label, page_number: page.page_number,
    raw_text: page.raw_text, normalized_text: page.raw_text.replace(/\n{3,}/g, "\n\n"), extraction_state: "succeeded",
    regions: page.regions, processor: `deterministic_${parsed.kind}`, provider: "local_parser", schema_version: parsed.schema_version,
  }));
  const pageResult = await db.from("document_page").upsert(pages, { onConflict: "version_id,locator_type,locator_label" });
  if (pageResult.error) throw new Error(`Persist structured pages: ${pageResult.error.message}`);
  const extractedText = pages.map(page => `# ${page.locator_label}\n${page.raw_text}`).join("\n\n");
  const versionUpdate = await db.from("document_version").update({ extracted_text: extractedText, processing: "succeeded" }).eq("id", versionId);
  if (versionUpdate.error) throw new Error(`Finish structured source: ${versionUpdate.error.message}`);
  await db.from("processing_job").update({ status: "succeeded", completed_at: new Date().toISOString(), lease_expires_at: null }).eq("id", effectiveJobId);
  await db.from("ingestion_item").update({ status: "awaiting_review", updated_at: new Date().toISOString() }).eq("id", ingestionItemId);
}

async function importItem(db, batch, item) {
  const sourcePath = path.join(sourceRoot, item.relative_path);
  const bytes = await readFile(sourcePath);
  const documentId = `DOC-${stableUuid("document", item.relative_path.toLowerCase())}`;
  const versionId = `VER-${stableUuid("version", `${item.relative_path.toLowerCase()}:${item.sha256}`)}`;
  const itemId = stableUuid("ingestion-item", `${batch.id}:${item.manifest_item_id}`);
  const namespace = item.equipment_id || "shared";
  const storagePath = `sources/${namespace}/${documentId}/${versionId}/${sanitizeFilename(item.filename)}`;
  const equipmentIds = item.equipment_id ? [item.equipment_id] : equipment.map(asset => asset.id);
  const prior = await db.from("ingestion_item").select("status,version_id,sha256,attempts").eq("id", itemId).maybeSingle();
  if (prior.error) throw new Error(`Inspect ingestion item: ${prior.error.message}`);
  if (prior.data?.status === "indexed" || prior.data?.status === "awaiting_review" || prior.data?.status === "extracted") return "skipped";

  const ingestion = await db.from("ingestion_item").upsert({
    id: itemId, batch_id: batch.id, manifest_item_id: item.manifest_item_id, relative_path: item.relative_path,
    filename: item.filename, mime: item.detected_mime, byte_size: item.byte_size, sha256: item.sha256,
    equipment_id: item.equipment_id, proposed_document_type: item.proposed_document_type, status: "uploading",
    storage_path: storagePath, attempts: Math.min(3, Number(prior.data?.attempts || 0) + 1), deduplication_decision: prior.data ? "existing_version" : "new", updated_at: new Date().toISOString(),
  }, { onConflict: "batch_id,manifest_item_id" }).select("id").single();
  requireData(ingestion.data, ingestion.error, "Register ingestion item");

  const existingVersion = await db.from("document_version").select("id,checksum,storage_path").eq("id", versionId).maybeSingle();
  if (existingVersion.error) throw new Error(`Inspect document version: ${existingVersion.error.message}`);
  if (!existingVersion.data) {
    const uploaded = await db.storage.from("hub-sources").upload(storagePath, bytes, { contentType: item.detected_mime, upsert: false, cacheControl: "3600" });
    if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw new Error(`Upload original: ${uploaded.error.message}`);
    const document = await db.from("document").upsert({ id: documentId }, { onConflict: "id", ignoreDuplicates: true });
    if (document.error) throw new Error(`Create document: ${document.error.message}`);
    const doc = metadata(item);
    const version = await db.from("document_version").insert({
      id: versionId, document_id: documentId, title: doc.title, number: doc.number, type: item.proposed_document_type,
      revision: doc.revision, source: `Data/${item.relative_path}`, filename: item.filename, mime: item.detected_mime,
      checksum: item.sha256, storage_path: storagePath, processing: "queued", metadata: "incomplete", review: "not_submitted",
      publication: "unpublished", indexing: "not_started", applicability: "candidate", access: "team", owner: "", purpose: "",
      extracted_text: "", byte_size: item.byte_size, original_relative_path: item.relative_path, imported_at: new Date().toISOString(), ingestion_item_id: itemId,
    });
    if (version.error) throw new Error(`Create document version: ${version.error.message}`);
  } else if (existingVersion.data.checksum !== item.sha256 || existingVersion.data.storage_path !== storagePath) {
    throw new Error("Existing deterministic version conflicts with the approved manifest.");
  }

  const links = await db.from("document_equipment").upsert(equipmentIds.map(equipment_id => ({ version_id: versionId, equipment_id })), { onConflict: "version_id,equipment_id", ignoreDuplicates: true });
  if (links.error) throw new Error(`Link equipment: ${links.error.message}`);
  await linkDocumentAcl(db, documentId, equipmentIds);
  const itemUpdate = await db.from("ingestion_item").update({ status: "uploaded", version_id: versionId, error_code: null, error_message: null, updated_at: new Date().toISOString() }).eq("id", itemId);
  if (itemUpdate.error) throw new Error(`Finalize upload: ${itemUpdate.error.message}`);

  if (item.proposed_processor === "deterministic_xlsx" || item.proposed_processor === "deterministic_pptx") {
    await persistStructuredSource(db, versionId, itemId, item, sourcePath);
  } else {
    const job = await db.from("processing_job").upsert({
      id: randomUUID(), idempotency_key: `ocr:${versionId}:${item.sha256}:gemini-ocr-v1`, version_id: versionId,
      kind: "ocr", status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(),
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (job.error) throw new Error(`Queue OCR: ${job.error.message}`);
  }
  return "imported";
}

async function verifyBatch(db, batchId) {
  const result = await db.from("ingestion_item").select("id,relative_path,sha256,storage_path,status,version_id").eq("batch_id", batchId).order("relative_path");
  const items = requireData(result.data, result.error, "Load batch items") || [];
  let verified = 0;
  const failures = [];
  for (const item of items) {
    if (!item.storage_path || !item.version_id) { failures.push({ path: item.relative_path, reason: "registration incomplete" }); continue; }
    const downloaded = await db.storage.from("hub-sources").download(item.storage_path);
    if (downloaded.error || !downloaded.data) { failures.push({ path: item.relative_path, reason: downloaded.error?.message || "download failed" }); continue; }
    const checksum = createHash("sha256").update(Buffer.from(await downloaded.data.arrayBuffer())).digest("hex");
    if (checksum !== item.sha256) failures.push({ path: item.relative_path, reason: "checksum mismatch" });
    else verified += 1;
  }
  console.log(JSON.stringify({ batch_id: batchId, records: items.length, verified, failures }, null, 2));
  if (failures.length) process.exitCode = 2;
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.mode === "dry-run") {
    execFileSync("node", [path.join(projectRoot, "scripts/preflight-data-inventory.mjs")], { cwd: projectRoot, stdio: "inherit" });
    return;
  }
  const manifest = await currentManifest();
  const { db, projectRef } = await connectedClient();
  await ensureSchema(db);
  if (options.mode === "verify") return verifyBatch(db, options.batch);
  const batch = await ensureBatch(db, manifest, options, projectRef);
  if (batch.manifest_checksum !== manifest.manifest_checksum) throw new Error("Batch manifest checksum does not match the current approved source manifest.");
  await db.from("equipment").upsert(equipment, { onConflict: "id" });
  await db.from("ingestion_batch").update({ status: "running", started_at: batch.started_at || new Date().toISOString() }).eq("id", batch.id);
  let imported = 0; let skipped = 0; const failures = [];
  for (const item of manifest.items) {
    try {
      const outcome = await importItem(db, batch, item);
      if (outcome === "imported") imported += 1; else skipped += 1;
      console.log(`${outcome.padEnd(8)} ${item.relative_path}`);
    } catch (error) {
      failures.push({ path: item.relative_path, error: error instanceof Error ? error.message : String(error) });
      await db.from("ingestion_item").update({ status: "failed", error_code: "IMPORT_FAILED", error_message: failures.at(-1).error.slice(0, 2000), updated_at: new Date().toISOString() }).eq("batch_id", batch.id).eq("manifest_item_id", item.manifest_item_id);
      console.error(`failed   ${item.relative_path}: ${failures.at(-1).error}`);
    }
  }
  await db.from("ingestion_batch").update({ status: failures.length ? "partially_failed" : "completed", completed_at: new Date().toISOString() }).eq("id", batch.id);
  console.log(JSON.stringify({ batch_id: batch.id, imported, skipped, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 2;
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
