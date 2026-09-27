import { Workspace } from "@/components/knowledge-hub/workspace";
export default async function Page({ params }: { params: Promise<{equipmentId: string}> }) { const {equipmentId} = await params; return <Workspace key={equipmentId} equipmentId={equipmentId}/>; }
