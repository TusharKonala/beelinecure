import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ApplicationStatus,
  JobType,
  PrismaClient,
  UserRole,
} from "../generated/prisma/client.js";

const SEED_TITLE_PREFIX = "[Seed] ";
const SEED_EMAIL_DOMAIN = "@careers-seed.beelinecure.test";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

function seedEmail(slug: string) {
  return `${slug}${SEED_EMAIL_DOMAIN}`;
}

function confirmationToken() {
  return randomBytes(32).toString("hex");
}

const POSTINGS = [
  {
    slug: "front-desk",
    title: "Front Desk Coordinator",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$38,000 – $45,000",
    isActive: true,
    description: `BeelineCure Multi-Specialty Clinic is hiring a Front Desk Coordinator for our main outpatient center.

You will greet patients, verify insurance details, schedule appointments across cardiology, orthopedics, and general medicine, and coordinate with nursing staff for same-day add-ons.

Requirements:
- 1+ years in a medical office or clinic front desk
- Familiarity with EHR scheduling workflows
- Professional phone manner and HIPAA awareness
- Evening or Saturday rotation (shared across team)

We offer health benefits, paid time off, and on-site parking.`,
  },
  {
    slug: "registered-nurse-opd",
    title: "Registered Nurse — Outpatient (OPD)",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$72,000 – $88,000",
    isActive: true,
    description: `Join our OPD nursing team supporting multi-specialty consults and minor procedures.

Responsibilities include triage support, vitals, specimen labeling, patient education, and assisting physicians during clinic hours.

Requirements:
- Active RN license in good standing
- Experience in ambulatory or multi-specialty settings preferred
- BLS certification
- Comfortable with high patient volume and interdisciplinary handoffs`,
  },
  {
    slug: "lab-technician",
    title: "Medical Laboratory Technician",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$52,000 – $61,000",
    isActive: true,
    description: `Our on-site laboratory supports internal medicine, endocrinology, and pre-operative panels for the clinic network.

You will run routine hematology and chemistry workflows, maintain QC logs, and coordinate courier pickups for send-out tests.

Requirements:
- MLT/MLS certification or equivalent experience
- Attention to specimen integrity and turnaround times
- Ability to document results in the clinic LIS`,
  },
  {
    slug: "radiology-tech",
    title: "Radiology Technologist",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$34 – $42 / hour",
    isActive: true,
    description: `Part-time role in our imaging suite (X-ray and basic ultrasound support) for orthopedic and sports medicine referrals.

Requirements:
- ARRT certification
- Experience positioning patients and communicating with referring clinicians
- Flexible availability Tuesday–Saturday`,
  },
  {
    slug: "clinic-ops-manager",
    title: "Clinic Operations Manager",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$95,000 – $110,000",
    isActive: false,
    description: `Lead daily operations for a 40-provider multi-specialty clinic (inactive posting for admin UI testing).

This role is not accepting applications in production; seed data only.`,
  },
  {
    slug: "medical-receptionist-evening",
    title: "Medical Receptionist — Evening Shift",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$22 – $26 / hour",
    isActive: true,
    description: `Evening reception support for extended clinic hours across internal medicine and urgent follow-up slots.

Check patients in, manage wait lists, and route messages to on-call nursing staff.`,
  },
  {
    slug: "pa-family-medicine",
    title: "Physician Assistant — Family Medicine",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$115,000 – $135,000",
    isActive: true,
    description: `PA role within our family medicine pod, collaborating with MDs on chronic care, preventive visits, and same-day sick appointments.

Active state license and 2+ years outpatient experience required.`,
  },
  {
    slug: "billing-coding",
    title: "Medical Billing & Coding Specialist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$48,000 – $58,000",
    isActive: true,
    description: `Support revenue cycle for multi-specialty claims, prior authorizations, and denial follow-up.

CPC certification preferred; experience with E/M and procedure coding in ambulatory settings.`,
  },
  {
    slug: "patient-care-coordinator",
    title: "Patient Care Coordinator",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$42,000 – $50,000",
    isActive: true,
    description: `Guide patients through referrals, imaging prep, and post-visit care plans across cardiology, orthopedics, and endocrinology.

Strong communication skills and EHR experience required.`,
  },
  {
    slug: "phlebotomist",
    title: "Phlebotomist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$36,000 – $42,000",
    isActive: true,
    description: `Collect specimens in our outpatient draw station supporting lab and pre-operative workflows.

Phlebotomy certification and gentle patient technique essential.`,
  },
  {
    slug: "clinical-pharmacist",
    title: "Clinical Pharmacist — Ambulatory",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$58 – $68 / hour",
    isActive: true,
    description: `Part-time pharmacist consults for medication reconciliation, anticoagulation education, and chronic disease management clinics.`,
  },
  {
    slug: "ma-cardiology",
    title: "Medical Assistant — Cardiology",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$40,000 – $48,000",
    isActive: true,
    description: `Room patients, perform EKG prep, update vitals, and assist cardiologists during stress-test and echo clinic days.`,
  },
  {
    slug: "ma-orthopedics",
    title: "Medical Assistant — Orthopedics",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$40,000 – $48,000",
    isActive: true,
    description: `Support sports medicine and joint clinic providers with casting supplies, DME paperwork, and post-op dressing changes.`,
  },
  {
    slug: "lpn-opd",
    title: "Licensed Practical Nurse (LPN)",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$52,000 – $60,000",
    isActive: true,
    description: `LPN role in fast-paced outpatient suites. Administer vaccines, perform wound care, and document in the EHR under RN supervision.`,
  },
  {
    slug: "health-information-specialist",
    title: "Health Information Management Specialist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$46,000 – $54,000",
    isActive: true,
    description: `Maintain medical records integrity, release-of-information requests, and HIPAA-compliant chart completion audits.`,
  },
  {
    slug: "dietitian",
    title: "Registered Dietitian — Diabetes & Weight Management",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$38 – $45 / hour",
    isActive: true,
    description: `Counsel patients referred from endocrinology and internal medicine on nutrition plans, CGM data review, and lifestyle goals.`,
  },
  {
    slug: "pt-aide",
    title: "Physical Therapy Aide",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$18 – $22 / hour",
    isActive: true,
    description: `Prepare treatment areas, escort patients, and maintain equipment for our co-located PT practice serving orthopedics referrals.`,
  },
  {
    slug: "ma-dermatology",
    title: "Medical Assistant — Dermatology",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$41,000 – $49,000",
    isActive: true,
    description: `Assist with biopsies, cosmetic consults, and photo documentation. Experience with dermatology workflows a plus.`,
  },
  {
    slug: "telehealth-coordinator",
    title: "Telehealth Program Coordinator",
    type: JobType.FULL_TIME,
    isRemote: true,
    salaryRange: "$44,000 – $52,000",
    isActive: true,
    description: `Remote-friendly role scheduling virtual visits, troubleshooting patient tech onboarding, and coordinating virtual follow-ups across specialties.`,
  },
  {
    slug: "medical-scribe",
    title: "Medical Scribe",
    type: JobType.CONTRACT,
    isRemote: false,
    salaryRange: "$17 – $20 / hour",
    isActive: true,
    description: `6-month contract supporting high-volume providers with real-time charting in the EHR during clinic sessions.`,
  },
] as const;

