"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PhoneInput, {
  isValidPhoneNumber,
  parsePhoneNumber,
  type Country,
} from "react-phone-number-input";
import { z } from "zod";
import {
  CareersJobPostingSummary,
  type JobPostingSummaryData,
} from "@/components/careers-job-posting-summary";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import {
  extractPdfErrorMessage,
  extractTextFromPdfFile,
} from "@/lib/extract-pdf-text";

const phoneInputClassName =
  "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm placeholder:text-[#5E5E5E]/70 focus-within:border-[#2555F3] focus-within:ring-[3px] focus-within:ring-[#2555F3]/20 [&_.PhoneInputInput]:outline-none";

type ExtractedContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  phoneCountry: string | null;
};

function defaultCountryFromLocale(): Country {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new Intl.Locale(locale).region;
    if (region) return region as Country;
  } catch {
    // ignore unsupported locale parsing
  }
  return "US";
}

function parseContactPhone(
  raw: string,
  phoneCountry?: string | null,
): string | undefined {
  const trimmed = raw.trim();
  const localeCountry = defaultCountryFromLocale();
  const inferredCountry = phoneCountry?.trim().toUpperCase() as Country | undefined;
  const parsed =
    parsePhoneNumber(trimmed) ??
    (inferredCountry ? parsePhoneNumber(trimmed, inferredCountry) : undefined) ??
    parsePhoneNumber(trimmed, localeCountry) ??
    parsePhoneNumber(trimmed, "US");
  const e164 = parsed?.format("E.164");
  if (e164 && isValidPhoneNumber(e164)) {
    return e164;
  }
  return undefined;
}

function applyContactPrefill(
  contact: ExtractedContact,
  setName: (value: string) => void,
  setEmail: (value: string) => void,
  setPhone: (value: string | undefined) => void,
  setPhoneDefaultCountry: (value: Country) => void,
  setPhoneError: (value: string | null) => void,
  bumpPhoneInputKey: () => void,
) {
  if (contact.name?.trim()) {
    setName(contact.name.trim());
  }

  if (contact.email?.trim()) {
    const emailResult = z.email().safeParse(contact.email.trim());
    if (emailResult.success) {
      setEmail(emailResult.data);
    }
  }

  if (contact.phoneCountry) {
    setPhoneDefaultCountry(contact.phoneCountry as Country);
  }

  const e164 = contact.phone?.trim()
    ? parseContactPhone(contact.phone, contact.phoneCountry)
    : undefined;
  setPhone(e164);
  setPhoneError(null);
  bumpPhoneInputKey();
}

