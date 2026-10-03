export type Role = "engineer" | "controller" | "reviewer" | "reader";
export type Actor = { id: string; name: string; role: Role; mode: "demo" | "connected" };
export type Equipment = { id: string; tag: string; name: string; location: string; area: string; set: string };
export type ParameterDirection = "HIGH" | "LOW" | "N/A";
export type ParameterModelDriver = "MANUAL" | "LOAD" | "CALCULATED" | "CONNECTOR";
export type ParameterStatus = "normal" | "advisory" | "critical" | "blocked";
export type EquipmentParameter = {
  id: string; equipmentId: string; group: string; instrumentTag: string; name: string; unit: string;
  baseValue: number | null; currentValue: number | null; normalMin: number | null; normalMax: number | null;
  advisory: number | null; critical: number | null; direction: ParameterDirection; voting: string; sil: string;
  sourceClass: string; engineeringNote: string; modelDriver: ParameterModelDriver; priority21: number;
  sourceDocument: string; sourceLocator: string; reviewStatus: "candidate" | "published";
  dataMode: "imported_workbook" | "manual_field" | "connector"; validFrom: string | null; updatedAt: string | null; updatedBy: string;
};
export type ParameterRevision = { id: string; parameterId: string; revision: number; before: EquipmentParameter; after: EquipmentParameter; at: string; actor: string; comment: string };
export type Event = { id: string; at: string; actor: string; action: string; comment: string };
export type DocumentVersion = {
  id: string; documentId: string; title: string; number: string; type: string; revision: string | null;
  equipmentIds: string[]; source: string; filename: string; mime: string; checksum: string;
  processing: "succeeded" | "queued" | "failed";
  metadata: "incomplete" | "confirmed";
  review: "not_submitted" | "pending" | "changes_requested" | "approved";
  publication: "unpublished" | "published" | "withdrawn";
  indexing: "not_started" | "queued" | "ready" | "failed";
  applicability: "candidate" | "current" | "superseded";
  access: "team" | "reviewers"; owner: string; purpose: string; text: string; events: Event[];
};
export type CaseStatus = "submitted" | "triage" | "awaiting_clarification" | "investigating" | "resolved_pending_review" | "closure_changes_requested" | "verified_closed";
export type Case = {
  id: string; equipmentId: string; title: string; symptom: string; type: string; observedAt: string; submittedAt: string;
  reporter: string; status: CaseStatus; assignedTo: string; events: Event[];
  causeStatus: "not_established" | "established"; cause: string | null; action: string; outcome: string; lesson: string;
  evidence: string; downtimeStart: string | null; downtimeEnd: string | null;
  closureRevision: number; closures: { revision: number; cause: string | null; action: string; outcome: string; evidence: string; at: string }[];
  knowledge: "not_started" | "pending" | "ready" | "failed";
};
export type History = { id: string; equipmentId: string; wo: string; date: string; type: string; symptom: string; cause: string; action: string; downtime: number | null; cost: number | null; source: string };
export type Issue = { id: string; title: string; sourceIds: string[]; status: "open" | "resolved"; comment: string; at: string };
export type HubState = { revision: number; equipment: Equipment[]; documents: DocumentVersion[]; cases: Case[]; history: History[]; issues: Issue[]; audit: Event[]; parameters?: EquipmentParameter[]; parameterRevisions?: ParameterRevision[] };
export type Command = { action: string; id?: string; data?: Record<string, unknown>; expectedRevision: number };
export type Citation = {
  id: string; label: string; locator: string; href: string;
  kind?: "document" | "parameter" | "case" | "history" | "equipment" | "inventory";
  versionId?: string; documentId?: string; equipmentId?: string; caseId?: string;
};
export type Answer = { label: string; text: string; evidence: string; limitations: string; citations: Citation[]; view?: string; conflict: boolean; provider?: string };
