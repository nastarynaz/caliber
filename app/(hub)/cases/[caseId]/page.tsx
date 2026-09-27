import {CaseDetail} from "@/components/knowledge-hub/cases";
export default async function Page({params}:{params:Promise<{caseId:string}>}){return <CaseDetail id={(await params).caseId}/>;}
