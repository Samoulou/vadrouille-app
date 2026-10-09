import { format, messages } from "@/i18n";

const t = messages.ligne.dates;

/**
 * Date ISO « AAAA-MM-JJ » écrite en toutes lettres, comme une date dans une phrase (redaction.md) :
 * « 2026-08-15 » → « 15 août 2026 ». Lecture du texte seulement, sans fuseau horaire.
 */
export function formatDateLongue(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const name = month ? t.mois[month - 1] : undefined;
  if (!year || !name || !day) return iso;
  return format(t.longue, { day, month: name, year });
}
