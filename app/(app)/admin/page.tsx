import { redirect } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { Admin } from "@/components/Admin";

export default async function AdminPage() {
  const u = await pageUser(false);
  if (!u.is_admin) redirect("/");
  return <Admin />;
}
