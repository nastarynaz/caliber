"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, FileText, Minus, Plus, Maximize2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentVersion } from "@/lib/domain/types";
import { DocStatus, Empty } from "./common";
import { useHub } from "./provider";

export function Evidence({ doc, compact = false }: { doc?: DocumentVersion; compact?: boolean }) {
  const { actor } = useHub();
  const [zoom, setZoom] = useState(100); const [text, setText] = useState(false);
  if (!doc) return <Empty title="No source selected">Choose a document to inspect its original evidence.</Empty>;
  return <section className={`evidence ${compact ? "evidence-compact" : ""}`} aria-label="Source evidence">
    <div className="evidence-title"><span className="file-mark"><FileText size={18}/></span><div><strong>{doc.title}</strong><small className="mono">{doc.number} · Rev {doc.revision ?? "not recorded"}</small></div><DocStatus doc={doc}/></div>
    <div className="evidence-toolbar"><span className="page-counter">{doc.mime === "application/pdf" && (doc.id.startsWith("DEMO-") || actor.mode === "connected") ? "PDF · native page controls" : <>Page <b>1</b> of 1</>}</span><div className="zoom-tools"><Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(50, zoom - 25))}><Minus size={14}/></Button><span>{zoom}%</span><Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(200, zoom + 25))}><Plus size={14}/></Button><Button variant="ghost" size="icon-sm" aria-label="Fit document" onClick={() => setZoom(100)}><Maximize2 size={14}/></Button></div><div className="evidence-actions"><Button variant="ghost" size="icon-sm" aria-label={text ? "Show original page" : "Show extracted text"} onClick={() => setText(!text)}><ScanText size={16}/></Button><a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" aria-label="Open original source"><ArrowUpRight size={16}/></a></div></div>
    <div className="document-canvas">
      {text ? <pre className="extracted-text">{doc.text || "No extracted text is available for this source."}</pre> : (doc.id.startsWith("DEMO-") || actor.mode === "connected") && doc.mime === "application/pdf" ? <iframe title={doc.title} src={`/api/files/${doc.id}#page=1`} className="pdf-frame"/> : <div className="document-paper" style={{ width: `${zoom}%` }}><Image src={`/api/files/${doc.id}?preview=1`} alt={`Original page 1 of ${doc.title}`} width={1200} height={1600} unoptimized style={{ width: "100%", height: "auto" }}/></div>}
    </div><div className="evidence-footer"><span>{actor.mode === "demo" ? "ORIGINAL SOURCE · TRAINING DATA" : "ORIGINAL SOURCE · VERIFY APPLICABILITY"}</span><span className="mono">{doc.id}</span></div>
  </section>;
}
export function DocumentPage({ documentId, versionId }: { documentId: string; versionId: string }) {
  const { state } = useHub(); const doc = state.documents.find(d => d.id === versionId && d.documentId === documentId);
  return <div className="page-pad source-page"><Link href="/documents" className="back-link">← Document library</Link>{doc ? <><div className="source-page-note">This link identifies an immutable source version. {doc.applicability === "superseded" ? "Superseded: use only for historical comparison." : "Check approval and applicability before use."}</div><Evidence key={doc.id} doc={doc}/><p className="muted source-path">Source: {doc.source}</p></> : <Empty title="Source unavailable">The requested version is missing or outside your access.</Empty>}</div>;
}
