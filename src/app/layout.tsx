import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans, Sora } from "next/font/google";
import "./globals.css";

import { PermissionsProvider } from "@/hooks/usePermissions";
import { BRANDING } from "@/lib/branding";

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LoanStar — Lending, charted clearly",
  description:
    "Trusted lending for Filipino seafarers — apply, track, and repay in one transparent portal.",
  icons: {
    icon: [{ url: BRANDING.iconUrl, type: "image/png", sizes: "180x180" }],
    apple: [{ url: BRANDING.iconUrl, type: "image/png", sizes: "180x180" }],
    shortcut: BRANDING.iconUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${publicSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col font-sans">
        <PermissionsProvider>{children}</PermissionsProvider>
      </body>
    </html>
  );
}
