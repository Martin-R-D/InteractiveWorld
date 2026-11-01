import { useEffect, useRef, useState } from "react";
import { AccountSession } from "./Account";

export function usePhotoLimit(account: AccountSession | null) {
  const identity = useRef(account?.token);
  identity.current = account?.token;
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  function update(value: unknown) {
    const delay = (value as { retryAfterMs?: unknown } | undefined)
      ?.retryAfterMs;
    if (typeof delay === "number" && Number.isFinite(delay) && delay >= 0) {
      setUntil(Date.now() + delay);
      setNow(Date.now());
    }
  }
  async function refresh(signal?: AbortSignal) {
    if (!account) return;
    try {
      const response = await fetch(account.endpoint + "/scene/limits", {
        headers: { Authorization: "Bearer " + account.token },
        signal: signal ?? AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (response.ok && !signal?.aborted && identity.current === account.token)
        update(data.photoLimit);
    } catch {
      /* The server still enforces limits if a status check fails. */
    }
  }
  useEffect(() => {
    setUntil(0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    void refresh(controller.signal);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [account?.endpoint, account?.token]);
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    seconds,
    update,
    refresh,
    label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  };
}
