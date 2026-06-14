import { JobType } from "../../generated/prisma/client.js";

export type CareerPostingEntry = {
  title: string;
  description: string;
  type: JobType;
  isRemote: boolean;
  salaryRange: string | null;
  isActive: boolean;
};

export const CAREER_POSTINGS: CareerPostingEntry[] = [
  {
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
    title: "Clinic Operations Manager",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$95,000 – $110,000",
    isActive: false,
    description: `Lead daily operations for a 40-provider multi-specialty clinic.

This posting is currently closed while we finalize the organizational structure for the role.`,
  },
  {
    title: "Medical Receptionist — Evening Shift",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$22 – $26 / hour",
    isActive: true,
    description: `Evening reception support for extended clinic hours across internal medicine and urgent follow-up slots.

Check patients in, manage wait lists, and route messages to on-call nursing staff.`,
  },
  {
    title: "Physician Assistant — Family Medicine",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$115,000 – $135,000",
    isActive: true,
    description: `PA role within our family medicine pod, collaborating with MDs on chronic care, preventive visits, and same-day sick appointments.

Active state license and 2+ years outpatient experience required.`,
  },
  {
    title: "Medical Billing & Coding Specialist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$48,000 – $58,000",
    isActive: true,
    description: `Support revenue cycle for multi-specialty claims, prior authorizations, and denial follow-up.

CPC certification preferred; experience with E/M and procedure coding in ambulatory settings.`,
  },
  {
    title: "Patient Care Coordinator",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$42,000 – $50,000",
    isActive: true,
    description: `Guide patients through referrals, imaging prep, and post-visit care plans across cardiology, orthopedics, and endocrinology.

Strong communication skills and EHR experience required.`,
  },
  {
    title: "Phlebotomist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$36,000 – $42,000",
    isActive: true,
    description: `Collect specimens in our outpatient draw station supporting lab and pre-operative workflows.

Phlebotomy certification and gentle patient technique essential.`,
  },
  {
    title: "Clinical Pharmacist — Ambulatory",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$58 – $68 / hour",
    isActive: true,
    description: `Part-time pharmacist consults for medication reconciliation, anticoagulation education, and chronic disease management clinics.`,
  },
  {
    title: "Medical Assistant — Cardiology",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$40,000 – $48,000",
    isActive: true,
    description: `Room patients, perform EKG prep, update vitals, and assist cardiologists during stress-test and echo clinic days.`,
  },
  {
    title: "Medical Assistant — Orthopedics",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$40,000 – $48,000",
    isActive: true,
    description: `Support sports medicine and joint clinic providers with casting supplies, DME paperwork, and post-op dressing changes.`,
  },
  {
    title: "Licensed Practical Nurse (LPN)",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$52,000 – $60,000",
    isActive: true,
    description: `LPN role in fast-paced outpatient suites. Administer vaccines, perform wound care, and document in the EHR under RN supervision.`,
  },
  {
    title: "Health Information Management Specialist",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$46,000 – $54,000",
    isActive: true,
    description: `Maintain medical records integrity, release-of-information requests, and HIPAA-compliant chart completion audits.`,
  },
  {
    title: "Registered Dietitian — Diabetes & Weight Management",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$38 – $45 / hour",
    isActive: true,
    description: `Counsel patients referred from endocrinology and internal medicine on nutrition plans, CGM data review, and lifestyle goals.`,
  },
  {
    title: "Physical Therapy Aide",
    type: JobType.PART_TIME,
    isRemote: false,
    salaryRange: "$18 – $22 / hour",
    isActive: true,
    description: `Prepare treatment areas, escort patients, and maintain equipment for our co-located PT practice serving orthopedics referrals.`,
  },
  {
    title: "Medical Assistant — Dermatology",
    type: JobType.FULL_TIME,
    isRemote: false,
    salaryRange: "$41,000 – $49,000",
    isActive: true,
    description: `Assist with biopsies, cosmetic consults, and photo documentation. Experience with dermatology workflows a plus.`,
  },
  {
    title: "Telehealth Program Coordinator",
    type: JobType.FULL_TIME,
    isRemote: true,
    salaryRange: "$44,000 – $52,000",
    isActive: true,
    description: `Remote-friendly role scheduling virtual visits, troubleshooting patient tech onboarding, and coordinating virtual follow-ups across specialties.`,
  },
  {
    title: "Medical Scribe",
    type: JobType.CONTRACT,
    isRemote: false,
    salaryRange: "$17 – $20 / hour",
    isActive: true,
    description: `6-month contract supporting high-volume providers with real-time charting in the EHR during clinic sessions.`,
  },
];
