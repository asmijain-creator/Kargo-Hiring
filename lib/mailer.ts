import { Resend } from "resend";

export function mailConfig() {
  return {
    apiKeySet: Boolean(process.env.RESEND_API_KEY),
    from: process.env.EMAIL_FROM || "",
    replyTo: process.env.EMAIL_REPLY_TO || "",
    testRedirect: process.env.EMAIL_TEST_REDIRECT || "",
  };
}

export function mailReady() {
  const c = mailConfig();
  return c.apiKeySet && Boolean(c.from);
}

let client: Resend | null = null;
let clientKey = "";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  sentTo: string;
}

// Sends a plain-text email. When EMAIL_TEST_REDIRECT is set, the email goes there instead
// of the candidate, with the intended recipient noted at the top.
export async function sendEmail(opts: {
  emailId: string;
  kind: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const cfg = mailConfig();
  if (!cfg.apiKeySet) return { ok: false, error: "RESEND_API_KEY is not set.", sentTo: opts.to };
  if (!cfg.from) return { ok: false, error: "EMAIL_FROM is not set.", sentTo: opts.to };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.to)) {
    return { ok: false, error: `"${opts.to}" isn't a valid email address.`, sentTo: opts.to };
  }

  const redirected = Boolean(cfg.testRedirect);
  const to = redirected ? cfg.testRedirect : opts.to;
  const text = redirected ? `[Test mode: this email was addressed to ${opts.to}]\n\n${opts.body}` : opts.body;

  if (!client || clientKey !== process.env.RESEND_API_KEY) {
    clientKey = process.env.RESEND_API_KEY ?? "";
    client = new Resend(clientKey);
  }
  try {
    const { data, error } = await client.emails.send(
      {
        from: cfg.from,
        to: [to],
        subject: opts.subject,
        text,
        ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
        tags: [{ name: "kind", value: opts.kind.toLowerCase() }],
      },
      // Same key for retries of the same email record, so a retry after a timeout can't double-send.
      { idempotencyKey: `${opts.kind.toLowerCase()}-${opts.emailId}-${to}` }
    );
    if (error) return { ok: false, error: `${error.name}: ${error.message}`, sentTo: to };
    return { ok: true, id: data?.id, sentTo: to };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), sentTo: to };
  }
}
