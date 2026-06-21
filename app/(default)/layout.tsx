import { BeelineCureMarketingNav } from "@/components/beeline-cure/BeelineCureMarketingNav";
import { Footer } from "@/components/Footer";
import { NavProgressProvider } from "@/components/nav/NavigationIndicator";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NavProgressProvider>
      <div className="flex min-h-screen flex-col">
        <BeelineCureMarketingNav />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </div>
    </NavProgressProvider>
  );
}
