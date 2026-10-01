"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addCandidateBatch } from "@/app/actions";

// Keep each request well under Vercel's 4.5 MB body limit.
const MAX_BATCH_BYTES = 3 * 1024 * 1024;
const MAX_BATCH_FILES = 5;

function batches(files: File[]): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length && (size + f.size > MAX_BATCH_BYTES || cur.length >= MAX_BATCH_FILES)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function UploadForm({
  roles,
  defaultRoleId,
  ai,
}: {
  roles: { id: string; title: string; team: string }[];
  defaultRoleId?: string;
  ai: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const pasted = String(form.get("resumeText") ?? "").trim();
    if (!files.length && !pasted) return setError("Upload at least one CV or paste one.");

    const fill = (fd: FormData) => {
      for (const k of ["roleId", "source"]) fd.set(k, String(form.get(k) ?? ""));
      fd.set("scoreNow", form.get("scoreNow") === "on" ? "1" : "0");
      if (!files.length) fd.set("resumeText", pasted);
    };

    setBusy(true);
    const created: string[] = [];
    const problems: string[] = [];
    let roleSlug = "";
    let scoring = false;
    const groups = files.length ? batches(files) : [[]];
    let done = 0;
    for (const group of groups) {
      setProgress(files.length ? `Uploading ${done + 1}–${done + group.length} of ${files.length}…` : "Saving…");
      const fd = new FormData();
      fill(fd);
      for (const f of group) fd.append("files", f);
      try {
        const res = await addCandidateBatch(fd);
        if (res.error) {
          setError(res.error);
          setBusy(false);
          return;
        }
        created.push(...res.created);
        problems.push(...res.problems);
        roleSlug = res.roleSlug ?? roleSlug;
        scoring ||= res.scoring;
      } catch (err) {
        problems.push(`${group.map((f) => f.name).join(", ")}: ${err instanceof Error ? err.message : String(err)}`);
      }
      done += group.length;
    }

    const note =
      `Added ${created.length} candidate${created.length === 1 ? "" : "s"}.` +
      (scoring ? " Scoring has started." : "") +
      (problems.length ? ` Skipped: ${problems.join("; ")}` : "");
    if (!roleSlug) {
      setError(note);
      setBusy(false);
      return;
    }
    const kind = problems.length && !created.length ? "err" : "msg";
    const target = created.length === 1 && !problems.length ? `/candidates/${created[0]}` : `/roles/${roleSlug}`;
    router.push(`${target}?${kind}=${encodeURIComponent(note)}`);
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 760 }}>
      {error && <div className="flash flash-err">{error}</div>}
      <div className="field">
        <label htmlFor="roleId">Role</label>
        <select id="roleId" name="roleId" defaultValue={defaultRoleId ?? roles[0]?.id} required>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} ({r.team})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="files">CV files</label>
        <input id="files" type="file" name="files" multiple accept=".pdf,.docx,.txt,.md,application/pdf" />
        <p className="small muted">
          Select many files at once for a bulk upload (up to 4 MB each).
          {" "}Name, email and phone are pulled out of each CV in code and stored privately; only the rest of the CV goes to the AI.
          Every candidate is scored against both the PM and SPM rubrics.
        </p>
      </div>

      <details style={{ marginBottom: 12 }}>
        <summary>Source, or paste a CV instead of uploading</summary>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Source</label><input type="text" name="source" placeholder="e.g. LinkedIn, referral" />
        </div>
        <div className="field">
          <label>CV text</label>
          <textarea name="resumeText" rows={10} placeholder="Paste the CV here" />
        </div>
      </details>

      <label className="row" style={{ fontWeight: 400, marginBottom: 16 }}>
        <input type="checkbox" name="scoreNow" defaultChecked={ai} disabled={!ai} />
        Score with AI right away {ai ? "" : "(needs GEMINI_API_KEY)"}
      </label>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? progress || "Uploading…" : "Add"}
      </button>
    </form>
  );
}
