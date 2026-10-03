import { readFile } from "node:fs/promises";
import path from "node:path";
import { snapshot, session } from "@/lib/data/store";
import { apiError } from "@/lib/data/http";
import { DomainError } from "@/lib/domain/workflow";
import { supabaseServer } from "@/lib/supabase/server";

type FileManifest = Record<string, { filename: string; preview?: string; sha256: string }>;

async function packagedFile(id: string, preview: boolean, checksum: string, manifest: FileManifest) {
  const entry = manifest[id];
  if (!entry || entry.sha256 !== checksum) return null;
  const filename = preview ? entry.preview : entry.filename;
  if (!filename || path.basename(filename) !== filename) return null;
  try { return await readFile(path.join(process.cwd(), "data", "files", filename)); }
  catch { return null; }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const { state, actor } = await snapshot();
    const doc = state.documents.find(d => d.id === id); if (!doc) throw new DomainError("Source unavailable.", 404);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "data/file-manifest.json"), "utf8")) as FileManifest;
    if (actor.mode === "connected") {
      const db = await supabaseServer();
      const { data: version, error: rowError } = await db.from("document_version").select("storage_path,preview_path").eq("id", id).single();
      const objectPath = preview ? version?.preview_path : version?.storage_path;
      const download = !rowError && objectPath ? await db.storage.from("hub-sources").download(objectPath) : null;
      const packaged = (!download || download.error || !download.data) ? await packagedFile(id, preview, doc.checksum, manifest) : null;
      const data = download?.data ?? packaged;
      if (!data) throw new DomainError("Source file unavailable. Import its private Storage object first.", 404);
      const disposition = doc.mime === "application/pdf" || doc.mime === "image/png" ? "inline" : `attachment; filename="${doc.filename.replace(/["\\\r\n]/g, "-")}"`;
      return new Response(data, { headers: { "Content-Type": preview ? "image/png" : doc.mime, "Cache-Control": "private, no-store", "Content-Disposition": disposition, "X-Content-Type-Options": "nosniff" } });
    }
    let bytes: Buffer<ArrayBuffer>;
    if (manifest[id]) {
      const packaged = await packagedFile(id, preview, doc.checksum, manifest);
      if (!packaged) throw new DomainError("Preview unavailable. Open the original source instead.", 404);
      bytes = packaged;
    } else {
      if (!/^DEMO-VER-[a-f0-9-]{36}$/.test(id)) throw new DomainError("Source unavailable.", 404);
      const { id: sid } = await session();
      const extension: Record<string,string> = { "application/pdf": "pdf", "image/png": "png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx" };
      bytes = await readFile(path.join(process.cwd(), ".local-data", sid, `${id}.${extension[doc.mime] || "bin"}`));
    }
    return new Response(bytes, { headers: { "Content-Type": preview && manifest[id]?.preview ? "image/png" : doc.mime, "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'" } });
  } catch (e) { return apiError(e); }
}
