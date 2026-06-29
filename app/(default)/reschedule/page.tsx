"use client";

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import { SetAvailabilityCalendar } from "@/app/doctor/my-schedule/SetAvailabilityCalendar";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/Container";
import { PostAppointmentActions } from "@/components/PostAppointmentActions";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsultationType, AppointmentStatus } from "@/generated/prisma/enums";
import {
  formatTimeInPatientTz,
  formatDateInPatientTz,
  doctorSlotToPatientLocalYmd,
  todayYmdInTimeZone,
} from "@/lib/timezone-display";
import {
  bookableSlotRefKey,
  filterReschedulableSlots,
  type BookableSlotRef,
} from "@/lib/reschedule-slots";
import { useSlotExpiryTick } from "@/lib/use-slot-expiry-tick";
import { useDoctorSlotsPusher } from "@/lib/use-doctor-slots-pusher";
import { SLOT_NO_LONGER_AVAILABLE_MESSAGE } from "@/lib/slot-hold-shared";
import type { PatientConsultationChoice } from "@/lib/doctor-availability-slots";

type RescheduleUiState =
  | "idle"
  | "success"
  | "invalid_link"
  | "invalid_body"
  | "already_cancelled"
  | "appointment_passed"
  | "too_close_to_reschedule"
  | "error";

type AppointmentDetails = {
  id: string;
  doctorId: string;
  date: string;
  time: string;
  timezone: string;
  consultationType: ConsultationType;
  status: AppointmentStatus;
  durationMinutes: number;
};

