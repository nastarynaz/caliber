import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { safeReturnPath } from "@/lib/domain/navigation";
import { snapshot } from "@/lib/data/store";
import { DomainError } from "@/lib/domain/workflow";
import { HubProvider } from "@/components/knowledge-hub/provider";
import { Shell } from "@/components/knowledge-hub/shell";
import { geminiEnabled } from "@/lib/gemini/grounding";
import { validCandraScope } from "@/lib/domain/assistant";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  let data;
  try { data = await snapshot(); } catch(e) {
    if (e instanceof DomainError && e.status === 401) redirect(`/login?next=${encodeURIComponent(safeReturnPath((await headers()).get("x-hub-return-path")))}`);
    if (e instanceof DomainError && [403, 503].includes(e.status)) return <main className="page-pad"><h1>{e.status === 403 ? "Access unavailable" : "Workspace not configured"}</h1><p>{e.message}</p><a href="/login">Return to sign in</a></main>;
    throw e;
  }
  const savedCandraScope = validCandraScope((await cookies()).get("kh_candra_scope")?.value, data.state.equipment.map(item => item.id));
  return <HubProvider key={`${data.actor.id}-${data.actor.role}`} actor={data.actor} initial={data.state} capabilities={{ gemini: geminiEnabled() }}><Shell initialCandraScope={savedCandraScope}>{children}</Shell></HubProvider>;
}
