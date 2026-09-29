# Kargo Hiring

CV screening for Kargo's Product Manager and Senior Product Manager roles. **The system recommends. Arjun decides. That decision is the last thing he touches.**

1. **Upload** the CV folder (PDF, DOCX, TXT, many at once).
2. **Score**: Gemini scores each CV against the rubric, quotes evidence, checks the gates, pulls out name, email and location, and writes a brief (who they are, why they rank here, strengths, gaps, what to probe).
3. **Shortlist**: candidates are ranked per role with a recommendation (Advance / Borderline / Decline).
4. **Decide**: Arjun can change any score, then clicks **Advance** or **Decline**.
5. **Email**: the interview invite (personalised by Gemini) or a kind decline (fixed template) is sent through Resend straight away. Every applicant hears back.

See [RUBRIC.md](RUBRIC.md) for the rubrics and why they're weighted as they are.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env      # then fill in the keys
npm run setup             # creates the tables in your Postgres database and seeds both rubrics + 3 sample CVs
npm run dev               # http://localhost:3000
```

### .env

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | AI scoring, briefs and invite drafts. Get one at https://aistudio.google.com/apikey. Without it you can score by hand. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.8-flash`. |
| `RESEND_API_KEY` | Sends email. |
| `EMAIL_FROM` | Sender, on a domain verified in Resend. Resend's `onboarding@resend.dev` works for testing but only delivers to your own Resend account email. |
| `EMAIL_TEST_REDIRECT` | **Set this while testing.** Every email goes to this address instead of the candidate. |
| `EMAIL_AUTO_SEND` | `true` (default) sends on decision; `false` holds emails as drafts in the Outbox. |
| `EMAIL_REPLY_TO`, `SCREENER_NAME` | Optional. |

## Pages

- **Dashboard**: what's waiting for a decision, the longest wait without a reply, and unsent emails.
- **Role shortlist** (`/roles/[slug]`): ranked table with per-criterion scores, tabs for to decide / advanced / declined, and "Score all unscored".
- **Candidate** (`/candidates/[id]`): brief, CV, evidence per criterion, score overrides, Advance / Decline, and the email with its send status. Undo works until the email has gone out.
- **Brief** (`/candidates/[id]/brief`): a printable one-pager, editable (edits survive re-scoring).
- **Rubric** (`/roles/[slug]/rubric`): weights (must total 100), level wording, gates, calibration notes, threshold, and email scheduling text.
- **Outbox**: every invite and decline, with a retry for failures.
- **Settings**: which keys are configured.

## How it's built

Next.js 15 (App Router, server actions), Prisma + Postgres (Neon), `@google/genai` (Gemini, JSON-schema structured output, PDFs sent inline), Resend, mammoth for DOCX.

- `lib/ai.ts`: scoring prompt, JSON schema, invite drafting, email templates.
- `lib/scoring.ts`: weighted total, gate state, recommendation.
- `lib/service.ts`: scoring, deciding, sending (with double-send guards and Resend idempotency keys).
- `lib/queue.ts`: scoring queue stored in the database; `/api/score-next` works through it one CV at a time.
- `prisma/seed.mjs`: both rubrics. Re-running it never overwrites an existing role.

CVs are treated as untrusted input: the scoring prompt tells Gemini to ignore instructions inside a CV and to flag them.

## Deploying to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js, defaults are fine).
2. **Storage → Create → Neon (Postgres)** and connect it to the project. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. **Settings → Environment Variables**: add `APP_PASSWORD` (the login password), `GEMINI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_REDIRECT` (keep it set while testing), `EMAIL_AUTO_SEND`, `SCREENER_NAME`.
4. Redeploy. The build creates the tables and seeds both rubrics (`prisma db push` + `prisma/seed.mjs`; re-running never overwrites existing roles).

On Vercel the Settings page is read-only, so change keys in the Vercel dashboard. Scoring runs through `/api/score-next`, which open pages call while CVs are queued. Uploads are sent in batches of up to 3 MB to stay under Vercel's 4.5 MB request limit.
