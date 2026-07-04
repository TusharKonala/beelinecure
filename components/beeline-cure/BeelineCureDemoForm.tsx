"use client";

import { useState } from "react";

const inputClassName =
  "w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 font-montserrat text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-[#2555F3] focus:ring-[3px] focus:ring-[#2555F3]/20 md:text-base";

const labelClassName =
  "mb-1.5 block font-montserrat text-sm font-medium text-white/80";

const NOTES_MAX_LENGTH = 500;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Email is required.";
  return isValidEmail(trimmed) ? null : "Please enter a valid email address.";
}

function isEmailRelatedError(message: string) {
  return /email/i.test(message);
}

export function BeelineCureDemoForm() {
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const emailInputClassName = emailError
    ? `${inputClassName} border-red-400/60 focus:border-red-400 focus:ring-red-400/20`
    : inputClassName;

  const canSubmit =
    !submitting &&
    fullName.trim().length > 0 &&
    clinicName.trim().length > 0 &&
    isValidEmail(email);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;

    const nextEmailError = validateEmail(email);
    if (nextEmailError) {
      setEmailError(nextEmailError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setEmailError(null);

    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          clinicName: clinicName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const message = data.error ?? "Failed to submit request";
        if (isEmailRelatedError(message)) {
          setEmailError(message);
          return;
        }
        throw new Error(message);
      }
      setSubmitted(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit request";
      if (isEmailRelatedError(message)) {
        setEmailError(message);
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center md:px-10 md:py-12">
        <p className="font-montserrat text-lg leading-relaxed text-white md:text-xl">
          Thanks! We&apos;ll reach out within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 md:px-10 md:py-10">
      <h1 className="font-montaga text-2xl font-semibold text-white md:text-3xl">
        Request a guided demo
      </h1>
      <p className="mt-2 font-montserrat text-sm leading-relaxed text-white/70 md:text-base">
        Tell us about your clinic and we&apos;ll schedule a walkthrough of
        BeelineCure.
      </p>

      {error ? (
        <div
          className="mt-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3"
          role="alert"
        >
          <p className="font-montserrat text-sm text-red-200">{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="fullName" className={labelClassName}>
            Full Name <span className="text-[#2555F3]">*</span>
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            aria-required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor="clinicName" className={labelClassName}>
            Clinic Name <span className="text-[#2555F3]">*</span>
          </label>
          <input
            id="clinicName"
            name="clinicName"
            type="text"
            required
            aria-required
            autoComplete="organization"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor="email" className={labelClassName}>
            Email <span className="text-[#2555F3]">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            aria-required
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "demo-email-error" : undefined}
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            onBlur={() => setEmailError(validateEmail(email))}
            className={emailInputClassName}
          />
          {emailError ? (
            <p
              id="demo-email-error"
              className="mt-1.5 font-montserrat text-xs text-red-300"
              role="alert"
            >
              {emailError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className={labelClassName}>
            Phone Number{" "}
            <span className="font-normal text-white/50">(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClassName}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={NOTES_MAX_LENGTH}
            placeholder="Anything you'd like us to know before the call."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClassName} resize-y`}
          />
          <p className="mt-1.5 text-right font-montserrat text-xs text-white/50">
            {notes.length} / {NOTES_MAX_LENGTH}
          </p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full cursor-pointer rounded-lg bg-[#2555F3] px-6 py-3.5 font-montserrat text-sm font-semibold text-white transition-colors hover:bg-[#1E44C7] disabled:cursor-not-allowed disabled:opacity-60 md:text-base"
        >
          {submitting ? "Sending…" : "Submit request"}
        </button>
      </form>
    </div>
  );
}
