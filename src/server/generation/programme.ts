import "server-only";

import { TripSnapshotSchema, type DaySnapshot, type TripSnapshot } from "@/contracts";
import { generer } from "@/domain/generation";
import type { EntreeMoteur } from "@/domain/entrees";

/**
 * Programme de l'aperçu sans jamais échouer sur « aucune option » (spécification B9, B9-PO-9 : `no_option` n'est **jamais** une
 * raison d'échec ; revue de la PR #563, bloquant 6). Le moteur refuse tout le programme quand un seul jour ne se planifie pas
 * (`generer` : refus `no_option`) ; l'aperçu ne doit pas pour autant perdre le jour qui se planifie.
 *
 * 1. Le programme entier d'abord (les jours planifiés ensemble, comme `generer`).
 * 2. Sinon **repli par jour**, dans l'ordre : chaque jour est planifié seul avec les candidats que les jours précédents n'ont
 *    pas utilisés (un lieu n'est retenu qu'une fois dans le voyage) ; un jour qui ne se planifie pas reprend sans candidat ni
 *    événement (ses seuls engagements) : il devient des cases `noOption`, les autres jours gardent leurs étapes.
 * 3. Un jour qui échoue même sans candidat (engagements incompatibles : donnée, pas absence d'option) rend `null` ; l'appelant
 *    l'arrête sur un code d'entrée, jamais sur `no_option`.
 * Le moteur est injectable (tests) ; aucun appel externe ni de modèle ici.
 */

export type MoteurDeGeneration = (entree: EntreeMoteur) => ReturnType<typeof generer>;

export function genererSansEchec(entree: EntreeMoteur, moteur: MoteurDeGeneration = generer): TripSnapshot | null {
  const complet = moteur(entree);
  if (complet.ok) return complet.instantane;

  const jours = entree.jours ?? [];
  let restants = entree.candidats;
  let base: TripSnapshot | undefined;
  const parJour = new Map<number, DaySnapshot>();
  for (const jour of jours) {
    let seul = moteur({ ...entree, jours: [jour], candidats: restants });
    if (!seul.ok) seul = moteur({ ...entree, jours: [jour], candidats: [], evenements: [] });
    if (!seul.ok) return null;
    base ??= seul.instantane;
    const construit = seul.instantane.days.find((d) => d.index === jour);
    if (construit === undefined) return null;
    parJour.set(jour, construit);
    const utilises = new Set(construit.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : [])));
    restants = restants.filter((candidat) => candidat.placeId === undefined || !utilises.has(candidat.placeId));
  }
  if (base === undefined) return null;
  return TripSnapshotSchema.parse({ days: base.days.map((d) => parJour.get(d.index) ?? d) });
}
