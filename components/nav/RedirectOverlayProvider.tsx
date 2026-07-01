"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type RedirectOverlayContextValue = {
  startRedirect: (options?: {
    manualDismiss?: boolean;
    showDelayMs?: number;
  }) => void;
  stopRedirect: () => void;
  /** Client-side App Router navigation (in-app routes). */
  redirectWithOverlay: (
    router: AppRouterInstance,
    href: string,
    options?: { replace?: boolean },
  ) => void;
  /**
   * Full page navigation (session refresh, Stripe, magic links).
   * Use instead of bare window.location.* so the Redirecting overlay is shown.
   */
  redirectToLocation: (href: string) => void;
};

const RedirectOverlayContext = createContext<RedirectOverlayContextValue | null>(
  null,
);

export function RedirectOverlayProvider({ children }: { children: ReactNode }) {
  const [redirecting, setRedirecting] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const redirectingRef = useRef(false);
  const manualDismissOnlyRef = useRef(false);
  const showDelayTimeoutRef = useRef<number | null>(null);
  const startRedirectGenerationRef = useRef(0);

  const clearShowDelayTimeout = useCallback(() => {
    if (showDelayTimeoutRef.current != null) {
      window.clearTimeout(showDelayTimeoutRef.current);
      showDelayTimeoutRef.current = null;
    }
  }, []);

  const startRedirect = useCallback(
    (options?: { manualDismiss?: boolean; showDelayMs?: number }) => {
      const generation = ++startRedirectGenerationRef.current;
      clearShowDelayTimeout();

      manualDismissOnlyRef.current = options?.manualDismiss ?? false;

      const activate = () => {
        if (startRedirectGenerationRef.current !== generation) return;
        redirectingRef.current = true;
        setRedirecting(true);
      };

      const showDelayMs = options?.showDelayMs ?? 0;
      if (showDelayMs > 0) {
        showDelayTimeoutRef.current = window.setTimeout(activate, showDelayMs);
      } else {
        activate();
      }
    },
    [clearShowDelayTimeout],
  );

  const stopRedirect = useCallback(() => {
    startRedirectGenerationRef.current += 1;
    clearShowDelayTimeout();
    manualDismissOnlyRef.current = false;
    redirectingRef.current = false;
    setRedirecting(false);
  }, [clearShowDelayTimeout]);

  const redirectWithOverlay = useCallback(
    (
      router: AppRouterInstance,
      href: string,
      options?: { replace?: boolean },
    ) => {
      startRedirect();
      if (options?.replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [startRedirect],
  );

  const redirectToLocation = useCallback(
    (href: string) => {
      startRedirect();
      window.location.assign(href);
    },
    [startRedirect],
  );

  useEffect(() => {
    if (
      redirectingRef.current &&
      pathname !== pathnameRef.current &&
      !manualDismissOnlyRef.current
    ) {
      redirectingRef.current = false;
      setRedirecting(false);
    }
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!redirecting || manualDismissOnlyRef.current) return;

    const timeoutId = window.setTimeout(() => {
      if (redirectingRef.current && !manualDismissOnlyRef.current) {
        redirectingRef.current = false;
        setRedirecting(false);
      }
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [redirecting]);

  return (
    <RedirectOverlayContext.Provider
      value={{ startRedirect, stopRedirect, redirectWithOverlay, redirectToLocation }}
    >
      {children}
      {redirecting && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40"
          role="alertdialog"
          aria-modal="true"
          aria-busy="true"
          aria-label="Redirecting"
        >
          <Loader2
            className="size-10 animate-spin text-white"
            aria-hidden
          />
          <p className="mt-4 font-montserrat text-sm font-medium text-white">
            Redirecting…
          </p>
        </div>
      )}
    </RedirectOverlayContext.Provider>
  );
}

export function useRedirectOverlay() {
  const ctx = useContext(RedirectOverlayContext);
  if (!ctx) {
    throw new Error(
      "useRedirectOverlay must be used within RedirectOverlayProvider",
    );
  }
  return ctx;
}
