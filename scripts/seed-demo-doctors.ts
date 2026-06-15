import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AvailabilityConsultationType,
  PrismaClient,
} from "../generated/prisma/client.js";
import { assignUniqueDoctorSlug } from "../lib/doctor-slug";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

type DemoDoctorSeed = {
  name: string;
  specialization: string;
  phone: string;
  qualification: string;
  yearsExperience: number;
  bio: string;
  timezone: string;
  currency: string;
  consultationType: AvailabilityConsultationType;
  price30Cents: number;
};

const profilePhotoUrl = "/fi-sr-doctor.svg";

const demoDoctors: DemoDoctorSeed[] = [
  {
    name: "Dr. Amara Eze",
    specialization: "Cardiologist",
    phone: "+15550101001",
    qualification: "MBBS, MD (Cardiology)",
    yearsExperience: 14,
    bio: "Focused on preventive cardiology, hypertension, and chest pain evaluation.",
    timezone: "America/New_York",
    currency: "USD",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 6000,
  },
  {
    name: "Dr. Charlotte Bennett",
    specialization: "Neurologist",
    phone: "+15550101002",
    qualification: "MD, DM (Neurology)",
    yearsExperience: 11,
    bio: "Treats migraines, seizures, nerve pain, dizziness, and memory concerns.",
    timezone: "America/New_York",
    currency: "USD",
    consultationType: AvailabilityConsultationType.ONLINE,
    price30Cents: 6500,
  },
  {
    name: "Dr. Andre Thompson",
    specialization: "Dermatologist",
    phone: "+15550101003",
    qualification: "MD (Dermatology)",
    yearsExperience: 9,
    bio: "Specializes in acne, rashes, hair loss, mole checks, and chronic skin irritation.",
    timezone: "Europe/Paris",
    currency: "EUR",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 5500,
  },
  {
    name: "Dr. Wei Zhang",
    specialization: "General Physician",
    phone: "+15550101004",
    qualification: "MD",
    yearsExperience: 8,
    bio: "Provides primary care for fever, fatigue, respiratory illness, and preventive visits.",
    timezone: "America/Toronto",
    currency: "CAD",
    consultationType: AvailabilityConsultationType.ONLINE,
    price30Cents: 3500,
  },
  {
    name: "Dr. Naledi Dlamini",
    specialization: "Gynecologist",
    phone: "+15550101005",
    qualification: "MBBS, MS (OBGYN)",
    yearsExperience: 13,
    bio: "Supports menstrual health, pelvic pain, contraception counseling, and wellness visits.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    consultationType: AvailabilityConsultationType.CLINIC,
    price30Cents: 300000,
  },
  {
    name: "Dr. Hana Kobayashi",
    specialization: "Pediatrician",
    phone: "+15550101006",
    qualification: "MD (Pediatrics)",
    yearsExperience: 10,
    bio: "Child health visits for fever, cough, growth checks, vaccinations, and nutrition.",
    timezone: "America/Chicago",
    currency: "USD",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 4500,
  },
  {
    name: "Dr. Camila Fernández",
    specialization: "ENT (Otolaryngologist)",
    phone: "+15550101007",
    qualification: "MS (ENT)",
    yearsExperience: 12,
    bio: "Treats ear pain, sinus symptoms, hearing issues, sore throat, and voice changes.",
    timezone: "Asia/Singapore",
    currency: "SGD",
    consultationType: AvailabilityConsultationType.CLINIC,
    price30Cents: 7000,
  },
  {
    name: "Dr. Layla Haddad",
    specialization: "Pulmonologist",
    phone: "+15550101008",
    qualification: "MD (Pulmonology)",
    yearsExperience: 15,
    bio: "Focused on asthma, chronic cough, breathlessness, wheezing, and sleep breathing issues.",
    timezone: "Asia/Dubai",
    currency: "AED",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 55000,
  },
  {
    name: "Dr. Ananya Joshi",
    specialization: "Endocrinologist",
    phone: "+15550101009",
    qualification: "MD (Endocrinology)",
    yearsExperience: 12,
    bio: "Diabetes, thyroid, hormonal disorders, metabolic health, and weight concerns.",
    timezone: "Europe/London",
    currency: "GBP",
    consultationType: AvailabilityConsultationType.ONLINE,
    price30Cents: 7000,
  },
  {
    name: "Dr. Mai Nguyen",
    specialization: "Orthopedic Surgeon",
    phone: "+15550101010",
    qualification: "MS (Orthopedics)",
    yearsExperience: 16,
    bio: "Evaluates joint pain, sports injuries, fractures, and spine-related orthopedic concerns.",
    timezone: "Europe/Paris",
    currency: "EUR",
    consultationType: AvailabilityConsultationType.CLINIC,
    price30Cents: 8000,
  },
  {
    name: "Dr. Karim Saleh",
    specialization: "Psychiatrist",
    phone: "+15550101011",
    qualification: "MD (Psychiatry)",
    yearsExperience: 10,
    bio: "Supports anxiety, depression, sleep issues, stress, and medication management.",
    timezone: "America/Los_Angeles",
    currency: "USD",
    consultationType: AvailabilityConsultationType.ONLINE,
    price30Cents: 7500,
  },
  {
    name: "Dr. Diego Morales",
    specialization: "Gastroenterologist",
    phone: "+15550101012",
    qualification: "MD, DM (Gastroenterology)",
    yearsExperience: 14,
    bio: "Treats reflux, abdominal pain, bowel changes, liver concerns, and digestive symptoms.",
    timezone: "America/New_York",
    currency: "USD",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 6800,
  },
  {
    name: "Dr. Kwame Asante",
    specialization: "Ophthalmologist",
    phone: "+15550101013",
    qualification: "MS (Ophthalmology)",
    yearsExperience: 11,
    bio: "Eye care for redness, blurred vision, eye pain, cataracts, and diabetic eye screening.",
    timezone: "Asia/Dubai",
    currency: "AED",
    consultationType: AvailabilityConsultationType.CLINIC,
    price30Cents: 50000,
  },
  {
    name: "Dr. Giulia Romano",
    specialization: "Urologist",
    phone: "+15550101014",
    qualification: "MS, MCh (Urology)",
    yearsExperience: 13,
    bio: "Kidney stones, urinary symptoms, prostate health, and male reproductive concerns.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    consultationType: AvailabilityConsultationType.BOTH,
    price30Cents: 350000,
  },
  {
    name: "Dr. Daniela Reyes",
    specialization: "Rheumatologist",
    phone: "+15550101015",
    qualification: "MD (Rheumatology)",
    yearsExperience: 9,
    bio: "Joint stiffness, inflammatory arthritis, lupus, autoimmune symptoms, and chronic pain.",
    timezone: "Australia/Sydney",
    currency: "AUD",
    consultationType: AvailabilityConsultationType.ONLINE,
    price30Cents: 8500,
  },
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

async function main() {
  const today = toDateOnly(new Date());
  const daysToSeed = 90;
  const seededProfileUrls: string[] = [];

  for (const seed of demoDoctors) {
    const existing = await prisma.doctor.findFirst({
      where: { phone: seed.phone },
      select: { id: true, name: true, slug: true },
    });

    const data = {
      name: seed.name,
      specialization: seed.specialization,
      phone: seed.phone,
      qualification: seed.qualification,
      licenseNumber: "SEED-DEMO",
      yearsExperience: seed.yearsExperience,
      bio: seed.bio,
      profilePhotoUrl,
      timezone: seed.timezone,
      currency: seed.currency,
      consultationPriceCentsByDuration: priceMap(seed.price30Cents),
      isActive: true,
    };

    const doctor = existing
      ? await prisma.doctor.update({
          where: { id: existing.id },
          data,
          select: { id: true, name: true, slug: true },
        })
      : await prisma.doctor.create({
          data,
          select: { id: true, name: true, slug: true },
        });

    const slug =
      doctor.slug ??
      (await assignUniqueDoctorSlug(prisma, {
        doctorId: doctor.id,
        name: doctor.name,
      }));

    await prisma.doctorAvailability.deleteMany({
      where: {
        doctorId: doctor.id,
        date: { gte: today },
      },
    });

    for (let offset = 0; offset < daysToSeed; offset++) {
      const date = addDays(today, offset);
      await prisma.doctorAvailability.create({
        data: {
          doctorId: doctor.id,
          date,
          startTime: "09:00",
          endTime: "13:00",
          slotDurationMinutes: 30,
          consultationType: seed.consultationType,
        },
      });
    }

    seededProfileUrls.push(`/doctors/${slug}`);
  }

  console.log(`Seeded or updated ${demoDoctors.length} demo doctors.`);
  console.log("Profile URLs:");
  for (const url of seededProfileUrls) console.log(`- ${url}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
