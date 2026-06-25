"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";

type VerifyStatus =
  | "loading"
  | "success"
  | "already_verified"
  | "invalid_link"
  | "expired"
  | "missing_token"
  | "server_error";

export default function VerifyEmailClient({ token }: { token: string }) {
  const [status, setStatus] = useState<VerifyStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("missing_token");
        return;
      }

      setStatus("loading");
      try {
        const res = await fetch(
          `/api/verify-email?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => null)) as
          | { status?: VerifyStatus }
          | null;

        if (cancelled) return;

        setStatus(
          data?.status && typeof data.status === "string"
            ? (data.status as VerifyStatus)
            : "server_error",
        );
      } catch {
        if (cancelled) return;
        setStatus("server_error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const content =
    status === "loading" ? (
      <p className="font-montserrat text-sm text-[#5E5E5E] md:text-base">
        Verifying…
      </p>
    ) : status === "success" || status === "already_verified" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-emerald-800 md:text-base">
          Your email has been verified.
        </p>
        <Link
          href="/auth/signin?verified=1"
          className="w-fit rounded-xl bg-[#2555F3] px-4 py-2 text-sm font-montserrat font-medium text-white hover:bg-[#1e44c7]"
        >
          Go to sign in
        </Link>
      </div>
    ) : status === "expired" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          This verification link has expired.
        </p>
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Please sign up again to receive a new verification email.
        </p>
        <Link
          href="/auth/signup"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Create account
        </Link>
      </div>
    ) : status === "invalid_link" || status === "missing_token" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Invalid verification link.
        </p>
        <Link
          href="/auth/signup"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Create account
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Something went wrong while verifying your email.
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
    <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="mb-4 font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              Verify email
            </h1>
            {content}
          </div>
        </section>
      </Container>
    </div>
  );
}

