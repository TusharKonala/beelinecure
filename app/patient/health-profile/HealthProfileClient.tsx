"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil } from "lucide-react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { QuickCheckStyleDateField } from "@/components/QuickCheckStyleDateField";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/Container";
import { computeAgeYears, computeBmi } from "@/lib/health-profile-metrics";
import { SELECT_CHEVRON } from "@/lib/select-styles";

export type HealthProfileDto = {
  id: string;
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  dateOfBirth: Date | string | null;
  gender: string | null;
  allergies: string | null;
  conditions: string | null;
  currentMedications: string | null;
  pastSurgeries: string | null;
  smokingStatus: string | null;
  alcoholUse: string | null;
  activityLevel: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContact2Name: string | null;
  emergencyContact2Phone: string | null;
  emergencyContact2Relationship: string | null;
};

const formSchema = z.object({
  bloodGroup: z.string().max(32),
  heightCm: z.string().max(20),
  weightKg: z.string().max(20),
  dateOfBirth: z.string().max(12),
  gender: z.string().max(64),
  allergies: z.string().max(10000),
  conditions: z.string().max(10000),
  currentMedications: z.string().max(10000),
  pastSurgeries: z.string().max(10000),
  smokingStatus: z.string().max(64),
  alcoholUse: z.string().max(64),
  activityLevel: z.string().max(64),
  emergencyContactName: z.string().max(200),
  emergencyContactPhone: z.string().max(40),
  emergencyContactRelationship: z.string().max(120),
  emergencyContact2Name: z.string().max(200),
  emergencyContact2Phone: z.string().max(40),
  emergencyContact2Relationship: z.string().max(120),
});

type FormValues = z.infer<typeof formSchema>;

const inputClassName =
  "min-h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-montserrat text-[#333333] shadow-sm outline-none placeholder:text-[#5E5E5E]/70 focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20";
const selectClassName = `${inputClassName} cursor-pointer pr-10 ${SELECT_CHEVRON}`;

const textareaClassName = `${inputClassName} min-h-[88px] resize-y`;
const phoneInputClassName =
  "min-h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";

