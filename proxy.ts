import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Carries a server-observed return path; all data routes still authorize independently.
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-hub-return-path", request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request: { headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.HUB_MODE === "connected" && url && key) {
    const db = createServerClient(url, key, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: updates => {
        updates.forEach(({ name, value }) => request.cookies.set(name, value));
        headers.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers } });
        updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } });
    await db.auth.getClaims();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/equipment/:path*", "/documents/:path*", "/cases/:path*", "/admin/:path*", "/api/:path*"] };
