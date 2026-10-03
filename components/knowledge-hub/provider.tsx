"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Actor, Command, HubState } from "@/lib/domain/types";
import { BASELINE_SCENARIO, buildScenarioSnapshot, parameterRegistry, sanitizeScenarioInput, type ScenarioInput, type ScenarioSnapshot } from "@/lib/domain/control-room";
type Context = { actor: Actor; state: HubState; capabilities: { gemini: boolean }; busy: boolean; notice: string; setNotice: (v: string) => void; scenarioInput: ScenarioInput; setScenarioInput: (value: ScenarioInput) => void; resetScenario: () => void; scenarioSnapshot: ScenarioSnapshot; run: (action: string, id?: string, data?: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void>; upload: (form: FormData) => Promise<HubState | false> };
const Hub = createContext<Context | null>(null);
const SCENARIO_STORAGE_KEY = "kh_candra_what_if";
export function HubProvider({ actor, initial, capabilities, children }: { actor: Actor; initial: HubState; capabilities: { gemini: boolean }; children: ReactNode }) {
  const [state, setState] = useState(initial); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [scenarioInput, setScenarioState] = useState<ScenarioInput>(BASELINE_SCENARIO);
  useEffect(() => { const timer = window.setTimeout(() => { try { const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY); if (stored) setScenarioState(sanitizeScenarioInput(JSON.parse(stored), parameterRegistry(initial))); } catch { sessionStorage.removeItem(SCENARIO_STORAGE_KEY); } }, 0); return () => window.clearTimeout(timer); }, [initial]);
  function setScenarioInput(value: ScenarioInput) { const next = sanitizeScenarioInput(value, parameterRegistry(state)); setScenarioState(next); try { sessionStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(next)); } catch {} }
  function resetScenario() { setScenarioInput(BASELINE_SCENARIO); }
  const scenarioSnapshot = useMemo(() => buildScenarioSnapshot(state, scenarioInput), [state, scenarioInput]);
  async function request(url: string, body: Command | FormData) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setState(data.state); setNotice(actor.mode === "demo" ? "Saved to this demo workspace." : "Saved to the connected workspace."); return data.state as HubState;
    } catch(e) { setNotice(e instanceof Error ? e.message : "Request failed."); return false; }
    finally { setBusy(false); }
  }
  async function reload() { const response = await fetch("/api/hub", { cache: "no-store" }); const data = await response.json(); if (response.ok) { setState(data.state); setNotice("Workspace refreshed."); } else setNotice(data.error); }
  return <Hub.Provider value={{ actor, state, capabilities, busy, notice, setNotice, scenarioInput, setScenarioInput, resetScenario, scenarioSnapshot, run: async (action, id, data) => Boolean(await request("/api/hub", { action, id, data, expectedRevision: state.revision })), reload, upload: form => { form.set("expectedRevision", String(state.revision)); return request("/api/upload", form); } }}>{children}</Hub.Provider>;
}
export function useHub() { const context = useContext(Hub); if (!context) throw new Error("Hub provider missing"); return context; }
