import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BORDERLINE_BAND } from "@/lib/scoring";
import { updateRubric } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function RubricPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const role = await prisma.role.findUnique({
    where: { slug },
    include: { gates: { orderBy: { order: "asc" } }, criteria: { orderBy: { order: "asc" } } },
  });
  if (!role) notFound();
  const total = role.criteria.reduce((a, c) => a + c.weight, 0);

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="small"><Link href={`/roles/${role.slug}`}>← {role.title} shortlist</Link></p>
      <div className="page-head">
        <div>
          <h1>{role.title} rubric</h1>
          <p className="muted">
            Weighted score = sum of (score / 5 × weight), out of 100. Changes apply to every candidate's total straight away.
          </p>
        </div>
      </div>

      <form action={updateRubric} className="stack">
        <input type="hidden" name="roleId" value={role.id} />

        <div className="card">
          <h2>Recommendation and emails</h2>
          <div className="grid-2">
            <div className="field">
              <label>Recommend advancing at</label>
              <input type="number" name="inviteThreshold" min={0} max={100} defaultValue={role.inviteThreshold} />
              <p className="small muted">
                Candidates within {BORDERLINE_BAND} points below this show as Borderline. The recommendation never decides on its own.
              </p>
            </div>
            <div className="field">
              <label>Email sign-off</label>
              <input type="text" name="senderName" defaultValue={role.senderName} />
            </div>
          </div>
          <div className="field">
            <label>Scheduling instructions in invite emails</label>
            <textarea name="schedulingInfo" rows={2} defaultValue={role.schedulingInfo} />
            <p className="small muted">A booking link, or instructions like "reply with three times that work next week".</p>
          </div>
        </div>

        <div className="card">
          <h2>Calibration notes</h2>
          <p className="small muted">Gemini reads these before scoring. One note per line.</p>
          <textarea name="calibrationNotes" rows={6} defaultValue={role.calibrationNotes} />
        </div>

        <div className="card">
          <h2>Gates (pass/fail, not scored)</h2>
          {role.gates.map((g) => (
            <div key={g.id} className="grid-2" style={{ marginBottom: 12 }}>
              <div><label className="small">Gate</label><input type="text" name={`g_${g.id}_label`} defaultValue={g.label} /></div>
              <div><label className="small">How to judge it</label><textarea name={`g_${g.id}_desc`} rows={2} defaultValue={g.description} /></div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Criteria</h2>
            <span className={total === 100 ? "badge rec-advance" : "badge rec-decline"}>Weights total {total}%</span>
          </div>
          {role.criteria.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }}>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label className="small">C{c.order} name</label>
                  <input type="text" name={`c_${c.id}_name`} defaultValue={c.name} />
                </div>
                <div>
                  <label className="small">Weight %</label>
                  <input type="number" name={`c_${c.id}_weight`} min={0} max={100} defaultValue={c.weight} />
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: 8 }}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <div key={n}>
                    <label className="small">{n} =</label>
                    <textarea name={`c_${c.id}_l${n}`} rows={2} defaultValue={c[`level${n}` as "level1"]} />
                  </div>
                ))}
                <div>
                  <label className="small">Scoring note (optional)</label>
                  <textarea name={`c_${c.id}_note`} rows={2} defaultValue={c.note ?? ""} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row">
          <SubmitButton className="btn btn-primary" pendingText="Saving…">Save rubric</SubmitButton>
          <span className="small muted">Re-score candidates afterwards if you changed level wording.</span>
        </div>
      </form>
    </>
  );
}
