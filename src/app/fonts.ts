import { Hanken_Grotesk } from "next/font/google";

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
