import Link from "next/link";
import { Container } from "@/components/layout/Container";

export default function DoctorDeactivatedPage() {
  return (
    <div className="w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              Doctor account deactivated
            </h1>
            <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:text-base">
              Your doctor account has been deactivated by an administrator and
              has no remaining appointments to complete or manage. Dashboard
              access is no longer available. If you believe this is a mistake,
              please contact the BeelineCure team.
            </p>
            <div className="mt-6">
              <Link
                href="/auth/signin"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white px-4 font-montserrat text-sm font-medium text-[#333333] shadow-sm hover:bg-[#fafafa]"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
