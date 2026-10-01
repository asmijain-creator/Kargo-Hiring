import { prisma } from "./db";
import { isPending } from "./queue";
import { evaluateRole, INVITE_SLOTS, MIN_INVITE_SCORE, recommend, type EmailKind } from "./scoring";

// Every candidate, scored against both rubrics, ranked within the role they applied for.
// The top INVITE_SLOTS per role who score at least MIN_INVITE_SCORE (skipping anyone failing a gate)
// get an interview invite drafted;
// everyone else gets a warm rejection, unless Arjun has switched it.
export async function rankedCandidates(roleId?: string) {
  const [rows, roles] = await Promise.all([
    prisma.candidate.findMany({
      where: roleId ? { roleId } : {},
      select: {
        id: true,
        name: true,
        email: true,
        location: true,
        status: true,
        aiError: true,
        draftError: true,
        aiQueuedAt: true,
        aiScoredAt: true,
        emailKindOverride: true,
        resumeText: true,
        phone: true,
        roleId: true,
        createdAt: true,
        decidedAt: true,
        role: { select: { id: true, slug: true, title: true, inviteThreshold: true } },
        scores: { include: { criterion: true } },
        gateResults: { include: { gate: true } },
        brief: { select: { summary: true, source: true } },
        emails: {
          select: { id: true, status: true, kind: true, subject: true, body: true, toAddress: true, sentAt: true, sentTo: true, error: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.role.findMany({ select: { id: true, slug: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  const evaluated = rows.map((c) => {
    const ev = evaluateRole(c, c.roleId);
    const others = roles
      .filter((r) => r.id !== c.roleId)
      .map((r) => ({ role: r, ev: evaluateRole(c, r.id) }));
    const { rec, reason } = recommend(ev, c.role.inviteThreshold);
    return { ...c, ev, others, rec, recReason: reason, pending: isPending(c) };
  });

  evaluated.sort(
    (a, b) =>
      (b.ev.total ?? -1) - (a.ev.total ?? -1) ||
      (b.ev.partial ?? 0) - (a.ev.partial ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );

  const rankInRole = new Map<string, number>();
  const slotsUsed = new Map<string, number>();
  return evaluated.map((c) => {
    const scored = c.ev.total != null && !c.pending;
    let rank: number | null = null;
    let shortlisted = false;
    if (scored) {
      rank = (rankInRole.get(c.roleId) ?? 0) + 1;
      rankInRole.set(c.roleId, rank);
      if (c.ev.gates !== "FAIL" && (c.ev.total ?? 0) >= MIN_INVITE_SCORE && (slotsUsed.get(c.roleId) ?? 0) < INVITE_SLOTS) {
        slotsUsed.set(c.roleId, (slotsUsed.get(c.roleId) ?? 0) + 1);
        shortlisted = true;
      }
    }
    const target: EmailKind | null = scored
      ? ((c.emailKindOverride as EmailKind | null) ?? (shortlisted ? "INVITE" : "DECLINE"))
      : null;
    return { ...c, rank, shortlisted, target };
  });
}

export type RankedCandidate = Awaited<ReturnType<typeof rankedCandidates>>[number];

export function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
