"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueries, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { z } from "zod";
import { SetAvailabilityCalendar } from "@/app/doctor/my-schedule/SetAvailabilityCalendar";
import { Container } from "@/components/layout/Container";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";
import { PostAppointmentActions } from "@/components/PostAppointmentActions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatTimeInPatientTz,
  formatDateInPatientTz,
  isDoctorTimeInPast,
  todayYmdInTimeZone,
} from "@/lib/timezone-display";
import { useSlotExpiryTick } from "@/lib/use-slot-expiry-tick";
import {
  bookableSlotRefKey,
  type BookableSlotRef,
} from "@/lib/reschedule-slots";
import {
  coerceSupportedCurrency,
  currencyForTimezone,
  formatPrice,
  type SupportedCurrency,
} from "@/lib/currency";
import {
  doctorPriceRangeCents,
  parsePriceMap,
  priceCentsForDuration,
  type ConsultationPriceCentsByDuration,
} from "@/lib/doctor-pricing";
import { convertCentsAmount } from "@/lib/fx-rates";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { ReschedulePolicyNotice } from "@/app/(default)/book-appointment/components/ReschedulePolicyNotice";
import type { PatientConsultationChoice } from "@/lib/doctor-availability-slots";
import {
  SLOT_HOLD_STORAGE_KEY,
  SLOT_NO_LONGER_AVAILABLE_MESSAGE,
  type SlotUpdatedPayload,
} from "@/lib/slot-hold-shared";
import { useDoctorSlotsPusher } from "@/lib/use-doctor-slots-pusher";

