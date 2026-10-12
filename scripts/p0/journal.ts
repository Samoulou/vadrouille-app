/**
 * Journal du script P0 (spécification P0, « Journaux et messages d'erreur (redaction) »).
 *
 * - Le journal ne contient que des **codes d'une énumération fermée** et des compteurs : jamais un corps de
 *   réponse, un message d'erreur brut d'un fournisseur, une URL, un nom de lieu ni un `placeId`.
 * - Un filtre de redaction remplace toute occurrence de la valeur d'une clé par `[clé masquée]` **avant toute
 *   écriture** (journal, rapport, programme), en plus de la règle précédente.
 * Dans P0a1, aucune clé n'est lue : la liste des valeurs à masquer est vide hors des tests.
 */

export const CODES_JOURNAL = [
  // Étapes.
  "run_started",
  "brief_loaded",
  "research_done",
  "grounding_done",
  "notation_done",
  "planning_done",
  "reasons_done",
  "validation_done",
  "programme_written",
  "report_written",
  // Arrêts et erreurs (énumération fermée).
  "cost_cap_reached",
  "quota_reached",
  "real_mode_unavailable",
  "usage",
  "brief_name_invalid",
  "brief_not_found",
  "brief_invalid",
  "config_invalid",
  "fixtures_invalid",
  "data_collection_missing",
  "model_id_invalid",
  "model_unavailable",
  "model_error",
  "place_not_found",
  "routes_unavailable",
  "lodging_unresolved",
  "reduction_refused",
  "programme_invalid",
  "internal_error",
] as const;
export type CodeJournal = (typeof CODES_JOURNAL)[number];

/** Code fermé d'une erreur quelconque : son champ `code` s'il appartient à l'énumération, sinon `internal_error`. */
export function codeErreur(erreur: unknown): CodeJournal {
  const code = typeof erreur === "object" && erreur !== null ? (erreur as { code?: unknown }).code : undefined;
  return typeof code === "string" && (CODES_JOURNAL as readonly string[]).includes(code) ? (code as CodeJournal) : "internal_error";
}

export const MASQUE = "[clé masquée]";

/** Filtre de redaction : remplace chaque valeur secrète (4 caractères au moins) par `[clé masquée]`. */
export function creerRedacteur(secrets: readonly string[]): (texte: string) => string {
  const valeurs = [...new Set(secrets.filter((secret) => secret.length >= 4))].sort((a, b) => b.length - a.length);
  return (texte) => valeurs.reduce((resultat, secret) => resultat.split(secret).join(MASQUE), texte);
}

export type LigneJournal = { code: CodeJournal; compteurs?: Record<string, number> };

export type Journal = {
  ecrire(code: CodeJournal, compteurs?: Record<string, number>): void;
  lignes(): readonly string[];
};

/**
 * Journal à codes fermés. `sortie` reçoit chaque ligne déjà sérialisée **et** filtrée. Les compteurs ne gardent que
 * des nombres finis sous des noms courts (`[a-zA-Z0-9_.]`), jamais une chaîne.
 */
export function creerJournal(sortie: (ligne: string) => void, redacteur: (texte: string) => string): Journal {
  const lignes: string[] = [];
  return {
    ecrire(code, compteurs) {
      const propres: Record<string, number> = Object.fromEntries(
        Object.entries(compteurs ?? {}).filter(
          ([nom, valeur]) => /^[a-zA-Z0-9_.]{1,64}$/.test(nom) && typeof valeur === "number" && Number.isFinite(valeur),
        ),
      );
      const ligne: LigneJournal = Object.keys(propres).length === 0 ? { code } : { code, compteurs: propres };
      const texte = redacteur(JSON.stringify(ligne));
      lignes.push(texte);
      sortie(texte);
    },
    lignes: () => lignes,
  };
}
