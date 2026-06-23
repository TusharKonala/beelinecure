"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { Button } from "@/components/ui/button";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import {
  isOverCharLimit,
  PATIENT_ADDRESS_MAX_CHARS,
} from "@/lib/text-char-limit";

type Profile = {
  name: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  hasPassword: boolean;
};

type PatientSettingsValues = {
  name: string;
  phone: string;
  address: string;
};

function normaliseValues(values: PatientSettingsValues): PatientSettingsValues {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
  };
}

export default function PatientSettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [initialValues, setInitialValues] = useState<PatientSettingsValues | null>(
    null,
  );
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/patient/profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: Profile) => {
        if (cancelled) return;
        setProfile(data);
        setName(data.name ?? "");
        setPhone(data.phone ?? "");
        setAddress(data.address ?? "");
        setInitialValues(
          normaliseValues({
            name: data.name ?? "",
            phone: data.phone ?? "",
            address: data.address ?? "",
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not load profile.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/patient/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<Profile>;
      if (!res.ok) {
        setError(data.error ?? "Could not save profile.");
        return;
      }
      const nextValues = normaliseValues({ name, phone, address });
      setInitialValues(nextValues);
      setName(nextValues.name);
      setPhone(nextValues.phone);
      setAddress(nextValues.address);
      setOk("Profile updated.");
    } catch {
      setError("Could not save profile.");
    } finally {
      setPending(false);
    }
  }

  async function sendPasswordReset() {
    if (!profile?.email) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile.email }),
      });
      setOk(
        profile.hasPassword
          ? "Password reset link sent to your email."
          : "Password setup link sent to your email.",
      );
    } catch {
      setError("Could not send password reset email.");
    } finally {
      setPending(false);
    }
  }

  const isDirty = useMemo(() => {
    if (!initialValues) return false;
    const currentValues = normaliseValues({ name, phone, address });
    return (
      currentValues.name !== initialValues.name ||
      currentValues.phone !== initialValues.phone ||
      currentValues.address !== initialValues.address
    );
  }, [initialValues, name, phone, address]);

  const isPhoneInvalid = Boolean(phoneError);
  const addressOverLimit = isOverCharLimit(address, PATIENT_ADDRESS_MAX_CHARS);

  const phoneInputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="font-montaga text-2xl text-[#333333]">Account settings</h1>
      <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
        Update your profile and contact details.
      </p>
      <div className="mt-6 space-y-4 rounded-xl border border-[#e5e5e5] bg-white p-5">
        <div>
          <label className="font-montserrat text-sm font-medium text-[#333333]">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-[#e5e5e5] px-3 font-montserrat text-sm"
          />
        </div>
        <div>
          <label className="font-montserrat text-sm font-medium text-[#333333]">
            Email
          </label>
          <input
            disabled
            value={profile?.email ?? ""}
            className="mt-1 h-11 w-full rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-3 font-montserrat text-sm text-[#5E5E5E]"
          />
          <p className="mt-1 font-montserrat text-xs text-[#5E5E5E]">
            Email is linked to your appointment history and cannot be changed
            here.
          </p>
        </div>
        <div>
          <label className="font-montserrat text-sm font-medium text-[#333333]">
            Phone (optional)
          </label>
          <PhoneInput
            international
            defaultCountry="US"
            value={phone || undefined}
            onChange={(value) => {
              setPhone(value ?? "");
              setPhoneError(null);
            }}
            onBlur={() => {
              const trimmed = phone.trim();
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
            className={`mt-1 ${phoneInputClassName}`}
          />
          {phoneError ? (
            <p className="mt-1 font-montserrat text-xs text-red-600">{phoneError}</p>
          ) : null}
        </div>
        <div>
          <label className="font-montserrat text-sm font-medium text-[#333333]">
            Address (optional)
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            maxLength={PATIENT_ADDRESS_MAX_CHARS}
            className="mt-1 w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
          />
          <CharCountFooter
            value={address}
            maxChars={PATIENT_ADDRESS_MAX_CHARS}
          />
        </div>
        {error ? (
          <p className="font-montserrat text-sm text-red-600">{error}</p>
        ) : null}
        {ok ? (
          <p className="font-montserrat text-sm text-emerald-700">{ok}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void save()}
            disabled={pending || !isDirty || isPhoneInvalid || addressOverLimit}
            className="cursor-pointer"
          >
            Save changes
          </Button>
          <Button
            variant="outline"
            onClick={() => void sendPasswordReset()}
            disabled={pending}
            className="cursor-pointer"
          >
            {profile?.hasPassword ? "Reset password" : "Set password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
