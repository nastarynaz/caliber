import { cookies } from "next/headers";
import { startDemo, mode } from "@/lib/data/store";
import { apiError, checkOrigin, readJson } from "@/lib/data/http";
import { supabaseServer } from "@/lib/supabase/server";
import { DomainError } from "@/lib/domain/workflow";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const body = await readJson(request);
    if (mode() === "demo") return Response.json({ actor: await startDemo(body.role) });
    if (mode() !== "connected") throw new DomainError("Choose a runtime mode in environment configuration.", 503);
    const db = await supabaseServer(); const { error } = await db.auth.signInWithPassword({ email: String(body.email || ""), password: String(body.password || "") });
    if (error) throw new DomainError("Sign-in failed. Check your credentials.", 401);
    return Response.json({ ok: true });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request) {
  try { checkOrigin(request); if (mode() === "connected") await (await supabaseServer()).auth.signOut(); const jar = await cookies(); jar.delete("kh_session"); jar.delete("kh_demo_role"); return Response.json({ ok: true }); }
  catch (e) { return apiError(e); }
}
