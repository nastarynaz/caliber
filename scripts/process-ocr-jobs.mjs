import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();
const promptVersion = "gemini-faithful-ocr-v1";
const schemaVersion = "industrial-document-extraction-v1";
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pages", "candidates"],
  properties: {
    pages: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false,
        required: ["page_number", "raw_text", "confidence", "unreadable_regions"],
        properties: {
          page_number: { type: "integer", minimum: 1 },
          raw_text: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          unreadable_regions: { type: "array", items: { type: "string" } },
        },
      },
    },
    candidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["candidate_type", "raw_text", "normalized_value", "unit", "equipment_tag", "instrument_tag", "page_number", "source_excerpt", "confidence", "ambiguity_note", "requires_engineering_review"],
        properties: {
          candidate_type: { type: "string", enum: ["equipment_identity","instrument_tag","parameter","limit","procedure","failure_mode","safeguard","inspection_step","topology_relation","maintenance_fact"] },
          raw_text: { type: "string" },
          normalized_value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          equipment_tag: { anyOf: [{ type: "string" }, { type: "null" }] },
          instrument_tag: { anyOf: [{ type: "string" }, { type: "null" }] },
          page_number: { type: "integer", minimum: 1 },
          source_excerpt: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          ambiguity_note: { anyOf: [{ type: "string" }, { type: "null" }] },
          requires_engineering_review: { type: "boolean" },
        },
      },
    },
  },
};

