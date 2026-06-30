import type { Metadata } from "next";
import { BeelineCureDemoForm } from "@/components/beeline-cure/BeelineCureDemoForm";

export const metadata: Metadata = {
  title: "Request a Demo — BeelineCure",
  description:
    "Request a guided demo of BeelineCure for your clinic. We'll reach out within 24 hours.",
};

export default function DemoPage() {
  return (
    <div className="w-full min-w-0 font-montserrat text-[#333333]">
      <main className="relative flex flex-1 flex-col border-t border-black/10 bg-gradient-to-br from-[#0f1623] via-[#171717] to-[#0d1f2d] px-6 py-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(37,85,243,0.18),transparent_70%)]" />
        <div className="relative z-10 mx-auto w-full max-w-xl">
          <BeelineCureDemoForm />
        </div>
      </main>
    </div>
  );
}
