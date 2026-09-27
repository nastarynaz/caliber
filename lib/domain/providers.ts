import type { Citation } from "./types";

// Integration boundary only: no external request is made by this module.
// The caller must authenticate, enforce ACLs and eligibility before constructing passages.
export type AuthorizedPassage = {
  id: string; versionId: string; equipmentIds: string[]; extractionRunId: string;
  page: number; text: string; citation: Citation; category?: "approved_reference" | "reviewed_case" | "historical_record";
};
export interface AnswerProvider {
  readonly name: string;
  generate(input: { question: string; scope: string[]; passages: readonly AuthorizedPassage[]; signal: AbortSignal }): Promise<{
    text: string; evidence: string; limitations: string; citationIds: string[];
  }>;
}
export interface ProcessingWorker {
  extract(input: { jobId: string; versionId: string; checksum: string; bytes: Uint8Array; signal: AbortSignal }): Promise<{
    method: string; pages: { page: number; text: string }[];
  }>;
  embed(input: { jobId: string; text: string[]; signal: AbortSignal }): Promise<{
    model: string; dimensions: number; vectors: number[][];
  }>;
}
export function validateCitations(ids: string[], passages: readonly AuthorizedPassage[]): Citation[] {
  const allowed = new Map(passages.map(p => [p.id, p.citation]));
  return [...new Set(ids)].map(id => {
    const citation = allowed.get(id);
    if (!citation) throw new Error("Provider returned a citation outside the authorized retrieval set.");
    return citation;
  });
}
