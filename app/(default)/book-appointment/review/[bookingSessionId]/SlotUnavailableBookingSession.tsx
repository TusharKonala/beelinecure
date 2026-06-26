import Link from "next/link";

export function SlotUnavailableBookingSession({
  doctorId,
}: {
  doctorId: string;
}) {
  return (
    <>
      <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
        Time slot no longer available
      </h1>
      <p className="mt-3 font-montserrat text-sm text-[#5E5E5E] md:text-base">
        This time was just booked by another patient. Please choose a different
        slot to continue.
      </p>
      <Link
        href={`/book-appointment/${doctorId}`}
        className="mt-6 inline-block font-montserrat text-sm font-medium text-[#2555F3] underline underline-offset-2 hover:text-[#1a45d9]"
      >
        Choose another time
      </Link>
    </>
  );
}
