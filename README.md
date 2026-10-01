# Kargo Hiring

CV screening for Kargo's Product Manager and Senior Product Manager roles. **The system recommends. Arjun decides. That decision is the last thing he touches.**

1. **Upload** CVs (PDF, DOCX, TXT, many at once) and pick the role applied for.
2. **Split personal details**: code (not AI) pulls the name, email and phone out of the CV and stores them on the candidate row. The rest of the CV, with those replaced by [NAME], [EMAIL], [PHONE] and [LINK], is the only thing any AI step sees.
3. **Score**: Gemini scores every candidate against **both** the PM and SPM rubrics - a score and a one-line reason per criterion.
4. **Brief**: the top 5 per role get a three-sentence interview brief (who they are, why they rank here, what to probe).
5. **Draft**: every candidate gets a personalised email drafted from their CV - an interview invite for the top 5, a warm rejection for everyone else. Gemini writes [NAME]; the real name is filled in by code from the stored details.
6. **Confirm**: Arjun reads the ranked shortlist, the brief and the draft, and clicks **Confirm & send**. Resend sends it and the candidate is marked as sent. Nothing goes out without that click. He can also switch an invite to a rejection (or back), or edit the text first.

See [rubric.txt](rubric.txt) and [RUBRIC.md](RUBRIC.md) for the rubrics and where each criterion came from.

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
| `EMAIL_REPLY_TO`, `SCREENER_NAME` | Optional. |

## Pages

- **Dashboard**: interview invites waiting for a confirm, pipeline progress, emails not sent.
- **Role shortlist** (`/roles/[slug]`): everyone who applied for the role, ranked by score, with the line after the top 5, the per-criterion breakdown, the score against the other role, the brief, and the draft email with Confirm & send.
- **Candidate** (`/candidates/[id]`): personal details (private), brief, draft email, scores on both rubrics with overrides, and the redacted CV exactly as the AI sees it.
- **Rubric** (`/roles/[slug]/rubric`): weights and level wording.
- **Outbox**: every draft and sent email; rejections can be confirmed in bulk.

## How it's built

Next.js 15 (App Router, server actions), Prisma + Postgres (Supabase), `@google/genai` (Gemini, JSON-schema structured output), Resend, unpdf and mammoth to turn CVs into text.

- `lib/pii.ts`: splits name, email and phone out of the CV in code.
- `lib/ai.ts`: scoring prompt and schema, brief + email drafting.
- `lib/queries.ts`: ranking per role and who lands in the top 5.
- `lib/scoring.ts`: weighted total, gate state, recommendation.
- `lib/service.ts`: the pipeline (score both rubrics, then briefs and drafts once scoring settles) and Confirm & send (with double-send guards and Resend idempotency keys).
- `lib/queue.ts`: scoring queue stored in the database; `/api/score-next` works through it one CV at a time.
- `prisma/seed.mjs`: both rubrics. Re-running it never overwrites an existing role.

CVs are treated as untrusted input: the scoring prompt tells Gemini to ignore instructions inside a CV and to flag them.

## Deploying to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js, defaults are fine).
2. In Supabase, open **Connect → ORMs → Prisma** and copy `DATABASE_URL` (transaction pooler, port 6543, ends in `?pgbouncer=true`) and `DIRECT_URL` (session pooler, port 5432) into the Vercel project's environment variables.
3. **Settings → Environment Variables**: add `APP_PASSWORD` (the login password), `GEMINI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_REDIRECT` (keep it set while testing), `SCREENER_NAME`.
4. Redeploy. The build creates the tables and seeds both rubrics (`prisma db push` + `prisma/seed.mjs`; re-running never overwrites existing roles).

On Vercel the Settings page is read-only, so change keys in the Vercel dashboard. Scoring runs through `/api/score-next`, which open pages call while CVs are queued. Uploads are sent in batches of up to 3 MB to stay under Vercel's 4.5 MB request limit.
