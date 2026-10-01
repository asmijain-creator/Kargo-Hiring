"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { splitPersonalDetails } from "@/lib/pii";
import { parseResumeFile } from "@/lib/resume";
import {
  confirmAndSend,
  ensureRows,
  processNext,
  queueScoring,
  retryDraft,
  sendEmailRecord,
  switchEmailKind,
} from "@/lib/service";

// Start scoring straight after the response is sent; open pages keep pulling the rest.
async function queueAndKick(ids: string[]) {
  await queueScoring(ids);
  after(async () => {
    for (let i = 0; i < Math.min(ids.length, 2); i++) if (!(await processNext())) break;
  });
}

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

export interface AddBatchResult {
  error?: string;
  created: string[];
  problems: string[];
  roleSlug?: string;
  scoring: boolean;
}

// Adds one batch of CVs. The upload form sends files a few at a time (Vercel caps each
// request at 4.5 MB) and navigates when every batch is done. "single" = 1 means the
// name/email/location fields apply to this one candidate.
export async function addCandidateBatch(fd: FormData): Promise<AddBatchResult> {
  const roleId = str(fd, "roleId");
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Pick a role.", created: [], problems: [], scoring: false };

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = str(fd, "resumeText");
  const source = str(fd, "source") || null;
  const scoreNow = str(fd, "scoreNow") === "1" && aiConfigured();

  if (files.length === 0 && !pasted) return { error: "Upload at least one CV or paste one.", created: [], problems: [], scoring: false };

  const inputs: { fileName: string; text: string; pdf: Buffer | null }[] = [];
  const problems: string[] = [];
  if (files.length === 0) inputs.push({ fileName: str(fd, "name") || "pasted-cv.txt", text: pasted, pdf: null });
  for (const file of files) {
    try {
      inputs.push(await parseResumeFile(file));
    } catch (e) {
      problems.push(errText(e));
    }
  }

  const created: string[] = [];
  for (const input of inputs) {
    // Personal details are split out here, in code, before anything reaches an AI step.
    const { personal, content } = splitPersonalDetails(input.text, input.fileName);
    const c = await prisma.candidate.create({
      data: {
        roleId,
        name: personal.name,
        email: personal.email,
        phone: personal.phone || null,
        source,
        resumeFileName: input.fileName,
        resumeText: content,
        resumePdf: input.pdf ? new Uint8Array(input.pdf) : null,
      },
    });
    await ensureRows(c.id);
    created.push(c.id);
  }

  if (scoreNow && created.length) await queueAndKick(created);
  revalidatePath("/", "layout");
  return { created, problems, roleSlug: role.slug, scoring: scoreNow && created.length > 0 };
}

export async function scoreCandidate(fd: FormData) {
  const id = str(fd, "id");
  if (!aiConfigured()) redirect(withMsg(`/candidates/${id}`, "err", "GEMINI_API_KEY is not set."));
  await prisma.candidate.update({ where: { id }, data: { aiError: null } });
  await queueAndKick([id]);
  revalidatePath(`/candidates/${id}`);
  redirect(`/candidates/${id}`);
}

export async function scoreAllUnscored(fd: FormData) {
  const roleId = str(fd, "roleId");
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  if (!aiConfigured()) redirect(withMsg(`/roles/${role.slug}`, "err", "GEMINI_API_KEY is not set."));
  const todo = await prisma.candidate.findMany({
    where: { roleId, OR: [{ status: "NEW" }, { aiError: { not: null }, status: { notIn: ["ADVANCED", "DECLINED"] } }] },
    select: { id: true },
  });
  await prisma.candidate.updateMany({ where: { id: { in: todo.map((t) => t.id) } }, data: { aiError: null } });
  await queueAndKick(todo.map((t) => t.id));
  revalidatePath(`/roles/${role.slug}`);
  redirect(withMsg(`/roles/${role.slug}`, "msg", `Scoring ${todo.length} candidate${todo.length === 1 ? "" : "s"}.`));
}

