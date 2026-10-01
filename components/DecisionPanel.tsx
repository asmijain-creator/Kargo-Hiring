import { confirmSend, retryDraftAction, switchKind } from "@/app/actions";
import { mailConfig } from "@/lib/mailer";
import { EmailBadge } from "./Badges";
import { SubmitButton } from "./SubmitButton";

interface EmailRow {
  id: string;
  status: string;
  kind: string;
  subject: string;
  body: string;
  toAddress: string;
  sentAt: Date | null;
  sentTo: string | null;
  error: string | null;
}

// The draft email for one candidate and the single button that sends it.
// Nothing goes out until Arjun clicks Confirm.
export function DecisionPanel({
  candidateId,
  candidateEmail,
  email,
  draftError,
  waiting,
  back,
  open = false,
}: {
  candidateId: string;
  candidateEmail: string;
  email: EmailRow | undefined;
  draftError: string | null;
  // Scored but the draft hasn't been written yet (the pipeline is still working).
  waiting: boolean;
  back: string;
  open?: boolean;
}) {
  if (email && (email.status === "SENT" || email.status === "SENDING")) {
    return (
      <div className="small">
        <EmailBadge status={email.status} /> {email.kind === "INVITE" ? "Interview invite" : "Rejection"}
        {email.sentAt ? ` sent ${email.sentAt.toLocaleString("en-IN")} to ${email.sentTo}` : ""}
        <details>
          <summary className="small">Show email</summary>
          <p><strong>{email.subject}</strong></p>
          <div className="email-body">{email.body}</div>
        </details>
      </div>
    );
  }

  if (!email) {
    if (draftError) {
      return (
        <form action={retryDraftAction} className="small">
          <input type="hidden" name="id" value={candidateId} />
          <span style={{ color: "var(--bad)" }}>Draft failed: {draftError}</span>{" "}
          <SubmitButton className="btn btn-sm">Try again</SubmitButton>
        </form>
      );
    }
    return <p className="small muted">{waiting ? "Drafting the email…" : "Email is drafted once scoring finishes."}</p>;
  }

  const invite = email.kind === "INVITE";
  const redirect = mailConfig().testRedirect;
  const recipient = candidateEmail || "(no email on file)";
  return (
    <div>
      <form action={confirmSend}>
        <input type="hidden" name="id" value={candidateId} />
        <input type="hidden" name="back" value={back} />
        <details open={open}>
          <summary className="small">
            <span className={`badge ${invite ? "rec-advance" : "rec-decline"}`}>{invite ? "Interview invite" : "Warm rejection"}</span>{" "}
            <EmailBadge status={email.status} /> <strong>{email.subject}</strong>
          </summary>
          {email.error && <div className="flash flash-err">Last send failed: {email.error}</div>}
          <div className="field" style={{ marginTop: 8 }}>
            <label>To</label>
            <input type="text" value={recipient} readOnly />
          </div>
          <div className="field"><label>Subject</label><input type="text" name="subject" defaultValue={email.subject} required /></div>
          <div className="field"><label>Body</label><textarea name="body" rows={10} defaultValue={email.body} required /></div>
        </details>
        <div className="row" style={{ marginTop: 8 }}>
          <SubmitButton
            className={invite ? "btn btn-good" : "btn btn-primary"}
            pendingText="Sending…"
            disabled={!candidateEmail}
            confirm={`Send this ${invite ? "interview invite" : "rejection"} to ${recipient}${redirect ? ` (test mode: delivered to ${redirect})` : ""}?`}
          >
            Confirm &amp; send
          </SubmitButton>
          <SubmitButton className="btn btn-sm" formAction={switchKind} pendingText="Switching…">
            {invite ? "Reject instead" : "Invite instead"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
