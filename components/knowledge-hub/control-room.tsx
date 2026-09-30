"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, ChevronDown, FileSearch, FlaskConical, RotateCcw, Save, ScanLine, ShieldCheck } from "lucide-react";
import type { Equipment, EquipmentParameter } from "@/lib/domain/types";
import { envelopePercent, equipmentParameterState, parameterRegistry, parameterStatus, parameterStatusLabel, scenarioValue, type ScenarioMode } from "@/lib/domain/control-room";
import { equipmentCondition, type EquipmentConditionResult } from "@/lib/domain/equipment-status";
import { useHub } from "./provider";
import { EquipmentProcessMap } from "./equipment-process-map";
import { EquipmentVisual } from "./equipment-visual";

const EMPTY_MANUAL: Record<string, number> = {};

function number(value: number | null, unit = "") { return value === null ? "Not available" : `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ""}`; }

function ParameterBullet({ parameter, actual }: { parameter: EquipmentParameter; actual: number | null }) {
  const envelope = envelopePercent(parameter, actual); const status = parameterStatus(parameter, actual);
  const plot = envelope === null ? 50 : Math.max(-20, Math.min(120, envelope));
  const left = ((plot + 20) / 140) * 100;
  return <button className="parameter-bullet" data-parameter-status={status} type="button" title={`${parameter.instrumentTag}: ${number(actual, parameter.unit)} · normal ${number(parameter.normalMin)}–${number(parameter.normalMax, parameter.unit)}`}>
    <span className="parameter-bullet-copy"><strong>{parameter.name}</strong><small className="mono">{parameter.instrumentTag}</small></span>
    <span className="parameter-bullet-track" aria-hidden="true"><i className="parameter-normal-band"/><i className="parameter-bullet-marker" style={{ left: `${left}%` }}/></span>
    <span className="parameter-bullet-value"><strong>{number(actual)}</strong><small>{parameter.unit}</small></span>
    <span className="parameter-bullet-state">{parameterStatusLabel(status)}</span>
  </button>;
}

function DeviationValue({ parameter, actual }: { parameter: EquipmentParameter; actual: number | null }) {
  const envelope = envelopePercent(parameter, actual);
  const plot = envelope === null ? 50 : Math.max(-20, Math.min(120, envelope));
  const left = ((plot + 20) / 140) * 100;
  return <div className="deviation-value"><strong>{number(actual, parameter.unit)}</strong><span className="deviation-range-plot" aria-hidden="true"><i/><b style={{ left: `${left}%` }}/></span><small>{envelope === null ? "Envelope unavailable" : `${envelope.toFixed(1)}% of normal envelope`}</small></div>;
}

function ReactorProfile({ parameters, values }: { parameters: EquipmentParameter[]; values: Map<string, number | null> }) {
  const points = parameters.filter(item => /^TE-3401-\d$/.test(item.instrumentTag)).sort((a, b) => a.instrumentTag.localeCompare(b.instrumentTag));
  if (!points.length) return null;
  const min = 170; const max = 240; const x = (index: number) => 44 + index * (512 / Math.max(1, points.length - 1)); const y = (value: number) => 198 - ((value - min) / (max - min)) * 160;
  const valid = points.map((item, index) => ({ item, index, value: values.get(item.id) })).filter((item): item is typeof item & { value: number } => item.value !== null && item.value !== undefined);
  const path = valid.map((item, index) => `${index ? "L" : "M"}${x(item.index)} ${y(item.value)}`).join(" ");
  return <div className="reactor-profile"><div className="parameter-graph-title"><div><strong>Eight-point bed temperature</strong><small>Actual values · no interpolation between sensors</small></div><span className="source-class">VERIFIED OPL / TRAINING C&amp;E</span></div>
    <svg viewBox="0 0 600 230" role="img" aria-label="DC-3401A eight-point reactor bed temperature profile">
      {[180, 210, 220, 230].map(limit => <g key={limit}><line x1="44" x2="556" y1={y(limit)} y2={y(limit)} className={`reactor-limit reactor-limit-${limit}`}/><text x="565" y={y(limit) + 4}>{limit}°</text></g>)}
      {path && <path d={path} className="reactor-profile-line"/>}
      {valid.map(({ item, index, value }) => <g key={item.id} tabIndex={0} aria-label={`${item.instrumentTag}, ${value} degrees Celsius`}><circle cx={x(index)} cy={y(value)} r="5" className="reactor-profile-point"/><text x={x(index)} y="218" textAnchor="middle">{index + 1}</text><title>{item.instrumentTag}: {value} °C</title></g>)}
    </svg>
    <details className="graph-data-table"><summary>View accessible data table <ChevronDown size={14}/></summary><table><thead><tr><th>Sensor</th><th>Actual</th><th>Normal</th><th>Advisory</th><th>Critical</th></tr></thead><tbody>{points.map(item => <tr key={item.id}><td className="mono">{item.instrumentTag}</td><td>{number(values.get(item.id) ?? null, item.unit)}</td><td>{number(item.normalMin)}–{number(item.normalMax, item.unit)}</td><td>{number(item.advisory, item.unit)}</td><td>{number(item.critical, item.unit)}</td></tr>)}</tbody></table></details>
  </div>;
}

