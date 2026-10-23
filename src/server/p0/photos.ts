import "server-only";

import { cookies } from "next/headers";

import { PlacePhotoSchema, type PlacePhoto } from "@/contracts/photo";
import { NOM_COOKIE_ACCES, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { ouvrirGardeRelecture, type GardeRelecture } from "@/server/p0/garde";
import type { composerPhotos } from "@/server/composition/p0-reel";
import { errorNameOf, logEvent } from "@/server/log";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { forfaitPhoto, type Forfait } from "@/server/usage/forfait";
import { reserverPhoto, type PoolSql, type ReglesForfait } from "@/server/usage/neon";
import { horlogeSysteme, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";

import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * Photos des cartes du tri d'un voyage d'essai (décision 0128, demande de Samuel du 2026-10-23 15:23 UTC : « ajouter les
 * photos dans la partie j'aime et j'aime pas »). **Seule exception** à la règle « aucun appel Google à l'affichage » de
 * 0092 : une photo par carte, chargée quand la carte s'affiche. Branché au démarrage par `src/instrumentation.ts` sur
 * l'adaptateur `prototype` (`brancherPhotosEssai`), comme le relecteur Routes (`relecture.ts`).
 *
 * À **chaque** photo, dans cet ordre, le premier refus l'emportant (refus : `null`, aucun appel ; la carte garde son
 * emplacement « photo ») :
 * 1. **même barrière que la relecture** : garde du mode réel ouverte (déploiement autre que la production, préversion de
 *    `p0-reel`) et cookie d'accès valide ; sinon aucune connexion à la base, aucune lecture du voyage ;
 * 2. **appartenance au voyage** (F13-TL-2) : le lieu est celui que rend `lieu`, c'est-à-dire, pour `photoLieuEssai`
 *    (`src/adapters/index.ts`), le lieu d'une proposition du voyage demandé ; `null` (carte d'un autre voyage, sans
 *    lieu) : refus sans réservation ni journal ;
 * 3. **cadence et réservation** (`reserverPhoto`, sous le verrou des forfaits) : 40 photos au plus par heure glissante,
 *    comptées en base (`MAX_PHOTOS_PAR_HEURE`, F13-TL-2), puis un forfait de photo (`forfaitPhoto`, nature `relecture`,
 *    une ligne dans `prototype.forfaits` : deux fiches au prix plein, 0,007 USD) sous les limites du prototype
 *    (`relectureDuMode`). **Aucun contrôle de la purge** : `ouvrirGardeRelecture` ne la lit pas (c'est le relecteur
 *    Routes qui la contrôle dans son `reserver`), et 0128 § 5 consigne cette dérogation à 0046 D16 point 8 ;
 * 4. **appels** : le client des photos de la composition (`composerPhotos`), borné par le registre en mémoire du forfait.
 *
 * La photo est une **donnée Google** : rendue à l'action seulement, jamais stockée, journalisée ni mise en cache par ce
 * module. Un échec après la garde écrit `essai.photo_unavailable` avec un nom fermé seulement (`ReservationImpossible`,
 * `PlafondAtteint`, ou le nom de l'erreur du client), jamais un identifiant de lieu, une adresse ni un message. Un lieu
 * introuvable chez Google (404, `place_not_found`) vaut « aucune photo », sans journal.
 */

/** Client des photos tel que la composition le rend (`ClientPhotosLieu` de `@/grounding/interfaces`). */
export type ClientPhotos = ReturnType<typeof composerPhotos>["photos"];

/** Photos au plus par heure glissante, toutes sessions d'accès confondues (F13-TL-2 : 40 par heure et par session). */
export const MAX_PHOTOS_PAR_HEURE = 40;

/** Largeur demandée au média : la carte fait au plus 358 px de large à 390 px d'écran ; × 2,2 pour les écrans denses. */
export const LARGEUR_PHOTO_PX = 800;

/** SKU du forfait d'une photo : ceux du client (`places-client.ts`, `SKU_PHOTOS` et `SKU_MEDIA_PHOTO`). */
export const SKUS_PHOTO = { liste: "places_details_essentials_ids_only", media: "places_details_photos" } as const;

/** Photos d'un voyage d'essai, branchées sur l'adaptateur `prototype` (`src/adapters/prototype-instance.ts`). */
export interface PhotosEssai {
  /**
   * Photo du lieu que rend `lieu` (appelé garde ouverte et cookie valide seulement, avant la réservation), ou `null`
   * (garde fermée, lieu absent, cadence, aucune photo, quota, erreur). Ne lève jamais.
   */
  photo(lieu: () => Promise<string | null>): Promise<PlacePhoto | null>;
}

export type DependancesPhotos = DependancesAcces & {
  /** Cookie `__Host-p0_acces` de la requête courante (par défaut : `cookies()` de Next.js). */
  readonly cookie?: () => Promise<string | undefined>;
  /** Pool `vadrouille_prototype` (par défaut : `poolPrototype()`), obtenu seulement garde ouverte. */
  readonly pool?: () => PoolSql;
  /** Forfait et règles d'une photo (par défaut : `forfaitPhoto` sur la table de prix, règles de `relectureDuMode()`) ; `null` : refus. */
  readonly reglage?: () => Promise<{ readonly forfait: Forfait; readonly regles: ReglesForfait } | null>;
  /** Client des photos (par défaut : `composerPhotos` de la composition du mode réel). */
  readonly photos?: (garde: GardeRelecture, usage: PortConsommation, plafonds: readonly Plafond[]) => Promise<ClientPhotos>;
  readonly horloge?: Horloge;
};

const PLAFONDS_ATTEINTS: ReadonlySet<string> = new Set(["cap_reached", "envelope_reached"]);

/** Plafond des clients : deux fiches au plus (la liste des photos, puis le média). */
const plafondsDu = (forfait: Forfait): Plafond[] => [
  { portee: "execution", fournisseur: "google", methode: "places_details", maxRequetes: forfait.placeDetailsRequetes },
];

/** Forfait et règles par défaut : table de prix commitée, limites et unité Routes du mode réel (`relectureDuMode`). */
async function reglageParDefaut(): Promise<{ readonly forfait: Forfait; readonly regles: ReglesForfait } | null> {
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!table.success) return null;
  const { relectureDuMode } = await import("@/workflows");
  const relecture = relectureDuMode();
  if (relecture === null) return null;
  return { forfait: forfaitPhoto(table.data, SKUS_PHOTO), regles: relecture.regles };
}

