"use client";

import { useLayoutEffect } from "react";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";

export function ReviewOverlayDismiss() {
  const { stopRedirect } = useRedirectOverlay();

  useLayoutEffect(() => {
    stopRedirect();
  }, [stopRedirect]);

  return null;
}
