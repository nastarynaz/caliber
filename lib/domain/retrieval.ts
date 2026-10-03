import type { Answer, HubState } from "./types";
import { eligible } from "./workflow";
import { parameterStatus, type ScenarioSnapshot } from "./control-room";
import { assistantLanguage } from "./assistant";

function attentionAnswer(state: HubState, question: string, equipmentId: string, broad: boolean, scenario?: ScenarioSnapshot): Answer {
  const indonesian = assistantLanguage(question) === "id";
  const scenarioRequested = Boolean(scenario && /what[ -]?if|skenario|scenario|ideal|non[ -]?ideal|simulasi|simulation/i.test(question));
  const scopedIds = new Set(broad ? state.equipment.map(item => item.id) : [equipmentId]);
  const evaluated = scenarioRequested && scenario
    ? scenario.parameters.filter(item => scopedIds.has(item.parameter.equipmentId)).map(item => ({ parameter: item.parameter, value: item.simulated, status: item.status }))
    : (state.parameters ?? []).filter(item => scopedIds.has(item.equipmentId)).map(parameter => ({ parameter, value: parameter.currentValue, status: parameterStatus(parameter, parameter.currentValue) }));
  const abnormal = evaluated.filter(item => item.status === "critical" || item.status === "advisory").sort((a, b) => (a.status === "critical" ? -1 : 1) - (b.status === "critical" ? -1 : 1) || b.parameter.priority21 - a.parameter.priority21);
  const blocked = evaluated.filter(item => item.status === "blocked");
  const openCases = state.cases.filter(item => scopedIds.has(item.equipmentId) && item.status !== "verified_closed");
  const affected = [...new Set([...abnormal.map(item => item.parameter.equipmentId), ...openCases.map(item => item.equipmentId)])];
  const evidence = abnormal.map(item => {
    const asset = state.equipment.find(equipment => equipment.id === item.parameter.equipmentId);
    return `${asset?.tag ?? item.parameter.equipmentId} · ${item.parameter.instrumentTag}: ${item.value ?? "not available"} ${item.parameter.unit}; normal ${item.parameter.normalMin ?? "not available"}–${item.parameter.normalMax ?? "not available"}; ${item.status}; priority ${item.parameter.priority21}/21. Verifikasi: ${item.parameter.engineeringNote}`;
  });
  evidence.push(...openCases.map(item => { const asset = state.equipment.find(equipment => equipment.id === item.equipmentId); return `${asset?.tag ?? item.equipmentId} · open case ${item.id}: ${item.title} (${item.status}).`; }));
  if (blocked.length) evidence.push(`${blocked.length} parameter tidak dapat dinilai karena nilai atau batas normal belum lengkap: ${blocked.slice(0, 5).map(item => item.parameter.instrumentTag).join(", ")}${blocked.length > 5 ? ", …" : ""}.`);
  const tags = affected.map(id => state.equipment.find(item => item.id === id)?.tag ?? id);
  const scopeText = broad ? (indonesian ? "semua peralatan" : "all equipment") : state.equipment.find(item => item.id === equipmentId)?.tag ?? equipmentId;
  return {
    label: scenarioRequested ? (indonesian ? "Perhatian skenario What-if" : "What-if scenario attention") : (indonesian ? "Perhatian peralatan saat ini" : "Current equipment attention"),
    provider: scenarioRequested ? "Evaluasi skenario deterministik" : "Evaluasi parameter deterministik",
    text: affected.length
      ? (indonesian ? `${tags.join(", ")} memerlukan perhatian pada cakupan ${scopeText}. Ditemukan ${abnormal.length} deviasi parameter dan ${openCases.length} kasus aktif.` : `${tags.join(", ")} require attention in the ${scopeText} scope. ${abnormal.length} parameter deviations and ${openCases.length} active cases were found.`)
      : (indonesian ? `Tidak ada deviasi parameter atau kasus aktif yang terdeteksi pada cakupan ${scopeText}.` : `No parameter deviation or active case was detected in the ${scopeText} scope.`),
    evidence: evidence.join("\n") || (indonesian ? "Semua parameter yang dapat dinilai berada dalam envelope normal." : "All assessable parameters are within their normal envelopes."),
    limitations: scenarioRequested
      ? (indonesian ? "Hasil ini adalah simulasi screening, bukan kondisi plant aktual. Tidak ada output kontrol ke DCS/PLC/SIS dan tidak ada cascade yang diasumsikan tanpa aturan yang disetujui." : "This is a screening simulation, not actual plant condition. No control output is sent and no cascade is inferred without an approved rule.")
      : (indonesian ? "Status dihitung dari nilai workbook yang diimpor, bukan telemetry DCS/SIS langsung. Verifikasi kondisi lapangan dan sumber terkendali sebelum bertindak." : "Status is calculated from imported workbook values, not live DCS/SIS telemetry. Verify field conditions and controlled sources before acting."),
    citations: abnormal.slice(0, 8).map(item => { const asset = state.equipment.find(equipment => equipment.id === item.parameter.equipmentId); return { id: item.parameter.id, label: `${asset?.tag ?? item.parameter.equipmentId} · ${item.parameter.instrumentTag}`, locator: `${item.parameter.sourceLocator} · ${item.parameter.sourceClass}`, href: `/equipment/${item.parameter.equipmentId}` }; }),
    conflict: false,
  };
}

