import type { AuthorizedPassage } from "./providers";
import type { HubState } from "./types";
import { parameterStatus } from "./control-room";
import { eligible } from "./workflow";

const TERM_EXPANSIONS: Record<string, string[]> = {
  alat: ["equipment", "asset"], peralatan: ["equipment", "asset"], equipment: ["peralatan", "asset"],
  pompa: ["pump"], pump: ["pompa"], kompresor: ["compressor"], compressor: ["kompresor"],
  reaktor: ["reactor"], reactor: ["reaktor"], pengering: ["dryer"], dryer: ["pengering"],
  pemanas: ["heater"], heater: ["pemanas"], katup: ["valve"], valve: ["katup"],
  pendingin: ["cooling", "tower"], menara: ["tower"], akumulator: ["accumulator", "drum"],
  lokasi: ["location", "plot", "area"], dimana: ["location", "plot", "area"], where: ["location", "plot", "area"],
  dokumen: ["document", "source", "reference"], sumber: ["source", "document", "reference"],
  spesifikasi: ["specification", "datasheet"], spes: ["specification", "datasheet"],
  aliran: ["flow"], debit: ["flow"], tekanan: ["pressure", "head"], suhu: ["temperature"],
  getaran: ["vibration"], vibrasi: ["vibration"], riwayat: ["history", "maintenance", "work", "order"],
  kerusakan: ["failure", "incident"], kegagalan: ["failure", "incident"], penyebab: ["cause"],
  prosedur: ["procedure", "opl"], langkah: ["procedure", "step", "opl"], mulai: ["startup", "priming"],
  proteksi: ["protection", "interlock", "trip"], jumlah: ["count", "inventory", "sets"],
  berapa: ["count", "inventory", "sets"], brp: ["count", "inventory", "sets"],
  prioritas: ["priority"], deviasi: ["deviation"], batas: ["limit", "threshold"], normal: ["normal"],
};

export function knowledgeQueryTerms(question: string) {
  const raw = question.toLowerCase().split(/[^a-z0-9-]+/).filter(term => term.length > 2);
  const expanded = raw.flatMap(term => /^berpa\w*$/.test(term) ? [term, "berapa", "count", "inventory", "sets"] : [term, ...(TERM_EXPANSIONS[term] ?? [])]);
  return [...new Set(expanded)];
}

function score(text: string, query: string[]) {
  const normalized = text.toLowerCase();
  return query.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0);
}

function categoryBoost(passage: AuthorizedPassage, query: string[]) {
  const has = (...terms: string[]) => terms.some(term => query.includes(term));
  if (passage.category === "equipment_catalog" && has("equipment", "asset", "inventory", "sets", "location", "pump", "compressor", "reactor", "dryer", "heater", "valve", "cooling", "tower", "accumulator", "drum")) return 4;
  if ((passage.category === "source_catalog" || passage.category === "approved_reference") && has("document", "source", "reference", "datasheet", "procedure", "opl", "interlock", "plot")) return 4;
  if (passage.category === "historical_record" && has("history", "maintenance", "failure", "incident", "vibration", "cause")) return 4;
  if (passage.category === "governed_parameter" && has("parameter", "flow", "pressure", "head", "temperature", "priority", "deviation", "limit", "threshold")) return 4;
  return 0;
}

export function clipPassage(text: string, limit = 6000) {
  return text.length > limit ? text.slice(0, limit) + "\n[passage truncated by server]" : text;
}

