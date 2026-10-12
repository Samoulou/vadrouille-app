import { ErreurAncrage, type ClientPlaces, type ClientRoutes, type Coordonnees, type ModeRoutes } from "@/grounding/interfaces";
import type { Ancrage, AncrageResolu, Position, Trajets } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";

/**
 * Ancrage déterministe, en mémoire (spécification P0, étape 4 ; cadrage § 6.5). Chaque candidat est résolu en
 * `placeId` (Text Search « IDs only », biais sur la zone du séjour), puis vérifié par Place Details : statut,
 * position, horaires. Le nom, l'adresse, la note et le prix renvoyés par Google sont **ignorés** : ils ne sortent
 * pas de ce module. Un candidat non résolu ou fermé définitivement est marqué en mémoire seulement, sans trace par
 * lieu (P0-PO-5).
 */

/** Rayon du biais géographique autour du premier logement. */
export const RAYON_BIAIS_METRES = 30_000;

const STATUTS: Record<string, AncrageResolu["statut"]> = {
  OPERATIONAL: "ouvert",
  CLOSED_TEMPORARILY: "ferme_temporairement",
  CLOSED_PERMANENTLY: "ferme_definitivement",
};

async function ancrerTexte(texte: string, places: ClientPlaces, biais: Coordonnees | null): Promise<Ancrage> {
  const { placeIds } = await places.textSearch({
    texte,
    biais: biais === null ? null : { ...biais, rayonMetres: RAYON_BIAIS_METRES },
  });
  const placeId = placeIds[0];
  if (placeId === undefined) return { resolu: false };
  let details;
  try {
    details = await places.details(placeId);
  } catch (erreur) {
    if (erreur instanceof ErreurAncrage && erreur.code === "place_not_found") return { resolu: false };
    throw erreur;
  }
  return {
    resolu: true,
    placeId,
    statut: STATUTS[details.statut] ?? "ferme_definitivement",
    position: { lat: details.position.lat, lng: details.position.lng },
    horaires: details.horaires === null ? null : details.horaires.map(({ jour, debut, fin }) => ({ jour, debut, fin })),
  };
}

/** Logements du brief, résolus comme tout lieu ; un logement non résolu arrête l'exécution. */
export async function ancrerLogements(brief: Brief, places: ClientPlaces): Promise<AncrageResolu[]> {
  const resultat: AncrageResolu[] = [];
  for (const logement of brief.logements) {
    const ancrage = await ancrerTexte(`${logement.texte}, ${brief.destination}`, places, null);
    if (!ancrage.resolu || ancrage.statut === "ferme_definitivement") throw new ErreurAncrage("lodging_unresolved");
    resultat.push(ancrage);
  }
  return resultat;
}

export async function ancrerCandidats(
  candidats: readonly Candidat[],
  destination: string,
  places: ClientPlaces,
  biais: Position,
): Promise<Map<string, Ancrage>> {
  const ancrages = new Map<string, Ancrage>();
  for (const candidat of candidats) {
    ancrages.set(candidat.id, await ancrerTexte(`${candidat.nom}, ${destination}`, places, biais));
  }
  return ancrages;
}

/** Taille d'un bloc de matrice : 10 × 10 = 100 éléments par requête (limite des transports publics). */
export const BLOC_MATRICE = 10;

/**
 * Matrice de trajets entre `placeId`, en mémoire, découpée en requêtes de 100 éléments au plus. Les durées sont
 * converties en minutes (arrondi supérieur) et ne quittent jamais la mémoire.
 */
export async function matriceTrajets(placeIds: readonly string[], mode: ModeRoutes, routes: ClientRoutes): Promise<Trajets> {
  const ids = [...new Set(placeIds)];
  const minutes = new Map<string, number>();
  for (let i = 0; i < ids.length; i += BLOC_MATRICE) {
    for (let j = 0; j < ids.length; j += BLOC_MATRICE) {
      const origines = ids.slice(i, i + BLOC_MATRICE);
      const destinations = ids.slice(j, j + BLOC_MATRICE);
      const { secondes } = await routes.matrice({ origines, destinations, mode });
      origines.forEach((de, a) => {
        destinations.forEach((vers, b) => {
          const valeur = secondes[a]?.[b];
          if (typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0) {
            minutes.set(`${de}\u0000${vers}`, Math.ceil(valeur / 60));
          }
        });
      });
    }
  }
  return (depuis, vers) => (depuis === vers ? 0 : minutes.get(`${depuis}\u0000${vers}`));
}
