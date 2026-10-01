import type { Criterion, CriterionScore, Gate, GateResult } from "@prisma/client";

export type GateValue = "PASS" | "FAIL" | "UNCLEAR";

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  SCORED: "Needs review",
  ADVANCED: "Advanced",
  DECLINED: "Declined",
};

export function levelText(c: Criterion, score: number): string {
  return [c.level1, c.level2, c.level3, c.level4, c.level5][score - 1] ?? "";
}

export function effectiveScore(s: Pick<CriterionScore, "finalScore" | "aiScore">): number | null {
  return s.finalScore ?? s.aiScore ?? null;
}

export function effectiveGate(g: Pick<GateResult, "finalResult" | "aiResult">): GateValue | null {
  return (g.finalResult ?? g.aiResult ?? null) as GateValue | null;
}

type ScoreRow = CriterionScore & { criterion: Criterion };
type GateRow = GateResult & { gate: Gate };

export interface Evaluation {
  // Weighted total per the rubric: sum of (score / 5 x weight). Null until every criterion has a score.
  total: number | null;
  // Total counting only the criteria scored so far, for a partial view.
  partial: number;
  scored: number;
  criteriaCount: number;
  gates: "PASS" | "FAIL" | "UNCLEAR" | "PENDING";
}

export function evaluate(scores: ScoreRow[], gates: GateRow[]): Evaluation {
  let partial = 0;
  let scored = 0;
  for (const s of scores) {
    const v = effectiveScore(s);
    if (v == null) continue;
    scored++;
    partial += (v / 5) * s.criterion.weight;
  }
  const values = gates.map(effectiveGate);
  let gateState: Evaluation["gates"] = "PASS";
  if (values.some((v) => v === "FAIL")) gateState = "FAIL";
  else if (values.some((v) => v == null)) gateState = "PENDING";
  else if (values.some((v) => v === "UNCLEAR")) gateState = "UNCLEAR";
  return {
    total: scores.length > 0 && scored === scores.length ? round1(partial) : null,
    partial: round1(partial),
    scored,
    criteriaCount: scores.length,
    gates: gateState,
  };
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export type Recommendation = "ADVANCE" | "REVIEW" | "DECLINE" | "PENDING";

export const REC_LABELS: Record<Recommendation, string> = {
  ADVANCE: "Advance",
  REVIEW: "Borderline",
  DECLINE: "Decline",
  PENDING: "Not scored",
};

// How far below the threshold a candidate still counts as borderline rather than a decline.
export const BORDERLINE_BAND = 8;

// The system recommends; Arjun decides. This never changes a candidate's status on its own.
export function recommend(ev: Evaluation, threshold: number): { rec: Recommendation; reason: string } {
  if (ev.gates === "FAIL") return { rec: "DECLINE", reason: "Fails a gate." };
  if (ev.total == null || ev.gates === "PENDING") return { rec: "PENDING", reason: "Scoring isn't complete." };
  if (ev.gates === "UNCLEAR") return { rec: "REVIEW", reason: "A gate is unclear and needs a human call." };
  if (ev.total >= threshold) return { rec: "ADVANCE", reason: `Score ${ev.total} meets the threshold of ${threshold}.` };
  if (ev.total >= threshold - BORDERLINE_BAND)
    return { rec: "REVIEW", reason: `Score ${ev.total} is just under the threshold of ${threshold}.` };
  return { rec: "DECLINE", reason: `Score ${ev.total} is well below the threshold of ${threshold}.` };
}

export function canAdvance(status: string, ev: Evaluation): { ok: boolean; reason: string } {
  if (status === "ADVANCED" || status === "DECLINED") return { ok: false, reason: "Already decided." };
  if (ev.gates === "FAIL") return { ok: false, reason: "A gate is marked Fail. If that's wrong, change it and save first." };
  if (ev.total == null) return { ok: false, reason: "Score every criterion and save first." };
  return { ok: true, reason: "" };
}

export function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// A candidate has score rows for both rubrics; this evaluates them against one role's rubric.
export function evaluateRole(
  c: { scores: ScoreRow[]; gateResults: GateRow[] },
  roleId: string
): Evaluation {
  return evaluate(
    c.scores.filter((s) => s.criterion.roleId === roleId),
    c.gateResults.filter((g) => g.gate.roleId === roleId)
  );
}

// How many applicants per role get an interview invite drafted (the rest get a warm rejection).
export const INVITE_SLOTS = 5;

export type EmailKind = "INVITE" | "DECLINE";