/** Code fermé d'une erreur de client (`ErreurClientGoogle.code`), sans jamais lire son message. */
const codeDe = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

/** Contrat de l'action (`PlacePhoto`) : noms anglais, liens facultatifs ; une forme invalide vaut « aucune photo ». */
function versContrat(photo: Awaited<ReturnType<ClientPhotos["photo"]>>): PlacePhoto | null {
  if (photo === null) return null;
  const lu = PlacePhotoSchema.safeParse({
    url: photo.uri,
    authors: photo.auteurs.map(({ nom, lien }) => (lien === undefined ? { name: nom } : { name: nom, profileUrl: lien })),
    ...(photo.lienGoogleMaps === undefined ? {} : { mapsUrl: photo.lienGoogleMaps }),
  });
  return lu.success ? lu.data : null;
}

export function creerPhotosEssai(dependances: DependancesPhotos = {}): PhotosEssai {
  const horloge = dependances.horloge ?? horlogeSysteme;
  const lireCookie = dependances.cookie ?? (async () => (await cookies()).get(NOM_COOKIE_ACCES)?.value);
  const pool = dependances.pool ?? poolPrototype;
  const reglage = dependances.reglage ?? reglageParDefaut;
  const photos =
    dependances.photos ??
    (async (garde: GardeRelecture, usage: PortConsommation, plafonds: readonly Plafond[]) => {
      const { composerPhotos } = await import("@/server/composition/p0-reel");
      return composerPhotos(garde, { usage, plafonds, horloge }).photos;
    });

  return {
    async photo(lieu) {
      let cookie: string | undefined;
      try {
        cookie = await lireCookie();
      } catch {
        // Hors portée de requête (`cookies()` lève) : refus fermé, sans connexion ni journal.
        return null;
      }
      let choisi: Awaited<ReturnType<typeof reglage>> = null;
      let placeId: string | null = null;
      let horsVoyage = false;
      const garde = await ouvrirGardeRelecture({
        env: dependances.env,
        execArgv: dependances.execArgv,
        maintenant: dependances.maintenant,
        cookie,
        async reserver() {
          // Garde ouverte et cookie valide : le voyage est lu ici seulement, avant toute réservation.
          placeId = await lieu();
          if (placeId === null) {
            horsVoyage = true;
            return { ok: false, code: "usage_unavailable" };
          }
          choisi = await reglage();
          if (choisi === null) return { ok: false, code: "usage_unavailable" };
          return reserverPhoto(pool(), choisi.forfait, choisi.regles, MAX_PHOTOS_PAR_HEURE);
        },
      });
      if (!garde.ok) {
        // Lieu hors du voyage demandé (ou sans lieu) : refus sans journal, comme une carte sans photo.
        if (horsVoyage) return null;
        // Garde fermée ou cookie absent : rien n'est journalisé (comme la relecture) ; refus après la garde : un nom fermé.
        if (PLAFONDS_ATTEINTS.has(garde.code)) logEvent("essai.photo_unavailable", { errorName: "PlafondAtteint" }, "warn");
        else if (garde.code === "usage_unavailable" || garde.code === "daily_quota_insufficient") {
          logEvent("essai.photo_unavailable", { errorName: "ReservationImpossible" }, "warn");
        }
        return null;
      }
      const { forfait } = choisi!;
      const lieuServi = placeId!;
      try {
        const registre = creerRegistreForfait(forfait, null, horloge);
        const client = await photos(garde.garde, registre, plafondsDu(forfait));
        return versContrat(await client.photo(lieuServi, LARGEUR_PHOTO_PX));
      } catch (erreur) {
        const code = codeDe(erreur);
        // Lieu introuvable chez Google : « aucune photo », attendu, sans journal (mineur 17 de la revue du head `8232ddb`).
        if (code === "place_not_found") return null;
        logEvent("essai.photo_unavailable", { errorName: code !== undefined && PLAFONDS_ATTEINTS.has(code) ? "PlafondAtteint" : errorNameOf(erreur) }, "warn");
        return null;
      }
    },
  };
}