// Saves Arjun's score overrides (both rubrics) and contact details. Never sends anything.
export async function saveReview(fd: FormData) {
  const id = str(fd, "id");
  const back = `/candidates/${id}`;
  await ensureRows(id);
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id }, include: { scores: true, gateResults: true } });

  await prisma.$transaction([
    ...c.scores.map((s) => {
      const raw = str(fd, `score_${s.criterionId}`);
      if (!raw && !fd.has(`score_${s.criterionId}`)) return prisma.criterionScore.findUnique({ where: { id: s.id } });
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
      if (!fd.has(`gate_${g.gateId}`)) return prisma.gateResult.findUnique({ where: { id: g.id } });
      const raw = str(fd, `gate_${g.gateId}`);
      const v = ["PASS", "FAIL", "UNCLEAR"].includes(raw) ? raw : null;
      return prisma.gateResult.update({
        where: { id: g.id },
        data: { finalResult: v && v !== g.aiResult ? v : null, note: str(fd, `gatenote_${g.gateId}`) || null },
      });
    }),
    prisma.candidate.update({
      where: { id },
      data: {
        email: str(fd, "email") || c.email,
        name: str(fd, "name") || c.name,
        phone: str(fd, "phone") || c.phone,
        location: str(fd, "location") || c.location,
      },
    }),
  ]);
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", "Saved. If this changes the ranking, drafts update on their own."));
}

// Arjun's one action: confirm the draft and it goes out through Resend.
export async function confirmSend(fd: FormData) {
  const id = str(fd, "id");
  const back = str(fd, "back") || `/candidates/${id}`;
  const subject = str(fd, "subject");
  const body = String(fd.get("body") ?? "").trim();
  let result: Awaited<ReturnType<typeof confirmAndSend>>;
  try {
    result = await confirmAndSend(id, subject && body ? { subject, body } : undefined);
  } catch (e) {
    redirect(withMsg(back, "err", errText(e)));
  }
  revalidatePath("/", "layout");
  redirect(
    result.status === "SENT"
      ? withMsg(back, "msg", `Sent to ${result.sentTo}.`)
      : withMsg(back, "err", `Send failed: ${result.error}`)
  );
}

export async function switchKind(fd: FormData) {
  const id = str(fd, "id");
  const back = str(fd, "back") || `/candidates/${id}`;
  let next: string;
  try {
    next = await switchEmailKind(id);
  } catch (e) {
    redirect(withMsg(back, "err", errText(e)));
  }
  after(async () => {
    await processNext();
  });
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", next === "INVITE" ? "Switched to an interview invite. Drafting it now." : "Switched to a rejection. Drafting it now."));
}

export async function retryDraftAction(fd: FormData) {
  const id = str(fd, "id");
  await retryDraft(id);
  after(async () => {
    await processNext();
  });
  revalidatePath("/", "layout");
  redirect(withMsg(`/candidates/${id}`, "msg", "Drafting again."));
}

export async function deleteCandidate(fd: FormData) {
  const id = str(fd, "id");
  const c = await prisma.candidate.delete({ where: { id }, include: { role: true } });
  revalidatePath("/", "layout");
  redirect(withMsg(`/roles/${c.role.slug}`, "msg", `Deleted ${c.name}.`));
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
    // Sending from the outbox is the same confirmation as on the candidate page.
    await confirmAndSend(e.candidateId);
    const after = await prisma.email.findUniqueOrThrow({ where: { id } });
    revalidatePath("/", "layout");
    redirect(withMsg(back, after.status === "SENT" ? "msg" : "err", after.status === "SENT" ? "Email sent." : `Send failed: ${after.error}`));
  }
  revalidatePath("/", "layout");
  redirect(withMsg(back, "msg", "Draft saved."));
}

// Confirms every unsent rejection in one go. Invites are always confirmed one at a time.
export async function sendAllDrafts() {
  const drafts = await prisma.email.findMany({
    where: { status: { in: ["DRAFT", "FAILED"] }, kind: "DECLINE" },
    select: { id: true, candidateId: true },
  });
  for (const d of drafts) await confirmAndSend(d.candidateId).catch(() => undefined);
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
  if (process.env.VERCEL) {
    redirect(withMsg("/settings", "err", "On Vercel, change these in the Vercel dashboard (Settings → Environment Variables), then redeploy."));
  }
  const { writeEnv } = await import("@/lib/envfile");
  const values: Record<string, string> = {
    GEMINI_MODEL: str(fd, "GEMINI_MODEL"),
    EMAIL_FROM: str(fd, "EMAIL_FROM"),
    EMAIL_TEST_REDIRECT: str(fd, "EMAIL_TEST_REDIRECT"),
    EMAIL_REPLY_TO: str(fd, "EMAIL_REPLY_TO"),
    SCREENER_NAME: str(fd, "SCREENER_NAME"),
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