export default function ApplyPage() {
  const params = useParams();
  const jobId = typeof params.id === "string" ? params.id : "";
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [posting, setPosting] = useState<JobPostingSummaryData | null>(null);
  const [loadingPosting, setLoadingPosting] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>();
  const [phoneDefaultCountry, setPhoneDefaultCountry] = useState<Country>("US");
  const [phoneInputKey, setPhoneInputKey] = useState(0);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoadingPosting(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/careers/${jobId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load job");
        }
        setPosting(data.posting ?? null);
      } catch {
        setPosting(null);
      } finally {
        setLoadingPosting(false);
      }
    }
    void load();
  }, [jobId]);

  function validatePhoneOnBlur(value: string | undefined) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      setPhoneError("Phone number is required.");
      return false;
    }
    if (!isValidPhoneNumber(trimmed)) {
      setPhoneError("Please enter a valid phone number.");
      return false;
    }
    setPhoneError(null);
    return true;
  }

  async function handleResumeFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setExtracting(true);
    setPdfError(null);
    setResumeText("");
    setResumeFileName(null);
    setPhone(undefined);
    setPhoneError(null);
    setPhoneInputKey((k) => k + 1);

    try {
      const text = await extractTextFromPdfFile(file);
      setResumeText(text);
      setResumeFileName(file.name);

      try {
        const contactRes = await fetch("/api/careers/extract-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText: text }),
        });
        if (contactRes.ok) {
          const contact = (await contactRes.json()) as ExtractedContact;
          applyContactPrefill(
            contact,
            setName,
            setEmail,
            setPhone,
            setPhoneDefaultCountry,
            setPhoneError,
            () => setPhoneInputKey((k) => k + 1),
          );
        }
      } catch {
        // Non-blocking: resume is still loaded if contact extraction fails.
      }
    } catch (err) {
      setPdfError(extractPdfErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId) return;
    if (!validatePhoneOnBlur(phone)) return;

    setSubmitting(true);
    setError(null);
    try {
      const candidateTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const res = await fetch(`/api/careers/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone!.trim(),
          coverNote: coverNote.trim() || null,
          resumeText: resumeText.trim(),
          resumeUrl: resumeUrl.trim(),
          candidateTimezone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to submit application");
      }
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit application",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const phoneInvalid = Boolean(phoneError);
  const canSubmit =
    !submitting &&
    !extracting &&
    !phoneInvalid &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    resumeText.trim().length >= 50 &&
    resumeUrl.trim().startsWith("https://");

  if (loadingPosting) {
    return (
      <main className="py-12 md:py-16">
        <Container>
          <p className="font-montserrat text-sm text-[#5e5e5e]">Loading...</p>
        </Container>
      </main>
    );
  }

  if (!posting) {
    return (
      <main className="py-12 md:py-16">
        <Container>
          <div className="max-w-xl rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-8">
            <h1 className="font-montaga text-2xl text-[#b42318]">
              Job not found
            </h1>
            <Link
              href="/careers"
              className="mt-4 inline-block font-montserrat text-sm text-[#2555F3] hover:underline"
            >
              View careers
            </Link>
          </div>
        </Container>
      </main>
    );
  }

  if (success) {
    return (
      <main className="py-12 md:py-16">
        <Container>
          <div className="max-w-xl rounded-xl border border-[#d7f2d9] bg-[#effcf0] p-8">
            <h1 className="font-montaga text-2xl text-[#1f7a36]">
              Application submitted
            </h1>
            <p className="mt-2 font-montserrat text-sm text-[#333333]">
              Thank you for applying to {posting.title}. We will review your
              application and get back to you soon.
            </p>
            <Link
              href="/careers"
              className="mt-6 inline-block font-montserrat text-sm text-[#2555F3] hover:underline"
            >
              View other openings
            </Link>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="py-12 md:py-16">
      <Container>
        <Link
          href="/careers"
          className="font-montserrat text-sm text-[#2555F3] hover:underline"
        >
          ← Back to careers
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm">
            <CareersJobPostingSummary posting={posting} />
          </div>

          <div>
            <h1 className="font-montaga text-2xl text-[#333333] md:text-3xl">
              Apply for this role
            </h1>

            <div className="mt-4 rounded-xl border border-[#2555F3]/10 bg-[#F0F7FF] px-4 py-3">
              <p className="font-montserrat text-sm leading-relaxed text-[#333333]">
                Start by uploading your resume (PDF). We will try to pre-fill your
                name, email, and phone from your resume. Auto-fill may not work
                for every field, so please review and enter any missing details
                before you submit.
              </p>
            </div>

            <div className="mt-4">
              <span className="mb-1 block font-montserrat text-sm font-medium text-[#333333]">
                Resume (PDF) <span className="text-red-600">*</span>
              </span>
              <input
                ref={resumeInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => void handleResumeFileChange(e)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={extracting}
                  className="cursor-pointer rounded-xl border-[#e5e5e5] font-montserrat text-sm"
                  onClick={() => resumeInputRef.current?.click()}
                >
                  {extracting
                    ? "Reading PDF..."
                    : resumeFileName
                      ? "Replace PDF"
                      : "Upload resume (PDF)"}
                </Button>
                {resumeFileName && !extracting && !pdfError ? (
                  <span className="font-montserrat text-sm text-[#1f7a36]">
                    Resume loaded
                  </span>
                ) : null}
              </div>
              {resumeFileName && !pdfError ? (
                <p className="mt-1 font-montserrat text-xs text-[#5e5e5e]">
                  {resumeFileName}
                </p>
              ) : (
                <p className="mt-1 font-montserrat text-xs text-[#5e5e5e]">
                  PDF only, up to 5 MB. Text is extracted for our initial review.
                </p>
              )}
              {pdfError ? (
                <p className="mt-1 font-montserrat text-sm text-red-600">
                  {pdfError}
                </p>
              ) : null}
            </div>

            {error ? (
              <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
                <p className="font-montserrat text-sm text-[#b42318]">
                  {error}
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Full name <span className="text-red-600">*</span>
                </label>
                <input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Phone <span className="text-red-600">*</span>
                </label>
                <PhoneInput
                  key={phoneInputKey}
                  id="phone"
                  international
                  defaultCountry={phoneDefaultCountry}
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    setPhoneError(null);
                  }}
                  onBlur={() => validatePhoneOnBlur(phone)}
                  className={phoneInputClassName}
                />
                {phoneError ? (
                  <p className="mt-1 font-montserrat text-sm text-red-600">
                    {phoneError}
                  </p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="coverNote"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Cover note (optional)
                </label>
                <textarea
                  id="coverNote"
                  rows={4}
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                />
              </div>
              <div>
                <label
                  htmlFor="resumeUrl"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Resume link <span className="text-red-600">*</span>
                </label>
                <input
                  id="resumeUrl"
                  type="url"
                  required
                  placeholder="https://..."
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                  className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                />
                <p className="mt-1 font-montserrat text-xs text-[#5e5e5e]">
                  Public link to your resume (Google Drive, Dropbox, etc.). Must
                  use https://
                </p>
              </div>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7] sm:w-auto"
              >
                {submitting ? "Submitting..." : "Submit application"}
              </Button>
            </form>
          </div>
        </div>
      </Container>
    </main>
  );
}
