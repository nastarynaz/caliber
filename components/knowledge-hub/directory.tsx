"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHub } from "./provider";
import { PageHeading, Status, Empty } from "./common";
export function Directory() {
  const { state } = useHub(); const [query, setQuery] = useState("");
  const equipment = state.equipment.filter(e => `${e.tag} ${e.name} ${e.location}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-pad"><PageHeading eyebrow="EQUIPMENT REGISTRY" title="Find your equipment." description="Start with an asset. Keep its references, observations, and history in context."/><div className="list-toolbar"><div className="search-field"><Search size={17}/><Input aria-label="Search equipment" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by tag, name, or location…"/></div><span className="muted">{equipment.length} equipment</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Equipment / tag</th><th>Functional location</th><th>Collection</th><th>Last reported condition</th><th/></tr></thead><tbody>{equipment.map(e => <tr key={e.id}><td><Link href={`/equipment/${e.id}`} className="equipment-link"><span className="equipment-icon">{e.set}</span><span><strong className="mono">{e.tag}</strong><small>{e.name}</small></span></Link></td><td className="mono muted">{e.location || "Not recorded"}</td><td><Status tone={e.set === "01" ? "green" : "neutral"}>{e.set === "01" ? "12 sources available" : "Identity only"}</Status></td><td className="muted">{state.cases.find(c => c.equipmentId === e.id)?.title || "No condition reported"}</td><td><Link aria-label={`Open ${e.tag}`} href={`/equipment/${e.id}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>{!equipment.length && <Empty title="No equipment matches">Try an equipment tag such as GA-1201A.</Empty>}<p className="collection-note">PILOT COVERAGE <span>Set 01 is the detailed pilot. Other sets have registry identities only; technical data has not been imported.</span></p></div>;
}
