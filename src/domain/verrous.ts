import type { DaySnapshot, StopSnapshot } from "@/contracts";

/**
 * R3 — étapes verrouillées inchangées (B5-PO-11 ; décision 0045 § 6, B5-TL-6) : **seule définition** de la règle.
 * Le validateur R3 du rapport l'appelle ; en B11, le serveur l'importe (`applyPatch`, aperçus de révision) et la
 * copie de l'interface (`lockedStopViolations`, F7a) disparaît. Ce fichier n'importe que `@/contracts`.
 *
 * Seul `Stop.locked` compte (0015 § 9) : un engagement verrouillé est protégé, un engagement déverrouillé ne l'est
 * pas, une étape verrouillée sans `commitment` l'est. Une étape protégée d'un jour touché (présent dans le
 * brouillon) est inchangée si elle garde son identifiant, son nom, son jour, ses heures de début et de fin et son
 * `placeId` (définition de `lockedStopViolations` de 0016 § 4.2, **étendue** au `placeId`) ; une étape protégée
 * d'un jour non touché ne doit apparaître dans aucun jour du brouillon.
 */

type JourAvecEtapes = Pick<DaySnapshot, "index" | "items">;

function etapesSituees(jours: readonly JourAvecEtapes[]): { jour: number; stop: StopSnapshot }[] {
  return jours.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" ? [{ jour: jour.index, stop: item.stop }] : [])));
}

/** Identifiants des étapes verrouillées que le brouillon modifierait, sans doublon, dans l'ordre de la base. */
export function etapesVerrouilleesModifiees(base: readonly JourAvecEtapes[], brouillon: readonly JourAvecEtapes[]): string[] {
  const touches = new Set(brouillon.map((jour) => jour.index));
  const apres = new Map(etapesSituees(brouillon).map((situee) => [situee.stop.id, situee]));
  const modifiees = new Set<string>();
  for (const { jour, stop } of etapesSituees(base)) {
    if (!stop.locked) continue;
    const suite = apres.get(stop.id);
    if (touches.has(jour)) {
      if (
        suite === undefined ||
        suite.jour !== jour ||
        suite.stop.name !== stop.name ||
        suite.stop.start !== stop.start ||
        suite.stop.end !== stop.end ||
        suite.stop.placeId !== stop.placeId
      ) {
        modifiees.add(stop.id);
      }
    } else if (suite !== undefined) {
      modifiees.add(stop.id);
    }
  }
  return [...modifiees];
}
