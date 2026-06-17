import { Container } from "@/components/layout/Container";

export function HeaderSection() {
  return (
    <section className="w-full bg-white py-4 md:py-5">
      <Container>
        <div className="flex flex-col items-center text-center">
          <h1 className="font-montaga text-3xl leading-tight tracking-tight text-[#111111] md:text-4xl">
            Book an Appointment
          </h1>
          <p className="mx-auto mt-2 max-w-2xl font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:mt-3 md:text-base">
            Select a doctor and schedule a visit at a time that works for you.
          </p>
        </div>
      </Container>
    </section>
  );
}

