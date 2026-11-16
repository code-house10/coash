import { redirect } from "next/navigation";
import { OPEN } from "@/lib/auth";

// In personal mode there is no sign-in page: go straight into the app.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  if (OPEN) redirect("/");
  return children;
}
