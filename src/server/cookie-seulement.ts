import "server-only";

/**
 * Seul l'en-tête `Cookie` est transmis à la lecture de la session (spécification B3, B3b point 9 ; décision 0077 § 5.3) :
 * aucun autre en-tête ne peut porter un identifiant. Une seule écriture pour le contexte de requête
 * (`src/server/session.ts`), la route de l'export (`src/server/routes/compte-export.ts`) et les actions du compte
 * (`src/server/actions/compte.ts`) ; revue consolidée de la PR 1127, mineur 4.
 */
export function cookieSeulement(source: Headers): Headers {
  const filtres = new Headers();
  const cookie = source.get("cookie");
  if (cookie !== null) filtres.set("cookie", cookie);
  return filtres;
}
