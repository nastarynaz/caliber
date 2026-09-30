# Control Room Knowledge Hub — Master Implementation Prompt

Revision 1 — 29 September 2026

This document is the implementation prompt for the next Control Room evolution of the existing Manufacturing Knowledge Hub. It complements `docs/MASTER_PROMPT.md` and takes precedence where it gives a newer, more specific requirement for `/equipment`, equipment parameters, QR identification, field workflow, and the future positioning architecture.

## How to use

Open the `knowledge-hub` workspace and instruct the coding agent to read this document, the root `AGENTS.md`, and the installed `emil-design-eng` skill before implementation. Implement the product, not only a visual mockup.

---

## BEGIN MASTER PROMPT

You are a senior product engineer, industrial data architect, process-safety-aware UX designer, and AI/RAG engineer.

Implement the following requirements inside the existing Next.js Knowledge Hub project. Do not rebuild the project from scratch. Inspect the current architecture, components, Supabase integration, Gemini integration, SVG equipment components, document workflows, role system, onboarding, and existing tests before making changes.

Use the installed Emil Design Engineering skill for interaction quality and visual polish. Avoid AI slop: no excessive cards, gradients, floating decorative elements, giant headings, meaningless pills, fake metrics, or dashboard clutter.

### 1. Primary product objective

Transform the current Knowledge Hub into an equipment-centered industrial operations workspace for Chandra Asri with two principal user groups.

#### Controller / Admin

- Works primarily from the Control Room.
- Monitors the eight equipment sets and their process parameters.
- Reviews automatically extracted parameter candidates.
- Governs documents, metadata, thresholds, and knowledge records.
- Creates and dispatches deviations to field operators.

#### Field Operator

- Receives deviation tasks.
- Uses QR identification during the pilot.
- Performs field verification.
- Enters readings manually when automatic values are unavailable.
- Resolves a deviation or creates and escalates a report.

Pilot priorities, in order:

1. Global Gemini AI with evidence-grounded RAG.
2. Equipment QR generation and mobile QR scanning.
3. Real document ingestion, not fabricated documents.
4. Editable equipment parameter and knowledge databases.
5. Controller-to-Operator deviation workflow.

Future development adds sensor-assisted operator positioning and equipment proximity. It must be architected now but must not be represented as operational in the pilot.

### 2. Source of truth

Use the workbook below as the functional reference:

```text
../Data/[1A] CTRL ROOM_DEVIATION TEST.xlsx
```

From the parent workspace this is:

```text
Data/[1A] CTRL ROOM_DEVIATION TEST.xlsx
```

Use it for:

- Control Room information hierarchy.
- What-if calculations.
- Equipment parameters.
- Normal, advisory, and critical thresholds.
- SIL and voting metadata.
- Priority scoring.
- Engineering governance.
- Source-quality classifications.
- First-response recommendations.
- Process topology and equipment relationships.
- Engineering graph definitions.

Do not reproduce the spreadsheet visually. Translate its information model into a focused, modern industrial interface.

The workbook contains two logical tabs:

1. Control Room.
2. What If.

Preserve these as the primary tabs on `/equipment`.

### 3. Data governance

The workbook contains `TRAINING`, `VERIFIED`, `SCREENING`, `BLOCKED`, and `SOURCE ERROR EXPOSED` information. Preserve these classifications.

Never present:

- Training C&E values as approved plant setpoints.
- Screening calculations as verified engineering results.
- Historical work orders as proof of a current root cause.
- AI responses as operational authority.
- Simulated values as live DCS or historian values.

Normalize inconsistent workbook columns before import. Keep `engineering_note` and `status` as separate fields even where the spreadsheet layout appears shifted.

Preserve imported raw values and provenance. Corrections create reviewed revisions rather than silently overwriting source values. Never convert null, unknown, blocked, or unavailable values to zero.

### 4. Routing and entry flow

- `/` redirects to `/equipment`.
- Successful login redirects to `/equipment`.
- Do not automatically redirect to `/equipment/EQP-000001`.
- `/equipment` is the primary Control Room dashboard.
- Keep `/equipment/[equipmentId]` for equipment detail and permanent identification links.
- Add `/scan` for field identification.
- Keep document, report, case, review, and admin routes as required.