const patientFormSchema = z.object({
  patientName: z.string().min(1, "Full name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  notes: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientFormSchema>;
type SlotDetail = Awaited<ReturnType<typeof getSlots>>["slotDetails"][number];
type SubmitErrorState = {
  message: string;
  code?: string;
  bookingEmail?: string;
  link?: {
    href: string;
    label: string;
  };
} | null;

const PATIENT_APPOINTMENTS_PATH = "/patient/appointments";

const DATE_NO_LONGER_AVAILABLE_MESSAGE =
  "The date you selected is no longer available. Please choose another date.";

const AUTH_GATED_BOOKING_ERROR_CODES = new Set([
  "UPCOMING_APPOINTMENT_LIMIT_REACHED",
  "EXISTING_APPOINTMENT_SAME_DATE",
]);

function resolveBookingErrorLink(
  link: { href: string; label: string } | undefined,
  code: string | undefined,
  sessionStatus: string,
): { href: string; label: string } | undefined {
  if (!link) return undefined;
  if (
    sessionStatus !== "authenticated" &&
    code &&
    AUTH_GATED_BOOKING_ERROR_CODES.has(code) &&
    link.href === PATIENT_APPOINTMENTS_PATH
  ) {
    return {
      ...link,
      href: `/auth/signin?callbackUrl=${encodeURIComponent(PATIENT_APPOINTMENTS_PATH)}`,
    };
  }
  return link;
}

function enrichGuestBookingError(input: {
  code?: string;
  sessionStatus: string;
  bookingEmail?: string;
  apiMessage: string;
  link?: { href: string; label: string };
}): { message: string; link?: { href: string; label: string } } {
  const link = resolveBookingErrorLink(
    input.link,
    input.code,
    input.sessionStatus,
  );

  if (
    input.sessionStatus === "authenticated" ||
    !input.code ||
    !AUTH_GATED_BOOKING_ERROR_CODES.has(input.code)
  ) {
    return { message: input.apiMessage, link };
  }

  const emailPhrase =
    input.bookingEmail?.trim() || "the same email you used when booking";

  if (input.code === "EXISTING_APPOINTMENT_SAME_DATE") {
    const label = link?.label ?? "reschedule it";
    return {
      message: `You already have an appointment on this date. Sign up or sign in with ${emailPhrase} to reschedule or manage that appointment. Would you like to ${label} instead?`,
      link,
    };
  }

  const label = link?.label ?? "cancel an existing appointment";
  return {
    message: `You've reached the limit of 2 upcoming appointments. Sign up or sign in with ${emailPhrase} to view and cancel your appointments. Please ${label} before booking a new one.`,
    link,
  };
}

function renderSubmitErrorMessage(submitError: NonNullable<SubmitErrorState>) {
  if (!submitError.link) return submitError.message;

  const idx = submitError.message.indexOf(submitError.link.label);
  if (idx === -1) return submitError.message;

  const before = submitError.message.slice(0, idx);
  const after = submitError.message.slice(idx + submitError.link.label.length);

  return (
    <>
      {before}
      <Link href={submitError.link.href} className="font-medium underline">
        {submitError.link.label}
      </Link>
      {after}
    </>
  );
}

async function getDoctor(doctorId: string) {
  const res = await fetch(`/api/doctors/${doctorId}`);
  if (!res.ok) throw new Error("Failed to fetch doctor");
  return res.json();
}

async function getAvailableDatesChunk(
  doctorId: string,
  consultationType: PatientConsultationChoice,
  from: string,
  to: string,
  patientTimezone: string,
): Promise<{ dates: string[] }> {
  const params = new URLSearchParams({
    consultationType,
    from,
    to,
    patientTimezone,
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
  consultationType: PatientConsultationChoice,
  patientTimezone: string,
  excludeSlotHoldId?: string,
): Promise<{
  slots: string[];
  slotDetails: {
    doctorDate: string;
    startTime: string;
    slotDurationMinutes: number;
    consultationType: "CLINIC" | "ONLINE" | "BOTH";
    availabilityId: string | null;
  }[];
  doctorTimezone: string;
  slotDurationMinutes: number;
}> {
  const params = new URLSearchParams({
    patientDate,
    patientTimezone,
    consultationType,
  });
  if (excludeSlotHoldId) {
    params.set("excludeSlotHoldId", excludeSlotHoldId);
  }
  const res = await fetch(
    `/api/doctors/${doctorId}/slots?${params.toString()}`,
  );
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

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

/** Must match `DEFAULT_HORIZON_DAYS` in `available-dates` API (inclusive span = this + 1). */
const AVAILABILITY_RANGE_DAY_OFFSET = 60;

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function patientCurrencyFromTimezone(): SupportedCurrency {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return currencyForTimezone(timezone);
}

export default function BookAppointmentDoctorPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const doctorId = String(params?.doctorId ?? "");
  const router = useRouter();
  const { redirectWithOverlay } = useRedirectOverlay();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<BookableSlotRef | null>(null);
  const [consultationType, setConsultationType] =
    useState<PatientConsultationChoice | null>(null);
  const [clinicPaymentMode, setClinicPaymentMode] = useState<
    "payNow" | "payAtClinic" | null
  >(null);
  type AvailabilityDateChunk = { from: string; to: string };
  const [availabilityDateChunks, setAvailabilityDateChunks] = useState<
    AvailabilityDateChunk[]
  >([]);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<
    number | null
  >(null);
  const prevConsultationScopeRef = useRef<string>("");
  const queryClient = useQueryClient();

  const patientTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const minDate = useMemo(
    () => todayYmdInTimeZone(patientTimezone),
    [patientTimezone],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isValid },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    // First validation runs on blur; subsequent re-validation happens on every
    // change so existing errors clear (or update) on the next keystroke.
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { patientName: "", email: "", phone: "", notes: "" },
  });

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user) return;
    const name = (session.user.name ?? "").trim();
    const email = (session.user.email ?? "").trim();
    if (!name && !email) return;

    const current = getValues();
    reset({
      patientName: current.patientName.trim() ? current.patientName : name,
      email: current.email.trim() ? current.email : email,
      phone: current.phone,
      notes: current.notes ?? "",
    });
  }, [sessionStatus, session?.user, reset, getValues]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    void fetch("/api/patient/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { phone?: string | null } | null) => {
        if (cancelled || !data?.phone) return;
        const profilePhone = data.phone.trim();
        if (!profilePhone) return;
        const current = getValues();
        if (current.phone.trim()) return;
        reset({
          patientName: current.patientName,
          email: current.email,
          phone: profilePhone,
          notes: current.notes ?? "",
        });
        setPhoneError(
          isValidPhoneNumber(profilePhone)
            ? null
            : "Please enter a valid phone number.",
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, getValues, reset]);

  const [submitError, setSubmitError] = useState<SubmitErrorState>(null);
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const patientFormSectionRef = useRef<HTMLElement>(null);
  const slotsSectionRef = useRef<HTMLElement>(null);
  const dateCalendarSectionRef = useRef<HTMLHeadingElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookedConfirmation, setBookedConfirmation] = useState<{
    doctorName: string;
    appointmentDate: string;
    appointmentTime: string;
    patientName: string;
    patientEmail: string;
    consultationType: "CLINIC" | "ONLINE";
    doctorTimezone: string;
  } | null>(null);
  const [approxEquivalentLabel, setApproxEquivalentLabel] = useState<
    string | null
  >(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [holdingSlotKey, setHoldingSlotKey] = useState<string | null>(null);
  const [slotHoldAlert, setSlotHoldAlert] = useState<string | null>(null);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const holdIdRef = useRef<string | null>(null);
  const invalidateSlotsRef = useRef<() => void>(() => {});

  const readStoredHoldId = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(SLOT_HOLD_STORAGE_KEY);
  }, []);

  const writeStoredHoldId = useCallback((id: string | null) => {
    holdIdRef.current = id;
    setActiveHoldId(id);
    if (typeof window === "undefined") return;
    if (id) sessionStorage.setItem(SLOT_HOLD_STORAGE_KEY, id);
    else sessionStorage.removeItem(SLOT_HOLD_STORAGE_KEY);
  }, []);

  const releaseCurrentHold = useCallback(
    async (
      holdId?: string | null,
      options?: { keepalive?: boolean },
    ) => {
      const id = holdId ?? holdIdRef.current ?? readStoredHoldId();
      if (!id) return;
      writeStoredHoldId(null);
      try {
        await fetch("/api/slot-hold", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdId: id }),
          keepalive: options?.keepalive ?? false,
        });
      } catch {
        // best-effort
      } finally {
        invalidateSlotsRef.current();
      }
    },
    [readStoredHoldId, writeStoredHoldId],
  );

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => getDoctor(doctorId),
    enabled: !!doctorId,
  });
  const onlineConsultationAvailable =
    doctor?.onlineConsultationAvailable ?? false;

  useLayoutEffect(() => {
    if (consultationType === null) {
      setAvailabilityDateChunks([]);
      prevConsultationScopeRef.current = "";
      return;
    }
    const scope = `${doctorId}:${consultationType}`;
    if (prevConsultationScopeRef.current === scope) return;
    prevConsultationScopeRef.current = scope;
    const from = todayYmdInTimeZone(patientTimezone);
    setAvailabilityDateChunks([
      { from, to: addDaysToYmd(from, AVAILABILITY_RANGE_DAY_OFFSET) },
    ]);
    setSelectedDurationMinutes(null);
  }, [doctorId, consultationType, patientTimezone]);

  const availabilityDateQueries = useQueries({
    queries:
      consultationType !== null && availabilityDateChunks.length > 0
        ? availabilityDateChunks.map(({ from, to }) => ({
            queryKey: [
              "available-dates",
              doctorId,
              consultationType,
              from,
              to,
              patientTimezone,
            ] as const,
            queryFn: () =>
              getAvailableDatesChunk(
                doctorId,
                consultationType,
                from,
                to,
                patientTimezone,
              ),
            enabled: Boolean(doctorId),
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
  /** Full skeleton only before any dates are known — keeps calendar mounted when extending range. */
  const availabilityCalendarInitialLoading = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size === 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );
  const availabilityCalendarExtending = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size > 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );
  const doctorCurrency: SupportedCurrency = useMemo(
    () => coerceSupportedCurrency(doctor?.currency),
    [doctor?.currency],
  );
  const doctorPriceMap: ConsultationPriceCentsByDuration = useMemo(
    () => parsePriceMap(doctor?.consultationPriceCentsByDuration),
    [doctor?.consultationPriceCentsByDuration],
  );

  const dateForSlots = selectedDate;
  const slotsQueryKey = useMemo(
    () =>
      [
        "slots",
        doctorId,
        dateForSlots,
        consultationType,
        patientTimezone,
      ] as const,
    [doctorId, dateForSlots, consultationType, patientTimezone],
  );

  const {
    data: slotsData,
    isLoading: slotsLoading,
    isFetching: slotsFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: slotsQueryKey,
    queryFn: () =>
      getSlots(
        doctorId,
        dateForSlots,
        consultationType!,
        patientTimezone,
        holdIdRef.current ?? undefined,
      ),
    enabled: !!doctorId && !!dateForSlots && consultationType !== null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  invalidateSlotsRef.current = () => {
    void queryClient.invalidateQueries({ queryKey: slotsQueryKey });
  };

  // Date change only — not slot hold or background Pusher refetch (same query key).
  const slotsLoadingOrFetching =
    slotsLoading || (slotsFetching && isPlaceholderData);

  const shouldIgnoreOwnSlotUpdate = useCallback(
    (payload: SlotUpdatedPayload) => {
      if (
        holdingSlotKey !== null &&
        bookableSlotRefKey({
          doctorDate: payload.date,
          startTime: payload.time,
        }) === holdingSlotKey
      ) {
        return true;
      }
      return (
        activeHoldId !== null &&
        selectedSlot !== null &&
        payload.date === selectedSlot.doctorDate &&
        payload.time === selectedSlot.startTime
      );
    },
    [activeHoldId, selectedSlot, holdingSlotKey],
  );

  useDoctorSlotsPusher({
    doctorId,
    enabled: !!doctorId && consultationType !== null,
    shouldIgnoreSlotUpdate: shouldIgnoreOwnSlotUpdate,
    queryKeys: {
      slots: ["slots", doctorId],
      availableDates: ["available-dates", doctorId],
    },
  });

  const doctorTz = slotsData?.doctorTimezone ?? "UTC";
  const slotDurationMinutes = slotsData?.slotDurationMinutes ?? 30;
  const slotDetailByRef = useMemo<Map<string, SlotDetail>>(
    () =>
      new Map<string, SlotDetail>(
        (slotsData?.slotDetails ?? []).map((detail): [string, SlotDetail] => [
          bookableSlotRefKey({
            doctorDate: detail.doctorDate,
            startTime: detail.startTime,
          }),
          detail,
        ]),
      ),
    [slotsData?.slotDetails],
  );
  const bookableSlotRefs = useMemo<BookableSlotRef[]>(
    () =>
      (slotsData?.slotDetails ?? []).map((detail) => ({
        doctorDate: detail.doctorDate,
        startTime: detail.startTime,
      })),
    [slotsData?.slotDetails],
  );
  const slotExpiryTick = useSlotExpiryTick(consultationType !== null);
  const nonPastSlotRefs = useMemo(
    () =>
      bookableSlotRefs.filter(
        (ref) =>
          !isDoctorTimeInPast(ref.doctorDate, ref.startTime, doctorTz),
      ),
    [bookableSlotRefs, doctorTz, slotExpiryTick],
  );
  const selectedSlotDetail = selectedSlot
    ? (slotDetailByRef.get(bookableSlotRefKey(selectedSlot)) ?? null)
    : null;
  const selectedSlotDuration = selectedSlotDetail?.slotDurationMinutes ?? 15;
  const selectedSlotPriceCents = useMemo(
    () => priceCentsForDuration(doctorPriceMap, selectedSlotDuration),
    [doctorPriceMap, selectedSlotDuration],
  );
  const consultationPriceLabel = useMemo(
    () => formatPrice(selectedSlotPriceCents, doctorCurrency),
    [selectedSlotPriceCents, doctorCurrency],
  );
  const consultationPriceRangeLabel = useMemo(() => {
    const { minCents, maxCents } = doctorPriceRangeCents(doctorPriceMap);
    if (minCents === maxCents) {
      return formatPrice(minCents, doctorCurrency);
    }
    return `${formatPrice(minCents, doctorCurrency)} – ${formatPrice(maxCents, doctorCurrency)}`;
  }, [doctorPriceMap, doctorCurrency]);
  const displayedConsultationPriceLabel = selectedSlot
    ? consultationPriceLabel
    : consultationPriceRangeLabel;
  const patientCurrency = useMemo(() => patientCurrencyFromTimezone(), []);
  const shouldShowApproxEquivalent =
    !!selectedSlot && patientCurrency !== doctorCurrency;
  const selectedConsultationAllowed =
    consultationType !== null &&
    !!selectedSlot &&
    !!selectedSlotDetail &&
    (selectedSlotDetail.consultationType === "BOTH" ||
      selectedSlotDetail.consultationType === consultationType);

  const canPickDates =
    consultationType === "ONLINE" ||
    (consultationType === "CLINIC" && clinicPaymentMode !== null);

  const scrollToDateCalendar = useCallback(() => {
    requestAnimationFrame(() => {
      dateCalendarSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const selectConsultationType = useCallback(
    (next: PatientConsultationChoice) => {
      if (next === "ONLINE" && !onlineConsultationAvailable) return;
      if (consultationType !== null && consultationType !== next) {
        void releaseCurrentHold();
        setSlotHoldAlert(null);
        setSelectedSlot(null);
        setSelectedDate("");
        setSelectedDurationMinutes(null);
        void queryClient.invalidateQueries({
          queryKey: ["available-dates", doctorId],
        });
        void queryClient.removeQueries({ queryKey: ["slots", doctorId] });
      }
      if (next === "CLINIC") {
        setClinicPaymentMode(null);
      }
      setConsultationType(next);
      if (next === "ONLINE") {
        scrollToDateCalendar();
      }
    },
    [
      consultationType,
      doctorId,
      onlineConsultationAvailable,
      queryClient,
      releaseCurrentHold,
      scrollToDateCalendar,
    ],
  );

  const selectClinicPaymentMode = useCallback(
    (mode: "payNow" | "payAtClinic") => {
      if (clinicPaymentMode === mode) return;
      setClinicPaymentMode(mode);
      if (!selectedSlot) {
        scrollToDateCalendar();
      }
    },
    [clinicPaymentMode, selectedSlot, scrollToDateCalendar],
  );

  // Must use setConsultationType directly — selectConsultationType scrolls to calendar on ONLINE.
  useEffect(() => {
    if (onlineConsultationAvailable || consultationType !== "ONLINE") return;
    const slotType = selectedSlotDetail?.consultationType;
    if (slotType === "CLINIC" || slotType === "BOTH") {
      setConsultationType("CLINIC");
      return;
    }
    setConsultationType(null);
  }, [
    consultationType,
    onlineConsultationAvailable,
    selectedSlotDetail?.consultationType,
  ]);
  // Lock the email field when the patient is signed in so they can't book
  // under an email different from their account; the field is prefilled from
  // the session above.
  const isPatientSignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user?.email);

  const acquireSlotHold = useCallback(
    async (ref: BookableSlotRef) => {
      if (consultationType === null) return;
      const refKey = bookableSlotRefKey(ref);
      setSlotHoldAlert(null);
      setSubmitError(null);
      setHoldingSlotKey(refKey);

      try {
        const isSameSlot =
          selectedSlot !== null &&
          bookableSlotRefKey(selectedSlot) === refKey;

        if (selectedSlot && !isSameSlot) {
          await releaseCurrentHold();
        }

        let holdId = holdIdRef.current ?? readStoredHoldId();
        if (!holdId || !isSameSlot) {
          holdId = crypto.randomUUID();
        }

        writeStoredHoldId(holdId);

        const res = await fetch("/api/slot-hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctorId,
            date: ref.doctorDate,
            time: ref.startTime,
            consultationType,
            holdId,
          }),
        });

        const json = (await res.json().catch(() => ({}))) as {
          holdId?: string;
          error?: string;
        };

        if (!res.ok) {
          writeStoredHoldId(null);
          invalidateSlotsRef.current();
          setSlotHoldAlert(
            typeof json.error === "string"
              ? json.error
              : SLOT_NO_LONGER_AVAILABLE_MESSAGE,
          );
          return;
        }

        setSelectedSlot(ref);
        setSlotHoldAlert(null);
        invalidateSlotsRef.current();
      } catch {
        writeStoredHoldId(null);
        invalidateSlotsRef.current();
        setSlotHoldAlert("Network error. Please try again.");
      } finally {
        setHoldingSlotKey(null);
      }
    },
    [
      consultationType,
      doctorId,
      readStoredHoldId,
      releaseCurrentHold,
      selectedSlot,
      writeStoredHoldId,
    ],
  );

  const onPatientFormSubmit = useCallback(
    async (data: PatientFormValues) => {
      setSubmitError(null);
      setIsSubmitting(true);
      let didRedirect = false;
      try {
        if (consultationType === null || !selectedSlot) return;

        const doctorTimezone = slotsData?.doctorTimezone ?? "UTC";
        const doctorDate = selectedSlot.doctorDate;
        const doctorTime = selectedSlot.startTime;
        const holdId = holdIdRef.current ?? readStoredHoldId();

        const useBookingSessionCheckout =
          consultationType === "ONLINE" ||
          (consultationType === "CLINIC" && clinicPaymentMode === "payNow");

        if (consultationType === "CLINIC" && !useBookingSessionCheckout) {
          const res = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              doctorId,
              date: doctorDate,
              time: doctorTime,
              consultationType,
              availabilityId: selectedSlotDetail?.availabilityId ?? undefined,
              patientName: data.patientName,
              email: data.email,
              phone: data.phone,
              notes: data.notes ?? undefined,
              timezone: doctorTimezone,
              patientTimezone,
              ...(holdId ? { holdId } : {}),
            }),
          });

          const json = await res.json().catch(() => ({}));

          if (!res.ok) {
            const rawLink =
              json?.link &&
              typeof json.link.href === "string" &&
              typeof json.link.label === "string"
                ? { href: json.link.href, label: json.link.label }
                : undefined;
            const code =
              typeof json?.code === "string" ? json.code : undefined;
            const apiMessage =
              typeof json?.error === "string"
                ? json.error
                : "Failed to book appointment";
            const enriched = enrichGuestBookingError({
              code,
              sessionStatus,
              bookingEmail: data.email.trim(),
              apiMessage,
              link: rawLink,
            });
            setSubmitError({
              message: enriched.message,
              code,
              bookingEmail: data.email.trim(),
              link: enriched.link,
            });
            return;
          }

          setBookedConfirmation({
            doctorName: doctor?.name
              ? formatDoctorDisplayName(doctor.name)
              : "Your doctor",
            appointmentDate: doctorDate,
            appointmentTime: doctorTime,
            patientName: data.patientName,
            patientEmail: data.email,
            consultationType,
            doctorTimezone,
          });

          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          const bookingSessionRes = await fetch("/api/booking-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              doctorId,
              date: doctorDate,
              time: doctorTime,
              consultationType,
              availabilityId: selectedSlotDetail?.availabilityId ?? undefined,
              patientName: data.patientName,
              email: data.email,
              phone: data.phone,
              notes: data.notes,
              timezone: doctorTimezone,
              patientTimezone,
              ...(holdId ? { holdId } : {}),
            }),
          });

          const bookingSessionJson = await bookingSessionRes
            .json()
            .catch(() => null);

          if (!bookingSessionRes.ok || !bookingSessionJson?.bookingSessionId) {
            const rawLink =
              bookingSessionJson?.link &&
              typeof bookingSessionJson.link.href === "string" &&
              typeof bookingSessionJson.link.label === "string"
                ? {
                    href: bookingSessionJson.link.href,
                    label: bookingSessionJson.link.label,
                  }
                : undefined;
            const code =
              typeof bookingSessionJson?.code === "string"
                ? bookingSessionJson.code
                : undefined;
            const apiMessage =
              typeof bookingSessionJson?.error === "string"
                ? bookingSessionJson.error
                : "Failed to create booking session";
            const enriched = enrichGuestBookingError({
              code,
              sessionStatus,
              bookingEmail: data.email.trim(),
              apiMessage,
              link: rawLink,
            });
            setSubmitError({
              message: enriched.message,
              code,
              bookingEmail: data.email.trim(),
              link: enriched.link,
            });
            return;
          }

          const bookingSessionId = String(bookingSessionJson.bookingSessionId);

          redirectWithOverlay(
            router,
            `/book-appointment/review/${bookingSessionId}`,
          );
          didRedirect = true;
        }

        void queryClient.invalidateQueries({
          queryKey: ["slots", doctorId],
        });

        writeStoredHoldId(null);
        setSelectedSlot(null);
      } catch {
        setSubmitError({ message: "Network error. Please try again." });
      } finally {
        if (!didRedirect) setIsSubmitting(false);
      }
    },
    [
      doctorId,
      selectedDate,
      selectedSlot,
      selectedSlotDetail,
      consultationType,
      clinicPaymentMode,
      doctor?.name,
      slotsData?.doctorTimezone,
      patientTimezone,
      queryClient,
      redirectWithOverlay,
      router,
      readStoredHoldId,
      writeStoredHoldId,
      sessionStatus,
    ],
  );

  const durationFilteredSlots = useMemo(() => {
    if (selectedDurationMinutes === null) return nonPastSlotRefs;
    return nonPastSlotRefs.filter((ref) => {
      const detail = slotDetailByRef.get(bookableSlotRefKey(ref));
      const dur = detail?.slotDurationMinutes ?? slotDurationMinutes;
      return dur === selectedDurationMinutes;
    });
  }, [
    nonPastSlotRefs,
    selectedDurationMinutes,
    slotDetailByRef,
    slotDurationMinutes,
  ]);
  const uniqueSlotDurationsMinutes = useMemo(() => {
    const set = new Set<number>();
    for (const ref of nonPastSlotRefs) {
      const detail = slotDetailByRef.get(bookableSlotRefKey(ref));
      const dur = detail?.slotDurationMinutes ?? slotDurationMinutes;
      set.add(dur);
    }
    return [...set].sort((a, b) => a - b);
  }, [nonPastSlotRefs, slotDetailByRef, slotDurationMinutes]);
  const filteredDurationLabel = useMemo(() => {
    const durations = [
      ...new Set(
        nonPastSlotRefs
          .map((ref) => slotDetailByRef.get(bookableSlotRefKey(ref))?.slotDurationMinutes)
          .filter(
            (duration): duration is number => typeof duration === "number",
          ),
      ),
    ].sort((a, b) => a - b);
    const labelNoun =
      nonPastSlotRefs.length === 1 ? "appointment" : "appointments";
    if (durations.length === 0)
      return `${slotDurationMinutes}-minute ${labelNoun}`;
    if (durations.length === 1) return `${durations[0]}-minute ${labelNoun}`;
    return `${durations.join(" / ")}-minute ${labelNoun}`;
  }, [nonPastSlotRefs, slotDetailByRef, slotDurationMinutes]);

  useEffect(() => {
    if (!selectedSlot) return;
    if (holdingSlotKey !== null || slotsLoadingOrFetching) return;

    const key = bookableSlotRefKey(selectedSlot);
    const stillAvailable = durationFilteredSlots.some(
      (ref) => bookableSlotRefKey(ref) === key,
    );
    if (stillAvailable) {
      setSlotHoldAlert((prev) =>
        prev === SLOT_NO_LONGER_AVAILABLE_MESSAGE ? null : prev,
      );
      return;
    }

    void releaseCurrentHold();
    setSelectedSlot(null);
    setSlotHoldAlert(SLOT_NO_LONGER_AVAILABLE_MESSAGE);
  }, [
    selectedSlot,
    durationFilteredSlots,
    releaseCurrentHold,
    holdingSlotKey,
    slotsLoadingOrFetching,
  ]);

  useEffect(() => {
    setSubmitError(null);
    if (!selectedDate) return;
    setSlotHoldAlert(null);
    void releaseCurrentHold();
    setSelectedSlot(null);
  }, [selectedDate, releaseCurrentHold]);

  useEffect(() => {
    const onPageHide = () => {
      void releaseCurrentHold(undefined, { keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [releaseCurrentHold]);

  useEffect(() => {
    return () => {
      const holdId = holdIdRef.current ?? readStoredHoldId();
      if (!holdId) return;
      void releaseCurrentHold(holdId, { keepalive: true });
    };
  }, [releaseCurrentHold, readStoredHoldId]);

  useEffect(() => {
    if (!submitError) return;
    submitErrorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    submitErrorRef.current?.focus({ preventScroll: true });
  }, [submitError]);

  useEffect(() => {
    if (!selectedSlot || consultationType === null) return;
    patientFormSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [selectedSlot, consultationType]);

  useEffect(() => {
    if (availabilityCalendarFetching) return;
    if (enabledDateSet.size === 0) return;
    if (!selectedDate) return;
    if (enabledDateSet.has(selectedDate)) return;
    void releaseCurrentHold();
    setSlotHoldAlert(DATE_NO_LONGER_AVAILABLE_MESSAGE);
    setSelectedDate("");
    setSelectedSlot(null);
    setSelectedDurationMinutes(null);
  }, [
    availabilityCalendarFetching,
    enabledDateSet,
    selectedDate,
    releaseCurrentHold,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadApproxEquivalent() {
      setApproxEquivalentLabel(null);
      if (!selectedSlot) return;
      if (!shouldShowApproxEquivalent) return;
      try {
        const convertedCents = await convertCentsAmount(
          selectedSlotPriceCents,
          doctorCurrency,
          patientCurrency,
        );
        if (!cancelled) {
          setApproxEquivalentLabel(
            `(approx ${formatPrice(convertedCents, patientCurrency)})`,
          );
        }
      } catch {
        // Best-effort only: skip conversion if API fails.
      }
    }
    void loadApproxEquivalent();
    return () => {
      cancelled = true;
    };
  }, [
    selectedSlot,
    consultationType,
    shouldShowApproxEquivalent,
    patientCurrency,
    doctorCurrency,
    selectedSlotPriceCents,
    setApproxEquivalentLabel,
  ]);

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

  const onCalendarSelect = useCallback((ymd: string) => {
    setSlotHoldAlert(null);
    setSelectedDate(ymd);
    setSelectedSlot(null);
    setSelectedDurationMinutes(null);
    requestAnimationFrame(() => {
      slotsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const phoneInputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";

  const confirmationMessage =
    "Your appointment has been confirmed. A confirmation email has been sent to your inbox. Please arrive a few minutes early.";

  return (
    <div className="w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        {bookedConfirmation ? (
          <section className="mx-auto max-w-xl">
            <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
              <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                Appointment confirmed
              </h2>
              <p className="mt-4 font-montserrat text-sm text-[#5E5E5E]">
                {confirmationMessage}
              </p>
              <div className="mt-6 flex flex-col gap-2 rounded-lg bg-[#fafafa] p-4 font-montserrat text-sm">
                <p>
                  <span className="font-medium text-[#111111]">Doctor:</span>{" "}
                  <span className="text-[#333333]">
                    {bookedConfirmation.doctorName}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-[#111111]">Date:</span>{" "}
                  <span className="text-[#333333]">
                    {formatDateInPatientTz(
                      bookedConfirmation.appointmentDate,
                      bookedConfirmation.appointmentTime,
                      bookedConfirmation.doctorTimezone,
                    )}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-[#111111]">Time:</span>{" "}
                  <span className="text-[#333333]">
                    {formatTimeInPatientTz(
                      bookedConfirmation.appointmentDate,
                      bookedConfirmation.appointmentTime,
                      bookedConfirmation.doctorTimezone,
                    )}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-[#111111]">Patient:</span>{" "}
                  <span className="text-[#333333]">
                    {bookedConfirmation.patientName}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-[#111111]">
                    Consultation:
                  </span>{" "}
                  <span className="text-[#333333]">
                    {bookedConfirmation.consultationType === "ONLINE"
                      ? "Online consultation"
                      : "Clinic visit"}
                  </span>
                </p>
              </div>
              <PostAppointmentActions
                emailHint={bookedConfirmation.patientEmail}
              />
            </div>
          </section>
        ) : (
          <>
            {/* 1. Doctor Summary */}
            <section className="mb-10 md:mb-12">
              <div className="flex flex-col gap-2 text-left">
                <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                  Doctor
                </h2>
              </div>
              {doctorLoading && (
                <div className="mt-4 flex flex-col gap-2">
                  <Skeleton className="h-7 w-48 md:h-8 bg-[#e5e5e5]" />
                  <Skeleton className="h-5 w-36 bg-[#e5e5e5]" />
                </div>
              )}
              {!doctorLoading && doctor && (
                <div className="mt-4 flex flex-col gap-1">
                  <span className="font-montaga text-lg text-[#111111] md:text-xl">
                    {formatDoctorDisplayName(doctor.name)}
                  </span>
                  <span className="font-montserrat text-sm text-[#5E5E5E]">
                    {doctor.specialization}
                  </span>
                </div>
              )}
              {!doctorLoading && !doctor && doctorId && (
                <p className="mt-4 font-montserrat text-sm text-red-600">
                  Doctor not found.
                </p>
              )}
            </section>

            {/* 2. Consultation type */}
            <section className="mb-10 md:mb-12">
              <div className="flex flex-col gap-2 text-left">
                <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                  Consultation type
                </h2>
                <p className="font-montserrat text-sm text-[#5E5E5E]">
                  Choose how you would like to meet your doctor.
                </p>
              </div>
              <div className="mt-4 max-w-md grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={
                    consultationType === "CLINIC" ? "default" : "outline"
                  }
                  className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
                  aria-pressed={consultationType === "CLINIC"}
                  onClick={() => selectConsultationType("CLINIC")}
                >
                  Clinic Visit
                </Button>
                <Button
                  type="button"
                  variant={
                    consultationType === "ONLINE" ? "default" : "outline"
                  }
                  className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base disabled:cursor-not-allowed disabled:opacity-50"
                  aria-pressed={consultationType === "ONLINE"}
                  aria-disabled={!onlineConsultationAvailable}
                  disabled={!onlineConsultationAvailable}
                  onClick={() => selectConsultationType("ONLINE")}
                >
                  Online Consultation
                </Button>
              </div>
              {!onlineConsultationAvailable && (
                <p className="mt-3 font-montserrat text-sm text-[#5E5E5E]">
                  Online consultations are temporarily unavailable for this
                  doctor.
                </p>
              )}
              {selectedSlotDetail?.consultationType === "BOTH" && (
                <p className="mt-3 font-montserrat text-sm text-[#5E5E5E]">
                  This slot supports both clinic and online consultations.
                </p>
              )}

              {consultationType !== null && (
                <div className="mt-5 max-w-md">
                  <p className="font-montserrat text-sm font-medium text-[#111111]">
                    Payment
                  </p>
                  {consultationType === "CLINIC" ? (
                    <>
                      <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                        Pay securely online now, or pay when you arrive at the
                        clinic.
                      </p>
                      {clinicPaymentMode === null ? (
                        <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                          Select a payment option to continue.
                        </p>
                      ) : null}
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant={
                            clinicPaymentMode === "payAtClinic"
                              ? "default"
                              : "outline"
                          }
                          className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
                          aria-pressed={clinicPaymentMode === "payAtClinic"}
                          onClick={() => selectClinicPaymentMode("payAtClinic")}
                        >
                          Pay at clinic
                        </Button>
                        <Button
                          type="button"
                          variant={
                            clinicPaymentMode === "payNow"
                              ? "default"
                              : "outline"
                          }
                          className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
                          aria-pressed={clinicPaymentMode === "payNow"}
                          onClick={() => selectClinicPaymentMode("payNow")}
                        >
                          Pay now
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
                      Online consultations require advance payment.
                    </p>
                  )}
                </div>
              )}

              {consultationType !== null && (
                <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                  {consultationType === "CLINIC"
                    ? clinicPaymentMode === null
                      ? "Choose how you'll pay to see consultation fee."
                      : clinicPaymentMode === "payAtClinic"
                        ? `Consultation fee (payable at clinic): ${displayedConsultationPriceLabel}${shouldShowApproxEquivalent && approxEquivalentLabel ? ` ${approxEquivalentLabel}` : ""}`
                        : `Consultation fee (pay online): ${displayedConsultationPriceLabel}${shouldShowApproxEquivalent && approxEquivalentLabel ? ` ${approxEquivalentLabel}` : ""}`
                    : `Online consultation fee: ${displayedConsultationPriceLabel}${shouldShowApproxEquivalent && approxEquivalentLabel ? ` ${approxEquivalentLabel}` : ""}`}
                </p>
              )}
            </section>

            {/* 3. Date calendar */}
            <section className="mb-10 md:mb-12">
              <div className="flex flex-col gap-2 text-left">
                <h2
                  ref={dateCalendarSectionRef}
                  className="scroll-mt-24 font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl"
                >
                  Select date
                </h2>
                {consultationType === null ? (
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    Choose clinic or online above to see which dates are
                    available.
                  </p>
                ) : consultationType === "CLINIC" &&
                  clinicPaymentMode === null ? (
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    Choose how you&apos;ll pay above to see available dates.
                  </p>
                ) : null}
              </div>
              {consultationType !== null &&
              canPickDates &&
              availabilityCalendarInitialLoading ? (
                <div className="mt-4">
                  <Skeleton className="h-[340px] w-full max-w-sm rounded-xl bg-[#e5e5e5]" />
                </div>
              ) : consultationType !== null &&
                canPickDates &&
                enabledDateSet.size === 0 ? (
                <p className="mt-4 font-montserrat text-sm text-[#5E5E5E]">
                  This doctor has no upcoming availability for this consultation
                  type yet. Please try again later, pick the other option, or
                  choose another doctor.
                </p>
              ) : (
                <div className="mt-4">
                  <SetAvailabilityCalendar
                    value={selectedDate}
                    minDate={minDate}
                    disabledDates={new Set()}
                    enabledDates={
                      canPickDates ? enabledDateSet : new Set<string>()
                    }
                    loadingDisabledDates={false}
                    readOnly={!canPickDates}
                    gridAriaLabel={
                      consultationType === null
                        ? "Calendar preview — choose consultation type to select a date"
                        : consultationType === "CLINIC" &&
                            clinicPaymentMode === null
                          ? "Choose a payment option to select a date"
                          : "Select appointment date"
                    }
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
              {canPickDates ? (
                <p className="mt-3 max-w-sm font-montserrat text-xs leading-relaxed text-[#5E5E5E] md:text-sm">
                  Greyed-out dates are not available to book here — the day may
                  be full, the doctor may not be scheduled, or the date may
                  already be in the past.
                </p>
              ) : null}
            </section>

            {/* 4. Time Slot Grid */}
            {canPickDates && (
              <section ref={slotsSectionRef}>
                <div className="flex flex-col gap-2 text-left">
                  <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                    Available times
                  </h2>
                  {!slotsLoadingOrFetching && (
                    <p className="font-montserrat text-sm text-[#5E5E5E]">
                      {filteredDurationLabel}
                    </p>
                  )}
                  {!slotsLoadingOrFetching &&
                    uniqueSlotDurationsMinutes.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={
                            selectedDurationMinutes === null
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className="cursor-pointer h-8 rounded-full px-3 font-montserrat text-xs font-medium md:text-sm"
                          aria-pressed={selectedDurationMinutes === null}
                          onClick={() => setSelectedDurationMinutes(null)}
                        >
                          All lengths
                        </Button>
                        {uniqueSlotDurationsMinutes.map((mins) => (
                          <Button
                            key={mins}
                            type="button"
                            variant={
                              selectedDurationMinutes === mins
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className="cursor-pointer h-8 rounded-full px-3 font-montserrat text-xs font-medium md:text-sm"
                            aria-pressed={selectedDurationMinutes === mins}
                            onClick={() => setSelectedDurationMinutes(mins)}
                          >
                            {mins} min
                          </Button>
                        ))}
                      </div>
                    )}
                </div>

                {slotHoldAlert ? (
                  <p
                    className="mt-4 font-montserrat text-sm text-destructive"
                    role="alert"
                  >
                    {slotHoldAlert}
                  </p>
                ) : null}

                {slotsLoadingOrFetching && (
                  <p
                    className="mt-4 font-montserrat text-sm text-[#5E5E5E]"
                    aria-live="polite"
                  >
                    Loading available times…
                  </p>
                )}

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

                {!slotsLoadingOrFetching && !selectedDate && (
                  <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                    Select a date above to see available times.
                  </p>
                )}

                {!slotsLoadingOrFetching &&
                  selectedDate &&
                  durationFilteredSlots.length === 0 && (
                    <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                      No slots available for this date.
                    </p>
                  )}

                {!slotsLoadingOrFetching &&
                  selectedDate &&
                  durationFilteredSlots.length > 0 && (
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
                      {durationFilteredSlots.map((ref) => {
                        const detail = slotDetailByRef.get(
                          bookableSlotRefKey(ref),
                        );
                        const durationForTile =
                          detail?.slotDurationMinutes ?? slotDurationMinutes;
                        const refKey = bookableSlotRefKey(ref);
                        const isSelected =
                          selectedSlot !== null &&
                          bookableSlotRefKey(selectedSlot) === refKey;
                        const isHolding = holdingSlotKey === refKey;
                        return (
                          <Button
                            key={refKey}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer h-11 rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
                            disabled={isHolding}
                            onClick={() => void acquireSlotHold(ref)}
                          >
                            {isHolding
                              ? "Reserving…"
                              : `${formatTimeInPatientTz(ref.doctorDate, ref.startTime, doctorTz, patientTimezone)} · ${durationForTile} min`}
                          </Button>
                        );
                      })}
                    </div>
                  )}
              </section>
            )}

            {/* 4. Patient information form (after slot selected) */}
            {selectedSlot && consultationType !== null && (
              <section ref={patientFormSectionRef} className="mt-10 md:mt-12">
                <div className="flex flex-col gap-2 text-left">
                  <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                    Patient information
                  </h2>
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    Selected slot:{" "}
                    {selectedSlot
                      ? `${formatDateInPatientTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz, patientTimezone)} · ${formatTimeInPatientTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz, patientTimezone)} · ${selectedSlotDuration} min`
                      : ""}
                  </p>
                </div>
                <form
                  onSubmit={handleSubmit(onPatientFormSubmit)}
                  className="mt-6 flex max-w-xl flex-col gap-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="patientName"
                      className="font-montserrat text-sm font-medium text-[#111111]"
                    >
                      Full Name
                    </label>
                    <input
                      id="patientName"
                      type="text"
                      {...register("patientName")}
                      className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 font-montserrat text-sm text-[#111111] shadow-sm focus:border-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 md:py-2.5"
                      placeholder="Enter your full name"
                    />
                    {errors.patientName && (
                      <p className="font-montserrat text-sm text-red-600">
                        {errors.patientName.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="email"
                      className="font-montserrat text-sm font-medium text-[#111111]"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      {...register("email")}
                      readOnly={isPatientSignedIn}
                      aria-readonly={isPatientSignedIn}
                      className={`rounded-xl border border-[#e5e5e5] px-4 py-3 font-montserrat text-sm text-[#111111] shadow-sm focus:border-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 md:py-2.5 ${
                        isPatientSignedIn
                          ? "bg-[#f5f5f5] cursor-not-allowed"
                          : "bg-white"
                      }`}
                      placeholder="you@example.com"
                    />
                    {errors.email && (
                      <p className="font-montserrat text-sm text-red-600">
                        {errors.email.message}
                      </p>
                    )}
                    {isPatientSignedIn && (
                      <p className="font-montserrat text-xs text-[#5E5E5E]">
                        Email is linked to your appointment history and cannot
                        be changed.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="phone"
                      className="font-montserrat text-sm font-medium text-[#111111]"
                    >
                      Phone Number
                    </label>
                    <Controller
                      control={control}
                      name="phone"
                      render={({ field }) => (
                        <PhoneInput
                          id="phone"
                          international
                          defaultCountry="US"
                          value={field.value || undefined}
                          onChange={(value) => {
                            field.onChange(value ?? "");
                            setPhoneError(null);
                          }}
                          onBlur={() => {
                            field.onBlur();
                            const trimmed = (getValues("phone") ?? "").trim();
                            if (!trimmed) {
                              setPhoneError("Phone number is required.");
                              return;
                            }
                            setPhoneError(
                              isValidPhoneNumber(trimmed)
                                ? null
                                : "Please enter a valid phone number.",
                            );
                          }}
                          className={phoneInputClassName}
                        />
                      )}
                    />
                    {phoneError ? (
                      <p className="font-montserrat text-sm text-red-600">
                        {phoneError}
                      </p>
                    ) : null}
                    {errors.phone && !phoneError && (
                      <p className="font-montserrat text-sm text-red-600">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="notes"
                      className="font-montserrat text-sm font-medium text-[#111111]"
                    >
                      Notes <span className="text-[#5E5E5E]">(optional)</span>
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      {...register("notes")}
                      className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 font-montserrat text-sm text-[#111111] shadow-sm focus:border-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 md:py-2.5"
                      placeholder="Any additional notes for the doctor"
                    />
                    {errors.notes && (
                      <p className="font-montserrat text-sm text-red-600">
                        {errors.notes.message}
                      </p>
                    )}
                  </div>
                  {submitError && (
                    <div
                      ref={submitErrorRef}
                      role="alert"
                      tabIndex={-1}
                      className="font-montserrat text-sm text-red-600 outline-none"
                    >
                      <p>{renderSubmitErrorMessage(submitError)}</p>
                    </div>
                  )}
                  {consultationType !== null ? (
                    <ReschedulePolicyNotice className="mt-4" />
                  ) : null}
                  <Button
                    disabled={
                      !isValid ||
                      isSubmitting ||
                      !selectedConsultationAllowed ||
                      Boolean(phoneError) ||
                      (consultationType === "CLINIC" && clinicPaymentMode === null)
                    }
                    type="submit"
                    className="mt-2 w-full cursor-pointer rounded-xl font-montserrat text-sm font-medium sm:px-8"
                  >
                    {isSubmitting
                      ? "Booking…"
                      : consultationType === "ONLINE" ||
                          (consultationType === "CLINIC" &&
                            clinicPaymentMode === "payNow")
                        ? "Continue to payment"
                        : "Confirm appointment"}
                  </Button>
                </form>
              </section>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
