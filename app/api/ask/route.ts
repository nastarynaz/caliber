import { snapshot } from "@/lib/data/store";
import { checkOrigin, readJson, apiError } from "@/lib/data/http";
import { answerQuestion } from "@/lib/domain/retrieval";
import { DomainError } from "@/lib/domain/workflow";
import { geminiEnabled, groundedGeminiAnswer, groundedGeminiDatabaseAnswer } from "@/lib/gemini/grounding";
import { supabaseServer } from "@/lib/supabase/server";
import { assistantLanguage, sanitizeAssistantHistory, sanitizeAssistantQuestion } from "@/lib/domain/assistant";
import type { Answer } from "@/lib/domain/types";

function indonesianFallback(answer: Answer): Answer {
  const labels: Record<string, string> = {
    "Insufficient evidence": "Bukti belum cukup",
    "Partially supported": "Didukung sebagian",
    "Historical evidence": "Bukti historis",
    "Conflicting references": "Referensi bertentangan",
    "Approved source located": "Sumber yang disetujui ditemukan",
    "Source awaits review": "Sumber menunggu tinjauan",
  };
  const text: Record<string, string> = {
    "Insufficient evidence": "Sumber yang dapat Anda akses belum cukup untuk menjawab pertanyaan ini.",
    "Partially supported": "Registri parameter memuat nilai skenario yang relevan. Nilai ini berasal dari workbook, bukan pembacaan DCS langsung atau setpoint pabrik yang telah disetujui.",
    "Historical evidence": "Kasus sebelumnya dapat membantu membingkai investigasi. Penyebab historis tidak menetapkan penyebab kondisi saat ini.",
    "Conflicting references": "Ada isu sumber yang masih ditinjau. Klaim yang diperselisihkan belum terselesaikan; periksa bukti yang ditautkan.",
    "Approved source located": "Referensi yang berlaku dan telah disetujui tersedia. Buka halaman sumber untuk memverifikasi prosedur atau spesifikasinya.",
    "Source awaits review": "Sumber terkait belum menyelesaikan konfirmasi metadata, tinjauan teknis, dan publikasi sehingga belum menjadi instruksi operasi yang disetujui.",
  };
  if (!labels[answer.label]) return answer;
  return {
    ...answer,
    label: labels[answer.label],
    text: text[answer.label] ?? answer.text,
    limitations: "Jawaban dibatasi pada sumber yang dapat Anda akses. Data pelatihan bukan otorisasi operasional; verifikasi sumber, revisi, dan kondisi lapangan sebelum bertindak.",
  };
}

const geminiWindows = new Map<string, { started: number; count: number }>();
function reserveGeminiRequest(actorId: string) {
  const now = Date.now(); const prior = geminiWindows.get(actorId);
  const window = !prior || now - prior.started >= 60_000 ? { started: now, count: 0 } : prior;
  if (window.count >= 10) throw new DomainError("Maaf Rekan, sistem sedang membatasi frekuensi pertanyaan. Silakan tunggu satu menit lalu coba lagi.", 429);
  window.count += 1; geminiWindows.set(actorId, window);
  if (geminiWindows.size > 1_000) for (const [id, item] of geminiWindows) if (now - item.started >= 60_000) geminiWindows.delete(id);
}
export async function POST(request: Request) {
  try { checkOrigin(request); const { state, actor } = await snapshot(); const data = await readJson(request);
    const cleanQuestion = sanitizeAssistantQuestion(data.question);
    const equipmentId = String(data.equipmentId); const broad = data.broad === true;
    if (!state.equipment.some(item => item.id === equipmentId)) throw new DomainError("Equipment scope is unavailable.", 404);
    const history = sanitizeAssistantHistory(data.history);
    const indonesian = assistantLanguage(cleanQuestion) === "id";
    const retrieved = answerQuestion(state, cleanQuestion, equipmentId, broad);
    const direct = indonesian ? indonesianFallback(retrieved) : retrieved;
    if (["Asisten AI Siaga", "Inventaris peralatan", "Equipment inventory"].includes(direct.label) || !geminiEnabled() || /trend|live|temperature over|thermal profile/i.test(cleanQuestion)) return Response.json(direct, { headers: { "Cache-Control": "private, no-store" } });
    reserveGeminiRequest(actor.id);
    let answer;
    try {
      answer = actor.mode === "connected"
        ? await groundedGeminiDatabaseAnswer(state, await supabaseServer(), cleanQuestion, equipmentId, broad, request.signal, history)
        : await groundedGeminiAnswer(state, cleanQuestion, equipmentId, broad, request.signal, history);
    }
    catch (error) {
      console.error("Gemini request failed; returning deterministic retrieval", error);
      answer = {
        ...direct,
        provider: indonesian ? "Retrieval deterministik · fallback Gemini" : "Deterministic retrieval · Gemini fallback",
        limitations: `${direct.limitations}\n${indonesian ? "Gemini sedang tidak tersedia; jawaban ini berasal dari retrieval deterministik pada sumber yang dapat Anda akses." : "Gemini is temporarily unavailable; this answer comes from deterministic retrieval over sources you can access."}`,
      };
    }
    return Response.json(answer ?? direct, { headers: { "Cache-Control": "private, no-store" } });
  } catch(e) {
    if (e instanceof DomainError && e.status === 429) return Response.json({ error: e.message }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } });
    return apiError(e);
  }
}
