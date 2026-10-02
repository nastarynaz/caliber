import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCommand, visibleState, eligible } from "../lib/domain/workflow";
import { answerQuestion } from "../lib/domain/retrieval";
import { safeReturnPath } from "../lib/domain/navigation";
import { validateCitations } from "../lib/domain/providers";
import { equipmentCondition } from "../lib/domain/equipment-status";
import { parameterStatus, scenarioValue } from "../lib/domain/control-room";
import { validatedEquipmentPath } from "../lib/domain/locator";
import { assistantLanguage, sanitizeAssistantHistory, sanitizeAssistantQuestion, validCandraScope } from "../lib/domain/assistant";
import type { Actor, HubState, Role } from "../lib/domain/types";
const seed = (): HubState => JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const controlRoomSeed = (): HubState => ({ ...seed(), parameters: JSON.parse(readFileSync(new URL("../data/control-room-parameters.json", import.meta.url), "utf8")), parameterRevisions: [] });
const actor = (role: Role): Actor => ({ id: role, name: `Test ${role}`, role, mode: "demo" });
const command = (s: HubState, role: Role, action: string, id?: string, data = {}) => applyCommand(s, actor(role), { action, id, data, expectedRevision: s.revision });
function approved(s: HubState, id = s.documents[0].id) {
  s = command(s, "controller", "document.metadata", id, { title: "Test source", number: "SYNTHETIC-REF", owner: "Technical owner", purpose: "Test revision" });
  s = command(s, "controller", "document.submit", id);
  s = command(s, "reviewer", "document.approve", id, { comment: "Test review" });
  return command(s, "controller", "document.publish", id);
}
function investigating() {
  let s = command(seed(), "engineer", "case.create", undefined, { equipmentId: "EQP-000001", title: "Synthetic vibration observation", symptom: "Reported vibration", observedAt: "2026-01-01T01:00:00Z" });
  const id = s.cases[0].id;
  s = command(s, "reviewer", "case.triage", id);
  return command(s, "reviewer", "case.assign", id, { assignedTo: "Test investigator" });
}
const closure = { causeStatus: "not_established", cause: "Must not persist", action: "Inspection completed", outcome: "Condition resolved; causal mechanism not established", evidence: "Synthetic inspection evidence", lesson: "Check applicability" };

