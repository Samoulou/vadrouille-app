import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/config/site";
import { messages } from "@/i18n";
import "@/styles/globals.css";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-hanken-grotesk",
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: messages.meta.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={hankenGrotesk.variable}>
      <body className="bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
