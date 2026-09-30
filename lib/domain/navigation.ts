export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/equipment";
  try {
    const url = new URL(value, "https://hub.invalid");
    return url.origin === "https://hub.invalid" && /^\/(equipment|documents|cases|admin|scan)(\/|$)/.test(url.pathname) ? url.pathname + url.search : "/equipment";
  } catch { return "/equipment"; }
}
