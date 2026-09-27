import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Imports pre-extracted, source-traceable material. Never exposes files in public/.
const project = process.cwd();
const parent = path.resolve(project, process.argv[2] || '..');
const schema = JSON.parse(await readFile(path.join(parent, 'tmp/dataops/schema.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(parent, 'tmp/pdfs/set01_text/manifest.json'), 'utf8'));
const examples = schema.examples;
const equipment = examples.equipment.map((e, i) => ({ id: e.equipment_id, tag: e.equipment_tag, name: e.equipment_name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), location: e.functional_location || '', area: i === 0 ? 'Feed preparation & purification' : 'Dataset identity only', set: String(i + 1).padStart(2, '0') }));
const files = {};
const documents = [];
await mkdir(path.join(project, 'data/files'), { recursive: true });
for (const version of examples.document_version) {
  const doc = examples.document.find(d => d.document_id === version.document_id);
  if (!version.file_uri.includes('Set_01')) continue;
  const original = path.join(parent, version.file_uri);
  const bytes = await readFile(original);
  const filename = version.version_id + path.extname(original);
  await copyFile(original, path.join(project, 'data/files', filename));
  let text = '';
  let preview = null;
  const m = manifest.find(x => x.path === version.file_uri);
  if (m) {
    const prefix = String(m.index).padStart(2, '0') + '_';
    const extracted = (await readdir(path.join(parent, 'tmp/pdfs/set01_text'))).find(f => f.startsWith(prefix) && f.endsWith('.txt'));
    if (extracted) text = (await readFile(path.join(parent, 'tmp/pdfs/set01_text', extracted), 'utf8')).split('\n').map(l => l.trim().replace(/ {2,}/g, ' ')).filter(Boolean).join('\n');
    const rendered = (await readdir(path.join(parent, 'tmp/pdfs/set01_render'))).find(f => f.startsWith(prefix) && f.endsWith('_p01.png'));
    if (rendered) { preview = version.version_id + '.png'; await copyFile(path.join(parent, 'tmp/pdfs/set01_render', rendered), path.join(project, 'data/files', preview)); }
  } else if (version.mime_type === 'image/png') preview = filename;
  files[version.version_id] = { filename, preview, sha256: createHash('sha256').update(bytes).digest('hex') };
  documents.push({ id: version.version_id, documentId: doc.document_id, title: doc.title.replace(' - GA-1201A', ''), number: doc.document_number || doc.document_id, type: doc.document_type, revision: version.source_revision || null, equipmentIds: ['EQP-000001'], source: version.file_uri, filename: path.basename(original), mime: version.mime_type, checksum: files[version.version_id].sha256, processing: text || preview ? 'succeeded' : 'queued', metadata: 'incomplete', review: 'not_submitted', publication: 'unpublished', indexing: 'not_started', applicability: 'candidate', access: 'team', owner: '', purpose: '', text, events: [] });
}
const history = examples.maintenance_event.map(h => ({ id: h.record_id, equipmentId: 'EQP-000001', wo: h.wo_number, date: h.report_at, type: h.work_type, symptom: h.problem_description, cause: h.root_cause_text, action: h.corrective_action, downtime: h.downtime_hours == null ? null : Number(h.downtime_hours), cost: h.total_cost_idr == null ? null : Number(h.total_cost_idr), source: h._source_ref }));
await writeFile(path.join(project, 'data/catalog.json'), JSON.stringify({ revision: 0, equipment, documents, history, cases: [], issues: [], audit: [] }, null, 2));
await writeFile(path.join(project, 'data/file-manifest.json'), JSON.stringify(files, null, 2));
console.log(`Imported ${equipment.length} equipment identities, ${documents.length} Set 01 sources, ${history.length} maintenance records. All documents need metadata confirmation and review.`);
