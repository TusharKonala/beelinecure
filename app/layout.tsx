import type { Metadata } from "next";
import { Geist, Geist_Mono, Montaga, Montserrat } from "next/font/google";
import { AdminNotificationToaster } from "@/components/admin/AdminNotificationToaster";
import { DoctorNotificationToaster } from "@/components/doctor/DoctorNotificationToaster";
import { QueryProvider } from "@/components/QueryProvider";
import { PatientNotificationToaster } from "@/components/patient/PatientNotificationToaster";
import { RedirectOverlayProvider } from "@/components/nav/RedirectOverlayProvider";
import { SessionProvider } from "@/components/SessionProvider";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const montaga = Montaga({
  variable: "--font-montaga",
  weight: "400",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeelineCure",
  description: "Patient and doctor care platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montaga.variable} ${montserrat.variable} antialiased`}
      >
        <SessionProvider>
          <RedirectOverlayProvider>
            <QueryProvider>
              {children}
              <PatientNotificationToaster />
              <DoctorNotificationToaster />
              <AdminNotificationToaster />
            </QueryProvider>
          </RedirectOverlayProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
