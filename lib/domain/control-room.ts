import parameterSeed from "@/data/control-room-parameters.json";
import type { EquipmentParameter, HubState, ParameterStatus } from "./types";
import { DomainError } from "./workflow";

export type ScenarioMode = "baseline" | "ideal" | "non-ideal";
export type ScenarioInput = { mode: ScenarioMode; loadFactor: number; manualOverrides: Record<string, number> };
export type ScenarioParameterResult = {
  parameter: EquipmentParameter; baseline: number | null; simulated: number | null; delta: number | null;
  baselineStatus: ParameterStatus; status: ParameterStatus; calculationMethod: string;
};
export type ScenarioEquipmentResult = {
  equipmentId: string; status: ParameterStatus; baselineStatus: ParameterStatus; parameters: ScenarioParameterResult[];
};
export type ScenarioSnapshot = {
  input: ScenarioInput; parameters: ScenarioParameterResult[]; equipment: ScenarioEquipmentResult[];
  counts: Record<ParameterStatus, number>; limitations: string[];
};

export const BASELINE_SCENARIO: ScenarioInput = { mode: "baseline", loadFactor: 1, manualOverrides: {} };

export function parameterRegistry(state: HubState): EquipmentParameter[] {
  return (state.parameters?.length ? state.parameters : parameterSeed) as EquipmentParameter[];
}

export function scenarioValue(parameter: EquipmentParameter, mode: ScenarioMode, loadFactor: number, manual?: number) {
  if (mode === "baseline") return parameter.currentValue;
  if (mode === "ideal") return parameter.baseValue;
  if (parameter.modelDriver === "LOAD" && parameter.baseValue !== null) return parameter.baseValue * loadFactor;
  if (parameter.modelDriver === "MANUAL" && manual !== undefined && Number.isFinite(manual)) return manual;
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

function aggregateStatus(statuses: ParameterStatus[]): ParameterStatus {
  if (statuses.some(status => status === "critical")) return "critical";
  if (statuses.some(status => status === "advisory")) return "advisory";
  if (statuses.length && statuses.every(status => status === "blocked")) return "blocked";
  return "normal";
}

export function equipmentParameterState(parameters: EquipmentParameter[], equipmentId: string, mode: ScenarioMode, loadFactor: number, manual: Record<string, number> = {}) {
  const evaluated = parameters.filter(item => item.equipmentId === equipmentId).map(parameter => {
    const actual = scenarioValue(parameter, mode, loadFactor, manual[parameter.id]);
    return { parameter, actual, status: parameterStatus(parameter, actual), envelope: envelopePercent(parameter, actual) };
  });
  const status = aggregateStatus(evaluated.map(item => item.status));
  const score21 = evaluated.length ? evaluated.reduce((sum, item) => sum + item.parameter.priority21, 0) / evaluated.length : 0;
  return { status, evaluated, score21, score10: Math.min(10, score21 / 2.1) };
}

export function sanitizeScenarioInput(raw: unknown, parameters: EquipmentParameter[]): ScenarioInput {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const mode = input.mode ?? "baseline";
  if (!(["baseline", "ideal", "non-ideal"] as unknown[]).includes(mode)) throw new DomainError("Unknown scenario mode.");
  const loadFactor = Number(input.loadFactor ?? 1);
  if (!Number.isFinite(loadFactor) || loadFactor < 0.1 || loadFactor > 10) throw new DomainError("Scenario load factor must be between 0.1 and 10.");
  const known = new Map(parameters.map(parameter => [parameter.id, parameter]));
  const source = input.manualOverrides && typeof input.manualOverrides === "object" ? input.manualOverrides as Record<string, unknown> : {};
  if (Object.keys(source).length > parameters.length) throw new DomainError("Too many scenario overrides.");
  const manualOverrides: Record<string, number> = {};
  for (const [id, rawValue] of Object.entries(source)) {
    const parameter = known.get(id);
    if (!parameter) throw new DomainError("Scenario override references an unknown parameter.");
    if (parameter.modelDriver !== "MANUAL") throw new DomainError("Only MANUAL parameters accept scenario overrides.");
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new DomainError("Scenario overrides must be finite numbers.");
    manualOverrides[id] = value;
  }
  return { mode: mode as ScenarioMode, loadFactor, manualOverrides };
}

export function buildScenarioSnapshot(state: HubState, requested: ScenarioInput): ScenarioSnapshot {
  const registry = parameterRegistry(state);
  const input = sanitizeScenarioInput(requested, registry);
  const parameters = registry.map(parameter => {
    const baseline = parameter.currentValue;
    const simulated = scenarioValue(parameter, input.mode, input.loadFactor, input.manualOverrides[parameter.id]);
    const calculationMethod = input.mode === "baseline" ? "Imported current value"
      : input.mode === "ideal" ? "Governed base value"
      : parameter.modelDriver === "LOAD" ? `Base × ${input.loadFactor.toFixed(2)} load factor`
      : parameter.modelDriver === "MANUAL" && parameter.id in input.manualOverrides ? "Manual scenario override"
      : `${parameter.modelDriver} held at imported current value`;
    return { parameter, baseline, simulated, delta: baseline === null || simulated === null ? null : simulated - baseline, baselineStatus: parameterStatus(parameter, baseline), status: parameterStatus(parameter, simulated), calculationMethod };
  });
  const equipment = state.equipment.map(asset => {
    const scoped = parameters.filter(item => item.parameter.equipmentId === asset.id);
    return { equipmentId: asset.id, status: aggregateStatus(scoped.map(item => item.status)), baselineStatus: aggregateStatus(scoped.map(item => item.baselineStatus)), parameters: scoped };
  });
  const counts = { normal: 0, advisory: 0, critical: 0, blocked: 0 } satisfies Record<ParameterStatus, number>;
  parameters.forEach(item => { counts[item.status] += 1; });
  return { input, parameters, equipment, counts, limitations: [
    "Screening simulation only; not live DCS/SIS telemetry and no control output is sent.",
    "Only explicit LOAD and MANUAL rules are calculated. CALCULATED and CONNECTOR values remain unchanged until an approved relationship or connector is configured.",
    "No downstream process cascade is inferred from the conceptual process map.",
  ] };
}

export function parameterStatusLabel(status: ParameterStatus) {
  return status === "normal" ? "Normal" : status === "advisory" ? "Advisory" : status === "critical" ? "Critical" : "Blocked";
}
