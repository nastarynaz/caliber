import "server-only";
import type { Role } from "@/lib/domain/types";

export const judgeRoles: Role[] = ["engineer", "reader", "controller", "reviewer"];

const environmentNames: Record<Role, { email: string; password: string }> = {
  engineer: { email: "JUDGE_ENGINEER_EMAIL", password: "JUDGE_ENGINEER_PASSWORD" },
  reader: { email: "JUDGE_READER_EMAIL", password: "JUDGE_READER_PASSWORD" },
  controller: { email: "JUDGE_CONTROLLER_EMAIL", password: "JUDGE_CONTROLLER_PASSWORD" },
  reviewer: { email: "JUDGE_REVIEWER_EMAIL", password: "JUDGE_REVIEWER_PASSWORD" },
};

export function judgePersonaAccessEnabled() {
  return process.env.JUDGE_DEMO_ENABLED === "true";
}

export function judgePersonaCredentials(role: string) {
  if (!judgePersonaAccessEnabled() || !judgeRoles.includes(role as Role)) return null;
  const names = environmentNames[role as Role];
  const email = process.env[names.email]?.trim();
  const password = process.env[names.password];
  if (!email || !password) return null;
  return { email, password, role: role as Role };
}
