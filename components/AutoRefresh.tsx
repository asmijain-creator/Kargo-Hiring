"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While scoring is queued, keeps the queue moving (two CVs at a time) and refreshes the page
// as results come in. The queue lives in the database, so this works on serverless hosting.
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const refresh = setInterval(() => router.refresh(), everyMs);

    async function worker() {
      while (!stopped) {
        try {
          const res = await fetch("/api/score-next", { method: "POST" });
          if (!res.ok) break;
          const { processed, remaining } = (await res.json()) as { processed: boolean; remaining: number };
          router.refresh();
          if (remaining === 0) break;
          // Someone else holds the remaining items; check back shortly.
          if (!processed) await new Promise((r) => setTimeout(r, everyMs));
        } catch {
          break;
        }
      }
    }
    worker();
    worker();

    return () => {
      stopped = true;
      clearInterval(refresh);
    };
  }, [active, everyMs, router]);
  return null;
}