export function ParameterOverview({ equipment, parameters, values }: { equipment: Equipment; parameters: EquipmentParameter[]; values: Map<string, number | null> }) {
  const equipmentParameters = parameters.filter(item => item.equipmentId === equipment.id);
  return <section className="parameter-overview" aria-labelledby="parameter-overview-title">
    <div className="control-section-heading"><div><p className="eyebrow">PARAMETER OVERVIEW</p><h2 id="parameter-overview-title"><span className="mono">{equipment.tag}</span> · {equipment.name}</h2></div><Link href={`/equipment/${equipment.id}`}>Open knowledge workspace <ArrowRight size={14}/></Link></div>
    {equipment.id === "EQP-000003" ? <ReactorProfile parameters={equipmentParameters} values={values}/> : <div className="parameter-bullets">{equipmentParameters.map(parameter => <ParameterBullet key={parameter.id} parameter={parameter} actual={values.get(parameter.id) ?? null}/>)}</div>}
    <p className="engineering-aid-note">Engineering aid—not a live SIS/DCS display. Verify current controlled plant documents and field conditions before operational use.</p>
  </section>;
}

function GovernedParameterEditor({ parameter }: { parameter: EquipmentParameter }) {
  const { actor, busy, run } = useHub(); const [open, setOpen] = useState(false);
  if (actor.role !== "controller") return null;
  return <div className="parameter-edit"><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Edit governed limits</button>{open && <form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); const ok = await run("parameter.update", parameter.id, { unit: data.get("unit"), baseValue: data.get("baseValue"), normalMin: data.get("normalMin"), normalMax: data.get("normalMax"), advisory: data.get("advisory"), critical: data.get("critical"), engineeringNote: data.get("engineeringNote"), comment: data.get("comment") }); if (ok) setOpen(false); }}>
    <label>Unit<input name="unit" defaultValue={parameter.unit} required/></label><label>Base<input name="baseValue" type="number" step="any" defaultValue={parameter.baseValue ?? ""}/></label><label>Normal min<input name="normalMin" type="number" step="any" defaultValue={parameter.normalMin ?? ""}/></label><label>Normal max<input name="normalMax" type="number" step="any" defaultValue={parameter.normalMax ?? ""}/></label><label>Advisory<input name="advisory" type="number" step="any" defaultValue={parameter.advisory ?? ""}/></label><label>Critical<input name="critical" type="number" step="any" defaultValue={parameter.critical ?? ""}/></label><label className="parameter-edit-wide">Engineering note<textarea name="engineeringNote" defaultValue={parameter.engineeringNote} required/></label><label className="parameter-edit-wide">Revision comment<input name="comment" required placeholder="Why is this governed value changing?"/></label><button type="submit" disabled={busy}><Save size={13}/> Publish revision</button>
  </form>}</div>;
}

