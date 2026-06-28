"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { Container } from "@/components/layout/Container";
import { getPostLoginPath } from "@/lib/post-login-redirect";
import { safeCallbackPath } from "@/lib/safe-callback-path";

export default function MagicLinkClient({
  token,
  callbackUrlRaw,
}: {
  token: string;
  callbackUrlRaw: string;
}) {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMessage, setErrorMessage] = useState(
    "This sign-in link is invalid or has expired. Please request a new one.",
  );

  const callbackUrl = safeCallbackPath(callbackUrlRaw);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("error");
        return;
      }

      const result = await signIn("credentials", {
        magicLinkToken: token,
        redirect: false,
      });

      if (cancelled) return;

      if (result?.error) {
        if (result.error === "DOCTOR_NOT_APPROVED") {
          setErrorMessage(
            "Your doctor account is pending admin approval. Please sign in again after approval.",
          );
        }
        setStatus("error");
        return;
      }

      const session = await getSession();
      const fallbackPath = getPostLoginPath({
        role: session?.user?.role ?? null,
        doctorApprovalStatus: session?.user?.doctorApprovalStatus ?? null,
        profileComplete: session?.user?.profileComplete ?? true,
      });
      const nextPath =
        callbackUrl === "/patient/overview" ? fallbackPath : callbackUrl;
      window.location.assign(nextPath);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, callbackUrl]);

  const body =
    status === "working" ? (
      <p className="font-montserrat text-sm text-[#5E5E5E] md:text-base">
        Signing you in…
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="font-montserrat text-sm text-red-800 md:text-base">
          {errorMessage}
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
              Sign in
            </h1>
            {body}
          </div>
        </section>
      </Container>
    </div>
  );
}
