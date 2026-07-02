"use client";

import { useCallback, useState } from "react";

/**
 * Message state cleared only via `clear` or a UI dismiss action (no auto-TTL).
 */
export function useDismissibleMessage() {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const clear = useCallback(() => {
    setMessage(null);
  }, []);

  return { message, show, clear };
}
