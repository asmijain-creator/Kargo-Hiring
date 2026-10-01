import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Signed-in check of the deployment's setup: which settings are present and whether the
// database answers. Never prints secret values.
export async function GET() {
  const url = (key: string) => {
    const raw = process.env[key];
    if (!raw) return "missing";
    try {
      const u = new URL(raw.trim());
      return `${u.protocol}//${u.username.split(".")[0]}.***@${u.hostname}:${u.port}${u.pathname}${u.search}${raw !== raw.trim() ? " (has spaces around it)" : ""}`;
    } catch {
      return `not a valid URL (starts with "${raw.slice(0, 12)}")`;
    }
  };
  let db = "ok";
  try {
    const roles = await prisma.role.count();
    const candidates = await prisma.candidate.count();
    db = `ok: ${roles} roles, ${candidates} candidates`;
  } catch (e) {
    db = `error: ${(e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/[^\s]+/g, "<url>").slice(-400)}`;
  }
  return NextResponse.json({
    DATABASE_URL: url("DATABASE_URL"),
    DIRECT_URL: url("DIRECT_URL"),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "missing",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "set" : "missing",
    EMAIL_FROM: process.env.EMAIL_FROM ? "set" : "missing",
    EMAIL_TEST_REDIRECT: process.env.EMAIL_TEST_REDIRECT ? "set" : "missing",
    db,
  });
}
