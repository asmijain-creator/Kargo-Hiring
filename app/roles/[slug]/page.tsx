import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { rankedCandidates } from "@/lib/queries";
import { pendingWork } from "@/lib/service";
import { effectiveScore, INVITE_SLOTS } from "@/lib/scoring";
import { scoreAllUnscored } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DecisionPanel } from "@/components/DecisionPanel";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
// Server actions on this page send email and may draft one.
export const maxDuration = 300;

const TABS = [
  { key: "decide", label: "To decide", match: (s: string) => s === "NEW" || s === "SCORED" },
  { key: "sent", label: "Emailed", match: (s: string) => s === "ADVANCED" || s === "DECLINED" },
  { key: "all", label: "All", match: () => true },
];

export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; msg?: string; err?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const role = await prisma.role.findUnique({ where: { slug }, include: { criteria: { orderBy: { order: "asc" } } } });
  if (!role) notFound();

  const [all, work] = await Promise.all([rankedCandidates(role.id), pendingWork()]);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = all.filter((c) => tab.match(c.status));
  const unscored = all.filter((c) => c.status === "NEW" && !c.pending).length;
  const back = `/roles/${role.slug}?tab=${tab.key}`;
  const lineAfter = all.filter((c) => c.shortlisted).length;

  return (
    <>
      <AutoRefresh active={work.total > 0} />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>{role.title}</h1>
          <p className="muted">
            {role.team} · {role.location} · {all.length} applicants · top {INVITE_SLOTS} get an interview invite drafted, everyone else a
            warm rejection · <Link href={`/roles/${role.slug}/rubric`}>Rubric</Link>
          </p>
        </div>
        <div className="row">
          {aiConfigured() && unscored > 0 && (
            <form action={scoreAllUnscored}>
              <input type="hidden" name="roleId" value={role.id} />
              <SubmitButton pendingText="Queuing…">Score {unscored} unscored</SubmitButton>
            </form>
          )}
          <Link href={`/candidates/new?role=${role.id}`} className="btn btn-primary">Add CVs</Link>
        </div>
      </div>

      {work.scoring > 0 && (
        <div className="notice">Scoring {work.scoring} CV{work.scoring === 1 ? "" : "s"} against both rubrics… this page updates on its own.</div>
      )}
      {work.drafting > 0 && <div className="notice">Writing briefs and draft emails ({work.drafting} to go)…</div>}

      <div className="row" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/roles/${role.slug}?tab=${t.key}`} className={t.key === tab.key ? "btn btn-sm btn-primary" : "btn btn-sm"}>
            {t.label} ({all.filter((c) => t.match(c.status)).length})
          </Link>
        ))}
      </div>

      {rows.length === 0 && <div className="card"><p className="muted">Nobody here.</p></div>}

      <div className="stack">
        {rows.map((c, i) => {
          const showLine = tab.key !== "sent" && i > 0 && rows[i - 1].shortlisted && !c.shortlisted;
          const scores = c.scores
            .filter((s) => s.criterion.roleId === role.id)
            .sort((a, b) => a.criterion.order - b.criterion.order);
          return (
            <div key={c.id}>
              {showLine && (
                <p className="small muted" style={{ textAlign: "center", margin: "4px 0 12px" }}>
                  ─── the line: above get interview invites, below get warm rejections ───
                </p>
              )}
              <div className="card" style={c.shortlisted ? { borderColor: "var(--good)" } : undefined}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>
                      <span className="muted">#{c.rank ?? "–"}</span> <Link href={`/candidates/${c.id}`}>{c.name}</Link>
                    </h2>
                    <div className="small muted">
                      {c.shortlisted ? `Top ${INVITE_SLOTS}` : c.rank ? "Below the line" : c.pending ? "Scoring…" : "Not scored"}
                      {c.emailKindOverride ? " · you switched this one" : ""}
                      {c.ev.gates === "FAIL" ? " · fails a gate" : c.ev.gates === "UNCLEAR" ? " · a gate needs a human call" : ""}
                    </div>
                    {c.aiError && <div className="small" style={{ color: "var(--bad)" }}>Scoring failed: {c.aiError}</div>}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 140 }}>
                    <div className="score-big">{c.ev.total ?? "–"}<span className="muted" style={{ fontSize: 14 }}> / 100</span></div>
                    {c.others.map((o) => (
                      <div key={o.role.id} className="small muted">
                        as {o.role.title}: {o.ev.total ?? "–"}
                        {o.ev.total != null && c.ev.total != null && o.ev.total > c.ev.total + 5 ? " ▲ better fit" : ""}
                      </div>
                    ))}
                  </div>
                </div>

                {c.brief?.summary && (
                  <p style={{ marginTop: 10 }}><strong>Brief:</strong> {c.brief.summary}</p>
                )}

                <details style={{ marginTop: 8 }}>
                  <summary className="small">Score breakdown</summary>
                  <ul className="plain small" style={{ marginTop: 6 }}>
                    {scores.map((s) => (
                      <li key={s.id}>
                        <strong>{effectiveScore(s) ?? "–"}/5</strong> {s.criterion.name} ({s.criterion.weight}%)
                        {s.aiRationale ? <span className="muted"> — {s.aiRationale}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>

                <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <DecisionPanel
                    candidateId={c.id}
                    candidateEmail={c.email}
                    email={c.emails[0]}
                    draftError={c.draftError}
                    waiting={work.total > 0}
                    back={back}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {lineAfter === 0 && all.length > 0 && <p className="small muted">Nobody is scored yet.</p>}
    </>
  );
}
