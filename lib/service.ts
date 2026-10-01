import { prisma } from "./db";
import { aiConfigured, draftBriefAndEmail, lastUsedModel, scoreResume } from "./ai";
import { sendEmail } from "./mailer";
import { fillName } from "./pii";
import { rankedCandidates, type RankedCandidate } from "./queries";
import { claimNext, enqueue, finish, pendingCount } from "./queue";
import { effectiveScore, type EmailKind } from "./scoring";
import rubricVersion from "@/prisma/rubric-version.json";

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

// Every candidate is scored against BOTH rubrics, so they need rows for every role's criteria and gates.
export async function ensureRows(candidateId: string) {
  const [c, roles] = await Promise.all([
    prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { gateResults: true, scores: true } }),
    prisma.role.findMany({ include: { gates: true, criteria: true } }),
  ]);
  const haveGates = new Set(c.gateResults.map((g) => g.gateId));
  const haveCrit = new Set(c.scores.map((s) => s.criterionId));
  const newGates = roles.flatMap((r) => r.gates).filter((g) => !haveGates.has(g.id));
  const newCrit = roles.flatMap((r) => r.criteria).filter((x) => !haveCrit.has(x.id));
  if (newGates.length) await prisma.gateResult.createMany({ data: newGates.map((g) => ({ candidateId, gateId: g.id })) });
  if (newCrit.length) await prisma.criterionScore.createMany({ data: newCrit.map((x) => ({ candidateId, criterionId: x.id })) });
}

// ---------- step 1: score against both rubrics ----------

