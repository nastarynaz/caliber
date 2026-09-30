import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const appEnvironment = process.env.APP_ENV || (process.env.VERCEL_ENV === "production" ? "production" : "development");
  const configured = {
    environment: appEnvironment,
    connectedMode: process.env.HUB_MODE === "connected",
    demoMode: process.env.HUB_MODE === "demo",
    secureCookies: process.env.COOKIE_SECURE === "true",
    cookiePolicy: appEnvironment === "production" ? process.env.COOKIE_SECURE === "true" : true,
    personaAccess: process.env.JUDGE_DEMO_ENABLED === "true",
    gemini: process.env.GEMINI_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY),
  };
  let database = false; let storage = false;
  try {
    const db = supabaseAdmin();
    const [table, bucket] = await Promise.all([
      db.from("equipment").select("id", { head: true, count: "exact" }).limit(1),
      db.storage.getBucket("hub-sources"),
    ]);
    database = !table.error;
    storage = !bucket.error && bucket.data.public === false;
  } catch { /* A readiness response must never expose credential or provider errors. */ }
  const localDemoReady = appEnvironment === "development" && configured.demoMode && configured.personaAccess;
  const connectedReady = configured.connectedMode && configured.cookiePolicy && configured.personaAccess && configured.gemini && database && storage;
  const ready = localDemoReady || connectedReady;
  return Response.json({ status: ready ? "ready" : "not_ready", configured, dependencies: { database, privateStorage: storage } }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
