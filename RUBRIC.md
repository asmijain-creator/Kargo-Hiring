# Kargo screening rubrics

Built from the Case 2 problem statement. The job spec describes the role; it doesn't predict who succeeds. These rubrics weight what Kargo's best past hires actually had in common.

## What the case says matters, and how it shaped the weights

| Evidence from the case | Effect on the rubric |
|---|---|
| All 5 hires rated Exceeds (engineering, ops, sales, CS, product) did operational work themselves first; none of the 3 rated Meets or Below did. The spec never asks for it. | Hands-on operations experience is the heaviest criterion in both rubrics: **30%**. |
| Both roles report straight to the founder; there is no Head of Product. | Ownership without a senior layer goes up (Senior PM: 15% → **20%**). |
| Without a PM, "sprint priorities drift, roadmap decisions get deferred". | Engineering partnership and prioritisation goes up for the PM role (10% → **15%**). |
| The one Below-rated hire was a strong technical hire with no operations background. | Integration or platform calls drop for the Senior PM (25% → **20%**). A high integration score with a low ops score is flagged as a warning sign. |
| Credentials didn't predict ratings. | Credentials (MBA, certifications, Reforge, talks) are never scored. |

Score each criterion 1–5. Weighted score = sum of (score / 5 × weight), out of 100. The system recommends Advance at the threshold, Borderline within 8 points below it, and Decline below that or on a failed gate. Arjun makes every decision.

## Product Manager: core operations platform (advance at 70+)

**Gates:** Mumbai-based or willing to relocate, in-office · 2+ years of PM work (18–23 months = Unclear).

| # | Criterion | Weight | Was |
|---|---|---|---|
| C1 | Hands-on operations experience | 30% | 25% |
| C2 | Self-started fixes that others adopted | 20% | 20% |
| C3 | Ships and kills in short cycles, with adoption evidence | 15% | 20% |
| C4 | Engineering partnership and prioritisation | 15% | 10% |
| C5 | Discovery depth | 10% | 15% |
| C6 | Customer shielding under pressure | 10% | 10% |

## Senior Product Manager: integration and data layer (advance at 72+)

**Gates:** Mumbai-based or willing to relocate, in-office · 5+ years of PM or ownership-equivalent work (4–5 years = Unclear).

| # | Criterion | Weight | Was |
|---|---|---|---|
| C1 | Hands-on operations experience | 30% | 20% |
| C2 | Decisions with no senior layer above | 20% | 15% |
| C3 | Owned integration or platform product calls | 20% | 25% |
| C4 | Reliability and data quality under failure | 10% | 15% |
| C5 | Integrations tied to revenue | 10% | 15% |
| C6 | Sets standards others adopt | 10% | 10% |

## Other changes from the original drafts

- Levels 2 and 4 are defined for every criterion, so different screeners score alike.
- Named past hires are no longer used as scoring anchors. The rubric describes the behaviour instead.
- "Escalated it upward" no longer scores 1. Customer shielding scores ownership of the outcome.
- "Formal on-call only" no longer scores 1 for reliability. A 1 means no reliability involvement at all.
- "Decisions with no senior layer" is judged on what the candidate owned, not on how their company was structured.
- Gates have explicit borderline bands that go to a human as Unclear.

The full level wording lives in the app (each role's Rubric page), where it can be edited.
