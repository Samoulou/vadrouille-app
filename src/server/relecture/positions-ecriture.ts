import "server-only";

import type { CodeEchecPositions, PortPositions, PositionGoogleFraiche } from "@/grounding/port-positions";
import { creerPortPositions } from "@/server/positions/cache-positions";

/**
 * Écriture au cache des positions **absentes** (décisions 0060 § 1.3 et 0100 § 3.2 point 4), partagée par la lecture
 * (`source.ts`) et par l'étape `e` de la génération (via la composition, 0081 B9-TL-9) : `lire` d'abord, puis `ecrire` des
 * seules positions fraîches dont le `placeId` n'est pas vivant dans le cache, par lots de `LOT_ECRITURE_POSITIONS`. Une
 * position rendue par `lire` n'est **jamais** réécrite. Ne lit aucune variable d'environnement (l'interrupteur est lu par
 * l'appelant), n'ouvre aucune transaction (celle de l'appelant porte l'écriture) et ne journalise rien. Importable par la
 * composition de la lecture, celle de la génération et `src/server/relecture/` (règle `ligne/relecture-imports`).
 */

/** Exécuteur SQL de la transaction ouverte (même forme que celui du port, `@/server/positions`). */
export type ExecuteurEcriturePositions = { query(texte: string, valeurs: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }> };

/** Taille d'un lot d'écriture au cache (0100 § 3.2 point 4). */
export const LOT_ECRITURE_POSITIONS = 500;

export type ResultatEcriturePositions =
  | { readonly ok: true; readonly ecrites: number }
  | { readonly ok: false; readonly code: CodeEchecPositions; readonly retryable: boolean };

/** Fabrique du port ; `creerPortPositions` par défaut, un double dans les tests (`coordonnées:`). */
export type FabriquePortPositions = (executeur: ExecuteurEcriturePositions) => PortPositions;

export async function ecrirePositionsAbsentes(
  executeur: ExecuteurEcriturePositions,
  fraiches: ReadonlyMap<string, PositionGoogleFraiche>,
  obtenuesA: number,
  creerPort: FabriquePortPositions = creerPortPositions,
): Promise<ResultatEcriturePositions> {
  if (fraiches.size === 0) return { ok: true, ecrites: 0 };
  const port = creerPort(executeur);
  const vivantes = await port.lire([...fraiches.keys()]);
  if (!vivantes.ok) return { ok: false, code: vivantes.code, retryable: vivantes.retryable };
  const absentes = [...fraiches].filter(([placeId]) => !vivantes.valeur.has(placeId));
  for (let debut = 0; debut < absentes.length; debut += LOT_ECRITURE_POSITIONS) {
    const ecrite = await port.ecrire(new Map(absentes.slice(debut, debut + LOT_ECRITURE_POSITIONS)), obtenuesA);
    if (!ecrite.ok) return { ok: false, code: ecrite.code, retryable: ecrite.retryable };
  }
  return { ok: true, ecrites: absentes.length };
}
