import "server-only";

import { ProposalRecordSchema, type Day, type ProposalRecord, type TripSnapshot } from "@/contracts";
import { etapeEnCase, joursHorsChangement, retenirApercu, selectionApercu } from "@/domain/apercu";

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

/**
 * `etapeAncreeEtRedigee` et la fabrique `retenirApercu` vivent dans `src/domain/apercu.ts` (règles de l'aperçu écrites une fois,
 * 0136 § 1.7), pour que la lecture de `src/server/voyages` applique **le même** `retenir` (M1a-3, § 3.5) ; réexportées ici.
 */
export { etapeAncreeEtRedigee, retenirApercu } from "@/domain/apercu";

/** Cases de l'aperçu, dans l'ordre du programme, positions 1 à 8 au plus. */
export function casesDuProgramme(jours: readonly Day[], instantane: TripSnapshot): CaseProgramme[] {
  // Journées d'un changement de ville retirées avant la sélection, qui ne change pas (0148 § 10.1 point 1 ; M4-PO-9).
  const candidates = joursHorsChangement(jours);
  const selection = selectionApercu(candidates, retenirApercu(candidates));
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
