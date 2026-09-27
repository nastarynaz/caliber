"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/lib/domain/types";

type Step = { target: string; eyebrow: string; title: string; description: string; roles?: Actor["role"][] };
type Box = { top: number; left: number; width: number; height: number; cardTop: number; cardLeft: number };

const STORAGE_KEY = "knowledge-hub:onboarding:v1";
const steps: Step[] = [
  { target: "primary-nav", eyebrow: "YOUR WORKSPACE", title: "Move without losing context", description: "Equipment is your starting point. The document library keeps source revisions, while Cases & observations preserves field learning." },
  { target: "equipment-context", eyebrow: "EQUIPMENT CONTEXT", title: "Know which asset is in scope", description: "The permanent equipment ID, tag, location, and latest reported condition keep every question and observation tied to the right asset." },
  { target: "equipment-actions", eyebrow: "FIELD REPORTING", title: "Scan or report from the asset", description: "The QR always returns to this equipment. Authorized contributors can record an observation without turning it into a confirmed diagnosis.", roles: ["engineer", "reviewer"] },
  { target: "evidence-workspace", eyebrow: "SOURCE EVIDENCE", title: "Inspect the original first", description: "Technical references stay linked to an exact revision and review state. Zoom, open the original, or switch to source text when available." },
  { target: "knowledge-assistant", eyebrow: "EVIDENCE RETRIEVAL", title: "Ask within an explicit scope", description: "Answers expose evidence, citations, conflicts, and limitations. Gemini is used only when enabled and only receives sources you are authorized to see." },
  { target: "related-sources", eyebrow: "RELATED SOURCES", title: "Compare the surrounding record", description: "Open related drawings, procedures, and maintenance history while keeping the current equipment and conversation in view." },
  { target: "governance-nav", eyebrow: "GOVERNANCE", title: "Review before knowledge becomes current", description: "Use these queues for metadata, technical review, data-quality issues, publication, and access configuration.", roles: ["controller", "reviewer"] },
  { target: "persona-switch", eyebrow: "DEMO CONTROLS", title: "See each responsibility", description: "Persona switching exists only in this training workspace. It demonstrates permissions and never changes a production user's authority." },
];

export function Onboarding({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const available = useMemo(() => steps.filter(step => !step.roles || step.roles.includes(actor.role)), [actor.role]);
  const current = available[index];

  useEffect(() => {
    const isWorkspace = /^\/equipment\/[^/]+$/.test(window.location.pathname);
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    const start = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIndex(0); setOpen(true);
    };
    window.addEventListener("knowledge-hub:start-tour", start);
    if (isWorkspace && (forced || !localStorage.getItem(STORAGE_KEY))) {
      const timer = window.setTimeout(start, 250);
      if (forced) window.history.replaceState(window.history.state, "", window.location.pathname);
      return () => { window.clearTimeout(timer); window.removeEventListener("knowledge-hub:start-tour", start); };
    }
    return () => window.removeEventListener("knowledge-hub:start-tour", start);
  }, []);

  useLayoutEffect(() => {
    if (!open || !current) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
        if (!target) {
          if (index < available.length - 1) setIndex(value => value + 1); else close(true);
          return;
        }
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = target.getBoundingClientRect();
        const gap = 10; const pad = 6; const cardWidth = Math.min(340, window.innerWidth - 24);
        const mobile = window.innerWidth < 640;
        const cardHeight = cardRef.current?.offsetHeight ?? 240;
        const below = rect.bottom + gap;
        const cardTop = mobile ? window.innerHeight - cardHeight - 12 : below + cardHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - cardHeight - gap);
        const cardLeft = mobile ? 12 : Math.min(window.innerWidth - cardWidth - 12, Math.max(12, rect.left));
        setBox({ top: Math.max(4, rect.top - pad), left: Math.max(4, rect.left - pad), width: Math.min(window.innerWidth - 8, rect.width + pad * 2), height: Math.min(window.innerHeight - 8, rect.height + pad * 2), cardTop, cardLeft });
      });
    };
    measure();
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    const observer = new ResizeObserver(measure); observer.observe(document.body);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, current, index, available.length]);

  useEffect(() => {
    if (!open) return;
    const background = [...document.querySelectorAll<HTMLElement>(".hub-nav, .hub-main")];
    const previousOverflow = document.documentElement.style.overflow;
    background.forEach(element => { element.inert = true; });
    document.documentElement.style.overflow = "hidden";
    cardRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex(index - 1); }
      if (event.key === "Tab" && cardRef.current) {
        const focusable = [...cardRef.current.querySelectorAll<HTMLElement>("button")].filter(item => !item.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      background.forEach(element => { element.inert = false; });
      document.documentElement.style.overflow = previousOverflow;
    };
  });

  function close(remember: boolean) {
    if (remember) localStorage.setItem(STORAGE_KEY, "complete");
    setOpen(false); setBox(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  function next() {
    if (index === available.length - 1) close(true); else setIndex(index + 1);
  }
  if (!open || !current) return null;

  return <div className="product-tour" aria-live="polite">
    <div className="tour-catcher" aria-hidden="true"/>
    {box && <div className="tour-highlight" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }}/>} 
    <div ref={cardRef} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} style={box ? { top: box.cardTop, left: box.cardLeft } : undefined}>
      <div className="tour-card-top"><span>{current.eyebrow}</span><button type="button" onClick={() => close(true)} aria-label="Skip guided tour"><X size={16}/></button></div>
      <h2 id="tour-title">{current.title}</h2><p>{current.description}</p>
      <div className="tour-progress" aria-label={`Step ${index + 1} of ${available.length}`}>{available.map((_, position) => <i key={position} className={position === index ? "active" : ""}/>)}</div>
      <div className="tour-actions"><button type="button" className="tour-skip" onClick={() => close(true)}>Skip tour</button><div>{index > 0 && <Button variant="outline" onClick={() => setIndex(index - 1)}><ArrowLeft/>Back</Button>}<Button onClick={next}>{index === available.length - 1 ? <><Check/>Finish</> : <>Next<ArrowRight/></>}</Button></div></div>
      <small>Step {index + 1} of {available.length} · Use ← → or Esc</small>
    </div>
  </div>;
}