type ApplicationSeed = {
  slug: string;
  postingSlug: string;
  name: string;
  phone: string;
  status: ApplicationStatus;
  coverNote: string | null;
  resumeText: string;
  resumeUrl?: string | null;
  /** If set, creates an interview round in this state */
  interview?: "pending_confirm" | "confirmed";
};

const APPLICATIONS: ApplicationSeed[] = [
  {
    slug: "alice-pending",
    postingSlug: "front-desk",
    name: "Alice Nguyen",
    phone: "+14155550101",
    status: ApplicationStatus.PENDING,
    coverNote: "Available to start within two weeks.",
    resumeText:
      "Front desk specialist with 3 years at a family medicine clinic. Experienced with insurance verification, multi-line phones, and Epic scheduling. Bilingual English/Vietnamese.",
  },
  {
    slug: "bob-pending",
    postingSlug: "front-desk",
    name: "Robert Chen",
    phone: "+14155550102",
    status: ApplicationStatus.PENDING,
    coverNote: null,
    resumeText:
      "Customer service lead transitioning to healthcare administration. Completed medical office assistant certificate. Strong Excel and patient intake skills.",
  },
  {
    slug: "carol-rejected",
    postingSlug: "front-desk",
    name: "Carol Williams",
    phone: "+14155550103",
    status: ApplicationStatus.REJECTED,
    coverNote: null,
    resumeText:
      "Retail manager seeking first clinic role. Enthusiastic learner but limited direct healthcare experience beyond volunteer hours at a blood drive.",
  },
  {
    slug: "diana-shortlist",
    postingSlug: "registered-nurse-opd",
    name: "Diana Okonkwo",
    phone: "+14155550104",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: "Prefer morning shifts; 5 years OPD experience.",
    resumeText:
      "RN with ambulatory cardiology and internal medicine background. Skilled in triage protocols, wound care, and patient education. BLS and ACLS current.",
  },
  {
    slug: "evan-shortlist-interview-pending",
    postingSlug: "registered-nurse-opd",
    name: "Evan Martinez",
    phone: "+14155550105",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: null,
    resumeText:
      "Registered nurse specializing in orthopedic outpatient clinics. Experience with pre-op teaching, cast care instructions, and coordinating PT referrals.",
    interview: "pending_confirm",
  },
  {
    slug: "frank-pending-ai",
    postingSlug: "registered-nurse-opd",
    name: "Frank Iqbal",
    phone: "+14155550106",
    status: ApplicationStatus.PENDING,
    coverNote: "Happy to complete skills checklist on site.",
    resumeText:
      "New graduate RN with clinical rotations in pediatrics and community health. Eager to grow in a multi-specialty environment with strong mentorship.",
  },
  {
    slug: "grace-shortlist-confirmed",
    postingSlug: "lab-technician",
    name: "Grace Patel",
    phone: "+14155550107",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: null,
    resumeText:
      "MLT with 4 years in hospital core lab and 1 year in clinic point-of-care testing. Proficient in QC documentation and CAP compliance routines.",
    interview: "confirmed",
  },
  {
    slug: "henry-hired",
    postingSlug: "lab-technician",
    name: "Henry Brooks",
    phone: "+14155550108",
    status: ApplicationStatus.HIRED,
    coverNote: null,
    resumeText:
      "Senior laboratory technologist with send-out coordination experience and training of junior staff. Familiar with hematology and chemistry analyzers.",
  },
  {
    slug: "ivan-pending",
    postingSlug: "radiology-tech",
    name: "Ivan Kowalski",
    phone: "+14155550109",
    status: ApplicationStatus.PENDING,
    coverNote: "Available Tuesdays, Thursdays, and Saturdays.",
    resumeText:
      "ARRT-certified technologist with sports medicine imaging experience. Comfortable with portable X-ray and assisting ultrasound physicians.",
  },
  {
    slug: "julia-pending-pa",
    postingSlug: "pa-family-medicine",
    name: "Julia Fernandez",
    phone: "+14155550110",
    status: ApplicationStatus.PENDING,
    coverNote: "Licensed in state; open to panel growth.",
    resumeText:
      "Physician Assistant with 4 years in community family medicine. Strong chronic disease management, preventive care, and collaborative practice agreement experience.",
  },
  {
    slug: "kevin-pending-billing",
    postingSlug: "billing-coding",
    name: "Kevin O'Brien",
    phone: "+14155550111",
    status: ApplicationStatus.PENDING,
    coverNote: null,
    resumeText:
      "Medical biller and coder with CPC credential. Experienced in denial management, prior auth tracking, and multi-specialty charge entry in ambulatory settings.",
  },
  {
    slug: "lisa-shortlist-coordinator",
    postingSlug: "patient-care-coordinator",
    name: "Lisa Thompson",
    phone: "+14155550112",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: "Can start part-time while transitioning from current role.",
    resumeText:
      "Care coordinator with referral management experience across cardiology and orthopedics. Skilled at patient follow-up calls, EHR task queues, and insurance navigation.",
  },
  {
    slug: "michael-rejected-phlebotomy",
    postingSlug: "phlebotomist",
    name: "Michael Sanders",
    phone: "+14155550113",
    status: ApplicationStatus.REJECTED,
    coverNote: null,
    resumeText:
      "Recent phlebotomy graduate seeking first full-time draw station role. Completed externship but limited high-volume outpatient experience so far.",
  },
  {
    slug: "nina-pending-cardiology-ma",
    postingSlug: "ma-cardiology",
    name: "Nina Rahman",
    phone: "+14155550114",
    status: ApplicationStatus.PENDING,
    coverNote: null,
    resumeText:
      "Certified Medical Assistant with 2 years cardiology clinic experience. Comfortable with EKG prep, vital signs, and patient education on lifestyle modifications.",
  },
  {
    slug: "omar-shortlist-telehealth",
    postingSlug: "telehealth-coordinator",
    name: "Omar Hassan",
    phone: "+14155550115",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: "Fully equipped home office; flexible time zones.",
    resumeText:
      "Healthcare operations specialist who launched telehealth intake workflows for a multi-site clinic. Proficient with Zoom for Healthcare and patient tech troubleshooting.",
  },
  {
    slug: "priya-pending-derm-ma",
    postingSlug: "ma-dermatology",
    name: "Priya Desai",
    phone: "+14155550116",
    status: ApplicationStatus.PENDING,
    coverNote: "Interested in cosmetic and medical dermatology mix.",
    resumeText:
      "Medical assistant with dermatology clinic background. Experience rooming patients, preparing biopsy kits, and documenting lesion photos per provider protocol.",
  },
  {
    slug: "quinn-hired-scribe",
    postingSlug: "medical-scribe",
    name: "Quinn Taylor",
    phone: "+14155550117",
    status: ApplicationStatus.HIRED,
    coverNote: null,
    resumeText:
      "Pre-med graduate with 18 months scribing in high-volume internal medicine. Fast typist, accurate HPI documentation, and familiar with common ICD-10 patterns.",
  },
  {
    slug: "rachel-pending-evening-reception",
    postingSlug: "medical-receptionist-evening",
    name: "Rachel Kim",
    phone: "+14155550118",
    status: ApplicationStatus.PENDING,
    coverNote: "Available after 2pm on weekdays.",
    resumeText:
      "Evening and weekend reception experience at urgent care. Strong check-in workflow, copay collection, and calm demeanor with anxious patients.",
  },
  {
    slug: "sam-pending-him",
    postingSlug: "health-information-specialist",
    name: "Samuel Ortiz",
    phone: "+14155550119",
    status: ApplicationStatus.PENDING,
    coverNote: null,
    resumeText:
      "HIM professional focused on chart completion, ROI requests, and HIPAA release workflows. RHIT eligible with internship in outpatient medical records.",
    resumeUrl: "https://example.com/portfolio/sam-ortiz-him",
  },
  {
    slug: "tara-shortlist-ortho-ma",
    postingSlug: "ma-orthopedics",
    name: "Tara Mitchell",
    phone: "+14155550120",
    status: ApplicationStatus.SHORTLISTED,
    coverNote: "Previous sports medicine clinic MA for 3 years.",
    resumeText:
      "Orthopedic medical assistant skilled in suture removal setup, crutch fitting education, and DME paperwork. BLS certified and team-oriented.",
  },
];

