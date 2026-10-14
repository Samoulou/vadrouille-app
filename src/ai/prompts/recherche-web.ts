import "server-only";

/**
 * Prompt de la recherche web réelle (décision 0055, section 7 ; client `src/ai/recherche-web-reelle.ts`). Le greffon de
 * recherche web du fournisseur cherche à partir du message de l'utilisateur, qui ne porte que le texte de la requête
 * construit par l'agent à partir du brief (aucune donnée Google). Seules les **sources** rendues par le fournisseur sont
 * gardées : le texte de la réponse du modèle est ignoré. Versionné : toute modification du texte augmente `version`.
 */
export const PROMPT_RECHERCHE_WEB = {
  id: "recherche-web",
  version: 1,
  texte: "Cherche sur le web la requête de l'utilisateur. Réponds en une phrase ; les sources de la recherche suffisent.",
} as const;
