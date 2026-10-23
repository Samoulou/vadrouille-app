import "server-only";

import type { ProgrammeEcrit } from "@/prototype/programme-reduit";
import { entreeProgrammeDepuisBrief, type EntreeProgrammeP0 } from "@/server/p0/vers-couche-ia";

/**
 * Révision d'un voyage d'essai après le tri « J'aime / Pas pour moi » (spécification E2E-essai, lot 4 ; décision 0126) :
 * fonctions **pures**, sans lecture, réseau ni horloge.
 *
 * - `entreeRevisionDepuisProgramme` : entrée de la requête `revision`, tirée du programme stocké. Elle ne reprend que les
 *   **textes que l'IA a écrits** (date, titre du jour, heures, lieu, quartier, « pourquoi ») et les choix (identifiants
 *   maison). Elle ne lit jamais `placeId`, une position, un segment (temps de trajet), `exceptions` (badges), `source`
 *   (site vérifié), `locked`, `facts.durationMinutes`, les engagements (déjà dans le brief), le logement des terminus,
 *   les propositions ni le terminus du programme réduit : ni donnée Google, ni verdict d'ancrage (0011 § 1, 0117 § 3).
 *   Les étapes sans `placeId` (« à confirmer » à la lecture) sont rendues exactement comme les autres.
 * - `retirerEtapesEcartees` : filet du code après la lecture de la sortie (critère « une étape Pas pour moi est absente
 *   de la nouvelle version ») : tout créneau dont le lieu, normalisé, est celui d'une étape écartée est retiré.
 */

/** Choix du tri retenus pour la révision : identifiants d'étapes maison (`j<jour>-<rang>`), jamais un nom ni un lieu. */
export type ChoixRevision = { readonly pasPourMoi: readonly string[]; readonly jAime: readonly string[] };

/** Forme d'`EntreeRevision` (`src/ai/entree-revision.ts`), égalité vérifiée par le test du module. */
export type EntreeRevisionP0 = {
  brief: EntreeProgrammeP0;
  programme: {
    jours: {
      date: string;
      titre?: string;
      etapes: { id: string; debut: string; fin?: string; repas: boolean; lieu: string; quartier?: string; pourquoi?: string }[];
    }[];
  };
  choix: { pasPourMoi: string[]; jAime: string[] };
};

/** Brief du prototype, sous la forme lue par `entreeProgrammeDepuisBrief` (aucun import de `src/prototype/brief`). */
type Brief = Parameters<typeof entreeProgrammeDepuisBrief>[0];

type EtapeEcrite = Extract<ProgrammeEcrit["trip"]["days"][number]["items"][number], { type: "stop" }>["stop"];

/** Étapes du programme écrit, jour par jour, dans l'ordre (les seules lignes `stop` : ni terminus, ni trajet, ni pause). */
function etapesDuJour(jour: ProgrammeEcrit["trip"]["days"][number]): EtapeEcrite[] {
  return jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
}

/**
 * Entrée de la révision : brief (même projection que `programme`), textes de l'IA de la version précédente et choix.
 * Seuls les choix portant sur une étape du programme sont gardés (un identifiant inconnu est ignoré, jamais transmis).
 */
export function entreeRevisionDepuisProgramme(programme: ProgrammeEcrit, brief: Brief, choix: ChoixRevision): EntreeRevisionP0 {
  const jours = [...programme.trip.days].sort((a, b) => a.index - b.index);
  const ids = new Set(jours.flatMap((jour) => etapesDuJour(jour).map((etape) => etape.id)));
  const pasPourMoi = [...new Set(choix.pasPourMoi)].filter((id) => ids.has(id));
  const ecartees = new Set(pasPourMoi);
  const jAime = [...new Set(choix.jAime)].filter((id) => ids.has(id) && !ecartees.has(id));
  return {
    brief: entreeProgrammeDepuisBrief(brief),
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

/** Noms (écrits par l'IA) des étapes écartées du programme précédent. */
export function nomsEcartes(programme: ProgrammeEcrit, pasPourMoi: readonly string[]): string[] {
  const ecartees = new Set(pasPourMoi);
  return programme.trip.days.flatMap((jour) => etapesDuJour(jour).flatMap((etape) => (ecartees.has(etape.id) ? [etape.name] : [])));
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
