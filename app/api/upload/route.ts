import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { session, snapshot, updateDemo } from "@/lib/data/store";
import { apiError, checkOrigin, readBounded } from "@/lib/data/http";
import { DomainError, requireRole } from "@/lib/domain/workflow";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const current = await session(); requireRole(current.actor, ["controller"]);
    if (Number(request.headers.get("content-length") || 0) > 11000000) throw new DomainError("Maximum upload size is 10 MB.", 413);
    const form = await new Response(await readBounded(request, 11000000), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 10000000 || !["application/pdf", "image/png"].includes(file.type)) throw new DomainError("Choose a PDF or PNG under 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf" ? bytes.subarray(0, 5).toString() !== "%PDF-" : bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new DomainError("File signature does not match its type.");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const existingDocumentId = String(form.get("documentId") || "");
    if (current.actor.mode === "connected") {
      const versionId = `VER-${crypto.randomUUID()}`; const documentId = existingDocumentId || `DOC-${crypto.randomUUID()}`;
      const extension = file.type === "application/pdf" ? "pdf" : "png"; const storagePath = `sources/${documentId}/${versionId}.${extension}`;
      const admin = supabaseAdmin(); const { error: storageError } = await admin.storage.from("hub-sources").upload(storagePath, bytes, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (storageError) throw new DomainError("Private Storage upload failed. Verify the service role and hub-sources bucket.", 503);
      const db = await supabaseServer();
      const { error } = await db.rpc("hub_create_upload", { p_version_id: versionId, p_document_id: documentId, p_existing_document: Boolean(existingDocumentId), p_filename: file.name, p_mime: file.type, p_checksum: checksum, p_storage_path: storagePath, p_equipment_id: String(form.get("equipmentId") || ""), p_expected_revision: Number(form.get("expectedRevision")) });
      if (error) { await admin.storage.from("hub-sources").remove([storagePath]); throw new DomainError(error.message || "Connected upload registration failed.", /permission|access|role/i.test(error.message) ? 403 : 409); }
      return Response.json(await snapshot());
    }
    const id = `DEMO-VER-${crypto.randomUUID()}`; const documentId = existingDocumentId || `DEMO-DOC-${crypto.randomUUID()}`;
    return Response.json(await updateDemo(async (state, actor) => {
      requireRole(actor, ["controller"]);
      if (Number(form.get("expectedRevision")) !== state.revision) throw new DomainError("Workspace changed. Refresh and upload again.", 409);
      if (state.documents.some(d => d.checksum === checksum && d.documentId === documentId)) throw new DomainError("This exact file already exists for this document.", 409);
      const prior = state.documents.find(d => d.documentId === documentId);
      if (form.get("documentId") && !prior) throw new DomainError("Choose an existing document for a new revision.");
      if (state.documents.length >= 100) throw new DomainError("This demo workspace has reached its 100-version limit.", 429);
      const equipmentId = String(form.get("equipmentId") || "");
      if (!state.equipment.some(e => e.id === equipmentId)) throw new DomainError("Choose valid equipment.");
      const dir = path.join(process.cwd(), ".local-data", current.id); await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${id}.${file.type === "application/pdf" ? "pdf" : "png"}`), bytes, { flag: "wx", mode: 0o600 });
      const event = { id: crypto.randomUUID(), at: new Date().toISOString(), actor: actor.name, action: "document.upload", comment: "File stored privately. Automatic extraction is not configured." };
      state.documents.unshift({ id, documentId, title: prior?.title || file.name, number: prior?.number || "", type: prior?.type || "REFERENCE", revision: null, equipmentIds: [equipmentId], source: "Manual demo upload", filename: file.name, mime: file.type, checksum, processing: "queued", metadata: "incomplete", review: "not_submitted", publication: "unpublished", indexing: "not_started", applicability: "candidate", access: prior?.access || "team", owner: "", purpose: "", text: "", events: [event] });
      state.audit.unshift(event); state.revision++; return state;
    }));
  } catch (e) { return apiError(e); }
}
