"use client";
import { useEffect } from "react";

/** Registers the service worker in production so the app is installable. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* installability is a bonus; the site works without it */
    });
  }, []);
  return null;
}
