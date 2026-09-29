"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHub } from "./provider";
import { PageHeading, Status, Empty } from "./common";
import { EquipmentVisual } from "./equipment-visual";
import { EquipmentProcessMap } from "./equipment-process-map";
export function Directory() {
  const { state } = useHub(); const [query, setQuery] = useState("");
  const equipment = state.equipment.filter(e => `${e.tag} ${e.name} ${e.location}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-pad"><PageHeading eyebrow="EQUIPMENT REGISTRY" title="See the process. Find the asset." description="Follow process relationships, condition records, and equipment-linked knowledge from one workspace."/><EquipmentProcessMap state={state}/><div className="equipment-register-heading"><div><p className="eyebrow">EQUIPMENT REGISTER</p><h2>All equipment</h2></div><span className="muted">{equipment.length} equipment</span></div><div className="list-toolbar"><div className="search-field"><Search size={17}/><Input aria-label="Search equipment" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by tag, name, or location…"/></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Equipment / tag</th><th>Functional location</th><th>Collection</th><th>Last reported condition</th><th/></tr></thead><tbody>{equipment.map(e => <tr key={e.id}><td><Link href={`/equipment/${e.id}`} className="equipment-link"><EquipmentVisual equipment={e} variant="thumbnail" decorative/><span><strong className="mono">{e.tag}</strong><small>{e.name}</small></span></Link></td><td className="mono muted">{e.location || "Not recorded"}</td><td><Status tone={e.set === "01" ? "green" : "neutral"}>{e.set === "01" ? "12 sources available" : "Identity only"}</Status></td><td className="muted">{state.cases.find(c => c.equipmentId === e.id)?.title || "No condition reported"}</td><td><Link aria-label={`Open ${e.tag}`} href={`/equipment/${e.id}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>{!equipment.length && <Empty title="No equipment matches">Try an equipment tag such as GA-1201A.</Empty>}<p className="collection-note">PILOT COVERAGE <span>Set 01 is the detailed pilot. Other sets have registry identities only; technical data has not been imported.</span></p></div>;
}