export function buildAuthorizedPassages(state: HubState, question: string, equipmentId: string, broad: boolean): AuthorizedPassage[] {
  const query = knowledgeQueryTerms(question); const candidates: AuthorizedPassage[] = [];
  const scopedEquipment = state.equipment.filter(item => broad || item.id === equipmentId);
  const inventory = state.equipment.map(item => `Set ${item.set}: ${item.tag} — ${item.name}; location ${item.location || "not recorded"}; area ${item.area}`).join("\n");
  candidates.push({ id: "inventory:equipment", versionId: "workspace-equipment-inventory", equipmentIds: state.equipment.map(item => item.id), extractionRunId: "workspace-snapshot", page: 1,
    category: "equipment_catalog", text: `Knowledge Hub equipment inventory. Count: ${state.equipment.length} equipment sets.\n${inventory}\nThis is the current workspace inventory, not the complete plant asset register.`, citation: { id: "inventory:equipment", label: "Knowledge Hub equipment inventory", locator: `${state.equipment.length} accessible sets · current workspace snapshot`, href: "/equipment" } });
  for (const item of scopedEquipment) {
    const sourceCount = state.documents.filter(doc => doc.equipmentIds.includes(item.id) && doc.applicability !== "superseded" && doc.publication !== "withdrawn").length;
    const parameterCount = (state.parameters ?? []).filter(parameter => parameter.equipmentId === item.id).length;
    const historyCount = state.history.filter(record => record.equipmentId === item.id).length;
    candidates.push({ id: `equipment:${item.id}`, versionId: item.id, equipmentIds: [item.id], extractionRunId: "workspace-snapshot", page: 1,
      category: "equipment_catalog", text: `Equipment set ${item.set}. Tag: ${item.tag}. Name: ${item.name}. Location: ${item.location || "not recorded"}. Area: ${item.area}. Accessible source records: ${sourceCount}. Governed parameters: ${parameterCount}. Imported maintenance records: ${historyCount}. Counts describe the current workspace only.`, citation: { id: item.id, label: `${item.tag} · ${item.name}`, locator: `Set ${item.set} · equipment master`, href: `/equipment/${item.id}` } });
  }
  for (const item of state.parameters ?? []) {
    if (!broad && item.equipmentId !== equipmentId) continue;
    const equipment = state.equipment.find(asset => asset.id === item.equipmentId);
    const status = parameterStatus(item, item.currentValue);
    candidates.push({ id: `parameter:${item.id}`, versionId: item.id, equipmentIds: [item.equipmentId], extractionRunId: "workbook-import-reviewed", page: 1,
      category: "governed_parameter", text: clipPassage(`Equipment: ${equipment?.tag ?? item.equipmentId}\nInstrument: ${item.instrumentTag}\nParameter: ${item.name}\nReview status: ${item.reviewStatus}\nCurrent imported scenario value: ${item.currentValue ?? "not available"} ${item.unit}\nBase value: ${item.baseValue ?? "not available"} ${item.unit}\nNormal envelope: ${item.normalMin ?? "not available"} to ${item.normalMax ?? "not available"} ${item.unit}\nAdvisory: ${item.advisory ?? "not available"}\nCritical: ${item.critical ?? "not available"}\nCalculated status: ${status}\nSIL: ${item.sil}\nVoting: ${item.voting}\nSource class: ${item.sourceClass}\nEngineering note: ${item.engineeringNote}\nData mode: ${item.dataMode}. This is imported workbook/scenario data, not live telemetry. Candidate values are not approved plant setpoints.`), citation: { id: item.id, label: `${equipment?.tag ?? item.equipmentId} · ${item.instrumentTag}`, locator: `${item.sourceDocument} · ${item.sourceLocator} · ${item.sourceClass} · ${item.reviewStatus}`, href: `/equipment/${item.equipmentId}` } });
  }
  for (const doc of state.documents) {
    if ((!broad && !doc.equipmentIds.includes(equipmentId)) || doc.applicability === "superseded" || doc.publication === "withdrawn") continue;
    const lifecycle = `review ${doc.review}; publication ${doc.publication}; indexing ${doc.indexing}; applicability ${doc.applicability}`;
    if (eligible(doc) && doc.text.trim()) {
      candidates.push({ id: `document:${doc.id}:page:1`, versionId: doc.id, equipmentIds: doc.equipmentIds, extractionRunId: `text:${doc.id}`, page: 1,
        category: "approved_reference", text: clipPassage(doc.text), citation: { id: doc.id, label: doc.number || doc.title, locator: `Rev ${doc.revision ?? "not recorded"} · page 1 · approved/current`, href: `/documents/${doc.documentId}/versions/${doc.id}` } });
    } else {
      candidates.push({ id: `source-catalog:${doc.id}`, versionId: doc.id, equipmentIds: doc.equipmentIds, extractionRunId: "source-catalog-metadata", page: 1,
        category: "source_catalog", text: `Source catalog metadata only. Document: ${doc.number || "number not recorded"}. Title: ${doc.title}. Type: ${doc.type}. Revision: ${doc.revision ?? "not recorded"}. Governance: ${lifecycle}. This passage proves only that the source record exists; it does not expose or approve its technical content.`, citation: { id: doc.id, label: doc.number || doc.title, locator: `Rev ${doc.revision ?? "not recorded"} · ${lifecycle}`, href: `/documents/${doc.documentId}/versions/${doc.id}` } });
    }
  }
  for (const item of state.cases) {
    if (item.status !== "verified_closed" || item.knowledge !== "ready" || (!broad && item.equipmentId !== equipmentId)) continue;
    candidates.push({ id: `case:${item.id}:closure:${item.closureRevision}`, versionId: item.id, equipmentIds: [item.equipmentId], extractionRunId: `closure:${item.closureRevision}`, page: 1,
      category: "reviewed_case", text: clipPassage(`Symptom: ${item.symptom}\nCause status: ${item.causeStatus}\nConfirmed cause: ${item.cause ?? "not established"}\nAction: ${item.action}\nOutcome: ${item.outcome}\nLesson: ${item.lesson}\nEvidence: ${item.evidence}`), citation: { id: item.id, label: item.title, locator: `Verified closure · revision ${item.closureRevision}`, href: `/cases/${item.id}` } });
  }
  for (const item of state.history) {
    if (!broad && item.equipmentId !== equipmentId) continue;
    candidates.push({ id: `history:${item.id}`, versionId: item.id, equipmentIds: [item.equipmentId], extractionRunId: "imported-workbook", page: 1,
      category: "historical_record", text: clipPassage(`Work order: ${item.wo}\nDate: ${item.date}\nSymptom: ${item.symptom}\nSource-recorded cause: ${item.cause || "not recorded"}\nAction: ${item.action || "not recorded"}\nDowntime: ${item.downtime ?? "not recorded"}\nCost: ${item.cost ?? "not recorded"}`), citation: { id: item.id, label: item.wo, locator: item.source.split(" | ")[1] || "Maintenance workbook", href: `/cases/${item.id}` } });
  }
  return candidates.map(passage => ({ passage, relevance: score(`${passage.citation.label} ${passage.text}`, query) + categoryBoost(passage, query) }))
    .filter(item => item.relevance > 0 || query.length === 0).sort((a, b) => b.relevance - a.relevance).slice(0, 6).map(item => item.passage);
}
