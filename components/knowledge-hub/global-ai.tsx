"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowUp, ArrowUpRight, FileText, X } from "lucide-react";
import type { Answer } from "@/lib/domain/types";
import { useHub } from "./provider";
import { Evidence } from "./evidence";

type Message = { question: string; answer: Answer };

export function GlobalAI({ initialEquipmentId }: { initialEquipmentId: string }) {
  const { state, capabilities, setNotice, scenarioInput } = useHub();
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [evidenceId, setEvidenceId] = useState(() => state.documents.find(item => item.equipmentIds.includes(initialEquipmentId) && item.type === "DATASHEET")?.id ?? state.documents[0]?.id ?? "");
  const [mobileEvidence, setMobileEvidence] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const evidence = state.documents.find(item => item.id === evidenceId);

  const defaultEvidence = useCallback((scope: string) => {
    return state.documents.find(item => (scope === "all" || item.equipmentIds.includes(scope)) && item.type === "DATASHEET") ?? state.documents.find(item => scope === "all" || item.equipmentIds.includes(scope));
  }, [state.documents]);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ equipmentId?: string }>).detail;
      if (detail?.equipmentId && state.equipment.some(item => item.id === detail.equipmentId)) {
        setEquipmentId(detail.equipmentId);
        setEvidenceId(defaultEvidence(detail.equipmentId)?.id ?? "");
      }
      setOpen(true);
      window.setTimeout(() => input.current?.focus(), 0);
    };
    window.addEventListener("knowledge-hub:open-ai", show);
    return () => window.removeEventListener("knowledge-hub:open-ai", show);
  }, [defaultEvidence, state.equipment]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function chooseEquipmentScope(next: string) {
    setEquipmentId(next);
    setEvidenceId(defaultEvidence(next)?.id ?? "");
    try {
      const response = await fetch("/api/preferences/candra", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId: next }) });
      if (!response.ok) throw new Error();
    } catch { setNotice("Candra changed scope for this page, but could not remember it for the next visit."); }
  }

  async function ask(question: string) {
    const clean = question.trim(); if (!clean || asking) return;
    setAsking(true); setQuery("");
    try {
      const selected = equipmentId === "all" ? state.equipment[0]?.id : equipmentId;
      const history = messages.slice(-3).map(message => ({ question: message.question, answer: message.answer.text }));
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: clean, equipmentId: selected, broad: equipmentId === "all", history, scenario: scenarioInput.mode === "baseline" ? undefined : scenarioInput }) });
      const answer = await response.json();
      if (!response.ok) throw new Error(answer.error || "Knowledge retrieval failed.");
      setMessages(current => [...current, { question: clean, answer }]);
      const citedDocument = answer.citations?.map((citation: Answer["citations"][number]) => state.documents.find(item => item.id === (citation.versionId ?? citation.id))).find(Boolean);
      const viewedDocument = state.documents.find(item => item.id === answer.view);
      if (citedDocument || viewedDocument) setEvidenceId((citedDocument ?? viewedDocument)!.id);
    } catch (error) {
      setMessages(current => [...current, { question: clean, answer: { label: "Tidak tersedia", text: error instanceof Error ? error.message : "Retrieval pengetahuan gagal.", evidence: "Belum ada bukti yang berhasil diambil.", limitations: "Coba lagi atau periksa langsung sumber yang dikelola.", citations: [], conflict: false } }]);
    } finally { setAsking(false); }
  }

  if (!open) return null;
  return <div className="global-ai-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className={`global-ai-shell ${mobileEvidence ? "mobile-evidence-open" : ""}`} role="dialog" aria-modal="true" aria-label="Global knowledge assistant with evidence preview">
      <section className="global-ai-evidence-panel" aria-label="AI evidence preview"><header><div><FileText size={16}/><span><strong>Preview dokumen</strong><small>Bukti sumber yang sedang dirujuk AI</small></span></div><button type="button" aria-label="Kembali ke Mas Candra" onClick={() => setMobileEvidence(false)}><ArrowLeft size={17}/>Kembali ke AI</button></header><Evidence key={evidence?.id} doc={evidence}/></section>
    <aside className="global-ai-panel" aria-label="Mas Candra">
      <header><div className="global-ai-candra-header"><div className="candra-header-avatar"><Image src="/Candra.png" alt="Mas Candra" width={34} height={34} className="candra-mini-img"/><span className="candra-status-dot-sm"/></div><div><span>Candra · Asisten AI Pabrik</span><small>{capabilities.gemini ? "Retrieval berbasis bukti · korpus Chandra Asri" : "Retrieval deterministik · korpus Chandra Asri"}</small></div></div><div className="global-ai-header-actions"><button type="button" className="global-ai-mobile-evidence" onClick={() => setMobileEvidence(true)}><FileText size={15}/>Buka bukti</button><button type="button" aria-label="Tutup asisten AI" onClick={() => setOpen(false)}><X size={18}/></button></div></header>
      <div className="global-ai-scope"><label>Cakupan bukti<select value={equipmentId} onChange={event => void chooseEquipmentScope(event.target.value)}><option value="all">Semua 8 set peralatan</option>{state.equipment.map(item => <option key={item.id} value={item.id}>{item.tag} · {item.name}</option>)}</select></label>{scenarioInput.mode !== "baseline" && <span className="global-ai-scenario">What-if tersedia: {scenarioInput.mode === "ideal" ? "ideal" : `non-ideal ${scenarioInput.loadFactor.toFixed(2)}×`}. Sebut “skenario” untuk menanyakannya.</span>}<p>AI menjelaskan bukti yang ditemukan. AI tidak menetapkan kondisi proses atau menggantikan prosedur yang disetujui.</p></div>
      <div className="global-ai-thread" aria-live="polite">
        {!messages.length && <div className="global-ai-empty"><div className="candra-welcome-avatar"><Image src="/Candra.png" alt="Mas Candra" width={68} height={68} className="candra-welcome-img"/><span className="candra-welcome-badge">Online</span></div><h2>Tanya Mas Candra</h2><p>Telusuri dokumen kontrol, manual spesifikasi, P&ID, dan riwayat maintenance kilang. Setiap jawaban merujuk pada bukti otentik.</p>{["Peralatan mana yang memiliki deviasi prioritas tertinggi?", "Cari langkah verifikasi yang disetujui untuk peralatan ini", "Parameter mana yang diblokir atau hanya untuk pelatihan?"].map(question => <button type="button" key={question} onClick={() => ask(question)}>{question}<ArrowUpRight size={13}/></button>)}</div>}
        {messages.map((message, index) => <article className="global-ai-message" key={`${message.question}-${index}`}><p className="global-ai-question">{message.question}</p><div className="global-ai-answer"><span>{message.answer.provider ?? "Retrieval Knowledge Hub"}</span><strong>{message.answer.label}</strong><p>{message.answer.text}</p>{message.answer.evidence && <blockquote>{message.answer.evidence}</blockquote>}<div>{message.answer.citations.map((citation, citationIndex) => { const citedDocument = state.documents.find(item => item.id === (citation.versionId ?? citation.id)); const active = citedDocument?.id === evidenceId; return <a key={`${citation.id}-${citationIndex}`} href={citation.href} target="_blank" rel="noreferrer" data-preview-active={active || undefined} onClick={event => { if (!citedDocument) return; event.preventDefault(); setEvidenceId(citedDocument.id); setMobileEvidence(true); }}><b>{citationIndex + 1}</b><span>{citation.label}<small>{citation.locator}</small>{active && <em>Terbuka di preview</em>}</span><ArrowUpRight size={13}/></a>; })}</div><small>{message.answer.limitations}</small></div></article>)}
        {asking && <p className="global-ai-loading">Mengambil bukti yang terotorisasi…</p>}
      </div>
      <form className="global-ai-composer" onSubmit={event => { event.preventDefault(); void ask(query); }}><div><input ref={input} aria-label="Tanya asisten pengetahuan" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tanyakan peralatan atau sumber…" maxLength={2000}/><button type="submit" aria-label="Kirim pertanyaan" disabled={!query.trim() || asking}><ArrowUp size={16}/></button></div><small>Pendukung keputusan teknis · verifikasi sumber dan kondisi lapangan sebelum bertindak.</small></form>
    </aside></div>
  </div>;
}
