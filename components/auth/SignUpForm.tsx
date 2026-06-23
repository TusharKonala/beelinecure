"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { Button } from "@/components/ui/button";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";
import { uploadDoctorPhoto } from "@/lib/uploads/uploadDoctorPhoto";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import { DoctorPhotoCropper } from "@/components/doctor/DoctorPhotoCropper";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import {
  DOCTOR_BIO_MAX_CHARS,
  isOverCharLimit,
  PATIENT_ADDRESS_MAX_CHARS,
} from "@/lib/text-char-limit";

export function SignUpForm({
  initialRole = "PATIENT",
}: {
  initialRole?: "PATIENT" | "DOCTOR";
}) {
  const router = useRouter();
  const { redirectWithOverlay } = useRedirectOverlay();
  const { data: session, status: sessionStatus } = useSession();

  // Google-OAuth user completing the doctor profile: signed in, role already
  // upgraded to DOCTOR by /api/onboarding/doctor-intent, but profile not yet
  // complete. In this mode we hide email/password (already known) and post to
  // /api/onboarding/doctor-complete instead of /api/register.
  const isOAuthDoctorCompletion =
    sessionStatus === "authenticated" &&
    !!session?.user &&
    session.user.role === "DOCTOR" &&
    session.user.profileComplete === false;

  const [role, setRole] = useState<"PATIENT" | "DOCTOR">(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [qualification, setQualification] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [pendingCropImageUrl, setPendingCropImageUrl] = useState<string | null>(
    null,
  );
  const [pendingCropFileName, setPendingCropFileName] = useState<string | null>(
    null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [photoUploadPending, setPhotoUploadPending] = useState(false);
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!profilePhotoFile) {
      setSelectedPhotoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(profilePhotoFile);
    setSelectedPhotoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhotoFile]);

  // When the user is finishing a Google-doctor signup, force the role and
  // prefill name/email from the active session.
  useEffect(() => {
    if (!isOAuthDoctorCompletion) return;
    setRole("DOCTOR");
    const sessionName = (session?.user?.name ?? "").trim();
    const sessionEmail = (session?.user?.email ?? "").trim();
    setName((current) => (current.trim() ? current : sessionName));
    setEmail((current) => (current.trim() ? current : sessionEmail));
  }, [isOAuthDoctorCompletion, session?.user?.name, session?.user?.email]);

  function validatePhone(nextPhone: string, nextRole: "PATIENT" | "DOCTOR") {
    const value = nextPhone.trim();
    if (!value) {
      return nextRole === "DOCTOR" ? "Phone is required." : null;
    }
    return isValidPhoneNumber(value) ? null : "Please enter a valid phone number.";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    let didRedirect = false;
    try {
      const parsedYearsExperience =
        yearsExperience.trim().length > 0 ? Number(yearsExperience) : undefined;
      if (
        role === "DOCTOR" &&
        parsedYearsExperience != null &&
        !Number.isFinite(parsedYearsExperience)
      ) {
        setError("Years of experience must be a valid number.");
        return;
      }
      let resolvedProfilePhotoUrl: string | undefined = undefined;
      if (role === "DOCTOR" && profilePhotoFile) {
        setPhotoUploadPending(true);
        try {
          resolvedProfilePhotoUrl = await uploadDoctorPhoto(profilePhotoFile);
          setProfilePhotoUrl(resolvedProfilePhotoUrl);
        } finally {
          setPhotoUploadPending(false);
        }
      }
      if (role === "DOCTOR" && !resolvedProfilePhotoUrl) {
        setError("Doctor profile photo is required.");
        return;
      }
      if (role === "DOCTOR" && !name.trim()) {
        setError("Name is required for doctor signup.");
        return;
      }
      if (role === "DOCTOR") {
        const doctorPhoneError = validatePhone(phone, role);
        if (doctorPhoneError) {
          setPhoneError(doctorPhoneError);
          setError(doctorPhoneError);
          return;
        }
        const qualificationValue = qualification.trim();
        if (!specialization.trim()) {
          setError("Please select your specialization.");
          return;
        }
        if (qualificationValue.length < 2) {
          setError("Please enter your degree / qualification.");
          return;
        }
      }

      if (isOAuthDoctorCompletion) {
        const res = await fetch("/api/onboarding/doctor-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            specialization: specialization.trim(),
            qualification: qualification.trim(),
            licenseNumber: licenseNumber.trim(),
            yearsExperience:
              parsedYearsExperience != null
                ? Math.max(0, Math.floor(parsedYearsExperience))
                : undefined,
            bio: bio.trim() || undefined,
            profilePhotoUrl: resolvedProfilePhotoUrl,
            timezone: timezone.trim(),
          }),
        });

        const data = (await res.json().catch(() => ({}))) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong.");
          return;
        }

        // Doctors need admin approval before they can sign in again. Sign
        // them out of the active Google session and route them to the
        // pending-approval screen.
        await signOut({ callbackUrl: "/auth/doctor-pending-approval" });
        return;
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: role === "DOCTOR" ? name.trim() : name.trim() || undefined,
          phone: role === "PATIENT" ? phone.trim() || undefined : undefined,
          address: address.trim() || undefined,
          email: email.trim(),
          password,
          role,
          doctor:
            role === "DOCTOR"
              ? {
                  phone: phone.trim(),
                  specialization: specialization.trim(),
                  qualification: qualification.trim(),
                  licenseNumber: licenseNumber.trim(),
                  yearsExperience:
                    parsedYearsExperience != null
                      ? Math.max(0, Math.floor(parsedYearsExperience))
                      : undefined,
                  bio: bio.trim() || undefined,
                  profilePhotoUrl: resolvedProfilePhotoUrl,
                  timezone: timezone.trim(),
                }
              : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      // After signup we require email verification before credentials login.
      const roleParam = role === "DOCTOR" ? "&role=doctor" : "&role=patient";
      redirectWithOverlay(
        router,
        `/auth/signin?registered=1${roleParam}`,
      );
      router.refresh();
      didRedirect = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (!didRedirect) setPending(false);
    }
  }

  const inputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm outline-none placeholder:text-[#5E5E5E]/70 focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20";
  /** Hide native select arrow; custom chevron at `right: 0.75rem` with `pr-10` inset. */
  const selectClassName = `${inputClassName} cursor-pointer appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-10`;
  const phoneInputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";

  const bioOverLimit =
    role === "DOCTOR" && isOverCharLimit(bio, DOCTOR_BIO_MAX_CHARS);
  const addressOverLimit =
    role === "PATIENT" && isOverCharLimit(address, PATIENT_ADDRESS_MAX_CHARS);

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <div>
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          {isOAuthDoctorCompletion
            ? "Complete your doctor profile"
            : "Create account"}
        </h1>
        <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:text-base">
          {isOAuthDoctorCompletion
            ? `Signed in as ${session?.user?.email ?? ""}. Fill in your professional details below.`
            : "Choose patient or doctor signup to get started."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
          {error}
        </p>
      )}

      {!isOAuthDoctorCompletion && (
        <div className="flex flex-col gap-2">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            I am signing up as
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`h-11 cursor-pointer rounded-xl border font-montserrat text-sm font-medium transition-colors ${
                role === "PATIENT"
                  ? "border-[#2555F3] bg-[#2555F3]/10 text-[#2555F3]"
                  : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
              }`}
              onClick={() => setRole("PATIENT")}
            >
              Patient
            </button>
            <button
              type="button"
              className={`h-11 cursor-pointer rounded-xl border font-montserrat text-sm font-medium transition-colors ${
                role === "DOCTOR"
                  ? "border-[#2555F3] bg-[#2555F3]/10 text-[#2555F3]"
                  : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
              }`}
              onClick={() => setRole("DOCTOR")}
            >
              Doctor
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="signup-name"
          className="font-montserrat text-sm font-medium text-[#333333]"
        >
          Name <span className="text-red-600">*</span>
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
        />
      </div>

      {!isOAuthDoctorCompletion && (
        <>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-email"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Email <span className="text-red-600">*</span>
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-password"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Password <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <input
                id="signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClassName} pr-11`}
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5E5E5E] outline-none hover:bg-[#f5f5f5] hover:text-[#333333] focus-visible:ring-2 focus-visible:ring-[#2555F3]/30"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="size-4 shrink-0" />
                ) : (
                  <Eye className="size-4 shrink-0" />
                )}
              </button>
            </div>
            <p className="font-montserrat text-xs text-[#5E5E5E]">
              At least 8 characters.
            </p>
          </div>
        </>
      )}

      {role === "PATIENT" && (
        <>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-patient-phone"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Phone <span className="font-normal text-[#5E5E5E]">(optional)</span>
            </label>
            <PhoneInput
              id="signup-patient-phone"
              international
              defaultCountry="US"
              value={phone || undefined}
              onChange={(value) => {
                const nextPhone = value ?? "";
                setPhone(nextPhone);
                setPhoneError(null);
              }}
              onBlur={() => setPhoneError(validatePhone(phone, role))}
              className={phoneInputClassName}
            />
            {phoneError ? (
              <p className="font-montserrat text-xs text-red-600">{phoneError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-patient-address"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Address <span className="font-normal text-[#5E5E5E]">(optional)</span>
            </label>
            <textarea
              id="signup-patient-address"
              name="address"
              rows={3}
              maxLength={PATIENT_ADDRESS_MAX_CHARS}
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={`${inputClassName} h-auto py-2`}
            />
            <CharCountFooter
              value={address}
              maxChars={PATIENT_ADDRESS_MAX_CHARS}
            />
          </div>
        </>
      )}

      {role === "DOCTOR" && (
        <>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-phone"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Phone <span className="text-red-600">*</span>
            </label>
            <PhoneInput
              id="signup-phone"
              international
              defaultCountry="US"
              required
              value={phone || undefined}
              onChange={(value) => {
                const nextPhone = value ?? "";
                setPhone(nextPhone);
                setPhoneError(null);
              }}
              onBlur={() => setPhoneError(validatePhone(phone, role))}
              className={phoneInputClassName}
            />
            {phoneError ? (
              <p className="font-montserrat text-xs text-red-600">{phoneError}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-specialization"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Specialization <span className="text-red-600">*</span>
            </label>
            <select
              id="signup-specialization"
              name="specialization"
              required
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
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
            <label
              htmlFor="signup-qualification"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Degree / Qualification <span className="text-red-600">*</span>
            </label>
            <input
              id="signup-qualification"
              name="qualification"
              type="text"
              required
              minLength={2}
              maxLength={255}
              placeholder="e.g. MBBS, MD"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-timezone"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Clinic timezone <span className="text-red-600">*</span>
            </label>
            <select
              id="signup-timezone"
              name="timezone"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
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
              Used for your availability and appointment times.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-license"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              License number <span className="text-red-600">*</span>
            </label>
            <input
              id="signup-license"
              name="licenseNumber"
              type="text"
              required
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-years-experience"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Years of experience{" "}
              <span className="font-normal text-[#5E5E5E]">(optional)</span>
            </label>
            <input
              id="signup-years-experience"
              name="yearsExperience"
              type="number"
              min={0}
              max={80}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-doctor-photo-upload"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Upload profile photo <span className="text-red-600">*</span>
            </label>
            {selectedPhotoPreviewUrl && (
              <div className="mb-1">
                <Image
                  src={selectedPhotoPreviewUrl}
                  alt="Doctor profile photo"
                  width={56}
                  height={56}
                  className="size-14 rounded-lg border border-[#e5e5e5] object-cover"
                />
              </div>
            )}
            <input
              id="signup-doctor-photo-upload"
              name="profilePhotoUpload"
              type="file"
              accept="image/*"
              className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] shadow-sm transition-colors file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#2555F3]/10 file:px-3 file:py-1.5 file:font-montserrat file:text-xs file:font-medium file:text-[#2555F3] hover:border-[#d8d8d8] hover:bg-[#fafafa] focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError(null);
                // Open the cropper instead of using the raw file directly so
                // every uploaded photo ends up as a consistent square JPEG.
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
            {!photoUploadPending && profilePhotoUrl && (
              <p className="font-montserrat text-xs text-emerald-700">
                Photo uploaded successfully.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="signup-doctor-bio"
              className="font-montserrat text-sm font-medium text-[#333333]"
            >
              Short bio{" "}
              <span className="font-normal text-[#5E5E5E]">(optional)</span>
            </label>
            <textarea
              id="signup-doctor-bio"
              name="bio"
              rows={4}
              maxLength={DOCTOR_BIO_MAX_CHARS}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${inputClassName} h-auto py-2`}
            />
            <CharCountFooter value={bio} maxChars={DOCTOR_BIO_MAX_CHARS} />
          </div>
        </>
      )}

      <Button
        type="submit"
        disabled={pending || photoUploadPending || bioOverLimit || addressOverLimit}
        className="h-11 w-full cursor-pointer rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium hover:bg-[#1e44c7] md:h-12 md:text-base"
      >
        {pending
          ? "Creating account..."
          : photoUploadPending
            ? "Uploading photo..."
            : "Sign up"}
      </Button>

      <p className="text-center font-montserrat text-sm text-[#5E5E5E]">
        Already have an account?{" "}
        <Link
          href="/auth/signin"
          className="font-medium text-[#2555F3] hover:underline"
        >
          Sign in
        </Link>
      </p>
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
    </form>
  );
}
