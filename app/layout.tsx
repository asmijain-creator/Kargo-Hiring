import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { authRequired } from "@/lib/auth";
import { logout } from "./login/actions";

export const metadata: Metadata = {
  title: "Kargo Hiring",
  description: "Rubric-based CV screening, briefs and candidate emails for Kargo's product roles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">Kargo Hiring</Link>
          <Link href="/">Dashboard</Link>
          <Link href="/candidates/new">Add CVs</Link>
          <Link href="/outbox">Outbox</Link>
          <Link href="/settings">Settings</Link>
          {authRequired() && (
            <form action={logout} style={{ marginLeft: "auto" }}>
              <button type="submit" className="btn btn-sm">Sign out</button>
            </form>
          )}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
