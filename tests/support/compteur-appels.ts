import type { DoublesGeneration } from "@/server/composition/generation";

/**
 * Compteur d'appels de test : enveloppe chaque méthode des doubles de fournisseurs et compte les appels par famille
 * (`modeles`, `rechercheWeb`, `lecteur`, `places`, `routes`). Sert à prouver qu'aucun appel ne part après un refus.
 */
export type Compteurs = Record<keyof DoublesGeneration, number>;

export function compterAppels(doubles: DoublesGeneration, compteurs: Compteurs): DoublesGeneration {
  const envelopper = <T extends object>(famille: keyof DoublesGeneration, objet: T): T =>
    Object.fromEntries(
      Object.entries(objet).map(([nom, valeur]) => [
        nom,
        typeof valeur !== "function"
          ? valeur
          : (...args: unknown[]) => {
              compteurs[famille] += 1;
              return (valeur as (...a: unknown[]) => unknown).apply(objet, args);
            },
      ]),
    ) as T;
  return {
    modeles: envelopper("modeles", doubles.modeles),
    rechercheWeb: envelopper("rechercheWeb", doubles.rechercheWeb),
    lecteur: envelopper("lecteur", doubles.lecteur),
    places: envelopper("places", doubles.places),
    routes: envelopper("routes", doubles.routes),
  };
}

export const compteursVides = (): Compteurs => ({ modeles: 0, rechercheWeb: 0, lecteur: 0, places: 0, routes: 0 });
