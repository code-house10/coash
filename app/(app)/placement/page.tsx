import { redirect } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { Placement } from "@/components/Placement";

export default async function PlacementPage({ searchParams }: { searchParams: Promise<{ retake?: string }> }) {
  const u = await pageUser(false);
  if (u.level && !(await searchParams).retake) redirect("/");
  return <Placement name={u.name} profile={u.profile} />;
}