function WhatIf({ parameters, mode, loadFactor, setLoadFactor, manual, setManual, equipment }: { parameters: EquipmentParameter[]; mode: ScenarioMode; loadFactor: number; setLoadFactor: (value: number) => void; manual: Record<string, number>; setManual: (value: Record<string, number>) => void; equipment: Equipment[] }) {
  const [filter, setFilter] = useState("all"); const filtered = filter === "all" ? parameters : parameters.filter(item => item.equipmentId === filter);
  return <div className="what-if-workspace">
    <section className="scenario-controls"><div><p className="eyebrow">SCENARIO CONTROL</p><h2>Parameter change analysis</h2><p>Scenario values are isolated. They never overwrite governed records or field readings.</p></div><label>Production load factor<input type="number" min="0.1" max="10" step="0.1" value={loadFactor} onChange={event => setLoadFactor(Math.max(.1, Math.min(10, Number(event.target.value) || 1)))}/><small>Only parameters marked LOAD change.</small></label><button type="button" onClick={() => { setLoadFactor(mode === "ideal" ? 1 : 10); setManual({}); }}><RotateCcw size={14}/> Reset scenario</button></section>
    {loadFactor > 2 && <p className="scenario-warning"><AlertTriangle size={15}/><span><strong>Extreme screening load.</strong> Values above 2× require engineering validation and are not realistic operating instructions.</span></p>}
    <div className="what-if-toolbar"><label>Equipment<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.tag} · {item.name}</option>)}</select></label><span>{filtered.length} parameters · imported workbook values</span></div>
    <div className="what-if-table-wrap"><table className="what-if-table"><thead><tr><th>Equipment / tag</th><th>Parameter</th><th>Base</th><th>Scenario input</th><th>Scenario actual</th><th>Normal envelope</th><th>State</th><th>Governance</th></tr></thead><tbody>{filtered.map(parameter => { const actual = scenarioValue(parameter, mode, loadFactor, manual[parameter.id]); const status = parameterStatus(parameter, actual); const asset = equipment.find(item => item.id === parameter.equipmentId); return <tr key={parameter.id} data-parameter-status={status}><td><strong className="mono">{asset?.tag}</strong><small>{parameter.group}</small></td><td><strong>{parameter.name}</strong><small className="mono">{parameter.instrumentTag}</small></td><td>{number(parameter.baseValue, parameter.unit)}</td><td>{parameter.modelDriver === "LOAD" ? <span className="model-driver">LOAD × {loadFactor}</span> : <input aria-label={`Scenario value for ${parameter.instrumentTag}`} type="number" step="any" value={manual[parameter.id] ?? parameter.currentValue ?? ""} onChange={event => setManual({ ...manual, [parameter.id]: Number(event.target.value) })}/>}</td><td><strong>{number(actual, parameter.unit)}</strong><small>{envelopePercent(parameter, actual)?.toFixed(1) ?? "—"}% envelope</small></td><td>{number(parameter.normalMin)}–{number(parameter.normalMax, parameter.unit)}</td><td><span className="parameter-state" data-parameter-status={status}>{parameterStatusLabel(status)}</span></td><td><span className="source-class">{parameter.sourceClass}</span><small>{parameter.sourceLocator}</small><GovernedParameterEditor parameter={parameter}/></td></tr>; })}</tbody></table></div>
  </div>;
}

