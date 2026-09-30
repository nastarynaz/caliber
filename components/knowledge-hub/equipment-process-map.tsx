"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Minus, Plus, Scan } from "lucide-react";
import type { HubState } from "@/lib/domain/types";
import { equipmentCondition, type EquipmentCondition, type EquipmentConditionResult } from "@/lib/domain/equipment-status";
import { EquipmentVisual } from "./equipment-visual";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Placement = { id: string; left: number; top: number; inlet?: string[]; outlet?: string[]; inputAnchor?: number; outputAnchor?: number; portY?: number };

// Fixed symbol centers follow the supplied 2014px-wide plot plan.
// Illustration sizes are legibility choices, not physical equipment footprints.
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1100;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_SENSITIVITY = 0.001;

const placements: Placement[] = [
  { id: "EQP-000001", left: 210, top: 221, inlet: ["Storage tank", "12-T-01"], outlet: ["To reactor", "DC-4501"] },
  { id: "EQP-000002", left: 623, top: 221, inlet: ["Centrifuge", "GF-2210"], outlet: ["Dry powder", "downstream"] },
  { id: "EQP-000003", left: 1037, top: 221, inlet: ["Reduction gas", "N2 / H2"], outlet: ["Trim gas", "/ analysis"], inputAnchor: 66, outputAnchor: 132 },
  { id: "EQP-000004", left: 1451, top: 221, inlet: ["KO drum", "FA-4510"], outlet: ["To reactor", "loop"] },
  { id: "EQP-000005", left: 210, top: 827, inlet: ["Cold hexane", "GA-5610"], outlet: ["Hot hexane", "recycle system"] },
  { id: "EQP-000006", left: 623, top: 827, inlet: ["LP separator", "FA-6710"], inputAnchor: 55, portY: 108 },
  { id: "EQP-000007", left: 1037, top: 827 },
  { id: "EQP-000008", left: 1451, top: 827, inlet: ["From tank"], outlet: ["Reflux / product", "/ boot drain"] },
];

const statusLabels: Record<EquipmentCondition, string> = {
  healthy: "Healthy",
  attention: "Attention",
  in_report: "In report",
  critical: "Critical",
};

