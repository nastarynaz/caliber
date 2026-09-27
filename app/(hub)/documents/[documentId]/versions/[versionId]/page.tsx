import { DocumentPage } from "@/components/knowledge-hub/evidence";
export default async function Page({ params }: { params: Promise<{documentId: string; versionId: string}> }) { return <DocumentPage {...await params}/>; }