export function answerQuestion(state: HubState, question: string, equipmentId: string, broad = false, scenario?: ScenarioSnapshot): Answer {
  const q = question.trim().toLowerCase();
  const base: Answer = { label: "Insufficient evidence", text: "The accessible sources do not establish an answer to this question.", evidence: "No supported claim was generated.", limitations: "Keyword retrieval only. Refine your question or supply an observation for review.", citations: [], conflict: false, provider: "Deterministic retrieval" };
  const cleaned = q.replace(/[?!.,;]/g, "").trim();
  if (/^(h(i|ey|ello|alo)|hai|pagi|siang|sore|malam|assalamu['\s]?alaikum|selamat (pagi|siang|sore|malam))(\s+(mas\s+)?candra)?$/i.test(cleaned) ||
      /^(siapa\s+(kamu|anda|mas\s+candra|candra)|who\s+are\s+you|what\s+can\s+you\s+do|kamu\s+(siapa|bisa\s+apa)|bisa\s+bantu\s+apa|bantu\s+apa|ada\s+apa)$/i.test(cleaned) ||
      /^(mas\s+)?candra(\s+(bisa\s+bantu\s+apa|siapa|tolong))?$/i.test(cleaned)) {
    return {
      ...base,
      label: "Asisten AI Siaga",
      provider: "Mas Candra · AI Assistant",
      text: "Halo! Saya Mas Candra, asisten AI untuk Chandra Asri Manufacturing Knowledge Hub. Saya siap membantu Anda menelusuri spesifikasi peralatan, dokumen teknis (P&ID, Datasheet), riwayat maintenance, dan parameter operasional pabrik. Silakan tanyakan hal teknis seputar peralatan (contoh: 'Spesifikasi GA-1201A' atau 'Riwayat vibrasi pompa').",
      evidence: "Tersedia 8 unit equipment (Set 01 GA-1201A s.d. Set 08 FA-8901), dokumen P&ID, Datasheet, interlock sequence, dan riwayat maintenance.",
      limitations: "Rekomendasi bersifat asisten teknis; verifikasi selalu kondisi aktual dan SOP operasional sebelum mengambil tindakan di lapangan.",
    };
  }
  const asksForEquipmentCount = /\bhow many\b.*\b(sets?|equipment)\b/i.test(cleaned) ||
    /\b(sets?|equipment)\b.*\bhow many\b/i.test(cleaned) ||
    /\b(ada|jumlah|total|berapa|berpa\w*|brp)\b.*\b(sets?|equipment|peralatan)\b/i.test(cleaned) ||
    /\b(sets?|equipment|peralatan)\b.*\b(jumlah|total|berapa|berpa\w*|brp)\b/i.test(cleaned);
  const asksForEquipmentList = /\b(apa saja|daftar|list|sebutkan|show|which)\b.*\b(sets?|equipment|peralatan)\b/i.test(cleaned) ||
    /\b(sets?|equipment|peralatan)\b.*\b(apa saja|daftar|list|tersedia|available)\b/i.test(cleaned);
  if (asksForEquipmentCount || asksForEquipmentList) {
    const indonesian = assistantLanguage(question) === "id";
    return {
      ...base,
      label: indonesian ? "Inventaris peralatan" : "Equipment inventory",
      provider: indonesian ? "Inventaris Knowledge Hub" : "Knowledge Hub inventory",
      text: indonesian ? `Ada ${state.equipment.length} set peralatan di Knowledge Hub ini.` : `There are ${state.equipment.length} equipment sets in this Knowledge Hub.`,
      evidence: state.equipment.map(item => `Set ${item.set} · ${item.tag} · ${item.name}`).join("\n"),
      limitations: indonesian ? "Jumlah ini berasal dari inventaris workspace saat ini, bukan inventaris aset pabrik secara keseluruhan." : "This count reflects the current workspace inventory, not the complete plant asset inventory.",
    };
  }
  if (!state.equipment.some(e => e.id === equipmentId)) return { ...base, text: "Choose equipment to establish your question's scope." };
  const asksForAttention = /trouble|problem|masalah|bermasalah|abnormal|deviasi|deviation|warning|alarm|advisory|critical|kritis|blocked|perhatian|resolve|diselesaikan|verifikasi|current parameter|parameter sekarang|current condition|kondisi saat ini|highest priority|prioritas tertinggi/i.test(cleaned);
  if (asksForAttention) return attentionAnswer(state, question, equipmentId, broad, scenario);
  if (/\b(lokasi|dimana|where|location)\b/i.test(cleaned)) {
    const requested = state.equipment.find(item => cleaned.includes(item.tag.toLowerCase())) ?? state.equipment.find(item => item.id === equipmentId)!;
    const indonesian = assistantLanguage(question) === "id";
    return { ...base, label: indonesian ? "Identitas peralatan" : "Equipment identity", provider: indonesian ? "Inventaris Knowledge Hub" : "Knowledge Hub inventory",
      text: indonesian ? `${requested.tag} (${requested.name}) tercatat di lokasi ${requested.location || "yang belum dicatat"}, area ${requested.area}.` : `${requested.tag} (${requested.name}) is recorded at ${requested.location || "an unrecorded location"}, area ${requested.area}.`,
      evidence: `Set ${requested.set} · ${requested.tag} · ${requested.name} · ${requested.location || "location not recorded"} · ${requested.area}`,
      limitations: indonesian ? "Lokasi berasal dari master equipment workspace, bukan verifikasi posisi fisik atau data lokasi langsung." : "Location comes from the workspace equipment master, not physical-position verification or live location data.",
      citations: [{ id: requested.id, label: `${requested.tag} · ${requested.name}`, locator: `Set ${requested.set} · equipment master`, href: `/equipment/${requested.id}` }], view: requested.id };
  }
  const docs = state.documents.filter(d => d.applicability !== "superseded" && d.publication !== "withdrawn" && (broad || d.equipmentIds.includes(equipmentId)));
  if (/parameter|deviation|threshold|limit|priority|normal|critical|advisory|sil|voting/.test(q) && state.parameters?.length) {
    const terms = q.split(/\W+/).filter(t => t.length > 2);
    const scoped = state.parameters.filter(item => broad || item.equipmentId === equipmentId);
    const ranked = scoped.map(item => ({ item, status: parameterStatus(item, item.currentValue), relevance: terms.filter(term => `${item.instrumentTag} ${item.name} ${item.sourceClass}`.toLowerCase().includes(term)).length }))
      .filter(entry => /priority|deviation|critical|advisory/.test(q) ? entry.status === "critical" || entry.status === "advisory" : entry.relevance > 0)
      .sort((a, b) => b.item.priority21 - a.item.priority21 || b.relevance - a.relevance).slice(0, 5);
    if (ranked.length) return { ...base, label: "Partially supported", text: "The parameter registry contains relevant imported scenario values. These are workbook values, not live DCS readings or approved plant setpoints.", evidence: ranked.map(({ item, status }) => { const asset = state.equipment.find(equipment => equipment.id === item.equipmentId); return `${asset?.tag ?? item.equipmentId} · ${item.instrumentTag}: ${item.currentValue ?? "not available"} ${item.unit}; normal ${item.normalMin ?? "not available"}–${item.normalMax ?? "not available"}; ${status}; priority ${item.priority21}/21; ${item.reviewStatus}.`; }).join("\n"), limitations: "Status is calculated deterministically from the imported threshold record. Candidate, training, screening, and blocked values are not operational authority.", citations: ranked.map(({ item }) => { const asset = state.equipment.find(equipment => equipment.id === item.equipmentId); return { id: item.id, label: `${asset?.tag ?? item.equipmentId} · ${item.instrumentTag}`, locator: `${item.sourceLocator} · ${item.sourceClass} · ${item.reviewStatus}`, href: `/equipment/${item.equipmentId}` }; }), conflict: false };
  }
  if (/trend|live|temperature over|thermal profile/.test(q)) return { ...base, text: "No timestamped operating measurements are available. A measured trend cannot be produced.", evidence: "Datasheet values are specifications, not sensor readings.", limitations: "Connect and validate a measurement source before plotting an operating trend." };
  if (/history|failure|vibrat|noise|seal|troubleshoot|incident/.test(q)) {
    const terms = q.split(/\W+/).filter(t => t.length > 3);
    const matches = state.history.filter(h => (broad || h.equipmentId === equipmentId) && terms.some(t => `${h.symptom} ${h.cause} ${h.action}`.toLowerCase().includes(t))).slice(0, 3);
    const reviewed = state.cases.filter(c => (broad || c.equipmentId === equipmentId) && c.status === "verified_closed" && c.knowledge === "ready" && terms.some(t => `${c.title} ${c.symptom} ${c.lesson}`.toLowerCase().includes(t))).slice(0, 2);
    if (!matches.length && !reviewed.length) return { ...base, text: "No matching history in your accessible sources. Continue with technical references and record your investigation.", view: "history" };
    return { ...base, label: "Historical evidence", text: "These previous cases may help frame your investigation. Historical causes do not establish the cause of the current symptom.", evidence: [...reviewed.map(c => `${c.title}: ${c.outcome}`), ...matches.map(h => `${h.wo}: ${h.symptom}. Source-recorded cause: ${h.cause}.`)].join("\n\n"), limitations: "Imported work orders are CALIBER sample records, not independently reverified Hub closures. Verify applicability before acting.", citations: [...reviewed.map(c => ({ id: c.id, label: c.title, locator: "Verified case", href: `/cases/${c.id}` })), ...matches.map(h => ({ id: h.id, label: h.wo, locator: h.source.split(" | ")[1] || "Workbook record", href: `/cases/${h.id}` }))], view: "history" };
  }
  const type = /prim|start.?up/.test(q) ? "06" : /location|where|plot/.test(q) ? "PLOT" : /interlock|trip|protection/.test(q) ? "INTERLOCK" : /p&id|connection|process/.test(q) ? "PID" : /spec|flow|head|motor|datasheet/.test(q) ? "DATASHEET" : null;
  const terms = q.split(/\W+/).filter(t => t.length > 3);
  const matches = docs.filter(d => type === "06" ? d.number.endsWith("-06") : type ? d.type.includes(type) : terms.some(t => `${d.title} ${d.number}`.toLowerCase().includes(t))).slice(0, 3);
  if (!matches.length) return base;
  const conflict = state.issues.some(i => i.status === "open" && i.sourceIds.some(id => matches.some(d => d.id === id)));
  return { ...base, label: conflict ? "Conflicting references" : matches.some(eligible) ? "Approved source located" : "Source awaits review", text: conflict ? "A source issue is under review. Disputed claims remain unresolved; inspect the linked evidence." : matches.some(eligible) ? "An applicable, approved reference is available. Open the exact page to verify its procedure or specification." : "The relevant source has not completed metadata confirmation, technical review, and publication. It is not an approved operating instruction in this hub.", evidence: matches.map(d => `${d.number} — ${d.title}; revision ${d.revision ?? "not recorded"}.`).join("\n"), limitations: "No technical instruction or unverified threshold was generated. Training data is not operational authorization.", citations: matches.map(d => ({ id: d.id, label: d.number, locator: `Rev ${d.revision ?? "not recorded"} · page 1`, href: `/documents/${d.documentId}/versions/${d.id}` })), view: matches[0].id, conflict };
}
