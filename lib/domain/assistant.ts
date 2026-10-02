import { DomainError } from "./workflow";

export type AssistantHistoryItem = { question: string; answer: string };
export type AssistantLanguage = "id" | "en";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INDONESIAN_WORDS = /\b(apa|apakah|berapa|brp|bagaimana|gimana|kenapa|mengapa|tolong|mohon|cari|carikan|tampilkan|jelaskan|adakah|yang|untuk|dengan|dari|bisa|punya|bahasa|riwayat|peralatan|pompa|tekanan|suhu|aliran|vibrasi|spesifikasi|dokumen|tertinggi|terkait|sebelumnya)\b/i;

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.replace(CONTROL_CHARACTERS, "").trim().slice(0, maximum) : "";
}

export function sanitizeAssistantQuestion(value: unknown) {
  if (typeof value !== "string" || value.length > 2_000) throw new DomainError("Enter a question under 2,000 characters.");
  const question = cleanText(value, 2_000);
  if (!question) throw new DomainError("Enter a question under 2,000 characters.");
  return question;
}

export function sanitizeAssistantHistory(value: unknown): AssistantHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-3).map(item => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { question: cleanText(record.question, 500), answer: cleanText(record.answer, 1_000) };
  }).filter(item => item.question && item.answer);
}

export function assistantLanguage(question: string): AssistantLanguage {
  return INDONESIAN_WORDS.test(question) ? "id" : "en";
}

export function validCandraScope(value: unknown, equipmentIds: Iterable<string>) {
  if (value === "all") return "all";
  const allowed = new Set(equipmentIds);
  return typeof value === "string" && allowed.has(value) ? value : "all";
}
