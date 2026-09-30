"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/lib/domain/types";

type Step = { selector: string; eyebrow: string; title: string; description: string; roles?: Actor["role"][] };
type Tour = { id: string; steps: Step[] };
type Box = { top: number; left: number; width: number; height: number; cardTop: number; cardLeft: number };

const STORAGE_PREFIX = "knowledge-hub:onboarding:v2";

const equipmentDetailSteps: Step[] = [
  { selector: '[data-tour="primary-nav"]', eyebrow: "YOUR WORKSPACE", title: "Move without losing context", description: "Equipment is your starting point. The document library keeps source revisions, while Cases & observations preserves field learning." },
  { selector: '[data-tour="equipment-context"]', eyebrow: "EQUIPMENT CONTEXT", title: "Know which asset is in scope", description: "The permanent equipment ID, tag, location, and latest reported condition keep every question and observation tied to the right asset." },
  { selector: '[data-tour="equipment-actions"]', eyebrow: "FIELD REPORTING", title: "Scan or report from the asset", description: "The QR always returns to this equipment. Authorized contributors can record an observation without turning it into a confirmed diagnosis.", roles: ["engineer", "reviewer"] },
  { selector: '[data-tour="evidence-workspace"]', eyebrow: "SOURCE EVIDENCE", title: "Inspect the original first", description: "Technical references stay linked to an exact revision and review state. Zoom, open the original, or switch to source text when available." },
  { selector: '[data-tour="knowledge-assistant"]', eyebrow: "EVIDENCE RETRIEVAL", title: "Ask within an explicit scope", description: "Answers expose evidence, citations, conflicts, and limitations. Gemini is used only when enabled and only receives sources you are authorized to see." },
  { selector: '[data-tour="related-sources"]', eyebrow: "RELATED SOURCES", title: "Compare the surrounding record", description: "Open related drawings, procedures, and maintenance history while keeping the current equipment and conversation in view." },
  { selector: '[data-tour="governance-nav"]', eyebrow: "GOVERNANCE", title: "Review before knowledge becomes current", description: "Use these queues for metadata, technical review, data-quality issues, publication, and access configuration.", roles: ["controller", "reviewer"] },
  { selector: '[data-tour="persona-switch"]', eyebrow: "DEMO CONTROLS", title: "See each responsibility", description: "Persona switching exists only in this training workspace. It demonstrates permissions and never changes a production user's authority." },
];

