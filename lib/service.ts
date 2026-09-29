import { prisma } from "./db";
import { aiConfigured, draftInvite, lastUsedModel, scoreResume, templateDecline, templateInvite } from "./ai";
import { autoSendEnabled, sendEmail } from "./mailer";
import { canAdvance, evaluate, parseList } from "./scoring";
import { claimNext, enqueue, finish } from "./queue";

export const candidateInclude = {
  role: { include: { gates: true, criteria: true } },
  gateResults: { include: { gate: true } },
  scores: { include: { criterion: true } },
  brief: true,
  emails: { orderBy: { createdAt: "desc" as const } },
};

export function screenerName() {
  return process.env.SCREENER_NAME || "Screener";
}

// Make sure a candidate has a score row for every criterion and gate (rubrics can gain rows later).
export async function ensureRows(candidateId: string) {
  const c = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { role: { include: { gates: true, criteria: true } }, gateResults: true, scores: true },
  });
  const haveGates = new Set(c.gateResults.map((g) => g.gateId));
  const haveCrit = new Set(c.scores.map((s) => s.criterionId));
  const newGates = c.role.gates.filter((g) => !haveGates.has(g.id));
  const newCrit = c.role.criteria.filter((x) => !haveCrit.has(x.id));
  if (newGates.length) await prisma.gateResult.createMany({ data: newGates.map((g) => ({ candidateId, gateId: g.id })) });
  if (newCrit.length) await prisma.criterionScore.createMany({ data: newCrit.map((x) => ({ candidateId, criterionId: x.id })) });
}

const PLACEHOLDER_NAME = /^Unnamed\b/;

export async function runScoring(candidateId: string) {
  await ensureRows(candidateId);
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: candidateInclude });
  if (c.status === "ADVANCED" || c.status === "DECLINED") throw new Error("This candidate has already been decided.");
  if (!aiConfigured()) throw new Error("GEMINI_API_KEY is not set. Score manually, or add the key to .env.");

  try {
    const result = await scoreResume(c.role, c);
    const contact = result.contact;
    await prisma.$transaction([
      ...result.gates.map((g) =>
        prisma.gateResult.update({
          where: { candidateId_gateId: { candidateId, gateId: g.gateId } },
          data: { aiResult: g.result, aiEvidence: g.evidence },
        })
      ),
      ...result.criteria.map((s) =>
        prisma.criterionScore.update({
          where: { candidateId_criterionId: { candidateId, criterionId: s.criterionId } },
          data: { aiScore: s.score, aiEvidence: s.evidence, aiRationale: s.rationale },
        })
      ),
      // A brief Arjun has edited by hand is never overwritten.
      ...(c.brief?.source === "edited"
        ? []
        : [
            prisma.brief.upsert({
              where: { candidateId },
              create: briefData(candidateId, result.brief),
              update: briefData(candidateId, result.brief),
            }),
          ]),
      prisma.candidate.update({
        where: { id: candidateId },
        data: {
          status: "SCORED",
          aiModel: lastUsedModel(),
          aiScoredAt: new Date(),
          aiError: null,
          ...(PLACEHOLDER_NAME.test(c.name) && contact.name.trim() ? { name: contact.name.trim() } : {}),
          ...(!c.email && contact.email.trim() ? { email: contact.email.trim() } : {}),
          ...(!c.location && contact.location.trim() ? { location: contact.location.trim() } : {}),
        },
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.candidate.update({ where: { id: candidateId }, data: { aiError: msg } });
    throw e;
  }
}

function briefData(
  candidateId: string,
  b: { summary: string; rank_reason: string; strengths: string[]; gaps: string[]; interview_probes: string[] }
) {
  return {
    candidateId,
    summary: b.summary,
    rankReason: b.rank_reason,
    strengths: JSON.stringify(b.strengths),
    gaps: JSON.stringify(b.gaps),
    probes: JSON.stringify(b.interview_probes),
    source: "ai",
  };
}

export async function queueScoring(ids: string[]) {
  await enqueue(ids);
}

// Scores the next queued CV, if any. Returns false when the queue is empty.
// Errors are recorded on the candidate by runScoring.
export async function processNext(): Promise<boolean> {
  const id = await claimNext();
  if (!id) return false;
  try {
    await runScoring(id);
  } catch {
    // already saved as aiError
  } finally {
    await finish(id);
  }
  return true;
}

// ---------- deciding ----------

export async function decide(candidateId: string, decision: "ADVANCE" | "DECLINE") {
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: candidateInclude });
  const ev = evaluate(c.scores, c.gateResults);
  if (c.status === "ADVANCED" || c.status === "DECLINED") throw new Error("Already decided.");
  if (decision === "ADVANCE") {
    const check = canAdvance(c.status, ev);
    if (!check.ok) throw new Error(check.reason);
  }

  let draft: { subject: string; body: string };
  let source = "template";
  if (decision === "ADVANCE") {
    draft = templateInvite(c.role, c.name);
    if (aiConfigured()) {
      try {
        draft = await draftInvite(c.role, c.name, parseList(c.brief?.strengths));
        source = "ai";
      } catch (e) {
        console.error("Invite draft fell back to the template:", e);
      }
    }
  } else {
    draft = templateDecline(c.role, c.name);
  }

  const email = await prisma.$transaction(async (tx) => {
    // Guard against a double click deciding twice.
    const updated = await tx.candidate.updateMany({
      where: { id: candidateId, status: { notIn: ["ADVANCED", "DECLINED"] } },
      data: { status: decision === "ADVANCE" ? "ADVANCED" : "DECLINED", decidedAt: new Date(), decidedBy: screenerName() },
    });
    if (updated.count === 0) throw new Error("Already decided.");
    return tx.email.create({
      data: {
        candidateId,
        kind: decision === "ADVANCE" ? "INVITE" : "DECLINE",
        toAddress: c.email,
        subject: draft.subject,
        body: draft.body,
        draftSource: source,
      },
    });
  });

  if (autoSendEnabled()) await sendEmailRecord(email.id);
  return email.id;
}

// Undo is only possible while the email hasn't gone out.
export async function undoDecision(candidateId: string) {
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { emails: true, scores: true } });
  const fullyScored = c.scores.length > 0 && c.scores.every((s) => (s.finalScore ?? s.aiScore) != null);
  if (c.emails.some((e) => e.status === "SENT" || e.status === "SENDING")) {
    throw new Error("The email has already been sent, so this decision can't be undone.");
  }
  await prisma.$transaction([
    prisma.email.deleteMany({ where: { candidateId } }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { status: fullyScored ? "SCORED" : "NEW", decidedAt: null, decidedBy: null },
    }),
  ]);
}

// ---------- sending ----------

export async function sendEmailRecord(emailId: string) {
  // Claim the email so two clicks can't send it twice.
  const claimed = await prisma.email.updateMany({
    where: { id: emailId, status: { in: ["DRAFT", "FAILED"] } },
    data: { status: "SENDING", error: null },
  });
  if (claimed.count === 0) return;
  const email = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
  const res = await sendEmail({
    emailId: email.id,
    kind: email.kind,
    to: email.toAddress,
    subject: email.subject,
    body: email.body,
  });
  await prisma.email.update({
    where: { id: emailId },
    data: res.ok
      ? { status: "SENT", resendId: res.id ?? null, sentAt: new Date(), sentTo: res.sentTo, error: null }
      : { status: "FAILED", error: res.error ?? "Unknown error", sentTo: res.sentTo },
  });
}
