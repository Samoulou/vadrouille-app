import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/config/site";
import { messages } from "@/i18n";
import "@/styles/globals.css";

import { hankenGrotesk } from "./fonts";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: messages.produit.promesse,
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