export async function runScoring(candidateId: string) {
  await ensureRows(candidateId);
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (c.status === "ADVANCED" || c.status === "DECLINED") throw new Error("This candidate has already been emailed.");
  if (!aiConfigured()) throw new Error("GEMINI_API_KEY is not set.");
  if (!c.resumeText) throw new Error("No CV text to score.");

  try {
    const roles = await prisma.role.findMany({ include: { gates: true, criteria: true } });
    const results = [];
    // Only the redacted CV content goes to the AI. Name, email and phone stay in the database.
    for (const role of roles) results.push(await scoreResume(role, c.resumeText));

    await prisma.$transaction([
      ...results.flatMap((r) => [
        ...r.gates.map((g) =>
          prisma.gateResult.update({
            where: { candidateId_gateId: { candidateId, gateId: g.gateId } },
            data: { aiResult: g.result, aiEvidence: g.evidence },
          })
        ),
        ...r.criteria.map((s) =>
          prisma.criterionScore.update({
            where: { candidateId_criterionId: { candidateId, criterionId: s.criterionId } },
            data: { aiScore: s.score, aiEvidence: s.evidence, aiRationale: s.reason },
          })
        ),
      ]),
      prisma.candidate.update({
        where: { id: candidateId },
        data: {
          status: "SCORED",
          aiModel: lastUsedModel(),
          aiScoredAt: new Date(),
          aiError: null,
          rubricVersion: rubricVersion.version,
        },
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.candidate.update({ where: { id: candidateId }, data: { aiError: msg } });
    throw e;
  }
}

export async function queueScoring(ids: string[]) {
  await enqueue(ids);
}

// ---------- steps 2 and 3: brief for the top 5, a draft email for everyone ----------

// A candidate needs a (new) draft when they haven't been emailed and their current unsent draft
// is missing or of the wrong kind (the ranking moved), or they're shortlisted and have no brief.
function needsDraft(c: RankedCandidate) {
  if (!c.target || c.draftError || c.status === "ADVANCED" || c.status === "DECLINED") return false;
  const email = c.emails[0];
  if (email && (email.status === "SENT" || email.status === "SENDING")) return false;
  if (!email || email.kind !== c.target) return true;
  return c.target === "INVITE" && !c.brief?.summary;
}

// Drafting waits until every queued CV is scored, so the ranking it drafts from is settled.
export async function draftsNeeded() {
  if ((await pendingCount()) > 0) return [];
  return (await rankedCandidates()).filter(needsDraft);
}

export async function runDraft(candidateId: string) {
  const all = await rankedCandidates();
  const c = all.find((x) => x.id === candidateId);
  if (!c || !needsDraft(c)) return;
  const role = await prisma.role.findUniqueOrThrow({ where: { id: c.roleId } });
  const kind = c.target as EmailKind;

  const scoreLines = c.scores
    .filter((s) => s.criterion.roleId === c.roleId)
    .sort((a, b) => a.criterion.order - b.criterion.order)
    .map((s) => `- ${s.criterion.name}: ${effectiveScore(s) ?? "?"}/5. ${s.aiRationale ?? ""}`);

  try {
    // Redacted CV only; the AI writes [NAME] and the real name is filled in here, from the database.
    const d = await draftBriefAndEmail({
      kind,
      role,
      rank: c.rank ?? 0,
      total: c.ev.total,
      cvContent: c.resumeText ?? "",
      scoreLines,
    });
    await prisma.$transaction([
      prisma.email.deleteMany({ where: { candidateId, status: { in: ["DRAFT", "FAILED"] } } }),
      prisma.email.create({
        data: {
          candidateId,
          kind,
          toAddress: c.email,
          subject: fillName(d.subject, c.name),
          body: fillName(d.body, c.name),
          draftSource: "ai",
        },
      }),
      ...(kind === "INVITE" && d.brief.trim() && c.brief?.source !== "edited"
        ? [
            prisma.brief.upsert({
              where: { candidateId },
              create: { candidateId, summary: d.brief.trim(), source: "ai" },
              update: { summary: d.brief.trim(), source: "ai" },
            }),
          ]
        : []),
      // Dropped below the line: an AI brief written for the invite no longer applies.
      ...(kind === "DECLINE" ? [prisma.brief.deleteMany({ where: { candidateId, source: "ai" } })] : []),
      prisma.candidate.update({ where: { id: candidateId }, data: { draftError: null } }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.candidate.update({ where: { id: candidateId }, data: { draftError: msg } });
  }
}

// Atomically claims a candidate for drafting so two open pages can't draft the same one.
async function claimDraft(ids: string[]) {
  const staleBefore = new Date(Date.now() - 6 * 60 * 1000);
  for (const id of ids) {
    const claimed = await prisma.candidate.updateMany({
      where: { id, aiQueuedAt: null, OR: [{ aiStartedAt: null }, { aiStartedAt: { lt: staleBefore } }] },
      data: { aiStartedAt: new Date() },
    });
    if (claimed.count === 1) return id;
  }
  return null;
}

// One unit of pipeline work: score the next queued CV, or once scoring is done, draft the next email.
// Returns false when there's nothing left to do.
export async function processNext(): Promise<boolean> {
  const id = await claimNext();
  if (id) {
    try {
      await runScoring(id);
    } catch {
      // saved as aiError
    } finally {
      await finish(id);
    }
    return true;
  }
  if (!aiConfigured()) return false;
  const todo = await draftsNeeded();
  if (!todo.length) return false;
  const draftId = await claimDraft(todo.map((t) => t.id));
  if (!draftId) return false;
  try {
    await runDraft(draftId);
  } finally {
    await prisma.candidate.update({ where: { id: draftId }, data: { aiStartedAt: null } });
  }
  return true;
}

export async function pendingWork() {
  const queued = await pendingCount();
  if (queued > 0) return { scoring: queued, drafting: 0, total: queued };
  const drafting = aiConfigured() ? (await draftsNeeded()).length : 0;
  return { scoring: 0, drafting, total: drafting };
}

// ---------- step 4: Arjun confirms, the email goes ----------

// The one thing Arjun touches: confirming a draft records his decision and sends it via Resend.
export async function confirmAndSend(candidateId: string, edits?: { subject: string; body: string }) {
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { emails: true } });
  const draft = c.emails.find((e) => e.status === "DRAFT" || e.status === "FAILED");
  if (!draft) throw new Error(c.emails.some((e) => e.status === "SENT") ? "Already sent." : "No draft email yet.");
  if (!c.email) throw new Error("No email address on file for this candidate. Add one first.");

  await prisma.$transaction(async (tx) => {
    await tx.email.update({
      where: { id: draft.id },
      data: { toAddress: c.email, ...(edits ? { subject: edits.subject, body: edits.body } : {}) },
    });
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        status: draft.kind === "INVITE" ? "ADVANCED" : "DECLINED",
        decidedAt: new Date(),
        decidedBy: screenerName(),
      },
    });
  });
  await sendEmailRecord(draft.id);
  return prisma.email.findUniqueOrThrow({ where: { id: draft.id } });
}

// Arjun disagrees with the line: swap an invite for a rejection or the other way round.
// The old draft is removed and the pipeline drafts the new one.
export async function switchEmailKind(candidateId: string) {
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { emails: true } });
  if (c.emails.some((e) => e.status === "SENT" || e.status === "SENDING")) throw new Error("The email has already gone out.");
  const current = c.emails.find((e) => e.status === "DRAFT" || e.status === "FAILED");
  const next: EmailKind = (current?.kind ?? c.emailKindOverride) === "INVITE" ? "DECLINE" : "INVITE";
  await prisma.$transaction([
    prisma.email.deleteMany({ where: { candidateId, status: { in: ["DRAFT", "FAILED"] } } }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { emailKindOverride: next, draftError: null, status: c.aiScoredAt ? "SCORED" : c.status },
    }),
  ]);
  return next;
}

export async function retryDraft(candidateId: string) {
  await prisma.candidate.update({ where: { id: candidateId }, data: { draftError: null } });
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
