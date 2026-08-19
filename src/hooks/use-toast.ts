import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Transient status-bar toast. `showToast` replaces the current toast and
 * auto-dismisses it; `setToast` is exposed for callers that want a sticky
 * message with no timer. `showToastRef` always points at the latest callback
 * so long-lived subscribers (listen, fs watch) don't need it as a dep.
 */
export function useToast(): {
  toast: string | null;
  setToast: (toast: string | null) => void;
  showToast: (msg: string, ms?: number) => void;
  showToastRef: RefObject<(msg: string, ms?: number) => void>;
} {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  return { toast, setToast, showToast, showToastRef };
}
