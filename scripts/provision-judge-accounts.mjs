import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();

function loadDotEnv() {
  try {
    const text = readFileSync(path.join(projectRoot, ".env"), "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const name = line.slice(0, index).trim();
      if (!(name in process.env)) process.env[name] = line.slice(index + 1).trim();
    }
  } catch { /* Environment variables may be supplied by the runner. */ }
}

loadDotEnv();

const definitions = [
  { role: "engineer", name: "Alex · Field Operator", email: "JUDGE_ENGINEER_EMAIL", password: "JUDGE_ENGINEER_PASSWORD" },
  { role: "reader", name: "Taylor · Field Observer", email: "JUDGE_READER_EMAIL", password: "JUDGE_READER_PASSWORD" },
  { role: "controller", name: "Sam · Control Room Admin", email: "JUDGE_CONTROLLER_EMAIL", password: "JUDGE_CONTROLLER_PASSWORD" },
  { role: "reviewer", name: "Morgan · Technical Reviewer", email: "JUDGE_REVIEWER_EMAIL", password: "JUDGE_REVIEWER_PASSWORD" },
].map(item => ({ ...item, emailValue: process.env[item.email]?.trim().toLowerCase(), passwordValue: process.env[item.password] }));

const argumentsList = process.argv.slice(2);
const apply = argumentsList.includes("--apply");
if (!argumentsList.length || argumentsList.some(argument => !["--apply", "--dry-run"].includes(argument)) || (argumentsList.includes("--apply") && argumentsList.includes("--dry-run"))) throw new Error("Use exactly one of --dry-run or --apply.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase URL and server-only service-role key are required.");
const missing = definitions.flatMap(item => [!item.emailValue && item.email, !item.passwordValue && item.password].filter(Boolean));
if (missing.length) throw new Error(`Judge account configuration is incomplete: ${missing.join(", ")}`);
if (new Set(definitions.map(item => item.emailValue)).size !== definitions.length) throw new Error("Each judge persona must use a distinct email address.");
for (const item of definitions) if (item.passwordValue.length < 12) throw new Error(`${item.password} must contain at least 12 characters.`);

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: listed, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`Unable to inspect Auth users: ${listError.message}`);

const plan = definitions.map(item => ({
  role: item.role,
  displayName: item.name,
  account: item.emailValue.replace(/(^.).*(@.*$)/, "$1•••$2"),
  action: listed.users.some(user => user.email?.toLowerCase() === item.emailValue) ? "update" : "create",
}));
console.table(plan);

if (!apply) {
  console.log("Dry run only. No accounts or grants were changed. Re-run with --apply after reviewing the target project.");
  process.exit(0);
}

const { data: equipment, error: equipmentError } = await db.from("equipment").select("id");
if (equipmentError) throw new Error(`Equipment registry is unavailable: ${equipmentError.message}`);
const { data: documents, error: documentError } = await db.from("document").select("id");
if (documentError) throw new Error(`Document registry is unavailable: ${documentError.message}`);

for (const item of definitions) {
  let user = listed.users.find(candidate => candidate.email?.toLowerCase() === item.emailValue);
  if (user) {
    const { data, error } = await db.auth.admin.updateUserById(user.id, { password: item.passwordValue, email_confirm: true, user_metadata: { ...user.user_metadata, display_name: item.name, judge_persona: item.role } });
    if (error) throw new Error(`Update ${item.role} Auth account: ${error.message}`);
    user = data.user;
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: item.emailValue, password: item.passwordValue, email_confirm: true, user_metadata: { display_name: item.name, judge_persona: item.role } });
    if (error) throw new Error(`Create ${item.role} Auth account: ${error.message}`);
    user = data.user;
  }

  const { error: profileError } = await db.from("app_user").upsert({ auth_user_id: user.id, display_name: item.name, role: item.role });
  if (profileError) throw new Error(`Assign ${item.role} profile: ${profileError.message}`);

  if (equipment.length) {
    const { error: accessError } = await db.from("equipment_access").upsert(equipment.map(record => ({ user_id: user.id, equipment_id: record.id })));
    if (accessError) throw new Error(`Grant ${item.role} equipment access: ${accessError.message}`);
    const { error: membershipError } = await db.from("role_membership").upsert(equipment.map(record => ({ user_id: user.id, equipment_id: record.id, role: item.role })));
    if (membershipError) throw new Error(`Assign ${item.role} equipment memberships: ${membershipError.message}`);
  }
  if (documents.length) {
    const { error: aclError } = await db.from("document_acl").upsert(documents.map(record => ({ user_id: user.id, document_id: record.id })));
    if (aclError) throw new Error(`Grant ${item.role} document access: ${aclError.message}`);
  }
}

console.log(`Provisioned ${definitions.length} connected judge personas with normal Supabase sessions and RLS grants.`);
