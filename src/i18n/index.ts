/**
 * Les textes eux-mêmes sont dans `@/i18n/messages` (un fichier par espace de noms, décision 0047) ; ce module
 * n'en importe aucun, pour qu'importer `format` n'embarque aucun texte.
 */

/** Remplace les variables `{nom}` d'un message de `src/i18n/fr/`. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
