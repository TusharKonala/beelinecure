"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Calendar, CheckCircle2, Loader2 } from "lucide-react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  currencyForTimezone,
} from "@/lib/currency";
import {
  type ConsultationPriceCentsByDuration,
  DEFAULT_CONSULTATION_PRICE_CENTS_BY_DURATION,
} from "@/lib/doctor-pricing";
import { uploadDoctorPhoto } from "@/lib/uploads/uploadDoctorPhoto";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import { SELECT_CHEVRON } from "@/lib/select-styles";
import { DoctorPhotoCropper } from "@/components/doctor/DoctorPhotoCropper";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import {
  DOCTOR_BIO_MAX_CHARS,
  isOverCharLimit,
} from "@/lib/text-char-limit";

const DURATION_KEYS = ["15", "30", "45", "60"] as const;
type DurationKey = (typeof DURATION_KEYS)[number];

type DoctorSettings = {
  id: string;
  email: string;
  hasPassword: boolean;
  name: string;
  phone: string | null;
  specialization: string;
  qualification: string | null;
  licenseNumber: string;
  yearsExperience: number | null;
  bio: string | null;
  profilePhotoUrl: string;
  timezone: string;
  currency: SupportedCurrency;
  consultationPriceCentsByDuration: ConsultationPriceCentsByDuration;
};

type PriceInputs = Record<DurationKey, string>;
type DoctorSnapshot = {
  name: string;
  phone: string;
  specialization: string;
  qualification: string;
  licenseNumber: string;
  yearsExperience: string;
  bio: string;
  profilePhotoUrl: string;
  timezone: string;
  currency: SupportedCurrency;
  priceInputs: PriceInputs;
};

function priceMapToInputs(map: ConsultationPriceCentsByDuration): PriceInputs {
  return {
    "15": (map["15"] / 100).toFixed(2),
    "30": (map["30"] / 100).toFixed(2),
    "45": (map["45"] / 100).toFixed(2),
    "60": (map["60"] / 100).toFixed(2),
  };
}

function normaliseDoctorSnapshot(
  doctor: DoctorSettings,
  priceInputs: PriceInputs,
  profilePhotoUrlOverride?: string,
): DoctorSnapshot {
  return {
    name: doctor.name.trim(),
    phone: (doctor.phone ?? "").trim(),
    specialization: doctor.specialization.trim(),
    qualification: (doctor.qualification ?? "").trim(),
    licenseNumber: doctor.licenseNumber.trim(),
    yearsExperience:
      doctor.yearsExperience == null ? "" : String(doctor.yearsExperience),
    bio: (doctor.bio ?? "").trim(),
    profilePhotoUrl: (profilePhotoUrlOverride ?? doctor.profilePhotoUrl).trim(),
    timezone: doctor.timezone.trim(),
    currency: doctor.currency,
    priceInputs: {
      "15": priceInputs["15"].trim(),
      "30": priceInputs["30"].trim(),
      "45": priceInputs["45"].trim(),
      "60": priceInputs["60"].trim(),
    },
  };
}

