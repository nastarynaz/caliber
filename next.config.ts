import type { NextConfig } from "next";

const appEnvironment = process.env.APP_ENV || (process.env.VERCEL_ENV === "production" ? "production" : "development");
if (!["development", "production"].includes(appEnvironment)) throw new Error("APP_ENV must be development or production.");
if (process.env.VERCEL_ENV === "production" && appEnvironment !== "production") throw new Error("Vercel production deployments require APP_ENV=production.");

if (process.env.HUB_MODE === "connected") {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Connected configuration is incomplete: ${missing.join(", ")}`);
  if (process.env.GEMINI_ENABLED !== "true") throw new Error("Connected mode requires explicitly enabled server-side Gemini integration.");
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (supabase.protocol !== "https:" || supabase.pathname !== "/") throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the HTTPS project origin without /rest/v1 or another path.");
  if (appEnvironment === "production" && site.protocol !== "https:") throw new Error("NEXT_PUBLIC_SITE_URL must be an approved HTTPS origin in production.");
  if (appEnvironment === "production" && process.env.COOKIE_SECURE !== "true") throw new Error("Production requires COOKIE_SECURE=true.");
  if (process.env.JUDGE_DEMO_ENABLED === "true") {
    const judgeVariables = ["JUDGE_ENGINEER_EMAIL", "JUDGE_ENGINEER_PASSWORD", "JUDGE_READER_EMAIL", "JUDGE_READER_PASSWORD", "JUDGE_CONTROLLER_EMAIL", "JUDGE_CONTROLLER_PASSWORD", "JUDGE_REVIEWER_EMAIL", "JUDGE_REVIEWER_PASSWORD"];
    const missingJudgeVariables = judgeVariables.filter(name => !process.env[name]);
    if (missingJudgeVariables.length) throw new Error(`Judge access is enabled but incomplete: ${missingJudgeVariables.join(", ")}`);
  }
}

if (appEnvironment === "production" && process.env.HUB_MODE !== "connected") throw new Error("Production requires HUB_MODE=connected; demo fallback is disabled.");

const nextConfig: NextConfig = {
  // Governed demo evidence is bundled for checksum-matched fallback previews.
  outputFileTracingIncludes: {
    "/api/files/[id]": ["./data/file-manifest.json", "./data/files/**/*"],
  },
  // Runtime demo sessions/uploads must never be bundled into a deployment.
  outputFileTracingExcludes: {
    "/*": ["./.local-data/**/*", "./artifacts/**/*", "./reports/ingestion/**/*", "./test-results/**/*", "./playwright-report/**/*"],
  },
};

export default nextConfig;
