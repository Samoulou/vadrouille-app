import { format, messages } from "@/i18n";

const t = messages.ligne.duree;

/**
 * Durée en minutes au format de rédaction de Ligne (handover § 10, redaction.md) :
 * 10 → « 10 min », 60 → « 1 h », 90 → « 1 h 30 », 65 → « 1 h 05 ».
 */
export function formatDuree(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) {
    return format(t.minutes, { minutes });
  }
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (reste === 0) {
    return format(t.heures, { heures });
  }
  return format(t.heuresMinutes, { heures, minutes: String(reste).padStart(2, "0") });
}
