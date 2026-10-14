import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/config/site";
import * as messages from "@/i18n/messages";
import "@/styles/globals.css";

import { hankenGrotesk } from "./fonts";
import { colorToken, MANIFEST_ICONS } from "./manifest";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: messages.produit.promesse,
  // Lien `apple-touch-icon`, lu par Safari sur iOS pour l'écran d'accueil (F10b ; icône provisoire, F10-Q5).
  icons: { apple: MANIFEST_ICONS[0].src },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Couleur de la barre du navigateur : celle du manifeste, lue dans les tokens Ligne (F10-TL-9).
  themeColor: colorToken("page"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={hankenGrotesk.variable}>
      <body className="bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
