"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogTrigger, DialogPopup, DialogTitle, DialogDescription, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { useHub } from "./provider";
export function Report({ equipmentId, initialSymptom = "" }: { equipmentId: string; initialSymptom?: string }) {
  const { actor, state, busy, run } = useHub(); const [open, setOpen] = useState(false); const router = useRouter();
  const equipment = state.equipment.find(e => e.id === equipmentId);
  if (!["engineer", "reviewer"].includes(actor.role)) return <span className="muted small">Read access · reporting requires contributor permission</span>;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button/>}><Plus size={16}/>Report observation</DialogTrigger><DialogPopup><DialogHeader><DialogTitle>Record an observation</DialogTitle><DialogDescription>{equipment?.tag} · {equipment?.name}</DialogDescription></DialogHeader><DialogPanel><form className="stack-form" onSubmit={async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); const ok = await run("case.create", undefined, { ...data, equipmentId, observedAt: new Date(String(data.observedAt)).toISOString() }); if (ok) { setOpen(false); router.push("/cases"); } }}><label className="form-field">Short description<Input name="title" required placeholder="For example: unusual bearing noise"/></label><label className="form-field">Event type<select name="type"><option>Abnormal condition</option><option>Equipment stoppage</option><option>Maintenance update</option><option>Observation</option></select></label><label className="form-field">Observed at (your local time)<Input name="observedAt" type="datetime-local" required/></label><label className="form-field">What did you observe?<Textarea name="symptom" defaultValue={initialSymptom} required placeholder="Describe the symptom and operating context. Keep suspected causes separate."/></label><p className="form-help">Recorded as an unverified observation by {actor.name}. Findings and closure evidence can be added during investigation.</p><Button type="submit" loading={busy}>Submit observation</Button></form></DialogPanel></DialogPopup></Dialog>;
}
