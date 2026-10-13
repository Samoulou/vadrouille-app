import type { StopFacts } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatDuree } from "@/lib/duree";
import { formatNombre } from "@/lib/nombre";

const t = messages.ligne.faits;

/**
 * Ligne de faits d'une étape (évolution E3 de B2), seule implémentation : « {secteur}, {durée}, {coût} », dans cet
 * ordre, sans la partie absente. Durée par `formatDuree` ; coût 0 : « gratuit » ; coût > 0 : « ≈ {n} CHF »
 * (montant estimé, arrondi au franc, redaction.md). Chaîne vide quand aucun fait n'est connu : l'appelant n'affiche alors rien.
 */
export function formatFaits(facts: StopFacts): string {
  const parts: string[] = [];
  if (facts.area !== undefined) parts.push(facts.area);
  if (facts.durationMinutes !== undefined) parts.push(formatDuree(facts.durationMinutes));
  if (facts.costPerPerson !== undefined) {
    parts.push(facts.costPerPerson === 0 ? t.gratuit : format(t.cout, { n: formatNombre(Math.round(facts.costPerPerson)) }));
  }
  return parts.join(t.separateur);
}
