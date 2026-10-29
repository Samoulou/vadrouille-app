import "server-only";

import { PlacePhotoSchema, type PlacePhoto } from "@/contracts/photo";
import { PLAFONDS_USAGE } from "@/server/config/usage";
import { evaluerBarriere, plafondsDeGenerationPoses, type EtatBarriere } from "@/server/generation/barriere";
import { checkRateLimit } from "@/server/rate-limit";

/**
 * Photos du tri « J'aime / Pas pour moi » sur l'adaptateur `api` (ticket 879, ligne M1e du plan
 * `docs/plans/mvp-etapes-1-9.md` ; décision 0128 généralisée). Même règle que le site d'essai : une photo par carte
 * affichée, demandée par la carte (`tripId`, `proposalId`), **jamais par un identifiant de lieu** ; la photo n'est jamais
 * stockée, journalisée ni mise en cache ; aucune donnée Google en base ni dans un prompt.
 *
 * À **chaque** photo, dans cet ordre, le premier refus l'emportant (refus : `null`, aucun appel Google ; la carte garde
 * son emplacement « Photo du lieu », sans message) :
 * 1. **barrière** : celle des appels réels de `api` (B9-TL-8, `evaluerBarriere`, plafonds de génération posés et non
 *    nuls), qui tient lieu sur `api` de la garde du mode réel et du code d'accès du site d'essai (comme pour la ville de
 *    l'écran 1, décision 0141 § 6.2). Aucun crochet d'accès n'est fourni : la barrière reste **fermée** (`simulee` ou
 *    `production`) tant que M1h ne branche pas le crochet de `api` ; aucune lecture du voyage, aucun limiteur, aucune
 *    base ;
 * 2. **appartenance au voyage** : le lieu est celui que rend `lieu`, c'est-à-dire, pour `photoLieuApi`
 *    (`src/adapters/index.ts`), le `placeId` d'une proposition du voyage demandé, lue en base dans le contexte
 *    d'organisation de la requête ; `null` (voyage d'une autre organisation, carte d'un autre voyage, sans lieu) :
 *    refus, sans limiteur ;
 * 3. **cadence** : même plafond que le site d'essai, 40 photos par heure (`MAX_PHOTOS_PAR_HEURE` de
 *    `src/server/p0/photos.ts`, F13-TL-2), comptées par le limiteur de l'app (`action_rate_limits`, action `photo-tri`,
 *    `src/server/config/limites.ts`) : aucune table nouvelle, aucune migration ; échec fermé ;
 * 4. **client** : le client des photos de `api`, **non branché** (`client` vaut `null` par défaut) : sa composition (clé,
 *    port de consommation, décompte du coût hors de `prototype.forfaits`) revient au Tech Lead avec M1h (question de la
 *    PR 879). Une photo rendue est revalidée ici (`PlacePhotoSchema`).
 *
 * Aucun journal ici : la barrière fermée et le lieu hors du voyage sont des refus attendus ; le limiteur journalise ses
 * propres refus, sans valeur d'en-tête.
 */

/** Action du limiteur pour les photos du tri (`RATE_LIMITS`, 40 par heure et par adresse IP). */
export const ACTION_LIMITEUR_PHOTO = "photo-tri";

/** Client des photos de `api` : la photo de la première image du lieu, ou `null` (aucune photo, erreur). */
export type ClientPhotosApi = { photo(placeId: string): Promise<PlacePhoto | null> };

export type DependancesPhotosApi = {
  /** État de la barrière B9-TL-8 (par défaut : `evaluerBarriere` sans crochet d'accès, donc jamais `reelle`). */
  readonly barriere?: () => Promise<EtatBarriere>;
  /** Limiteur `photo-tri` de la requête (par défaut : `checkRateLimit` sur les en-têtes de la requête) ; vrai : admis. */
  readonly limiteur?: () => Promise<boolean>;
  /**
   * Fabrique du client des photos, appelée seulement barrière ouverte, lieu admis et limiteur passé ; `null` par défaut :
   * **non branchée** (aucun client, aucune clé lue, aucun appel Google).
   */
  readonly client?: (() => Promise<ClientPhotosApi>) | null;
};

export interface PhotosApi {
  /**
   * Photo du lieu que rend `lieu` (appelé barrière ouverte seulement, avant le limiteur), ou `null`. Ne lève jamais.
   */
  photo(lieu: () => Promise<string | null>): Promise<PlacePhoto | null>;
}

/** Client par défaut de `api` : aucun (composition à décider avec M1h, question de la PR 879). */
const CLIENT_PAR_DEFAUT: (() => Promise<ClientPhotosApi>) | null = null;

/** Barrière par défaut : aucun crochet d'accès (fermé par défaut, B9-TL-8) ; M1h branchera celui de `api`. */
const barriereParDefaut = (): Promise<EtatBarriere> => evaluerBarriere({ plafondsNonNuls: plafondsDeGenerationPoses(PLAFONDS_USAGE) });

const limiteurParDefaut = async (): Promise<boolean> => {
  const { headers } = await import("next/headers");
  const verdict = await checkRateLimit({ action: ACTION_LIMITEUR_PHOTO, headers: new Headers(await headers()) });
  return verdict.ok;
};

export function creerPhotosApi(dependances: DependancesPhotosApi = {}): PhotosApi {
  const barriere = dependances.barriere ?? barriereParDefaut;
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const client = dependances.client === undefined ? CLIENT_PAR_DEFAUT : dependances.client;
  return {
    async photo(lieu) {
      try {
        if ((await barriere()) !== "reelle") return null;
        const placeId = await lieu();
        if (placeId === null) return null;
        if (client === null) return null;
        if (!(await limiteur())) return null;
        // Contrat de l'action (hôtes Google seulement) : une forme invalide vaut « aucune photo ».
        const lu = PlacePhotoSchema.nullable().safeParse(await (await client()).photo(placeId));
        return lu.success ? lu.data : null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Vrai si l'écran du tri de `api` peut demander une photo : client branché et barrière ouverte (aucun client lu ni
 * construit). Lu par la page (aucune
 * demande du navigateur sous la barrière fermée : l'emplacement « Photo du lieu » reste, sans appel à l'action).
 */
export async function photosApiOuvertes(dependances: Pick<DependancesPhotosApi, "barriere" | "client"> = {}): Promise<boolean> {
  try {
    const client = dependances.client === undefined ? CLIENT_PAR_DEFAUT : dependances.client;
    return client !== null && (await (dependances.barriere ?? barriereParDefaut)()) === "reelle";
  } catch {
    return false;
  }
}
