import type { ReactNode } from "react";
import { FileText, ArrowUpRight } from "lucide-react";
import type { DocumentVersion } from "@/lib/domain/types";
export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" }) { return <span className={`status status-${tone}`}><i/>{children}</span>; }
export function DocStatus({ doc }: { doc: DocumentVersion }) {
  if (doc.publication === "withdrawn") return <Status tone="red">Withdrawn</Status>;
  if (doc.applicability === "superseded") return <Status>Superseded</Status>;
  if (doc.indexing === "ready") return <Status tone="green">Demo published</Status>;
  if (doc.review === "approved") return <Status tone="green">Demo approved</Status>;
  if (doc.review === "pending") return <Status tone="amber">Awaiting review</Status>;
  return <Status tone="amber">Source · needs review</Status>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty-state"><FileText size={27} strokeWidth={1.3}/><h3>{title}</h3><p>{children}</p></div>; }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>; }
export function SourceLink({ href, children }: { href: string; children: ReactNode }) { return <a className="source-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={14}/></a>; }
export function formatDate(date: string) { return date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date)) : "Not recorded"; }
