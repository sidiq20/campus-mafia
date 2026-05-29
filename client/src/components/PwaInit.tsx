"use client";

import { useEffect } from "react";

export default function PwaInit() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
          },
          (err) => {
            console.log("Service Worker registration failed:", err);
          }
        );
      });
    }
    
    // Request notification permission if not granted
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return null;
}
