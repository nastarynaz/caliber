import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();
function loadDotEnv() {
  const text = readFileSync(path.join(projectRoot, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("="); const name = line.slice(0, index).trim();
    if (!(name in process.env)) process.env[name] = line.slice(index + 1).trim();
  }
}
function chunkPage(page, maximum = 3500, overlap = 300) {
  const text = page.normalized_text || page.raw_text;
  const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  const chunks = []; let current = "";
  const push = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = current.slice(Math.max(0, current.length - overlap));
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maximum) {
      push(); current = "";
      for (let offset = 0; offset < paragraph.length; offset += maximum - overlap) chunks.push(paragraph.slice(offset, offset + maximum));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maximum) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.map((content, ordinal) => ({ content, ordinal }));
}
async function indexVersion(db, ai, version) {
  const pagesResult = await db.from("document_page").select("id,page_number,locator_label,raw_text,normalized_text,extraction_state").eq("version_id", version.id).in("extraction_state", ["succeeded","needs_attention"]).order("page_number");
  if (pagesResult.error) throw new Error(`Load document pages: ${pagesResult.error.message}`);
  const pages = pagesResult.data || [];
  if (!pages.length) throw new Error("No extracted pages are available.");
  const extractionResult = await db.from("extraction_run").select("id").eq("version_id", version.id).eq("status", "succeeded").order("completed_at", { ascending: false }).limit(1).single();
  if (extractionResult.error) throw new Error(`Load extraction run: ${extractionResult.error.message}`);
  const job = await db.from("processing_job").upsert({
    id: randomUUID(), idempotency_key: `index:${version.id}:${version.checksum}:source-aware-v1`, version_id: version.id,
    kind: "index", status: "running", attempts: 1, started_at: new Date().toISOString(), lease_owner: `index-cli:${process.pid}`,
  }, { onConflict: "idempotency_key" }).select("id").single();
  if (job.error) throw new Error(`Create index job: ${job.error.message}`);
  await db.from("document_chunk").update({ active: false, rag_eligible: false }).eq("version_id", version.id);
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
  const dimensions = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 768);
  let ordinal = 0;
  for (const page of pages) {
    for (const chunk of chunkPage(page)) {
      const prefix = `Document: ${version.title}\nRevision: ${version.revision || "not recorded"}\nLocator: ${page.locator_label}\n\n`;
      const content = `${prefix}${chunk.content}`;
      const response = await ai.models.embedContent({ model, contents: content, config: { outputDimensionality: dimensions, taskType: "RETRIEVAL_DOCUMENT", title: version.title } });
      const vector = response.embeddings?.[0]?.values;
      if (!vector || vector.length !== dimensions) throw new Error(`Embedding dimension mismatch: expected ${dimensions}, received ${vector?.length || 0}.`);
      const checksum = createHash("sha256").update(content).digest("hex");
      const row = {
        version_id: version.id, extraction_id: extractionResult.data.id, page: page.page_number || 1, page_end: page.page_number || 1,
        ordinal, content, content_checksum: checksum, chunking_strategy: "source-aware-v1", token_count: null,
        metadata: { locator_label: page.locator_label, document_title: version.title, document_number: version.number, revision: version.revision, source_class: version.type, review: version.review, publication: version.publication },
        embedding: vector, embedding_model: model, embedding_dimensions: dimensions, rag_eligible: true, active: true,
      };
      const inserted = await db.from("document_chunk").upsert(row, { onConflict: "version_id,content_checksum" });
      if (inserted.error) throw new Error(`Persist document chunk: ${inserted.error.message}`);
      ordinal += 1;
    }
  }
  if (!ordinal) throw new Error("Chunker produced no indexable content.");
  const activated = await db.rpc("hub_worker_activate_version", { p_version_id: version.id });
  if (activated.error) throw new Error(`Activate indexed version: ${activated.error.message}`);
  await db.from("processing_job").update({ status: "succeeded", completed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null }).eq("id", job.data.id);
  return ordinal;
}
async function main() {
  loadDotEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("Connected Supabase and Gemini server credentials are required.");
  const limitArg = process.argv.indexOf("--limit"); const limit = limitArg >= 0 ? Math.max(1, Math.min(100, Number(process.argv[limitArg + 1]) || 1)) : 1;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const versions = await db.from("document_version").select("id,document_id,title,number,revision,type,checksum,review,publication,indexing").eq("review", "approved").eq("publication", "published").eq("indexing", "queued").limit(limit);
  if (versions.error) throw new Error(`Load indexing queue: ${versions.error.message}`);
  for (const version of versions.data || []) {
    try { console.log(`indexed ${version.id}: ${await indexVersion(db, ai, version)} chunks`); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.from("document_version").update({ indexing: "failed" }).eq("id", version.id);
      await db.from("processing_job").update({ status: "needs_attention", error_code: "INDEX_FAILED", error: message.slice(0, 2000), lease_owner: null, lease_expires_at: null }).eq("version_id", version.id).eq("kind", "index").eq("status", "running");
      console.error(`failed ${version.id}: ${message}`);
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
