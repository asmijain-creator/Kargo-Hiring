import Link from "next/link";
import { prisma } from "@/lib/db";
import { mailConfig } from "@/lib/mailer";
import { sendAllDrafts } from "@/app/actions";
import { EmailBadge } from "@/components/Badges";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function Outbox({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const emails = await prisma.email.findMany({
    orderBy: { createdAt: "desc" },
    include: { candidate: { select: { id: true, name: true, role: { select: { title: true } } } } },
  });
  const unsent = emails.filter((e) => (e.status === "DRAFT" || e.status === "FAILED") && e.kind === "DECLINE").length;
  const cfg = mailConfig();

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>Outbox</h1>
          <p className="muted">
            Every invite and decline email. Every draft waits here until you confirm it. Nothing is sent automatically.
            {cfg.testRedirect ? ` Test mode: all email goes to ${cfg.testRedirect}.` : ""}
          </p>
        </div>
        {unsent > 0 && (
          <form action={sendAllDrafts}>
            <SubmitButton className="btn btn-primary" pendingText="Sending…" confirm={`Send all ${unsent} unsent rejection${unsent === 1 ? "" : "s"} now? Invites are not included.`}>
              Confirm &amp; send {unsent} rejection{unsent === 1 ? "" : "s"}
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="card">
        {emails.length === 0 ? (
          <p className="muted">No emails yet. Drafts appear here once CVs are scored.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Type</th><th>Status</th><th>Subject</th><th>To</th><th>When</th></tr></thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/candidates/${e.candidate.id}`}>{e.candidate.name}</Link><div className="small muted">{e.candidate.role.title}</div></td>
                    <td className="small">{e.kind === "INVITE" ? "Invite" : "Rejection"}</td>
                    <td><EmailBadge status={e.status} />{e.error && <div className="small" style={{ color: "var(--bad)", maxWidth: 260 }}>{e.error}</div>}</td>
                    <td className="small">{e.subject}</td>
                    <td className="small">{e.sentTo ?? e.toAddress}</td>
                    <td className="small muted">{(e.sentAt ?? e.createdAt).toLocaleString("en-IN")}</td>
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
