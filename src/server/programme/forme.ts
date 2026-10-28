import type { Brief as BriefDeLApp } from "@/contracts";

/**
 * Formes partagées du code commun de la chaîne inversée (décision 0136 § 1.1, M1a-1) : **types seulement**, pour que
 * `entree.ts` et `assemblage.ts`, chargés par `pnpm p0` sous Node nu, n'importent pas `brief.ts` (`server-only`,
 * `@/lib/fuseaux`, `@/server/config/moteur`). Tirées de `src/server/p0/depuis-formulaire.ts`, sans changement.
 *
 * Module pur, chargé par `pnpm p0` (exception nominative de `ligne/require-server-only`) : n'importe que `@/contracts`,
 * en type seulement. Le dossier `src/server/programme` n'atteint ni `src/ai`, `src/grounding`, `src/research`, ni
 * `src/prototype` (pas même en `import type`), ni `src/server/p0`, ni `src/adapters` (0136 § 1.2).
 */

/** Rythme du brief de l'essai (`RYTHMES` de `src/prototype/brief.ts`). */
export type RythmeEssai = "tranquille" | "equilibre" | "intense";

/** Brief de l'essai (forme de `BriefSchema`, schéma 1). */
export type BriefEssai = {
  readonly schema: 1;
  readonly destination: string;
  readonly pays: string;
  readonly fuseau: string;
  readonly arrivee: string;
  readonly depart: string;
  readonly heureArrivee: string;
  readonly heureDepart: string;
  readonly voyageurs: { readonly adultes: number; readonly enfants: number };
  readonly rythme: RythmeEssai;
  readonly envies: BriefDeLApp["wishes"];
  readonly aEviter?: BriefDeLApp["limits"];
  readonly deplacements: BriefDeLApp["mobility"];
  readonly budgetRepas?: 1 | 2 | 3;
  readonly logements: readonly { readonly texte: string; readonly nuits: number }[];
  readonly engagements?: readonly { readonly libelle: string; readonly date: string; readonly heure: string; readonly type: "reservation" | "ticket" }[];
  readonly recit?: string;
};
