import Link from "next/link";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { mailReady } from "@/lib/mailer";
import { pendingWork } from "@/lib/service";
import { daysSince, rankedCandidates } from "@/lib/queries";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const [roles, all, failedEmails, draftEmails] = await Promise.all([
    prisma.role.findMany({ orderBy: { createdAt: "asc" } }),
    rankedCandidates(),
    prisma.email.count({ where: { status: "FAILED" } }),
    prisma.email.count({ where: { status: "DRAFT" } }),
  ]);
  const undecided = all.filter((c) => c.status === "NEW" || c.status === "SCORED");
  const ready = undecided.filter((c) => c.ev.total != null);
  const oldest = undecided.length ? Math.max(...undecided.map((c) => daysSince(c.createdAt))) : 0;
  const work = await pendingWork();
  const scoring = work.scoring;
  const invites = ready.filter((c) => c.shortlisted);

  return (
    <>
      <AutoRefresh active={work.total > 0} />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">The system recommends. You decide. Confirm the draft and the email goes out.</p>
        </div>
        <Link href="/candidates/new" className="btn btn-primary">Add CVs</Link>
      </div>

      {(!aiConfigured() || !mailReady()) && (
        <div className="notice">
          {!aiConfigured() && "AI scoring is off (no GEMINI_API_KEY), so you can still score by hand. "}
          {!mailReady() && "Email sending isn't set up (RESEND_API_KEY / EMAIL_FROM), so Confirm will fail until it is. "}
          <Link href="/settings">Settings</Link>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="n">{ready.length}</div><div className="l">Ready for your decision</div></div>
        <div className="stat"><div className="n">{undecided.length - ready.length}</div><div className="l">Not scored yet{scoring ? ` (${scoring} scoring now)` : ""}{work.drafting ? ` · ${work.drafting} drafts being written` : ""}</div></div>
        <div className="stat"><div className="n">{oldest}d</div><div className="l">Longest wait without a reply</div></div>
        <div className="stat">
          <div className="n">{failedEmails + draftEmails}</div>
          <div className="l"><Link href="/outbox">Emails not sent</Link>{failedEmails ? ` (${failedEmails} failed)` : ""}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {roles.map((r) => {
          const cs = all.filter((c) => c.role.id === r.id);
          const count = (s: string) => cs.filter((c) => c.status === s).length;
          return (
            <div className="card" key={r.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}><Link href={`/roles/${r.slug}`}>{r.title}</Link></h2>
                  <p className="muted small">{r.team} · {r.location}</p>
                </div>
                <Link href={`/roles/${r.slug}/rubric`} className="btn btn-sm">Rubric</Link>
              </div>
              <p className="small" style={{ marginTop: 8 }}>
                {cs.length} applicants · {count("NEW")} unscored · {count("SCORED")} to decide · {count("ADVANCED")} invited · {count("DECLINED")} rejected
              </p>
              <Link href={`/roles/${r.slug}`} className="small">Open shortlist →</Link>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Interview invites waiting for your confirm</h2>
        {invites.length === 0 ? (
          <p className="muted">No scored candidates are waiting. Add CVs or score the ones you have.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Candidate</th><th>Role</th><th className="num">Score</th><th>Brief</th><th className="num">Waiting</th></tr>
              </thead>
              <tbody>
                {invites.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.rank}</td>
                    <td><Link href={`/candidates/${c.id}`}>{c.name}</Link></td>
                    <td className="small">{c.role.title}</td>
                    <td className="num"><strong>{c.ev.total}</strong></td>
                    <td className="small muted">{c.brief?.summary || "Writing the brief…"}</td>
                    <td className="num small">{daysSince(c.createdAt)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
