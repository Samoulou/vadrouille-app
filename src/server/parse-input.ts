import type { z } from "zod";

import type { Result } from "@/contracts";

/**
 * Revalide l'entrée d'une action serveur, reçue en `unknown` (décision 0017 § 3.4 et § 4, reprise par
 * 0020 § 11). Un échec devient `validation_failed` ; `field` est le chemin du premier champ refusé, en
 * pointé, construit **seulement** à partir des clés connues du schéma et des indices de tableau :
 * - une clé inconnue (`unrecognized_keys`) donne le chemin de l'objet parent, ou aucun `field` à la racine ;
 * - ni la valeur reçue, ni le message de Zod n'apparaissent dans la réponse.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Result<z.infer<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const path = issue ? safePath(issue) : [];
  const field = path.length > 0 ? path.join(".") : undefined;
  return field ? { ok: false, error: { code: "validation_failed", field } } : { ok: false, error: { code: "validation_failed" } };
}

/** Chemin de l'issue, limité aux clés du schéma ; arrêté au premier segment qui n'en serait pas une. */
function safePath(issue: z.core.$ZodIssue): string[] {
  const segments: string[] = [];
  for (const segment of issue.path) {
    if (typeof segment === "number") {
      segments.push(String(segment));
    } else if (typeof segment === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(segment)) {
      segments.push(segment);
    } else {
      break;
    }
  }
  return segments;
}
