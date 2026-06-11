"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogoMark } from "@/components/beeline-cure/LogoMark";
import {
  NavLink,
  NavigationProvider,
} from "@/components/nav/NavigationIndicator";

const navLinkClass =
  "font-montserrat text-sm font-semibold text-[#5E5E5E] transition-colors hover:text-[#2555F3]";
const navLinkMutedClass = navLinkClass;
const navCtaClass =
  "rounded-lg bg-[#2555F3] px-4 py-2 font-montserrat text-sm font-semibold text-white transition-colors hover:bg-[#1E44C7]";
const mobileNavItemClass = `${navLinkClass} flex min-h-11 w-full items-center py-3 text-left`;
const mobileNavCtaClass = `${navCtaClass} flex min-h-11 w-full items-center justify-center py-3`;

function handleSignOut() {
  void signOut({ callbackUrl: "/" });
}

function AuthNavLinks({
  isAuthenticated,
  dashboardHref,
  linkClass,
  onCloseMenu,
}: {
  isAuthenticated: boolean;
  dashboardHref: string;
  linkClass: string;
  onCloseMenu?: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <NavLink
        href="/auth/signin"
        className={linkClass}
        onClick={onCloseMenu}
      >
        Sign In
      </NavLink>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${linkClass} cursor-pointer`}
        onClick={() => {
          onCloseMenu?.();
          handleSignOut();
        }}
      >
        Sign out
      </button>
      <NavLink
        href={dashboardHref}
        className={linkClass}
        onClick={onCloseMenu}
      >
        Dashboard
      </NavLink>
    </>
  );
}

export function BeelineCureMarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const roleKey = typeof role === "string" ? role.toLowerCase() : "";
  const dashboardHref =
    roleKey === "patient"
      ? "/patient/overview"
      : roleKey === "doctor"
        ? "/doctor/overview"
        : roleKey === "admin"
          ? "/admin/dashboard"
          : "/patient/overview";

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <NavigationProvider>
      <header className="sticky top-0 z-50 w-full border-b border-black/10 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-1.5">
          <div className="flex items-center leading-none lg:hidden">
            <LogoMark height={51} priority />
          </div>
          <div className="hidden items-center leading-none lg:flex">
            <LogoMark height={58} priority />
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            <NavLink href="/" className={navLinkClass}>
              Home
            </NavLink>
            <NavLink href="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink href="/careers" className={navLinkClass}>
              Careers
            </NavLink>
            <AuthNavLinks
              isAuthenticated={isAuthenticated}
              dashboardHref={dashboardHref}
              linkClass={navLinkMutedClass}
            />
            <NavLink href="/book-appointment" className={navCtaClass}>
              Book Appointment
            </NavLink>
          </div>

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-[#333333] transition-colors hover:text-[#2555F3] lg:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span className="flex flex-col gap-1.5" aria-hidden>
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-black/10 bg-white px-6 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              <NavLink
                href="/"
                className={mobileNavItemClass}
                onClick={closeMobileMenu}
              >
                Home
              </NavLink>
              <NavLink
                href="/about"
                className={mobileNavItemClass}
                onClick={closeMobileMenu}
              >
                About
              </NavLink>
              <NavLink
                href="/careers"
                className={mobileNavItemClass}
                onClick={closeMobileMenu}
              >
                Careers
              </NavLink>
              <AuthNavLinks
                isAuthenticated={isAuthenticated}
                dashboardHref={dashboardHref}
                linkClass={mobileNavItemClass}
                onCloseMenu={closeMobileMenu}
              />
              <NavLink
                href="/book-appointment"
                className={`${mobileNavCtaClass} mt-3`}
                onClick={closeMobileMenu}
              >
                Book Appointment
              </NavLink>
            </div>
          </div>
        )}
      </header>
    </NavigationProvider>
  );
}
