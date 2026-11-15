import { pageUser } from "@/lib/auth";
import { StageTest } from "@/components/StageTest";

export default async function StagePage() {
  await pageUser();
  return <StageTest />;
}
