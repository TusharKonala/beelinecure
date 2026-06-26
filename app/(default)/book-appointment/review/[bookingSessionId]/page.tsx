import { prisma } from "@/lib/db";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import { Container } from "@/components/layout/Container";
import { ConfirmAndPayButton } from "@/components/booking/ConfirmAndPayButton";
import { notFound } from "next/navigation";
import { BookingSessionStatus } from "@/generated/prisma/client";
import { ExpiredBookingSession } from "./ExpiredBookingSession";
import { SlotUnavailableBookingSession } from "./SlotUnavailableBookingSession";
import { PatientLocalDateTime } from "./PatientLocalDateTime";
import { parsePriceMap, priceCentsForDuration } from "@/lib/doctor-pricing";
import {
  coerceSupportedCurrency,
  currencyForTimezone,
  formatPrice,
} from "@/lib/currency";
import { convertCentsAmount } from "@/lib/fx-rates";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { ReschedulePolicyNotice } from "@/app/(default)/book-appointment/components/ReschedulePolicyNotice";
import { CancellationRefundPolicyNotice } from "@/app/(default)/book-appointment/components/CancellationRefundPolicyNotice";
import { assertSlotAvailableForCheckout } from "@/lib/slot-availability";

type PageProps = {
  params: Promise<{ bookingSessionId: string }>;
};

export default async function BookingReviewPage({ params }: PageProps) {
  const { bookingSessionId } = await params;

  const bookingSession = await prisma.bookingSession.findUnique({
    where: { id: bookingSessionId },
  });

  if (!bookingSession) {
    notFound();
  }

  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(bookingSession.doctorId),
  });

  if (!doctor) {
    notFound();
  }

  // Prefer the price + currency snapshotted at booking time (immutable). Fall
  // back to the doctor's current pricing only for legacy sessions where the
  // snapshot is missing.
  const priceMap = parsePriceMap(doctor.consultationPriceCentsByDuration);
  const priceCents =
    bookingSession.priceCentsAtBooking ??
    priceCentsForDuration(priceMap, bookingSession.durationMinutes);
  const currency = coerceSupportedCurrency(
    bookingSession.currencyAtBooking ?? doctor.currency,
  );
  const consultationPriceLabel = formatPrice(priceCents, currency);

  const patientCurrency = currencyForTimezone(bookingSession.patientTimezone);
  let approxLocalLabel: string | null = null;
  if (patientCurrency !== currency) {
    try {
      const localCents = await convertCentsAmount(
        priceCents,
        currency,
        patientCurrency,
      );
      approxLocalLabel = `(approx ${formatPrice(localCents, patientCurrency)})`;
    } catch (err) {
      console.error("[review] Failed to convert price to local currency:", err);
    }
  }

  const isTtlExpired =
    bookingSession.status === BookingSessionStatus.EXPIRED ||
    bookingSession.expiresAt <= new Date();

  const isFailed = bookingSession.status === BookingSessionStatus.FAILED;

  const slotBookable =
    bookingSession.status === BookingSessionStatus.PENDING && !isTtlExpired
      ? await assertSlotAvailableForCheckout({
          doctorId: bookingSession.doctorId,
          dateYmd: bookingSession.date,
          time: bookingSession.time,
        })
      : { ok: true as const };

  const isSlotUnavailable = !slotBookable.ok;

  return (
    <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            {isTtlExpired ? (
              <ExpiredBookingSession doctorId={bookingSession.doctorId} />
            ) : isFailed || isSlotUnavailable ? (
              <SlotUnavailableBookingSession
                doctorId={bookingSession.doctorId}
              />
            ) : (
              <>
                <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                  Review your booking
                </h1>
                <p className="mt-3 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                  {bookingSession.consultationType === "CLINIC"
                    ? "Please confirm your clinic visit details before proceeding to secure payment."
                    : "Please confirm the details of your online consultation before proceeding to payment."}
                </p>

                <div className="mt-6 space-y-4">
                  <div className="flex flex-col justify-between gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:items-center">
                    <span className="font-medium text-[#111111]">Doctor</span>
                    <span className="text-[#5E5E5E] sm:text-right">
                      {formatDoctorDisplayName(doctor.name)}
                    </span>
                  </div>
                  <div className="flex flex-col justify-between gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:items-center">
                    <span className="font-medium text-[#111111]">
                      Consultation type
                    </span>
                    <span className="text-[#5E5E5E] sm:text-right">
                      {bookingSession.consultationType === "ONLINE"
                        ? "Online consultation"
                        : "Clinic visit"}
                    </span>
                  </div>

                  <PatientLocalDateTime
                    date={bookingSession.date}
                    time={bookingSession.time}
                    doctorTimezone={bookingSession.timezone}
                  />

                  <div className="flex flex-col justify-between gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:items-center">
                    <span className="font-medium text-[#111111]">Patient</span>
                    <span className="text-[#5E5E5E] sm:text-right">
                      {bookingSession.patientName || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col justify-between gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:items-center">
                    <span className="font-medium text-[#111111]">Duration</span>
                    <span className="text-[#5E5E5E] sm:text-right">
                      {bookingSession.durationMinutes} minutes
                    </span>
                  </div>
                  <div className="flex flex-col justify-between gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:items-center">
                    <span className="font-medium text-[#111111]">
                      Consultation price
                    </span>
                    <span className="text-[#5E5E5E] sm:text-right">
                      {consultationPriceLabel}
                      {approxLocalLabel ? ` ${approxLocalLabel}` : ""}
                    </span>
                  </div>
                </div>

                <ReschedulePolicyNotice />

                {bookingSession.consultationType === "CLINIC" && (
                  <div className="mt-6 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4">
                    <p className="font-montserrat text-sm text-[#333333]">
                      Payment will be collected online before your visit. Please
                      arrive a few minutes early.
                    </p>
                  </div>
                )}

                <CancellationRefundPolicyNotice />

                <ConfirmAndPayButton
                  bookingSessionId={bookingSessionId}
                  doctorId={bookingSession.doctorId}
                />
              </>
            )}
          </div>
        </section>
      </Container>
    </div>
  );
}