Top-level desktop navigation:

- Control Room.
- Documents.
- Reports / Deviations.
- Admin, visible only to authorized roles.

AI is global, not an isolated page. A persistent Ask AI action opens a desktop side panel or mobile bottom sheet from any workspace.

Within `/equipment`, provide two primary tabs:

1. Control Room.
2. What If.

Within Control Room, provide one compact scenario control:

- Ideal Case.
- Non-Ideal Case.

Do not create four unrelated top-level tabs.

### 5. Control Room dashboard

`/equipment` is a top-down operational view of all eight equipment sets:

| Set | Equipment tag | Equipment |
| --- | --- | --- |
| 01 | GA-1201A | Hexane Feed Pump |
| 02 | YD-2301 | Polymer Fluid Bed Dryer |
| 03 | DC-3401A | Catalyst Reduction Reactor |
| 04 | KC-4501 | Recycle Gas Compressor |
| 05 | EA-5601 | Solvent Heater |
| 06 | LV-6701 | Separator Level Control Valve |
| 07 | CT-7801 | Cooling Tower Cell Fan |
| 08 | FA-8901 | Reflux Accumulator Drum |

#### Compact system header

Show:

- Overall state: Normal, Advisory, Critical, or Active Report.
- Current scenario.
- Production-load factor.
- Highest-priority limiting deviation.
- Data-connection state.
- A clear Simulated, Disconnected, or Connected label.

#### P&ID-inspired canvas

- Make equipment the visual center of attention.
- Reuse the existing code-native SVG illustrations.
- Preserve the approved P&ID-derived coordinates and routing.
- Distinguish process/product, recycle, and utility connections.
- Put equipment tag and short name below the symbol.
- Do not wrap every equipment symbol in a large card.
- Communicate status using restrained fills, outlines, and small indicators.
- Clicking equipment opens `/equipment/[equipmentId]`.
- Selecting a deviation focuses the related equipment.

#### Active deviation lane

Sort by priority and show:

- Equipment.
- Parameter and instrument tag.
- Actual value and unit.
- Normal envelope.
- State.
- Priority.
- SIL/voting.
- Engineering interpretation.
- First verification step.

#### Transparent priority diagnosis

Do not show an unexplained AI score. Expose:

- Safety severity.
- Deviation magnitude.
- Equipment criticality.
- SIL dependency.
- Cascade exposure.
- Historical/training evidence.
- Data-gap exposure.

Preserve the workbook's `/21` score and normalized `/10` score where useful.

#### Global AI entry

- Default context is all eight equipment sets.
- Users can narrow context to an equipment, deviation, parameter, or selected document.

### 6. Figma-like process canvas

The canvas should feel like navigating a Figma canvas while preserving engineering topology.

Required behavior:

- Drag empty canvas to pan.
- Trackpad or wheel to zoom.
- Touch pan and pinch zoom where practical.
- Visible zoom in, zoom out, reset, and fit-to-view controls.
- Keyboard controls with accessible labels.
- Sensible zoom limits.
- Preserve the viewport during normal interaction.
- Use pointer capture during panning.
- Prevent accidental text selection while panning.
- Use transform-based rendering.
- Respect `prefers-reduced-motion`.

Equipment nodes remain fixed in normal mode. “Draggable canvas” means draggable viewport, not freely movable equipment.

If layout editing is required, provide a separate Controller-only Edit Layout mode with Save, Cancel, validation, and an audit record.

Use SVG and accessible DOM overlays, not a bitmap drawing. Lines and equipment must remain sharp at every zoom level.

### 7. Reusable equipment visuals

Use one canonical `EquipmentVisual` component for:

- Main Control Room canvas.
- Equipment detail page.
- Search results.
- Deviation views.
- QR landing page.
- Mobile equipment summary.

Do not maintain separate equipment drawings for canvas and detail views.

### 8. Ideal and Non-Ideal cases

#### Ideal Case

- Use approved/base scenario values.
- Equipment is Healthy only when all governed parameters are inside their normal envelope and no unresolved critical report exists.
- Never imply a live DCS connection.

#### Non-Ideal Case

