import "dotenv/config";
import { readdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AppointmentStatus,
  ConsultationType,
  DoctorApprovalStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  UserRole,
} from "../generated/prisma/client.js";
import { assignUniqueDoctorSlug } from "../lib/doctor-slug.js";
import { recomputeAllDoctorReviewStats } from "../lib/review-stats.js";
import {
  DEMO_DOCTOR_EMAIL,
  DEMO_DOCTOR_PASSWORD,
  DEMO_PATIENT_EMAIL,
  DEMO_PATIENT_PASSWORD,
} from "../lib/demo-credentials.js";
import { DOCTOR_CATALOG } from "./seed-data/doctor-catalog.js";
import { CAREER_POSTINGS } from "./seed-data/career-postings.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DAYS_OF_AVAILABILITY = 365;
const REVIEWS_PER_DOCTOR = 12;

const REVIEW_COMMENTS = [
  "Very attentive and explained everything clearly. Would book again.",
  "Short wait time and thorough consultation. Recommended.",
  "Professional staff and calm environment. Exactly what I needed.",
  "Good diagnosis and follow-up plan. Satisfied overall.",
  "Clear communication and respectful care throughout the visit.",
  "Decent visit; could improve on bedside manner slightly.",
  "Excellent doctor, felt heard and cared for.",
  "Average experience; consultation felt a bit rushed.",
  "Outstanding clinic experience from check-in to follow-up.",
  "Helpful explanations and sensible treatment options.",
  "Quick lab turnaround and actionable advice.",
  "Very knowledgeable and answered every question patiently.",
];

function toDateOnly(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return toDateOnly(out);
}

function priceMap(price30Cents: number) {
  return {
    "15": Math.max(1, Math.round(price30Cents / 2)),
    "30": price30Cents,
    "45": Math.round(price30Cents * 1.5),
    "60": price30Cents * 2,
  };
}

