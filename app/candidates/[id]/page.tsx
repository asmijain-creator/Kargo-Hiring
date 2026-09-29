import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { autoSendEnabled } from "@/lib/mailer";
import { isPending } from "@/lib/queue";
import { candidateInclude, ensureRows } from "@/lib/service";
import { canAdvance, effectiveGate, effectiveScore, evaluate, parseList, recommend } from "@/lib/scoring";
import {
  deleteCandidate,
  saveAndAdvance,
  saveAndDecline,
  saveAndSendEmail,
  saveEmailDraft,
  saveReview,
  scoreCandidate,
  undoDecisionAction,
} from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EmailBadge, GateBadge, RecBadge, ScoreDots, StatusBadge } from "@/components/Badges";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  await ensureRows(id);
  const c = await prisma.candidate.findUniqueOrThrow({ where: { id }, include: candidateInclude });

  const ev = evaluate(c.scores, c.gateResults);
  const { rec, reason } = recommend(ev, c.role.inviteThreshold);
  const advance = canAdvance(c.status, ev);
  const decided = c.status === "ADVANCED" || c.status === "DECLINED";
  const pending = isPending(c.id);
  const scores = [...c.scores].sort((a, b) => a.criterion.order - b.criterion.order);
  const gates = [...c.gateResults].sort((a, b) => a.gate.order - b.gate.order);
  const email = c.emails[0];
  const autoSend = autoSendEnabled();
  const hasAi = Boolean(c.aiScoredAt);

  return (
    <>
      <AutoRefresh active={pending} />
      <Flash msg={sp.msg} err={sp.err} />
      <p className="small"><Link href={`/roles/${c.role.slug}`}>← {c.role.title} shortlist</Link></p>

      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">
            {c.email || "No email yet"} · {c.location || "Location not given"}
            {c.source ? ` · ${c.source}` : ""}
          </p>
          <div className="row" style={{ marginTop: 6 }}>
            <StatusBadge status={c.status} />
            {pending ? <span className="badge">Scoring…</span> : <RecBadge rec={rec} />}
            <span className="small muted">{reason}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="score-big">{ev.total ?? "–"}<span className="muted" style={{ fontSize: 16 }}> / 100</span></div>
          <div className="small muted">
            {ev.total == null ? `${ev.scored} of ${ev.criteriaCount} criteria scored` : `Advance at ${c.role.inviteThreshold}+`}
          </div>
        </div>
      </div>

      {c.aiError && !pending && <div className="flash flash-err">AI scoring failed: {c.aiError}</div>}
      {pending && <div className="notice">Gemini is scoring this CV. The page updates when it's done (usually under a minute).</div>}

      {decided && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>
              {c.status === "ADVANCED" ? "Advanced to interview" : "Declined"}
              <span className="small muted" style={{ fontWeight: 400 }}>
                {" "}· {c.decidedBy} · {c.decidedAt?.toLocaleString("en-IN")}
              </span>
            </h2>
            {(!email || email.status === "DRAFT" || email.status === "FAILED") && (
              <form action={undoDecisionAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn btn-sm" confirm="Undo this decision and delete the unsent email?">Undo decision</SubmitButton>
              </form>
            )}
          </div>
          {email && (
            <div style={{ marginTop: 12 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <EmailBadge status={email.status} />
                <span className="small muted">
                  {email.kind === "INVITE" ? "Interview invite" : "Decline"} · {email.draftSource === "ai" ? "drafted by Gemini" : "template"}
                  {email.sentAt ? ` · sent ${email.sentAt.toLocaleString("en-IN")} to ${email.sentTo}` : ""}
                </span>
              </div>
              {email.error && <div className="flash flash-err">Send failed: {email.error}</div>}
              {email.status === "DRAFT" || email.status === "FAILED" ? (
                <form action={saveEmailDraft}>
                  <input type="hidden" name="emailId" value={email.id} />
                  <div className="field"><label>To</label><input type="email" name="to" defaultValue={email.toAddress} required /></div>
                  <div className="field"><label>Subject</label><input type="text" name="subject" defaultValue={email.subject} required /></div>
                  <div className="field"><label>Body</label><textarea name="body" rows={12} defaultValue={email.body} required /></div>
                  <div className="row">
                    <SubmitButton className="btn btn-primary" formAction={saveAndSendEmail} pendingText="Sending…">Send now</SubmitButton>
                    <SubmitButton pendingText="Saving…">Save draft</SubmitButton>
                  </div>
                </form>
              ) : (
                <>
                  <p><strong>{email.subject}</strong></p>
                  <div className="email-body">{email.body}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Brief</h2>
            <Link href={`/candidates/${c.id}/brief`} className="btn btn-sm">Open / edit</Link>
          </div>
          {c.brief ? (
            <div className="stack" style={{ marginTop: 12, gap: 10 }}>
              <p>{c.brief.summary}</p>
              {c.brief.rankReason && <p><strong>Why ranked here:</strong> {c.brief.rankReason}</p>}
              <BriefList title="Strengths" items={parseList(c.brief.strengths)} />
              <BriefList title="Gaps" items={parseList(c.brief.gaps)} />
              <BriefList title="Probe in interview" items={parseList(c.brief.probes)} />
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>No brief yet. Score with AI, or write one by hand.</p>
          )}
        </div>

        <div className="card">
          <h2>CV</h2>
          {!decided && aiConfigured() && (
            <form action={scoreCandidate} style={{ marginBottom: 12 }}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton className="btn btn-primary" disabled={pending} pendingText="Queuing…">
                {hasAi ? "Re-score with AI" : "Score with AI"}
              </SubmitButton>
              {hasAi && <span className="small muted"> Your score changes are kept.</span>}
            </form>
          )}
          {c.resumePdf && (
            <p>
              <a href={`/candidates/${c.id}/resume`} target="_blank">{c.resumeFileName ?? "Resume.pdf"}</a>
            </p>
          )}
          {c.resumeText ? <div className="resume">{c.resumeText}</div> : !c.resumePdf && <p className="muted">No CV text.</p>}
          {c.resumePdf && !c.resumeText && (
            <iframe src={`/candidates/${c.id}/resume`} title="Resume" style={{ width: "100%", height: 480, border: "1px solid var(--border)", borderRadius: 6 }} />
          )}
        </div>
      </div>

      <form action={saveReview} className="card">
        <input type="hidden" name="id" value={c.id} />
        <h2>Scores {decided && <span className="small muted">(locked after the decision)</span>}</h2>
        <fieldset disabled={decided} style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div><label>Name</label><input type="text" name="name" defaultValue={c.name} /></div>
            <div><label>Email</label><input type="email" name="email" defaultValue={c.email} placeholder="Needed to send the email" /></div>
            <div><label>Location</label><input type="text" name="location" defaultValue={c.location ?? ""} /></div>
          </div>

          <h3>Gates</h3>
          {gates.map((g) => (
            <div className="crit" key={g.id}>
              <div>
                <strong>{g.gate.label}</strong> <GateBadge value={effectiveGate(g)} />
                {g.finalResult && <span className="small muted"> (changed from {g.aiResult ?? "unchecked"})</span>}
                <p className="small muted">{g.gate.description}</p>
                {g.aiEvidence && <div className="evidence">{g.aiEvidence}</div>}
              </div>
              <div>
                <label className="small">Result</label>
                <select name={`gate_${g.gateId}`} defaultValue={effectiveGate(g) ?? ""}>
                  <option value="">Not checked</option>
                  <option value="PASS">Pass</option>
                  <option value="UNCLEAR">Unclear</option>
                  <option value="FAIL">Fail</option>
                </select>
                <input type="text" name={`gatenote_${g.gateId}`} defaultValue={g.note ?? ""} placeholder="Note (optional)" style={{ marginTop: 6 }} />
              </div>
            </div>
          ))}

          <h3 style={{ marginTop: 16 }}>Criteria</h3>
          {scores.map((s) => {
            const eff = effectiveScore(s);
            const cr = s.criterion;
            return (
              <div className="crit" key={s.id}>
                <div>
                  <strong>C{cr.order}. {cr.name}</strong> <span className="muted small">· {cr.weight}%</span>{" "}
                  <ScoreDots score={eff} />
                  {s.finalScore != null && s.aiScore != null && <span className="small muted"> (AI said {s.aiScore})</span>}
                  {s.aiEvidence && <div className="evidence">{s.aiEvidence}</div>}
                  {s.aiRationale && <p className="small">{s.aiRationale}</p>}
                  <details>
                    <summary className="small">Levels</summary>
                    <ol className="levels" reversed>
                      {[cr.level5, cr.level4, cr.level3, cr.level2, cr.level1].map((t, i) => (
                        <li key={i} className={eff === 5 - i ? "hit" : ""}>{t}</li>
                      ))}
                    </ol>
                    {cr.note && <p className="small muted">{cr.note}</p>}
                  </details>
                </div>
                <div>
                  <label className="small">Score</label>
                  <select name={`score_${cr.id}`} defaultValue={eff ?? ""}>
                    <option value="">Not scored</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>{n}{s.aiScore === n ? " (AI)" : ""}</option>
                    ))}
                  </select>
                  <input type="text" name={`note_${cr.id}`} defaultValue={s.overrideNote ?? ""} placeholder="Why you changed it (optional)" style={{ marginTop: 6 }} />
                </div>
              </div>
            );
          })}
        </fieldset>

        {!decided && (
          <div className="row" style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            <SubmitButton
              className="btn btn-good"
              formAction={saveAndAdvance}
              disabled={!advance.ok}
              pendingText="Advancing…"
              confirm={`Advance ${c.name}? ${autoSend ? `An interview invite will be sent to ${c.email || "(no email)"} now.` : "An interview invite will be drafted in the outbox."}`}
            >
              Advance to interview
            </SubmitButton>
            <SubmitButton
              className="btn btn-bad"
              formAction={saveAndDecline}
              pendingText="Declining…"
              confirm={`Decline ${c.name}? ${autoSend ? `A decline email will be sent to ${c.email || "(no email)"} now.` : "A decline email will be drafted in the outbox."}`}
            >
              Decline
            </SubmitButton>
            {!advance.ok && <span className="small muted">{advance.reason}</span>}
          </div>
        )}
      </form>

      <details className="no-print" style={{ marginTop: 24 }}>
        <summary className="small">Delete candidate</summary>
        <form action={deleteCandidate} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton className="btn btn-bad btn-sm" confirm={`Permanently delete ${c.name} and their scores and emails?`}>
            Delete permanently
          </SubmitButton>
        </form>
      </details>
    </>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="plain small">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
