import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { candidateInclude } from "@/lib/service";
import { effectiveGate, effectiveScore, evaluate, levelText, parseList, recommend } from "@/lib/scoring";
import { saveBrief } from "@/app/actions";
import { GateBadge, RecBadge } from "@/components/Badges";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// One page per candidate that Arjun can read in a couple of minutes, print, or forward.
export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.candidate.findUnique({ where: { id }, include: candidateInclude });
  if (!c) notFound();
  const ev = evaluate(c.scores, c.gateResults);
  const { rec, reason } = recommend(ev, c.role.inviteThreshold);
  const b = c.brief;
  const strengths = parseList(b?.strengths);
  const gaps = parseList(b?.gaps);
  const probes = parseList(b?.probes);
  const scores = [...c.scores].sort((a, b) => a.criterion.order - b.criterion.order);

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="small no-print"><Link href={`/candidates/${c.id}`}>← Back to review</Link></p>
      <div className="card stack">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <p className="small muted">Candidate brief · {c.role.title}, {c.role.team}</p>
            <h1>{c.name}</h1>
            <p className="muted">{c.location || "Location not given"}{c.email ? ` · ${c.email}` : ""}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="score-big">{ev.total ?? "–"}<span className="muted" style={{ fontSize: 16 }}> / 100</span></div>
            <RecBadge rec={rec} />
            <div className="small muted">{reason}</div>
          </div>
        </div>

        <section>
          <h2>Who they are</h2>
          <p>{b?.summary || <span className="muted">No summary yet.</span>}</p>
        </section>
        <section>
          <h2>Why they rank here</h2>
          <p>{b?.rankReason || <span className="muted">Not written yet.</span>}</p>
        </section>

        <div className="grid-2">
          <section><h2>Strengths</h2><List items={strengths} /></section>
          <section><h2>Gaps</h2><List items={gaps} /></section>
        </div>
        <section>
          <h2>What to probe</h2>
          <List items={probes} ordered />
        </section>

        <section>
          <h2>Scores</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Criterion</th><th className="num">Weight</th><th className="num">Score</th><th>Level</th><th>Evidence</th></tr></thead>
              <tbody>
                {scores.map((s) => {
                  const v = effectiveScore(s);
                  return (
                    <tr key={s.id}>
                      <td>{s.criterion.name}</td>
                      <td className="num">{s.criterion.weight}%</td>
                      <td className="num"><strong>{v ?? "–"}</strong>{s.finalScore != null ? "*" : ""}</td>
                      <td className="small">{v ? levelText(s.criterion, v) : ""}</td>
                      <td className="small muted">{s.aiEvidence}{s.overrideNote ? ` · Screener: ${s.overrideNote}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">* changed by a screener. Gates:{" "}
            {c.gateResults.map((g) => (
              <span key={g.id} style={{ marginRight: 8 }}>{g.gate.label} <GateBadge value={effectiveGate(g)} /></span>
            ))}
          </p>
        </section>
      </div>

      <details className="card no-print" style={{ marginTop: 16 }}>
        <summary>Edit brief</summary>
        <form action={saveBrief} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={c.id} />
          <div className="field"><label>Who they are</label><textarea name="summary" rows={4} defaultValue={b?.summary ?? ""} /></div>
          <div className="field"><label>Why they rank here</label><textarea name="rankReason" rows={2} defaultValue={b?.rankReason ?? ""} /></div>
          <div className="field"><label>Strengths (one per line)</label><textarea name="strengths" rows={4} defaultValue={strengths.join("\n")} /></div>
          <div className="field"><label>Gaps (one per line)</label><textarea name="gaps" rows={4} defaultValue={gaps.join("\n")} /></div>
          <div className="field"><label>What to probe (one per line)</label><textarea name="probes" rows={4} defaultValue={probes.join("\n")} /></div>
          <p className="small muted">An edited brief won't be overwritten by re-scoring.</p>
          <SubmitButton className="btn btn-primary" pendingText="Saving…">Save brief</SubmitButton>
        </form>
      </details>
    </>
  );
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (!items.length) return <p className="muted">None yet.</p>;
  const Tag = ordered ? "ol" : "ul";
  return <Tag className="plain">{items.map((t, i) => <li key={i}>{t}</li>)}</Tag>;
}
