import { mode } from "@/lib/data/store";
import { Login } from "@/components/knowledge-hub/login";
import { judgePersonaAccessEnabled } from "@/lib/auth/judge-personas";
export const dynamic = "force-dynamic";
export default function Page() { return <Login mode={mode()} judgeAccessEnabled={judgePersonaAccessEnabled()}/>; }
