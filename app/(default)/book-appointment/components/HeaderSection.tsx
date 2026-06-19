import { Container } from "@/components/layout/Container";

const bookingSteps = [
  { number: 1, label: "Choose a doctor" },
  { number: 2, label: "Select a date" },
  { number: 3, label: "Pick a time" },
  { number: 4, label: "Confirm appointment" },
] as const;

function StepConnector({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
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

function StepChip({
  number,
  label,
}: {
  number: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2555F3]/10 font-montserrat text-sm font-semibold text-[#2555F3]">
        {number}
      </span>
      <span className="font-montserrat text-sm font-medium leading-snug text-[#333333]">
        {label}
      </span>
    </div>
  );
}

export function HeaderSection() {
  return (
    <section className="w-full border-b border-[#e5e5e5] bg-white py-3 lg:py-3.5">
      <Container>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <h1 className="shrink-0 text-center font-montaga text-2xl leading-tight tracking-tight text-[#111111] lg:text-left lg:text-[1.75rem]">
            Book an Appointment
          </h1>

          <ol
            className="hidden items-center gap-2 lg:flex lg:shrink-0 lg:justify-end"
            aria-label="How booking works"
          >
            {bookingSteps.map((step, index) => (
              <li key={step.number} className="flex items-center gap-2">
                <StepChip number={step.number} label={step.label} />
                {index < bookingSteps.length - 1 && (
                  <StepConnector className="shrink-0 text-[#c4c4c4]" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
