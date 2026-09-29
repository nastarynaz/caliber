import "server-only";
import { cookies } from "next/headers";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Actor, Command, HubState, Role } from "@/lib/domain/types";
import { applyCommand, DomainError, visibleState } from "@/lib/domain/workflow";
import { supabaseServer } from "@/lib/supabase/server";

export const mode = () => process.env.HUB_MODE === "connected" ? "connected" : process.env.HUB_MODE === "demo" || process.env.NODE_ENV !== "production" ? "demo" : "setup";
// Deployed/serverless bundles are normally read-only. Keep the deterministic
// demo usable for previews by writing to the platform temp directory. This is
// intentionally ephemeral; connected mode persists through Supabase instead.
const root = process.env.HUB_DEMO_DATA_DIR
  ? path.resolve(process.env.HUB_DEMO_DATA_DIR)
  : process.env.NODE_ENV === "production"
    ? path.join(tmpdir(), "caliber-knowledge-hub")
    : path.join(process.cwd(), ".local-data");
const roles: Role[] = ["engineer", "controller", "reviewer", "reader"];
type Session = { actor: Actor; state: HubState; expires: number };
const locks = new Map<string, Promise<unknown>>();
async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = locks.get(key) ?? Promise.resolve();
  const current = before.catch(() => {}).then(work); locks.set(key, current);
  try { return await current; } finally { if (locks.get(key) === current) locks.delete(key); }
}
async function readSession(id: string): Promise<Session> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new DomainError("Sign in to continue.", 401);
  try {
    const session = JSON.parse(await readFile(path.join(root, id + ".json"), "utf8")) as Session;
    if (session.expires < Date.now()) throw new Error("expired");
    return session;
  } catch { throw new DomainError("Session expired. Sign in again.", 401); }
}
async function saveSession(id: string, session: Session) {
  await mkdir(root, { recursive: true });
  const target = path.join(root, id + ".json"); const temporary = target + ".tmp";
  await writeFile(temporary, JSON.stringify(session), { mode: 0o600 }); await rename(temporary, target);
}
export async function startDemo(role: string) {
  if (mode() !== "demo") throw new DomainError("Demo personas are disabled outside demo mode.", 403);
  if (!roles.includes(role as Role)) throw new DomainError("Unknown demo persona.");
  const jar = await cookies(); let id = jar.get("kh_session")?.value;
  let previous: Session | null = null;
  if (id) { try { previous = await readSession(id); } catch { id = undefined; } }
  id ??= crypto.randomUUID();
  const names = { engineer: "Alex · Demo engineer", controller: "Sam · Demo controller", reviewer: "Morgan · Demo reviewer", reader: "Taylor · Demo reader" };
  const actor: Actor = { id: `demo-${role}`, name: names[role as Role], role: role as Role, mode: "demo" };
  await exclusive(id, async () => {
    const fresh = previous ? await readSession(id!) : null;
    const state = fresh?.state ?? JSON.parse(await readFile(path.join(process.cwd(), "data/catalog.json"), "utf8"));
    await saveSession(id!, { actor, state, expires: Date.now() + 8 * 3600000 });
  });
  jar.set("kh_session", id, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 8 * 3600 });
  return actor;
}
export async function session() {
  if (mode() === "setup") throw new DomainError("Set HUB_MODE=demo or configure Supabase connected mode.", 503);
  if (mode() === "connected") {
    const db = await supabaseServer(); const { data, error } = await db.auth.getClaims(); const userId = data?.claims?.sub;
    if (error || typeof userId !== "string") throw new DomainError("Sign in to continue.", 401);
    const { data: profile } = await db.from("app_user").select("display_name, role").eq("auth_user_id", userId).single();
    if (!profile || !roles.includes(profile.role)) throw new DomainError("No workspace role is assigned.", 403);
    return { id: userId, actor: { id: userId, name: profile.display_name, role: profile.role, mode: "connected" } as Actor };
  }
  const id = (await cookies()).get("kh_session")?.value ?? "";
  const entry = await readSession(id); return { id, actor: entry.actor };
}
export async function snapshot() {
  const current = await session();
  if (current.actor.mode === "connected") {
    const db = await supabaseServer(); const { data, error } = await db.rpc("hub_snapshot");
    if (error) throw new DomainError("Connected database is not ready. Apply and verify the supplied migration and import your records.", 503);
    return { actor: current.actor, state: data as HubState };
  }
  const entry = await readSession(current.id); return { actor: entry.actor, state: visibleState(entry.state, entry.actor) };
}
export async function mutate(command: Command) {
  const current = await session();
  if (current.actor.mode === "connected") {
    const db = await supabaseServer();
    const { error } = await db.rpc("hub_command", { p_action: command.action, p_id: command.id ?? null, p_data: command.data ?? {}, p_expected_revision: command.expectedRevision });
    if (error) {
      const message = error.message || "Connected mutation failed.";
      const status = /permission|role|access/i.test(message) ? 403 : /changed|state|cannot|only|already|awaiting/i.test(message) ? 409 : 400;
      throw new DomainError(message, status);
    }
    const fresh = await snapshot(); return fresh;
  }
  return exclusive(current.id, async () => {
    const entry = await readSession(current.id);
    entry.state = applyCommand(entry.state, entry.actor, command);
    await saveSession(current.id, entry); return { actor: entry.actor, state: visibleState(entry.state, entry.actor) };
  });
}
export async function updateDemo(work: (state: HubState, actor: Actor) => Promise<HubState>) {
  const current = await session();
  if (current.actor.mode !== "demo") throw new DomainError("This action is available in the isolated demo only.", 501);
  return exclusive(current.id, async () => {
    const entry = await readSession(current.id); entry.state = await work(entry.state, entry.actor);
    await saveSession(current.id, entry); return { actor: entry.actor, state: visibleState(entry.state, entry.actor) };
  });
}
