import { pageUser } from "@/lib/auth";
import { Situations } from "@/components/Situations";

export default async function SituationsPage() {
  await pageUser();
  return <Situations />;
}
