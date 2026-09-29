import { prisma } from "./db";

// Scoring queue stored on the candidate rows, so it works on serverless hosting where
// nothing survives between requests. Work is pulled one CV at a time by POST /api/score-next,
// which open pages call while anything is queued.

// A claim older than this is treated as abandoned (the function that took it timed out).
const STALE_MS = 6 * 60 * 1000;

export async function enqueue(ids: string[]) {
  if (!ids.length) return;
  await prisma.candidate.updateMany({
    where: { id: { in: ids }, status: { notIn: ["ADVANCED", "DECLINED"] } },
    data: { aiQueuedAt: new Date(), aiStartedAt: null, aiError: null },
  });
}

export function isPending(c: { aiQueuedAt: Date | null }) {
  return c.aiQueuedAt != null;
}

export async function pendingCount(roleId?: string) {
  return prisma.candidate.count({ where: { aiQueuedAt: { not: null }, ...(roleId ? { roleId } : {}) } });
}

// Atomically claims the oldest queued candidate that nobody is working on.
export async function claimNext(): Promise<string | null> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const available = { aiQueuedAt: { not: null }, OR: [{ aiStartedAt: null }, { aiStartedAt: { lt: staleBefore } }] };
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.candidate.findFirst({ where: available, orderBy: { aiQueuedAt: "asc" }, select: { id: true } });
    if (!next) return null;
    const claimed = await prisma.candidate.updateMany({
      where: { id: next.id, ...available },
      data: { aiStartedAt: new Date() },
    });
    if (claimed.count === 1) return next.id;
  }
  return null;
}

export async function finish(id: string) {
  await prisma.candidate.update({ where: { id }, data: { aiQueuedAt: null, aiStartedAt: null } });
}
