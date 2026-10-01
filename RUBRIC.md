# Kargo screening rubrics

The full rubric, with the evidence behind every criterion, is in [rubric.txt](rubric.txt). It was built from the 8 past-hire profiles, not the job descriptions (the JDs were only used to understand the roles). The app loads it into the `rubric_criteria` table from `prisma/seed.mjs`; bump `prisma/rubric-version.json` when it changes and every unsent candidate is re-scored.

## The three patterns

All 5 hires rated Exceeds had these; the 3 rated Meets or Below didn't:

1. **Did the operations work themselves** before their current function (freight docs, CHA, port, 3PL). The one Below hire knew logistics only through API integrations.
2. **Built an unasked fix that others adopted** (Rohan's Excel tracker, Sunita's weekend workflow redesign, Meghna's onboarding checklist, Lavanya's dashboard).
3. **Owned failures in the open** (Lavanya killed 2 features and wrote the outage post-mortem; Aditya's lost-deal post-mortem; Meghna's overnight customs hold).

## Product Manager

| Criterion | Weight |
|---|---|
| Did the operations work themselves | 30% |
| Built an unasked fix that others adopted | 25% |
| Kills and owns failures in the open | 20% |
| Took the hit so the customer didn't | 15% |
| Translated the field into what gets built | 10% |

## Senior Product Manager (higher bar on independence)

| Criterion | Weight |
|---|---|
| Did the operations work themselves | 25% |
| Made the call with no one above them | 25% |
| Built an unasked fix that others adopted | 20% |
| Kept data and operations whole through a failure | 15% |
| Kills and owns failures in the open | 15% |

Each criterion is scored 1-5; weighted score = sum of (score / 5 x weight), out of 100. Credentials (MBA, certifications, Reforge, talks) are never scored.
