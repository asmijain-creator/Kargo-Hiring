"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function login(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  const nextRaw = String(fd.get("next") ?? "/");
  // Only allow same-site paths as the post-login destination.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const expected = process.env.APP_PASSWORD;
  if (!expected) redirect("/login?err=" + encodeURIComponent("APP_PASSWORD isn't set in Vercel yet."));
  if (password !== expected) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 800));
    redirect(`/login?err=${encodeURIComponent("Wrong password.")}&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}