function TimezoneChangeConfirmDialog({
  open,
  newTimezone,
  onClose,
  onConfirm,
  confirming,
}: {
  open: boolean;
  newTimezone: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  confirming: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirming) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, confirming]);

  if (!open || !mounted) return null;

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40"
        aria-label="Close"
        onClick={() => {
          if (!confirming) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timezone-change-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-lg"
      >
        <h2
          id="timezone-change-title"
          className="font-montserrat text-base font-semibold text-[#333333]"
        >
          Change practice timezone?
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-montserrat text-sm text-[#5E5E5E]">
          <li>
            Existing appointments will not use your new timezone. Each one keeps
            the timezone from when the patient booked. You can see each
            appointment&apos;s timezone on your Appointments tab.
          </li>
          <li>
            Your new timezone (
            <span className="font-medium text-[#333333]">{newTimezone}</span>)
            will apply to your open hours and bookable slots from now on.
          </li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={confirming}
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-[#e5e5e5] px-4 py-2 font-montserrat text-sm font-medium text-[#333333] hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={() => void onConfirm()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2555F3] px-4 py-2 font-montserrat text-sm font-medium text-white hover:bg-[#1e44c7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming && <Loader2 className="size-4 animate-spin" />}
            {confirming ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

export function DoctorSettingsClient({
  initialDoctor,
  connected,
}: {
  initialDoctor: DoctorSettings;
  connected: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calendarStatus = searchParams.get("calendar");
  const [doctor, setDoctor] = useState(initialDoctor);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [pendingCropImageUrl, setPendingCropImageUrl] = useState<string | null>(
    null,
  );
  const [pendingCropFileName, setPendingCropFileName] = useState<string | null>(
    null,
  );
  const [photoUploadPending, setPhotoUploadPending] = useState(false);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [isCalendarConnected, setIsCalendarConnected] = useState(connected);
  const [priceInputs, setPriceInputs] = useState<PriceInputs>(() =>
    priceMapToInputs(initialDoctor.consultationPriceCentsByDuration),
  );
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<
    string | null
  >(null);
  const [initialSnapshot, setInitialSnapshot] = useState<DoctorSnapshot>(() =>
    normaliseDoctorSnapshot(
      initialDoctor,
      priceMapToInputs(initialDoctor.consultationPriceCentsByDuration),
    ),
  );
  const [showTimezoneConfirm, setShowTimezoneConfirm] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  // Sticky flag — once the doctor edits the currency manually, we never
  // overwrite it from a timezone change.
  const isCurrencyManuallySetRef = useRef(false);

  const banner = useMemo(() => {
    if (calendarStatus === "connected" && isCalendarConnected) {
      return {
        tone: "success" as const,
        message:
          "Google Calendar connected. Online appointments will include a Meet link.",
      };
    }
    if (calendarStatus === "denied") {
      return {
        tone: "warning" as const,
        message:
          "Google Calendar connection was cancelled. You can try again any time.",
      };
    }
    if (calendarStatus === "error") {
      return {
        tone: "error" as const,
        message:
          "We could not finish connecting Google Calendar. Please try again.",
      };
    }
    return null;
  }, [calendarStatus, isCalendarConnected]);

  const currentSnapshot = useMemo(() => {
    const profilePhotoUrl = profilePhotoFile
      ? (selectedPhotoPreviewUrl ?? doctor.profilePhotoUrl)
      : doctor.profilePhotoUrl;
    return normaliseDoctorSnapshot(doctor, priceInputs, profilePhotoUrl);
  }, [doctor, priceInputs, profilePhotoFile, selectedPhotoPreviewUrl]);

  const isDirty =
    JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshot);

  const selectedCurrencyLabel = CURRENCY_LABELS[doctor.currency];
  const hasDarkNCurrencyText = selectedCurrencyLabel.includes("N");

  useEffect(() => {
    if (!profilePhotoFile) {
      setSelectedPhotoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(profilePhotoFile);
    setSelectedPhotoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhotoFile]);

  useEffect(() => {
    setIsCalendarConnected(connected);
  }, [connected]);

  function handleTimezoneChange(nextTimezone: string) {
    setSaveError(null);
    setSaveSuccess(null);
    setDoctor((prev) => {
      const next: DoctorSettings = { ...prev, timezone: nextTimezone };
      if (!isCurrencyManuallySetRef.current) {
        next.currency = currencyForTimezone(nextTimezone);
      }
      return next;
    });
  }

  function handleCurrencyChange(nextCurrency: SupportedCurrency) {
    isCurrencyManuallySetRef.current = true;
    setSaveError(null);
    setSaveSuccess(null);
    setDoctor((prev) => ({ ...prev, currency: nextCurrency }));
  }

  function updatePriceInput(duration: DurationKey, value: string) {
    setSaveError(null);
    setSaveSuccess(null);
    setPriceInputs((prev) => ({ ...prev, [duration]: value }));
  }

  function normalisePriceInput(duration: DurationKey) {
    const parsed = Number(priceInputs[duration].trim());
    setSaveError(null);
    setSaveSuccess(null);
    if (Number.isFinite(parsed) && parsed > 0) {
      setPriceInputs((prev) => ({ ...prev, [duration]: parsed.toFixed(2) }));
    }
  }

  async function onSave() {
    setSavePending(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const parsedPrices: ConsultationPriceCentsByDuration = {
        "15": 0,
        "30": 0,
        "45": 0,
        "60": 0,
      };
      for (const duration of DURATION_KEYS) {
        const parsed = Number(priceInputs[duration].trim());
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setSaveError(
            `Please enter a valid price for the ${duration}-minute consultation.`,
          );
          return;
        }
        parsedPrices[duration] = Math.round(parsed * 100);
      }

      const yearsExperience =
        doctor.yearsExperience === null
          ? null
          : Number.isFinite(doctor.yearsExperience)
            ? doctor.yearsExperience
            : null;
      let resolvedProfilePhotoUrl = doctor.profilePhotoUrl;
      if (profilePhotoFile) {
        setPhotoUploadPending(true);
        try {
          resolvedProfilePhotoUrl = await uploadDoctorPhoto(profilePhotoFile);
        } finally {
          setPhotoUploadPending(false);
        }
      }
      const requiredError = !doctor.name.trim()
        ? "Name is required."
        : !doctor.phone?.trim()
          ? "Phone is required."
          : !doctor.specialization.trim()
            ? "Specialization is required."
            : !(doctor.qualification ?? "").trim()
              ? "Degree / qualification is required."
              : !doctor.licenseNumber.trim()
                ? "License number is required."
                : !doctor.timezone.trim()
                  ? "Practice timezone is required."
                  : !doctor.currency.trim()
                    ? "Currency is required."
                    : !resolvedProfilePhotoUrl.trim()
                      ? "Profile photo is required."
                      : null;
      if (requiredError) {
        setSaveError(requiredError);
        return;
      }
      const trimmedPhone = (doctor.phone ?? "").trim();
      if (!isValidPhoneNumber(trimmedPhone)) {
        setPhoneError("Please enter a valid phone number.");
        setSaveError("Please enter a valid phone number.");
        return;
      }
      const res = await fetch("/api/doctor/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: doctor.name,
          phone: doctor.phone?.trim() ?? "",
          specialization: doctor.specialization,
          qualification: doctor.qualification?.trim() ?? "",
          licenseNumber: doctor.licenseNumber,
          yearsExperience,
          bio: doctor.bio,
          profilePhotoUrl: resolvedProfilePhotoUrl,
          timezone: doctor.timezone,
          currency: doctor.currency,
          consultationPriceCentsByDuration: parsedPrices,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        doctor?: DoctorSettings;
      };
      if (!res.ok) {
        setSaveError(json.error ?? "Failed to save settings.");
        return;
      }
      if (json.doctor) {
        const nextDoctor = {
          ...json.doctor,
          email: doctor.email,
          hasPassword: doctor.hasPassword,
        };
        const nextPrices = priceMapToInputs(
          json.doctor.consultationPriceCentsByDuration ??
            DEFAULT_CONSULTATION_PRICE_CENTS_BY_DURATION,
        );
        setDoctor(nextDoctor);
        setProfilePhotoFile(null);
        if (profilePhotoInputRef.current) {
          profilePhotoInputRef.current.value = "";
        }
        setPriceInputs(nextPrices);
        setInitialSnapshot(
          normaliseDoctorSnapshot(
            nextDoctor,
            nextPrices,
            resolvedProfilePhotoUrl,
          ),
        );
      }
      setSaveSuccess("Settings saved.");
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setSavePending(false);
    }
  }

  function handleSaveClick() {
    if (doctor.timezone.trim() !== initialSnapshot.timezone) {
      setShowTimezoneConfirm(true);
      return;
    }
    void onSave();
  }

  async function onDisconnect() {
    setDisconnectPending(true);
    setDisconnectError(null);
    try {
      const res = await fetch("/api/doctor/google-calendar/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDisconnectError(
          data.error ?? "Unable to disconnect. Please try again.",
        );
        return;
      }
      setIsCalendarConnected(false);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("calendar");
      const queryString = nextParams.toString();
      router.replace(
        queryString ? `/doctor/settings?${queryString}` : "/doctor/settings",
      );
      router.refresh();
    } finally {
      setDisconnectPending(false);
    }
  }

  async function onSendPasswordReset() {
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: doctor.email }),
      });
      setSaveSuccess(
        doctor.hasPassword
          ? "Password reset link sent to your email."
          : "Password setup link sent to your email.",
      );
    } catch {
      setSaveError("Could not send password email.");
    }
  }

  const inputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm outline-none placeholder:text-[#5E5E5E]/70 focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20";
  const phoneInputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";
  const selectClassName = `${inputClassName} cursor-pointer pr-10 ${SELECT_CHEVRON}`;
  const profilePhotoPreviewSrc =
    selectedPhotoPreviewUrl ?? doctor.profilePhotoUrl;
  const isPhoneInvalid = Boolean(phoneError);
  const bioOverLimit = isOverCharLimit(doctor.bio ?? "", DOCTOR_BIO_MAX_CHARS);

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
            Settings
          </h1>

          {banner && (
            <div
              className={`mt-6 flex items-start gap-2 rounded-xl border px-3 py-2 font-montserrat text-sm ${
                banner.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : banner.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {banner.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              )}
              <p>{banner.message}</p>
            </div>
          )}

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Name <span className="text-red-600">*</span>
              </label>
              <input
                value={doctor.name}
                onChange={(e) =>
                  (setSaveError(null),
                  setSaveSuccess(null),
                  setDoctor((prev) => ({ ...prev, name: e.target.value })))
                }
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Email
              </label>
              <input
                value={doctor.email}
                disabled
                className={`${inputClassName} bg-[#fafafa] text-[#5E5E5E]`}
              />
              <p className="font-montserrat text-xs text-[#5E5E5E]">
                Email is linked to your appointment history and cannot be
                changed.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Specialization <span className="text-red-600">*</span>
              </label>
              <select
                value={doctor.specialization}
                onChange={(e) =>
                  (setSaveError(null),
                  setSaveSuccess(null),
                  setDoctor((prev) => ({
                    ...prev,
                    specialization: e.target.value,
                  })))
                }
                className={selectClassName}
              >
                <option value="" disabled>
                  Select a specialization
                </option>
                {DOCTOR_SPECIALIZATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Degree / Qualification <span className="text-red-600">*</span>
              </label>
              <input
                placeholder="e.g. MBBS, MD"
                value={doctor.qualification ?? ""}
                onChange={(e) =>
                  (setSaveError(null),
                  setSaveSuccess(null),
                  setDoctor((prev) => ({
                    ...prev,
                    qualification: e.target.value,
                  })))
                }
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                License number <span className="text-red-600">*</span>
              </label>
              <input
                value={doctor.licenseNumber}
                onChange={(e) =>
                  (setSaveError(null),
                  setSaveSuccess(null),
                  setDoctor((prev) => ({
                    ...prev,
                    licenseNumber: e.target.value,
                  })))
                }
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Phone <span className="text-red-600">*</span>
              </label>
              <PhoneInput
                international
                defaultCountry="US"
                value={doctor.phone ?? undefined}
                onChange={(value) => {
                  setDoctor((prev) => ({
                    ...prev,
                    phone: value ?? null,
                  }));
                  setPhoneError(null);
                  setSaveError(null);
                  setSaveSuccess(null);
                }}
                onBlur={() => {
                  const trimmed = (doctor.phone ?? "").trim();
                  if (!trimmed) {
                    setPhoneError(null);
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
              {phoneError ? (
                <p className="font-montserrat text-xs text-red-600">{phoneError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Years of experience{" "}
                <span className="font-normal text-[#5E5E5E]">(optional)</span>
              </label>
              <input
                type="number"
                min={0}
                max={80}
                value={doctor.yearsExperience ?? ""}
                onChange={(e) =>
                  (setSaveError(null),
                  setSaveSuccess(null),
                  setDoctor((prev) => ({
                    ...prev,
                    yearsExperience: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })))
                }
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Upload profile photo <span className="text-red-600">*</span>
              </label>
              {profilePhotoPreviewSrc && (
                <div className="mb-1">
                  <Image
                    src={profilePhotoPreviewSrc}
                    alt="Doctor profile photo"
                    width={56}
                    height={56}
                    className="size-14 rounded-lg border border-[#e5e5e5] object-cover"
                  />
                </div>
              )}
              <input
                ref={profilePhotoInputRef}
                name="profilePhotoUpload"
                type="file"
                accept="image/*"
                className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] shadow-sm transition-colors file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#2555F3]/10 file:px-3 file:py-1.5 file:font-montserrat file:text-xs file:font-medium file:text-[#2555F3] hover:border-[#d8d8d8] hover:bg-[#fafafa] focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setSaveError(null);
                  setSaveSuccess(null);
                  // Force every uploaded photo through the crop modal so the
                  // stored image is consistently a 1:1 square.
                  const url = URL.createObjectURL(file);
                  setPendingCropImageUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return url;
                  });
                  setPendingCropFileName(file.name);
                  e.target.value = "";
                }}
              />
              {photoUploadPending && (
                <p className="font-montserrat text-xs text-[#5E5E5E]">
                  Uploading image...
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Short bio{" "}
                <span className="font-normal text-[#5E5E5E]">(optional)</span>
              </label>
              <textarea
                rows={4}
                maxLength={DOCTOR_BIO_MAX_CHARS}
                value={doctor.bio ?? ""}
                onChange={(e) => {
                  setSaveError(null);
                  setSaveSuccess(null);
                  setDoctor((prev) => ({ ...prev, bio: e.target.value }));
                }}
                className={`${inputClassName} h-auto py-2`}
              />
              <CharCountFooter
                value={doctor.bio ?? ""}
                maxChars={DOCTOR_BIO_MAX_CHARS}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Practice timezone <span className="text-red-600">*</span>
              </label>
              <select
                value={doctor.timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                className={selectClassName}
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
              </select>
              <p className="font-montserrat text-xs text-[#5E5E5E]">
                Used for your schedule, availability, and how appointment times
                are shown.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-montserrat text-sm font-medium text-[#333333]">
                Currency <span className="text-red-600">*</span>
              </label>
              <select
                value={doctor.currency}
                onChange={(e) =>
                  handleCurrencyChange(e.target.value as SupportedCurrency)
                }
                className={selectClassName}
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_LABELS[code]}
                  </option>
                ))}
              </select>
              <p className="font-montserrat text-xs text-[#5E5E5E]">
                Used for displaying prices and charging Stripe payments.
                Auto-suggested from your timezone — change it any time.
              </p>
              <p className="font-montserrat text-xs text-[#5E5E5E]">
                Selected currency:{" "}
                <span className="text-[#333333]">
                  {hasDarkNCurrencyText ? (
                    <MontagaCapitalN text={selectedCurrencyLabel} />
                  ) : (
                    selectedCurrencyLabel
                  )}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="font-montaga text-lg font-semibold text-[#333333] md:text-xl">
              Consultation prices{" "}
              <span className="font-montserrat text-base">
                (
                {doctor.currency.includes("N") ? (
                  <MontagaCapitalN text={doctor.currency} />
                ) : (
                  doctor.currency
                )}
                )
              </span>
            </h2>
            <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
              Set the price for each available appointment length. All four are
              required.
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {DURATION_KEYS.map((duration) => (
                <div key={duration} className="flex flex-col gap-2">
                  <label className="font-montserrat text-sm font-medium text-[#333333]">
                    {duration}-minute consultation{" "}
                    <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceInputs[duration]}
                    onChange={(e) => updatePriceInput(duration, e.target.value)}
                    onBlur={() => normalisePriceInput(duration)}
                    className={inputClassName}
                  />
                </div>
              ))}
            </div>
          </div>

          <div
            id="google-calendar"
            className="mt-8 scroll-mt-24 rounded-xl border border-[#e5e5e5] bg-white p-5 md:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#2555F3]/10 text-[#2555F3]">
                <Calendar className="size-5" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-montaga text-lg font-semibold text-[#333333] md:text-xl">
                    Google Calendar
                  </h2>
                  {isCalendarConnected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-montserrat text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="size-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[#fafafa] px-2 py-0.5 font-montserrat text-xs font-medium text-[#5E5E5E]">
                      Not connected
                    </span>
                  )}
                </div>
                <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                  {isCalendarConnected
                    ? "Google Calendar is connected — Meet links will be included in online appointments."
                    : "Connect your Google Calendar so online appointments include Meet links."}
                </p>
                {disconnectError && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
                    {disconnectError}
                  </p>
                )}
                {!isCalendarConnected && (
                  <p className="mt-3 font-montserrat text-xs text-[#777777]">
                    Our Google Cloud project is in testing mode, so only
                    pre-approved test users can connect their calendar. New
                    doctor accounts may not be able to connect yet.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isCalendarConnected ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onDisconnect()}
                      disabled={disconnectPending}
                      className="cursor-pointer"
                    >
                      {disconnectPending ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        window.location.href =
                          "/api/auth/google/calendar/connect";
                      }}
                      className="cursor-pointer"
                    >
                      Connect Google Calendar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {saveError && (
            <p className="mt-6 font-montserrat text-sm text-red-600">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="mt-6 font-montserrat text-sm text-emerald-700">
              {saveSuccess}
            </p>
          )}

          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => handleSaveClick()}
                disabled={
                  savePending ||
                  photoUploadPending ||
                  !isDirty ||
                  isPhoneInvalid ||
                  bioOverLimit
                }
                className="cursor-pointer"
              >
                {savePending
                  ? "Saving..."
                  : photoUploadPending
                    ? "Uploading photo..."
                    : "Save settings"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onSendPasswordReset()}
                disabled={savePending || photoUploadPending}
                className="cursor-pointer"
              >
                {doctor.hasPassword ? "Reset password" : "Set password"}
              </Button>
            </div>
          </div>
        </section>
      </Container>
      <TimezoneChangeConfirmDialog
        open={showTimezoneConfirm}
        newTimezone={doctor.timezone.trim()}
        confirming={savePending}
        onClose={() => {
          if (!savePending) setShowTimezoneConfirm(false);
        }}
        onConfirm={async () => {
          await onSave();
          setShowTimezoneConfirm(false);
        }}
      />
      {pendingCropImageUrl ? (
        <DoctorPhotoCropper
          imageUrl={pendingCropImageUrl}
          originalFileName={pendingCropFileName ?? undefined}
          onCancel={() => {
            if (pendingCropImageUrl) URL.revokeObjectURL(pendingCropImageUrl);
            setPendingCropImageUrl(null);
            setPendingCropFileName(null);
          }}
          onCrop={(file) => {
            if (pendingCropImageUrl) URL.revokeObjectURL(pendingCropImageUrl);
            setPendingCropImageUrl(null);
            setPendingCropFileName(null);
            setProfilePhotoFile(file);
          }}
        />
      ) : null}
    </div>
  );
}
