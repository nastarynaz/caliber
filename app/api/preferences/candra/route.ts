import { cookies } from "next/headers";
import { candraScopeCookieOptions } from "@/lib/data/cookie-options";
import { checkOrigin, readJson, apiError } from "@/lib/data/http";
import { snapshot } from "@/lib/data/store";
import { validCandraScope } from "@/lib/domain/assistant";

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const [{ state }, body, jar] = await Promise.all([snapshot(), readJson(request), cookies()]);
    const requested = body && typeof body === "object" ? (body as Record<string, unknown>).equipmentId : undefined;
    const equipmentId = validCandraScope(requested, state.equipment.map(item => item.id));
    jar.set("kh_candra_scope", equipmentId, candraScopeCookieOptions());
    return Response.json({ equipmentId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
