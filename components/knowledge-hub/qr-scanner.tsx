"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Keyboard, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useHub } from "./provider";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export function QRScanner() {
  const { state } = useHub(); const router = useRouter();
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const frame = useRef<number | null>(null);
  const [active, setActive] = useState(false); const [error, setError] = useState(""); const [manual, setManual] = useState(""); const [processing, setProcessing] = useState(false);

  function resolve(value: string) {
    if (processing) return;
    let pathname = value.trim();
    try { pathname = new URL(pathname, window.location.origin).pathname; } catch { setError("QR content is not a valid Knowledge Hub link."); return; }
    const match = pathname.match(/^\/equipment\/(EQP-\d{6})$/);
    const equipment = match && state.equipment.find(item => item.id === match[1]);
    if (!equipment) { setError("This code does not identify equipment in this workspace."); return; }
    setProcessing(true); if (navigator.vibrate) navigator.vibrate(80); stop();
    window.setTimeout(() => router.push(`/equipment/${equipment.id}?identified=qr`), 180);
  }

  function stop() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setActive(false);
  }

  async function start() {
    setError("");
    const DetectorClass = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) { setError("QR detection is not supported by this browser. Enter the equipment tag below."); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = media; if (!video.current) return stop(); video.current.srcObject = media; await video.current.play(); setActive(true);
      const detector = new DetectorClass({ formats: ["qr_code"] });
      const scan = async () => { if (!video.current || !stream.current) return; try { const codes = await detector.detect(video.current); if (codes[0]?.rawValue) return resolve(codes[0].rawValue); } catch { /* keep camera available */ } frame.current = requestAnimationFrame(scan); };
      frame.current = requestAnimationFrame(scan);
    } catch { stop(); setError("Camera access was denied or unavailable. Use manual equipment identification below."); }
  }

  useEffect(() => stop, []);

  return <div className="scan-page page-pad">
    <header className="scan-heading"><p className="eyebrow">FIELD IDENTIFICATION</p><h1>Scan equipment QR</h1><p>Confirm the physical asset before opening its task and knowledge workspace.</p></header>
    <section className="scanner-panel" aria-label="Equipment QR scanner">
      <div className="scanner-viewport" data-active={active}><video ref={video} muted playsInline aria-label="Camera preview"/>{!active && <div><ScanLine size={42}/><strong>Camera is off</strong><span>Permission is requested only after you start scanning.</span></div>}<i aria-hidden="true"/></div>
      <button className="scanner-primary" type="button" onClick={active ? stop : start} disabled={processing}>{active ? <CameraOff size={17}/> : <Camera size={17}/>} {active ? "Stop camera" : "Start camera scan"}</button>
      {error && <p className="scanner-error" role="alert">{error}</p>}
    </section>
    <section className="manual-identification"><div><Keyboard size={18}/><span><strong>Manual fallback</strong><small>Use this when the label cannot be scanned.</small></span></div><form onSubmit={event => { event.preventDefault(); const equipment = state.equipment.find(item => item.tag.toLowerCase() === manual.trim().toLowerCase() || item.id === manual.trim()); if (equipment) resolve(`/equipment/${equipment.id}`); else setError("Equipment tag was not found."); }}><label>Equipment tag<input value={manual} onChange={event => setManual(event.target.value)} placeholder="e.g. GA-1201A" autoCapitalize="characters"/></label><button type="submit" disabled={!manual.trim() || processing}>{processing ? <CheckCircle2 size={16}/> : null} Identify equipment</button></form></section>
    <p className="scan-safety">Keep the required safe distance and follow area access controls. QR identification does not replace field verification. Future proximity sensing is an extension point—not active positioning.</p>
  </div>;
}