function listDoctorPhotoUrls(): string[] {
  const dir = join(process.cwd(), "public", "doctors");
  return readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .slice(0, DOCTOR_CATALOG.length)
    .map((f) => `/doctors/${f}`);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function token() {
  return randomBytes(24).toString("hex");
}

function consultationTypeForDoctor(
  catalogType: (typeof DOCTOR_CATALOG)[number]["consultationType"],
): ConsultationType {
  if (catalogType === "CLINIC") return ConsultationType.CLINIC;
  if (catalogType === "ONLINE") return ConsultationType.ONLINE;
  return ConsultationType.CLINIC;
}

async function wipeDatabase() {
  await prisma.chatMessage.deleteMany({});
  await prisma.chatReadState.deleteMany({});
  await prisma.chatConversation.deleteMany({});
  await prisma.prescription.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.bookingSession.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.interviewRound.deleteMany({});
  await prisma.jobApplication.deleteMany({});
  await prisma.jobPosting.deleteMany({});
  await prisma.doctorAvailability.deleteMany({});
  await prisma.customMedicine.deleteMany({});
  await prisma.doctor.deleteMany({});
  await prisma.healthProfile.deleteMany({});
  await prisma.user.deleteMany({});
}

async function upsertAdmin() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  const adminPasswordPlain = process.env.ADMIN_SEED_PASSWORD;
  const adminName = process.env.ADMIN_SEED_NAME;

  if (!adminEmail || !adminPasswordPlain || !adminName) {
    throw new Error(
      "ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, and ADMIN_SEED_NAME are required in .env",
    );
  }

  const hashedPassword = await bcrypt.hash(adminPasswordPlain, 12);
  return prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      role: UserRole.ADMIN,
      password: hashedPassword,
      profileComplete: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: adminEmail,
      name: adminName,
      role: UserRole.ADMIN,
      password: hashedPassword,
      profileComplete: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createPatientUser(input: {
  email: string;
  name: string;
  password: string;
  phone?: string;
}) {
  const hashed = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone ?? null,
      role: UserRole.PATIENT,
      password: hashed,
      profileComplete: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function main() {
  console.log("Wiping existing data…");
  await wipeDatabase();

  const admin = await upsertAdmin();
  console.log(`Admin ready: ${admin.email}`);

  const photoUrls = listDoctorPhotoUrls();
  if (photoUrls.length < DOCTOR_CATALOG.length) {
    throw new Error(
      `Need at least ${DOCTOR_CATALOG.length} images in public/doctors/, found ${photoUrls.length}`,
    );
  }

  const today = toDateOnly(new Date());
  const doctorIds: string[] = [];
  let demoDoctorUserId: string | null = null;
  let demoDoctorRecordId: string | null = null;

  console.log("Creating doctors and availability…");
  for (let i = 0; i < DOCTOR_CATALOG.length; i += 1) {
    const entry = DOCTOR_CATALOG[i];
    const isDemoDoctor = i === 0;

    let userId: string | undefined;
    if (isDemoDoctor) {
      const hashed = await bcrypt.hash(DEMO_DOCTOR_PASSWORD, 12);
      const demoUser = await prisma.user.create({
        data: {
          email: DEMO_DOCTOR_EMAIL,
          name: entry.name,
          phone: entry.phone,
          role: UserRole.DOCTOR,
          password: hashed,
          profileComplete: true,
          emailVerifiedAt: new Date(),
        },
      });
      userId = demoUser.id;
      demoDoctorUserId = demoUser.id;
    }

    const doctor = await prisma.doctor.create({
      data: {
        userId: userId ?? null,
        name: entry.name,
        phone: entry.phone,
        specialization: entry.specialization,
        qualification: entry.qualification,
        licenseNumber: `MD-${100000 + i}`,
        yearsExperience: entry.yearsExperience,
        bio: entry.bio,
        profilePhotoUrl: photoUrls[i],
        timezone: entry.timezone,
        currency: entry.currency,
        consultationPriceCentsByDuration: priceMap(entry.price30Cents),
        approvalStatus: DoctorApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: admin.id,
        isActive: true,
      },
    });

    if (isDemoDoctor) {
      demoDoctorRecordId = doctor.id;
    }

    await assignUniqueDoctorSlug(prisma, {
      doctorId: doctor.id,
      name: doctor.name,
    });

    const availabilityRows = [];
    for (let offset = 0; offset < DAYS_OF_AVAILABILITY; offset += 1) {
      availabilityRows.push({
        doctorId: doctor.id,
        date: addDays(today, offset),
        startTime: "09:00",
        endTime: "17:00",
        slotDurationMinutes: 30,
        consultationType: entry.consultationType,
      });
    }

    await prisma.doctorAvailability.createMany({ data: availabilityRows });
    doctorIds.push(doctor.id);
  }

  console.log(`Created ${doctorIds.length} doctors with ${DAYS_OF_AVAILABILITY} days of availability each.`);

  console.log("Creating review patients…");
  const reviewPatientPassword = await bcrypt.hash("ReviewGuest2026!", 12);
  const reviewPatients = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      prisma.user.create({
        data: {
          email: `reviewer.${i + 1}@example.com`,
          name: `Guest Reviewer ${i + 1}`,
          role: UserRole.PATIENT,
          password: reviewPatientPassword,
          profileComplete: true,
          emailVerifiedAt: new Date(),
        },
      }),
    ),
  );

  console.log("Creating reviews…");
  type ReviewSeedRow = {
    doctorId: string;
    patientId: string;
    rating: number;
    comment: string;
    createdAt: Date;
  };
  const reviewRows: ReviewSeedRow[] = [];
  let reviewIndex = 0;
  for (const doctorId of doctorIds) {
    for (let r = 0; r < REVIEWS_PER_DOCTOR; r += 1) {
      const patient = reviewPatients[reviewIndex % reviewPatients.length];
      reviewIndex += 1;
      const createdAt = new Date();
      createdAt.setUTCDate(createdAt.getUTCDate() - randomInt(5, 180));
      reviewRows.push({
        doctorId,
        patientId: patient.id,
        rating: randomInt(3, 5),
        comment: REVIEW_COMMENTS[r % REVIEW_COMMENTS.length],
        createdAt,
      });
    }
  }
  await prisma.review.createMany({ data: reviewRows });
  await recomputeAllDoctorReviewStats(prisma);

  console.log(`Created ${reviewRows.length} reviews (${REVIEWS_PER_DOCTOR} per doctor).`);

  console.log("Creating job postings…");
  for (const posting of CAREER_POSTINGS) {
    await prisma.jobPosting.create({ data: posting });
  }
  console.log(`Created ${CAREER_POSTINGS.length} job postings.`);

  console.log("Creating sample patients…");
  const samplePatients = [
    {
      email: "maya.thompson@example.com",
      name: "Maya Thompson",
      phone: "+14155552001",
      password: "SamplePatient1!",
    },
    {
      email: "carlos.rivera@example.com",
      name: "Carlos Rivera",
      phone: "+14155552002",
      password: "SamplePatient2!",
    },
    {
      email: "elena.vasquez@example.com",
      name: "Elena Vasquez",
      phone: "+14155552003",
      password: "SamplePatient3!",
    },
  ];

  const createdSamplePatients = [];
  for (const p of samplePatients) {
    createdSamplePatients.push(await createPatientUser(p));
  }

  const demoPatient = await createPatientUser({
    email: DEMO_PATIENT_EMAIL,
    name: "Alex Morgan",
    phone: "+14155552999",
    password: DEMO_PATIENT_PASSWORD,
  });

  console.log("Creating appointments…");
  const slotTimes = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30"];

  async function createPastAppointment(input: {
    doctorIndex: number;
    patientEmail: string;
    patientName: string;
    patientPhone: string;
    daysAgo: number;
    time: string;
    consultationType: ConsultationType;
  }) {
    const doctor = DOCTOR_CATALOG[input.doctorIndex];
    const doctorId = doctorIds[input.doctorIndex];
    const apptDate = addDays(today, -input.daysAgo);
    const price = doctor.price30Cents;

    return prisma.appointment.create({
      data: {
        doctorId,
        patientName: input.patientName,
        email: input.patientEmail,
        phone: input.patientPhone,
        timezone: doctor.timezone,
        patientTimezone: doctor.timezone,
        date: apptDate,
        time: input.time,
        durationMinutes: 30,
        priceCentsAtBooking: price,
        currencyAtBooking: doctor.currency,
        consultationType: input.consultationType,
        status: AppointmentStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        cancelToken: token(),
        rescheduleToken: token(),
      },
    });
  }

  const sampleApptPlans = [
    { patientIdx: 0, doctorIdx: 1, daysAgo: 14, time: "09:00" },
    { patientIdx: 0, doctorIdx: 3, daysAgo: 45, time: "10:00" },
    { patientIdx: 0, doctorIdx: 5, daysAgo: 72, time: "11:00" },
    { patientIdx: 1, doctorIdx: 2, daysAgo: 21, time: "09:30" },
    { patientIdx: 1, doctorIdx: 4, daysAgo: 60, time: "14:00" },
    { patientIdx: 1, doctorIdx: 7, daysAgo: 90, time: "10:30" },
    { patientIdx: 1, doctorIdx: 9, daysAgo: 30, time: "14:30" },
    { patientIdx: 2, doctorIdx: 6, daysAgo: 18, time: "09:00" },
    { patientIdx: 2, doctorIdx: 8, daysAgo: 55, time: "11:00" },
  ];

  for (const plan of sampleApptPlans) {
    const patient = samplePatients[plan.patientIdx];
    const doctorEntry = DOCTOR_CATALOG[plan.doctorIdx];
    await createPastAppointment({
      doctorIndex: plan.doctorIdx,
      patientEmail: patient.email,
      patientName: patient.name,
      patientPhone: patient.phone,
      daysAgo: plan.daysAgo,
      time: plan.time,
      consultationType: consultationTypeForDoctor(doctorEntry.consultationType),
    });
  }

  await createPastAppointment({
    doctorIndex: 0,
    patientEmail: DEMO_PATIENT_EMAIL,
    patientName: "Alex Morgan",
    patientPhone: "+14155552999",
    daysAgo: 28,
    time: "10:00",
    consultationType: ConsultationType.CLINIC,
  });

  await createPastAppointment({
    doctorIndex: 2,
    patientEmail: DEMO_PATIENT_EMAIL,
    patientName: "Alex Morgan",
    patientPhone: "+14155552999",
    daysAgo: 56,
    time: "14:00",
    consultationType: ConsultationType.ONLINE,
  });

  if (demoDoctorRecordId) {
    const demoDoctorEntry = DOCTOR_CATALOG[0];
    await prisma.appointment.create({
      data: {
        doctorId: demoDoctorRecordId,
        patientName: "Alex Morgan",
        email: DEMO_PATIENT_EMAIL,
        phone: "+14155552999",
        timezone: demoDoctorEntry.timezone,
        patientTimezone: demoDoctorEntry.timezone,
        date: addDays(today, 14),
        time: slotTimes[2],
        durationMinutes: 30,
        priceCentsAtBooking: demoDoctorEntry.price30Cents,
        currencyAtBooking: demoDoctorEntry.currency,
        consultationType: ConsultationType.CLINIC,
        status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        cancelToken: token(),
        rescheduleToken: token(),
      },
    });
  }

  console.log("\nDemo seed complete.\n");
  console.log("Doctors:", doctorIds.length);
  console.log("Reviews:", reviewRows.length);
  console.log("Job postings:", CAREER_POSTINGS.length);
  console.log("Sample patients:", createdSamplePatients.length);
  console.log("\nDemo sign-in accounts (also shown on /auth/signin):");
  console.log(`  Patient: ${DEMO_PATIENT_EMAIL} / ${DEMO_PATIENT_PASSWORD}`);
  console.log(`  Doctor:  ${DEMO_DOCTOR_EMAIL} / ${DEMO_DOCTOR_PASSWORD}`);
  console.log(`  Admin:   ${admin.email} (password from ADMIN_SEED_PASSWORD in .env)`);
  if (demoDoctorUserId) {
    console.log(`\nDemo doctor linked to ${DOCTOR_CATALOG[0].name} (${demoDoctorRecordId})`);
  }
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
