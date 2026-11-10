import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";

/**
 * Police de l'application (handover § 2), partagée par le layout racine et `global-error.tsx`, qui remplace
 * ce layout quand il est actif et doit charger la police lui-même (décision 0021 § 7).
 */
export const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-hanken-grotesk",
});

/**
 * Police de titrage de la page de précommande (décisions 0168 et 0169) : grotesque étroite à fort caractère, pour
 * les grands titres seulement, dans la même famille de formes que la police de Ligne. Variable (graisse, largeur,
 * taille optique). Jamais préchargée : seules les pages qui l'emploient la téléchargent.
 */
export const titrage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
  preload: false,
  variable: "--font-titrage",
});