export function EquipmentProcessMap({ state, conditionOverrides, focusEquipmentId }: { state: HubState; conditionOverrides?: Record<string, EquipmentConditionResult>; focusEquipmentId?: string }) {
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const zoomRef = useRef(zoom);
  const viewport = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const pendingCenter = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const wheelTarget = useRef(zoom);
  const [viewMode, setViewMode] = useState<"auto" | "fit" | "manual">("auto");
  const fittedZoom = (element: HTMLDivElement) => Math.max(MIN_ZOOM, Math.min(1,
    (element.clientWidth - 32) / CANVAS_WIDTH,
    (element.clientHeight - 92) / CANVAS_HEIGHT,
  ));
  const fitCanvas = () => {
    if (!viewport.current) return;
    pendingCenter.current = null;
    const fit = fittedZoom(viewport.current); zoomRef.current = fit; wheelTarget.current = fit; setZoom(fit);
    setViewMode("fit");
    viewport.current.scrollTo({ left: 0, top: 0 });
  };
  useEffect(() => {
    const element = viewport.current;
    if (!element || viewMode === "manual") return;
    const observer = new ResizeObserver(() => {
      const fit = fittedZoom(element);
      const next = viewMode === "auto" && element.clientWidth < 700 ? Math.max(.7, fit) : fit;
      zoomRef.current = next; wheelTarget.current = next; setZoom(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewMode]);
  useLayoutEffect(() => {
    const element = viewport.current;
    const canvas = drawing.current;
    const center = pendingCenter.current;
    if (!element || !canvas || !center) return;
    const bounds = canvas.getBoundingClientRect();
    element.scrollLeft += bounds.left + center.x * zoom - center.clientX;
    element.scrollTop += bounds.top + center.y * zoom - center.clientY;
    pendingCenter.current = null;
  }, [zoom]);
  useEffect(() => {
    if (!focusEquipmentId || !viewport.current) return;
    const placement = placements.find(item => item.id === focusEquipmentId);
    if (!placement) return;
    const element = viewport.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const currentZoom = zoomRef.current;
    element.scrollTo({ left: Math.max(0, (placement.left + 110) * currentZoom - element.clientWidth / 2), top: Math.max(0, (placement.top + 90) * currentZoom - element.clientHeight / 2), behavior: reduced ? "auto" : "smooth" });
  }, [focusEquipmentId]);
  useEffect(() => () => { if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current); }, []);
  const setBoundedZoom = (next: number, focal?: { clientX: number; clientY: number }) => {
    const currentZoom = zoomRef.current;
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(3))));
    if (value === currentZoom) return;
    if (viewport.current && drawing.current) {
      const view = viewport.current.getBoundingClientRect();
      const bounds = drawing.current.getBoundingClientRect();
      const clientX = focal?.clientX ?? view.left + viewport.current.clientWidth / 2;
      const clientY = focal?.clientY ?? view.top + viewport.current.clientHeight / 2;
      pendingCenter.current = {
        x: (clientX - bounds.left) / currentZoom,
        y: (clientY - bounds.top) / currentZoom,
        clientX,
        clientY,
      };
    }
    setViewMode("manual");
    zoomRef.current = value; wheelTarget.current = value;
    setZoom(value);
  };

  return <TooltipProvider delay={250} closeDelay={100}><section className="process-map-section" aria-labelledby="process-map-title">
    <div className="process-map-header">
      <div>
        <p className="eyebrow">EQUIPMENT OVERVIEW</p>
        <h2 id="process-map-title">Explore equipment</h2>
        <p>Equipment locations follow the source plot plan. Select a symbol to open its knowledge workspace.</p>
      </div>
      <div className="process-map-legend" aria-label="Equipment condition legend">
        {(["healthy", "attention", "in_report", "critical"] as EquipmentCondition[]).map(status => <span key={status} data-status={status}><i/>{statusLabels[status]}</span>)}
      </div>
    </div>

    <div className="process-map-stage">
    <div className={`process-map-scroll ${panning ? "is-panning" : ""}`} ref={viewport} tabIndex={0} aria-label="Equipment canvas. Drag to pan and use the mouse wheel or controls to zoom. Equipment positions are fixed."
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as HTMLElement).closest(".process-equipment-node,button,a")) return;
        const element = viewport.current; if (!element) return;
        element.setPointerCapture(event.pointerId); drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }; setPanning(true);
      }}
      onPointerMove={event => { const start = drag.current; const element = viewport.current; if (!start || start.pointerId !== event.pointerId || !element) return; element.scrollLeft = start.left - (event.clientX - start.x); element.scrollTop = start.top - (event.clientY - start.y); }}
      onPointerUp={event => { if (drag.current?.pointerId !== event.pointerId) return; drag.current = null; setPanning(false); viewport.current?.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; setPanning(false); }}
      onWheel={event => {
        if (Math.abs(event.deltaY) < .1) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
        const delta = Math.max(-80, Math.min(80, event.deltaY * unit));
        wheelTarget.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wheelTarget.current * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY)));
        const focal = { clientX: event.clientX, clientY: event.clientY };
        if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current);
        wheelFrame.current = requestAnimationFrame(() => { wheelFrame.current = null; setBoundedZoom(wheelTarget.current, focal); });
      }}>
      <div className="process-map-scaled" style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
        <div className="process-map-canvas" ref={drawing} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})` }}>
          <svg className="process-map-lines" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
            <g className="process-plot-rack">
              <rect x="44" y="639" width="1838" height="58"/>
              <text x="68" y="673">MAIN PIPE RACK</text>
            </g>
            <g className="process-plot-north" transform="translate(1800 64)">
              <text x="0" y="-16" textAnchor="middle">N</text>
              <path d="M0 76V0m-7 12L0 0l7 12"/>
            </g>
            <defs>
              <marker id="process-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0l4 2.5-4 2.5" fill="none" stroke="#9aa69f" strokeWidth="1"/></marker>
            </defs>
            {placements.map(({ id, left, top, inlet, outlet, inputAnchor = 30, outputAnchor = 190, portY = 80 }) => state.equipment.some(item => item.id === id) && <g key={id}>
              <g className="process-line process-line-main">
                {inlet && <path d={`M${left - 70} ${top + portY}H${left + inputAnchor}`}/>}
                {outlet && <path d={`M${left + outputAnchor} ${top + portY}H${left + 290}`}/>}
              </g>
              <g className="process-map-line-labels">
                {inlet && <text x={left - 32} y={top + portY - 26} textAnchor="middle">{inlet.map((line, index) => <tspan key={line} x={left - 32} dy={index ? 13 : 0}>{line}</tspan>)}</text>}
                {outlet && <text x={left + 252} y={top + portY - 26} textAnchor="middle">{outlet.map((line, index) => <tspan key={line} x={left + 252} dy={index ? 13 : 0}>{line}</tspan>)}</text>}
              </g>
              {id === "EQP-000004" && <>
                <path className="process-local-recycle" d={`M${left + 250} ${top + 80}V${top - 10}H${left - 50}V${top + 80}`}/>
                <text className="process-recycle-caption" x={left + 100} y={top - 20} textAnchor="middle">Anti-surge recycle</text>
              </>}
            </g>)}
          </svg>

          {placements.map(placement => {
            const equipment = state.equipment.find(item => item.id === placement.id);
            if (!equipment) return null;
            const result = conditionOverrides?.[equipment.id] ?? equipmentCondition(equipment, state);
            const docs = state.documents.filter(document => document.equipmentIds.includes(equipment.id));
            const latest = state.cases.find(item => item.equipmentId === equipment.id);

            return <Tooltip key={equipment.id}><TooltipTrigger render={<Link href={`/equipment/${equipment.id}`} draggable={false}/>} className="process-equipment-node" data-status={result.condition} data-equipment={equipment.id} style={{ left: placement.left, top: placement.top }} aria-label={`Open ${equipment.tag}, ${statusLabels[result.condition]}`}>
              <div className="process-node-visual"><EquipmentVisual equipment={equipment} variant="overview" decorative/></div>
              <div className="process-node-copy"><strong>{equipment.tag}</strong><span>{equipment.name}</span><small><i/>{statusLabels[result.condition]}</small></div>
              </TooltipTrigger>
              <TooltipPopup role="tooltip" className="process-tooltip-popup" side="bottom" sideOffset={12} data-status={result.condition}>
              <div className="process-node-tooltip">
                <div><span className="mono">{equipment.tag}</span><b data-status={result.condition}>{statusLabels[result.condition]}</b></div>
                <strong>{equipment.name}</strong>
                <dl><dt>Functional location</dt><dd>{equipment.location || "Not recorded"}</dd><dt>Knowledge coverage</dt><dd>{docs.length ? `${docs.length} linked source${docs.length === 1 ? "" : "s"}` : "Identity only"}</dd><dt>Status basis</dt><dd>{result.detail}</dd>{latest && <><dt>Latest report</dt><dd>{latest.title}</dd></>}</dl>
                <span className="process-tooltip-action">Open equipment workspace <ArrowUpRight/></span>
              </div>
              </TooltipPopup></Tooltip>;
          })}
        </div>
      </div>
    </div>

    <div className="process-map-zoom" aria-label="Canvas zoom controls">
      <button type="button" onClick={() => setBoundedZoom(zoomRef.current - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out"><Minus/></button>
      <button type="button" className="process-map-zoom-value" onClick={() => setBoundedZoom(1)} title="Reset to 100%" aria-label={`Reset zoom, currently ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => setBoundedZoom(zoomRef.current + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in"><Plus/></button>
      <span className="process-zoom-divider"/>
      <button type="button" onClick={fitCanvas} aria-label="Fit canvas" title="Fit all equipment"><Scan/></button>
    </div>
    </div>
    <div className="process-map-footer">
      <span>Source plot plan positions · symbols not to scale</span>
      <span>Healthy = no active report · no live telemetry</span>
    </div>
  </section></TooltipProvider>;
}
