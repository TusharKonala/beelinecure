"use client";

import Image from "next/image";
import Link from "next/link";
import { Users, Stethoscope, TrendingUp, X, Check, type LucideIcon } from "lucide-react";

const comparisonRows = [
  {
    without: "Marketplace patient never comes back",
    with: "Marketplace patient returns directly to you",
  },
  {
    without: "You depend on marketplaces to fill your calendar",
    with: "You own your patient relationships",
  },
  {
    without: "Patient finds you, no one answers, they leave",
    with: "Patient finds you, books instantly, confirmed",
  },
  {
    without: "Manual phone booking and follow-ups",
    with: "Fully automated booking and reminders",
  },
  {
    without: "No visibility into revenue or activity",
    with: "Live dashboard with all your numbers",
  },
];

const sectionHeading = "font-montaga font-semibold leading-tight";
const ctaButtonClass = "font-montserrat font-medium transition-colors";
export default function BeelineCureHomepage() {
  return (
    <div className="min-h-screen w-full min-w-0 font-montserrat text-[#333333]">
      {/* 2. HERO */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center border-t border-black/10 bg-gradient-to-br from-[#0f1623] via-[#171717] to-[#0d1f2d] px-6 py-10 md:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(37,85,243,0.18),transparent_70%)]" />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1
            className={`${sectionHeading} text-3xl leading-[1.1] text-white sm:text-4xl md:text-5xl lg:text-[56px]`}
          >
            Stop losing patients to marketplaces and missed calls
          </h1>
          <p className="mx-auto mt-6 max-w-3xl font-montserrat text-base leading-relaxed text-white/90 md:text-xl">
            Marketplaces are great for discovery. But the second visit? Patients
            see you next to 100 other doctors and drift away. And patients who
            find you directly via Google, WhatsApp, and other channels? They hit a
            phone number, get no answer, and book elsewhere.
          </p>
          <p className="mx-auto mt-4 max-w-3xl font-montserrat text-base leading-relaxed text-white/90 md:text-xl">
            BeelineCure fixes both. After their first visit, patients get
            redirected to your clinic&apos;s own branded booking page, only your
            clinic&apos;s doctors, no competitors, turning one-time visitors into
            loyal recurring patients. Find you on Google, WhatsApp, anywhere,
            they book instantly, no call needed.
          </p>
          <p className="mx-auto mt-4 max-w-3xl font-montserrat text-base leading-relaxed text-white/90 md:text-xl">
            This site is a live demo. Sign up and explore. Ready to get serious?
            Book a call.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/signin"
              className={`min-w-[200px] rounded-lg bg-[#2555F3] px-8 py-4 text-lg text-white shadow-lg shadow-[#2555F3]/20 hover:bg-[#1E44C7] ${ctaButtonClass}`}
            >
              Try the Demo
            </Link>
            <Link
              href="/demo"
              className={`min-w-[200px] rounded-lg border-2 border-white bg-white/10 px-8 py-4 text-lg text-white hover:bg-white/20 ${ctaButtonClass}`}
            >
              Book a Call
            </Link>
          </div>
        </div>
      </section>

      {/* 3. MARKETPLACE EXPLAINER */}
      <section className="border-t border-black/10 bg-[#FAFAFA] px-6 py-12">
        <div className="mx-auto max-w-3xl rounded-lg border-l-4 border-[#F59E0B] bg-[#FFF9E6] p-6">
          <h2 className={`${sectionHeading} text-lg text-[#333333]`}>
            What is a marketplace?
          </h2>
          <p className="mt-3 font-montserrat text-[15px] leading-relaxed text-[#5E5E5E]">
            A healthcare marketplace is an app or website, like an online
            directory for doctors, where patients search, compare, and book
            appointments across hundreds of clinics. While great for discovery,
            they own the patient relationship, not you.
          </p>
        </div>
      </section>

      {/* 4. PROBLEM 1 */}
      <section className="border-t border-black/10 bg-white px-6 py-10 md:py-14 lg:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-12">
          <div>
            <p className="mb-3 font-montserrat text-sm font-semibold uppercase tracking-wide text-[#2555F3]">
              PROBLEM #1
            </p>
            <h2
              className={`${sectionHeading} text-3xl text-[#333333] md:text-[40px]`}
            >
              Your marketplace patients are not really yours.
            </h2>
            <div className="mt-6 space-y-4 font-montserrat text-base leading-relaxed text-[#5E5E5E] md:text-[17px]">
              <p>
                You worked hard to build your reputation. You collected reviews.
                You showed up in searches. A patient found you on a marketplace
                and booked.
              </p>
              <p>
                But next time they need a doctor, they open the app again, and
                see you and 200 others. The marketplace promotes whoever pays
                them more. That patient you earned? They might book someone
                else. You cannot build a loyal patient base on someone
                else&apos;s platform. BeelineCure fixes this. After a
                patient&apos;s first marketplace visit, redirect them to your
                own branded booking system. They come back to you directly,
                every time.
              </p>
            </div>
          </div>
          <div className="relative w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5">
            <Image
              src="/problem1.png"
              alt="Marketplace patient re-booking journey: patients drift to competitors"
              width={1536}
              height={1024}
              className="h-auto w-full object-contain"
              sizes="(max-width: 1024px) 100vw, 56vw"
            />
          </div>
        </div>
      </section>

      {/* 5. PROBLEM 2 */}
      <section className="border-t border-black/10 bg-[#FAFAFA] px-6 py-10 md:py-14 lg:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="relative w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 lg:order-1">
            <Image
              src="/problem2.png"
              alt="Missed call to instant online booking"
              width={1402}
              height={1122}
              className="h-auto w-full object-contain"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
          <div className="lg:order-2">
            <p className="mb-3 font-montserrat text-sm font-semibold uppercase tracking-wide text-[#2555F3]">
              PROBLEM #2
            </p>
            <h2
              className={`${sectionHeading} text-3xl text-[#333333] md:text-[40px]`}
            >
              You are losing patients who already found you.
            </h2>
            <div className="mt-6 space-y-4 font-montserrat text-base leading-relaxed text-[#5E5E5E] md:text-[17px]">
              <p>
                A patient Googles your clinic. They land on your website. They
                see a phone number. They call. No answer. They book somewhere
                else.
              </p>
              <p>
                This happens every day. A missed call is not just a missed call.
                It is a patient who already wanted you, slipping away.
                BeelineCure gives your clinic a 24/7 online booking system.
                Patient finds you anywhere: Google, Instagram, WhatsApp, a
                referral, and books instantly. No call needed. No patients
                lost.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. SEE IT IN ACTION */}
      <section
        id="see-it-in-action"
        className="border-t border-white/5 bg-[#1a2332] px-6 py-16 md:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${sectionHeading} mb-12 text-center text-3xl text-white md:mb-16 md:text-[44px]`}
          >
            See It In Action
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {[
              {
                title: "Doctor Dashboard",
                desc: "Track today's appointments, total patients, and pending prescriptions. See upcoming visits and recent patients at a glance.",
                src: "/marketing/doctor-dashboard.png",
                alt: "BeelineCure doctor dashboard showing appointments, patients, and prescriptions",
                width: 1024,
                height: 414,
              },
              {
                title: "Admin Dashboard",
                desc: "Monitor platform metrics in one place: approved doctors, registered patients, bookings, revenue, and recent activity.",
                src: "/marketing/admin-dashboard.png",
                alt: "BeelineCure admin dashboard showing platform metrics and recent bookings",
                width: 1024,
                height: 429,
              },
            ].map((card) => (
              <div key={card.title} className="flex flex-col">
                <div className="relative w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-white/10">
                  <Image
                    src={card.src}
                    alt={card.alt}
                    width={card.width}
                    height={card.height}
                    className="h-auto w-full object-contain"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
                <h3 className={`${sectionHeading} mt-4 text-xl text-white`}>
                  {card.title}
                </h3>
                <p className="mt-2 font-montserrat text-sm leading-relaxed text-white/70">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HOW IT WORKS */}
      <section
        id="how-it-works"
        className="border-t border-black/10 bg-white px-6 py-10 md:py-14 lg:py-16"
      >
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${sectionHeading} text-center text-3xl text-[#333333] md:text-[44px]`}
          >
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center font-montserrat text-[#5E5E5E]">
            From first discovery to lifelong patient, in four steps.
          </p>
          <div className="mx-auto mt-12 max-w-3xl space-y-12 md:mt-16">
            {[
              {
                n: 1,
                title: "Patient finds you",
                desc: "Through Google, WhatsApp, Instagram, a referral, or even a marketplace.",
              },
              {
                n: 2,
                title: "They land on your branded booking page",
                desc: "Not a static website. Not a phone number. A live, professional booking experience with your clinic's name and branding.",
              },
              {
                n: 3,
                title: "They book, pay, and get confirmed",
                desc: "Pick a doctor, choose a time slot, pay online or at the clinic. Done in minutes.",
              },
              {
                n: 4,
                title: "They come back directly to you",
                desc: "Next appointment, they return to your system. Not a marketplace. Not a competitor's listing. You.",
              },
            ].map((step) => (
              <div key={step.n} className="flex gap-6 md:gap-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2555F3] font-montserrat text-xl font-semibold text-white">
                  {step.n}
                </div>
                <div>
                  <h3
                    className={`${sectionHeading} text-lg text-[#333333] md:text-xl`}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-2 font-montserrat leading-relaxed text-[#5E5E5E]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. WHAT YOUR CLINIC GETS */}
      <section
        id="what-your-clinic-gets"
        className="border-t border-white/10 bg-[#171717] px-6 py-12 md:py-20 lg:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${sectionHeading} text-center text-3xl text-white md:text-[44px]`}
          >
            What Your Clinic Gets
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center font-montserrat text-white/70">
            Built for the people who make your clinic work
          </p>
          <div className="mt-12 grid grid-cols-1 gap-8 md:mt-16 md:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(3)]:md:col-span-2 [&>*:nth-child(3)]:md:mx-auto [&>*:nth-child(3)]:md:max-w-[calc((100%-2rem)/2)] [&>*:nth-child(3)]:lg:col-span-1 [&>*:nth-child(3)]:lg:mx-0 [&>*:nth-child(3)]:lg:max-w-none">
            <FeatureCard
              icon={Users}
              title="For Patients"
              items={[
                "Browse doctors and book in minutes",
                "Choose clinic visit or video consultation",
                "Pay online or at the clinic",
                "Automatic reminders before every appointment",
                "Access prescriptions from their account",
                "Message their doctor after a visit",
                "Cancel or reschedule with one click",
              ]}
            />
            <FeatureCard
              icon={Stethoscope}
              title="For Doctors"
              items={[
                "Manage schedule and availability easily",
                "View appointments and write prescriptions",
                "Message patients directly",
                "Google Calendar sync",
                "Video consultations via Google Meet",
              ]}
            />
            <FeatureCard
              icon={TrendingUp}
              title="For Clinic Owners"
              items={[
                "Live dashboard: bookings, revenue, doctor activity",
                "Approve doctors before they go live",
                "Manage and moderate patient reviews",
                "Post jobs and screen candidates with AI",
                "Everything in one place",
              ]}
            />
          </div>
        </div>
      </section>

      {/* 9. COMPARISON TABLE */}
      <section className="border-t border-black/10 bg-white px-6 py-10 md:py-14 lg:py-16">
        <div className="mx-auto max-w-5xl">
          <h2
            className={`${sectionHeading} mb-12 text-center text-3xl text-[#333333] md:mb-16 md:text-[44px]`}
          >
            Why Clinics Choose BeelineCure
          </h2>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-black/10 shadow-sm md:block">
            <div className="grid grid-cols-2">
              <div className="bg-gradient-to-br from-[#F5F5F5] to-[#E8E8E8] px-6 py-4 text-center font-montserrat text-sm font-semibold text-[#5E5E5E]">
                Without BeelineCure
              </div>
              <div className="bg-gradient-to-br from-[#F0F7FF] to-[#E6F2FF] px-6 py-4 text-center font-montserrat text-sm font-semibold text-[#2555F3]">
                With BeelineCure
              </div>
            </div>
            {comparisonRows.map((row) => (
              <div
                key={row.without}
                className="grid grid-cols-2 border-t border-black/10"
              >
                <div className="flex items-center gap-4 bg-[#FAFAFA] px-6 py-5 font-montserrat text-sm text-[#6B6B6B]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EF4444]/10">
                    <X className="h-3 w-3 text-[#EF4444]" />
                  </span>
                  <span>{row.without}</span>
                </div>
                <div className="flex items-center gap-4 bg-white px-6 py-5 font-montserrat text-sm text-[#333333]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#10B981]/10">
                    <Check className="h-3 w-3 text-[#10B981]" />
                  </span>
                  <span>{row.with}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="space-y-4 md:hidden">
            {comparisonRows.map((row) => (
              <div
                key={row.without}
                className="overflow-hidden rounded-xl border border-black/10 shadow-sm"
              >
                <div className="flex items-start gap-3 bg-[#FAFAFA] px-4 py-4 font-montserrat text-sm text-[#6B6B6B]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EF4444]/10">
                    <X className="h-3 w-3 text-[#EF4444]" />
                  </span>
                  <span>{row.without}</span>
                </div>
                <div className="flex items-start gap-3 border-t border-black/10 bg-white px-4 py-4 font-montserrat text-sm text-[#333333]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#10B981]/10">
                    <Check className="h-3 w-3 text-[#10B981]" />
                  </span>
                  <span>{row.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className="border-t border-black/10 bg-gradient-to-br from-[#6366F1] via-[#A855F7] to-[#EC4899] px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2
            className={`${sectionHeading} text-3xl text-white md:text-[44px]`}
          >
            See It Live: No Signup Needed
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-montserrat text-lg text-white/90">
            This website is our live demo. Everything is real and fully working.
            Book as a patient, explore as a doctor, or get a guided walkthrough
            of the admin panel.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/signin"
              className={`min-w-[200px] rounded-lg bg-white px-8 py-4 text-lg text-[#2555F3] hover:bg-white/90 ${ctaButtonClass}`}
            >
              Try the Demo
            </Link>
            <Link
              href="/demo"
              className={`min-w-[200px] rounded-lg border-2 border-white bg-white/10 px-8 py-4 text-lg text-white hover:bg-white/20 ${ctaButtonClass}`}
            >
              Book a Call
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-white/4 transition-colors hover:border-white/20 hover:bg-white/6">
      <div className="p-6">
        <div className="mb-4 flex h-14 w-14 items-center justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#2555F3]/15">
            <Icon className="h-5 w-5 text-[#2555F3]" />
          </div>
        </div>
        <h3 className="border-b border-white/10 pb-4 font-montaga text-xl font-semibold leading-tight text-white">
          {title}
        </h3>
        <ul className="mt-5 list-disc space-y-4 pl-5 font-montserrat marker:text-white/55">
          {items.map((item) => (
            <li key={item} className="text-base leading-7 text-white/90">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