- Load controlled scenario values.
- Calculate status deterministically.
- Advisory equipment becomes amber.
- Critical equipment becomes red.
- Active Report remains distinct from process severity.
- Show cascade exposure without falsely declaring downstream equipment critical.
- Selecting a deviation opens its parameter, sources, previous cases, field task, and AI context.

Provide a controlled scenario reset. Scenario data must never overwrite governed values or field readings.

### 9. Parameter registry

Create an editable parameter database with:

- Parameter ID.
- Equipment ID and tag.
- Group/type.
- Instrument tag.
- Parameter name.
- Unit.
- Base/ideal value.
- Current/manual value.
- Normal minimum and maximum.
- Advisory threshold.
- Critical threshold.
- Direction: `HIGH`, `LOW`, or `N/A`.
- Voting architecture.
- SIL classification.
- Source class.
- Engineering note.
- Model driver: `MANUAL`, `LOAD`, `CALCULATED`, or `CONNECTOR`.
- Current status.
- Priority score.
- Confidence.
- Source document, version, page, and workbook locator.
- Review status.
- Valid-from timestamp.
- Last-updated actor and timestamp.

Import these 38 initial parameter records:

#### GA-1201A

- PSLL-1201 — Suction pressure.
- FT-1201 — Discharge flow.
- VSHH-1201 — Bearing vibration.
- TSHH-1201 — Bearing temperature.
- PDI-1201 — Seal-flush differential pressure.

#### YD-2301

- FT-2302 — Nitrogen purge flow.
- AT-2307 — Vent oxygen.
- TSHH-2301 — Outlet temperature.
- SSLL-2305 — Drum speed.
- MT-2306 — Outlet moisture.
- PT-2304 — LP steam pressure.

#### DC-3401A

- FT-17343 — Nitrogen carrier flow.
- AI-3401 — Outlet oxygen.
- TE-3401-SPREAD — Bed temperature spread.
- PSHH-3404 — Reactor pressure.
- H2-FLOW — Hydrogen admission flow.
- TE-3401-1 through TE-3401-8 — Bed temperature points.

#### KC-4501

- PSLL-4504 — Lube-oil pressure.
- PD-TEMP-4501 — Discharge temperature.
- CAP-4501 — Recycle gas capacity.
- PSUC-4501 — Suction pressure.

#### EA-5601

- PDT-5605 — Tube-side differential pressure.
- DUTY-5601 — Heat-transfer duty.

#### LV-6701

- PI-6702 — Instrument-air pressure.
- LSHH-6710 — Separator level, high side.
- LSLL-6710 — Separator level, low side.
- VALVE-POS-ERROR — Command/feedback error.

#### CT-7801

- FAN-SPEED — Fan speed.
- CW-FLOW — Cooling-water flow.

#### FA-8901

- PRESS-8901 — Accumulator pressure.
- LEVEL-8901 — Accumulator level.

Controllers can add, edit, archive, submit, compare, approve, and reject parameter revisions. They can inspect the exact source passage that produced an AI candidate. Operators can submit readings, observations, photos, and notes but cannot change governed limits or SIL metadata.

Status is calculated by deterministic server-side rules from published thresholds. Gemini may explain status but must not decide it.

### 10. What If workspace

Support:

- Scenario name.
- Production-load factor.
- Ideal/base value.
- Manual input.
- Scenario actual.
- Normal range.
- Advisory and critical thresholds.
- Model driver.
- Calculated status.
- Per-equipment priority.
- Effect-chain visualization.
- First-principles calculations.
- Source-QA warnings.

Production-load changes affect only parameters marked `LOAD`.

Validate impossible or suspicious values. The workbook demonstrates extreme results at a `10×` load factor; never silently present these as realistic operating values.

Show raw value, unit, normalized envelope percentage, calculation, source class, and whether the result is verified, screening-only, training-only, blocked, or corrected.

### 11. Control Room engineering graphs

Recreate the graph logic defined in the workbook. Graph values must come from governed parameter records produced by a controlled importer. Do not parse the workbook in the browser or hardcode a second set of values in React.

The importer retains:

- Workbook filename.
- Worksheet and cell/row locator.
- Original raw value.
- Normalized value.
- Import version and timestamp.
- Review status.

Provide graph groups for all eight areas/equipment.