test("source import retains identities, nulls, and unapproved status", () => {
  const s = seed(); assert.equal(s.equipment.length, 8); assert.equal(s.documents.length, 12); assert.equal(s.history.length, 26);
  assert.equal(s.history.filter(h => h.cost === null && h.downtime === null).length, 5);
  assert.ok(s.documents.every(d => !eligible(d) && d.review === "not_submitted"));
});
test("permission checks prevent self-approval and reader reports", () => {
  const s = seed();
  assert.throws(() => command(s, "controller", "document.approve", s.documents[0].id, { comment: "self approval" }), /permission/i);
  assert.throws(() => command(s, "reader", "case.create"), /permission/i);
});
test("review correction and resubmission are independent of processing", () => {
  let s = approved(seed()); const id = s.documents[0].id;
  assert.throws(() => command(s, "controller", "document.metadata", id), /new revision/);
  s = seed(); const d = s.documents[0];
  s = command(s, "controller", "document.metadata", d.id, { title: d.title, number: d.number, owner: "Owner", purpose: "Review" });
  s = command(s, "controller", "document.submit", d.id);
  s = command(s, "reviewer", "document.return", d.id, { comment: "Check applicability" });
  s = command(s, "controller", "document.submit", d.id);
  assert.equal(s.documents[0].review, "pending"); assert.equal(s.documents[0].processing, "succeeded");
});
test("failed replacement indexing keeps current reference; activation is atomic", () => {
  let s = approved(seed()); const old = s.documents[0].id;
  s = command(s, "controller", "document.index", old);
  s.documents.push({ ...structuredClone(s.documents[0]), id: "DEMO-VER-replacement", applicability: "candidate", indexing: "queued", events: [] });
  s = command(s, "controller", "document.fail_index", "DEMO-VER-replacement");
  assert.ok(eligible(s.documents[0]));
  s = command(s, "controller", "document.index", "DEMO-VER-replacement");
  assert.equal(s.documents[0].applicability, "superseded"); assert.ok(eligible(s.documents.at(-1)!));
  assert.throws(() => command(s, "controller", "document.index", "DEMO-VER-replacement"), /already indexed/);
});
test("withdrawn and superseded references disappear from default retrieval", () => {
  const s = seed(); s.documents.forEach(d => d.publication = "withdrawn");
  assert.equal(answerQuestion(s, "pump specifications", "EQP-000001").citations.length, 0);
  s.documents.forEach(d => { d.publication = "published"; d.applicability = "superseded"; });
  assert.equal(answerQuestion(s, "pump specifications", "EQP-000001").citations.length, 0);
});
test("document ACL is explicit, including multi-equipment links and source issues", () => {
  const s = seed(); const d = s.documents[0]; d.access = "reviewers"; d.equipmentIds.push(s.equipment[1].id);
  s.issues.push({ id: "ISS-test", title: "Restricted", sourceIds: [d.id], status: "open", comment: "Private", at: "2026-01-01" });
  const visible = visibleState(s, actor("reader"));
  assert.ok(!visible.documents.some(x => x.id === d.id)); assert.equal(visible.issues.length, 0);
  assert.throws(() => command(s, "engineer", "issue.create", undefined, { title: "Issue", comment: "Test", sourceIds: [d.id] }), /unavailable/);
});
test("stale writes fail without changing original state", () => {
  const s = seed(); const before = structuredClone(s);
  assert.throws(() => applyCommand(s, actor("reviewer"), { action: "case.triage", expectedRevision: -1 }), /Refresh/);
  assert.deepEqual(s, before);
});
test("clarification and investigation updates preserve original report", () => {
  let s = command(seed(), "engineer", "case.create", undefined, { equipmentId: "EQP-000001", title: "Test", symptom: "Original observation", observedAt: "2026-01-01" });
  const id = s.cases[0].id;
  s = command(s, "reviewer", "case.triage", id);
  s = command(s, "reviewer", "case.clarify", id, { comment: "When did this occur?" });
  s = command(s, "engineer", "case.respond", id, { comment: "During inspection" });
  s = command(s, "reviewer", "case.assign", id, { assignedTo: "Engineer" });
  s = command(s, "engineer", "case.update", id, { comment: "Investigating" });
  assert.equal(s.cases[0].symptom, "Original observation"); assert.equal(s.cases[0].events.length, 6);
});
test("unknown cause closure, correction snapshots, and refresh retry stay separate", () => {
  let s = investigating(); const id = s.cases[0].id;
  s = command(s, "engineer", "case.resolve", id, closure);
  s = command(s, "reviewer", "case.return", id, { comment: "Add outcome detail" });
  s = command(s, "engineer", "case.resolve", id, { ...closure, outcome: "Corrected outcome" });
  assert.equal(s.cases[0].closures.length, 2); assert.equal(s.cases[0].closures[0].outcome, closure.outcome);
  s = command(s, "reviewer", "case.verify", id, { comment: "Outcome supported, cause remains unknown" });
  s = command(s, "reviewer", "case.fail_refresh", id);
  assert.equal(s.cases[0].cause, null); assert.equal(s.cases[0].status, "verified_closed");
  assert.ok(!answerQuestion(s, "vibration", "EQP-000001").citations.some(c => c.id === id));
  s = command(s, "reviewer", "case.refresh", id);
  assert.ok(answerQuestion(s, "vibration", "EQP-000001").citations.some(c => c.id === id));
  assert.throws(() => command(s, "reviewer", "case.refresh", id), /awaiting indexing/);
});
test("returned closure can return to investigation without losing snapshots", () => {
  let s = investigating(); const id = s.cases[0].id;
  s = command(s, "engineer", "case.resolve", id, closure);
  s = command(s, "reviewer", "case.return", id, { comment: "Inspect further" });
  s = command(s, "engineer", "case.reinvestigate", id, { comment: "Further inspection" });
  assert.equal(s.cases[0].status, "investigating"); assert.equal(s.cases[0].closures.length, 1);
});
test("no fake trends, diagnoses, or matching cases", () => {
  const s = seed();
  assert.match(answerQuestion(s, "temperature trend", "EQP-000001").text, /No timestamped/);
  assert.match(answerQuestion(s, "vibration", "EQP-000002").text, /No matching history/);
  assert.equal(answerQuestion(s, "quantum bananas", "EQP-000001").label, "Insufficient evidence");
});
test("assistant reports the governed equipment-set count in Indonesian", () => {
  const answer = answerQuestion(seed(), "Ada brp set peralatan di sini?", "EQP-000001", true);
  assert.equal(answer.label, "Inventaris peralatan");
  assert.match(answer.text, /8 set peralatan/);
  assert.equal(answer.evidence.split("\n").length, 8);
});
test("QR return paths are internal and reject unsafe redirects", () => {
  assert.equal(safeReturnPath("/equipment/EQP-000002"), "/equipment/EQP-000002");
  assert.equal(safeReturnPath("/scan"), "/scan");
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/login"]) assert.equal(safeReturnPath(path), "/equipment");
});
test("control room imports all 38 parameters and derives scenario status deterministically", () => {
  const s = controlRoomSeed(); assert.equal(s.parameters?.length, 38);
  const load = s.parameters!.find(item => item.instrumentTag === "FT-1201")!;
  assert.equal(scenarioValue(load, "ideal", 10), load.baseValue);
  assert.equal(scenarioValue(load, "non-ideal", 10), load.baseValue! * 10);
  assert.equal(parameterStatus(load, load.baseValue), "normal");
  assert.equal(parameterStatus(load, load.baseValue! * 10), "advisory");
});
test("parameter revisions require Controller authority and preserve before/after snapshots", () => {
  let s = controlRoomSeed(); const id = s.parameters![0].id;
  assert.throws(() => command(s, "engineer", "parameter.update", id, { normalMin: 1, comment: "Unauthorized" }), /permission/i);
  s = command(s, "controller", "parameter.update", id, { normalMin: .8, normalMax: 4, comment: "Reviewed test revision" });
  assert.equal(s.parameterRevisions?.length, 1); assert.notEqual(s.parameterRevisions![0].before.normalMin, s.parameterRevisions![0].after.normalMin);
});
test("equipment locator accepts only internal known permanent equipment IDs", () => {
  const ids = new Set(seed().equipment.map(item => item.id));
  assert.equal(validatedEquipmentPath("/equipment/EQP-000001", ids), "/equipment/EQP-000001");
  assert.equal(validatedEquipmentPath("https://evil.test/equipment/EQP-000001", ids), null);
  assert.equal(validatedEquipmentPath("/equipment/EQP-999999", ids), null);
});
test("provider citation validation rejects invented or unauthorized evidence", () => {
  assert.throws(() => validateCitations(["restricted-source"], []), /outside the authorized/);
});
test("manual processing has a separate failure and recovery gate", () => {
  let s = seed(); const id = s.documents[0].id;
  s.documents[0].processing = "queued"; s.documents[0].text = "";
  s = command(s, "controller", "document.fail_process", id, { comment: "Transcription not available" });
  assert.throws(() => command(s, "controller", "document.submit", id), /complete processing/);
  s = command(s, "controller", "document.process", id, { text: "Synthetic transcribed text", comment: "Manual test transcription, page 1" });
  assert.equal(s.documents[0].processing, "succeeded"); assert.equal(s.documents[0].review, "not_submitted");
  assert.ok(!eligible(s.documents[0]));
});
test("equipment map status is derived from governed Hub records", () => {
  let s = seed();
  assert.equal(equipmentCondition(s.equipment[1], s).condition, "healthy");
  s = command(s, "engineer", "case.create", undefined, { equipmentId: "EQP-000002", title: "Dryer observation", symptom: "Unusual sound", observedAt: "2026-01-01T01:00:00Z" });
  assert.equal(equipmentCondition(s.equipment[1], s).condition, "in_report");
  let critical = seed();
  critical = command(critical, "engineer", "case.create", undefined, { equipmentId: "EQP-000003", title: "Emergency trip", symptom: "High-high pressure trip reported", observedAt: "2026-01-01T01:00:00Z" });
  assert.equal(equipmentCondition(critical.equipment[2], critical).condition, "critical");
  const attention = seed(); attention.documents[0].processing = "failed";
  assert.equal(equipmentCondition(attention.equipment[0], attention).condition, "attention");
});
test("assistant input removes control characters and rejects an empty sanitized question", () => {
  assert.equal(sanitizeAssistantQuestion("  pump\u0000 flow?  "), "pump flow?");
  assert.throws(() => sanitizeAssistantQuestion("\u0000\u0008"), /Enter a question/);
  assert.throws(() => sanitizeAssistantQuestion("x".repeat(2_001)), /2,000/);
});
test("assistant history is bounded, sanitized, and excludes incomplete turns", () => {
  const history = sanitizeAssistantHistory([
    { question: "discarded", answer: "old" },
    { question: "rated flow?", answer: "See datasheet." },
    { question: "\u0000", answer: "invalid" },
    { question: "head?", answer: "  80 m  " },
  ]);
  assert.deepEqual(history, [{ question: "rated flow?", answer: "See datasheet." }, { question: "head?", answer: "80 m" }]);
});
test("Candra scope accepts only all or an accessible equipment ID", () => {
  const ids = seed().equipment.map(item => item.id);
  assert.equal(validCandraScope("all", ids), "all");
  assert.equal(validCandraScope("EQP-000001", ids), "EQP-000001");
  assert.equal(validCandraScope("EQP-999999", ids), "all");
});
test("assistant recognizes Indonesian questions without changing English defaults", () => {
  assert.equal(assistantLanguage("Berapa tekanan normal pompa ini?"), "id");
  assert.equal(assistantLanguage("Tampilkan riwayat vibrasi sebelumnya"), "id");
  assert.equal(assistantLanguage("Show the pump vibration history"), "en");
});