/** Must match `DEFAULT_HORIZON_DAYS` in `available-dates` API (inclusive span = this + 1). */
const AVAILABILITY_RANGE_DAY_OFFSET = 60;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function daysInMonthUtc(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function lastYmdOfMonthUtc(year: number, month0: number): string {
  const dim = daysInMonthUtc(year, month0);
  return `${year}-${pad2(month0 + 1)}-${pad2(dim)}`;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function consultationChoiceFromAppointment(
  type: ConsultationType,
): PatientConsultationChoice {
  return type === ConsultationType.ONLINE ? "ONLINE" : "CLINIC";
}

function consultationTypeLabel(type: "CLINIC" | "ONLINE"): string {
  return type === "ONLINE" ? "online" : "in-clinic";
}

async function fetchAppointmentDetails(
  appointmentId: string,
  token: string,
): Promise<
  | { status: "success"; appointment: AppointmentDetails }
  | { status: "invalid_link" }
  | { status: "already_cancelled" }
  | { status: "appointment_passed" }
  | { status: "too_close_to_reschedule" }
> {
  const res = await fetch(
    `/api/reschedule-appointment?appointmentId=${encodeURIComponent(
      appointmentId,
    )}&token=${encodeURIComponent(token)}`,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { status: "invalid_link" as const };
  return json;
}

async function getAvailableDatesChunk(
  doctorId: string,
  consultationType: PatientConsultationChoice,
  from: string,
  to: string,
  patientTimezone: string,
  slotDurationMinutes: number,
): Promise<{ dates: string[] }> {
  const params = new URLSearchParams({
    consultationType,
    from,
    to,
    patientTimezone,
    slotDurationMinutes: String(slotDurationMinutes),
  });
  const res = await fetch(
    `/api/doctors/${doctorId}/available-dates?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Failed to fetch available dates");
  return res.json();
}

async function getSlots(
  doctorId: string,
  patientDate: string,
  patientTimezone: string,
  excludeAppointmentId: string,
): Promise<{
  slots: string[];
  slotDetails: {
    doctorDate: string;
    startTime: string;
    slotDurationMinutes: number;
    consultationType?: "CLINIC" | "ONLINE" | "BOTH";
  }[];
  doctorTimezone: string;
  slotDurationMinutes: number;
}> {
  const params = new URLSearchParams({
    patientDate,
    patientTimezone,
    excludeAppointmentId,
  });
  const res = await fetch(
    `/api/doctors/${doctorId}/slots?${params.toString()}`,
  );
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

function RescheduleContent() {
  const searchParams = useSearchParams();
  const appointmentId = useMemo(
    () => searchParams.get("appointmentId") ?? "",
    [searchParams],
  );
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const canLoad = appointmentId.length > 0 && token.length > 0;

  const patientTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const minDate = useMemo(
    () => todayYmdInTimeZone(patientTimezone),
    [patientTimezone],
  );

  const [state, setState] = useState<RescheduleUiState>("idle");
  const [isLoadingAppointment, setIsLoadingAppointment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotUnavailableAlert, setSlotUnavailableAlert] = useState<string | null>(
    null,
  );

  const [appointment, setAppointment] = useState<AppointmentDetails | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<BookableSlotRef | null>(
    null,
  );
  const [confirmedSlot, setConfirmedSlot] = useState<BookableSlotRef | null>(
    null,
  );
  const [hasSelectionInteraction, setHasSelectionInteraction] = useState(false);

  type AvailabilityDateChunk = { from: string; to: string };
  const [availabilityDateChunks, setAvailabilityDateChunks] = useState<
    AvailabilityDateChunk[]
  >([]);
  const prevDoctorScopeRef = useRef<string>("");

  useEffect(() => {
    if (!canLoad) return;

    setIsLoadingAppointment(true);
    setSubmitError(null);

    fetchAppointmentDetails(appointmentId, token)
      .then((json) => {
        if (json.status === "success") {
          const appt = json.appointment;
          setAppointment(appt);
          const patientDate = doctorSlotToPatientLocalYmd(
            appt.date,
            appt.time,
            appt.timezone,
            patientTimezone,
          );
          setSelectedDate(patientDate);
          setSelectedSlot({
            doctorDate: appt.date,
            startTime: appt.time,
          });
          setHasSelectionInteraction(false);
          setState("idle");
          return;
        }

        setAppointment(null);
        setState(json.status);
      })
      .catch(() => setState("error"))
      .finally(() => setIsLoadingAppointment(false));
  }, [appointmentId, token, canLoad, patientTimezone]);

  const consultationType = appointment
    ? consultationChoiceFromAppointment(appointment.consultationType)
    : null;

  useLayoutEffect(() => {
    if (!appointment) {
      setAvailabilityDateChunks([]);
      prevDoctorScopeRef.current = "";
      return;
    }
    const scope = appointment.doctorId;
    if (prevDoctorScopeRef.current === scope) return;
    prevDoctorScopeRef.current = scope;
    const from = todayYmdInTimeZone(patientTimezone);
    setAvailabilityDateChunks([
      { from, to: addDaysToYmd(from, AVAILABILITY_RANGE_DAY_OFFSET) },
    ]);
  }, [appointment, patientTimezone]);

  const availabilityDateQueries = useQueries({
    queries:
      appointment && consultationType && availabilityDateChunks.length > 0
        ? availabilityDateChunks.map(({ from, to }) => ({
            queryKey: [
              "reschedule-available-dates",
              appointment.doctorId,
              consultationType,
              appointment.durationMinutes,
              from,
              to,
              patientTimezone,
            ] as const,
            queryFn: () =>
              getAvailableDatesChunk(
                appointment.doctorId,
                consultationType,
                from,
                to,
                patientTimezone,
                appointment.durationMinutes,
              ),
            enabled: Boolean(appointment.doctorId),
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
          }))
        : [],
  });

  const enabledDateSet = useMemo(() => {
    const next = new Set<string>();
    for (const q of availabilityDateQueries) {
      for (const d of q.data?.dates ?? []) next.add(d);
    }
    return next;
  }, [availabilityDateQueries]);

  const availabilityCalendarFetching = useMemo(
    () => availabilityDateQueries.some((q) => q.isPending),
    [availabilityDateQueries],
  );
  const availabilityCalendarInitialLoading = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size === 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );
  const availabilityCalendarExtending = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size > 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );

  useEffect(() => {
    if (availabilityCalendarFetching) return;
    if (enabledDateSet.size === 0) return;
    if (!selectedDate) return;
    if (enabledDateSet.has(selectedDate)) return;
    if (hasSelectionInteraction) {
      setSelectedDate("");
      setSelectedSlot(null);
      setSlotUnavailableAlert(
        "The date you selected is no longer available. Please choose another date.",
      );
      return;
    }
    const sorted = [...enabledDateSet].sort();
    const next =
      sorted.find((d) => d >= minDate) ?? sorted[sorted.length - 1] ?? minDate;
    setSelectedDate(next);
    setSelectedSlot(null);
  }, [
    availabilityCalendarFetching,
    enabledDateSet,
    selectedDate,
    minDate,
    hasSelectionInteraction,
  ]);

  const selectedDoctorId = appointment?.doctorId ?? "";
  const slotsEnabled =
    state === "idle" && !!selectedDoctorId && !!selectedDate && !!appointment;

  const isCurrentAppointmentSlot =
    !!appointment &&
    !!selectedSlot &&
    selectedSlot.doctorDate === appointment.date &&
    selectedSlot.startTime === appointment.time;
  const shouldBlockCurrentAppointmentSlot =
    hasSelectionInteraction && isCurrentAppointmentSlot;

  useDoctorSlotsPusher({
    doctorId: appointment?.doctorId ?? "",
    enabled: state === "idle" && !!appointment?.doctorId,
    queryKeys: {
      slots: ["reschedule-slots", appointment?.doctorId ?? ""],
      availableDates: ["reschedule-available-dates", appointment?.doctorId ?? ""],
    },
  });

  const {
    data: slotsData,
    isLoading: slotsLoading,
    isFetching: slotsFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: [
      "reschedule-slots",
      selectedDoctorId,
      selectedDate,
      patientTimezone,
      appointment?.id,
    ],
    enabled: slotsEnabled,
    queryFn: () =>
      getSlots(
        selectedDoctorId,
        selectedDate,
        patientTimezone,
        appointment?.id ?? "",
      ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const doctorTz = slotsData?.doctorTimezone ?? appointment?.timezone ?? "UTC";
  const slotDetails = slotsData?.slotDetails ?? [];
  const slotsLoadingOrFetching =
    slotsLoading || (slotsFetching && isPlaceholderData);

  const slotExpiryTick = useSlotExpiryTick(state === "idle" && !!appointment);

  const filteredSlots = useMemo(
    () =>
      appointment && selectedDate
        ? filterReschedulableSlots({
            slotDetails,
            bookedDurationMinutes: appointment.durationMinutes,
            bookedConsultationType: appointment.consultationType,
            selectedDate,
            doctorTimezone: doctorTz,
          })
        : [],
    [
      appointment,
      selectedDate,
      slotDetails,
      doctorTz,
      slotExpiryTick,
    ],
  );
  const hasSelectableSlots = filteredSlots.some(
    (ref) =>
      !(
        appointment &&
        ref.startTime === appointment.time &&
        ref.doctorDate === appointment.date
      ),
  );

  useEffect(() => {
    if (!selectedSlot) return;
    if (slotsLoadingOrFetching) return;
    const key = bookableSlotRefKey(selectedSlot);
    const stillAvailable = filteredSlots.some(
      (ref) => bookableSlotRefKey(ref) === key,
    );
    if (!stillAvailable) {
      const wasCurrentAppointment =
        !!appointment &&
        selectedSlot.doctorDate === appointment.date &&
        selectedSlot.startTime === appointment.time;
      if (hasSelectionInteraction && !wasCurrentAppointment) {
        setSlotUnavailableAlert(SLOT_NO_LONGER_AVAILABLE_MESSAGE);
      }
      setSelectedSlot(null);
    }
  }, [
    selectedSlot,
    filteredSlots,
    appointment,
    hasSelectionInteraction,
    slotsLoadingOrFetching,
  ]);

  useEffect(() => {
    if (selectedSlot !== null) {
      setSlotUnavailableAlert(null);
    }
  }, [selectedSlot]);

  const onCalendarSelect = useCallback((ymd: string) => {
    setHasSelectionInteraction(true);
    setSelectedDate(ymd);
    setSelectedSlot(null);
    setSubmitError(null);
    setSlotUnavailableAlert(null);
  }, []);

  const onCalendarViewingMonthChange = useCallback(
    (year: number, month0: number) => {
      setAvailabilityDateChunks((prev) => {
        if (prev.length === 0) return prev;
        const coverageTo = prev.reduce(
          (max, c) => (c.to > max ? c.to : max),
          prev[0]!.to,
        );
        const lastDay = lastYmdOfMonthUtc(year, month0);
        if (lastDay <= coverageTo) return prev;
        const fromNext = addDaysToYmd(coverageTo, 1);
        const toNext = lastDay;
        if (fromNext > toNext) return prev;

        const additions: AvailabilityDateChunk[] = [];
        let cursor = fromNext;
        while (cursor <= toNext) {
          const tentativeEnd = addDaysToYmd(
            cursor,
            AVAILABILITY_RANGE_DAY_OFFSET,
          );
          const chunkTo = minYmd(tentativeEnd, toNext);
          if (!prev.some((c) => c.from === cursor && c.to === chunkTo)) {
            additions.push({ from: cursor, to: chunkTo });
          }
          cursor = addDaysToYmd(chunkTo, 1);
        }
        if (additions.length === 0) return prev;
        return [...prev, ...additions];
      });
    },
    [],
  );

  const onConfirmReschedule = async () => {
    if (!canLoad || state !== "idle") return;
    if (!selectedSlot || isSubmitting) return;
    if (isCurrentAppointmentSlot) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/reschedule-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          token,
          date: selectedSlot.doctorDate,
          time: selectedSlot.startTime,
          patientTimezone,
        }),
      });

      const json = (await res.json().catch(() => null)) as {
        status?: string;
      } | null;

      const nextState = json?.status;
      if (nextState === "success") {
        setConfirmedSlot(selectedSlot);
        setState("success");
        return;
      }

      if (
        nextState === "already_cancelled" ||
        nextState === "invalid_link" ||
        nextState === "invalid_body" ||
        nextState === "appointment_passed" ||
        nextState === "too_close_to_reschedule"
      ) {
        setState(nextState);
        return;
      }

      if (nextState === "slot_unavailable") {
        setSubmitError("This time slot is no longer available.");
        return;
      }

      setState("error");
    } catch {
      setState("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = (() => {
    switch (state) {
      case "success":
        return "Appointment Rescheduled";
      case "already_cancelled":
        return "Already Cancelled";
      case "invalid_link":
        return "Invalid Reschedule Link";
      case "appointment_passed":
        return "Too Late to Reschedule";
      case "invalid_body":
        return "Invalid Request";
      case "error":
        return "Reschedule Error";
      case "too_close_to_reschedule":
        return "Reschedule Not Available";
      default:
        return "Reschedule Appointment";
    }
  })();

  const message = (() => {
    switch (state) {
      case "success":
        return "Your appointment has been rescheduled.";
      case "already_cancelled":
        return "This appointment has been cancelled and can’t be rescheduled.";
      case "invalid_link":
        return "This reschedule link is invalid or expired.";
      case "appointment_passed":
        return "Your appointment time has passed. This link can no longer be used to reschedule. Please book a new appointment instead.";
      case "invalid_body":
        return "Invalid request. Please try again.";
      case "error":
        return "We could not reschedule your appointment. Please try again.";
      case "too_close_to_reschedule":
        return "This appointment is less than 24 hours away. Please cancel and rebook instead.";
      default:
        return "Select a new date and time, then confirm rescheduling.";
    }
  })();

  const successSlot = confirmedSlot ?? selectedSlot;

  return (
    <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              {state === "too_close_to_reschedule" ? (
                <MontagaCapitalN text={title} />
              ) : (
                title
              )}
            </h1>
            <p className="mt-4 font-montserrat text-sm text-[#5E5E5E] md:text-base">
              {message}
            </p>

            {state === "success" && successSlot && (
              <div className="mt-6 flex flex-col gap-2 rounded-lg bg-[#fafafa] p-4 font-montserrat text-sm text-[#111111]">
                <p>
                  <span className="font-medium text-[#111111]">New date:</span>{" "}
                  <span className="text-[#333333]">
                    {formatDateInPatientTz(
                      successSlot.doctorDate,
                      successSlot.startTime,
                      doctorTz,
                      patientTimezone,
                    )}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-[#111111]">New time:</span>{" "}
                  <span className="text-[#333333]">
                    {formatTimeInPatientTz(
                      successSlot.doctorDate,
                      successSlot.startTime,
                      doctorTz,
                      patientTimezone,
                    )}
                  </span>
                </p>
                <p className="mt-1 text-[#5E5E5E]">
                  A confirmation email has been sent with your updated appointment details.
                </p>
              </div>
            )}

            {state === "success" && <PostAppointmentActions />}

            {state === "idle" && !canLoad && (
              <div className="mt-8">
                <p className="font-montserrat text-sm text-red-600">
                  This reschedule link is missing required parameters.
                </p>
              </div>
            )}

            {state === "idle" && canLoad && (
              <>
                {isLoadingAppointment && (
                  <div className="mt-8">
                    <h2 className="font-montaga text-xl font-semibold leading-tight text-[#333333]">
                      Loading reschedule…
                    </h2>
                    <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                      Please wait.
                    </p>
                  </div>
                )}

                {!isLoadingAppointment && appointment && (
                  <>
                    <p className="mt-6 rounded-lg bg-[#f4f7ff] px-4 py-3 font-montserrat text-sm text-[#333333]">
                      Your original appointment was a {appointment.durationMinutes}-minute{" "}
                      {consultationTypeLabel(appointment.consultationType)} consultation.
                      Only slots matching this duration and consultation type are
                      shown.
                    </p>
                    <div className="mt-8 flex flex-col gap-6">
                      <section>
                        <h2 className="font-montaga text-xl font-semibold leading-tight text-[#333333]">
                          Select date
                        </h2>
                        {availabilityCalendarInitialLoading ? (
                          <div className="mt-4">
                            <Skeleton className="h-[340px] w-full max-w-sm rounded-xl bg-[#e5e5e5]" />
                          </div>
                        ) : enabledDateSet.size === 0 ? (
                          <p className="mt-4 font-montserrat text-sm text-[#5E5E5E]">
                            No upcoming slots are available to reschedule to yet.
                          </p>
                        ) : (
                          <div className="mt-4">
                            <SetAvailabilityCalendar
                              value={selectedDate}
                              minDate={minDate}
                              disabledDates={new Set()}
                              enabledDates={enabledDateSet}
                              loadingDisabledDates={false}
                              gridAriaLabel="Select reschedule date"
                              onViewingMonthChange={onCalendarViewingMonthChange}
                              onSelect={onCalendarSelect}
                            />
                            {availabilityCalendarExtending ? (
                              <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
                                Loading more dates…
                              </p>
                            ) : null}
                          </div>
                        )}
                      </section>

                      <section>
                        <h2 className="font-montaga text-xl font-semibold leading-tight text-[#333333]">
                          Available times
                        </h2>

                        {slotsLoadingOrFetching && (
                          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <Skeleton
                                key={i}
                                className="h-11 w-full rounded-xl bg-[#e5e5e5] sm:h-12"
                              />
                            ))}
                          </div>
                        )}

                        {!slotsLoadingOrFetching && !hasSelectableSlots && (
                          <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                            No slots available for this date.
                          </p>
                        )}

                        {!slotsLoadingOrFetching && filteredSlots.length > 0 && (
                          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
                            {filteredSlots.map((ref) => {
                              const refKey = bookableSlotRefKey(ref);
                              const isCurrent =
                                !!appointment &&
                                ref.startTime === appointment.time &&
                                ref.doctorDate === appointment.date;
                              const isSelected =
                                selectedSlot !== null &&
                                bookableSlotRefKey(selectedSlot) === refKey;
                              return (
                                <Button
                                  key={refKey}
                                  variant={isSelected ? "default" : "outline"}
                                  disabled={isCurrent}
                                  aria-disabled={isCurrent}
                                  title={isCurrent ? "Current Slot" : undefined}
                                  className={`h-11 rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base ${
                                    isCurrent
                                      ? "cursor-not-allowed opacity-60"
                                      : "cursor-pointer"
                                  }`}
                                  onClick={() => {
                                    if (isCurrent) return;
                                    setHasSelectionInteraction(true);
                                    setSelectedSlot(ref);
                                    setSubmitError(null);
                                    setSlotUnavailableAlert(null);
                                  }}
                                >
                                  <span className="inline-flex flex-col items-center leading-tight">
                                    <span>
                                      {formatTimeInPatientTz(
                                        ref.doctorDate,
                                        ref.startTime,
                                        doctorTz,
                                        patientTimezone,
                                      )}
                                    </span>
                                    {isCurrent ? (
                                      <span className="text-[10px] uppercase tracking-wide">
                                        Current
                                      </span>
                                    ) : null}
                                  </span>
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section>
                        {slotUnavailableAlert && (
                          <p
                            className="mb-4 font-montserrat text-sm text-red-600"
                            role="alert"
                          >
                            {slotUnavailableAlert}
                          </p>
                        )}
                        {submitError && (
                          <p className="mb-4 font-montserrat text-sm text-red-600">
                            {submitError}
                          </p>
                        )}
                        {shouldBlockCurrentAppointmentSlot && (
                          <p className="mb-4 font-montserrat text-sm text-[#5E5E5E]">
                            This is your current appointment slot.
                          </p>
                        )}
                        <Button
                          disabled={
                            !selectedSlot ||
                            isSubmitting ||
                            isCurrentAppointmentSlot
                          }
                          onClick={onConfirmReschedule}
                          className="h-11 w-full cursor-pointer rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
                        >
                          {isSubmitting
                            ? "Rescheduling…"
                            : "Confirm Reschedule"}
                        </Button>
                      </section>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </Container>
    </div>
  );
}

export default function ReschedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
          <Container>
            <section className="mx-auto max-w-xl">
              <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
                <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                  Loading rescheduling…
                </h1>
                <p className="mt-4 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                  Please wait.
                </p>
              </div>
            </section>
          </Container>
        </div>
      }
    >
      <RescheduleContent />
    </Suspense>
  );
}
