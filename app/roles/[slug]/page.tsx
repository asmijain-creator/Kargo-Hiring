import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { daysSince, rankedCandidates } from "@/lib/queries";
import { scoreAllUnscored } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EmailBadge, GateBadge, RecBadge, StatusBadge } from "@/components/Badges";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "decide", label: "To decide", match: (s: string) => s === "NEW" || s === "SCORED" },
  { key: "advanced", label: "Advanced", match: (s: string) => s === "ADVANCED" },
  { key: "declined", label: "Declined", match: (s: string) => s === "DECLINED" },
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

  const all = await rankedCandidates(role.id);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = all.filter((c) => tab.match(c.status));
  const scoring = all.filter((c) => c.pending).length;
  const unscored = all.filter((c) => c.status === "NEW" && !c.pending).length;

  return (
    <>
      <AutoRefresh active={scoring > 0} />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>{role.title}</h1>
          <p className="muted">
            {role.team} · {role.location} · Recommend advancing at {role.inviteThreshold}+ ·{" "}
            <Link href={`/roles/${role.slug}/rubric`}>Rubric</Link>
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

      {scoring > 0 && <div className="notice">Scoring {scoring} candidate{scoring === 1 ? "" : "s"}… this page updates on its own.</div>}

      <div className="row" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/roles/${role.slug}?tab=${t.key}`} className={t.key === tab.key ? "btn btn-sm btn-primary" : "btn btn-sm"}>
            {t.label} ({all.filter((c) => t.match(c.status)).length})
          </Link>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">Nobody here.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Candidate</th>
                  <th>Recommendation</th>
                  <th className="num">Score</th>
                  {role.criteria.map((c) => (
                    <th key={c.id} className="num" title={`${c.name} (${c.weight}%)`}>C{c.order}</th>
                  ))}
                  <th>Gates</th>
                  <th>Status</th>
                  <th className="num">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const byCrit = new Map(c.scores.map((s) => [s.criterionId, s.finalScore ?? s.aiScore]));
                  return (
                    <tr key={c.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <Link href={`/candidates/${c.id}`}><strong>{c.name}</strong></Link>
                        <div className="small muted">{c.location || "Location not given"}</div>
                        {c.brief?.rankReason && <div className="small muted" style={{ maxWidth: 360 }}>{c.brief.rankReason}</div>}
                        {c.aiError && <div className="small" style={{ color: "var(--bad)" }}>AI: {c.aiError}</div>}
                      </td>
                      <td>{c.pending ? <span className="badge">Scoring…</span> : <RecBadge rec={c.rec} />}</td>
                      <td className="num">
                        <strong>{c.ev.total ?? "–"}</strong>
                        <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${c.ev.total ?? c.ev.partial}%` }} /></div>
                      </td>
                      {role.criteria.map((cr) => (
                        <td key={cr.id} className="num">{byCrit.get(cr.id) ?? "–"}</td>
                      ))}
                      <td><GateBadge value={c.ev.gates === "PENDING" ? null : c.ev.gates} /></td>
                      <td>
                        <StatusBadge status={c.status} />
                        {c.emails[0] && (
                          <div style={{ marginTop: 4 }}>
                            <EmailBadge status={c.emails[0].status} />
                          </div>
                        )}
                      </td>
                      <td className="num small">{c.decidedAt ? "–" : `${daysSince(c.createdAt)}d`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          {role.criteria.map((c) => `C${c.order} ${c.name} (${c.weight}%)`).join(" · ")}
        </p>
      </div>
    </>
  );
}
