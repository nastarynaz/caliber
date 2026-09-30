"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Bot, BookOpen, X } from "lucide-react";
import type { Answer } from "@/lib/domain/types";
import { useHub } from "./provider";

type Message = { question: string; answer: Answer };

export function GlobalAI() {
  const { state, capabilities } = useHub();
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState("all");
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ equipmentId?: string }>).detail;
      if (detail?.equipmentId && state.equipment.some(item => item.id === detail.equipmentId)) setEquipmentId(detail.equipmentId);
      setOpen(true);
      window.setTimeout(() => input.current?.focus(), 0);
    };
    window.addEventListener("knowledge-hub:open-ai", show);
    return () => window.removeEventListener("knowledge-hub:open-ai", show);
  }, [state.equipment]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function ask(question: string) {
    const clean = question.trim(); if (!clean || asking) return;
    setAsking(true); setQuery("");
    try {
      const selected = equipmentId === "all" ? state.equipment[0]?.id : equipmentId;
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: clean, equipmentId: selected, broad: equipmentId === "all" }) });
      const answer = await response.json();
      if (!response.ok) throw new Error(answer.error || "Knowledge retrieval failed.");
      setMessages(current => [...current, { question: clean, answer }]);
    } catch (error) {
      setMessages(current => [...current, { question: clean, answer: { label: "Unavailable", text: error instanceof Error ? error.message : "Knowledge retrieval failed.", evidence: "No evidence was returned.", limitations: "Retry or inspect the governed sources directly.", citations: [], conflict: false } }]);
    } finally { setAsking(false); }
  }

  if (!open) return null;
  return <div className="global-ai-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <aside className="global-ai-panel" role="dialog" aria-modal="true" aria-label="Global knowledge assistant">
      <header><div><span><Bot size={16}/> Knowledge assistant</span><small>{capabilities.gemini ? "Gemini grounded retrieval enabled" : "Deterministic source retrieval"}</small></div><button type="button" aria-label="Close AI assistant" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="global-ai-scope"><label>Evidence scope<select value={equipmentId} onChange={event => setEquipmentId(event.target.value)}><option value="all">All eight equipment sets</option>{state.equipment.map(item => <option key={item.id} value={item.id}>{item.tag} · {item.name}</option>)}</select></label><p>AI explains retrieved evidence. It does not set process state or replace approved procedures.</p></div>
      <div className="global-ai-thread" aria-live="polite">
        {!messages.length && <div className="global-ai-empty"><BookOpen size={22}/><h2>Ask from the whole process.</h2><p>Search controlled documents, equipment knowledge, and reviewed cases. Every supported answer keeps its source.</p>{["Which equipment has the highest-priority deviation?", "Find approved verification steps for the selected equipment", "Which parameters have blocked or training-only evidence?"].map(question => <button type="button" key={question} onClick={() => ask(question)}>{question}<ArrowUpRight size={13}/></button>)}</div>}
        {messages.map((message, index) => <article className="global-ai-message" key={`${message.question}-${index}`}><p className="global-ai-question">{message.question}</p><div className="global-ai-answer"><span>{message.answer.provider ?? "Knowledge Hub retrieval"}</span><strong>{message.answer.label}</strong><p>{message.answer.text}</p>{message.answer.evidence && <blockquote>{message.answer.evidence}</blockquote>}<div>{message.answer.citations.map((citation, citationIndex) => <a key={`${citation.id}-${citationIndex}`} href={citation.href} target="_blank" rel="noreferrer"><b>{citationIndex + 1}</b><span>{citation.label}<small>{citation.locator}</small></span></a>)}</div><small>{message.answer.limitations}</small></div></article>)}
        {asking && <p className="global-ai-loading">Retrieving authorized evidence…</p>}
      </div>
      <form className="global-ai-composer" onSubmit={event => { event.preventDefault(); void ask(query); }}><div><input ref={input} aria-label="Ask the global knowledge assistant" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ask across equipment and sources…" maxLength={2000}/><button type="submit" aria-label="Send AI question" disabled={!query.trim() || asking}><ArrowUp size={16}/></button></div><small>Engineering aid · verify the cited source and current field condition.</small></form>
    </aside>
  </div>;
}
