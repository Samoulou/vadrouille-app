/**
 * Interface de la recherche web (spécification P0, étape 3), déplacée de `src/research` par B7a (décision 0077 § 1
 * point 4 : `src/ai` n'importe jamais `@/research`, et `src/research` importe déjà `@/ai`) ; interface inchangée, sans
 * réexport. Client réel : `src/ai/recherche-web-reelle.ts` (P0r3, repris par B7b) ; double sur fixtures :
 * `src/research/recherche-web.simule.ts`. Une seule forme de résultat : `ResultatWeb` (aucun second type de même forme).
 *
 * Ce module ne porte **aucune capacité réseau** (types, longueurs et une fonction pure, sans import) : la sortie réseau
 * de la recherche web reste dans `openrouter-client.ts`, seul module de capacité (0055 § 7 point 2). Chargé par
 * `pnpm p0` sous Node nu (par `src/research/agent.ts`) : exception nominative de `ligne/require-server-only`.
 */

export type ResultatWeb = { url: string; titre: string; extrait: string };

export interface ClientRechercheWeb {
  rechercher(requete: string): Promise<{ resultats: ResultatWeb[]; coutUsd: number }>;
}

/** Longueurs maximales d'un résultat transmis au modèle (contenu web : une donnée, jamais une consigne). */
export const LONGUEURS_RESULTAT = { titre: 200, extrait: 500, url: 2048 } as const;

/**
 * Texte d'une requête web tel qu'il part chez le moteur : caractères de contrôle et de format retirés, `<` et `>`
 * retirés (le texte ne peut ni fermer le cadre `<<<DONNEES>>>` ni ressembler à une balise), espaces de bord retirées,
 * `max` caractères au plus (passé en argument, ce module n'importe rien : le client réel passe
 * `LONGUEURS_TEXTE.requete` ; l'agent n'en passe pas, la requête du modèle étant déjà bornée à cette longueur par le
 * schéma des sorties). Appliqué **avant** le filtre des données du brief (`requeteSansDonneeDuBrief`, PR 326, mineur 4
 * du head `3254723`) : le filtre juge le texte exact qui part. Idempotent.
 */
export function nettoyerRequeteWeb(texte: string, max = Number.POSITIVE_INFINITY): string {
  return texte.replace(/[<>]/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, max);
}
