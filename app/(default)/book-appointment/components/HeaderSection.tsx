import { Container } from "@/components/layout/Container";

const bookingSteps = [
  {
    number: 1,
    label: "Choose a doctor",
    shortLabel: "Choose doctor",
    isCurrent: true,
  },
  {
    number: 2,
    label: "Select a date",
    shortLabel: "Select date",
    isCurrent: false,
  },
  {
    number: 3,
    label: "Pick a time",
    shortLabel: "Pick time",
    isCurrent: false,
  },
  {
    number: 4,
    label: "Confirm appointment",
    shortLabel: "Confirm",
    isCurrent: false,
  },
] as const;

function StepConnector({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function HeaderSection() {
  return (
    <section className="w-full border-b border-[#e5e5e5] bg-white py-4 md:py-6">
      <Container>
        <div className="flex flex-col items-center text-center">
          <h1 className="font-montaga text-3xl leading-tight tracking-tight text-[#111111] md:text-4xl">
            Book an Appointment
          </h1>
          <p className="mx-auto mt-2 max-w-2xl font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:mt-3 md:text-base">
            Select a doctor and schedule a visit at a time that works for you.
          </p>

          <div className="mt-5 w-full md:mt-6">
            <p className="mb-3 font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
              How booking works
            </p>

            {/* Mobile + small tablet: 2×2 grid */}
            <ol className="grid grid-cols-2 gap-2 sm:gap-3 md:hidden">
              {bookingSteps.map((step) => (
                <li
                  key={step.number}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                    step.isCurrent
                      ? "border-[#2555F3] bg-[#2555F3]/5"
                      : "border-[#e5e5e5] bg-[#fafafa]"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-montserrat text-xs font-semibold ${
                      step.isCurrent
                        ? "bg-[#2555F3] text-white"
                        : "bg-[#2555F3]/10 text-[#2555F3]"
                    }`}
                  >
                    {step.number}
                  </span>
                  <span
                    className={`font-montserrat text-xs leading-snug ${
                      step.isCurrent ? "font-medium text-[#111111]" : "text-[#5E5E5E]"
                    }`}
                  >
                    {step.shortLabel}
                  </span>
                </li>
              ))}
            </ol>

            {/* Tablet + desktop: horizontal strip with connectors */}
            <ol className="mx-auto hidden w-full max-w-3xl items-stretch justify-center gap-1 md:flex lg:max-w-4xl lg:gap-2">
              {bookingSteps.map((step, index) => (
                <li key={step.number} className="flex min-w-0 flex-1 items-center gap-1 lg:gap-2">
                  <div
                    className={`flex w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 lg:gap-2.5 lg:px-4 lg:py-3 ${
                      step.isCurrent
                        ? "border-[#2555F3] bg-[#2555F3]/5"
                        : "border-[#e5e5e5] bg-[#fafafa]"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-montserrat text-xs font-semibold lg:h-8 lg:w-8 lg:text-sm ${
                        step.isCurrent
                          ? "bg-[#2555F3] text-white"
                          : "bg-[#2555F3]/10 text-[#2555F3]"
                      }`}
                    >
                      {step.number}
                    </span>
                    <span
                      className={`font-montserrat text-xs leading-snug lg:text-sm ${
                        step.isCurrent
                          ? "font-medium text-[#111111]"
                          : "text-[#5E5E5E]"
                      }`}
                    >
                      <span className="lg:hidden">{step.shortLabel}</span>
                      <span className="hidden lg:inline">{step.label}</span>
                    </span>
                  </div>
                  {index < bookingSteps.length - 1 && (
                    <StepConnector className="hidden shrink-0 text-[#c4c4c4] lg:block lg:mx-0.5" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </section>
  );
}