#### Normalized-envelope graphs

For GA-1201A, YD-2301, KC-4501, EA-5601, LV-6701, CT-7801, and FA-8901:

- Use compact bullet charts, range bars, or dot plots.
- Do not connect unrelated physical quantities with a continuous line.
- Normalize each actual against its normal envelope:
  - `0%` is normal minimum.
  - `100%` is normal maximum.
  - Less than `0%` is below the envelope.
  - Greater than `100%` is above the envelope.
- Always retain raw value and unit in labels/tooltips.
- Show normal, advisory, and critical ranges.
- Do not hide extreme values by clamping. If visual clamping is necessary, show an overflow marker and exact value.
- Indicate whether deviation direction is HIGH, LOW, or N/A.

#### DC-3401A reactor profile

- Plot the actual values of TE-3401-1 through TE-3401-8 in °C.
- Show normal-minimum, normal-maximum, advisory, and critical-high reference lines.
- Show calculated temperature spread.
- Do not smooth or interpolate between measurement points.
- A missing thermocouple is missing data, never zero.

#### Graph interaction

Graphs update when scenario, production load, published parameter revision, field reading, or governed connector value changes.

Hover or keyboard focus reveals:

- Equipment and instrument tag.
- Parameter.
- Raw value and unit.
- Normal, advisory, and critical limits.
- Status.
- Source classification and citation.
- Last-updated timestamp.

Selecting a graph point opens parameter detail and offers:

- Ask AI about this parameter.
- View source.
- Create field check, when authorized.

Graph focus synchronizes with the canvas. Provide an accessible tabular equivalent for every graph.

Placement:

- `/equipment` shows a compact Parameter Overview beneath the canvas and deviation lane.
- Default to the selected or highest-priority equipment.
- All Equipment uses concise small multiples and progressive disclosure.
- `/equipment/[equipmentId]` shows the complete equipment graph, values, readings, and sources.
- What If graphs update immediately but never overwrite governed values.

Every graph shows its data mode: Scenario, Manual Field Reading, Imported Workbook Value, Simulated Connector, or Live Connector. Never use “Live” without a verified authenticated connector, mapping, timestamp, and data-quality state.

Display:

> Engineering aid—not a live SIS/DCS display. Verify current controlled plant documents and field conditions before operational use.

Do not use random graph data, fake time series, or decorative waveforms.

### 12. Document ingestion and parameter extraction

Use actual documents already present in the workspace. Do not create fake PDFs, fake work orders, synthetic maintenance history, or placeholder source documents.

Pipeline:

1. Upload original file to private Supabase Storage.
2. Calculate checksum and detect duplicates.
3. Create immutable document and version records.
4. Extract text/OCR with page locators.
5. Chunk with page-level provenance.
6. Generate embeddings.
7. Link to one or more equipment records.
8. Use Gemini structured output to propose equipment identity, tags, parameters, units, limits, SIL/voting, procedures, failure modes, and inspection steps.
9. Store proposals as candidates.
10. Require Controller review before publication.

Immediately after upload, open metadata editing for title, number, revision, type, equipment links, effective date, source owner, confidentiality, tags, and extracted candidates.

Original document and original extraction remain immutable. When local source files cannot ship with Vercel, provide an authenticated import script for private Supabase Storage; never replace them with fabricated data.

### 13. Equipment knowledge database

Each equipment has an editable knowledge workspace containing:

- Published parameters.
- Document versions.
- Procedures and One Point Lessons.
- Failure modes and safeguards.
- Inspection points.
- Maintenance history.
- Resolved reports.
- Known data gaps.
- AI-extracted candidates.
- Source citations.
- Review status and revision history.

Search by equipment tag, instrument tag, document number, title, type, parameter, failure mode, and full-text content.

Lifecycle:

```text
Upload
→ Metadata edit
→ Extraction/OCR
→ Chunking
→ Gemini structured extraction
→ Candidate records
→ Controller review
→ Publish
→ Embed/index
→ Available to RAG
→ Superseded by reviewed revision
```

### 14. Gemini AI and RAG

Gemini is called through server-side routes only. Never expose `GEMINI_API_KEY` to the browser.

Capabilities:

