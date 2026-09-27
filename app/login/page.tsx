import { mode } from "@/lib/data/store";
import { Login } from "@/components/knowledge-hub/login";
export const dynamic = "force-dynamic";
export default function Page() { return <Login mode={mode()}/>; }
