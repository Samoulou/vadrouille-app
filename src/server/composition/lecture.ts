import "server-only";

import type { DemandeRelectures, SourceRelectures, VoyageARelire } from "@/domain/relectures";
import { creerClientsGoogle, envelopperClientsGoogle } from "@/server/composition/clients-google";
import { PLAFONDS_VARIANTE_SIMULEE, type PlafondsUsage } from "@/server/config/usage";
import { declarationsLectureSimulee, ecriturePositionsSuspendue, sourceReelleChoisie } from "@/server/env/relectures";
import { reglesDeLecture } from "@/server/relecture/regles";
import { creerSourceRelectures, type DependancesSource } from "@/server/relecture/source";
import { horlogeSysteme, type Horloge } from "@/server/usage/port";
import { executeurSql, withOrg } from "@/server/with-org";

/**
 * Composition de la lecture des voyages (B8b ; décision 0100 § 5, Q430) : câble la source réelle de relectures
 * (`src/server/relecture/source.ts`) à la fabrique commune des clients Google (`clients-google.ts`), au forfait de
 * relecture (`PLAFONDS_USAGE` et la table de prix), à `withOrg` et à l'interrupteur des écritures de positions. **Câble
 * seulement** : aucune logique de lecture, aucune lecture de clé ici (chaque client la lit à sa construction, après la barrière de sortie).
 *
 * - **Seconde composition** après celle de la génération (`generation.ts`, B9c, future) : un chemin vers `src/grounding`
 *   n'est admis que par la fabrique commune, importée par ce module (règle `ligne/relecture-imports`, test du graphe).
 *   Importé par `src/adapters/index.ts` (branchement de `getTripAdapter("api")`, B6b ou B8b selon l'ordre de fusion,
 *   0100 § 5.4) et les tests seulement.
 * - **Sélection** (0100 § 5.3) : la source réelle n'est choisie que si l'environnement résolu est `local` et que
 *   `RELECTURES_SOURCE` vaut `google` ; sinon l'appelant garde le double de `src/mocks/relectures-voyages.ts` (`ci`).
 *   Tout autre environnement lève dans la garde de `getTripAdapter("api")`, inchangée (0086 § 2.1).
 * - **Plafonds** : `PLAFONDS_USAGE` vaut `null` (question 8.1 de 0100, argent : Samuel), donc la source réelle rend
 *   `unavailable` (échec fermé) tant que des plafonds n'y sont pas posés : aucune lecture réelle sans eux.
 */

