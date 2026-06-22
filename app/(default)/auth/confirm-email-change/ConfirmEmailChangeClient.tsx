"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";

type ConfirmStatus =
  | "loading"
  | "success"
  | "invalid_link"
  | "expired"
  | "email_taken"
  | "missing_token"
  | "server_error";

export default function ConfirmEmailChangeClient({ token }: { token: string }) {
  const [status, setStatus] = useState<ConfirmStatus>("loading");

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
          `/api/admin/confirm-email-change?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => null)) as
          | { status?: string }
          | null;

        if (cancelled) return;

        const s = data?.status;
        if (s === "success") setStatus("success");
        else if (s === "expired") setStatus("expired");
        else if (s === "email_taken") setStatus("email_taken");
        else if (s === "invalid_link") setStatus("invalid_link");
        else setStatus("server_error");
      } catch {
        if (!cancelled) setStatus("server_error");
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
        Confirming your new email…
      </p>
    ) : status === "success" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-emerald-800 md:text-base">
          Your admin account email has been updated. Sign in with your new
          address from now on.
        </p>
        <Link
          href="/auth/signin"
          className="w-fit rounded-xl bg-[#2555F3] px-4 py-2 text-sm font-montserrat font-medium text-white hover:bg-[#1e44c7]"
        >
          Go to sign in
        </Link>
      </div>
    ) : status === "expired" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          This confirmation link has expired.
        </p>
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Sign in with your current email, open Admin Settings, and save your
          new email again to receive a fresh link.
        </p>
        <Link
          href="/auth/signin"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Sign in
        </Link>
      </div>
    ) : status === "email_taken" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          This email address is already in use by another account.
        </p>
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Sign in with your current admin email and choose a different address
          in Admin Settings if you still want to change it.
        </p>
        <Link
          href="/auth/signin"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Sign in
        </Link>
      </div>
    ) : status === "invalid_link" || status === "missing_token" ? (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Invalid confirmation link.
        </p>
        <Link
          href="/auth/signin"
          className="w-fit rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-montserrat font-medium text-[#333333] hover:bg-[#fafafa]"
        >
          Back to sign in
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          Something went wrong while confirming your email.
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
              Confirm email change
            </h1>
            {content}
          </div>
        </section>
      </Container>
    </div>
  );
}
