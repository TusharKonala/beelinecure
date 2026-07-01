"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type NavProgressContextValue = {
  startProgress: () => void;
};

const NavProgressContext = createContext<NavProgressContextValue | null>(null);

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const [showBar, setShowBar] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    if (showBar && pathname !== pathnameRef.current) {
      setShowBar(false);
    }
    pathnameRef.current = pathname;
  }, [pathname, showBar]);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setShowBar(false);
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const startProgress = useCallback(() => {
    setShowBar(true);
  }, []);

  return (
    <NavProgressContext.Provider value={{ startProgress }}>
      {children}
      {showBar && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[99] h-[4.5px] w-full bg-[#2555F3] md:h-1"
          aria-hidden
        />
      )}
    </NavProgressContext.Provider>
  );
}

export function useNavProgress() {
  const ctx = useContext(NavProgressContext);
  if (!ctx) {
    throw new Error("useNavProgress must be used within NavProgressProvider");
  }
  return ctx;
}

export function NavLink({
  href,
  className,
  children,
  onClick,
  showProgress = false,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  showProgress?: boolean;
}) {
  const navProgress = useContext(NavProgressContext);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (showProgress) {
      navProgress?.startProgress();
    }
    onClick?.();
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
