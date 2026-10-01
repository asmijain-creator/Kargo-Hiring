import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { isPending } from "@/lib/queue";
import { rankedCandidates } from "@/lib/queries";
import { candidateInclude, ensureRows, pendingWork } from "@/lib/service";
import { effectiveGate, effectiveScore, evaluateRole, INVITE_SLOTS } from "@/lib/scoring";
import { deleteCandidate, saveReview, scoreCandidate } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GateBadge, ScoreDots, StatusBadge } from "@/components/Badges";
import { DecisionPanel } from "@/components/DecisionPanel";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
// Server actions on this page may score a CV or send an email.
export const maxDuration = 300;

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true, roleId: true } });
  if (!exists) notFound();
  await ensureRows(id);
  const [c, roles, ranked, work] = await Promise.all([
    prisma.candidate.findUniqueOrThrow({ where: { id }, include: candidateInclude }),
    prisma.role.findMany({ include: { criteria: true, gates: true } }),
    rankedCandidates(exists.roleId),
    pendingWork(),
  ]);
  const me = ranked.find((r) => r.id === id);
  const pending = isPending(c);
  const decided = c.status === "ADVANCED" || c.status === "DECLINED";
  // Applied-for role first, then the other rubric.
  const orderedRoles = [...roles].sort((a, b) => Number(b.id === c.roleId) - Number(a.id === c.roleId));
  const back = `/candidates/${c.id}`;

  return (
    <>
      <AutoRefresh active={pending || work.total > 0} />
      <Flash msg={sp.msg} err={sp.err} />
      <p className="small"><Link href={`/roles/${c.role.slug}`}>← {c.role.title} shortlist</Link></p>

      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">
            Applied for {c.role.title}
            {me?.rank ? ` · #${me.rank} of ${ranked.filter((r) => r.rank).length}` : ""}
            {me?.shortlisted ? ` · top ${INVITE_SLOTS}` : me?.rank ? " · below the line" : ""}
          </p>
          <div className="row" style={{ marginTop: 6 }}>
            <StatusBadge status={c.status} />
            {pending && <span className="badge">Scoring…</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {orderedRoles.map((r, i) => {
            const ev = evaluateRole(c, r.id);
            return i === 0 ? (
              <div key={r.id} className="score-big">{ev.total ?? "–"}<span className="muted" style={{ fontSize: 16 }}> / 100</span></div>
            ) : (
              <div key={r.id} className="small muted">as {r.title}: {ev.total ?? "–"}</div>
            );
          })}
        </div>
      </div>

      {c.aiError && !pending && <div className="flash flash-err">AI scoring failed: {c.aiError}</div>}
      {pending && <div className="notice">Gemini is scoring this CV against both rubrics. The page updates when it is done.</div>}

      <div className="grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <h2>Brief</h2>
          {c.brief?.summary ? (
            <p>{c.brief.summary}</p>
          ) : (
            <p className="muted">{me?.shortlisted ? "Writing the brief…" : `Briefs are written for the top ${INVITE_SLOTS} per role.`}</p>
          )}
          <h3 style={{ marginTop: 16 }}>Email</h3>
          <DecisionPanel
            candidateId={c.id}
            candidateEmail={c.email}
            email={c.emails[0]}
            draftError={c.draftError}
            waiting={work.total > 0}
            back={back}
            open
          />
        </div>

        <form action={saveReview} className="card">
          <input type="hidden" name="id" value={c.id} />
          <h2>Personal details</h2>
          <p className="small muted">
            Pulled out of the CV by code when it was uploaded and stored separately. These are never sent to any AI step; the AI
            sees only the redacted CV below.
          </p>
          <div className="field"><label>Name</label><input type="text" name="name" defaultValue={c.name} /></div>
          <div className="field"><label>Email</label><input type="email" name="email" defaultValue={c.email} placeholder="Needed to send the email" /></div>
          <div className="field"><label>Phone</label><input type="text" name="phone" defaultValue={c.phone ?? ""} /></div>
          <SubmitButton pendingText="Saving…">Save details</SubmitButton>
        </form>
      </div>

      <form action={saveReview} className="card" style={{ marginBottom: 16 }}>
        <input type="hidden" name="id" value={c.id} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Scores {decided && <span className="small muted">(locked: emailed)</span>}</h2>
          {!decided && aiConfigured() && (
            <SubmitButton className="btn btn-sm" formAction={scoreCandidate} disabled={pending} pendingText="Queuing…">
              {c.aiScoredAt ? "Re-score with AI" : "Score with AI"}
            </SubmitButton>
          )}
        </div>
        <fieldset disabled={decided} style={{ border: "none", padding: 0, margin: 0 }}>
          {orderedRoles.map((r) => {
            const ev = evaluateRole(c, r.id);
            const scores = c.scores.filter((s) => s.criterion.roleId === r.id).sort((a, b) => a.criterion.order - b.criterion.order);
            const gates = c.gateResults.filter((g) => g.gate.roleId === r.id).sort((a, b) => a.gate.order - b.gate.order);
            return (
              <details key={r.id} open={r.id === c.roleId} style={{ marginTop: 16 }}>
                <summary>
                  <strong>{r.title} rubric</strong> {r.id === c.roleId ? "(applied for)" : ""} · <strong>{ev.total ?? "–"}</strong> / 100
                </summary>
                {gates.map((g) => (
                  <div className="crit" key={g.id}>
                    <div>
                      <strong>{g.gate.label}</strong> <GateBadge value={effectiveGate(g)} />
                      {g.aiEvidence && <div className="evidence">{g.aiEvidence}</div>}
                    </div>
                    <div>
                      <select name={`gate_${g.gateId}`} defaultValue={effectiveGate(g) ?? ""}>
                        <option value="">Not checked</option>
                        <option value="PASS">Pass</option>
                        <option value="UNCLEAR">Unclear</option>
                        <option value="FAIL">Fail</option>
                      </select>
                      <input type="hidden" name={`gatenote_${g.gateId}`} value={g.note ?? ""} />
                    </div>
                  </div>
                ))}
                {scores.map((s) => {
                  const eff = effectiveScore(s);
                  const cr = s.criterion;
                  return (
                    <div className="crit" key={s.id}>
                      <div>
                        <strong>{cr.name}</strong> <span className="muted small">· {cr.weight}%</span> <ScoreDots score={eff} />
                        {s.finalScore != null && s.aiScore != null && <span className="small muted"> (AI said {s.aiScore})</span>}
                        {s.aiRationale && <p className="small" style={{ margin: "4px 0" }}>{s.aiRationale}</p>}
                        {s.aiEvidence && <div className="evidence">{s.aiEvidence}</div>}
                        <details>
                          <summary className="small">Levels</summary>
                          <ol className="levels" reversed>
                            {[cr.level5, cr.level4, cr.level3, cr.level2, cr.level1].map((t, i) => (
                              <li key={i} className={eff === 5 - i ? "hit" : ""}>{t}</li>
                            ))}
                          </ol>
                        </details>
                      </div>
                      <div>
                        <select name={`score_${cr.id}`} defaultValue={eff ?? ""}>
                          <option value="">Not scored</option>
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>{n}{s.aiScore === n ? " (AI)" : ""}</option>
                          ))}
                        </select>
                        <input type="text" name={`note_${cr.id}`} defaultValue={s.overrideNote ?? ""} placeholder="Why you changed it" style={{ marginTop: 6 }} />
                      </div>
                    </div>
                  );
                })}
              </details>
            );
          })}
          {!decided && (
            <div style={{ marginTop: 16 }}>
              <SubmitButton pendingText="Saving…">Save score changes</SubmitButton>
            </div>
          )}
        </fieldset>
      </form>

      <div className="card">
        <h2>CV as the AI sees it</h2>
        <p className="small muted">
          Name, email, phone and profile links are replaced before any AI step.
          {c.resumePdf ? <> Original: <a href={`/candidates/${c.id}/resume`} target="_blank">{c.resumeFileName ?? "CV.pdf"}</a></> : null}
        </p>
        {c.resumeText ? <div className="resume">{c.resumeText}</div> : <p className="muted">No CV text.</p>}
      </div>

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
