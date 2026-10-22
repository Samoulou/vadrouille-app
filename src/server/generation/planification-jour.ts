import "server-only";

import type { Brief, DaySnapshot, TripSnapshot } from "@/contracts";
import type { CandidatEvenement, CandidatMoteur, EntreeMoteur, Nuit } from "@/domain/entrees";
import type { Relectures } from "@/domain/relectures";
import { squeletteAvecEngagements, type JourSquelette } from "@/domain/squelette";
import { AGE_SOURCE_MAX_JOURS_APERCU, type CapaciteFinale, type LieuARedige } from "@/server/composition/generation";
import { CONFIGURATION_CLASSEMENT } from "@/server/config/classement";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";

import { ArretEtape } from "./codes";
import type { CandidatLu } from "./etapes";
import type { VilleDeLApercu, VoyageLu } from "./lecture";

/**
 * Module commun de la planification d'un jour **déjà relu** (décision 0119 § 1.5 point 2 : amendement de B9d porté par la PR
 * B10b-serveur). Code déplacé de l'étape `e` du workflow 4 (`etapes-complet.ts`) et appelé par les deux workflows qui
 * replanifient des jours par `replanifierJour` : le voyage complet (workflow 4) et le recalcul d'un tri (workflow 5,
 * `etapes-lot.ts`). **Aucune seconde copie** de la construction de l'entrée du moteur ni de la passe de raisons.
 *
 * Aucune lecture, aucune écriture : les relectures et les candidats arrivent de l'étape, en mémoire. La passe de raisons appelle
 * `rediger` par ville, avec les seuls champs maison des lignes `candidates` (nom, résumé, catégorie, type, source) : jamais une
 * fiche relue, un signal, une catégorie arrêtée, une raison de refus ni un texte de question (0120 S5 point 2).
 */

/** Entrée du moteur pour un jour du voyage : voyage, brief, nuits, engagements et configuration de la génération. */
export type ContexteMoteur = {
  readonly voyage: VoyageLu;
  readonly nuits: readonly Nuit[];
  readonly evenements: readonly CandidatEvenement[];
  readonly relectures: Relectures;
  readonly dateReference: string;
  /** Numéro de la version à écrire (dernière version relue + 1). */
  readonly version: number;
};

/** Entrée de `replanifierJour` : la même pour les deux workflows ; `avecEvenements` faux pour le repli sans candidat. */
export function entreeMoteur(contexte: ContexteMoteur, candidats: readonly CandidatMoteur[], avecEvenements = true): EntreeMoteur {
  const { voyage } = contexte;
  return {
    voyage: {
      destination: voyage.draft.destination,
      start: voyage.draft.start,
      end: voyage.draft.end,
      timeZone: voyage.timeZone,
      travellers: { adults: voyage.brief.travellers.adults, children: voyage.brief.travellers.children },
    },
    brief: voyage.brief,
    nuits: [...contexte.nuits],
    engagements: voyage.draft.commitments,
    candidats,
    evenements: avecEvenements ? contexte.evenements : [],
    idees: [],
    choix: new Map(),
    configuration: CONFIGURATION_MOTEUR,
    classement: { formule: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU },
    relectures: contexte.relectures,
    porteeR1: { evenementsSansLieu: "admis" as const },
    dateReference: contexte.dateReference,
    version: contexte.version,
    budgetTrajetReduit: false,
  };
}

/** Squelette (engagements compris) des jours `indices` du voyage, pour la demande de relectures de `CapaciteFinale.planifier`. */
export function squeletteDesJours(voyage: VoyageLu, nombreDeNuits: number, indices: ReadonlySet<number>): JourSquelette[] {
  return squeletteAvecEngagements({
    voyage: { start: voyage.draft.start, end: voyage.draft.end },
    pace: voyage.brief.pace,
    nombreDeNuits,
    engagements: voyage.draft.commitments,
    configuration: CONFIGURATION_MOTEUR,
    budgetTrajetReduit: false,
  }).filter((jour) => indices.has(jour.index));
}

