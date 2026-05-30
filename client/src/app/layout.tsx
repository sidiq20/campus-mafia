import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DepartmentOS: Campus Mafia",
  description: "Realtime social and gaming network. Survive, hack, and dominate.",
  openGraph: {
    title: "DepartmentOS: Campus Mafia",
    description: "Realtime social and gaming network. Survive, hack, and dominate.",
    url: "https://campus-mafia.vercel.app",
    siteName: "DepartmentOS",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "DepartmentOS - Campus Mafia",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DepartmentOS: Campus Mafia",
    description: "Realtime social and gaming network. Survive, hack, and dominate.",
    images: ["/opengraph-image.png"],
  },
};

import Providers from "./providers";
import PwaInit from "@/components/PwaInit";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00ff41" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <PwaInit />
          {children}
        </Providers>
      </body>
    </html>
  );
}
