import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and publishable key are not configured.");
  const jar = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll: () => jar.getAll(),
    setAll: updates => {
      try { for (const { name, value, options } of updates) jar.set(name, value, options); }
      catch { /* Server Components cannot write cookies. proxy.ts refreshes the session. */ }
    },
  } });
}
