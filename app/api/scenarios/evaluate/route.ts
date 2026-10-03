import { snapshot } from "@/lib/data/store";
import { apiError, checkOrigin, readJson } from "@/lib/data/http";
import { buildScenarioSnapshot, parameterRegistry, sanitizeScenarioInput } from "@/lib/domain/control-room";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { state } = await snapshot();
    const data = await readJson(request);
    const input = sanitizeScenarioInput(data, parameterRegistry(state));
    return Response.json({ scenario: buildScenarioSnapshot(state, input) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
