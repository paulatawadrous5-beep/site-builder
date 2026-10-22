import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Builder",
  description: "Create, customize, publish, and manage multiple client websites from one dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
