import { NextResponse } from "next/server";
import { pendingWork, processNext } from "@/lib/service";

// Scoring one CV against both rubrics can take a minute or more (plus retries on the Gemini free tier).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Does one unit of pipeline work: score the next queued CV, or once all are scored, draft the next
// brief/email. Open pages call this repeatedly while anything is left.
export async function POST() {
  const processed = await processNext();
  return NextResponse.json({ processed, remaining: (await pendingWork()).total });
}
