import { api, Bad } from "@/lib/auth";
import { stt } from "@/lib/ai";
export const POST = api(async (_u, req) => {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size > 8_000_000) throw new Bad("Audio missing or too large.");
  return { text: await stt(file) };
});
