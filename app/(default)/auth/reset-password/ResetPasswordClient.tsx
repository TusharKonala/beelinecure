"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/Container";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";

type TokenStatus = "checking" | "valid" | "invalid" | "expired" | "server_error";

export default function ResetPasswordClient({
  token,
  mode = "reset",
}: {
  token: string;
  mode?: "reset" | "set";
}) {
  const router = useRouter();
  const { redirectWithOverlay } = useRedirectOverlay();
  const isSetMode = mode === "set";
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPasswordMismatch, setConfirmPasswordMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkToken() {
      if (!token) {
        setTokenStatus("invalid");
        return;
      }

      try {
        const res = await fetch(
          `/api/reset-password?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => null)) as
          | { status?: "valid" | "invalid_link" | "expired" }
          | null;

        if (cancelled) return;

        if (data?.status === "valid") {
          setTokenStatus("valid");
          return;
        }
        if (data?.status === "expired") {
          setTokenStatus("expired");
          return;
        }
        setTokenStatus("invalid");
      } catch {
        if (cancelled) return;
        setTokenStatus("server_error");
      }
    }

    void checkToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const passwordsMismatch = confirmPasswordMismatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPasswordMismatch(true);
      return;
    }

    setPending(true);
    let didRedirect = false;
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to reset password.");
        return;
      }

      redirectWithOverlay(
        router,
        `/auth/signin?reset=1&mode=${isSetMode ? "set" : "reset"}`,
      );
      router.refresh();
      didRedirect = true;
    } finally {
      if (!didRedirect) setPending(false);
    }
  }

  const inputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm outline-none placeholder:text-[#5E5E5E]/70 focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20";

  const confirmInputClassName = passwordsMismatch
    ? `${inputClassName} border-red-300 pr-11 focus-visible:border-red-400 focus-visible:ring-red-200`
    : `${inputClassName} pr-11`;

  const body =
    tokenStatus === "checking" ? (
      <p className="font-montserrat text-sm text-[#5E5E5E] md:text-base">Checking reset link…</p>
    ) : tokenStatus === "valid" ? (
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="reset-password"
            className="font-montserrat text-sm font-medium text-[#333333]"
          >
            New password
          </label>
          <div className="relative">
            <input
              id="reset-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
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
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="reset-confirm-password"
            className="font-montserrat text-sm font-medium text-[#333333]"
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmPasswordMismatch(false);
                setError(null);
              }}
              onBlur={(e) => {
                const nextValue = e.target.value;
                setConfirmPasswordMismatch(
                  nextValue.length > 0 && password !== nextValue,
                );
              }}
              className={confirmInputClassName}
              aria-invalid={passwordsMismatch}
              aria-describedby={
                passwordsMismatch ? "reset-password-mismatch" : undefined
              }
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5E5E5E] outline-none hover:bg-[#f5f5f5] hover:text-[#333333] focus-visible:ring-2 focus-visible:ring-[#2555F3]/30"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={
                showConfirmPassword ? "Hide confirm password" : "Show confirm password"
              }
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? (
                <EyeOff className="size-4 shrink-0" />
              ) : (
                <Eye className="size-4 shrink-0" />
              )}
            </button>
          </div>
          {passwordsMismatch && (
            <p
              id="reset-password-mismatch"
              className="font-montserrat text-xs text-red-800"
              role="alert"
            >
              Passwords do not match.
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={pending || passwordsMismatch}
          className="h-11 w-full cursor-pointer rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium hover:bg-[#1e44c7] md:h-12 md:text-base"
        >
          {pending ? "Updating…" : isSetMode ? "Set password" : "Reset password"}
        </Button>
      </form>
    ) : tokenStatus === "expired" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          This reset link has expired.
        </p>
        <Link
          href="/auth/forgot-password"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Request a new link
        </Link>
      </div>
    ) : tokenStatus === "invalid" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Invalid reset link.
        </p>
        <Link
          href="/auth/forgot-password"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Request a new link
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Unable to verify reset link right now.
        </p>
        <Link
          href="/auth/signin"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Back to sign in
        </Link>
      </div>
    );

  return (
    <div className="w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="mb-4 font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              {isSetMode ? "Set your password" : "Reset password"}
            </h1>
            {body}
          </div>
        </section>
      </Container>
    </div>
  );
}

