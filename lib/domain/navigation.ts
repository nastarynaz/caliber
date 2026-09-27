export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/equipment/EQP-000001";
  try {
    const url = new URL(value, "https://hub.invalid");
    return url.origin === "https://hub.invalid" && /^\/(equipment|documents|cases|admin)(\/|$)/.test(url.pathname) ? url.pathname + url.search : "/equipment/EQP-000001";
  } catch { return "/equipment/EQP-000001"; }
}