- Stream answers in real time.
- Ask across all equipment.
- Narrow to equipment, parameter, deviation, or documents.
- Search documents.
- Explain parameter status and limits.
- Compare actual, normal, advisory, and critical values.
- Retrieve procedures and historical cases.
- Suggest verification questions.
- Support a “Has the issue been solved?” closure interaction.

Every answer:

- Is grounded in authorized retrieved evidence.
- Cites title, revision, page/record, and equipment.
- Distinguishes approved, verified, screening, training, historical, and blocked sources.
- States when evidence is insufficient.
- Never invents live trends.
- Never claims a current root cause from similarity alone.
- Never overrides SIS, SOP, SRS, C&E, permits, LOTO, or approved procedures.
- Avoids unsafe operational instructions.

Solved issues require resolution notes and before/after readings. Preserve the complete timeline. Return equipment to Healthy only when deterministic conditions are satisfied and no unresolved critical report remains.

Unsolved issues create a report and escalation. AI conversation is supporting context, never authoritative evidence.

Use Supabase/Postgres with pgvector or the existing supported vector mechanism. Filter retrieval by equipment, document status, ACL, source class, and active revision.

### 15. Equipment identification — QR pilot

QR is the active pilot method because it is practical and does not require positioning infrastructure.

Every equipment has:

- Stable QR identity based on permanent equipment ID.
- Controller download/print action.
- Operator Scan action.
- Deep link to `/equipment/[equipmentId]`.
- Mobile landing view with equipment identity, visual, deviation, assigned task, checklist, and Check action.

`/scan` must:

- Request camera permission only after an explicit action.
- Show permission-denied guidance.
- Support torch/camera switching when available.
- Allow manual equipment-tag entry.
- Validate that QR content belongs to the application.
- Block arbitrary external redirects.
- Give visual or haptic confirmation.
- Suppress repeated scans while processing.
- Warn when scanned equipment differs from the assigned task.

QR confirms identity. It does not prove the Operator is in a safe location or that equipment is safe to approach.

### 16. Future development — sensor-based positioning

Architect, but do not activate, sensor-assisted indoor positioning. The future objective is to:

- Determine an Operator's approximate plant position.
- Identify nearby equipment.
- Show the assigned target.
- Estimate direction and distance.
- Reduce the need to approach equipment only to identify it.
- Support identification from an appropriate distance.
- Retain QR and manual fallback.

Use a vendor-neutral provider abstraction such as:

```ts
interface EquipmentLocatorProvider {
  identify(input: LocatorInput): Promise<EquipmentIdentificationResult>;
}
```

Potential providers:

- `QrLocatorProvider` — active in pilot.
- `ManualLocatorProvider` — active in pilot.
- `SimulatedLocatorProvider` — optional, clearly labeled.
- `UwbLocatorProvider` — future/disabled.
- `BleLocatorProvider` — future/disabled.
- Future RFID, NFC, fixed-gateway, wearable, or other site-approved providers.

Normalize every method into:

- Equipment ID.
- Identification method.
- Confidence.
- Timestamp and freshness.
- Operator confirmation.
- Task match/mismatch.
- Evidence metadata.

The Controller–Operator workflow must depend on the normalized result, not directly on QR.

Future location model may support:

- Provider and sensor/beacon identity.
- Equipment ID.
- Plant area and zone.
- X/Y/Z or approved location reference.
- Operator approximate position.
- Accuracy/confidence radius.
- Distance to equipment.
- Signal timestamp/freshness.
- Sensor health.
- Mapping and calibration version.
- Hazard-zone classification.
- Approved approach/observation point.
- Permission and consent state.

Suggested future entities:

- `plant_area`.
- `plant_zone`.
- `equipment_location`.
- `equipment_locator`.
- `locator_reading`.
- `operator_position`.
- `approved_approach_point`.
- `location_provider`.
- `location_audit_event`.

Do not collect continuous personnel-location data in the pilot. Future retention needs explicit privacy, security, labor, and site-governance approval.

Future UI may show current approximate location, assigned equipment, nearest equipment, direction, distance, confidence, signal age, stale/unavailable state, approved observation point, and QR/manual fallback.

Never infer “safe to approach” from proximity. Future positioning must not:

