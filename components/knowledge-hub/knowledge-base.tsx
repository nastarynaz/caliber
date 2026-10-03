"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpenText, FileText, Gauge, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { parameterRegistry, parameterStatus, parameterStatusLabel } from "@/lib/domain/control-room";
import type { DocumentVersion, EquipmentParameter } from "@/lib/domain/types";
import { PageHeading, Status } from "./common";
import { useHub } from "./provider";

type CorpusFilter = { equipment: string; type: string; review: string; publication: string; applicability: string };
type ParameterFilter = { equipment: string; state: string; source: string; review: string; driver: string };

const ALL = "all";

function normalizedText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function occurrences(text: string, term: string) {
  if (!term) return 0;
  return text.toLocaleLowerCase().split(term.toLocaleLowerCase()).length - 1;
}

function value(input: number | null, unit = "") {
  return input === null ? "Unavailable" : `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(input)}${unit ? ` ${unit}` : ""}`;
}

function tone(status: ReturnType<typeof parameterStatus>) {
  return status === "normal" ? "green" : status === "blocked" ? "neutral" : status === "critical" ? "red" : "amber";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sourceAnchor(id: string) {
  return `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function KnowledgeBaseHeader({ current }: { current: "text" | "parameters" }) {
  const { state } = useHub();
  const parameters = parameterRegistry(state);
  const parsed = state.documents.filter(item => item.processing === "succeeded" && item.text.trim());
  const gaps = state.documents.filter(item => !item.text.trim());
  const characters = parsed.reduce((sum, item) => sum + item.text.length, 0);
  return <>
    <PageHeading eyebrow="RETRIEVAL CORPUS" title="Knowledge Base" description="Parsed technical evidence and governed equipment parameters, presented with their source and review context."/>
    <nav className="knowledge-local-nav" aria-label="Knowledge Base sections">
      <Link href="/knowledge-base/extracted-text" aria-current={current === "text" ? "page" : undefined}><FileText/>Extracted Text</Link>
      <Link href="/knowledge-base/parameters" aria-current={current === "parameters" ? "page" : undefined}><Gauge/>Parameters</Link>
    </nav>
    <dl className="knowledge-coverage" aria-label="Knowledge Base coverage">
      <div><dt>Corpus</dt><dd>{current === "text" ? "Extracted text" : "Parameters"}</dd></div>
      <div><dt>Parsed sources</dt><dd>{parsed.length}<small>{characters.toLocaleString()} characters</small></dd></div>
      <div><dt>Parameters</dt><dd>{parameters.length}<small>Imported registry</small></dd></div>
      <div data-warning={gaps.length > 0}><dt>Parsing gaps</dt><dd>{gaps.length}<small>Excluded from retrieval</small></dd></div>
      <div><dt>Scope</dt><dd>All accessible equipment<small>Source classifications retained</small></dd></div>
    </dl>
  </>;
}

export function ExtractedTextKnowledgeBase() {
  const { state } = useHub();
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [filters, setFilters] = useState<CorpusFilter>({ equipment: ALL, type: ALL, review: ALL, publication: ALL, applicability: ALL });
  const matchRefs = useRef(new Map<number, HTMLElement>());
  const equipmentById = useMemo(() => new Map(state.equipment.map(item => [item.id, item])), [state.equipment]);
  const term = query.trim();
  const parsed = useMemo(() => state.documents.filter(item => item.processing === "succeeded" && item.text.trim()).sort((a, b) => {
    const equipmentA = a.equipmentIds.map(id => equipmentById.get(id)?.tag ?? id).join(",");
    const equipmentB = b.equipmentIds.map(id => equipmentById.get(id)?.tag ?? id).join(",");
    return equipmentA.localeCompare(equipmentB) || a.type.localeCompare(b.type) || a.number.localeCompare(b.number) || (a.revision ?? "").localeCompare(b.revision ?? "") || a.id.localeCompare(b.id);
  }), [state.documents, equipmentById]);
  const gaps = state.documents.filter(item => !item.text.trim());
  const visible = parsed.filter(item => {
    const equipmentTags = item.equipmentIds.map(id => equipmentById.get(id)?.tag ?? "");
    const searchable = [item.title, item.number, item.revision ?? "", item.type, item.text, ...equipmentTags].join(" ").toLocaleLowerCase();
    return (filters.equipment === ALL || item.equipmentIds.includes(filters.equipment))
      && (filters.type === ALL || item.type === filters.type)
      && (filters.review === ALL || item.review === filters.review)
      && (filters.publication === ALL || item.publication === filters.publication)
      && (filters.applicability === ALL || item.applicability === filters.applicability)
      && (!term || searchable.includes(term.toLocaleLowerCase()));
  });
  const matchStarts = new Map<string, number>();
  let totalMatches = 0;
  for (const item of visible) {
    matchStarts.set(item.id, totalMatches);
    totalMatches += occurrences(item.text, term);
  }

  function goToMatch(next: number) {
    if (!totalMatches) return;
    const normalized = (next + totalMatches) % totalMatches;
    setActiveMatch(normalized);
    const target = matchRefs.current.get(normalized);
    if (target) target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function updateFilter<K extends keyof CorpusFilter>(key: K, next: CorpusFilter[K]) {
    setActiveMatch(0); matchRefs.current.clear();
    setFilters(current => ({ ...current, [key]: next }));
  }

  return <div className="page-pad knowledge-base-page knowledge-text-page">
    <KnowledgeBaseHeader current="text"/>
    <section className="knowledge-search-panel" aria-label="Search extracted text">
      <div className="knowledge-search">
        <Search/>
        <Input aria-label="Search extracted text corpus" value={query} onChange={event => { setQuery(event.target.value); setActiveMatch(0); matchRefs.current.clear(); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); goToMatch(activeMatch + 1); } if (event.key === "Escape") { setQuery(""); setActiveMatch(0); } }} placeholder="Search the complete extracted-text corpus…"/>
        {query && <button type="button" aria-label="Clear extracted text search" onClick={() => { setQuery(""); setActiveMatch(0); }}><X/></button>}
        <span>{term ? `${totalMatches} text matches · ${visible.length} sources` : `${visible.length} parsed sources`}</span>
        <div className="knowledge-match-nav" aria-label="Search match navigation">
          <button type="button" aria-label="Previous text match" disabled={!totalMatches} onClick={() => goToMatch(activeMatch - 1)}><ArrowUp/></button>
          <button type="button" aria-label="Next text match" disabled={!totalMatches} onClick={() => goToMatch(activeMatch + 1)}><ArrowDown/></button>
        </div>
      </div>
      <div className="knowledge-filters">
        <Filter label="Equipment" value={filters.equipment} onChange={value => updateFilter("equipment", value)} options={state.equipment.map(item => [item.id, `${item.tag} · ${item.name}`])}/>
        <Filter label="Document type" value={filters.type} onChange={value => updateFilter("type", value)} options={unique(parsed.map(item => item.type)).map(item => [item, item.replaceAll("_", " ")])}/>
        <Filter label="Review status" value={filters.review} onChange={value => updateFilter("review", value)} options={unique(parsed.map(item => item.review)).map(item => [item, item.replaceAll("_", " ")])}/>
        <Filter label="Publication" value={filters.publication} onChange={value => updateFilter("publication", value)} options={unique(parsed.map(item => item.publication)).map(item => [item, item.replaceAll("_", " ")])}/>
        <Filter label="Applicability" value={filters.applicability} onChange={value => updateFilter("applicability", value)} options={unique(parsed.map(item => item.applicability)).map(item => [item, item.replaceAll("_", " ")])}/>
      </div>
    </section>
    <div className="knowledge-reader-layout knowledge-groups">
      <main className="knowledge-corpus" aria-label="Continuous extracted text corpus">
        {visible.map(document => <CorpusSource key={document.id} document={document} equipmentTags={document.equipmentIds.map(id => equipmentById.get(id)?.tag ?? id)} term={term} startIndex={matchStarts.get(document.id) ?? 0} activeMatch={activeMatch} registerMatch={(index, node) => { if (node) matchRefs.current.set(index, node); else matchRefs.current.delete(index); }}/>)}
        {!visible.length && <CorpusEmpty/>}
      </main>
      <aside className="knowledge-outline" aria-label="Corpus source outline">
        <div><span>SOURCE OUTLINE</span><strong>{visible.length} sources</strong></div>
        <select aria-label="Jump to corpus source" defaultValue="" onChange={event => { const target = document.getElementById(event.target.value); target?.scrollIntoView({ block: "start" }); }}><option value="" disabled>Jump to source…</option>{visible.map(item => <option key={item.id} value={sourceAnchor(item.id)}>{item.number || item.title}</option>)}</select>
        <ol>{visible.map(item => <li key={item.id}><a href={`#${sourceAnchor(item.id)}`}><span>{item.number || item.title}</span><small>{item.equipmentIds.map(id => equipmentById.get(id)?.tag).filter(Boolean).join(", ") || "No equipment link"} · {item.applicability}</small></a></li>)}</ol>
      </aside>
    </div>
    {gaps.length > 0 && <section className="knowledge-gaps" aria-labelledby="parsing-gaps-title"><div><p className="eyebrow">PARSING GAPS</p><h2 id="parsing-gaps-title">{gaps.length} {gaps.length === 1 ? "source is" : "sources are"} excluded</h2><p>This source is excluded from the extracted-text corpus because parsed text is unavailable.</p></div>{gaps.map(item => <Link key={item.id} href={`/documents/${item.documentId}/versions/${item.id}`}><span><strong>{item.title}</strong><small className="mono">{item.number || "No document number"} · {item.processing}</small></span><ArrowUpRight/></Link>)}</section>}
    <KnowledgeDisclaimer/>
  </div>;
}

function CorpusSource({ document, equipmentTags, term, startIndex, activeMatch, registerMatch }: { document: DocumentVersion; equipmentTags: string[]; term: string; startIndex: number; activeMatch: number; registerMatch: (index: number, node: HTMLElement | null) => void }) {
  return <article className="knowledge-source" id={sourceAnchor(document.id)} tabIndex={-1}>
    <header className="knowledge-source-boundary">
      <div><p className="eyebrow">{document.type.replaceAll("_", " ")}</p><h2>{document.title}</h2><p><span className="mono">{document.number || "No document number"}</span><i>·</i>Rev {document.revision ?? "not recorded"}<i>·</i>{equipmentTags.join(", ") || "No equipment link"}</p></div>
      <dl><div><dt>Version</dt><dd className="mono">{document.id}</dd></div><div><dt>Processing</dt><dd>{document.processing}</dd></div><div><dt>Review</dt><dd>{document.review.replaceAll("_", " ")}</dd></div><div><dt>State</dt><dd>{document.publication} · {document.applicability}</dd></div></dl>
      <Link href={`/documents/${document.documentId}/versions/${document.id}`} aria-label={`Open immutable source ${document.title}`}>Open source <ArrowUpRight/></Link>
    </header>
    <pre className="knowledge-corpus-text"><HighlightedText text={normalizedText(document.text)} term={term} startIndex={startIndex} activeMatch={activeMatch} registerMatch={registerMatch}/></pre>
  </article>;
}

function HighlightedText({ text, term, startIndex, activeMatch, registerMatch }: { text: string; term: string; startIndex: number; activeMatch: number; registerMatch: (index: number, node: HTMLElement | null) => void }) {
  if (!term) return text;
  const regex = new RegExp(`(${escapeRegExp(term)})`, "gi");
  let match = 0;
  return <>{text.split(regex).map((part, index) => {
    if (part.toLocaleLowerCase() !== term.toLocaleLowerCase()) return <Fragment key={index}>{part}</Fragment>;
    const globalIndex = startIndex + match++;
    return <mark key={index} ref={node => registerMatch(globalIndex, node)} data-active={globalIndex === activeMatch}>{part}</mark>;
  })}</>;
}

export function ParametersKnowledgeBase() {
  const { state, scenarioInput, scenarioSnapshot } = useHub();
  const parameters = parameterRegistry(state);
  const globalById = useMemo(() => new Map(scenarioSnapshot.parameters.map(item => [item.parameter.id, item])), [scenarioSnapshot]);
  const equipmentById = useMemo(() => new Map(state.equipment.map(item => [item.id, item])), [state.equipment]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ParameterFilter>({ equipment: ALL, state: ALL, source: ALL, review: ALL, driver: ALL });
  const term = query.trim().toLocaleLowerCase();
  const results = parameters.filter(item => {
    const equipment = equipmentById.get(item.equipmentId);
    const status = globalById.get(item.id)?.status ?? parameterStatus(item, item.currentValue);
    const searchable = [equipment?.tag, equipment?.name, item.instrumentTag, item.name, item.group, item.engineeringNote, item.sourceDocument, item.sourceLocator].join(" ").toLocaleLowerCase();
    return (filters.equipment === ALL || item.equipmentId === filters.equipment)
      && (filters.state === ALL || status === filters.state)
      && (filters.source === ALL || item.sourceClass === filters.source)
      && (filters.review === ALL || item.reviewStatus === filters.review)
      && (filters.driver === ALL || item.modelDriver === filters.driver)
      && (!term || searchable.includes(term));
  }).sort((a, b) => (equipmentById.get(a.equipmentId)?.tag ?? "").localeCompare(equipmentById.get(b.equipmentId)?.tag ?? "") || a.instrumentTag.localeCompare(b.instrumentTag));
  const grouped = results.reduce<Map<string, EquipmentParameter[]>>((map, item) => map.set(item.equipmentId, [...(map.get(item.equipmentId) ?? []), item]), new Map());
  function updateFilter<K extends keyof ParameterFilter>(key: K, next: ParameterFilter[K]) { setFilters(current => ({ ...current, [key]: next })); }

  return <div className="page-pad knowledge-base-page knowledge-parameters-page">
    <KnowledgeBaseHeader current="parameters"/>
    <section className="parameter-register-tools">
      <div className="knowledge-search"><Search/><Input aria-label="Search Knowledge Base parameters" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} placeholder="Equipment, instrument, parameter, source, or engineering note…"/>{query && <button type="button" aria-label="Clear parameter search" onClick={() => setQuery("")}><X/></button>}<span>{results.length} of {parameters.length}</span></div>
      <div className="knowledge-filters">
        <Filter label="Equipment" value={filters.equipment} onChange={value => updateFilter("equipment", value)} options={state.equipment.map(item => [item.id, `${item.tag} · ${item.name}`])}/>
        <Filter label="State" value={filters.state} onChange={value => updateFilter("state", value)} options={["normal", "advisory", "critical", "blocked"].map(item => [item, parameterStatusLabel(item as ReturnType<typeof parameterStatus>)])}/>
        <Filter label="Source class" value={filters.source} onChange={value => updateFilter("source", value)} options={unique(parameters.map(item => item.sourceClass)).map(item => [item, item])}/>
        <Filter label="Review" value={filters.review} onChange={value => updateFilter("review", value)} options={unique(parameters.map(item => item.reviewStatus)).map(item => [item, item])}/>
        <Filter label="Driver" value={filters.driver} onChange={value => updateFilter("driver", value)} options={unique(parameters.map(item => item.modelDriver)).map(item => [item, item])}/>
      </div>
    </section>
    <div className="parameter-register-wrap knowledge-groups"><table className="parameter-register"><thead><tr><th>Equipment / parameter</th><th>Values</th><th>Operating envelope</th><th>State / priority</th><th>SIL / voting</th><th>Governance and interpretation</th></tr></thead>{[...grouped].map(([equipmentId, items]) => { const equipment = equipmentById.get(equipmentId); return <tbody key={equipmentId}><tr className="parameter-equipment-row"><th colSpan={6}><span className="mono">{equipment?.tag}</span> {equipment?.name}<small>{items.length} parameters · {scenarioInput.mode === "baseline" ? "imported baseline" : `${scenarioInput.mode} globally applied`}</small></th></tr>{items.map(item => { const global = globalById.get(item.id); const status = global?.status ?? parameterStatus(item, item.currentValue); const globalValue = global?.simulated ?? item.currentValue; return <tr key={item.id} data-parameter-status={status}><td><strong>{item.name}</strong><span className="mono">{item.instrumentTag}</span><small>{item.group} · {item.modelDriver}</small></td><td><span>Global <b>{value(globalValue, item.unit)}</b></span><span>Imported <b>{value(item.currentValue, item.unit)}</b></span><span>Base <b>{value(item.baseValue, item.unit)}</b></span></td><td><span>Normal <b>{value(item.normalMin)}–{value(item.normalMax, item.unit)}</b></span><span>Advisory <b>{value(item.advisory, item.unit)}</b></span><span>Critical <b>{value(item.critical, item.unit)}</b></span><small>{item.direction}</small></td><td><Status tone={tone(status)}>{parameterStatusLabel(status)}</Status><strong className="parameter-priority">{item.priority21}/21</strong></td><td><strong>{item.sil}</strong><span className="mono">{item.voting}</span></td><td><div className="parameter-provenance"><span>{item.sourceClass}</span><span>{item.reviewStatus}</span><small>{item.sourceDocument} · {item.sourceLocator}</small></div><p>{item.engineeringNote}</p><details><summary>Full parameter metadata</summary><dl><div><dt>Parameter ID</dt><dd className="mono">{item.id}</dd></div><div><dt>Valid from</dt><dd>{item.validFrom ?? "Unavailable"}</dd></div><div><dt>Updated</dt><dd>{item.updatedAt ?? "Unavailable"} · {item.updatedBy || "Unavailable"}</dd></div></dl></details></td></tr>; })}</tbody>; })}</table>{!results.length && <CorpusEmpty/>}</div>
    <KnowledgeDisclaimer/>
  </div>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}><option value={ALL}>All {label.toLocaleLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function CorpusEmpty() {
  return <div className="knowledge-empty"><BookOpenText/><strong>No governed knowledge matches these controls.</strong><span>Clear the search or broaden the filters. Missing source content is never replaced with placeholder knowledge.</span></div>;
}

function KnowledgeDisclaimer() {
  return <p className="collection-note">KNOWLEDGE GOVERNANCE <span>Parsed text preserves its immutable document version. Parameter values retain source class and review status. This workspace is not live DCS/SIS data and does not replace approved plant procedures or field verification.</span></p>;
}