const tours: Record<string, Tour> = {
  equipment: { id: "equipment-overview", steps: [
    { selector: ".control-room-heading", eyebrow: "FIELD OVERVIEW", title: "Start from all eight equipment sets", description: "Scan an asset in the field, open a controlled scenario, or move directly into the equipment that needs attention." },
    { selector: ".equipment-focus-strip-top", eyebrow: "EQUIPMENT SELECTION", title: "Change the active equipment", description: "Select an equipment symbol to bring its governed parameter summary into focus without leaving the overview." },
    { selector: ".parameter-overview", eyebrow: "PARAMETER ENVELOPE", title: "Read the parameter state first", description: "Imported values are compared deterministically with published limits. They are engineering context, not live DCS or SIS telemetry." },
    { selector: ".process-map-section", eyebrow: "PROCESS CONTEXT", title: "Navigate the connected process", description: "Pan and zoom the P&ID-inspired canvas. Equipment stays fixed so the approved topology is not accidentally changed." },
    { selector: ".deviation-lane", eyebrow: "ATTENTION LANE", title: "Work from highest priority", description: "Open an out-of-envelope parameter to inspect its limits, source class, SIL context, and first verification note." },
  ] },
  whatIf: { id: "what-if", steps: [
    { selector: ".system-status", eyebrow: "SCENARIO SUMMARY", title: "See the scenario before the numbers", description: "Status, load factor, limiting deviation, and connection state make clear that this is a controlled workbook simulation." },
    { selector: ".scenario-switch", eyebrow: "SCENARIO MODE", title: "Compare ideal and non-ideal cases", description: "Switching scenarios never writes to governed parameter values or field readings." },
    { selector: ".scenario-controls", eyebrow: "CONTROLLED INPUTS", title: "Change only explicit assumptions", description: "Production load affects LOAD-driven parameters only. Manual inputs remain isolated inside this scenario." },
    { selector: ".what-if-table-wrap", eyebrow: "CALCULATION TRACE", title: "Follow every value to its rule", description: "Review the base value, transformation, normal envelope, calculated state, and governance classification together." },
  ] },
  equipmentDetail: { id: "equipment-detail", steps: equipmentDetailSteps },
  documents: { id: "documents", steps: [
    { selector: ".page-heading", eyebrow: "DOCUMENT LIBRARY", title: "Find controlled technical evidence", description: "Browse actual uploaded sources and keep document identity, revision, and review state visible." },
    { selector: ".list-toolbar", eyebrow: "EQUIPMENT FILTER", title: "Narrow evidence to the asset", description: "Search by document or equipment, then combine it with lifecycle status to find the applicable source quickly." },
    { selector: ".data-table-wrap", eyebrow: "SOURCE REGISTER", title: "Check governance before opening", description: "Equipment links, revision, technical review, and search availability show whether a source can support retrieval." },
  ] },
  extractedText: { id: "knowledge-extracted-text", steps: [
    { selector: ".knowledge-coverage", eyebrow: "RETRIEVAL CORPUS", title: "See what the system actually knows", description: "Parsed source count, extracted content volume, structured parameters, and parsing gaps stay explicit. Missing text is never treated as searchable knowledge." },
    { selector: ".knowledge-search-panel", eyebrow: "CONTENT SEARCH", title: "Search inside the parsed evidence", description: "Search reaches the full extracted text and source metadata. Previous and Next move between exact text matches without removing provenance." },
    { selector: ".knowledge-source-boundary", eyebrow: "IMMUTABLE PROVENANCE", title: "Know where each passage begins", description: "A restrained boundary keeps document number, revision, equipment, processing, review, and applicability attached to the complete source text." },
    { selector: ".knowledge-gaps", eyebrow: "EXPLICIT EXCLUSION", title: "Treat missing parsing as a data gap", description: "Sources without extracted text remain visible here but are excluded from the retrieval corpus rather than replaced with placeholder knowledge." },
  ] },
  knowledgeParameters: { id: "knowledge-parameters", steps: [
    { selector: ".knowledge-coverage", eyebrow: "PARAMETER REGISTRY", title: "Read structured knowledge in context", description: "These are imported and governed records, not live DCS or SIS measurements." },
    { selector: ".parameter-register-tools", eyebrow: "TECHNICAL FILTERS", title: "Narrow without losing governance", description: "Search by equipment, instrument, parameter, source, or engineering note, then filter deterministic states and classifications." },
    { selector: ".parameter-register", eyebrow: "DETERMINISTIC STATE", title: "Follow values to their source", description: "Status comes from stored thresholds. Source class, review status, locator, SIL, voting, and engineering interpretation remain visible." },
  ] },
  documentSource: { id: "document-source", steps: [
    { selector: ".source-page-note", eyebrow: "IMMUTABLE VERSION", title: "Confirm applicability first", description: "This route identifies one exact document version. Superseded and unreviewed sources remain visibly classified." },
    { selector: ".evidence-title", eyebrow: "SOURCE IDENTITY", title: "Keep title and revision together", description: "The document number, revision, and Hub review state travel with the original evidence." },
    { selector: ".evidence-toolbar", eyebrow: "EVIDENCE TOOLS", title: "Inspect, extract, or open the original", description: "Use page controls, extracted text, or the original private file without changing the retained source." },
    { selector: ".document-canvas", eyebrow: "ORIGINAL EVIDENCE", title: "Read the source—not a reconstruction", description: "This viewer preserves the uploaded document as the evidence layer for citations and review." },
  ] },
  cases: { id: "cases", steps: [
    { selector: ".page-heading", eyebrow: "FIELD LEARNING", title: "Separate observations from conclusions", description: "Create an observation, then carry it through investigation and reviewed closure without inventing a diagnosis." },
    { selector: ".section-title", eyebrow: "ACTIVE WORK", title: "Follow current field observations", description: "Each case preserves the original symptom, workflow status, contributor findings, and review outcome." },
    { selector: ".data-table-wrap", eyebrow: "HISTORICAL CONTEXT", title: "Use history as evidence—not proof", description: "Imported maintenance events can suggest questions, but a previous cause never establishes the current root cause." },
  ] },
  caseDetail: { id: "case-detail", steps: [
    { selector: ".page-heading", eyebrow: "CASE IDENTITY", title: "Keep the equipment and event in scope", description: "The case identity ties observations, investigation updates, and closure evidence to one auditable record." },
    { selector: ".case-status-bar, .detail-columns", eyebrow: "WORKFLOW STATE", title: "Know what can happen next", description: "Status and knowledge readiness are separate so a closed case is not silently treated as searchable knowledge." },
    { selector: ".detail-columns", eyebrow: "EVIDENCE & ACTION", title: "Read the record before acting", description: "The preserved observation and investigation timeline sit beside the actions permitted for your assigned role." },
  ] },
  scan: { id: "scan", steps: [
    { selector: ".scan-heading", eyebrow: "FIELD IDENTIFICATION", title: "Open the correct asset safely", description: "Scanning identifies the equipment route; it does not measure condition or replace field verification." },
    { selector: ".scanner-panel", eyebrow: "CAMERA SCAN", title: "Grant camera access only when needed", description: "Start scanning explicitly, hold the label in frame, and wait for the confirmed equipment match." },
    { selector: ".manual-identification", eyebrow: "MANUAL FALLBACK", title: "Continue when a label cannot be scanned", description: "Enter the equipment tag and document why QR identification was unavailable in the field workflow." },
    { selector: ".scan-safety", eyebrow: "SAFE DISTANCE", title: "Identification does not override access controls", description: "Maintain required distance and follow approved area procedures. Proximity sensing remains a future extension." },
  ] },
  admin: { id: "admin-review", steps: [
    { selector: ".page-heading", eyebrow: "REVIEW WORKSPACE", title: "Govern sources before publication", description: "Controllers prepare metadata and reviewers approve technical applicability through separate responsibilities." },
    { selector: ".list-toolbar", eyebrow: "REVIEW QUEUE", title: "Filter the work that needs attention", description: "Use equipment and lifecycle filters to locate incomplete metadata, pending review, or indexed sources." },
    { selector: ".data-table-wrap", eyebrow: "SOURCE LIFECYCLE", title: "See readiness without hiding uncertainty", description: "Technical review and search availability remain separate so incomplete processing cannot look approved." },
  ] },
  submission: { id: "admin-submission", steps: [
    { selector: ".page-heading", eyebrow: "SOURCE REVISION", title: "Review one immutable submission", description: "Each upload remains a distinct version with retained provenance and an auditable lifecycle." },
    { selector: ".governance-layout > div", eyebrow: "ORIGINAL EVIDENCE", title: "Verify the file before its metadata", description: "Inspect the source itself before confirming extracted fields, applicability, or publication state." },
    { selector: ".governance-panel", eyebrow: "GOVERNED ACTIONS", title: "Advance only the permitted lifecycle step", description: "Role-aware controls separate metadata confirmation, technical approval, publication, indexing, and withdrawal." },
  ] },
  dataQuality: { id: "admin-data-quality", steps: [
    { selector: ".page-heading", eyebrow: "DATA QUALITY", title: "Make uncertainty operationally visible", description: "Missing metadata, failed processing, and source conflicts remain explicit instead of becoming silent defaults." },
    { selector: ".section-title", eyebrow: "REVIEW QUEUES", title: "Resolve the reason—not just the badge", description: "Record a review rationale and preserve the issue history before marking a source problem resolved." },
    { selector: ".quality-row, .panel-section", eyebrow: "SOURCE ATTENTION", title: "Return to the affected source", description: "Open the exact revision that needs metadata, processing recovery, or indexing follow-up." },
  ] },
  access: { id: "admin-access", steps: [
    { selector: ".page-heading", eyebrow: "ACCESS & INTEGRATIONS", title: "Understand this environment's boundaries", description: "Account responsibility and connector capability are shown separately from process-health status." },
    { selector: ".detail-columns > section:first-child", eyebrow: "YOUR ACCESS", title: "Permissions follow assigned responsibility", description: "Upload, review, and publication remain separated even when demo personas are available." },
    { selector: ".detail-columns > section:last-child", eyebrow: "INTEGRATION STATUS", title: "Distinguish connected from simulated", description: "The workspace labels unavailable and demonstration capabilities honestly; no connector implies live plant telemetry." },
  ] },
};

