import "server-only";

import { ancrerLogement, ficheOuNull, RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { ErreurAncrage, type ClientPlaces, type RectangleZone, type ReponseTextSearch, type RequeteTextSearch } from "@/grounding/interfaces";
import { dansZone, zoneDuSejour } from "@/grounding/zone";
import type { AncrageResolu } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";

/**
 * Étape d'ancrage de `p0Run` (décision 0055, section 6 point 3, qui amende 0011 § 2 pour `p0Run` seulement ; section 3
 * point 5 ; 0053, amendement 1, point 1). Le mode simulé et `scripts/p0` gardent `ancrage.ts` (comportement inchangé).
 *
 * - **Logements** : résolus par Text Search puis Place Details, comme aujourd'hui (`ancrerLogement`, réutilisée), par la
 *   seule capacité `detailsLogement`, dont l'entrée est un **logement du brief** (le brief et un indice), jamais un
 *   `placeId` ni un candidat : une fiche par logement à cette étape. Leurs positions fixent la zone du séjour.
 * - **Candidats** : Text Search « IDs only » **restreint à la zone** (`locationRestriction`), premier `placeId` gardé,
 *   **aucune fiche** : le statut de fermeture est vérifié à l'étape finale (`fiches-finales.ts`). Sans résultat dans la
 *   zone : non résolu (`discarded`).
 *
 * Tout ce qui sort de ce module est une donnée Google (identifiants, positions) : en mémoire, jamais dans un prompt.
 */

/** Capacités Places de l'étape d'ancrage (0055 § 3 point 5) : `textSearch` et `detailsLogement`, rien d'autre. */
export type CapacitesAncrage = {
  readonly textSearch: (requete: RequeteTextSearch) => Promise<ReponseTextSearch>;
  readonly detailsLogement: (brief: Brief, indice: number) => Promise<AncrageResolu>;
};

/**
 * Capacités d'ancrage construites à partir du client Places (par la composition de P0r3c-3). `detailsLogement` ne
 * résout que le logement `indice` du brief reçu (indice hors du brief : `lodging_unresolved`) ; un second appel pour le
 * même logement du même brief rend la même fiche, sans nouvelle requête (une fiche par logement à l'ancrage).
 */
export function capacitesAncrage(places: ClientPlaces): CapacitesAncrage {
  const dejaResolus = new WeakMap<Brief, Map<number, Promise<AncrageResolu>>>();
  return {
    textSearch: (requete) => places.textSearch(requete),
    detailsLogement(brief, indice) {
      const logement = Number.isSafeInteger(indice) && indice >= 0 ? brief.logements.at(indice) : undefined;
      if (logement === undefined) return Promise.reject(new ErreurAncrage("lodging_unresolved"));
      let parIndice = dejaResolus.get(brief);
      if (parIndice === undefined) {
        parIndice = new Map();
        dejaResolus.set(brief, parIndice);
      }
      const connu = parIndice.get(indice);
      if (connu !== undefined) return connu;
      const fiche = ancrerLogement(logement, brief.destination, places);
      parIndice.set(indice, fiche);
      return fiche;
    },
  };
}

/** Logements résolus (une fiche chacun) et zone du séjour : rectangle des cercles de `RAYON_BIAIS_METRES`. */
export async function ancrerLogementsDuSejour(brief: Brief, capacites: Pick<CapacitesAncrage, "detailsLogement">): Promise<{ logements: AncrageResolu[]; zone: RectangleZone }> {
  const logements: AncrageResolu[] = [];
  for (let indice = 0; indice < brief.logements.length; indice += 1) logements.push(await capacites.detailsLogement(brief, indice));
  return { logements, zone: zoneDuSejour(logements.map((logement) => logement.position), RAYON_BIAIS_METRES) };
}

/** Candidat résolu dans la zone, sans fiche : seulement son `placeId` (statut, position et horaires inconnus ici). */
export type AncrageSansFiche = { readonly resolu: false } | { readonly resolu: true; readonly placeId: string };

/** Candidat à ancrer : identifiant interne et nom maison (types de `src/grounding`, 0085 § 1.9). */
export type CandidatAAncrer = { readonly id: string; readonly nom: string };

/**
 * Candidats résolus dans la zone par Text Search « IDs only », sans aucune fiche (0055 § 6 point 3). Algorithme unique
 * de résolution d'un candidat (0085 § 1.9) : `p0Run` et `ancrerCandidats` (B8a) l'appellent ; entrée et capacité
 * retypées sur `src/grounding` (structurellement identiques pour `p0Run`).
 */
export async function ancrerCandidatsDansZone(
  candidats: readonly CandidatAAncrer[],
  destination: string,
  capacites: { readonly textSearch: (requete: RequeteTextSearch) => Promise<ReponseTextSearch> },
  zone: RectangleZone,
): Promise<Map<string, AncrageSansFiche>> {
  const ancrages = new Map<string, AncrageSansFiche>();
  for (const candidat of candidats) {
    const { placeIds } = await capacites.textSearch({ texte: `${candidat.nom}, ${destination}`, biais: null, restriction: zone });
    const placeId = placeIds[0];
    ancrages.set(candidat.id, placeId === undefined ? { resolu: false } : { resolu: true, placeId });
  }
  return ancrages;
}

/** Lieu distinct du programme écrit par l'IA (décision 0115) : identifiant interne, nom et ville **contrôlés** (0117 § 1). */
export type LieuProgramme = { readonly id: string; readonly lieu: string; readonly ville?: string };

/**
 * Lieux qui ne seront pas envoyés à Text Search faute de **part** (`unverifiedForCap`, 0117 § 4 ; 0116 § 3.5),
 * calculés **avant** la boucle de vérification, des seuls nombres de lieux, de la part Text Search de l'exécution et
 * des logements (une recherche chacun) : `max(0, lieux − (part − logements))`. Indépendant de l'horloge et des
 * réponses de Google ; les lieux sautés faute de temps ou de part de fiches ne sont pas comptés.
 */
export function lieuxHorsPartTextSearch(nombreLieux: number, partTextSearch: number, logements: number): number {
  return Math.max(0, nombreLieux - Math.max(0, partTextSearch - logements));
}

/** Issue de la vérification, en mémoire seulement (0011 § 2) : fiches gardées par identifiant interne. */
export type IssueVerification = {
  /** Lieux vérifiés : identifiant trouvé dans la zone, fiche lue, pas fermé définitivement, position dans la zone. */
  readonly fiches: ReadonlyMap<string, AncrageResolu>;
};

/**
 * Contrôle fait **avant** chaque appel (0116 § 4.2) : `ok`, ou la raison de l'arrêt de la boucle (`part` : part de la
 * méthode épuisée ; `temps` : le délai entier de l'appel ne tient pas avant l'échéance moins la réserve de trajets).
 */
export type ControleAppel = (methode: "textSearch" | "fiche") => Promise<"ok" | "part" | "temps">;

/**
 * Vérification des lieux du programme écrit par l'IA (décision 0115 § 3 étape 2 ; décision 0116 § 4 ; verdict de la
 * Sécurité 0117 § 2). Pour chaque lieu distinct, **dans l'ordre reçu** (ordre écrit : jours, puis créneaux) :
 * 1. Text Search par `ancrerCandidatsDansZone` (**réutilisée**, jamais recopiée ni modifiée), **un appel par lieu
 *    distinct** (liste d'un seul lieu) : texte `« <lieu>, <ville> »` construit des seuls `lieu` et `ville` contrôlés
 *    (la ville passe par le paramètre `destination`), ou `« <lieu>, <destination> »` sans ville ; restriction à la zone
 *    des logements, masque `id`, premier identifiant gardé ;
 * 2. une fiche par identifiant distinct (`ficheOuNull`) : gardée si elle existe, n'est pas fermée définitivement et
 *    tombe dans la zone. Les horaires ne sont **pas** évalués ici (0116 § 4.4) : un lieu fermé le jour du créneau garde
 *    son identifiant, son badge vient de la relecture des horaires à l'affichage (0116 § 5.3).
 * `controle` est appelé avant chaque appel : non tenu, la boucle s'arrête et les lieux restants ne sont pas vérifiés
 * (écrits sans `placeId`) ; aucun compte n'en sort (`unverifiedForCap` vient de `lieuxHorsPartTextSearch`). Jamais un arrêt de l'exécution pour
 * cette cause (PPI-PO-4, 0116 § 3.5). Toute erreur d'un appel (refus du registre compris) est propagée.
 * Aucun verdict, motif ni donnée Google ne sort de cette fonction, hors des fiches gardées en mémoire.
 */
export async function verifierLieuxDuProgramme(
  lieux: readonly LieuProgramme[],
  destination: string,
  capacites: { readonly textSearch: (requete: RequeteTextSearch) => Promise<ReponseTextSearch>; readonly places: Pick<ClientPlaces, "details"> },
  zone: RectangleZone,
  controle: ControleAppel,
): Promise<IssueVerification> {
  const fiches = new Map<string, AncrageResolu>();
  const lues = new Map<string, AncrageResolu | null>();
  for (const lieu of lieux) {
    if ((await controle("textSearch")) !== "ok") break;
    const ancrage = (await ancrerCandidatsDansZone([{ id: lieu.id, nom: lieu.lieu }], lieu.ville ?? destination, capacites, zone)).get(lieu.id);
    if (ancrage === undefined || !ancrage.resolu) continue;
    let fiche = lues.get(ancrage.placeId);
    if (!lues.has(ancrage.placeId)) {
      if ((await controle("fiche")) !== "ok") break;
      fiche = await ficheOuNull(ancrage.placeId, capacites.places);
      lues.set(ancrage.placeId, fiche);
    }
    if (fiche !== undefined && fiche !== null && fiche.statut !== "ferme_definitivement" && dansZone(fiche.position, zone)) fiches.set(lieu.id, fiche);
  }
  return { fiches };
}
