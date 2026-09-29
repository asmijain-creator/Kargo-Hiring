import { login } from "./actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 380, margin: "48px auto" }}>
      <Flash err={sp.err} />
      <form action={login} className="card">
        <h1 style={{ marginBottom: 12 }}>Sign in</h1>
        <p className="muted small">Kargo Hiring is private. Enter the team password.</p>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" name="password" required autoFocus autoComplete="current-password"
            style={{ width: "100%", font: "inherit", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--text)" }} />
        </div>
        <SubmitButton className="btn btn-primary" pendingText="Signing in…">Sign in</SubmitButton>
      </form>
    </div>
  );
}
