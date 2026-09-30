import { snapshot } from "@/lib/data/store";
import { checkOrigin, readJson, apiError } from "@/lib/data/http";
import { answerQuestion } from "@/lib/domain/retrieval";
import { DomainError } from "@/lib/domain/workflow";
import { geminiEnabled, groundedGeminiAnswer, groundedGeminiDatabaseAnswer } from "@/lib/gemini/grounding";
import { supabaseServer } from "@/lib/supabase/server";

const geminiWindows = new Map<string, { started: number; count: number }>();
function reserveGeminiRequest(actorId: string) {
  const now = Date.now(); const prior = geminiWindows.get(actorId);
  const window = !prior || now - prior.started >= 60_000 ? { started: now, count: 0 } : prior;
  if (window.count >= 10) throw new DomainError("Gemini question limit reached. Try again in a minute.", 429);
  window.count += 1; geminiWindows.set(actorId, window);
  if (geminiWindows.size > 1_000) for (const [id, item] of geminiWindows) if (now - item.started >= 60_000) geminiWindows.delete(id);
}
export async function POST(request: Request) {
  try { checkOrigin(request); const { state, actor } = await snapshot(); const data = await readJson(request);
    if (typeof data.question !== "string" || data.question.length > 2000 || !data.question.trim()) throw new DomainError("Enter a question under 2,000 characters.");
    const equipmentId = String(data.equipmentId); const broad = data.broad === true;
    const direct = answerQuestion(state, data.question, equipmentId, broad);
    if (!geminiEnabled() || /trend|live|temperature over|thermal profile/i.test(data.question)) return Response.json(direct, { headers: { "Cache-Control": "private, no-store" } });
    reserveGeminiRequest(actor.id);
    let answer;
    try {
      answer = actor.mode === "connected"
        ? await groundedGeminiDatabaseAnswer(state, await supabaseServer(), data.question, equipmentId, broad, request.signal)
        : await groundedGeminiAnswer(state, data.question, equipmentId, broad, request.signal);
    }
    catch (error) { console.error("Gemini request failed", error); throw new DomainError("Gemini is configured but unavailable. No generated answer was returned; you can still inspect sources directly.", 503); }
    return Response.json(answer ?? direct, { headers: { "Cache-Control": "private, no-store" } });
  } catch(e) { return apiError(e); }
}
