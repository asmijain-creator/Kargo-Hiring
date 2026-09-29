import { aiConfigured, currentModel, DEFAULT_MODEL } from "@/lib/ai";
import { autoSendEnabled, mailConfig } from "@/lib/mailer";
import { screenerName } from "@/lib/service";
import { saveSettings } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function Status({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return (
    <span className={ok ? "badge rec-advance" : "badge rec-decline"}>
      {ok ? "Set" : "Missing"}
      {children}
    </span>
  );
}

function masked(v: string | undefined) {
  return v ? ` · ends …${v.slice(-4)}` : "";
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const mail = mailConfig();

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Paste your keys here and press Save. They're stored in this app's <code>.env</code> file on your computer and take effect
            straight away.
          </p>
        </div>
      </div>

      <form action={saveSettings} className="stack" style={{ maxWidth: 760 }} autoComplete="off">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>1. Gemini API key</h2>
            <Status ok={aiConfigured()}>{masked(process.env.GEMINI_API_KEY)}</Status>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Scores CVs, writes briefs and drafts invites. Get one at{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> → Create API key.
          </p>
          <div className="field">
            <label htmlFor="GEMINI_API_KEY">Paste key</label>
            <input
              id="GEMINI_API_KEY"
              type="password"
              name="GEMINI_API_KEY"
              placeholder={aiConfigured() ? "Leave empty to keep the current key" : "AIza..."}
            />
          </div>
          <div className="field">
            <label htmlFor="GEMINI_MODEL">Model (optional)</label>
            <input id="GEMINI_MODEL" type="text" name="GEMINI_MODEL" defaultValue={process.env.GEMINI_MODEL ?? ""} placeholder={DEFAULT_MODEL} />
            <p className="small muted">Using {currentModel()}.</p>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>2. Resend API key</h2>
            <Status ok={mail.apiKeySet}>{masked(process.env.RESEND_API_KEY)}</Status>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Sends the invite and decline emails. Get one at{" "}
            <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">resend.com/api-keys</a> → Create API Key.
          </p>
          <div className="field">
            <label htmlFor="RESEND_API_KEY">Paste key</label>
            <input
              id="RESEND_API_KEY"
              type="password"
              name="RESEND_API_KEY"
              placeholder={mail.apiKeySet ? "Leave empty to keep the current key" : "re_..."}
            />
          </div>
          <div className="field">
            <label htmlFor="EMAIL_TEST_REDIRECT">3. Test mode: send every email to</label>
            <input
              id="EMAIL_TEST_REDIRECT"
              type="email"
              name="EMAIL_TEST_REDIRECT"
              defaultValue={mail.testRedirect}
              placeholder="The email you signed up to Resend with"
            />
            <p className="small muted">
              While this is filled in, no candidate gets an email: they all come to you. Clear it only when you're ready to email real
              candidates.
            </p>
          </div>
          <div className="field">
            <label htmlFor="EMAIL_FROM">From address</label>
            <input id="EMAIL_FROM" type="text" name="EMAIL_FROM" defaultValue={mail.from} />
            <p className="small muted">
              Keep <code>Kargo Hiring &lt;onboarding@resend.dev&gt;</code> for testing. For real candidates, verify a domain in Resend and use
              an address on it.
            </p>
          </div>
          <div className="field">
            <label htmlFor="EMAIL_REPLY_TO">Reply-to (optional)</label>
            <input id="EMAIL_REPLY_TO" type="email" name="EMAIL_REPLY_TO" defaultValue={mail.replyTo} />
          </div>
        </div>

        <div className="card">
          <h2>Behaviour</h2>
          <div className="field">
            <label htmlFor="SCREENER_NAME">Decisions recorded as</label>
            <input id="SCREENER_NAME" type="text" name="SCREENER_NAME" defaultValue={screenerName()} />
          </div>
          <label className="row" style={{ fontWeight: 400 }}>
            <input type="checkbox" name="EMAIL_AUTO_SEND" defaultChecked={autoSendEnabled()} />
            Send the email as soon as I click Advance or Decline (otherwise it waits in the Outbox)
          </label>
        </div>

        <div className="row">
          <SubmitButton className="btn btn-primary" pendingText="Saving…">Save settings</SubmitButton>
        </div>
      </form>
    </>
  );
}
