import "server-only";

function secureCookies() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production" || process.env.COOKIE_SECURE === "true";
}

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: secureCookies(), path: "/", maxAge: 8 * 3600, priority: "high" as const };
}

export function candraScopeCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: secureCookies(), path: "/", maxAge: 30 * 24 * 3600, priority: "low" as const };
}
