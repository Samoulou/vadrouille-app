import "server-only";

import type { PortPositions, PositionGoogleFraiche, ResultatPositions } from "@/grounding/port-positions";
import { EchecPositions, type ExecuteurPositions, lirePositions } from "@/server/positions/lecture";

/**
 * Implémentation unique du port `PortPositions` (décision 0060 § 1.3, B8-TL-2 ; 0011 § 6 amendée par 0060 § 1.5).
 * Seul module hors de `db/`, `tests/db/` et `tests/support/` qui nomme la fonction d'écriture de la base (0060 § 1.4).
 * Importé par `src/server/voyages/**`, `src/server/relecture/**`, `src/workflows/**` et les tests seulement ; injecté
 * dans `src/grounding` par la composition (B8b, B9).
 *
 * `executeur` : le client de la transaction **déjà ouverte par `withOrg`**, contexte d'organisation posé. Le module
 * n'ouvre ni connexion ni transaction, ne pose aucun `set_config`, ne reçoit ni pool ni identifiant d'organisation.
 * Il ne lit aucune variable d'environnement (l'interrupteur `POSITIONS_ECRITURE_SUSPENDUE` est lu par la composition,
 * B8b, 0060 § 1.3) et n'écrit aucun journal.
 *
 * Erreurs : `{ ok: false, code, retryable }`, code fermé ; `retryable` vrai pour les seules classes SQLSTATE `08`
 * (connexion) et `40` (annulation de transaction). Jamais le message, les paramètres ni l'erreur d'origine (0052 § 1.8).
 */

/** Forme du `CHECK` de `place_coordinates.place_id` (même forme que `lecture.ts`). */
const FORME_PLACE_ID = /^[A-Za-z0-9_-]{1,256}$/;
/** Entrées par appel d'`ecrire`, au plus ; au-delà, l'appelant découpe en appels successifs dans la même transaction. */
const MAX_ENTREES = 500;
/** Âge maximal des positions écrites (0060 § 1.3 point 2) et avance tolérée de `obtenuesA` sur l'horloge. */
const AGE_MAX_MS = 60 * 60 * 1000;
const AVANCE_MAX_MS = 60 * 1000;

/**
 * Écriture en paramètres liés : `fetched_at` et `expires_at` sont posés par la fonction de la base, jamais ici
 * (0011 § 6 ; 29 jours depuis la migration `0008_positions_mvp_29_jours`, 0060 § 2).
 */
const SQL_ECRITURE =
  "SELECT public.store_place_coordinates(p, la, ln) FROM unnest($1::text[], $2::double precision[], $3::double precision[]) AS t(p, la, ln)";

const borne = (valeur: number, max: number) => Number.isFinite(valeur) && valeur >= -max && valeur <= max;

/** Vrai pour les classes SQLSTATE `08` et `40` seules ; faux pour toute autre erreur, dont `42501`. */
function rejouable(erreur: unknown): boolean {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(08|40)[0-9A-Z]{3}$/.test(code);
}

const echec = (code: "entree_invalide" | "perimees" | "base", retryable: boolean): ResultatPositions<never> => ({ ok: false, code, retryable });

export function creerPortPositions(executeur: ExecuteurPositions): PortPositions {
  return {
    async lire(placeIds) {
      try {
        return { ok: true, valeur: await lirePositions(executeur, placeIds) };
      } catch (erreur) {
        if (erreur instanceof EchecPositions) {
          return echec(erreur.code, erreur.code === "base" && erreur.sqlstate !== undefined && /^(08|40)/.test(erreur.sqlstate));
        }
        return echec("base", false);
      }
    },

    async ecrire(positions: ReadonlyMap<string, PositionGoogleFraiche>, obtenuesA: number) {
      if (positions.size === 0) return { ok: true, valeur: undefined };
      // 1. Contrôles en mémoire, avant toute requête : tout le lot est refusé.
      if (positions.size > MAX_ENTREES || !Number.isSafeInteger(obtenuesA)) return echec("entree_invalide", false);
      const placeIds: string[] = [];
      const lats: number[] = [];
      const lngs: number[] = [];
      for (const [placeId, position] of positions) {
        if (typeof placeId !== "string" || !FORME_PLACE_ID.test(placeId) || !borne(position.lat, 90) || !borne(position.lng, 180)) {
          return echec("entree_invalide", false);
        }
        placeIds.push(placeId);
        lats.push(position.lat);
        lngs.push(position.lng);
      }
      // 2. Fraîcheur : plus de 60 minutes, ou plus d'une minute dans le futur, rien n'est écrit.
      const maintenant = Date.now();
      if (maintenant - obtenuesA > AGE_MAX_MS || obtenuesA - maintenant > AVANCE_MAX_MS) return echec("perimees", false);
      // 3. Une requête en paramètres liés.
      try {
        await executeur.query(SQL_ECRITURE, [placeIds, lats, lngs]);
        return { ok: true, valeur: undefined };
      } catch (erreur) {
        return echec("base", rejouable(erreur));
      }
    },
  };
}
