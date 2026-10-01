// Seeds the two Kargo rubrics from rubric.txt (built from the 8 past-hire profiles, not the JDs).
// Safe to re-run. When RUBRIC_VERSION changes, each role's criteria are replaced and every
// candidate who hasn't been emailed is queued to be scored again against the new rubric.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Bump the version in rubric-version.json whenever the rubric below changes.
const RUBRIC_VERSION = JSON.parse(readFileSync(new URL("./rubric-version.json", import.meta.url), "utf8")).version;

const LOCATION_GATE = {
  label: "Mumbai, in-office",
  description:
    "Lives in Mumbai, or has said they are willing to relocate to Mumbai, and can work in-office. Mark UNCLEAR if the resume shows neither.",
};

const OPS = {
  name: "Did the operations work themselves",
  levels: [
    "No exposure to operations-heavy work; domain known only from research, interviews, sales or reading.",
    "Contact with operations users from the outside: interviews, sales calls, or API integrations with logistics providers.",
    "Repeated on-site time with operations teams (rollouts, onboarding, embedded discovery) without doing the job.",
    "Did operations work themselves in an adjacent field (e-commerce fulfilment, field ops, supply chain planning) or a short stint in freight/3PL operations.",
    "Personally ran freight, 3PL, port, customs/documentation, warehouse or dispatch operations as their job, handling shipments, carriers or exceptions day to day.",
  ],
};

const UNASKED_FIX = {
  name: "Built an unasked fix that others adopted",
  levels: [
    "Only assigned deliverables.",
    "Suggested improvements outside their remit, with no sign they happened.",
    "Improved a process inside their own remit.",
    "Noticed a broken process, built a fix nobody asked for, and their own team adopted it.",
    "Built an unasked fix that spread beyond their own team (other teams, regions or the whole function), with numbers.",
  ],
};

const OWNS_FAILURES = {
  name: "Kills and owns failures in the open",
  levels: [
    "Only wins on the CV; no evidence of what happened after things shipped.",
    "Mentions measuring outcomes, but no decision that followed a miss.",
    "Changed course on something after data showed it wasn't working.",
    "Killed, rolled back or re-scoped their own work on evidence, or ran a post-mortem on a loss.",
    "Killed their own feature or bet on usage data AND wrote up why, so the team changed how it works.",
  ],
};

const ROLES = [
  {
    slug: "pm-core-ops",
    title: "Product Manager",
    team: "Core operations platform",
    location: "Mumbai, in-office",
    inviteThreshold: 70,
    calibrationNotes: [
      "Rubric source: the 8 past-hire profiles. All 5 hires rated Exceeds had done operations work themselves, had built an unasked fix that others adopted, and owned failures in the open. The 3 rated Meets or Below did not.",
      "Credentials (MBA, PM certifications, Reforge, talks, school) did not predict ratings: the hire with the strongest credentials was rated Meets. Never score them.",
      "Integrating with logistics providers through APIs is not operations experience: the one hire rated Below had exactly that profile.",
      "Score only what the CV shows. When evidence is thin, score low and add an interview probe instead of guessing.",
    ].join("\n"),
    gates: [
      LOCATION_GATE,
      {
        label: "2+ years of PM work",
        description:
          "At least 2 years in product management roles (APM and associate PM roles count). 18-23 months: mark UNCLEAR for a human to decide. Under 18 months: FAIL.",
      },
    ],
    criteria: [
      { ...OPS, weight: 30 },
      { ...UNASKED_FIX, weight: 25 },
      { ...OWNS_FAILURES, weight: 20 },
      {
        name: "Took the hit so the customer didn't",
        weight: 15,
        levels: [
          "No example of an incident or escalation.",
          "Was involved in an incident without a clear personal role.",
          "Helped resolve an incident or escalation.",
          "Led the response to an incident or escalation under time pressure.",
          "Personally owned an outage, customs hold or escalation through to closure, including customer communication, so the customer was protected.",
        ],
      },
      {
        name: "Translated the field into what gets built",
        weight: 10,
        levels: [
          "Interview counts or generic 'ran discovery' with no finding.",
          "Ran research with a general takeaway.",
          "Discovery that shaped a roadmap item.",
          "Found a specific workflow mismatch with users and turned it into a shipped change.",
          "Went where operations users work, found a non-obvious mismatch, and shipped a change with a measured result.",
        ],
      },
    ],
  },
  {
    slug: "spm-integrations",
    title: "Senior Product Manager",
    team: "Integration and data layer",
    location: "Mumbai, in-office",
    inviteThreshold: 72,
    calibrationNotes: [
      "Same patterns as the PM rubric (from the 8 past-hire profiles), with a higher bar on operating with no one above to make the call.",
      "A strong technical or integration record with no hands-on operations is a warning sign, not a substitute: the one hire rated Below fit that profile.",
      "Credentials (MBA, PM certifications, Reforge, talks, school) did not predict ratings. Never score them.",
      "Score only what the CV shows. When evidence is thin, score low and add an interview probe instead of guessing.",
    ].join("\n"),
    gates: [
      LOCATION_GATE,
      {
        label: "5+ years of PM or ownership-equivalent work",
        description:
          "At least 5 years of PM work, or equivalent ownership of product decisions (founder, operations lead or tech lead who owned what got built). 4-5 years: mark UNCLEAR. Under 4 years: FAIL.",
      },
    ],
    criteria: [
      {
        ...OPS,
        weight: 25,
        levels: [
          ...OPS.levels.slice(0, 4),
          "Multiple years personally running freight, 3PL, port, customs, warehouse or dispatch operations, and visibly drawing on it in later roles.",
        ],
      },
      {
        name: "Made the call with no one above them",
        weight: 25,
        note: "Judge the decisions they owned, not how their company was structured.",
        levels: [
          "No evidence of owning decisions.",
          "Made recommendations a senior PM or lead decided on.",
          "Owned decisions with light oversight.",
          "Owned most decisions in an area, with sign-off only on the largest.",
          "Sole owner of an area (sole PM, independent, founder, no manager layer) who made contested calls and lived with the results.",
        ],
      },
      {
        ...UNASKED_FIX,
        weight: 20,
        levels: [
          ...UNASKED_FIX.levels.slice(0, 4),
          "Built an unasked fix or framework that became the standard beyond their team or company, with numbers.",
        ],
      },
      {
        name: "Kept data and operations whole through a failure",
        weight: 15,
        levels: [
          "No involvement in a migration, outage or integration failure.",
          "On-call or reliability participation only.",
          "Contributed to a migration or incident resolution.",
          "Led a migration, outage or integration failure with a stated outcome for the operation.",
          "Led it end to end with no data loss or shipment disruption, and put a safeguard in place afterwards.",
        ],
      },
      { ...OWNS_FAILURES, weight: 15 },
    ],
  },
];