async function resolveAdminId(): Promise<string> {
  const fromEnv = process.env.ADMIN_SEED_EMAIL?.trim();
  if (fromEnv) {
    const admin = await prisma.user.findUnique({
      where: { email: fromEnv },
      select: { id: true, role: true },
    });
    if (admin?.role === UserRole.ADMIN) return admin.id;
  }

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error(
      "No admin user found. Run db:seed:admin first or set ADMIN_SEED_EMAIL.",
    );
  }
  return admin.id;
}

async function clearSeedCareersData() {
  const seedApplications = await prisma.jobApplication.findMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const applicationIds = seedApplications.map((a) => a.id);

  if (applicationIds.length > 0) {
    await prisma.interviewRound.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.jobApplication.deleteMany({
      where: { id: { in: applicationIds } },
    });
  }

  await prisma.jobPosting.deleteMany({
    where: { title: { startsWith: SEED_TITLE_PREFIX } },
  });
}

async function main() {
  const adminId = await resolveAdminId();
  await clearSeedCareersData();

  const postingIdBySlug = new Map<string, string>();

  for (const posting of POSTINGS) {
    const created = await prisma.jobPosting.create({
      data: {
        title: `${SEED_TITLE_PREFIX}${posting.title}`,
        description: posting.description,
        type: posting.type,
        isRemote: posting.isRemote,
        salaryRange: posting.salaryRange,
        isActive: posting.isActive,
      },
    });
    postingIdBySlug.set(posting.slug, created.id);
  }

  const interviewScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  interviewScheduledAt.setMinutes(0, 0, 0);

  for (const app of APPLICATIONS) {
    const jobPostingId = postingIdBySlug.get(app.postingSlug);
    if (!jobPostingId) {
      throw new Error(`Unknown posting slug: ${app.postingSlug}`);
    }
    const postingSeed = POSTINGS.find((p) => p.slug === app.postingSlug);
    const jobDescriptionSnapshot = postingSeed?.description ?? "";

    const application = await prisma.jobApplication.create({
      data: {
        jobPostingId,
        name: app.name,
        email: seedEmail(app.slug),
        phone: app.phone,
        coverNote: app.coverNote,
        resumeText: app.resumeText,
        resumeUrl: app.resumeUrl ?? null,
        status: app.status,
        aiScore: null,
        aiSummary: null,
        aiRecommendation: null,
      },
    });

    if (app.interview === "pending_confirm") {
      await prisma.interviewRound.create({
        data: {
          applicationId: application.id,
          roundNumber: 1,
          scheduledAt: interviewScheduledAt,
          confirmationToken: confirmationToken(),
          attendeeCancelToken: confirmationToken(),
          notes: "Seed: invite sent — use confirm link flow.",
          scheduledByAdminId: adminId,
          jobDescriptionSnapshot,
        },
      });
    }

    if (app.interview === "confirmed") {
      await prisma.interviewRound.create({
        data: {
          applicationId: application.id,
          roundNumber: 1,
          scheduledAt: interviewScheduledAt,
          confirmationToken: confirmationToken(),
          attendeeCancelToken: confirmationToken(),
          confirmedAt: new Date(),
          meetLink: "https://meet.google.com/seed-grace-patel-demo",
          notes: "Seed: already confirmed with placeholder Meet link.",
          scheduledByAdminId: adminId,
          jobDescriptionSnapshot,
        },
      });
    }
  }

  console.log("Careers seed complete.\n");
  console.log("Postings:", POSTINGS.length);
  console.log("Applications:", APPLICATIONS.length);
  console.log(`Emails: *${SEED_EMAIL_DOMAIN}`);
  console.log("\nManual AI screening candidates (PENDING, no AI fields):");
  console.log(`  - ${seedEmail("alice-pending")}`);
  console.log(`  - ${seedEmail("frank-pending-ai")}`);
  const evanRound = await prisma.interviewRound.findFirst({
    where: {
      application: { email: seedEmail("evan-shortlist-interview-pending") },
    },
    select: { confirmationToken: true },
  });
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  if (evanRound) {
    console.log(
      "\nEvan confirm URL:",
      `${origin.replace(/\/$/, "")}/careers/interview/confirm?token=${evanRound.confirmationToken}`,
    );
  }
  console.log("Grace Patel: already confirmed (placeholder Meet link).");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
