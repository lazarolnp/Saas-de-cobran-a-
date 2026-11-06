"use server";

import { redirect } from "next/navigation";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { acceptPublicLink } from "@/services/public-link";

export async function acceptAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const ip = await clientIp();
  if (await allowRequest("publico-aceite", ip, 20, 600)) {
    await acceptPublicLink(token, ip);
  }
  redirect(`/p/${encodeURIComponent(token)}`);
}
