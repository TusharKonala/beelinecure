import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About BeelineCure",
  description:
    "BeelineCure is a clinic management and patient booking platform built for independent clinics and doctors who want to grow on their own terms.",
};

const sectionHeading = "font-montaga font-semibold leading-tight";
const ctaButtonClass = "font-montserrat font-medium transition-colors";
const filledButtonClass = `rounded-lg bg-[#2555F3] px-8 py-4 text-lg text-white hover:bg-[#1E44C7] ${ctaButtonClass}`;
const outlineButtonClass = `rounded-lg border border-[#2555F3] bg-white px-8 py-4 text-lg text-[#2555F3] hover:bg-[#f0f4ff] ${ctaButtonClass}`;

const features = [
  "A public booking page with your clinic's branding",
  "Doctor profiles, availability, and slot management",
  "Clinic visits and online video consultations via Google Meet",
  "Online payments and refunds handled securely",
  "Automatic appointment reminders and notifications",
  "Prescription creation and management",
  "Post-visit patient and doctor chat",
  "A full admin dashboard for clinic owners",
  "Doctor approval and governance tools",
  "Patient review collection and moderation",
  "Job postings and AI-powered applicant screening",
  "Google Calendar integration for doctors",
];

const seeItLiveRoles = [
  {
    label: "As a patient",
    text: "Book a real test appointment, explore your dashboard, try a payment; everything works.",
  },
  {
    label: "As a doctor",
    text: "Sign up using fake credentials and a dummy license number to explore the full doctor experience: schedule management, prescriptions, patient chat, and more.",
  },
  {
    label: "As a clinic owner",
    text: "The admin panel is best seen with a guided walkthrough. Watch our full demo video or book a quick call and we will walk you through everything live.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen w-full min-w-0 font-montserrat text-[#333333]">
      {/* Hero: Who We Are */}
      <section className="border-t border-black/10 bg-[#1F2937] px-4 py-12 sm:px-6 md:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className={`${sectionHeading} text-3xl leading-[1.1] text-white sm:text-4xl md:text-5xl lg:text-[56px]`}
          >
            Who We Are
          </h1>
          <div className="mx-auto mt-6 max-w-3xl space-y-4 font-montserrat text-lg leading-relaxed text-white/80 md:text-xl">
            <p>
              BeelineCure is a clinic management and patient booking platform
              built for independent clinics and doctors who want to grow on their
              own terms, not on a marketplace&apos;s terms.
            </p>
            <p>
              We believe the relationship between a doctor and their patient
              should be direct, personal, and owned by the clinic, not rented
              from a platform, not dependent on an algorithm.
            </p>
          </div>
        </div>
      </section>

      {/* Marketplace Callout */}
      <section className="border-t border-black/10 bg-[#FAFAFA] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border-l-[3px] border-[#F59E0B] bg-[#FFF9E6] p-6">
            <h3 className={`${sectionHeading} text-lg text-[#333333]`}>
              What is a marketplace?
            </h3>
            <p className="mt-3 font-montserrat text-lg leading-relaxed text-[#5E5E5E]">
              A healthcare marketplace is an app or website where patients search
              and book across hundreds of clinics. They are great for getting
              discovered, but every patient who books through one belongs to the
              marketplace, not to you.
            </p>
          </div>
        </div>
      </section>

      {/* Why We Built This */}
      <section className="border-t border-black/10 bg-white px-6 py-10 md:py-14 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <h2
            className={`${sectionHeading} text-3xl text-[#333333] md:text-[40px]`}
          >
            Why We Built This
          </h2>
          <div className="mt-6 space-y-4 font-montserrat text-lg leading-relaxed text-[#5E5E5E]">
            <p>We kept seeing the same two problems over and over.</p>
            <p>
              Clinics were building strong reputations on marketplaces,
              collecting reviews, ranking well, getting bookings. But none of
              that effort was building a loyal patient base. Every returning
              patient had to be won again because the marketplace always put
              them in front of hundreds of other doctors. The clinic did all the
              hard work. The marketplace kept the relationship.
            </p>
            <p>
              The second problem was simpler but just as costly. Patients were
              finding clinics through Google, WhatsApp, and referrals, already
              decided and already wanting to book, and hitting a dead end. A static
              website with a phone number. A missed call. A lost patient.
            </p>
            <p>
              We built BeelineCure to solve both: turn marketplace patients
              into recurring direct patients, and capture every patient who
              finds you outside a marketplace before they slip away.
            </p>
          </div>
        </div>
      </section>

      {/* What BeelineCure Does */}
      <section className="border-t border-white/10 bg-[#1F2937] px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${sectionHeading} text-center text-3xl text-white md:text-[44px]`}
          >
            What BeelineCure Does
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center font-montserrat text-white/70">
            A fully branded booking and clinic management system that includes
            everything a modern clinic needs:
          </p>
          <div className="mt-12 grid grid-cols-1 gap-4 md:mt-16 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature}
                className="rounded-lg border border-white/10 bg-[#2D3748] p-5 font-montserrat text-base leading-7 text-white md:text-[17px]"
              >
                {feature}
              </div>
            ))}
          </div>
          <p className="mt-10 text-center font-montserrat text-white/70">
            Everything is built in, fully working, and ready to go live with your
            clinic&apos;s name on it.
          </p>
        </div>
      </section>

      {/* See It Live */}
      <section className="border-t border-black/10 bg-white px-6 py-10 md:py-14 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${sectionHeading} text-center text-3xl text-[#333333] md:text-[44px]`}
          >
            See It Live
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center font-montserrat text-[#5E5E5E]">
            We believe the best way to show you what BeelineCure does is to let
            you use it.
          </p>
          <div className="mx-auto mt-12 max-w-3xl space-y-6">
            {seeItLiveRoles.map((role) => (
              <p
                key={role.label}
                className="font-montserrat text-lg leading-relaxed text-[#5E5E5E]"
              >
                <span className="font-semibold text-[#333333]">
                  {role.label}:
                </span>{" "}
                {role.text}
              </p>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/auth/signin" className={filledButtonClass}>
              Try the Demo →
            </Link>
            <Link href="/#video-section" className={outlineButtonClass}>
              Watch the Video →
            </Link>
            <Link href="/demo" className={outlineButtonClass}>
              Book a Call →
            </Link>
          </div>
        </div>
      </section>

      {/* Get In Touch */}
      <section className="border-t border-black/10 bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2
            className={`${sectionHeading} text-3xl text-white md:text-[44px]`}
          >
            Get In Touch
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-montserrat text-lg text-white/90">
            Ready to turn your marketplace patients into loyal recurring patients
            and stop losing the ones who are already looking for you?
          </p>
          <Link
            href="/demo"
            className={`mt-10 inline-block rounded-full bg-white px-8 py-4 font-montserrat font-medium text-[#8B5CF6] hover:bg-white/90 ${ctaButtonClass}`}
          >
            Book a Call
          </Link>
        </div>
      </section>
    </div>
  );
}
