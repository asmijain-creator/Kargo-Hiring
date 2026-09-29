// Seeds the two Kargo rubrics (cleaned-up versions) and a few sample candidates.
// Safe to re-run: roles that already exist are left untouched.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOCATION_GATE = {
  label: "Mumbai, in-office",
  description:
    "Lives in Mumbai, or has said they are willing to relocate to Mumbai, and can work in-office. Mark UNCLEAR if the resume shows neither.",
};

const ROLES = [
  {
    slug: "pm-core-ops",
    title: "Product Manager",
    team: "Core operations platform",
    location: "Mumbai, in-office",
    inviteThreshold: 70,
    calibrationNotes: [
      "Strongest signal: all 5 of Kargo's past hires rated Exceeds (across engineering, operations, sales, customer success and product) did operational work themselves before moving into their current function. None of the 3 rated Meets or Below did. The job spec never asked for this. It is 8 hires, so revisit as more are rated.",
      "The role reports straight to the founder and there is no Head of Product, so engineering relies on this PM to hold sprint priorities. Weight ownership and engineering partnership accordingly.",
      "Credentials (MBA, PM certifications, Reforge, talks) did not predict ratings. Do not score them.",
      "Criteria 5 and 6 are hard to judge from a resume. When the evidence isn't there, score what is shown and add an interview probe rather than guessing.",
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
      {
        name: "Hands-on operations experience",
        weight: 30,
        levels: [
          "Knows the domain only from calls, research or secondary sources.",
          "Occasional site visits or ride-alongs, without sustained time in the field.",
          "Has spent real time in the field during discovery or rollouts (repeated, on-site).",
          "Has done operations work in an adjacent domain, or a short stint in freight/3PL operations.",
          "Has done freight, 3PL, warehouse, dispatch or similar operations work themselves, as their job.",
        ],
      },
      {
        name: "Ships and kills in short cycles, with adoption evidence",
        weight: 15,
        levels: [
          "Lists features shipped, with no adoption or kill evidence.",
          "Mentions measuring adoption, without numbers or decisions that followed.",
          "Shipped features and reports some adoption data.",
          "Iterated on or cut scope of shipped features based on adoption data.",
          "Killed or rolled back features based on usage data and redirected the effort.",
        ],
      },
      {
        name: "Self-started fixes that others adopted",
        weight: 20,
        levels: [
          "Only assigned deliverables.",
          "Proposed improvements outside their assignment, without evidence they happened.",
          "Improved a process within their own remit.",
          "Built something unasked that their own team adopted.",
          "Built something unasked that another team took up.",
        ],
      },
      {
        name: "Discovery depth",
        weight: 10,
        levels: [
          "Interview counts with no insight.",
          "Ran interviews or research with a generic takeaway.",
          "Ran structured discovery that shaped the roadmap.",
          "Found a non-obvious insight through discovery that changed a decision.",
          "Found a non-obvious workflow mismatch in person and acted on it.",
        ],
      },
      {
        name: "Customer shielding under pressure",
        weight: 10,
        note: "Escalating to the right people is not a failure. Score ownership of the outcome.",
        levels: [
          "No example.",
          "Was involved in an incident or escalation without a clear personal role.",
          "Contributed to incident resolution.",
          "Led a significant part of an incident response or escalation.",
          "Owned an outage or escalation through to closure, including customer communication.",
        ],
      },
      {
        name: "Engineering partnership and prioritisation",
        weight: 15,
        levels: [
          "Hands off specs and steps away.",
          "Works with engineering mainly through handoffs, with some follow-through.",
          "Solid working relationship with engineering.",
          "Co-owned planning with engineering and made trade-off calls together.",
          "Clear evidence engineers trust their calls, and they plan about 3 sprints out.",
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
      "Strongest signal: all 5 of Kargo's past hires rated Exceeds did operational work themselves before moving into their current function. None of the 3 rated Meets or Below did. This comes from the same 8 company-wide hires as the PM rubric.",
      "The role reports straight to the founder with no Head of Product above it, so owning decisions without a senior layer matters more than for the PM role.",
      "Technical integration experience without operational ground truth did not predict success: the one hire rated Below was a strong technical hire with no operations background. A high integration score with a low operations score is a warning sign, not a strong profile.",
      "Credentials (MBA, PM certifications, Reforge, talks) did not predict ratings. Do not score them.",
    ].join("\n"),
    gates: [
      LOCATION_GATE,
      {
        label: "5+ years of PM or ownership-equivalent work",
        description:
          "At least 5 years of PM work, or equivalent ownership of product decisions (e.g. founder, operations lead or tech lead who owned what got built). 4-5 years: mark UNCLEAR. Under 4 years: FAIL.",
      },
    ],
    criteria: [
      {
        name: "Owned integration or platform product calls",
        weight: 20,
        levels: [
          "Built integrations to someone else's spec without owning the trade-offs.",
          "Contributed to integration roadmap decisions owned by someone else.",
          "Owned an integration roadmap with some trade-off decisions.",
          "Made build/buy or scope trade-off calls on integrations and defended some against pushback.",
          "Made and defended build vs. configure vs. avoid calls.",
        ],
      },
      {
        name: "Hands-on operations experience",
        weight: 30,
        levels: [
          "No exposure to ops-heavy industries.",
          "Occasional contact with ops users.",
          "Close, repeated exposure to ops users (rollouts, onboarding).",
          "Worked alongside ops teams day to day, embedded, without being in the role.",
          "Worked inside ops-heavy workflows themselves (freight, 3PL, dispatch, warehouse, field operations).",
        ],
      },
      {
        name: "Decisions with no senior layer above",
        weight: 20,
        note: "Judge the decisions they owned, not how their company was structured.",
        levels: [
          "No evidence of owning decisions.",
          "Made recommendations that a senior PM or lead decided on.",
          "Owned decisions with light oversight.",
          "Owned most decisions in an area, with sign-off only on the largest ones.",
          "Sole owner of an area; made the calls and lived with the consequences.",
        ],
      },
      {
        name: "Reliability and data quality under failure",
        weight: 10,
        levels: [
          "No reliability involvement.",
          "Took part in on-call or reliability reviews without a leading role.",
          "Contributed to reliability work or incident resolution.",
          "Led a significant part of a migration or incident response.",
          "Led a vendor migration or incident and put safeguards in place that prevented or limited data loss.",
        ],
      },
      {
        name: "Integrations tied to revenue",
        weight: 10,
        levels: [
          "No link to commercial outcomes.",
          "Aware of the commercial impact of integrations, without working with sales.",
          "Worked with sales on integration priorities.",
          "Shaped integration priorities around specific deals or pipeline, with a visible effect.",
          "An integration they owned unblocked a deal or opened a new segment.",
        ],
      },
      {
        name: "Sets standards others adopt",
        weight: 10,
        levels: [
          "Follows existing process.",
          "Proposed practice changes, without evidence of adoption.",
          "Improved practices within their own team.",
          "Their practices became standard in their own team.",
          "Their practices or frameworks became standard beyond their team.",
        ],
      },
    ],
  },
];

// Fictional sample candidates (example.com addresses never deliver).
const SAMPLES = [
  {
    role: "pm-core-ops",
    name: "Sample: Neha Kulkarni",
    email: "neha.sample@example.com",
    location: "Mumbai",
    source: "Sample data",
    resumeText: `NEHA KULKARNI (sample resume) - Mumbai

Product Manager, FleetLine (B2B freight marketplace) - 2023-present
- Own the carrier app used by 4,000 truck owners. Shipped load-matching v2; weekly active carriers went from 38% to 61% in two months.
- Killed the in-app bidding feature after 6 weeks when only 3% of carriers used it; moved the team to automated rate suggestions, which 54% now accept.
- Spent two weeks riding with dispatchers in Bhiwandi and found they re-key every booking into WhatsApp because the app has no group broadcast. Built a broadcast prototype over a weekend; ops adopted it across 3 hubs.
- Owned the Diwali-week outage response (payments delay, 900 carriers affected): ran the war room, wrote carrier updates twice a day, closed it in 36 hours.

Operations Associate, SwiftShip 3PL - 2020-2023
- Ran inbound at a 60,000 sq ft warehouse; managed a 25-person shift.
- Built a Google Sheets slotting tracker that the other two warehouses adopted.

Education: B.E. Mechanical, VJTI Mumbai. Certified Scrum Product Owner.`,
  },
  {
    role: "pm-core-ops",
    name: "Sample: Karan Malhotra",
    email: "karan.sample@example.com",
    location: "Bengaluru",
    source: "Sample data",
    resumeText: `KARAN MALHOTRA (sample resume) - Bengaluru

Product Manager, PayWave (consumer fintech) - 2022-present
- Shipped 14 features across onboarding, KYC and rewards.
- Conducted 60+ user interviews.
- Wrote PRDs and worked with a team of 8 engineers.

Associate Product Manager, ShopKart - 2021-2022
- Launched wishlist and price-drop alerts.

Education: MBA, IIM Indore. Reforge Product Strategy. Speaker at ProductCon 2024.`,
  },
  {
    role: "spm-integrations",
    name: "Sample: Farah Sheikh",
    email: "farah.sample@example.com",
    location: "Pune (open to relocating to Mumbai)",
    source: "Sample data",
    resumeText: `FARAH SHEIKH (sample resume) - Pune, open to relocating

Senior PM, Integrations - TransitOS (TMS for mid-size shippers) - 2021-present
- Sole PM for the integrations area (ERP, carrier APIs, EDI). Decided to configure a middleware vendor for EDI instead of building in-house; defended it to the CTO and cut partner onboarding from 9 weeks to 3.
- Led the migration off a failing telematics vendor for 1,200 fleets; designed dual-write and reconciliation checks, zero records lost.
- SAP connector unblocked two enterprise deals (~INR 4 Cr ARR) and opened the auto-components segment.
- Wrote the integration spec template now used by all 5 product teams.

Product Manager, Delhivery-style courier ops platform - 2018-2021
- Spent the first 8 months as a hub operations lead running line-haul scheduling before moving into product.

Education: B.Tech, NIT Surat.`,
  },
];

async function main() {
  for (const r of ROLES) {
    const existing = await prisma.role.findUnique({ where: { slug: r.slug } });
    if (existing) {
      console.log(`Role ${r.slug} already exists, skipping.`);
      continue;
    }
    await prisma.role.create({
      data: {
        slug: r.slug,
        title: r.title,
        team: r.team,
        location: r.location,
        inviteThreshold: r.inviteThreshold,
        calibrationNotes: r.calibrationNotes,
        gates: { create: r.gates.map((g, i) => ({ ...g, order: i + 1 })) },
        criteria: {
          create: [...r.criteria].sort((a, b) => b.weight - a.weight).map((c, i) => ({
            order: i + 1,
            name: c.name,
            weight: c.weight,
            note: c.note ?? null,
            level1: c.levels[0],
            level2: c.levels[1],
            level3: c.levels[2],
            level4: c.levels[3],
            level5: c.levels[4],
          })),
        },
      },
    });
    console.log(`Created role ${r.slug}.`);
  }

  for (const s of SAMPLES) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { slug: s.role },
      include: { gates: true, criteria: true },
    });
    const exists = await prisma.candidate.findFirst({ where: { email: s.email, roleId: role.id } });
    if (exists) continue;
    await prisma.candidate.create({
      data: {
        roleId: role.id,
        name: s.name,
        email: s.email,
        location: s.location,
        source: s.source,
        resumeText: s.resumeText,
        gateResults: { create: role.gates.map((g) => ({ gateId: g.id })) },
        scores: { create: role.criteria.map((c) => ({ criterionId: c.id })) },
      },
    });
    console.log(`Created sample candidate ${s.name}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
