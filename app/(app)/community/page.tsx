import { pageUser } from "@/lib/auth";
import { Community } from "@/components/Community";

export default async function CommunityPage() {
  await pageUser();
  return <Community />;
}
