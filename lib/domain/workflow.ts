import type { Actor, Case, Command, DocumentVersion, Event, HubState } from "./types";

export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function requireRole(actor: Actor, roles: Actor["role"][]) { if (!roles.includes(actor.role)) throw new DomainError("Your account does not have permission for this action.", 403); }
export function canRead(doc: DocumentVersion, actor: Actor) { return doc.access === "team" || actor.role === "reviewer" || actor.role === "controller"; }
export function eligible(doc: DocumentVersion) { return doc.review === "approved" && doc.publication === "published" && doc.indexing === "ready" && doc.applicability === "current"; }
export function visibleState(state: HubState, actor: Actor): HubState {
  const documents = state.documents.filter(d => canRead(d, actor));
  const allowed = new Set(documents.map(d => d.id));
  return { ...state, documents, issues: state.issues.filter(i => i.sourceIds.every(id => allowed.has(id))), audit: actor.role === "reader" || actor.role === "engineer" ? [] : state.audit };
}
function value(data: Record<string, unknown>, key: string, required = false) {
  const v = typeof data[key] === "string" ? (data[key] as string).trim() : "";
  if (v.length > 12000) throw new DomainError("Text exceeds the 12,000 character limit.");
  if (required && !v) throw new DomainError(`${key} is required.`);
  return v;
}
function ensure(condition: boolean, message: string) { if (!condition) throw new DomainError(message, 409); }
function finiteNumber(data: Record<string, unknown>, key: string, nullable = false) {
  if (nullable && (data[key] === null || data[key] === "")) return null;
  const number = typeof data[key] === "number" ? data[key] : Number(data[key]);
  if (!Number.isFinite(number)) throw new DomainError(`${key} must be a valid number.`);
  return number;
}
export function applyCommand(original: HubState, actor: Actor, command: Command, now = new Date().toISOString()): HubState {
  if (command.expectedRevision !== original.revision) throw new DomainError("This workspace changed. Refresh before trying again.", 409);
  const state = structuredClone(original);
  const data = command.data ?? {};
  const id = command.id;
  const event: Event = { id: crypto.randomUUID(), at: now, actor: actor.name, action: command.action, comment: value(data, "comment") };
  if (command.action === "parameter.update") {
    requireRole(actor, ["controller"]);
    const parameter = state.parameters?.find(item => item.id === id);
    if (!parameter) throw new DomainError("Parameter unavailable.", 404);
    const before = structuredClone(parameter);
    const numeric = ["baseValue", "normalMin", "normalMax", "advisory", "critical"] as const;
    for (const key of numeric) if (key in data) parameter[key] = finiteNumber(data, key, true);
    if ("unit" in data) parameter.unit = value(data, "unit", true);
    if ("engineeringNote" in data) parameter.engineeringNote = value(data, "engineeringNote", true);
    ensure(parameter.normalMin === null || parameter.normalMax === null || parameter.normalMin < parameter.normalMax, "Normal minimum must be below maximum.");
    parameter.updatedAt = now; parameter.updatedBy = actor.name; parameter.reviewStatus = "published";
    state.parameterRevisions ??= [];
    const revision = state.parameterRevisions.filter(item => item.parameterId === parameter.id).length + 1;
    state.parameterRevisions.push({ id: `PRV-${crypto.randomUUID()}`, parameterId: parameter.id, revision, before, after: structuredClone(parameter), at: now, actor: actor.name, comment: value(data, "comment", true) });
  } else if (command.action === "parameter.reading") {
    requireRole(actor, ["engineer", "reviewer"]);
    const parameter = state.parameters?.find(item => item.id === id);
    if (!parameter) throw new DomainError("Parameter unavailable.", 404);
    parameter.currentValue = finiteNumber(data, "currentValue"); parameter.dataMode = "manual_field";
    parameter.updatedAt = now; parameter.updatedBy = actor.name;
    event.comment = value(data, "comment", true);
  } else if (command.action.startsWith("document.")) {
    const doc = state.documents.find(d => d.id === id);
    if (!doc || !canRead(doc, actor)) throw new DomainError("Document unavailable.", 404);
    const action = command.action.slice(9);
    if (["approve", "return"].includes(action)) requireRole(actor, ["reviewer"]);
    else requireRole(actor, ["controller"]);
    if (action === "metadata") {
      ensure(doc.review !== "approved", "Create a new revision to change approved content.");
      doc.title = value(data, "title", true); doc.number = value(data, "number", true);
      doc.owner = value(data, "owner", true); doc.purpose = value(data, "purpose", true);
      doc.revision = value(data, "revision") || null; doc.metadata = "confirmed";
      if (data.access !== undefined) {
        if (!["team", "reviewers"].includes(String(data.access))) throw new DomainError("Unknown access classification.");
        doc.access = data.access as "team" | "reviewers";
      }
      if (Array.isArray(data.equipmentIds)) {
        const links = [...new Set(data.equipmentIds)];
        if (!links.length || links.some(id => !state.equipment.some(e => e.id === id))) throw new DomainError("Select valid equipment links.");
        doc.equipmentIds = links as string[];
      }
      doc.review = "not_submitted";
    } else if (action === "submit") {
      ensure(doc.metadata === "confirmed" && doc.processing === "succeeded", "Confirm metadata and complete processing first.");
      ensure(["not_submitted", "changes_requested"].includes(doc.review), "This revision cannot be submitted again."); doc.review = "pending";
    } else if (action === "approve" || action === "return") {
      ensure(doc.review === "pending", "Only pending submissions can be reviewed.");
      event.comment = value(data, "comment", true);
      doc.review = action === "approve" ? "approved" : "changes_requested";
    } else if (action === "publish") {
      ensure(doc.review === "approved" && doc.publication === "unpublished", "An approved, unpublished revision is required.");
      doc.publication = "published"; doc.indexing = "queued";
    } else if (action === "index" || action === "fail_index") {
      ensure(doc.review === "approved" && doc.publication === "published", "Publish an approved version first.");
      ensure(doc.indexing !== "ready", "This version is already indexed.");
      if (action === "fail_index") { doc.indexing = "failed"; event.comment = "Explicit demo failure scenario. No provider request was made."; }
      else {
        ensure(!!doc.text.trim(), "No extracted text. A parser must process this document before indexing.");
        state.documents.filter(d => d.documentId === doc.documentId && d.id !== doc.id && d.applicability === "current").forEach(d => { d.applicability = "superseded"; });
        doc.indexing = "ready"; doc.applicability = "current";
        event.comment = "Local keyword index activated; no semantic embeddings generated.";
      }
    } else if (action === "withdraw") { doc.publication = "withdrawn"; doc.applicability = "candidate"; event.comment = value(data, "comment", true); }
    else if (action === "process") {
      ensure(doc.processing !== "succeeded", "Already processed.");
      doc.text = value(data, "text", true);
      ensure(doc.review !== "approved", "Approved content cannot be replaced.");
      event.comment = "Manual transcription supplied by the controller; technical review is still required. " + value(data, "comment", true);
      doc.processing = "succeeded";
    } else if (action === "fail_process") {
      ensure(doc.processing !== "succeeded", "Processed content cannot be reset.");
      doc.processing = "failed"; event.comment = value(data, "comment", true);
    } else throw new DomainError("Unknown document action.");
    doc.events.push(event);
  } else if (command.action === "case.create") {
    requireRole(actor, ["engineer", "reviewer"]);
    const equipmentId = value(data, "equipmentId", true);
    if (!state.equipment.some(e => e.id === equipmentId)) throw new DomainError("Unknown equipment.");
    const observedAt = value(data, "observedAt", true);
    if (!Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > Date.parse(now) + 300000) throw new DomainError("Enter a valid observation time, not in the future.");
    state.cases.unshift({ id: `DEMO-CASE-${crypto.randomUUID().slice(0, 8)}`, equipmentId, title: value(data, "title", true), symptom: value(data, "symptom", true), type: value(data, "type") || "Observation", observedAt, submittedAt: now, reporter: actor.name, status: "submitted", assignedTo: "", events: [event], causeStatus: "not_established", cause: null, action: "", outcome: "", lesson: "", evidence: "", downtimeStart: null, downtimeEnd: null, closureRevision: 0, closures: [], knowledge: "not_started" });
  } else if (command.action.startsWith("case.")) {
    const item = state.cases.find(c => c.id === id);
    if (!item) throw new DomainError("Case unavailable.", 404);
    const action = command.action.slice(5);
    if (["triage", "clarify", "assign", "verify", "return", "refresh", "fail_refresh"].includes(action)) requireRole(actor, ["reviewer"]);
    else requireRole(actor, ["engineer", "reviewer"]);
    if (action === "triage") { ensure(item.status === "submitted", "Only submitted reports need triage."); item.status = "triage"; }
    else if (action === "clarify") { ensure(item.status === "triage", "Assess the report first."); event.comment = value(data, "comment", true); item.status = "awaiting_clarification"; }
    else if (action === "respond") { ensure(item.status === "awaiting_clarification", "No clarification is pending."); event.comment = value(data, "comment", true); item.status = "triage"; }
    else if (action === "assign") { ensure(item.status === "triage", "Complete triage before assignment."); item.assignedTo = value(data, "assignedTo", true); item.status = "investigating"; }
    else if (action === "update") { ensure(item.status === "investigating", "This case is not under investigation."); event.comment = value(data, "comment", true); }
    else if (action === "reinvestigate") {
      ensure(item.status === "closure_changes_requested", "Return a closure for correction first.");
      event.comment = value(data, "comment", true); item.status = "investigating";
    } else if (action === "resolve") {
      ensure(["investigating", "closure_changes_requested"].includes(item.status), "This case cannot be submitted for closure yet.");
      item.causeStatus = data.causeStatus === "established" ? "established" : "not_established";
      item.cause = item.causeStatus === "established" ? value(data, "cause", true) : null;
      item.action = value(data, "action", true); item.outcome = value(data, "outcome", true); item.evidence = value(data, "evidence", true); item.lesson = value(data, "lesson");
      item.downtimeStart = value(data, "downtimeStart") || null; item.downtimeEnd = value(data, "downtimeEnd") || null;
      if ((item.downtimeStart && !Number.isFinite(Date.parse(item.downtimeStart))) || (item.downtimeEnd && (!item.downtimeStart || !Number.isFinite(Date.parse(item.downtimeEnd)) || item.downtimeEnd < item.downtimeStart))) throw new DomainError("Downtime end must follow a valid start.");
      item.closureRevision += 1; item.closures.push({ revision: item.closureRevision, cause: item.cause, action: item.action, outcome: item.outcome, evidence: item.evidence, at: now }); item.status = "resolved_pending_review";
    } else if (action === "verify" || action === "return") {
      ensure(item.status === "resolved_pending_review", "There is no closure awaiting review."); event.comment = value(data, "comment", true);
      item.status = action === "verify" ? "verified_closed" : "closure_changes_requested";
      if (action === "verify") item.knowledge = "pending";
    } else if (action === "refresh" || action === "fail_refresh") {
      ensure(item.status === "verified_closed" && item.knowledge !== "ready", "Only verified cases awaiting indexing can be refreshed.");
      item.knowledge = action === "refresh" ? "ready" : "failed";
      event.comment = action === "refresh" ? "Reviewed case added to local keyword retrieval." : "Explicit demo refresh failure; verified closure retained.";
    } else throw new DomainError("Unknown case action.");
    item.events.push(event);
  } else if (command.action === "issue.create") {
    requireRole(actor, ["engineer", "reviewer", "controller"]);
    const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds.filter((s): s is string => typeof s === "string") : [];
    if (sourceIds.some(source => !state.documents.some(d => d.id === source && canRead(d, actor)))) throw new DomainError("Source unavailable.", 404);
    const title = value(data, "title", true);
    if (!state.issues.some(i => i.title === title && i.status === "open")) state.issues.unshift({ id: `ISS-${crypto.randomUUID().slice(0, 8)}`, title, sourceIds, comment: value(data, "comment", true), status: "open", at: now });
  } else if (command.action === "issue.resolve") {
    requireRole(actor, ["reviewer"]); const issue = state.issues.find(i => i.id === id);
    if (!issue) throw new DomainError("Issue unavailable.", 404);
    issue.comment = value(data, "comment", true); issue.status = "resolved";
  } else throw new DomainError("Unknown action.");
  state.audit.unshift(event); state.revision++; return state;
}
export function caseCanAct(item: Case, action: string) { return item.status === action; }
