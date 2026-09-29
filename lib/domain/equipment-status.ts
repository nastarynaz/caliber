import type { Equipment, HubState } from "./types";

export type EquipmentCondition = "healthy" | "attention" | "in_report" | "critical";
export type EquipmentConditionResult = { condition: EquipmentCondition; detail: string };

export function equipmentCondition(equipment: Equipment, state: HubState): EquipmentConditionResult {
  const openCase = state.cases.find(item => item.equipmentId === equipment.id && item.status !== "verified_closed");
  if (openCase && /critical|trip|shutdown|fire|leak|high-high|emergency/i.test(`${openCase.title} ${openCase.symptom}`)) {
    return { condition: "critical", detail: `Critical wording in active report: ${openCase.title}` };
  }
  if (openCase) return { condition: "in_report", detail: `Active report: ${openCase.title}` };
  const documents = state.documents.filter(document => document.equipmentIds.includes(equipment.id));
  const documentIds = new Set(documents.map(document => document.id));
  const openIssue = state.issues.some(issue => issue.status === "open" && issue.sourceIds.some(id => documentIds.has(id)));
  if (openIssue || documents.some(document => document.processing === "failed" || document.indexing === "failed")) {
    return { condition: "attention", detail: openIssue ? "Open technical-owner review" : "Source processing needs attention" };
  }
  return { condition: "healthy", detail: "No active condition report in the Hub; not a live DCS measurement" };
}
