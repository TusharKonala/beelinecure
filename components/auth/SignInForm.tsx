"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavProgress } from "@/components/nav/NavigationIndicator";
import { getPostLoginPath } from "@/lib/post-login-redirect";
import { safeCallbackPath } from "@/lib/safe-callback-path";

export function SignInForm() {
  const { startProgress } = useNavProgress();
  const searchParams = useSearchParams();
  const callbackUrlRaw = searchParams.get("callbackUrl");
  const sanitizedCallbackUrl = safeCallbackPath(callbackUrlRaw);
  const registered = searchParams.get("registered") === "1";
  const registeredRole = searchParams.get("role");
  const verified = searchParams.get("verified") === "1";
  const reset = searchParams.get("reset") === "1";
  const resetMode = searchParams.get("mode") === "set" ? "set" : "reset";
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [magicLinkPending, setMagicLinkPending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    let didRedirect = false;
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        if (result.error === "EMAIL_NOT_VERIFIED") {
          setError("Please verify your email before signing in.");
        } else if (result.error === "DOCTOR_REJECTED") {
          setError(
            "Your doctor account was rejected by admin. Please contact support or sign up again with updated details.",
          );
        } else if (result.error === "DOCTOR_NOT_APPROVED") {
          setError(
            "Your doctor account is pending admin approval. Please try again after approval.",
          );
        } else {
          setError("Invalid email or password.");
        }
        return;
      }
      const session = await getSession();
      const fallbackPath = getPostLoginPath({
        role: session?.user?.role ?? null,
        doctorApprovalStatus: session?.user?.doctorApprovalStatus ?? null,
        profileComplete: session?.user?.profileComplete ?? true,
      });
      const nextPath =
        sanitizedCallbackUrl === "/patient/overview"
          ? fallbackPath
          : sanitizedCallbackUrl;
      window.location.assign(nextPath);
      didRedirect = true;
    } finally {
      if (!didRedirect) setPending(false);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setMagicLinkSent(false);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setMagicLinkPending(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          callbackUrl: sanitizedCallbackUrl,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMagicLinkSent(true);
    } finally {
      setMagicLinkPending(false);
    }
  }

  const inputClassName =
    "h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-montserrat text-[#333333] shadow-sm outline-none placeholder:text-[#5E5E5E]/70 focus-visible:border-[#2555F3] focus-visible:ring-[3px] focus-visible:ring-[#2555F3]/20";

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <div>
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          Sign in
        </h1>
        <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:text-base">
          Continue with Google, sign in with email and password, or use a
          one-time email link. New here?{" "}
          <Link
            href="/auth/signup"
            className="font-medium text-[#2555F3] hover:underline"
          >
            Create an account
          </Link>{" "}
          with your email to receive appointment updates.
        </p>
      </div>

      {registered && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-montserrat text-sm text-emerald-900">
          {registeredRole === "doctor"
            ? "Doctor account created. Verify your email first. Admin approval is required before dashboard access."
            : "Account created. Please verify your email before signing in."}
        </p>
      )}

      {verified && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-montserrat text-sm text-emerald-900">
          Email verified. You can sign in now.
        </p>
      )}

      {reset && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-montserrat text-sm text-emerald-900">
          {resetMode === "set"
            ? "Password set successfully. You can sign in now."
            : "Password reset successfully. You can sign in now."}
        </p>
      )}

      {magicLinkSent && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-montserrat text-sm text-emerald-900">
          If an account exists for this email, we sent a sign-in link. Check your
          inbox.
        </p>
      )}

      {error && (
        <p
          ref={errorRef}
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {!error && oauthError === "DOCTOR_NOT_APPROVED" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-montserrat text-sm text-amber-900">
          Your doctor account is pending admin approval.
        </p>
      )}
      {!error && oauthError === "DOCTOR_REJECTED" && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
          Your doctor account was rejected by admin. Please contact support or sign
          up again with updated details.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full cursor-pointer gap-2 rounded-xl border-[#e5e5e5] bg-white font-montserrat text-sm font-medium text-[#333333] shadow-sm hover:bg-[#fafafa] md:h-12 md:text-base"
        onClick={() => {
          startProgress();
          const googleCallback =
            sanitizedCallbackUrl === "/patient/overview"
              ? "/auth/post-signin"
              : sanitizedCallbackUrl;
          void signIn("google", { callbackUrl: googleCallback });
        }}
      >
        <GoogleMark className="size-5 shrink-0" aria-hidden />
        Continue with Google
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[#e5e5e5]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
            or
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="signin-email"
          className="font-montserrat text-sm font-medium text-[#333333]"
        >
          Email
        </label>
        <input
          id="signin-email"
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
          htmlFor="signin-password"
          className="font-montserrat text-sm font-medium text-[#333333]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="signin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
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
        <div className="text-right">
          <Link
            href="/auth/forgot-password"
            className="font-montserrat text-xs font-medium text-[#2555F3] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full cursor-pointer rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium hover:bg-[#1e44c7] md:h-12 md:text-base"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[#e5e5e5]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
            or
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={magicLinkPending || pending}
        className="h-11 w-full cursor-pointer rounded-xl border-[#e5e5e5] bg-white font-montserrat text-sm font-medium text-[#333333] shadow-sm hover:bg-[#fafafa] md:h-12 md:text-base"
        onClick={() => void sendMagicLink()}
      >
        {magicLinkPending ? "Sending link…" : "Email me a sign-in link"}
      </Button>

      <p className="text-center font-montserrat text-xs text-[#5E5E5E]">
        Uses the email address above. Link expires in 15 minutes.
      </p>

      <p className="text-center font-montserrat text-sm text-[#5E5E5E]">
        Don&apos;t have an account?{" "}
        <Link
          href="/auth/signup"
          className="font-medium text-[#2555F3] hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}

function GoogleMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
