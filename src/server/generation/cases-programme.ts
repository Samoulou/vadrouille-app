import "server-only";

import { ProposalRecordSchema, type Day, type ProposalRecord, type Stop, type TripSnapshot } from "@/contracts";
import { etapeEnCase, selectionApercu } from "@/domain/apercu";

/**
 * Cases de l'aperçu de la chaîne inversée (décision 0136 § 3.4 ; M1a-2), calculées à l'écriture depuis le voyage assemblé
 * et son instantané :
 * - **la même règle que le site d'essai** : `selectionApercu` de `src/domain/apercu.ts` (J1 puis J2, ordre écrit, engagements
 *   exclus, `MAX_PREVIEW_SLOTS` au plus), restreinte par son paramètre `retenir` aux étapes qui ont un `placeId` et une
 *   `reason` non vide (R1 de `PreviewSlotSchema`, `detour` obligatoire de `ProposalRecordSchema`) ; une étape écartée laisse
 *   sa place à la suivante et reste dans le programme (badgée à la lecture) ;
 * - `retenir` écarte aussi une étape dont le couple (jour, heure de début) est déjà pris par une case retenue : le contrat
 *   `PreviewSlotsSchema` interdit deux cases au même créneau (la suivante prend sa place, comme pour une étape sans lieu) ;
 * - contenu : `etapeEnCase` (identifiant, `kind`, jour, heure, catégorie **de repli** de 0124 § 5, segment précédent), l'étape
 *   et le segment **de l'instantané** (sans date de contrôle ni durée), `detour` = la `reason` de l'étape, validé par
 *   `ProposalRecordSchema` ; `candidate_id` nul (aucun candidat dans la chaîne inversée) ;
 * - **moins de 8 étapes retenues : moins de cases, aucune case `noOption`** (le programme de l'IA remplit ses journées) ;
 *   l'exécution finit alors `incomplete` (`statutDesCases`).
 */

export type CaseProgramme = {
  readonly type: "proposal";
  readonly position: number;
  readonly day: number;
  readonly time: string;
  readonly kind: "activity" | "meal";
  readonly candidatId: null;
  readonly contenu: ProposalRecord;
};

/** Étape retenue pour une case : un `placeId` et une `reason` non vide. */
export const etapeAncreeEtRedigee = (stop: Pick<Stop, "placeId" | "reason">): boolean => stop.placeId !== undefined && stop.reason !== undefined && stop.reason.trim() !== "";

/**
 * Fabrique du prédicat `retenir` de `selectionApercu` pour la chaîne inversée (0136 § 3.4 et § 3.5) : une étape ancrée et
 * rédigée (`etapeAncreeEtRedigee`) dont le créneau (jour, heure de début) n'est pas déjà pris par une étape retenue. Le
 * prédicat **garde un état** (les créneaux pris) : une fabrique neuve par sélection, appelée sur les étapes dans l'ordre de
 * `selectionApercu`. Exportée pour la lecture (M1a-3, § 3.5), qui applique le même `retenir`.
 */
export function retenirApercu(jours: readonly Pick<Day, "index" | "items">[]): (stop: Stop) => boolean {
  const jourDeLEtape = new Map<string, number>();
  for (const jour of jours) for (const ligne of jour.items) if (ligne.type === "stop") jourDeLEtape.set(ligne.stop.id, jour.index);
  const pris = new Set<string>();
  return (stop) => {
    if (!etapeAncreeEtRedigee(stop)) return false;
    const creneau = `${jourDeLEtape.get(stop.id) ?? 0}|${stop.start}`;
    if (pris.has(creneau)) return false;
    pris.add(creneau);
    return true;
  };
}

/** Cases de l'aperçu, dans l'ordre du programme, positions 1 à 8 au plus. */
export function casesDuProgramme(jours: readonly Day[], instantane: TripSnapshot): CaseProgramme[] {
  const selection = selectionApercu(jours, retenirApercu(jours));
  const stockees = new Map(
    instantane.days.flatMap((jour) =>
      jour.items.flatMap((ligne, rang) => {
        if (ligne.type !== "stop") return [];
        const avant = jour.items.at(rang - 1);
        return [[ligne.stop.id, { stop: ligne.stop, segment: rang > 0 && avant?.type === "segment" ? avant.segment : undefined }] as const];
      }),
    ),
  );
  const cases: CaseProgramme[] = [];
  for (const id of selection.etapes) {
    const jour = jours.find((j) => j.items.some((ligne) => ligne.type === "stop" && ligne.stop.id === id));
    if (jour === undefined) continue;
    const cas = etapeEnCase(jour, jour.items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.id === id));
    const stockee = stockees.get(id);
    if (cas === null || stockee === undefined || cas.stop.reason === undefined) continue;
    const contenu = ProposalRecordSchema.parse({
      id: cas.id,
      kind: cas.kind,
      day: cas.day,
      time: cas.time,
      stop: stockee.stop,
      category: cas.category,
      ...(cas.segmentAvant === undefined || stockee.segment === undefined ? {} : { travelFromPrevious: stockee.segment }),
      detour: cas.stop.reason,
    });
    cases.push({ type: "proposal", position: cases.length + 1, day: cas.day, time: cas.time, kind: cas.kind, candidatId: null, contenu });
  }
  return cases;
}

/** Fin de l'exécution : `ready` avec 8 cases, `incomplete` sinon (0105 § 8 point 3 ; 0136 § 3.4). */
export function statutDesCases(cases: readonly CaseProgramme[], attendues: number): "ready" | "incomplete" {
  return cases.length >= attendues ? "ready" : "incomplete";
}
