import type { Stop } from "@/contracts";
import type { AddedBy } from "@/contracts/values";

/**
 * Lieu à soi et adresse découverte (tâche M8b, ticket 1111 ; décision 0160 § 1.4 ; spécification M8 § 4). Un lieu ajouté
 * par la personne porte la marque `Stop.addedBy` : `person` (lieu à soi de M5d, décision 0147 § 6.1) ou `discovered`
 * (adresse découverte sur place). **Toute règle écrite pour un lieu à soi vaut pour les deux valeurs** (§ 4.3) : aucune
 * comparaison directe de `addedBy` à une valeur hors de ce module (vérifié par `tests/unit/lieu-a-soi-usages.test.ts`).
 *
 * Module chargé par le navigateur (`CLIENT_DOMAIN_PATTERN` de `eslint.config.mjs`) : une seule implémentation pour le
 * serveur, les écrans et `mock`, sans copie. Il n'importe que des types de `@/contracts` et de `@/contracts/values`, ni
 * `zod` ni `src/server`. Fonctions pures : aucune horloge lue ici (la date du jour est reçue).
 */

/** Date « AAAA-MM-JJ » (l'ordre des chaînes est celui des dates). */
type IsoDate = string;

/** Ce qu'une règle lit d'une étape : sa seule marque (`Stop.addedBy`). */
type EtapeMarquee = Pick<Stop, "addedBy">;

/**
 * Lieu ajouté par la personne : lieu à soi (`person`) ou adresse découverte (`discovered`). Vrai pour **toute** marque
 * posée : une valeur ajoutée plus tard à `ADDED_BY` reste par défaut hors des prompts, non signalable et remise après une
 * révision (échec fermé, 0147 § 12 S4 point 2). Accepte aussi une étape lue sans schéma (`addedBy` en chaîne).
 */
export function estLieuASoi(stop: { readonly addedBy?: string | undefined }): boolean {
  return stop.addedBy !== undefined;
}

/** Adresse découverte sur place (`discovered`) : fiche « Découvert sur place. », section de l'écran 16. */
export function estAdresseDecouverte(stop: EtapeMarquee): boolean {
  return stop.addedBy === "discovered";
}

/** Date du jour `jour` (1 = premier jour) d'un voyage qui commence le `start` ; `null` si `start` n'est pas une date. */
function dateDuJour(start: IsoDate, jour: number): IsoDate | null {
  const lu = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (lu === null || !Number.isSafeInteger(jour)) return null;
  const ms = Date.UTC(Number(lu[1]), Number(lu[2]) - 1, Number(lu[3]) + jour - 1);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/**
 * Marque d'un ajout (spécification § 4.1, M8-PO-6) : `discovered` si `aujourdhui` (date locale de la destination, à
 * l'application) est entre le premier et le dernier jour du voyage, bornes comprises, **et** que le jour visé est
 * aujourd'hui ou un jour passé ; sinon `person` (avant ou après le voyage, jour à venir, date illisible). Exemple
 * d'Édimbourg (2026-08-29 au 2026-09-03) : le 2026-08-31 pour J3 ou J2, `discovered` ; pour J4, `person` ; le 2026-08-20
 * pour J1, `person`. Jamais calculée à partir d'une valeur du client (S6) : l'appelant fournit l'horloge du serveur.
 */
export function marqueDAjout(voyage: { readonly start: IsoDate; readonly end: IsoDate }, jour: number, aujourdhui: IsoDate): AddedBy {
  if (aujourdhui < voyage.start || aujourdhui > voyage.end) return "person";
  const vise = dateDuJour(voyage.start, jour);
  return vise !== null && vise >= voyage.start && vise <= aujourdhui ? "discovered" : "person";
}
