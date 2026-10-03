"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { EquipmentConditionResult } from "@/lib/domain/equipment-status";
import { useHub } from "./provider";
import { PageHeading, Status, Empty } from "./common";
import { EquipmentVisual } from "./equipment-visual";
import { EquipmentProcessMap } from "./equipment-process-map";

export function Directory() {
  const { state, scenarioInput, scenarioSnapshot } = useHub();
  const [query, setQuery] = useState("");
  const equipment = state.equipment.filter(item => `${item.tag} ${item.name} ${item.location}`.toLowerCase().includes(query.toLowerCase()));
  const scenarioConditions = useMemo(() => Object.fromEntries(scenarioSnapshot.equipment.map(item => [item.equipmentId, item.status === "critical" ? { condition: "critical", detail: "Simulated critical parameter" } : item.status === "advisory" || item.status === "blocked" ? { condition: "attention", detail: item.status === "blocked" ? "Simulation blocked by missing limits" : "Simulated parameter outside normal envelope" } : { condition: "healthy", detail: "No simulated parameter deviation" }])) as Record<string, EquipmentConditionResult>, [scenarioSnapshot]);
  return <div className="page-pad">
    <PageHeading eyebrow="EQUIPMENT REGISTRY" title="See the process. Find the asset." description="Follow process relationships, condition records, and equipment-linked knowledge from one workspace."/>
    <EquipmentProcessMap state={state} conditionOverrides={scenarioInput.mode === "baseline" ? undefined : scenarioConditions}/>
    <div className="equipment-register-heading"><div><p className="eyebrow">EQUIPMENT REGISTER</p><h2>All equipment</h2></div><span className="muted">{equipment.length} equipment</span></div>
    <div className="list-toolbar"><div className="search-field"><Search size={17}/><Input aria-label="Search equipment" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by tag, name, or location…"/></div></div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Equipment / tag</th><th>Functional location</th><th>Collection</th><th>Last reported condition</th><th/></tr></thead><tbody>{equipment.map(item => <tr key={item.id}><td><Link href={`/equipment/${item.id}`} className="equipment-link"><EquipmentVisual equipment={item} variant="thumbnail" decorative/><span><strong className="mono">{item.tag}</strong><small>{item.name}</small></span></Link></td><td className="mono muted">{item.location || "Not recorded"}</td><td><Status tone={item.set === "01" ? "green" : "neutral"}>{item.set === "01" ? "12 sources available" : "Identity only"}</Status></td><td className="muted">{state.cases.find(itemCase => itemCase.equipmentId === item.id)?.title || "No condition reported"}</td><td><Link aria-label={`Open ${item.tag}`} href={`/equipment/${item.id}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>
    {!equipment.length && <Empty title="No equipment matches">Try an equipment tag such as GA-1201A.</Empty>}
    <p className="collection-note">PILOT COVERAGE <span>Set 01 is the detailed pilot. Other sets have registry identities only; technical data has not been imported.</span></p>
  </div>;
}