export function ControlRoom() {
  const { state } = useHub(); const parameters = parameterRegistry(state); const mode: ScenarioMode = "non-ideal"; const loadFactor = 10; const manual = EMPTY_MANUAL; const [selected, setSelected] = useState("EQP-000001");
  const evaluations = useMemo(() => new Map(state.equipment.map(item => [item.id, equipmentParameterState(parameters, item.id, mode, loadFactor, manual)])), [state.equipment, parameters, mode, loadFactor, manual]);
  const values = useMemo(() => new Map(parameters.map(item => [item.id, scenarioValue(item, mode, loadFactor, manual[item.id])])), [parameters, mode, loadFactor, manual]);
  const conditions = useMemo(() => Object.fromEntries(state.equipment.map(item => { const record = equipmentCondition(item, state); const parameter = evaluations.get(item.id); let result: EquipmentConditionResult = record; if (record.condition === "healthy" && parameter) result = parameter.status === "critical" ? { condition: "critical", detail: "Imported parameter value is outside its critical envelope" } : parameter.status === "advisory" || parameter.status === "blocked" ? { condition: "attention", detail: parameter.status === "blocked" ? "A parameter is blocked by missing limits" : "Imported parameter value is outside its normal envelope" } : record; return [item.id, result]; })), [state, evaluations]);
  const deviations = useMemo(() => parameters.map(parameter => ({ parameter, actual: values.get(parameter.id) ?? null, status: parameterStatus(parameter, values.get(parameter.id) ?? null), asset: state.equipment.find(item => item.id === parameter.equipmentId)! })).filter(item => item.status === "advisory" || item.status === "critical").sort((a, b) => b.parameter.priority21 - a.parameter.priority21), [parameters, values, state.equipment]);
  const selectedEquipment = state.equipment.find(item => item.id === selected) ?? state.equipment[0];
  return <div className="control-room-page">
    <header className="control-room-heading"><div><p className="eyebrow">FIELD OVERVIEW · EIGHT EQUIPMENT SETS</p><h1>Equipment overview</h1><p>Find an asset, inspect its current imported parameters, then open its field knowledge workspace.</p></div><div className="control-room-actions"><Link href="/equipment/what-if" className="what-if-link"><FlaskConical size={15}/> Open What If</Link></div></header>
      <div className="dashboard-quick-actions" aria-label="Dashboard field actions"><button type="button" aria-label="Ask AI about selected equipment" onClick={() => window.dispatchEvent(new CustomEvent("knowledge-hub:open-ai", { detail: { equipmentId: selected } }))}><Bot size={15}/><span>Ask AI</span><small>{selectedEquipment.tag}</small></button><Link href="/scan"><ScanLine size={15}/><span>Scan QR</span><small>Identify field equipment</small></Link></div>
      <div className="equipment-focus-strip equipment-focus-strip-top" aria-label="Choose equipment parameter overview">{state.equipment.map(item => <button type="button" key={item.id} data-selected={selected === item.id} data-status={conditions[item.id]?.condition} onClick={() => setSelected(item.id)}><EquipmentVisual equipment={item} variant="thumbnail" decorative/><span><strong className="mono">{item.tag}</strong><small>{parameterStatusLabel(evaluations.get(item.id)?.status ?? "blocked")}</small></span></button>)}</div>
      <ParameterOverview equipment={selectedEquipment} parameters={parameters} values={values}/>
      <EquipmentProcessMap state={state} conditionOverrides={conditions} focusEquipmentId={selected}/>
      <section className="deviation-lane"><div className="control-section-heading"><div><p className="eyebrow">PARAMETER ATTENTION LANE</p><h2>Safety state first, then diagnosis</h2></div><span>{deviations.length} imported values outside normal envelope</span></div>{deviations.length ? <div className="deviation-table-wrap"><table><thead><tr><th>Equipment</th><th>Parameter</th><th>Imported value</th><th>Normal envelope</th><th>State</th><th>Priority</th><th>SIL / voting</th><th>First verification</th></tr></thead><tbody>{deviations.map(item => <tr key={item.parameter.id} onClick={() => setSelected(item.asset.id)} tabIndex={0} onKeyDown={event => { if (event.key === "Enter") setSelected(item.asset.id); }}><td><strong className="mono">{item.asset.tag}</strong><small>{item.asset.name}</small></td><td><strong>{item.parameter.name}</strong><small className="mono">{item.parameter.instrumentTag}</small></td><td><DeviationValue parameter={item.parameter} actual={item.actual}/></td><td><div className="normal-envelope"><span>{number(item.parameter.normalMin)}</span><i aria-hidden="true"/><span>{number(item.parameter.normalMax, item.parameter.unit)}</span></div></td><td><span className="parameter-state" data-parameter-status={item.status}>{parameterStatusLabel(item.status)}</span></td><td><div className="priority-visual"><strong>{(item.parameter.priority21 / 2.1).toFixed(1)}</strong><span aria-hidden="true"><i style={{ width: `${(item.parameter.priority21 / 21) * 100}%` }}/></span><small>{item.parameter.priority21}/21</small></div><details className="priority-diagnosis" onClick={event => event.stopPropagation()}><summary>Score basis</summary><dl><dt>Safety severity</dt><dd>{item.parameter.sil}</dd><dt>Deviation magnitude</dt><dd>{envelopePercent(item.parameter, item.actual)?.toFixed(1) ?? "Unavailable"}% envelope</dd><dt>Equipment criticality</dt><dd>{item.parameter.group} workbook priority</dd><dt>SIL dependency</dt><dd>{item.parameter.voting}</dd><dt>Cascade exposure</dt><dd>Review connected process path</dd><dt>Historical / training</dt><dd>{item.parameter.sourceClass}</dd><dt>Data-gap exposure</dt><dd>{item.parameter.reviewStatus === "candidate" ? "Candidate review pending" : "Reviewed revision"}</dd></dl><p>Only the combined workbook score is sourced; factors are shown as interpretation inputs, not invented sub-scores.</p></details></td><td><div className="sil-voting"><strong>{item.parameter.sil}</strong><span>{item.parameter.voting}</span></div></td><td><div className="verification-preview"><ShieldCheck size={15}/><span>{item.parameter.engineeringNote}</span></div><details className="verification-detail" onClick={event => event.stopPropagation()}><summary>Full step</summary><p>{item.parameter.engineeringNote}</p></details></td></tr>)}</tbody></table></div> : <p className="empty-lane">No imported parameters are outside their normal envelope.</p>}</section>
    <footer className="control-room-disclaimer"><FileSearch size={15}/><span>This interface is an engineering knowledge and training workspace. It is not a live DCS/SIS display and does not replace approved plant procedures, C&amp;E, SRS, permits, isolation, or field verification.</span></footer>
  </div>;
}

