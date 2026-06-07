import type { Metadata } from "next";
import BeelineCureHomepage from "@/components/BeelineCureHomepage";

export const metadata: Metadata = {
  title: "BeelineCure | Stop losing patients to missed calls and marketplaces",
  description:
    "Marketplaces get you discovered but when patients return they see hundreds of doctors and rebook anyone. Outside marketplaces, a static site and missed calls lose them instantly. BeelineCure gives your clinic 24/7 direct booking so every patient becomes yours to keep.",
};

export default function Home() {
  return <BeelineCureHomepage />;
}