/** Paramètres de classement de la demande de relectures (`EntreePlanifier.classement`). */
export const classementDe = (dateReference: string) => ({ classement: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU, dateReference });

/** Lieux de l'instantané hors des jours `indices` (étapes, événements, idées) : jamais repris pour ces jours (un lieu, une fois). */
export function lieuxAilleurs(instantane: TripSnapshot, indices: ReadonlySet<number>): Set<string> {
  const lieux = new Set<string>();
  for (const jour of instantane.days) {
    if (indices.has(jour.index)) continue;
    for (const item of jour.items) if (item.type === "stop" && item.stop.placeId !== undefined) lieux.add(item.stop.placeId);
    for (const evenement of jour.events) if (evenement.placeId !== undefined) lieux.add(evenement.placeId);
    if (jour.surprise?.placeId !== undefined) lieux.add(jour.surprise.placeId);
  }
  return lieux;
}

/** Lieux (`placeId`) des étapes d'un jour. */
export const lieuxDuJour = (jour: DaySnapshot): string[] => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []));

/** Lieu à rédiger depuis sa ligne `candidates` : champs maison seulement, source facultative. */
export const lieuARedige = (c: CandidatLu): LieuARedige => ({
  id: c.id,
  nom: c.nom,
  resume: c.resume,
  categorie: c.categorie,
  typeEtape: c.stopKind === "meal" ? "meal" : "activity",
  sourceUrl: c.sources.find((s) => s.url !== "")?.url,
});

/**
 * Une passe de raisons : pour chaque ville, **une** requête `raisons` (`rediger`) avec les lieux `aRediger` de cette ville qui
 * n'ont encore ni raison ni essai ; aucune requête pour une ville sans lieu. Les raisons obtenues sont ajoutées à `raisons`, les
 * lieux envoyés à `essayes`. Un refus du fournisseur arrête l'étape sur son code fermé.
 */
export async function passeDeRaisons(
  capacite: CapaciteFinale,
  brief: Brief,
  villes: readonly VilleDeLApercu[],
  aRediger: readonly CandidatLu[],
  raisons: Map<string, string>,
  essayes: Set<string>,
): Promise<void> {
  for (const ville of villes) {
    const lieux = aRediger.filter((c) => c.ville === ville.rang && !raisons.has(c.id) && !essayes.has(c.id)).map(lieuARedige);
    if (lieux.length === 0) continue;
    const issue = await capacite.rediger(brief, { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart }, lieux);
    if (!issue.ok) throw new ArretEtape(issue.code);
    for (const lieu of lieux) essayes.add(lieu.id);
    for (const [id, raison] of issue.valeur) raisons.set(id, raison.raison);
  }
}

/** Étapes d'un jour dont le lieu est celui d'un candidat connu (`parPlaceId`), dans l'ordre du jour. */
export function candidatsDuJour(jour: DaySnapshot, parPlaceId: ReadonlyMap<string, CandidatLu>, etapes?: ReadonlySet<string>): CandidatLu[] {
  return jour.items.flatMap((item) =>
    item.type === "stop" && item.stop.placeId !== undefined && parPlaceId.has(item.stop.placeId) && (etapes === undefined || etapes.has(item.stop.id))
      ? [parPlaceId.get(item.stop.placeId) as CandidatLu]
      : [],
  );
}

/** Le jour avec la raison de chaque étape dont le candidat en a une ; `etapes` : seules ces étapes (identifiants) la reçoivent. */
export function avecRaisons(jour: DaySnapshot, parPlaceId: ReadonlyMap<string, CandidatLu>, raisons: ReadonlyMap<string, string>, etapes?: ReadonlySet<string>): DaySnapshot {
  return {
    ...jour,
    items: jour.items.map((item) => {
      if (item.type !== "stop" || item.stop.placeId === undefined || (etapes !== undefined && !etapes.has(item.stop.id))) return item;
      const lu = parPlaceId.get(item.stop.placeId);
      const raison = lu === undefined ? undefined : raisons.get(lu.id);
      return raison === undefined ? item : { ...item, stop: { ...item.stop, reason: raison } };
    }),
  };
}