function tourFor(pathname: string): Tour | null {
  if (pathname === "/equipment") return tours.equipment;
  if (pathname === "/equipment/what-if") return tours.whatIf;
  if (/^\/equipment\/[^/]+$/.test(pathname)) return tours.equipmentDetail;
  if (pathname === "/documents") return tours.documents;
  if (pathname === "/knowledge-base/extracted-text") return tours.extractedText;
  if (pathname === "/knowledge-base/parameters") return tours.knowledgeParameters;
  if (/^\/documents\/[^/]+\/versions\/[^/]+$/.test(pathname)) return tours.documentSource;
  if (pathname === "/cases") return tours.cases;
  if (/^\/cases\/[^/]+$/.test(pathname)) return tours.caseDetail;
  if (pathname === "/scan") return tours.scan;
  if (/^\/admin\/submissions\/[^/]+$/.test(pathname)) return tours.submission;
  if (pathname === "/admin/data-quality") return tours.dataQuality;
  if (pathname === "/admin/access") return tours.access;
  if (pathname === "/admin" || pathname === "/admin/reviews") return tours.admin;
  return null;
}

export function Onboarding({ actor }: { actor: Actor }) {
  const pathname = usePathname();
  const tour = useMemo(() => tourFor(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const available = useMemo(() => (tour?.steps ?? []).filter(step => !step.roles || step.roles.includes(actor.role)), [tour, actor.role]);
  const current = available[index];

  const close = useCallback((remember: boolean) => {
    if (remember && tour) localStorage.setItem(`${STORAGE_PREFIX}:${tour.id}`, "complete");
    setOpen(false); setBox(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }, [tour]);
  const next = useCallback(() => {
    if (index === available.length - 1) close(true); else setIndex(index + 1);
  }, [index, available.length, close]);

  useEffect(() => {
    if (!tour) return;
    const start = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIndex(0); setOpen(true);
    };
    window.addEventListener("knowledge-hub:start-tour", start);
    const url = new URL(window.location.href);
    const forced = url.searchParams.get("tour") === "1";
    const completed = localStorage.getItem(`${STORAGE_PREFIX}:${tour.id}`);
    if (forced || !completed) {
      const timer = window.setTimeout(start, 250);
      if (forced) {
        url.searchParams.delete("tour");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      return () => { window.clearTimeout(timer); window.removeEventListener("knowledge-hub:start-tour", start); };
    }
    return () => window.removeEventListener("knowledge-hub:start-tour", start);
  }, [tour]);

  useLayoutEffect(() => {
    if (!open || !current) return;
    let frame = 0; let retry = 0; let firstMissingAt = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(current.selector);
        if (!target) {
          if (!firstMissingAt) firstMissingAt = performance.now();
          if (performance.now() - firstMissingAt < 2000) {
            retry = window.setTimeout(measure, 80);
            return;
          }
          if (index < available.length - 1) setIndex(value => value + 1); else close(true);
          return;
        }
        firstMissingAt = 0;
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
    return () => { cancelAnimationFrame(frame); window.clearTimeout(retry); observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, current, index, available.length, close]);

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
  }, [open, index, close, next]);

  if (!open || !current) return null;

  return <div className="product-tour" aria-live="polite" data-tour-id={tour?.id}>
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
