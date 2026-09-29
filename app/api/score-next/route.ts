import { NextResponse } from "next/server";
import { pendingCount } from "@/lib/queue";
import { processNext } from "@/lib/service";

// Scoring one CV can take a minute or more (plus retries on the Gemini free tier).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Scores the next queued CV. Pages call this repeatedly while anything is queued.
export async function POST() {
  const processed = await processNext();
  return NextResponse.json({ processed, remaining: await pendingCount() });
}
