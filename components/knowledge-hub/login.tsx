"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { safeReturnPath } from "@/lib/domain/navigation";
import { Button } from "@/components/ui/button";

type Persona = {
  id: "engineer" | "reader" | "controller" | "reviewer";
  title: string;
  responsibility: string;
  capabilities: string[];
  boundary: string;
  image: string;
  imageAlt: string;
  imagePosition?: string;
};

const personaGroups: Array<{
  id: string;
  label: string;
  description: string;
  personas: Persona[];
}> = [
  {
    id: "field-operations",
    label: "Field Operations",
    description: "Identify equipment, perform verification, record evidence, and escalate unresolved conditions.",
    personas: [
      {
        id: "engineer",
        title: "Field Operator",
        responsibility: "Performs field verification and records equipment evidence.",
        capabilities: ["Scan equipment QR", "Perform approved checks", "Resolve or escalate field tasks"],
        boundary: "Cannot publish governed limits or approve technical sources.",
        image: "/images/personas/field-operations.webp",
        imageAlt: "Industrial worker wearing a safety helmet inspecting factory equipment.",
        imagePosition: "58% center",
      },
      {
        id: "reader",
        title: "Field Observer",
        responsibility: "Reviews field context and accessible evidence without changing governed records.",
        capabilities: ["Identify equipment records", "Read documents and parameters", "Review reported conditions"],
        boundary: "Read-only: cannot submit readings, approve sources, or publish knowledge.",
        image: "/images/personas/field-observer.jpg",
        imageAlt: "Industrial engineer in protective equipment reviewing information on a tablet inside a factory.",
        imagePosition: "42% center",
      },
    ],
  },
  {
    id: "control-governance",
    label: "Control & Governance",
    description: "Monitor the process, govern technical sources, dispatch verification, and review conclusions.",
    personas: [
      {
        id: "controller",
        title: "Control Room Admin",
        responsibility: "Coordinates deviations and governs document and parameter preparation.",
        capabilities: ["Monitor eight equipment sets", "Dispatch field verification", "Manage metadata and publication"],
        boundary: "Cannot provide independent technical approval where separation of duty applies.",
        image: "/images/personas/control-room-admin.webp",
        imageAlt: "Operator working at control panels in an industrial monitoring room.",
        imagePosition: "center 42%",
      },
      {
        id: "reviewer",
        title: "Technical Reviewer",
        responsibility: "Reviews technical applicability, evidence, and closure quality.",
        capabilities: ["Approve or return sources", "Review candidate knowledge", "Verify supported closure"],
        boundary: "Does not overwrite original evidence or prepare and approve the same source.",
        image: "/images/personas/technical-reviewer.webp",
        imageAlt: "Two engineers in safety helmets reviewing technical drawings together.",
      },
    ],
  },
];

export function Login({ mode, judgeAccessEnabled = false }: { mode: string; judgeAccessEnabled?: boolean }) {
  const [role, setRole] = useState<Persona["id"]>("engineer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const personaAccessReady = mode === "demo" || (mode === "connected" && judgeAccessEnabled);

  return (
    <main className="login-screen">
      <section className="login-story" aria-labelledby="login-product-title">
        <div className="brand">
          <span className="brand-symbol"><Image className="brand-logo" src="/logo-square.png" width={38} height={38} alt="" priority /></span>
          <span>Chandra Asri<span className="brand-sub">KNOWLEDGE HUB</span></span>
        </div>
        <div className="login-intro">
          <p className="eyebrow">INDUSTRIAL KNOWLEDGE, CONNECTED</p>
          <h1 id="login-product-title">Evidence for the control room and the field.</h1>
          <p>Find governed sources, verify equipment context, and preserve what teams learn across eight pilot equipment sets.</p>
        </div>
        <figure className="login-company-context">
          <Image src="/images/company/petrochemical-operations-context.webp" alt="Detailed view of an industrial refinery with pipelines and steel structures." width={2100} height={1400} sizes="(max-width: 800px) 100vw, 44vw" priority />
          <figcaption><span>Petrochemical operations context</span><small>Licensed reference photography · not a Chandra Asri facility or live plant evidence</small></figcaption>
        </figure>
        <div className="login-trust-line"><ShieldCheck size={15} /><span>Engineering knowledge and training workspace</span><small>Not a live DCS or SIS display</small></div>
        <footer>CALIBER 2026 <span>Case 01 / Chandra Asri Knowledge Hub</span></footer>
      </section>

      <section className="login-form-section">
        <div className="login-form">
          <p className="eyebrow">CHANDRA ASRI KNOWLEDGE HUB</p>
          <h2>Choose how you work</h2>
          <p className="muted">The pilot demonstrates two field responsibilities and two control-and-governance responsibilities. Each persona uses its assigned permission boundary.</p>
          <form onSubmit={async event => {
            event.preventDefault(); setBusy(true); setError("");
            try {
              const payload = mode === "demo" ? { role } : { judgeRole: role };
              const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
              const body = await response.json(); if (!response.ok) throw new Error(body.error);
              const target = new URLSearchParams(window.location.search).get("next"); window.location.assign(safeReturnPath(target));
            } catch (signInError) { setError(signInError instanceof Error ? signInError.message : "Sign-in failed."); } finally { setBusy(false); }
          }}>
            <fieldset className="persona-options"><legend className="sr-only">Judge persona</legend>{personaGroups.map(group => <section className="persona-group" aria-labelledby={`${group.id}-title`} key={group.id}><header><p id={`${group.id}-title`}>{group.label}</p><span>{group.description}</span></header><div className="persona-list">{group.personas.map(persona => <label key={persona.id} className={role === persona.id ? "selected" : ""}><input type="radio" name="role" value={persona.id} checked={role === persona.id} onChange={() => setRole(persona.id)} /><span className="persona-photo"><Image src={persona.image} alt={persona.imageAlt} width={1200} height={800} sizes="88px" style={{ objectPosition: persona.imagePosition }} /></span><span className="persona-content"><span className="persona-title-line"><strong>{persona.title}</strong><span aria-hidden="true" className="persona-check"><Check size={12} /></span></span><span className="persona-responsibility">{persona.responsibility}</span><span className="persona-capabilities">{persona.capabilities.map(capability => <small key={capability}>{capability}</small>)}</span><span className="persona-boundary"><b>Boundary</b> {persona.boundary}</span></span></label>)}</div></section>)}</fieldset>
            {error && <p className="error-text" role="alert">{error}</p>}
            <Button className="login-submit" size="lg" type="submit" loading={busy} disabled={!personaAccessReady}>Enter as selected persona<ArrowRight size={16} /></Button>
          </form>
          <p className="login-note">{personaAccessReady ? (mode === "connected" ? "These personas are restricted Supabase accounts connected to the same pilot dataset. They do not enable local fallback data or bypass RLS. Training/sample data only; no live sensor connection." : "Demo personas simulate permission boundaries for this pilot. Training/sample data only; no live sensor connection.") : "Persona access is not configured for this environment. Contact the workspace administrator."}</p>
        </div>
      </section>
    </main>
  );
}
