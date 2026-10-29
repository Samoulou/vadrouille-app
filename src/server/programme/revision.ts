import "server-only";

import type { EntreeProgramme } from "./entree";

/**
 * Révision d'un programme après le tri « J'aime / Pas pour moi » (décision 0126 ; M1b, ticket 868) : fonctions **pures**,
 * sans lecture, réseau ni horloge, **partagées** par le site d'essai (`src/server/p0/revision.ts` les réexporte ou les
 * enveloppe, sans changement de comportement) et par la vraie app (recalcul `batch` de la chaîne inversée,
 * `src/server/generation/etapes-revision.ts`). Code tiré de `src/server/p0/revision.ts` par M1b, sur des formes
 * **structurelles** (le dossier n'atteint ni `src/prototype` ni `src/ai`, décision 0136 § 1.2) : le site d'essai passe les
 * journées de son programme écrit, la vraie app celles de l'instantané de `trip_versions`.
 *
 * - `entreeRevisionDepuisJours` : entrée de la requête `revision`. Elle ne reprend que les **textes que l'IA a écrits**
 *   (date, titre du jour, heures, lieu, quartier, « pourquoi ») et les choix (identifiants maison). Elle ne lit jamais
 *   `placeId`, une position, un segment (temps de trajet), `exceptions` (badges), `source` (site vérifié), `locked`,
 *   `facts.durationMinutes`, les événements (engagements, déjà dans le brief), le terminus ni les propositions : ni donnée
 *   Google, ni verdict d'ancrage (0011 § 1, 0117 § 3). Les étapes sans `placeId` sont rendues exactement comme les autres.
 * - `retirerEtapesEcartees` : filet du code après la lecture de la sortie (0126 § 4) : tout créneau dont le lieu, normalisé,
 *   est celui d'une étape écartée est retiré.
 */

/** Choix du tri retenus pour la révision : identifiants d'étapes maison (`j<jour>-<rang>`), jamais un nom ni un lieu. */
export type ChoixRevision = { readonly pasPourMoi: readonly string[]; readonly jAime: readonly string[] };

/** Forme d'`EntreeRevision` (`src/ai/entree-revision.ts`, que ce module n'importe pas) ; égalité vérifiée par les tests. */
export type EntreeRevisionProgramme = {
  brief: EntreeProgramme;
  programme: {
    jours: {
      date: string;
      titre?: string;
      etapes: { id: string; debut: string; fin?: string; repas: boolean; lieu: string; quartier?: string; pourquoi?: string }[];
    }[];
  };
  choix: { pasPourMoi: string[]; jAime: string[] };
};

/** Étape d'une journée telle que la révision la lit : les seuls champs écrits par l'IA, plus l'identifiant maison. */
export type EtapeRevisable = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly start: string;
  readonly end?: string;
  readonly facts: { readonly area?: string };
  readonly reason?: string;
};

/**
 * Journée d'un programme (forme commune à `Day` et à `DaySnapshot`) : seules ses lignes `stop` sont lues (ni terminus, ni
 * trajet, ni pause, ni événement).
 */
export type JourRevisable = {
  readonly index: number;
  readonly date: string;
  readonly theme?: string;
  readonly items: readonly { readonly type: string; readonly stop?: EtapeRevisable }[];
};

/** Étapes d'une journée, dans l'ordre (les seules lignes `stop`). */
function etapesDuJour(jour: JourRevisable): EtapeRevisable[] {
  return jour.items.flatMap((ligne) => (ligne.type === "stop" && ligne.stop !== undefined ? [ligne.stop] : []));
}

/**
 * Entrée de la révision : brief (même projection que `programme`, construite par l'appelant), textes de l'IA des journées et
 * choix. Seuls les choix portant sur une étape des journées sont gardés (un identifiant inconnu est ignoré, jamais transmis) ;
 * une étape à la fois aimée et écartée reste écartée.
 */
export function entreeRevisionDepuisJours(journees: readonly JourRevisable[], brief: EntreeProgramme, choix: ChoixRevision): EntreeRevisionProgramme {
  const jours = [...journees].sort((a, b) => a.index - b.index);
  const ids = new Set(jours.flatMap((jour) => etapesDuJour(jour).map((etape) => etape.id)));
  const pasPourMoi = [...new Set(choix.pasPourMoi)].filter((id) => ids.has(id));
  const ecartees = new Set(pasPourMoi);
  const jAime = [...new Set(choix.jAime)].filter((id) => ids.has(id) && !ecartees.has(id));
  return {
    brief,
    programme: {
      jours: jours.map((jour) => ({
        date: jour.date,
        ...(jour.theme === undefined ? {} : { titre: jour.theme }),
        etapes: etapesDuJour(jour).map((etape) => ({
          id: etape.id,
          debut: etape.start,
          ...(etape.end === undefined ? {} : { fin: etape.end }),
          repas: etape.kind === "meal",
          lieu: etape.name,
          ...(etape.facts.area === undefined ? {} : { quartier: etape.facts.area }),
          ...(etape.reason === undefined ? {} : { pourquoi: etape.reason }),
        })),
      })),
    },
    choix: { pasPourMoi, jAime },
  };
}

/** Noms (écrits par l'IA) des étapes écartées des journées. */
export function nomsEcartesDesJours(jours: readonly JourRevisable[], pasPourMoi: readonly string[]): string[] {
  const ecartees = new Set(pasPourMoi);
  return jours.flatMap((jour) => etapesDuJour(jour).flatMap((etape) => (ecartees.has(etape.id) ? [etape.name] : [])));
}

/** Nom comparable : minuscules, sans accents, signes réduits à une espace. */
export function nomNormalise(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type AvecCreneaux = { readonly jours: readonly { readonly creneaux: readonly { readonly lieu?: string }[] }[] };

/**
 * Retire de la sortie relue tout créneau dont le lieu est celui d'une étape écartée (comparaison sur `nomNormalise`).
 * Rend la sortie filtrée et le nombre de créneaux retirés (compteur maison, jamais un verdict d'ancrage).
 */
export function retirerEtapesEcartees<P extends AvecCreneaux>(programme: P, noms: readonly string[]): { readonly programme: P; readonly retires: number } {
  const ecartes = new Set(noms.map(nomNormalise).filter((nom) => nom !== ""));
  if (ecartes.size === 0) return { programme, retires: 0 };
  let retires = 0;
  const jours = programme.jours.map((jour) => {
    const creneaux = jour.creneaux.filter((creneau) => {
      const garde = creneau.lieu === undefined || !ecartes.has(nomNormalise(creneau.lieu));
      if (!garde) retires += 1;
      return garde;
    });
    return { ...jour, creneaux };
  });
  return { programme: { ...programme, jours } as P, retires };
}