export type OptionsLecture = {
  /** Plafonds du forfait (défaut : `PLAFONDS_USAGE`, `null` en production). */
  readonly plafonds?: PlafondsUsage | null;
  readonly horloge?: Horloge;
  /** Remplacements de test : transaction, clients, interrupteur des positions. */
  readonly transaction?: DependancesSource["transaction"];
  readonly clients?: DependancesSource["clients"];
  readonly positionsSuspendues?: DependancesSource["positionsSuspendues"];
  /** Environnement lu par la sélection (défaut : `process.env`) ; les tests l'injectent. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

/**
 * Source réelle de relectures, câblée sur `withOrg` et la fabrique des clients Google. **Refuse hors `local` avec
 * `RELECTURES_SOURCE=google`** (0100 § 5.3) : la règle ne dépend pas du seul appelant `choisirSourceRelectures` ; elle
 * lève sans message ni valeur, avant toute construction.
 */
export function creerSourceLecture(options: OptionsLecture = {}): SourceRelectures {
  if (!sourceReelleChoisie(options.env)) throw new Error("lecture: source réelle non choisie");
  const horloge = options.horloge ?? horlogeSysteme;
  return creerSourceRelectures({
    regles: reglesDeLecture(horloge, options.plafonds),
    transaction: options.transaction ?? ((contexte) => (fn) => withOrg(contexte, (tx) => fn(executeurSql(tx)))),
    clients: options.clients ?? creerClientsGoogle,
    positionsSuspendues: options.positionsSuspendues ?? (() => ecriturePositionsSuspendue()),
    horloge,
  });
}

/**
 * Source de relectures de l'adaptateur `api` : la source réelle si `sourceReelleChoisie(env)` (environnement `local` et
 * `RELECTURES_SOURCE=google`, 0100 § 5.3) ; sinon, en `local` et en `ci`, `repli` (le double de B6) **complété** pour les
 * voyages générés par la variante simulée (`avecVoyagesGeneresSimules`, B9e) ; partout ailleurs, `repli` seul. La source
 * réelle n'est construite que dans le premier cas.
 */
export function choisirSourceRelectures(repli: SourceRelectures, env?: Readonly<Record<string, string | undefined>>): SourceRelectures {
  if (sourceReelleChoisie(env)) return creerSourceLecture({ env });
  const declarations = declarationsLectureSimulee(env);
  return declarations === null ? repli : avecVoyagesGeneresSimules(repli, declarations);
}

/**
 * Préfixe des `placeId` des fixtures d'Édimbourg de la variante simulée (`prototype/fixtures/places/edimbourg.json` :
 * valeurs sentinelles fabriquées, aucune réponse réelle). Le double de B6 ne les connaît pas (`mock_place_`, `test_place_`).
 */
export const PREFIXE_LIEU_FIXTURES = "SENTINELLE_PLACE_ID";

/** Lieux d'une lecture : nuits, lieux demandés et points des trajets. */
function lieuxDeLaLecture(voyage: VoyageARelire, demande: DemandeRelectures): string[] {
  const points = demande.trajets.flatMap((t) => [t.depuis, t.vers]).flatMap((p) => ("lieu" in p ? [p.lieu] : []));
  return [...voyage.logementsParNuit.filter((l): l is string => l !== null), ...demande.lieux.map((l) => l.placeId), ...points];
}

/**
 * Lecture d'un voyage **généré par la variante simulée** (spécification B9, B9e point 3 : « Mes voyages » et Séjour du bout
 * en bout simulé ; à valider par le Tech Lead, question de la PR). La génération simulée écrit les `placeId` des fixtures
 * d'Édimbourg, que le double de B6 ne connaît pas : sans cette source, Séjour d'un voyage généré rend `travel_unknown`.
 *
 * - **Aiguillage** : si chaque lieu de la lecture porte le préfixe des fixtures, la lecture passe par la source de B8b
 *   (`creerSourceRelectures`) sur les doubles Places et Routes des fixtures, enveloppés dans la même réservation que les
 *   clients réels (`envelopperClientsGoogle`) ; sinon, `repli` (le double de B6, inchangé pour ses voyages).
 * - **Jamais réel** : environnement résolu `local` ou `ci` seulement (`declarationsLectureSimulee`, sinon `repli` seul) ;
 *   aucun client réel construit ; forfait de relecture sur les valeurs de test de la variante simulée
 *   (`PLAFONDS_VARIANTE_SIMULEE`) ; aucune écriture de position (`positionsSuspendues` vrai) : les positions des fixtures ne
 *   viennent pas de Google.
 * - **Fixtures** : lues à l'appel par `fixtures-simulees.ts`, atteint par `import()` dynamique (décision 0105 § 2), qui
 *   refuse de lire en production ou sous une déclaration inconnue.
 */
export function avecVoyagesGeneresSimules(repli: SourceRelectures, declarations: Readonly<Record<string, string | undefined>>): SourceRelectures {
  return {
    async pour(voyage, demande) {
      const lieux = lieuxDeLaLecture(voyage, demande);
      if (lieux.length === 0 || !lieux.every((l) => l.startsWith(PREFIXE_LIEU_FIXTURES))) return repli.pour(voyage, demande);
      let doubles;
      try {
        doubles = (await (await import("@/server/composition/fixtures-simulees")).chargerDoublesEdimbourg(declarations))();
      } catch {
        return { ok: false, refus: "unavailable" };
      }
      const bases = { places: doubles.places, routes: doubles.routes };
      const source = creerSourceRelectures({
        regles: reglesDeLecture(horlogeSysteme, PLAFONDS_VARIANTE_SIMULEE),
        transaction: (contexte) => (fn) => withOrg(contexte, (tx) => fn(executeurSql(tx))),
        clients: (options) => envelopperClientsGoogle(bases, options),
        positionsSuspendues: () => true,
        horloge: horlogeSysteme,
      });
      return source.pour(voyage, demande);
    },
  };
}
