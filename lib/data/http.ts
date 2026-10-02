import { DomainError } from "@/lib/domain/workflow";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next's internal URL can normalize 127.0.0.1 to localhost. Use the incoming
  // Host only in development; deployed origins must be explicitly configured.
  const expected = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : process.env.NODE_ENV !== "production"
      ? `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`
      : new URL(request.url).origin;
  if (!origin || origin !== expected) throw new DomainError("Cross-origin request rejected.", 403);
}
export function apiError(error: unknown) {
  const headers = { "Cache-Control": "private, no-store" };
  if (error instanceof DomainError) return Response.json({ error: error.message }, { status: error.status, headers });
  console.error(error); return Response.json({ error: "The request could not be completed. Your previous data has been retained." }, { status: 500, headers });
}
export async function readJson(request: Request) {
  const text = new TextDecoder().decode(await readBounded(request, 100000));
  try { return JSON.parse(text); } catch { throw new DomainError("Invalid JSON."); }
}
export async function readBounded(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new DomainError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new DomainError("Request too large.", 413); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
