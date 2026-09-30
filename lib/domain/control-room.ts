import parameterSeed from "@/data/control-room-parameters.json";
import type { EquipmentParameter, HubState, ParameterStatus } from "./types";

export type ScenarioMode = "ideal" | "non-ideal";

export function parameterRegistry(state: HubState): EquipmentParameter[] {
  return (state.parameters?.length ? state.parameters : parameterSeed) as EquipmentParameter[];
}

export function scenarioValue(parameter: EquipmentParameter, mode: ScenarioMode, loadFactor: number, manual?: number) {
  if (manual !== undefined && Number.isFinite(manual)) return manual;
  if (mode === "ideal") return parameter.baseValue;
  if (parameter.modelDriver === "LOAD" && parameter.baseValue !== null) return parameter.baseValue * loadFactor;
  return parameter.currentValue;
}

export function parameterStatus(parameter: EquipmentParameter, actual: number | null): ParameterStatus {
  if (actual === null || parameter.normalMin === null || parameter.normalMax === null) return "blocked";
  if (parameter.direction === "LOW" && parameter.critical !== null && actual < parameter.critical) return "critical";
  if (parameter.direction === "HIGH" && parameter.critical !== null && actual > parameter.critical) return "critical";
  if (actual < parameter.normalMin || actual > parameter.normalMax) return "advisory";
  return "normal";
}

export function envelopePercent(parameter: EquipmentParameter, actual: number | null) {
  if (actual === null || parameter.normalMin === null || parameter.normalMax === null || parameter.normalMax === parameter.normalMin) return null;
  return ((actual - parameter.normalMin) / (parameter.normalMax - parameter.normalMin)) * 100;
}

export function equipmentParameterState(parameters: EquipmentParameter[], equipmentId: string, mode: ScenarioMode, loadFactor: number, manual: Record<string, number> = {}) {
  const evaluated = parameters.filter(item => item.equipmentId === equipmentId).map(parameter => {
    const actual = scenarioValue(parameter, mode, loadFactor, manual[parameter.id]);
    return { parameter, actual, status: parameterStatus(parameter, actual), envelope: envelopePercent(parameter, actual) };
  });
  const status: ParameterStatus = evaluated.some(item => item.status === "critical") ? "critical" : evaluated.some(item => item.status === "advisory") ? "advisory" : evaluated.every(item => item.status === "blocked") ? "blocked" : "normal";
  const score21 = evaluated.length ? evaluated.reduce((sum, item) => sum + item.parameter.priority21, 0) / evaluated.length : 0;
  return { status, evaluated, score21, score10: Math.min(10, score21 / 2.1) };
}

export function parameterStatusLabel(status: ParameterStatus) {
  return status === "normal" ? "Normal" : status === "advisory" ? "Advisory" : status === "critical" ? "Critical" : "Blocked";
}
