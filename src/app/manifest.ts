import type { MetadataRoute } from "next";

import { PRODUCT_NAME } from "@/config/site";

import designTokens from "../../docs/design-system/tokens.json";

/** Valeur d'une couleur de Ligne, lue dans `docs/design-system/tokens.json` à la construction (F10-TL-9). */
export function colorToken(name: string): string {
  const token = designTokens.color.tokens.find((candidate) => candidate.name === name);
  if (!token) throw new Error(`Token de couleur inconnu : ${name}`);
  return token.value;
}

/** Icônes provisoires (F10-Q5) : `scripts/icones-provisoires.mjs`, aux couleurs des tokens. */
export const MANIFEST_ICONS = [
  { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png" },
] as const;

/**
 * Manifeste de l'application (`R-manifeste`, `/manifest.webmanifest` ; spécification F10, F10b ; F10-PO-12,
 * F10-TL-9). Nom de la configuration (provisoire, Q1), `start_url` `/` (F11 pourra le remplacer par « Mes
 * voyages »), couleurs des tokens (fond `page`, provisoire UX/UI), icônes provisoires. Pas d'invite d'installation
 * propre à l'application : celle du navigateur suffit au MVP.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    lang: "fr",
    dir: "ltr",
    display: "standalone",
    start_url: "/",
    scope: "/",
    background_color: colorToken("page"),
    theme_color: colorToken("page"),
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon, purpose: "any" })),
  };
}