function toDateInputValue(d: Date | string | null | undefined): string {
  if (d == null) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toFormDefaults(p: HealthProfileDto | null): FormValues {
  return {
    bloodGroup: p?.bloodGroup ?? "",
    heightCm: p?.heightCm != null ? String(p.heightCm) : "",
    weightKg: p?.weightKg != null ? String(p.weightKg) : "",
    dateOfBirth: toDateInputValue(p?.dateOfBirth ?? null),
    gender: p?.gender ?? "",
    allergies: p?.allergies ?? "",
    conditions: p?.conditions ?? "",
    currentMedications: p?.currentMedications ?? "",
    pastSurgeries: p?.pastSurgeries ?? "",
    smokingStatus: p?.smokingStatus ?? "",
    alcoholUse: p?.alcoholUse ?? "",
    activityLevel: p?.activityLevel ?? "",
    emergencyContactName: p?.emergencyContactName ?? "",
    emergencyContactPhone: p?.emergencyContactPhone ?? "",
    emergencyContactRelationship: p?.emergencyContactRelationship ?? "",
    emergencyContact2Name: p?.emergencyContact2Name ?? "",
    emergencyContact2Phone: p?.emergencyContact2Phone ?? "",
    emergencyContact2Relationship: p?.emergencyContact2Relationship ?? "",
  };
}

const UNIT_SYSTEM_STORAGE_KEY = "beelinecure:health-units";
type UnitSystem = "metric" | "imperial";

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = totalInches - feet * 12;
  // Round inches to one decimal for display; carry to feet on overflow.
  inches = Math.round(inches * 10) / 10;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

function parseNumField(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dtoFromApiJson(p: Record<string, unknown>): HealthProfileDto {
  const dob = p.dateOfBirth;
  return {
    id: String(p.id),
    bloodGroup: (p.bloodGroup as string) ?? null,
    heightCm: typeof p.heightCm === "number" ? p.heightCm : null,
    weightKg: typeof p.weightKg === "number" ? p.weightKg : null,
    dateOfBirth:
      typeof dob === "string" || dob instanceof Date ? (dob as string | Date) : null,
    gender: (p.gender as string) ?? null,
    allergies: (p.allergies as string) ?? null,
    conditions: (p.conditions as string) ?? null,
    currentMedications: (p.currentMedications as string) ?? null,
    pastSurgeries: (p.pastSurgeries as string) ?? null,
    smokingStatus: (p.smokingStatus as string) ?? null,
    alcoholUse: (p.alcoholUse as string) ?? null,
    activityLevel: (p.activityLevel as string) ?? null,
    emergencyContactName: (p.emergencyContactName as string) ?? null,
    emergencyContactPhone: (p.emergencyContactPhone as string) ?? null,
    emergencyContactRelationship: (p.emergencyContactRelationship as string) ?? null,
    emergencyContact2Name: (p.emergencyContact2Name as string) ?? null,
    emergencyContact2Phone: (p.emergencyContact2Phone as string) ?? null,
    emergencyContact2Relationship: (p.emergencyContact2Relationship as string) ?? null,
  };
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  const display = value?.trim() || "—";
  return (
    <div className="border-b border-[#f0f0f0] py-3 last:border-b-0">
      <p className="font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap font-montserrat text-sm text-[#333333]">
        {display}
      </p>
    </div>
  );
}

function emergencyLine(
  name: string | null,
  rel: string | null,
  phone: string | null,
): string | null {
  const parts = [name, rel, phone].filter((x) => x?.trim());
  return parts.length ? parts.join(" · ") : null;
}

const GENDER = ["Female", "Male", "Non-binary", "Prefer not to say"] as const;
const SMOKING = [
  "Never",
  "Former",
  "Occasionally",
  "Daily",
  "Prefer not to say",
] as const;
const ALCOHOL = [
  "None",
  "Occasional",
  "Weekly",
  "Daily",
  "Prefer not to say",
] as const;
const ACTIVITY = [
  "Sedentary",
  "Light",
  "Moderate",
  "Active",
  "Very active",
  "Prefer not to say",
] as const;

type Props = {
  initialProfile: HealthProfileDto | null;
};

export function HealthProfileClient({ initialProfile }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<HealthProfileDto | null>(initialProfile);
  const [mode, setMode] = useState<"form" | "summary">(
    initialProfile ? "summary" : "form",
  );
  const [error, setError] = useState<string | null>(null);
  const [emergencyContactPhoneError, setEmergencyContactPhoneError] = useState<
    string | null
  >(null);
  const [emergencyContact2PhoneError, setEmergencyContact2PhoneError] = useState<
    string | null
  >(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormDefaults(initialProfile),
  });

  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  // Imperial display state. We derive these on first load from the metric
  // form values, then keep them in sync as the user edits in either mode.
  const [imperialFeet, setImperialFeet] = useState("");
  const [imperialInches, setImperialInches] = useState("");
  const [imperialLbs, setImperialLbs] = useState("");

  // Restore the user's unit preference from localStorage on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(UNIT_SYSTEM_STORAGE_KEY);
      if (raw === "imperial" || raw === "metric") setUnitSystem(raw);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Persist the toggle so it sticks across visits.
  useEffect(() => {
    try {
      window.localStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, unitSystem);
    } catch {
      /* ignore storage errors */
    }
  }, [unitSystem]);

  // When switching INTO imperial, seed the imperial fields from the current
  // metric values so the user sees the equivalent. We don't seed the other
  // direction — metric values are still the source of truth in the form.
  useEffect(() => {
    if (unitSystem !== "imperial") return;
    const heightCm = parseFloat(
      String(form.getValues("heightCm")).replace(",", "."),
    );
    if (Number.isFinite(heightCm) && heightCm > 0) {
      const { feet, inches } = cmToFeetInches(heightCm);
      setImperialFeet(String(feet));
      setImperialInches(inches === 0 ? "0" : String(inches));
    } else {
      setImperialFeet("");
      setImperialInches("");
    }
    const weightKg = parseFloat(
      String(form.getValues("weightKg")).replace(",", "."),
    );
    if (Number.isFinite(weightKg) && weightKg > 0) {
      setImperialLbs((Math.round(kgToLbs(weightKg) * 10) / 10).toString());
    } else {
      setImperialLbs("");
    }
    // We intentionally don't include form values; we only want to seed when
    // the unit system actually flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSystem]);

  useEffect(() => {
    if (unitSystem !== "metric") return;
    const lbs = parseNumField(imperialLbs);
    if (lbs == null) return;
    const kg = lbsToKg(lbs);
    form.setValue("weightKg", (Math.round(kg * 10) / 10).toString(), {
      shouldDirty: true,
    });
  }, [imperialLbs, unitSystem, form]);

  const heightWatch = useWatch({ control: form.control, name: "heightCm" }) ?? "";
  const weightWatch = useWatch({ control: form.control, name: "weightKg" }) ?? "";
  const dobWatch = useWatch({ control: form.control, name: "dateOfBirth" }) ?? "";
  const emergencyContactPhoneWatch =
    useWatch({ control: form.control, name: "emergencyContactPhone" }) ?? "";
  const emergencyContact2PhoneWatch =
    useWatch({ control: form.control, name: "emergencyContact2Phone" }) ?? "";

  function validateOptionalPhone(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return isValidPhoneNumber(trimmed) ? null : "Please enter a valid phone number.";
  }

  const hNum = parseFloat(String(heightWatch).replace(",", "."));
  const wNum = parseFloat(String(weightWatch).replace(",", "."));
  const bmiPreview =
    Number.isFinite(hNum) && Number.isFinite(wNum) && hNum > 0 && wNum > 0
      ? computeBmi(hNum, wNum)
      : null;

  let agePreview: number | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dobWatch)) {
    agePreview = computeAgeYears(new Date(`${dobWatch}T12:00:00.000Z`));
  }

  async function onSubmit(values: FormValues) {
    setError(null);
    const primaryPhoneError = validateOptionalPhone(values.emergencyContactPhone);
    const secondaryPhoneError = validateOptionalPhone(values.emergencyContact2Phone);
    setEmergencyContactPhoneError(primaryPhoneError);
    setEmergencyContact2PhoneError(secondaryPhoneError);
    if (primaryPhoneError || secondaryPhoneError) {
      setError("Please enter valid phone number(s) for emergency contacts.");
      return;
    }
    const res = await fetch("/api/health-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bloodGroup: values.bloodGroup || null,
        heightCm: parseNumField(values.heightCm),
        weightKg: parseNumField(values.weightKg),
        dateOfBirth: values.dateOfBirth.trim() || null,
        gender: values.gender || null,
        allergies: values.allergies || null,
        conditions: values.conditions || null,
        currentMedications: values.currentMedications || null,
        pastSurgeries: values.pastSurgeries || null,
        smokingStatus: values.smokingStatus || null,
        alcoholUse: values.alcoholUse || null,
        activityLevel: values.activityLevel || null,
        emergencyContactName: values.emergencyContactName || null,
        emergencyContactPhone: values.emergencyContactPhone || null,
        emergencyContactRelationship: values.emergencyContactRelationship || null,
        emergencyContact2Name: values.emergencyContact2Name || null,
        emergencyContact2Phone: values.emergencyContact2Phone || null,
        emergencyContact2Relationship: values.emergencyContact2Relationship || null,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      profile?: Record<string, unknown>;
      error?: unknown;
    };

    if (!res.ok) {
      setError("Could not save your health profile. Please try again.");
      return;
    }

    if (data.profile) {
      setProfile(dtoFromApiJson(data.profile));
      setMode("summary");
      router.refresh();
    }
  }

  function onEdit() {
    form.reset(toFormDefaults(profile));
    setMode("form");
  }

  const summaryBmi =
    profile?.heightCm != null &&
    profile?.weightKg != null &&
    profile.heightCm > 0 &&
    profile.weightKg > 0
      ? computeBmi(profile.heightCm, profile.weightKg)
      : null;

  const summaryAge =
    profile?.dateOfBirth != null
      ? computeAgeYears(
          typeof profile.dateOfBirth === "string"
            ? new Date(profile.dateOfBirth)
            : profile.dateOfBirth,
        )
      : null;
  const hasPhoneError = Boolean(
    emergencyContactPhoneError || emergencyContact2PhoneError,
  );

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1
                style={{
                  WebkitTextStroke: "0.08px #333333",
                  WebkitTextFillColor: "#333333",
                }}
                className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl"
              >
                Health Profile
              </h1>
              <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                Personal details, medical history, and who to reach in an emergency.
              </p>
            </div>
            {mode === "summary" && profile && (
              <Button
                type="button"
                onClick={onEdit}
                variant="outline"
                aria-label="Edit entire health profile"
                className="h-11 w-full shrink-0 cursor-pointer gap-2 rounded-xl border-[#e5e5e5] bg-white px-5 font-montserrat text-sm font-medium text-[#333333] shadow-sm hover:bg-[#f5f5f5] sm:w-auto"
              >
                <Pencil className="size-4 shrink-0" aria-hidden />
                Edit profile
              </Button>
            )}
          </div>

          {mode === "summary" && profile && (
            <div className="mt-8 space-y-6">
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
                <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                  Personal health
                </h2>
                <div className="mt-2">
                  <SummaryRow label="Blood group" value={profile.bloodGroup} />
                  <SummaryRow
                    label="Height / weight"
                    value={
                      profile.heightCm != null || profile.weightKg != null
                        ? [
                            profile.heightCm != null
                              ? unitSystem === "imperial"
                                ? (() => {
                                    const { feet, inches } = cmToFeetInches(
                                      profile.heightCm,
                                    );
                                    return `${feet}'${inches}"`;
                                  })()
                                : `${profile.heightCm} cm`
                              : null,
                            profile.weightKg != null
                              ? unitSystem === "imperial"
                                ? `${(
                                    Math.round(kgToLbs(profile.weightKg) * 10) /
                                    10
                                  ).toFixed(1)} lbs`
                                : `${profile.weightKg} kg`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"
                        : null
                    }
                  />
                  <SummaryRow
                    label="BMI"
                    value={summaryBmi != null ? String(summaryBmi) : null}
                  />
                  <SummaryRow
                    label="Date of birth"
                    value={toDateInputValue(profile.dateOfBirth)}
                  />
                  <SummaryRow
                    label="Age"
                    value={summaryAge != null ? `${summaryAge} years` : null}
                  />
                  <SummaryRow label="Gender" value={profile.gender} />
                </div>
              </div>

              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
                <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                  Medical history
                </h2>
                <div className="mt-2">
                  <SummaryRow label="Allergies" value={profile.allergies} />
                  <SummaryRow label="Conditions" value={profile.conditions} />
                  <SummaryRow
                    label="Current medications"
                    value={profile.currentMedications}
                  />
                  <SummaryRow label="Past surgeries" value={profile.pastSurgeries} />
                  <SummaryRow label="Smoking" value={profile.smokingStatus} />
                  <SummaryRow label="Alcohol" value={profile.alcoholUse} />
                  <SummaryRow label="Activity level" value={profile.activityLevel} />
                </div>
              </div>

              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
                <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                  Emergency contacts
                </h2>
                <div className="mt-2">
                  <SummaryRow
                    label="Primary contact"
                    value={emergencyLine(
                      profile.emergencyContactName,
                      profile.emergencyContactRelationship,
                      profile.emergencyContactPhone,
                    )}
                  />
                  <SummaryRow
                    label="Secondary contact"
                    value={emergencyLine(
                      profile.emergencyContact2Name,
                      profile.emergencyContact2Relationship,
                      profile.emergencyContact2Phone,
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {mode === "form" && (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-8 flex max-w-2xl flex-col gap-0"
            >
              {error && (
                <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
                  {error}
                </p>
              )}

              <div className="space-y-5">
                <h2 className="font-montserrat text-base font-semibold text-[#333333]">
                  Personal health
                </h2>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="bloodGroup"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Blood group
                  </label>
                  <select
                    id="bloodGroup"
                    className={selectClassName}
                    {...form.register("bloodGroup")}
                  >
                    <option value="">Select…</option>
                    {[
                      "A+",
                      "A-",
                      "B+",
                      "B-",
                      "AB+",
                      "AB-",
                      "O+",
                      "O-",
                      "Unknown",
                    ].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-montserrat text-sm font-medium text-[#333333]">
                    Height &amp; weight units
                  </span>
                  <div
                    role="group"
                    aria-label="Unit system"
                    className="inline-flex overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => setUnitSystem("metric")}
                      className={`cursor-pointer px-3 py-1.5 font-montserrat text-xs transition-colors ${
                        unitSystem === "metric"
                          ? "bg-[#2555F3] text-white"
                          : "bg-white text-[#333333] hover:bg-[#fafafa]"
                      }`}
                    >
                      Metric (cm / kg)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnitSystem("imperial")}
                      className={`cursor-pointer px-3 py-1.5 font-montserrat text-xs transition-colors ${
                        unitSystem === "imperial"
                          ? "bg-[#2555F3] text-white"
                          : "bg-white text-[#333333] hover:bg-[#fafafa]"
                      }`}
                    >
                      Imperial (ft / lbs)
                    </button>
                  </div>
                </div>

                {unitSystem === "metric" ? (
                  <div key="metric-fields" className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="heightCm"
                        className="font-montserrat text-sm font-medium text-[#333333]"
                      >
                        Height (cm)
                      </label>
                      <input
                        id="heightCm"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 170"
                        className={inputClassName}
                        {...form.register("heightCm")}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="weightKg"
                        className="font-montserrat text-sm font-medium text-[#333333]"
                      >
                        Weight (kg)
                      </label>
                      <input
                        id="weightKg"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 70"
                        className={inputClassName}
                        {...form.register("weightKg")}
                      />
                    </div>
                  </div>
                ) : (
                  <div key="imperial-fields" className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <span className="font-montserrat text-sm font-medium text-[#333333]">
                        Height (ft / in)
                      </span>
                      <div className="flex gap-2">
                        <input
                          id="heightFeet"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="ft"
                          className={inputClassName}
                          value={imperialFeet}
                          onChange={(e) => {
                            const next = e.target.value;
                            setImperialFeet(next);
                            const ft = parseFloat(next.replace(",", ".")) || 0;
                            const inch =
                              parseFloat(imperialInches.replace(",", ".")) || 0;
                            const cm = feetInchesToCm(ft, inch);
                            form.setValue(
                              "heightCm",
                              cm > 0 ? (Math.round(cm * 10) / 10).toString() : "",
                              { shouldDirty: true },
                            );
                          }}
                        />
                        <input
                          id="heightInches"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="in"
                          className={inputClassName}
                          value={imperialInches}
                          onChange={(e) => {
                            const next = e.target.value;
                            setImperialInches(next);
                            const ft =
                              parseFloat(imperialFeet.replace(",", ".")) || 0;
                            const inch = parseFloat(next.replace(",", ".")) || 0;
                            const cm = feetInchesToCm(ft, inch);
                            form.setValue(
                              "heightCm",
                              cm > 0 ? (Math.round(cm * 10) / 10).toString() : "",
                              { shouldDirty: true },
                            );
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="weightLbs"
                        className="font-montserrat text-sm font-medium text-[#333333]"
                      >
                        Weight (lbs)
                      </label>
                      <input
                        id="weightLbs"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 154"
                        className={inputClassName}
                        value={imperialLbs}
                        onChange={(e) => {
                          const next = e.target.value;
                          setImperialLbs(next);
                          const lbs = parseFloat(next.replace(",", ".")) || 0;
                          const kg = lbs > 0 ? lbsToKg(lbs) : 0;
                          form.setValue(
                            "weightKg",
                            kg > 0 ? (Math.round(kg * 10) / 10).toString() : "",
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </div>
                  </div>
                )}

                {bmiPreview != null && (
                  <p className="rounded-xl border border-[#e5e5e5] bg-[#f8f9fc] px-3 py-2 font-montserrat text-sm text-[#333333]">
                    <span className="font-medium">BMI:</span> {bmiPreview}{" "}
                    <span className="text-[#5E5E5E]">(calculated)</span>
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <QuickCheckStyleDateField
                    id="dateOfBirth"
                    label="Date of birth"
                    value={dobWatch}
                    onChange={(v) =>
                      form.setValue("dateOfBirth", v, { shouldDirty: true })
                    }
                    labelClassName="font-montserrat text-sm font-medium text-[#333333]"
                    className="max-w-none"
                    ariaLabel="Date of birth"
                  />
                  <div className="flex flex-col gap-2">
                    <span className="font-montserrat text-sm font-medium text-[#333333]">
                      Age
                    </span>
                    <div
                      className="flex min-h-11 items-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-3 font-montserrat text-sm text-[#333333]"
                      aria-live="polite"
                    >
                      {agePreview != null ? `${agePreview} years` : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="gender"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Gender
                  </label>
                  <select
                    id="gender"
                    className={selectClassName}
                    {...form.register("gender")}
                  >
                    <option value="">Select…</option>
                    {GENDER.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-10 space-y-5 border-t border-[#e5e5e5] pt-10">
                <h2 className="font-montserrat text-base font-semibold text-[#333333]">
                  Medical history
                </h2>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="allergies"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Allergies
                  </label>
                  <textarea
                    id="allergies"
                    placeholder="e.g. penicillin, peanuts"
                    className={textareaClassName}
                    {...form.register("allergies")}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="conditions"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Conditions
                  </label>
                  <textarea
                    id="conditions"
                    placeholder="e.g. asthma, hypertension"
                    className={textareaClassName}
                    {...form.register("conditions")}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="currentMedications"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Current medications
                  </label>
                  <textarea
                    id="currentMedications"
                    placeholder="Drug names and doses if known"
                    className={textareaClassName}
                    {...form.register("currentMedications")}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="pastSurgeries"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Past surgeries
                  </label>
                  <textarea
                    id="pastSurgeries"
                    placeholder="Procedure and approximate year"
                    className={textareaClassName}
                    {...form.register("pastSurgeries")}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="smokingStatus"
                      className="font-montserrat text-sm font-medium text-[#333333]"
                    >
                      Smoking
                    </label>
                    <select
                      id="smokingStatus"
                      className={selectClassName}
                      {...form.register("smokingStatus")}
                    >
                      <option value="">Select…</option>
                      {SMOKING.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="alcoholUse"
                      className="font-montserrat text-sm font-medium text-[#333333]"
                    >
                      Alcohol
                    </label>
                    <select
                      id="alcoholUse"
                      className={selectClassName}
                      {...form.register("alcoholUse")}
                    >
                      <option value="">Select…</option>
                      {ALCOHOL.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="activityLevel"
                      className="font-montserrat text-sm font-medium text-[#333333]"
                    >
                      Activity level
                    </label>
                    <select
                      id="activityLevel"
                      className={selectClassName}
                      {...form.register("activityLevel")}
                    >
                      <option value="">Select…</option>
                      {ACTIVITY.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-10 space-y-5 border-t border-[#e5e5e5] pt-10">
                <h2 className="font-montserrat text-base font-semibold text-[#333333]">
                  Emergency contacts
                </h2>

                <p className="font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
                  Primary
                </p>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContactName"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Name
                  </label>
                  <input
                    id="emergencyContactName"
                    type="text"
                    autoComplete="name"
                    className={inputClassName}
                    {...form.register("emergencyContactName")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContactRelationship"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Relationship
                  </label>
                  <input
                    id="emergencyContactRelationship"
                    type="text"
                    placeholder="e.g. spouse, parent"
                    className={inputClassName}
                    {...form.register("emergencyContactRelationship")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContactPhone"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Phone
                  </label>
                  <PhoneInput
                    id="emergencyContactPhone"
                    international
                    defaultCountry="US"
                    value={emergencyContactPhoneWatch || undefined}
                    onChange={(value) => {
                      form.setValue("emergencyContactPhone", value ?? "", {
                        shouldDirty: true,
                      });
                      setEmergencyContactPhoneError(null);
                    }}
                    onBlur={() =>
                      setEmergencyContactPhoneError(
                        validateOptionalPhone(emergencyContactPhoneWatch),
                      )
                    }
                    className={phoneInputClassName}
                  />
                  {emergencyContactPhoneError ? (
                    <p className="font-montserrat text-xs text-red-600">
                      {emergencyContactPhoneError}
                    </p>
                  ) : null}
                </div>

                <p className="pt-2 font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
                  Secondary (optional)
                </p>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContact2Name"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Name
                  </label>
                  <input
                    id="emergencyContact2Name"
                    type="text"
                    autoComplete="off"
                    className={inputClassName}
                    {...form.register("emergencyContact2Name")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContact2Relationship"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Relationship
                  </label>
                  <input
                    id="emergencyContact2Relationship"
                    type="text"
                    className={inputClassName}
                    {...form.register("emergencyContact2Relationship")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="emergencyContact2Phone"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Phone
                  </label>
                  <PhoneInput
                    id="emergencyContact2Phone"
                    international
                    defaultCountry="US"
                    value={emergencyContact2PhoneWatch || undefined}
                    onChange={(value) => {
                      form.setValue("emergencyContact2Phone", value ?? "", {
                        shouldDirty: true,
                      });
                      setEmergencyContact2PhoneError(null);
                    }}
                    onBlur={() =>
                      setEmergencyContact2PhoneError(
                        validateOptionalPhone(emergencyContact2PhoneWatch),
                      )
                    }
                    className={phoneInputClassName}
                  />
                  {emergencyContact2PhoneError ? (
                    <p className="font-montserrat text-xs text-red-600">
                      {emergencyContact2PhoneError}
                    </p>
                  ) : null}
                </div>
              </div>

              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  !form.formState.isDirty ||
                  hasPhoneError
                }
                className="mt-10 h-11 w-full max-w-xs cursor-pointer rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium hover:bg-[#1e44c7]"
              >
                {form.formState.isSubmitting ? "Saving…" : "Save profile"}
              </Button>
            </form>
          )}
        </section>

        {mode === "summary" && profile && (
          <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
            <Link
              href="/patient/overview"
              className="font-medium text-[#2555F3] hover:underline"
            >
              ← Back to overview
            </Link>
          </p>
        )}
      </Container>
    </div>
  );
}
