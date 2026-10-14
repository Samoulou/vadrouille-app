import { ErreurAncrage, type ClientPlaces, type ClientRoutes, type Coordonnees, type DetailsLieu, type ModeRoutes } from "@/grounding/interfaces";
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

// Map plutôt qu'un objet : un statut inattendu (`constructor`…) ne remonte jamais au prototype.
const STATUTS: ReadonlyMap<string, AncrageResolu["statut"]> = new Map([
  ["OPERATIONAL", "ouvert"],
  ["CLOSED_TEMPORARILY", "ferme_temporairement"],
  ["CLOSED_PERMANENTLY", "ferme_definitivement"],
]);

/**
 * Ancrage d'une fiche Place Details : statut traduit par `STATUTS` (un statut inattendu vaut fermé définitivement),
 * position et horaires recopiés champ par champ. Nom, adresse, note et prix ne sont pas recopiés. Partagée avec les
 * fonctions de `p0Run` (`ancrage-zone.ts`, 0055 § 6 point 3 : réutilisée, jamais recopiée).
 */
export function ancrageDeFiche(placeId: string, details: DetailsLieu): AncrageResolu {
  return {
    resolu: true,
    placeId,
    statut: STATUTS.get(details.statut) ?? "ferme_definitivement",
    position: { lat: details.position.lat, lng: details.position.lng },
    horaires: details.horaires === null ? null : details.horaires.map(({ jour, debut, fin }) => ({ jour, debut, fin })),
  };
}

/** Fiche d'un lieu, ou `null` si elle est introuvable (`place_not_found`) ; toute autre erreur est propagée. */
export async function ficheOuNull(placeId: string, places: Pick<ClientPlaces, "details">): Promise<AncrageResolu | null> {
  try {
    return ancrageDeFiche(placeId, await places.details(placeId));
  } catch (erreur) {
    if (erreur instanceof ErreurAncrage && erreur.code === "place_not_found") return null;
    throw erreur;
  }
}

async function ancrerTexte(texte: string, places: ClientPlaces, biais: Coordonnees | null): Promise<Ancrage> {
  const { placeIds } = await places.textSearch({
    texte,
    biais: biais === null ? null : { ...biais, rayonMetres: RAYON_BIAIS_METRES },
  });
  const placeId = placeIds[0];
  if (placeId === undefined) return { resolu: false };
  return (await ficheOuNull(placeId, places)) ?? { resolu: false };
}

/** Un logement du brief, résolu comme tout lieu ; non résolu ou fermé définitivement : l'exécution s'arrête. */
export async function ancrerLogement(logement: Brief["logements"][number], destination: string, places: ClientPlaces): Promise<AncrageResolu> {
  const ancrage = await ancrerTexte(`${logement.texte}, ${destination}`, places, null);
  if (!ancrage.resolu || ancrage.statut === "ferme_definitivement") throw new ErreurAncrage("lodging_unresolved");
  return ancrage;
}

/** Logements du brief, résolus comme tout lieu ; un logement non résolu arrête l'exécution. */
export async function ancrerLogements(brief: Brief, places: ClientPlaces): Promise<AncrageResolu[]> {
  const resultat: AncrageResolu[] = [];
  for (const logement of brief.logements) resultat.push(await ancrerLogement(logement, brief.destination, places));
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

/** Clé d'une paire (origine, destination) dans une table de minutes en mémoire. */
export const cleTrajet = (depuis: string, vers: string) => `${depuis}\u0000${vers}`;

/**
 * Durées de trajet de chaque origine vers chaque destination, en minutes (arrondi supérieur), en mémoire, par blocs de
 * `BLOC_MATRICE` × `BLOC_MATRICE` au plus (blocs d'origines, puis de destinations). Une durée absente ou invalide
 * n'est pas inscrite. Partagée avec la reprise de `p0Run` (`budget-routes.ts`).
 */
export async function minutesDeTrajets(
  origines: readonly string[],
  destinations: readonly string[],
  mode: ModeRoutes,
  routes: ClientRoutes,
): Promise<Map<string, number>> {
  const minutes = new Map<string, number>();
  for (let i = 0; i < origines.length; i += BLOC_MATRICE) {
    for (let j = 0; j < destinations.length; j += BLOC_MATRICE) {
      const blocOrigines = origines.slice(i, i + BLOC_MATRICE);
      const blocDestinations = destinations.slice(j, j + BLOC_MATRICE);
      const { secondes } = await routes.matrice({ origines: blocOrigines, destinations: blocDestinations, mode });
      blocOrigines.forEach((de, a) => {
        blocDestinations.forEach((vers, b) => {
          const valeur = secondes.at(a)?.at(b);
          if (typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0) {
            minutes.set(cleTrajet(de, vers), Math.ceil(valeur / 60));
          }
        });
      });
    }
  }
  return minutes;
}

/**
 * Matrice de trajets entre `placeId`, en mémoire, découpée en requêtes de 100 éléments au plus. Les durées sont
 * converties en minutes (arrondi supérieur) et ne quittent jamais la mémoire.
 */
export async function matriceTrajets(placeIds: readonly string[], mode: ModeRoutes, routes: ClientRoutes): Promise<Trajets> {
  const ids = [...new Set(placeIds)];
  const minutes = await minutesDeTrajets(ids, ids, mode, routes);
  return (depuis, vers) => (depuis === vers ? 0 : minutes.get(cleTrajet(depuis, vers)));
}