function criteriaRows(r) {
  return r.criteria.map((c, i) => ({
    order: i + 1,
    name: c.name,
    weight: c.weight,
    note: c.note ?? null,
    level1: c.levels[0],
    level2: c.levels[1],
    level3: c.levels[2],
    level4: c.levels[3],
    level5: c.levels[4],
  }));
}

async function main() {
  for (const r of ROLES) {
    const total = r.criteria.reduce((a, c) => a + c.weight, 0);
    if (total !== 100) throw new Error(`${r.slug} weights add to ${total}, not 100`);

    const existing = await prisma.role.findUnique({ where: { slug: r.slug } });
    if (!existing) {
      await prisma.role.create({
        data: {
          slug: r.slug,
          title: r.title,
          team: r.team,
          location: r.location,
          inviteThreshold: r.inviteThreshold,
          calibrationNotes: r.calibrationNotes,
          rubricVersion: RUBRIC_VERSION,
          gates: { create: r.gates.map((g, i) => ({ ...g, order: i + 1 })) },
          criteria: { create: criteriaRows(r) },
        },
      });
      console.log(`Created role ${r.slug}.`);
      continue;
    }
    if (existing.rubricVersion === RUBRIC_VERSION) {
      console.log(`Role ${r.slug} already on rubric ${RUBRIC_VERSION}.`);
      continue;
    }
    // New rubric: replace criteria and gates (their old scores are deleted with them).
    await prisma.$transaction([
      prisma.criterion.deleteMany({ where: { roleId: existing.id } }),
      prisma.gate.deleteMany({ where: { roleId: existing.id } }),
      prisma.role.update({
        where: { id: existing.id },
        data: {
          calibrationNotes: r.calibrationNotes,
          inviteThreshold: r.inviteThreshold,
          rubricVersion: RUBRIC_VERSION,
          gates: { create: r.gates.map((g, i) => ({ ...g, order: i + 1 })) },
          criteria: { create: criteriaRows(r) },
        },
      }),
    ]);
    console.log(`Replaced rubric for ${r.slug}.`);
  }

  // Anyone not yet emailed is re-scored against the current rubric.
  const requeued = await prisma.candidate.updateMany({
    where: { status: { notIn: ["ADVANCED", "DECLINED"] }, aiScoredAt: { not: null }, rubricVersion: { not: RUBRIC_VERSION } },
    data: { status: "NEW", aiQueuedAt: new Date(), aiStartedAt: null, aiError: null },
  });
  if (requeued.count) console.log(`Queued ${requeued.count} candidate(s) for re-scoring.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
