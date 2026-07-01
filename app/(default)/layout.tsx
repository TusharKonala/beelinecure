import { BeelineCureMarketingNav } from "@/components/beeline-cure/BeelineCureMarketingNav";
import { Footer } from "@/components/Footer";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <BeelineCureMarketingNav />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
