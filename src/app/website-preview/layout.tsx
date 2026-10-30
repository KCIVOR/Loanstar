import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Website draft preview",
  robots: { index: false, follow: false },
};

export default function WebsitePreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="website-preview">{children}</div>;
}
