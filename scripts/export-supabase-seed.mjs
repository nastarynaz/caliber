// Offline export only. Does not connect to or mutate any database.
import { readFile, mkdir, writeFile } from "node:fs/promises";
const catalog = JSON.parse(await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../data/file-manifest.json", import.meta.url), "utf8"));
const sql = value => value === null ? "null" : typeof value === "number" ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const rows = ["-- CALIBER training data only. No operational approval or access grants.", "begin;"];
function insert(table, values) {
  rows.push(`insert into public.${table} (${Object.keys(values).join(",")}) values (${Object.values(values).map(sql).join(",")}) on conflict do nothing;`);
}
for (const e of catalog.equipment) insert("equipment", { id: e.id, tag: e.tag, name: e.name, location: e.location, area: e.area, set_number: e.set });
for (const d of catalog.documents) {
  insert("document", { id: d.documentId });
  insert("document_version", { id: d.id, document_id: d.documentId, title: d.title, number: d.number, type: d.type, revision: d.revision, source: d.source, filename: d.filename, mime: d.mime, checksum: d.checksum, processing: d.processing, extracted_text: d.text, storage_path: manifest[d.id]?.filename ?? null, preview_path: manifest[d.id]?.preview ?? null });
  for (const equipment_id of d.equipmentIds) insert("document_equipment", { version_id: d.id, equipment_id });
}
for (const h of catalog.history) insert("maintenance_event", { id: h.id, equipment_id: h.equipmentId, wo: h.wo, source_date: h.date, type: h.type, symptom: h.symptom, cause: h.cause, action: h.action, downtime: h.downtime, cost: h.cost, source: h.source });
rows.push("commit;");
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await writeFile(new URL("../artifacts/caliber-training-seed.sql", import.meta.url), rows.join("\n"));
console.log("Exported artifacts/caliber-training-seed.sql. Review before manually applying to an authorized development database.");
