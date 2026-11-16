import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { hash, signIn, OPEN } from "@/lib/auth";

/** Personal mode (OPEN_ACCESS=1): no sign-in page. Every visitor is signed in as the owner account. */
export async function GET() {
  if (!OPEN) return new Response("Not found", { status: 404 });
  let u = await get<{ id: number }>("SELECT id FROM users ORDER BY id LIMIT 1");
  // First visit: create the owner with an unguessable password (never needed while open access is on).
  if (!u) u = { id: (await run("INSERT INTO users (email, pass, is_admin, plan) VALUES ('owner@local', ?, 1, 'pro')", hash(randomBytes(24).toString("hex")))).lastInsertRowid };
  await signIn(u.id);
  redirect("/");
}
