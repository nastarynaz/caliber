import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY before importing parameters.");

const source = JSON.parse(await readFile(new URL("../data/control-room-parameters.json", import.meta.url), "utf8"));
if (source.length !== 38) throw new Error(`Expected 38 workbook parameters; found ${source.length}.`);
const rows = source.map(item => ({
  id: item.id, equipment_id: item.equipmentId, group_name: item.group, instrument_tag: item.instrumentTag,
  name: item.name, unit: item.unit, base_value: item.baseValue, current_value: item.currentValue,
  normal_min: item.normalMin, normal_max: item.normalMax, advisory: item.advisory, critical: item.critical,
  direction: item.direction, voting: item.voting, sil: item.sil, source_class: item.sourceClass,
  engineering_note: item.engineeringNote, model_driver: item.modelDriver, priority_21: item.priority21,
  source_document: item.sourceDocument, source_locator: item.sourceLocator, review_status: item.reviewStatus,
  data_mode: item.dataMode, valid_from: item.validFrom, updated_at: item.updatedAt, updated_by: item.updatedBy,
}));

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await db.from("equipment_parameter").upsert(rows, { onConflict: "id", ignoreDuplicates: false });
if (error) throw error;
console.log(`Imported ${rows.length} governed parameter records with workbook provenance.`);
