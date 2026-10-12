import fr from "./fr.json";

/** Toutes les chaînes d'interface (handover § 10). Français uniquement au MVP. */
export const messages = fr;

export type Messages = typeof fr;

/** Remplace les variables `{nom}` d'un message de fr.json. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
