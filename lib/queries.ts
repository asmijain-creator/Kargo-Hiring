import { prisma } from "./db";
import { isPending } from "./queue";
import { evaluate, recommend, type Recommendation } from "./scoring";

const REC_ORDER: Record<Recommendation, number> = { ADVANCE: 0, REVIEW: 1, PENDING: 2, DECLINE: 3 };

export async function rankedCandidates(roleId?: string) {
  const rows = await prisma.candidate.findMany({
    where: roleId ? { roleId } : {},
    select: {
      id: true,
      name: true,
      email: true,
      location: true,
      status: true,
      aiError: true,
      aiQueuedAt: true,
      createdAt: true,
      decidedAt: true,
      role: { select: { id: true, slug: true, title: true, inviteThreshold: true } },
      scores: { include: { criterion: true } },
      gateResults: { include: { gate: true } },
      brief: { select: { rankReason: true } },
      emails: { select: { status: true, kind: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return rows
    .map((c) => {
      const ev = evaluate(c.scores, c.gateResults);
      const { rec, reason } = recommend(ev, c.role.inviteThreshold);
      return { ...c, ev, rec, recReason: reason, pending: isPending(c) };
    })
    .sort(
      (a, b) =>
        REC_ORDER[a.rec] - REC_ORDER[b.rec] ||
        (b.ev.total ?? b.ev.partial) - (a.ev.total ?? a.ev.partial) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
}

export type RankedCandidate = Awaited<ReturnType<typeof rankedCandidates>>[number];

export function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
