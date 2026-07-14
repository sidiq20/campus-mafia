"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function PwaInit() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker.register("/sw.js").then(
      (registration) => {
        console.log("Service Worker registered with scope:", registration.scope);

        // Request notification permission
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }

        // Subscribe to push notifications when permission is granted
        if ("PushManager" in window && Notification.permission === "granted") {
          subscribeToPush(registration);
        }
      },
      (err) => {
        console.log("Service Worker registration failed:", err);
      }
    );

    // Listen for permission changes (user might grant later)
    if ("Notification" in window) {
      navigator.permissions?.query?.({ name: "notifications" }).then((status) => {
        status.onchange = () => {
          if (status.state === "granted" && "serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(subscribeToPush);
          }
        };
      });
    }
  }, []);

  return null;
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    // Get the VAPID public key from the server
    const res = await apiFetch("/api/push/vapid-public-key");
    if (!res.ok) {
      console.log("Push subscription: VAPID key not configured yet");
      return;
    }
    const { publicKey } = await res.json();

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });

    // Send subscription to server
    await apiFetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh_key: arrayBufferToBase64Url(subscription.getKey("p256dh")!),
        auth_key: arrayBufferToBase64Url(subscription.getKey("auth")!),
      }),
    });

    console.log("Push notification subscribed successfully");
  } catch (err) {
    console.log("Push subscription failed:", err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