function loadDotEnv() {
  const text = readFileSync(path.join(projectRoot, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("="); const name = line.slice(0, index).trim();
    if (!(name in process.env)) process.env[name] = line.slice(index + 1).trim();
  }
}
function validatePayload(value, expectedPages) {
  if (!value || typeof value !== "object" || !Array.isArray(value.pages) || !Array.isArray(value.candidates)) throw new Error("Gemini response does not match the extraction envelope.");
  if (value.pages.length !== expectedPages) throw new Error(`Gemini returned ${value.pages.length} pages; expected ${expectedPages}.`);
  const seen = new Set();
  for (const page of value.pages) {
    if (!Number.isInteger(page.page_number) || page.page_number < 1 || page.page_number > expectedPages || seen.has(page.page_number)) throw new Error("Gemini returned an invalid or duplicate page number.");
    if (typeof page.raw_text !== "string" || typeof page.confidence !== "number" || !Array.isArray(page.unreadable_regions)) throw new Error("Gemini returned an invalid page transcription.");
    seen.add(page.page_number);
  }
  for (const candidate of value.candidates) {
    if (typeof candidate.raw_text !== "string" || typeof candidate.source_excerpt !== "string" || !Number.isInteger(candidate.page_number) || !seen.has(candidate.page_number)) throw new Error("Gemini returned a candidate without valid page provenance.");
  }
  return value;
}
async function waitForFile(ai, uploaded) {
  let file = uploaded;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = String(file.state || "ACTIVE").toUpperCase();
    if (state === "ACTIVE") return file;
    if (state === "FAILED") throw new Error(`Gemini file processing failed: ${file.error?.message || "unknown provider error"}`);
    await new Promise(resolve => setTimeout(resolve, Math.min(5_000, 500 * 2 ** Math.min(attempt, 4))));
    if (!file.name) throw new Error("Gemini file resource name is missing.");
    file = await ai.files.get({ name: file.name });
  }
  throw new Error("Gemini file processing timed out.");
}
function promptFor(version, expectedPages) {
  return `Perform faithful industrial-document transcription and separate candidate extraction for the attached source.

Source metadata:
- Filename: ${version.filename}
- Document type: ${version.type}
- Expected pages: ${expectedPages}

Transcription rules:
- Return exactly one pages entry for every source page, in source order.
- Preserve visible wording, headings, numbered steps, tables, tags, symbols, and units.
- Use readable Markdown/plain text for tables without changing values.
- Mark illegible text as [UNREADABLE]; never guess it.
- Do not summarize, correct, approve, or add instructions.
- Distinguish visible source text from interpretation.

Candidate rules:
- Candidates are review proposals only, never approved plant data.
- Every candidate must cite an exact page and short verbatim source excerpt.
- Do not infer hidden P&ID connections, operating state, root cause, SIL classification, setpoint, or procedure.
- Set requires_engineering_review=true for engineering values, limits, safeguards, procedures, and topology.
- Confidence measures extraction legibility only, not engineering correctness.`;
}
async function processJob(db, ai, job) {
  const claimed = await db.from("processing_job").update({
    status: "running", attempts: job.attempts + 1, lease_owner: `ocr-cli:${process.pid}`,
    lease_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), started_at: job.started_at || new Date().toISOString(), error: null, error_code: null,
  }).eq("id", job.id).eq("status", "queued").select("id,attempts").maybeSingle();
  if (claimed.error) throw new Error(`Claim job: ${claimed.error.message}`);
  if (!claimed.data) return "skipped";
  const versionResult = await db.from("document_version").select("id,filename,mime,checksum,storage_path,type,byte_size").eq("id", job.version_id).single();
  if (versionResult.error || !versionResult.data?.storage_path) throw new Error(`Load source version: ${versionResult.error?.message || "storage path missing"}`);
  const version = versionResult.data;
  const itemResult = await db.from("ingestion_item").select("id").eq("version_id", version.id).maybeSingle();
  const itemId = itemResult.data?.id;
  if (itemId) await db.from("ingestion_item").update({ status: "ocr_processing", updated_at: new Date().toISOString() }).eq("id", itemId);
  const source = await db.storage.from("hub-sources").download(version.storage_path);
  if (source.error || !source.data) throw new Error(`Download original: ${source.error?.message || "source unavailable"}`);
  const temp = await mkdtemp(path.join(tmpdir(), "caliber-ocr-"));
  const localPath = path.join(temp, version.filename.replace(/[^a-zA-Z0-9._-]+/g, "-"));
  await writeFile(localPath, Buffer.from(await source.data.arrayBuffer()), { mode: 0o600 });
  let uploaded;
  try {
    uploaded = await ai.files.upload({ file: localPath, config: { mimeType: version.mime, displayName: version.filename } });
    const ready = await waitForFile(ai, uploaded);
    if (!ready.uri) throw new Error("Gemini did not return a file URI.");
    const expectedPages = 1;
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      contents: [{ role: "user", parts: [
        { fileData: { fileUri: ready.uri, mimeType: version.mime } },
        { text: promptFor(version, expectedPages) },
      ] }],
      config: { temperature: 0, maxOutputTokens: 16_000, responseMimeType: "application/json", responseJsonSchema: outputSchema },
    });
    if (!response.text) throw new Error("Gemini returned no extraction text.");
    const payload = validatePayload(JSON.parse(response.text), expectedPages);
    const extractionId = randomUUID();
    const run = await db.from("extraction_run").upsert({
      id: extractionId, version_id: version.id, job_id: job.id, method: "gemini_document_understanding",
      provider: "google_gemini", model: response.modelVersion || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      prompt_version: promptVersion, schema_version: schemaVersion, input_checksum: version.checksum,
      status: "succeeded", started_at: job.started_at || new Date().toISOString(), completed_at: new Date().toISOString(),
      raw_output: payload, usage_metadata: response.usageMetadata || {},
    }, { onConflict: "job_id" }).select("id").single();
    if (run.error) throw new Error(`Persist extraction run: ${run.error.message}`);
    const effectiveExtractionId = run.data.id;
    const locatorType = version.mime === "image/png" ? "image" : "pdf_page";
    const pageRows = payload.pages.map(page => ({
      version_id: version.id, locator_type: locatorType, locator_label: locatorType === "image" ? "Image 1" : `Page ${page.page_number}`,
      page_number: page.page_number, raw_text: page.raw_text, normalized_text: page.raw_text.replace(/\n{3,}/g, "\n\n"),
      extraction_state: page.unreadable_regions.length ? "needs_attention" : "succeeded", confidence: page.confidence,
      regions: { unreadable_regions: page.unreadable_regions }, processor: "gemini_document_understanding", provider: "google_gemini",
      model: response.modelVersion || process.env.GEMINI_MODEL, prompt_version: promptVersion, schema_version: schemaVersion,
    }));
    const pages = await db.from("document_page").upsert(pageRows, { onConflict: "version_id,locator_type,locator_label" }).select("id,page_number,locator_type,locator_label");
    if (pages.error) throw new Error(`Persist OCR pages: ${pages.error.message}`);
    const pageMap = new Map(pages.data.map(page => [page.page_number, page]));
    if (payload.candidates.length) {
      const candidates = payload.candidates.map(candidate => {
        const page = pageMap.get(candidate.page_number);
        return {
          extraction_id: effectiveExtractionId, version_id: version.id, page_id: page?.id,
          candidate_type: candidate.candidate_type, raw_text: candidate.raw_text, normalized_value: candidate.normalized_value,
          unit: candidate.unit, equipment_tag: candidate.equipment_tag, instrument_tag: candidate.instrument_tag,
          locator_type: locatorType, locator_label: page?.locator_label || `Page ${candidate.page_number}`,
          source_excerpt: candidate.source_excerpt, confidence: candidate.confidence, ambiguity_note: candidate.ambiguity_note,
          requires_engineering_review: candidate.requires_engineering_review, review_status: "pending",
          fingerprint: createHash("sha256").update(JSON.stringify([candidate.candidate_type,candidate.page_number,candidate.raw_text,candidate.source_excerpt])).digest("hex"),
        };
      });
      const candidateResult = await db.from("extraction_candidate").upsert(candidates, { onConflict: "version_id,fingerprint" });
      if (candidateResult.error) throw new Error(`Persist extraction candidates: ${candidateResult.error.message}`);
    }
    const extractedText = payload.pages.sort((a, b) => a.page_number - b.page_number).map(page => `# Page ${page.page_number}\n${page.raw_text}`).join("\n\n");
    const versionUpdate = await db.from("document_version").update({ processing: "succeeded", extracted_text: extractedText }).eq("id", version.id);
    if (versionUpdate.error) throw new Error(`Complete source version: ${versionUpdate.error.message}`);
    await db.from("processing_job").update({ status: "succeeded", completed_at: new Date().toISOString(), lease_expires_at: null, lease_owner: null }).eq("id", job.id);
    if (itemId) await db.from("ingestion_item").update({ status: "awaiting_review", updated_at: new Date().toISOString() }).eq("id", itemId);
    return "succeeded";
  } finally {
    if (uploaded?.name) await ai.files.delete({ name: uploaded.name }).catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }
}
async function main() {
  loadDotEnv();
  if (process.env.GEMINI_ENABLED !== "true" || !process.env.GEMINI_API_KEY) throw new Error("Gemini OCR is not enabled or its server key is missing.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Connected Supabase server credentials are required.");
  const limitArg = process.argv.indexOf("--limit"); const limit = limitArg >= 0 ? Math.max(1, Math.min(100, Number(process.argv[limitArg + 1]) || 1)) : 1;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const jobs = await db.from("processing_job").select("id,version_id,attempts,started_at").eq("kind", "ocr").eq("status", "queued").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (jobs.error) throw new Error(`Load OCR jobs: ${jobs.error.message}`);
  for (const job of jobs.data || []) {
    try { console.log(`${await processJob(db, ai, job)} ${job.version_id}`); }
    catch (error) {
      const attempts = job.attempts + 1; const terminal = attempts >= 3;
      const message = error instanceof Error ? error.message : String(error);
      await db.from("processing_job").update({
        status: terminal ? "needs_attention" : "queued", error_code: "OCR_FAILED", error: message.slice(0, 2000),
        next_attempt_at: terminal ? null : new Date(Date.now() + 2 ** attempts * 30_000).toISOString(), lease_expires_at: null, lease_owner: null,
      }).eq("id", job.id);
      await db.from("document_version").update({ processing: terminal ? "failed" : "queued" }).eq("id", job.version_id);
      await db.from("ingestion_item").update({ status: terminal ? "needs_attention" : "uploaded", error_code: "OCR_FAILED", error_message: message.slice(0, 2000), updated_at: new Date().toISOString() }).eq("version_id", job.version_id);
      console.error(`failed ${job.version_id}: ${message}`);
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
