import QRCode from "qrcode";
import { snapshot } from "@/lib/data/store";
import { apiError } from "@/lib/data/http";
import { DomainError } from "@/lib/domain/workflow";
export async function GET(request: Request) { try { const {state} = await snapshot(); const url = new URL(request.url); const id = url.searchParams.get("equipment"); if(!state.equipment.some(e => e.id === id)) throw new DomainError("Equipment unavailable.",404); const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin; const svg = await QRCode.toString(`${base}/equipment/${id}`, {type:"svg", width:240, margin:2}); return new Response(svg,{headers:{"Content-Type":"image/svg+xml","Cache-Control":"private, no-store"}}); } catch(e) {return apiError(e);} }
