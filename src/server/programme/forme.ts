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

/**
 * Ville du brief de `api` à plusieurs villes (décision 0148 § 8 point 2) : nom **maison** (table des villes, contrôlé par
 * `controlerVilles`), date d'arrivée, nuits et texte de son logement (`texteDuLogement` avec **sa** ville).
 */
export type VilleDuBrief = { readonly nom: string; readonly arrivee: string; readonly nuits: number; readonly logement: string };

/**
 * Changement de ville du brief : la sortie du domaine (`ChangementDeVille` de `src/domain/changement-de-ville.ts`, forme
 * recopiée : ce module n'importe que `@/contracts`), **sans libellé** (décision 0149 § 1.2 : le libellé du billet ou du vol
 * devenu changement de ville ne va jamais au modèle).
 */
export type ChangementDuBrief = {
  readonly date: string;
  readonly de: string;
  readonly vers: string;
  readonly source: "entered" | "estimated";
  readonly depart: string;
  readonly arrivee?: string;
  readonly mode?: "car" | "transit";
  readonly activitesMax: number;
};

/**
 * Brief de la chaîne inversée sur `api` (décision 0148 § 8 point 2, `briefProgrammeDepuisFormulaire`) : une **extension** de
 * `BriefEssai`, auquel il reste assignable (les modules partagés n'en lisent que les champs communs).
 * - `villes` : 1 à `MAX_CITIES` villes, dans l'ordre ; `destination` est le nom maison de la première ;
 * - `logements` : un par ville, dans l'ordre, chacun avec `ville` (nom maison) : forme de `BriefAncrage` (0148 § 7.1 point 7) ;
 * - `changements` : un par ville ajoutée, sans libellé ;
 * - `billets` : libellé saisi de chaque billet ou vol devenu changement de ville, par date, **pour l'assemblage seulement**
 *   (`transfer.label`, stocké dans l'instantané comme dans `trip_commitments`) : jamais dans l'entrée d'un modèle ni dans
 *   une requête Google (0149 § 1.2) ;
 * - `engagements` : avec leur heure de fin (`fin`, 0149 § 5), **sans** ceux devenus changement de ville (ni événements, ni
 *   répétés au modèle, 0148 § 9 point 4).
 */
export type BriefProgramme = Omit<BriefEssai, "logements" | "engagements"> & {
  readonly villes: readonly VilleDuBrief[];
  readonly logements: readonly { readonly texte: string; readonly nuits: number; readonly ville: string }[];
  readonly changements: readonly ChangementDuBrief[];
  readonly billets: readonly { readonly date: string; readonly libelle: string }[];
  readonly engagements?: readonly {
    readonly libelle: string;
    readonly date: string;
    readonly heure: string;
    readonly fin?: string;
    readonly type: "reservation" | "ticket";
  }[];
};

/**
 * **Seul prédicat de bascule** une ville / plusieurs villes de la chaîne inversée (revue de la PR 932, condition du choix 1 ;
 * amendement de 0148, ticket #935) : un objet porte plusieurs villes s'il a une liste `villes` d'au moins deux entrées.
 * Lu par la conversion (`convertir`, `etapes-programme.ts`, sur la liste des villes du brouillon, avant que le brief
 * existe), l'étape « programme » (prompt v5, cadrage de l'étape 2 bis), la révision (prompt `revision` v3), l'assemblage
 * et la zone de vérification de la composition (`zoneDe`). Réexporté par `etapes-programme.ts` sous le même nom.
 * Invariant : un `BriefProgramme` de la chaîne n'est construit que pour deux villes ou plus (`convertir`).
 */
export function briefAPlusieursVilles<B extends object>(brief: B): brief is Extract<B, { readonly villes: readonly unknown[] }> & B {
  return "villes" in brief && Array.isArray(brief.villes) && brief.villes.length > 1;
}