- Route through restricted or hazardous zones.
- Replace permits, gas testing, LOTO, PPE, or site procedures.
- Claim unvalidated accuracy.
- Close tasks from proximity alone.
- Treat stale location as current.
- Track workers invisibly.
- Expose personnel locations to unauthorized users.

Any future navigation must use approved walkways, access rules, hazard zones, and emergency restrictions. Straight-line distance is not an approved route.

### 17. Controller–Operator workflow

Implement one persisted state machine.

Controller:

1. Monitor equipment.
2. Detect or create a deviation.
3. Review parameter and evidence.
4. Create field-verification task.
5. Dispatch to an Operator.
6. Monitor acknowledgment and progress.
7. Review readings and evidence.
8. Close, return, or escalate.

Operator:

1. Receive task.
2. Confirm whether identification and task context are correct.
3. If Yes, identify equipment via pilot QR and perform Check.
4. If No, use Manual Input and explain why identification failed.
5. Both paths meet at “Solved?”
6. If Yes, submit resolution, readings, and evidence.
7. If No, create Report and Escalate.

Suggested states:

```text
detected
awaiting_dispatch
dispatched
acknowledged
identification_confirmed
field_check_in_progress
awaiting_operator_input
resolution_proposed
awaiting_controller_review
resolved
report_created
escalated
closed
cancelled
```

Do not model workflow as disconnected booleans.

### 18. Mobile UX

Desktop keeps side navigation. Mobile uses a fixed bottom navigation with no more than five destinations:

- Overview.
- Tasks.
- Identify — visually central and primary.
- AI.
- More.

The label is Identify, not permanently Scan, because the future architecture supports multiple identification methods.

Pilot Identify offers:

- Scan QR.
- Enter equipment tag manually.

Future disabled/feature-flagged actions may include:

- Detect nearby equipment.
- Navigate to assigned equipment.

Do not present future actions as available.

Mobile requirements:

- Respect safe-area insets.
- Never cover content with the bottom bar.
- Use at least 44×44 px touch targets.
- Support one-handed QR and field input.
- Use bottom sheets for AI and quick actions.
- Show concise equipment/deviation lists before a complex canvas.
- Convert tables to focused or stacked mobile views.

### 19. Demonstration connectors

Provide connector UI for DCS, Historian, CMMS, laboratory data, and condition monitoring.

Allowed states:

- Simulated.
- Not connected.
- Configuration required.
- Connected.

Never display a fake Live badge. A demonstration connector may show setup, test configuration, simulate an explicitly labeled connection, create labeled sample events, and demonstrate tag-to-parameter mapping.

Connector status is separate from equipment health.

### 20. Supabase model

Extend, do not blindly replace, the existing schema. Support normalized equivalents of:

- `equipment`.
- `equipment_parameter`.
- `parameter_revision`.
- `parameter_reading`.
- `parameter_source`.
- `deviation`.
- `deviation_event`.
- `field_task`.
- `field_check`.
- `report`.
- `escalation`.
- `document`.
- `document_version`.
- `document_chunk`.
- `knowledge_item`.
- `knowledge_revision`.
- `extraction_candidate`.
- `equipment_document`.
- `equipment_identity` or `equipment_locator`.
- `connector`.
- `connector_tag_mapping`.
- `audit_event`.
- `app_user`.
- `user_role`.

Equipment identification must be provider-agnostic. QR is one locator/identity method resolving to the permanent equipment ID.

Require:

- Permanent IDs and foreign keys.
- Row Level Security.
- Controller and Operator permissions.
- Immutable audit events.
- Soft archival where history is required.
- Revision-based publication.
- Server-side validation.
- Optimistic concurrency.
- Private file storage and signed access.
- No service-role or Gemini secret in client code.

### 21. Visual design and interaction quality

Build a calm, precise industrial interface using:

- Neutral warm or cool canvas.
- Fine engineering grid.
- Dark process lines.
- Restrained green, amber, red, and blue.
- Monospace only for identifiers, tags, values, units, and references.
- Clear hierarchy and compact operational density.
- Large, legible equipment SVGs.
- Text subordinate to equipment visuals.
- Borders only where they clarify grouping.
- Whitespace between functional zones.

Avoid:

