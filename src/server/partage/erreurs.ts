import "server-only";

/**
 * Erreur de la base **sans détail** (spécification M6, critère 16 ; ticket 1013) : une erreur de Drizzle porte le texte de la
 * requête et ses paramètres (`Failed query: … params: …`), donc l'empreinte du jeton, et sa cause celle de `pg`. Elle
 * est remplacée par une erreur au message fixe, sans `cause` (page d'erreur commune, 500).
 */
export async function sansDetail<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch {
    throw new Error(message);
  }
}
