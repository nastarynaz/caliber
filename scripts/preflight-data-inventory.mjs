import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.resolve(projectRoot, process.argv[2] || "../Data");
const outputRoot = path.resolve(projectRoot, process.argv[3] || "reports/ingestion");
const generatedAt = new Date().toISOString();

const equipmentBySet = new Map([
  ["01", { id: "EQP-000001", tag: "GA-1201A", name: "Hexane Feed Pump" }],
  ["02", { id: "EQP-000002", tag: "YD-2301", name: "Polymer Fluid Bed Dryer" }],
  ["03", { id: "EQP-000003", tag: "DC-3401A", name: "Catalyst Reduction Reactor" }],
  ["04", { id: "EQP-000004", tag: "KC-4501", name: "Recycle Gas Compressor" }],
  ["05", { id: "EQP-000005", tag: "EA-5601", name: "Solvent Heater" }],
  ["06", { id: "EQP-000006", tag: "LV-6701", name: "Separator Level Control Valve" }],
  ["07", { id: "EQP-000007", tag: "CT-7801", name: "Cooling Tower Cell Fan" }],
  ["08", { id: "EQP-000008", tag: "FA-8901", name: "Reflux Accumulator Drum" }],
]);

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function detectedMime(bytes, filename) {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const entries = zipEntries(filename);
    if (entries.includes("xl/workbook.xml")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (entries.includes("ppt/presentation.xml")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return "application/zip";
  }
  return "application/octet-stream";
}

function zipEntries(filename) {
  try {
    return execFileSync("unzip", ["-Z1", filename], { encoding: "utf8", maxBuffer: 8_000_000 }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function unzipText(filename, entry) {
  try {
    return execFileSync("unzip", ["-p", filename, entry], { encoding: "utf8", maxBuffer: 32_000_000 });
  } catch {
    return "";
  }
}

function xmlAttribute(value, name) {
  const match = value.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1]?.replaceAll("&amp;", "&").replaceAll("&quot;", '"') ?? null;
}

function xlsxMetadata(filename) {
  const workbook = unzipText(filename, "xl/workbook.xml");
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\/>/g)].map((match, index) => ({
    name: xmlAttribute(match[0], "name") || `Sheet ${index + 1}`,
    index: index + 1,
    row_count: (unzipText(filename, `xl/worksheets/sheet${index + 1}.xml`).match(/<row\b/g) || []).length,
  }));
  return { sheet_count: sheets.length, sheets };
}

function pptxMetadata(filename) {
  const entries = zipEntries(filename);
  const slideNumbers = entries.map(entry => entry.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  return { slide_count: slideNumbers.length, slides: slideNumbers };
}

function pngMetadata(bytes) {
  if (bytes.length < 24) return {};
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function pdfMetadata(filename) {
  const helper = [
    "import json,sys",
    "from pypdf import PdfReader",
    "r=PdfReader(sys.argv[1])",
    "print(json.dumps({'page_count':len(r.pages),'encrypted':bool(r.is_encrypted)}))",
  ].join(";");
  const localDeps = path.resolve(projectRoot, "../tmp/pdf_deps");
  try {
    const output = execFileSync("python3", ["-c", helper, filename], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: process.env.PDF_PYTHONPATH || localDeps },
      maxBuffer: 2_000_000,
    });
    return JSON.parse(output);
  } catch (error) {
    return { page_count: null, encrypted: null, parser_error: String(error?.stderr || error?.message || error).trim() };
  }
}

function sourceContext(relativePath) {
  const segments = relativePath.split(path.sep);
  const setMatch = segments[0]?.match(/^Set_(\d{2})_/);
  const setNumber = setMatch?.[1] || null;
  return { set_number: setNumber, equipment: setNumber ? equipmentBySet.get(setNumber) || null : null };
}

function documentType(relativePath, mime) {
  const name = path.basename(relativePath).toLowerCase();
  if (mime.includes("spreadsheet")) return name.includes("maintenance") ? "MAINTENANCE_HISTORY" : "CONTROL_ROOM_WORKBOOK";
  if (mime.includes("presentation")) return "DATASET_EXPLANATION";
  if (name.includes("p&id") || name.includes("pid_set")) return "P_AND_ID";
  if (name.includes("datasheet")) return "DATASHEET";
  if (name.includes("interlock")) return "INTERLOCK_LOGIC";
  if (name.includes("plot plan")) return "PLOT_PLAN";
  if (name.startsWith("opl-")) return "ONE_POINT_LESSON";
  if (name.includes("drawing")) return "GA_DRAWING";
  return "REFERENCE";
}

const sourceStat = await stat(sourceRoot).catch(() => null);
if (!sourceStat?.isDirectory()) throw new Error(`Source directory not found: ${sourceRoot}`);

const files = await walk(sourceRoot);
const items = [];
for (const absolutePath of files) {
  const bytes = await readFile(absolutePath);
  const relativePath = path.relative(sourceRoot, absolutePath);
  const mime = detectedMime(bytes, absolutePath);
  const context = sourceContext(relativePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let structure = {};
  if (mime === "application/pdf") structure = pdfMetadata(absolutePath);
  else if (mime === "image/png") structure = pngMetadata(bytes);
  else if (mime.includes("spreadsheet")) structure = xlsxMetadata(absolutePath);
  else if (mime.includes("presentation")) structure = pptxMetadata(absolutePath);
  items.push({
    manifest_item_id: `SRC-${sha256.slice(0, 16)}`,
    relative_path: relativePath.split(path.sep).join("/"),
    filename: path.basename(relativePath),
    extension: path.extname(relativePath).toLowerCase(),
    detected_mime: mime,
    byte_size: bytes.length,
    sha256,
    set_number: context.set_number,
    equipment_id: context.equipment?.id || null,
    equipment_tag: context.equipment?.tag || null,
    proposed_document_type: documentType(relativePath, mime),
    proposed_processor: mime === "application/pdf" || mime === "image/png" ? "gemini_document_understanding" : mime.includes("spreadsheet") ? "deterministic_xlsx" : mime.includes("presentation") ? "deterministic_pptx" : "manual_review",
    structure,
  });
}

const byChecksum = new Map();
for (const item of items) byChecksum.set(item.sha256, [...(byChecksum.get(item.sha256) || []), item.relative_path]);
const duplicates = [...byChecksum.entries()].filter(([, paths]) => paths.length > 1).map(([sha256, paths]) => ({ sha256, paths }));
const mimeCounts = Object.fromEntries([...new Set(items.map(item => item.detected_mime))].sort().map(mime => [mime, items.filter(item => item.detected_mime === mime).length]));
const setChecks = [...equipmentBySet.entries()].map(([setNumber, equipment]) => {
  const setItems = items.filter(item => item.set_number === setNumber);
  const typeCount = type => setItems.filter(item => item.proposed_document_type === type).length;
  const expected = { DATASHEET: 1, GA_DRAWING: 1, INTERLOCK_LOGIC: 1, ONE_POINT_LESSON: 7, PLOT_PLAN: 1, P_AND_ID: 1 };
  const actual = Object.fromEntries(Object.keys(expected).map(type => [type, typeCount(type)]));
  const mismatches = Object.keys(expected).filter(type => actual[type] !== expected[type]).map(type => `${type}: expected ${expected[type]}, found ${actual[type]}`);
  return { set_number: setNumber, equipment, file_count: setItems.length, expected_file_count: 12, actual, status: setItems.length === 12 && mismatches.length === 0 ? "valid" : "needs_attention", mismatches };
});

const pdfErrors = items.filter(item => item.detected_mime === "application/pdf" && item.structure.parser_error);
const encryptedPdfs = items.filter(item => item.detected_mime === "application/pdf" && item.structure.encrypted === true);
const manifest = {
  schema_version: "1.0.0",
  generated_at: generatedAt,
  source_root_label: "Data",
  source_root_absolute_path: sourceRoot,
  manifest_checksum: null,
  summary: {
    total_files: items.length,
    total_bytes: items.reduce((sum, item) => sum + item.byte_size, 0),
    mime_counts: mimeCounts,
    duplicate_checksum_groups: duplicates.length,
    pdf_page_count: items.filter(item => item.detected_mime === "application/pdf").reduce((sum, item) => sum + (item.structure.page_count || 0), 0),
    encrypted_pdf_count: encryptedPdfs.length,
    pdf_parser_error_count: pdfErrors.length,
    valid_equipment_sets: setChecks.filter(item => item.status === "valid").length,
  },
  equipment_set_checks: setChecks,
  duplicate_checksums: duplicates,
  items,
};
// The approval checksum intentionally excludes generation time and absolute
// workstation paths, so the same source bytes and mappings reproduce it.
const canonical = JSON.stringify({
  schema_version: manifest.schema_version,
  source_root_label: manifest.source_root_label,
  equipment_set_checks: manifest.equipment_set_checks,
  duplicate_checksums: manifest.duplicate_checksums,
  items: manifest.items,
});
manifest.manifest_checksum = createHash("sha256").update(canonical).digest("hex");

const md = [
  "# Data ingestion preflight inventory",
  "",
  `Generated: ${generatedAt}`,
  "",
  "This report is read-only. No Supabase upload and no Gemini request was performed.",
  "",
  "## Summary",
  "",
  `- Files: ${manifest.summary.total_files}`,
  `- Bytes: ${manifest.summary.total_bytes}`,
  `- PDF pages: ${manifest.summary.pdf_page_count}`,
  `- Duplicate checksum groups: ${manifest.summary.duplicate_checksum_groups}`,
  `- Encrypted PDFs: ${manifest.summary.encrypted_pdf_count}`,
  `- PDF parser errors: ${manifest.summary.pdf_parser_error_count}`,
  `- Valid equipment sets: ${manifest.summary.valid_equipment_sets}/8`,
  `- Manifest checksum: \`${manifest.manifest_checksum}\``,
  "",
  "## MIME counts",
  "",
  ...Object.entries(mimeCounts).map(([mime, count]) => `- ${mime}: ${count}`),
  "",
  "## Equipment-set checks",
  "",
  ...setChecks.map(item => `- Set ${item.set_number} · ${item.equipment.tag}: ${item.status} (${item.file_count}/12 files)${item.mismatches.length ? ` — ${item.mismatches.join("; ")}` : ""}`),
  "",
  "## Exceptions",
  "",
  `- Duplicate groups: ${duplicates.length || "None"}`,
  `- Encrypted PDFs: ${encryptedPdfs.length || "None"}`,
  `- PDF parser errors: ${pdfErrors.length || "None"}`,
  "",
  "The JSON manifest contains file-level checksums, detected MIME types, proposed processors, equipment mappings, and structural metadata. It is intentionally gitignored.",
  "",
].join("\n");

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "source-manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(outputRoot, "source-manifest.md"), md);
console.log(md);
