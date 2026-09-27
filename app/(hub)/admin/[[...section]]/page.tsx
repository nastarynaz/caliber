import {Admin} from "@/components/knowledge-hub/admin";
import { session } from "@/lib/data/store";
import { Empty } from "@/components/knowledge-hub/common";
export default async function Page({params}:{params:Promise<{section?:string[]}>}){
  const { actor } = await session();
  if (!["controller", "reviewer"].includes(actor.role)) return <Empty title="Access unavailable">Your assigned role does not include document governance. You can continue browsing permitted equipment and sources.</Empty>;
  return <Admin section={(await params).section}/>;
}
