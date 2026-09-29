import { REC_LABELS, STATUS_LABELS, type Recommendation } from "@/lib/scoring";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function RecBadge({ rec }: { rec: Recommendation }) {
  return <span className={`badge rec-${rec.toLowerCase()}`}>{REC_LABELS[rec]}</span>;
}

export function GateBadge({ value }: { value: string | null }) {
  const v = value ?? "PENDING";
  const label = { PASS: "Pass", FAIL: "Fail", UNCLEAR: "Unclear", PENDING: "Not checked" }[v] ?? v;
  return <span className={`badge gate-${v.toLowerCase()}`}>{label}</span>;
}

export function EmailBadge({ status }: { status: string }) {
  const label = { DRAFT: "Draft", SENDING: "Sending", SENT: "Sent", FAILED: "Failed" }[status] ?? status;
  return <span className={`badge email-${status.toLowerCase()}`}>{label}</span>;
}

export function ScoreDots({ score }: { score: number | null }) {
  return (
    <span className="dots" aria-label={score ? `${score} of 5` : "unscored"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={score != null && i <= score ? "dot on" : "dot"} />
      ))}
    </span>
  );
}
