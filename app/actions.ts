"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { nameFromFileName, parseResumeFile } from "@/lib/resume";
import { decide, ensureRows, queueScoring, sendEmailRecord, undoDecision } from "@/lib/service";

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function withMsg(path: string, kind: "msg" | "err", text: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${kind}=${encodeURIComponent(text)}`;
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ---------- candidates ----------

export async function addCandidates(fd: FormData) {
  const roleId = str(fd, "roleId");
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { gates: true, criteria: true } });
  if (!role) redirect(withMsg("/candidates/new", "err", "Pick a role."));

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = str(fd, "resumeText");
  const name = str(fd, "name");
  const email = str(fd, "email");
  const location = str(fd, "location");
  const source = str(fd, "source") || null;
  const scoreNow = fd.get("scoreNow") === "on";

  if (files.length === 0 && !pasted) redirect(withMsg("/candidates/new", "err", "Upload at least one CV or paste one."));
  if (files.length === 0 && !name) redirect(withMsg("/candidates/new", "err", "Add the candidate's name for a pasted CV."));

  const rows = {
    gateResults: { create: role.gates.map((g) => ({ gateId: g.id })) },
    scores: { create: role.criteria.map((c) => ({ criterionId: c.id })) },
  };
  const created: string[] = [];
  const problems: string[] = [];

  if (files.length === 0) {
    const c = await prisma.candidate.create({
      data: { roleId, name, email, location: location || null, source, resumeText: pasted, ...rows },
    });
    created.push(c.id);
  } else {
    for (const file of files) {
      try {
        const parsed = await parseResumeFile(file);
        const single = files.length === 1;
        const c = await prisma.candidate.create({
          data: {
            roleId,
            name: single && name ? name : nameFromFileName(parsed.fileName),
            email: single ? email : "",
            location: single && location ? location : null,
            source,
            resumeFileName: parsed.fileName,
            resumeText: parsed.text ?? (single && pasted ? pasted : null),
            resumePdf: parsed.pdf ? new Uint8Array(parsed.pdf) : null,
            ...rows,
          },
        });
        created.push(c.id);
      } catch (e) {
        problems.push(errText(e));
      }
    }
  }

  if (scoreNow && aiConfigured() && created.length) queueScoring(created);
  revalidatePath("/", "layout");

  const note =
    `Added ${created.length} candidate${created.length === 1 ? "" : "s"}.` +
    (scoreNow && aiConfigured() && created.length ? " Scoring has started." : "") +
    (problems.length ? ` Skipped: ${problems.join("; ")}` : "");
  if (created.length === 1 && problems.length === 0) redirect(withMsg(`/candidates/${created[0]}`, "msg", note));
  redirect(withMsg(`/roles/${role.slug}`, problems.length && !created.length ? "err" : "msg", note));
}

export async function scoreCandidate(fd: FormData) {
  const id = str(fd, "id");
  if (!aiConfigured()) redirect(withMsg(`/candidates/${id}`, "err", "GEMINI_API_KEY is not set."));
  await prisma.candidate.update({ where: { id }, data: { aiError: null } });
  queueScoring([id]);
  revalidatePath(`/candidates/${id}`);
  redirect(`/candidates/${id}`);
}

export async function scoreAllUnscored(fd: FormData) {
  const roleId = str(fd, "roleId");
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  if (!aiConfigured()) redirect(withMsg(`/roles/${role.slug}`, "err", "GEMINI_API_KEY is not set."));
  const todo = await prisma.candidate.findMany({
    where: { roleId, OR: [{ status: "NEW" }, { status: "SCORED", aiError: { not: null } }] },
    select: { id: true },
  });
  await prisma.candidate.updateMany({ where: { id: { in: todo.map((t) => t.id) } }, data: { aiError: null } });
  queueScoring(todo.map((t) => t.id));
  revalidatePath(`/roles/${role.slug}`);
  redirect(withMsg(`/roles/${role.slug}`, "msg", `Scoring ${todo.length} candidate${todo.length === 1 ? "" : "s"}.`));
}

// Saves screener overrides; if intent is advance/decline, also records the decision,
// which drafts and (by default) sends the email.
export async function saveReview(fd: FormData) {
  return reviewAndMaybeDecide(fd, "save");
}
export async function saveAndAdvance(fd: FormData) {
  return reviewAndMaybeDecide(fd, "advance");
}
export async function saveAndDecline(fd: FormData) {
  return reviewAndMaybeDecide(fd, "decline");
}

async function reviewAndMaybeDecide(fd: FormData, intent: "save" | "advance" | "decline") {
  const id = str(fd, "id");
  const back = `/candidates/${id}`;
  await ensureRows(id);
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id }, include: { scores: true, gateResults: true } });
  if (c.status === "ADVANCED" || c.status === "DECLINED") redirect(withMsg(back, "err", "Already decided."));

  const email = str(fd, "email");
  const updates = [
    ...c.scores.map((s) => {
      const raw = str(fd, `score_${s.criterionId}`);
      const n = raw ? Number(raw) : null;
      return prisma.criterionScore.update({
        where: { id: s.id },
        data: {
          finalScore: n && n >= 1 && n <= 5 && n !== s.aiScore ? n : null,
          overrideNote: str(fd, `note_${s.criterionId}`) || null,
        },
      });
    }),
    ...c.gateResults.map((g) => {
      const raw = str(fd, `gate_${g.gateId}`);
      const v = ["PASS", "FAIL", "UNCLEAR"].includes(raw) ? raw : null;
      return prisma.gateResult.update({
        where: { id: g.id },
        data: { finalResult: v && v !== g.aiResult ? v : null, note: str(fd, `gatenote_${g.gateId}`) || null },
      });
    }),
    prisma.candidate.update({
      where: { id },
      data: { email: email || c.email, name: str(fd, "name") || c.name, location: str(fd, "location") || c.location },
    }),
  ];
  await prisma.$transaction(updates);

  // A fully hand-scored candidate is ready for a decision, same as an AI-scored one.
  const after = await prisma.candidate.findUniqueOrThrow({ where: { id }, include: { scores: true } });
  if (after.status === "NEW" && after.scores.every((s) => (s.finalScore ?? s.aiScore) != null)) {
    await prisma.candidate.update({ where: { id }, data: { status: "SCORED" } });
  }

  if (intent === "advance" || intent === "decline") {
    try {
      await decide(id, intent === "advance" ? "ADVANCE" : "DECLINE");
    } catch (e) {
      revalidatePath("/", "layout");
      redirect(withMsg(back, "err", errText(e)));
    }
    revalidatePath("/", "layout");
    redirect(withMsg(back, "msg", intent === "advance" ? "Advanced." : "Declined."));
  }
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", "Saved."));
}

export async function undoDecisionAction(fd: FormData) {
  const id = str(fd, "id");
  try {
    await undoDecision(id);
  } catch (e) {
    redirect(withMsg(`/candidates/${id}`, "err", errText(e)));
  }
  revalidatePath("/", "layout");
  redirect(withMsg(`/candidates/${id}`, "msg", "Decision undone."));
}

export async function deleteCandidate(fd: FormData) {
  const id = str(fd, "id");
  const c = await prisma.candidate.delete({ where: { id }, include: { role: true } });
  revalidatePath("/", "layout");
  redirect(withMsg(`/roles/${c.role.slug}`, "msg", `Deleted ${c.name}.`));
}

export async function saveBrief(fd: FormData) {
  const id = str(fd, "id");
  const lines = (k: string) =>
    JSON.stringify(
      str(fd, k)
        .split("\n")
        .map((l) => l.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
    );
  const data = {
    summary: str(fd, "summary"),
    rankReason: str(fd, "rankReason"),
    strengths: lines("strengths"),
    gaps: lines("gaps"),
    probes: lines("probes"),
    source: "edited",
  };
  await prisma.brief.upsert({ where: { candidateId: id }, create: { candidateId: id, ...data }, update: data });
  revalidatePath(`/candidates/${id}`);
  redirect(withMsg(`/candidates/${id}/brief`, "msg", "Brief saved."));
}

// ---------- email ----------

export async function saveEmailDraft(fd: FormData) {
  return saveDraftAndMaybeSend(fd, false);
}
export async function saveAndSendEmail(fd: FormData) {
  return saveDraftAndMaybeSend(fd, true);
}

async function saveDraftAndMaybeSend(fd: FormData, send: boolean) {
  const id = str(fd, "emailId");
  const e = await prisma.email.findUniqueOrThrow({ where: { id } });
  const back = str(fd, "back") || `/candidates/${e.candidateId}`;
  if (e.status !== "DRAFT" && e.status !== "FAILED") redirect(withMsg(back, "err", "This email can no longer be edited."));
  await prisma.email.update({
    where: { id },
    data: { toAddress: str(fd, "to"), subject: str(fd, "subject"), body: String(fd.get("body") ?? "").trim() },
  });
  if (send) {
    await sendEmailRecord(id);
    const after = await prisma.email.findUniqueOrThrow({ where: { id } });
    revalidatePath("/", "layout");
    redirect(withMsg(back, after.status === "SENT" ? "msg" : "err", after.status === "SENT" ? "Email sent." : `Send failed: ${after.error}`));
  }
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", "Draft saved."));
}

export async function sendAllDrafts() {
  const drafts = await prisma.email.findMany({ where: { status: { in: ["DRAFT", "FAILED"] } }, select: { id: true } });
  for (const d of drafts) await sendEmailRecord(d.id);
  const failed = await prisma.email.count({ where: { id: { in: drafts.map((d) => d.id) }, status: "FAILED" } });
  revalidatePath("/", "layout");
  redirect(
    withMsg("/outbox", failed ? "err" : "msg", `Sent ${drafts.length - failed} of ${drafts.length}.${failed ? " Check the failed ones." : ""}`)
  );
}

// ---------- rubric ----------

export async function updateRubric(fd: FormData) {
  const roleId = str(fd, "roleId");
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId }, include: { gates: true, criteria: true } });
  const back = `/roles/${role.slug}/rubric`;

  const criteria = role.criteria.map((c) => ({
    id: c.id,
    name: str(fd, `c_${c.id}_name`) || c.name,
    weight: Number(str(fd, `c_${c.id}_weight`)),
    note: str(fd, `c_${c.id}_note`) || null,
    level1: str(fd, `c_${c.id}_l1`) || c.level1,
    level2: str(fd, `c_${c.id}_l2`) || c.level2,
    level3: str(fd, `c_${c.id}_l3`) || c.level3,
    level4: str(fd, `c_${c.id}_l4`) || c.level4,
    level5: str(fd, `c_${c.id}_l5`) || c.level5,
  }));
  if (criteria.some((c) => !Number.isInteger(c.weight) || c.weight < 0)) {
    redirect(withMsg(back, "err", "Weights must be whole numbers."));
  }
  const sum = criteria.reduce((a, c) => a + c.weight, 0);
  if (sum !== 100) redirect(withMsg(back, "err", `Weights add up to ${sum}. They must add up to 100.`));
  const threshold = Number(str(fd, "inviteThreshold"));
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    redirect(withMsg(back, "err", "Threshold must be between 0 and 100."));
  }

  await prisma.$transaction([
    prisma.role.update({
      where: { id: roleId },
      data: {
        calibrationNotes: str(fd, "calibrationNotes"),
        inviteThreshold: Math.round(threshold),
        schedulingInfo: str(fd, "schedulingInfo") || role.schedulingInfo,
        senderName: str(fd, "senderName") || role.senderName,
      },
    }),
    ...role.gates.map((g) =>
      prisma.gate.update({
        where: { id: g.id },
        data: { label: str(fd, `g_${g.id}_label`) || g.label, description: str(fd, `g_${g.id}_desc`) || g.description },
      })
    ),
    ...criteria.map(({ id, ...data }) => prisma.criterion.update({ where: { id }, data })),
  ]);
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", "Rubric saved."));
}

// ---------- settings ----------

export async function saveSettings(fd: FormData) {
  const { writeEnv } = await import("@/lib/envfile");
  const values: Record<string, string> = {
    GEMINI_MODEL: str(fd, "GEMINI_MODEL"),
    EMAIL_FROM: str(fd, "EMAIL_FROM"),
    EMAIL_TEST_REDIRECT: str(fd, "EMAIL_TEST_REDIRECT"),
    EMAIL_REPLY_TO: str(fd, "EMAIL_REPLY_TO"),
    SCREENER_NAME: str(fd, "SCREENER_NAME"),
    EMAIL_AUTO_SEND: fd.get("EMAIL_AUTO_SEND") === "on" ? "true" : "false",
  };
  // Secret fields are blank unless the user pasted a new key; blank means keep the current one.
  const gemini = str(fd, "GEMINI_API_KEY");
  const resend = str(fd, "RESEND_API_KEY");
  if (gemini) values.GEMINI_API_KEY = gemini;
  if (resend) values.RESEND_API_KEY = resend;

  if (resend && !resend.startsWith("re_")) redirect(withMsg("/settings", "err", "That doesn't look like a Resend key (they start with re_)."));
  const emailOk = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!emailOk(values.EMAIL_TEST_REDIRECT)) redirect(withMsg("/settings", "err", "The test-mode address isn't a valid email."));
  if (!emailOk(values.EMAIL_REPLY_TO)) redirect(withMsg("/settings", "err", "The reply-to address isn't a valid email."));
  if (!values.EMAIL_FROM.includes("@")) redirect(withMsg("/settings", "err", "The from address needs an email in it."));

  writeEnv(values);
  revalidatePath("/", "layout");
  redirect(withMsg("/settings", "msg", "Settings saved."));
}