export function WhatIfPage() {
  const { state } = useHub(); const parameters = parameterRegistry(state); const [mode, setMode] = useState<ScenarioMode>("non-ideal"); const [loadFactor, setLoadFactor] = useState(10); const [manual, setManual] = useState<Record<string, number>>({});
  const values = useMemo(() => new Map(parameters.map(item => [item.id, scenarioValue(item, mode, loadFactor, manual[item.id])])), [parameters, mode, loadFactor, manual]);
  const deviations = useMemo(() => parameters.map(parameter => ({ parameter, actual: values.get(parameter.id) ?? null, status: parameterStatus(parameter, values.get(parameter.id) ?? null), asset: state.equipment.find(item => item.id === parameter.equipmentId)! })).filter(item => item.status === "advisory" || item.status === "critical").sort((a, b) => b.parameter.priority21 - a.parameter.priority21), [parameters, values, state.equipment]);
  const overall = deviations.some(item => item.status === "critical") ? "Critical" : deviations.length ? "Advisory" : "Normal"; const limiting = deviations[0];
  return <div className="control-room-page what-if-page">
    <Link href="/equipment" className="back-link"><ArrowLeft size={14}/> Back to field overview</Link>
    <header className="control-room-heading"><div><p className="eyebrow">ENGINEERING SCENARIO WORKSPACE</p><h1>What If</h1><p>Explore load and manual assumptions without changing field readings or governed records.</p></div></header>
    <section className="system-status" data-system-status={overall.toLowerCase()}><div><span>System status</span><strong>{overall}</strong></div><div><span>Scenario</span><strong>{mode === "ideal" ? "Ideal case" : "Non-ideal case"}</strong></div><div><span>Production load</span><strong>{loadFactor.toFixed(2)}×</strong></div><div><span>Limiting deviation</span><strong>{limiting ? `${limiting.asset.tag} · ${limiting.parameter.instrumentTag}` : "No active deviation"}</strong></div><div><span>Data connection</span><strong>Simulated · workbook</strong></div></section>
    <div className="control-room-toolbar"><div className="scenario-switch" role="group" aria-label="Scenario mode"><button aria-pressed={mode === "ideal"} onClick={() => { setMode("ideal"); setLoadFactor(1); setManual({}); }}>Ideal case</button><button aria-pressed={mode === "non-ideal"} onClick={() => { setMode("non-ideal"); setLoadFactor(10); setManual({}); }}>Non-ideal case</button></div><span>Scenario changes do not write governed values.</span></div>
    <WhatIf parameters={parameters} mode={mode} loadFactor={loadFactor} setLoadFactor={setLoadFactor} manual={manual} setManual={setManual} equipment={state.equipment}/>
    <footer className="control-room-disclaimer"><FileSearch size={15}/><span>What If is a screening workspace. Its calculations are not approved plant setpoints or live DCS/SIS values.</span></footer>
  </div>;
}
