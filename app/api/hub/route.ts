import { snapshot, mutate } from "@/lib/data/store";
import { apiError, checkOrigin, readJson } from "@/lib/data/http";
export async function GET() { try { return Response.json(await snapshot(), { headers: { "Cache-Control": "private, no-store" } }); } catch (e) { return apiError(e); } }
export async function POST(request: Request) { try { checkOrigin(request); return Response.json(await mutate(await readJson(request))); } catch (e) { return apiError(e); } }
