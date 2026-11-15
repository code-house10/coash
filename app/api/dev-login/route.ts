import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { signIn } from "@/lib/auth";

/** Local testing only: signs in as the first account without a password. Dead in production builds. */
export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.DEV_AUTO_LOGIN !== "1") return new Response("Not found", { status: 404 });
  const u = get<{ id: number }>("SELECT id FROM users ORDER BY id LIMIT 1");
  if (!u) redirect("/login");
  await signIn(u.id);
  redirect("/");
}