- Large rounded cards everywhere.
- Strong shadows.
- Decorative gradients.
- Excessive pills.
- Giant marketing typography.
- Neon/cyberpunk styling.
- Fake waveforms.
- Constant pulsing alerts.
- Unnecessary animation.

Interaction guidance:

- Button press feedback: approximately 100–160 ms.
- Tooltip/popover: approximately 125–200 ms.
- Animate transform and opacity.
- Use purposeful ease-out curves.
- Use origin-aware popovers.
- Gate hover behind hover-capable devices.
- Respect reduced motion.
- Never use `transition: all`.
- Do not animate keyboard navigation.
- Make status changes immediate and readable.

### 22. Safety and trust

Show this persistent but unobtrusive disclaimer:

> This interface is an engineering knowledge and training workspace. It is not a live DCS/SIS display and does not replace approved plant procedures, C&E, SRS, permits, isolation, or field verification.

Clearly label every scenario, simulated connector, and future capability.

### 23. Acceptance criteria

Implementation is complete only when:

1. `/` and successful login open `/equipment`.
2. `/equipment` shows all eight equipment sets.
3. Control Room and What If tabs work.
4. Ideal and Non-Ideal modes change governed status.
5. Canvas supports pan, zoom, reset, and fit-to-view.
6. Equipment topology remains aligned with approved coordinates/routing.
7. One SVG component is reused across canvas and detail views.
8. All 38 workbook parameter records are imported with provenance.
9. Controllers can edit candidates and publish reviewed revisions.
10. Operators cannot edit governed thresholds.
11. Actual documents are imported without fabricated replacements.
12. Upload immediately opens metadata editing.
13. Gemini streams answers with valid citations.
14. Gemini refuses unsupported conclusions.
15. Search finds documents by equipment and tag.
16. QR resolves to the correct permanent equipment route.
17. Mobile camera scanning works with manual fallback.
18. Controller-to-Operator workflow persists.
19. Healthy status returns only under valid deterministic conditions.
20. Unresolved deviations create reports and escalations.
21. Mobile bottom navigation does not cover content.
22. RLS blocks unauthorized reads and writes.
23. Build, lint, type-check, unit, and relevant browser tests pass.
24. No secret appears in client bundles.
25. No simulated value is presented as live plant data.
26. Source-derived graphs exist for all eight equipment sets.
27. Seven equipment groups use normalized envelopes while retaining raw values and units.
28. DC-3401A shows its actual eight-point reactor profile.
29. Graphs update across Ideal, Non-Ideal, and What If modes.
30. Every graph has an accessible table equivalent.
31. Graphs use governed imported records, not duplicated UI constants.
32. QR is the active pilot identification method.
33. Identification is provider-agnostic and resolves to permanent equipment ID.
34. Sensor positioning is feature-flagged and never presented as operational.
35. Proximity never implies safe approach.
36. QR and manual identification remain future fallbacks.

### 24. Implementation process

Before coding:

1. Read root and nested instructions.
2. Inspect the repository and existing database schema.
3. Read relevant installed Next.js documentation.
4. Inventory actual source documents.
5. Inspect workbook structure, formulas, and graph definitions.
6. Map reusable components.
7. Produce a concise implementation and migration plan.
8. Preserve existing working features and user data.

Implement incrementally:

1. Data model and migrations.
2. Workbook parameter importer with provenance.
3. Routing and Control Room shell.
4. Interactive equipment canvas.
5. Parameter editor, deterministic status engine, and What If engine.
6. Source-derived graphs.
7. Document ingestion and extraction review.
8. Gemini RAG and streaming.
9. QR generation and scanner.
10. Provider-agnostic identification layer.
11. Deviation workflow.
12. Mobile navigation.
13. Production verification.

Do not stop after producing mock UI. Implement persistence, access control, import, review, retrieval, and the working Controller–Operator flow.

Do not silently claim future sensor functionality is complete. The pilot path is:

```text
QR or manual identification
→ equipment confirmation
→ field check
→ solved or report/escalate
```

The future path is:

```text
sensor-assisted position/proximity
→ current / nearest / target equipment
→ operator confirmation
→ QR or manual fallback
→ the same field-check workflow
```

## END MASTER PROMPT
