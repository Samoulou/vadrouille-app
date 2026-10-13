/**
 * Interface de la recherche web (spécification P0, étape 3). Le moteur réel (greffon `web` d'OpenRouter ou moteur
 * tiers) arrive avec la spécification suivante ; P0a1 ne livre que le double sur fixtures
 * (`recherche-web.simule.ts`).
 */

export type ResultatWeb = { url: string; titre: string; extrait: string };

export interface ClientRechercheWeb {
  rechercher(requete: string): Promise<{ resultats: ResultatWeb[]; coutUsd: number }>;
}

/** Longueurs maximales d'un résultat transmis au modèle (contenu web : une donnée, jamais une consigne). */
export const LONGUEURS_RESULTAT = { titre: 200, extrait: 500, url: 2048 } as const;
