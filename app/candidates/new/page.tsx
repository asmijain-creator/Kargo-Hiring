import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { addCandidates } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function NewCandidates({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; msg?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" } });
  const ai = aiConfigured();

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>Add CVs</h1>
          <p className="muted">Drop in one CV or the whole folder. PDF, DOCX and TXT all work.</p>
        </div>
      </div>

      <form action={addCandidates} className="card" style={{ maxWidth: 760 }}>
        <div className="field">
          <label htmlFor="roleId">Role</label>
          <select id="roleId" name="roleId" defaultValue={sp.role ?? roles[0]?.id} required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.title} ({r.team})</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="files">CV files</label>
          <input id="files" type="file" name="files" multiple accept=".pdf,.docx,.txt,.md,application/pdf" />
          <p className="small muted">
            Select many files at once for a bulk upload.
            {ai ? " Gemini reads each CV and fills in the name, email and location." : " Without an API key, fill in names and emails on each candidate page."}
          </p>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary>Single candidate details, or paste a CV instead of uploading</summary>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field"><label>Name</label><input type="text" name="name" /></div>
            <div className="field"><label>Email</label><input type="email" name="email" /></div>
            <div className="field"><label>Location</label><input type="text" name="location" /></div>
            <div className="field"><label>Source</label><input type="text" name="source" placeholder="e.g. LinkedIn, referral" /></div>
          </div>
          <div className="field">
            <label>CV text</label>
            <textarea name="resumeText" rows={10} placeholder="Paste the CV here" />
          </div>
          <p className="small muted">Name and email apply only when you add a single candidate.</p>
        </details>

        <label className="row" style={{ fontWeight: 400, marginBottom: 16 }}>
          <input type="checkbox" name="scoreNow" defaultChecked={ai} disabled={!ai} />
          Score with AI right away {ai ? "" : "(needs GEMINI_API_KEY)"}
        </label>

        <SubmitButton className="btn btn-primary" pendingText="Uploading…">Add</SubmitButton>
      </form>
    </>
  );
}
