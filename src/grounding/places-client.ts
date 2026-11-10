import "server-only";

import { z } from "zod";

import { envoyerGoogle, ErreurClientGoogle, erreurGoogleDe, PLACE_ID_GOOGLE, type RequeteGoogle, type Transport } from "@/grounding/enveloppe-google";
import {
  ErreurAncrage,
  type AuteurPhotoLieu,
  type ClientPhotosLieu,
  type ClientLieux,
  type ClientPlacesMvp,
  type ClientVilles,
  type Coordonnees,
  type DetailsLieu,
  type OptionsFicheVille,
  type PhotoLieu,
  type RectangleZone,
  type RequeteTextSearch,
  type ResultatLieu,
} from "@/grounding/interfaces";
import { lireCleGoogle } from "@/server/env/grounding";
import {
  avecReservation,
  DELAI_REQUETE_MS,
  demandeDe,
  horlogeSysteme,
  type ContexteAppel,
  type DemandeReservation,
  type Horloge,
  type Plafond,
  type PortConsommation,
} from "@/server/usage/port";

/**
 * Client réel de Places API (New) (spécification de P0r1, « P0, suite : exécutions réelles », « Clients réels » ; module
 * de capacité réseau, exception nominative de 0031 § 5). **Branché à aucun point d'entrée** (P0r1) : importé
 * seulement par ses tests ; le module de composition `src/server/composition/p0-reel.ts` arrive avec P0r3.
 *
 * - Hôte figé `places.googleapis.com` ; le `fetch` global n'est référencé que comme transport par défaut, toujours
 *   appelé à travers l'enveloppe (`enveloppe-google.ts`) ; un transport injecté ne reçoit que ce qu'elle lui passe.
 * - Clé par `@/server/env/grounding`, lue à la création, après la barrière de sortie ; refus : le client ne se
 *   construit pas (erreur fermée du même code).
 * - Masques de champs minimaux : Text Search « IDs only » (`places.id`) ; Place Details : identifiant, statut,
 *   position et horaires réguliers (SKU Enterprise de la table de prix). Statut et horaires sont facultatifs : un lieu
 *   qui n'est pas un établissement (quartier, parc, site naturel) n'en a pas (Q460).
 * - Text Search : biais (cercle) ou, pour `p0Run`, restriction à la zone du séjour (rectangle, 0055 § 6 point 3) ;
 *   jamais les deux, et un rectangle invalide est refusé avant toute réservation (`invalid_request`).
 * - B8a (décision 0085 § 2, soumis au verdict de la Sécurité) : un masque fermé par méthode de Place Details —
 *   `details` (`MASQUE_DETAILS`, Enterprise), `position` (`id,location`, Essentials), `identifiant` (`id`, « IDs only »,
 *   seule méthode qui accepte un `id` différent de celui demandé : rafraîchissement documenté par Google). Une réponse
 *   404 de ces trois méthodes (identifiant obsolète, `NOT_FOUND`) lève `ErreurAncrage("place_not_found")`, la même
 *   erreur que le double, après la réservation (requête partie : comptée).
 * - Chaque requête réserve une unité auprès du port de consommation avant l'appel (D13) ; délai de 10 s par requête.
 * - Recherche de la ville de l'écran 1 du site d'essai (demande de Samuel du 23 octobre 2026, décision 0129) : Autocomplete (New) filtré sur `(cities)`, en français, avec un jeton de session (`suggererVilles`), puis
 *   la fiche de la ville choisie dans la même session (`ficheVille`, masque fermé `id,addressComponents,location`, SKU
 *   Essentials) : seuls le code ISO du pays et la position en sont lus.
 * - Recherche d'un lieu à soi (M5d-1, décision 0147 § 3 point 1) : Text Search (New) par le texte saisi, suivi du nom maison
 *   de la ville de la journée, masque fermé `places.id,places.displayName,places.shortFormattedAddress` (SKU Pro), 5
 *   résultats, en français, **sans position** (ni biais ni restriction) ; aucune fiche ensuite (`rechercherLieux`).
 * Tout ce qui sort est une donnée Google : il reste en mémoire et n'atteint jamais un prompt.
 */

export const ORIGINE_PLACES = "https://places.googleapis.com";

export const MASQUE_TEXT_SEARCH = "places.id";
export const MASQUE_DETAILS = "id,businessStatus,location,regularOpeningHours";
/** Masque de `position` (B8a, 0085 § 2) : identifiant et position, rien d'autre. */
export const MASQUE_POSITION = "id,location";
/** Masque de `identifiant` (B8a, 0085 § 2 ; B8-PO-12) : l'identifiant seul. */
export const MASQUE_IDENTIFIANT = "id";

/** Masque des suggestions de ville : identifiant et textes de la suggestion, rien d'autre. */
export const MASQUE_SUGGESTIONS = "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat";
/** Masque de la fiche de la ville choisie : identifiant, composantes d'adresse (pays) et position (SKU Essentials). */
export const MASQUE_FICHE_VILLE = "id,addressComponents,location";
/**
 * Masque de la fiche de la ville choisie sur `api` (décision 0141 § 6.3 point 3 ; Sécurité, mineur 9, minimisation) :
 * identifiant et composantes d'adresse (pays) seulement, sans position (le fuseau vient de la table des 62 villes du
 * MVP) ; même SKU Essentials.
 */
export const MASQUE_FICHE_VILLE_SANS_POSITION = "id,addressComponents";

export const SKU_TEXT_SEARCH = "places_text_search_essentials_ids_only";
/**
 * Masque de la recherche d'un lieu à soi (décision 0147 § 3 point 1) : identifiant, nom affiché et adresse courte, rien
 * d'autre (ni position, ni horaires, ni note). Nom et adresse sont du contenu Google **affiché**, jamais stocké.
 */
export const MASQUE_RECHERCHE_LIEU = "places.id,places.displayName,places.shortFormattedAddress";
/** SKU de la recherche d'un lieu à soi : « Text Search Pro » (32 USD les 1 000, 5 000 gratuites par mois, table de prix). */
export const SKU_RECHERCHE_LIEU = "places_text_search_pro";
/** Résultats demandés et rendus au plus par la recherche d'un lieu à soi (0147 § 3 point 1). */
export const RESULTATS_RECHERCHE_LIEU_MAX = 5;
/** Texte saisi de la recherche d'un lieu à soi : 2 à 80 caractères après retrait des espaces (`PlaceSearchRequest.query`). */
const SAISIE_LIEU = { min: 2, max: 80 } as const;
/** Nom maison de la ville qui oriente la requête : une ligne, 120 caractères au plus. */
const VILLE_LIEU_MAX = 120;
/** Longueur au-delà de laquelle un nom ou une adresse Google n'est pas rendu (`GooglePlaceLabel`, 200 caractères au plus). */
const LIBELLE_LIEU_MAX = 200;
/**
 * SKU des suggestions : « Autocomplete Requests » (les 12 premières d'une session close par une fiche Essentials ; au-delà,
 * « Autocomplete Session Usage », gratuit). Réservé au prix plein de chaque requête : estimation haute.
 */
export const SKU_SUGGESTIONS = "places_autocomplete_requests";
/** SKU de la fiche de la ville : « Place Details Essentials ». */
export const SKU_FICHE_VILLE = "places_details_essentials";
/** Jeton de session Google (uuid du navigateur, 36 caractères au plus) : contrôlé avant tout envoi. */
export const JETON_SESSION = /^[A-Za-z0-9_-]{1,36}$/;
/** Saisie des suggestions : 2 à 80 caractères après retrait des espaces (bornes de la destination). */
const SAISIE_VILLE = { min: 2, max: 80 } as const;
export const SKU_DETAILS = "places_details_enterprise";
/** SKU le moins cher qui contient `location` : « Place Details Essentials » (page de tarifs relevée le 2026-10-17). */
export const SKU_POSITION = "places_details_essentials";
/** SKU de `id` seul : « Place Details Essentials (IDs Only) », sans plafond gratuit (relevé le 2026-10-17). */
export const SKU_IDENTIFIANT = "places_details_essentials_ids_only";

/**
 * Photos du tri (décision 0128) : la liste des photos d'un lieu par une fiche au seul masque `photos`, SKU le moins cher
 * qui le contient (« Place Details Essentials (IDs Only) », sans plafond gratuit ni prix : table de données de Places,
 * relevée le 2026-10-23), puis le média d'une photo (« Places API Place Details Photos », 7 USD les 1 000, 1 000
 * gratuites par mois : page de tarifs relevée le 2026-10-23).
 */
export const MASQUE_PHOTOS = "photos";
export const SKU_PHOTOS = "places_details_essentials_ids_only";
/** Masque de la réponse du média (`skipHttpRedirect=true`) : l'adresse de l'image seule. */
export const MASQUE_MEDIA_PHOTO = "photoUri";
export const SKU_MEDIA_PHOTO = "places_details_photos";
/** Largeur demandée au média : bornes de Google (1 à 4 800 px). */
export const LARGEUR_PHOTO_MAX_GOOGLE = 4800;
/** Photos lues au plus dans la fiche (la première valide est prise ; Google en rend 10 au plus). */
const PHOTOS_LUES_MAX = 10;

/** Coûts estimés par requête, en micro-USD, au prix plein (Q329) : table `prototype/config/prix-google.json`. */
export const COUT_ESTIME_MICROS = {
  textSearch: 0,
  details: 20_000,
  position: 5_000,
  identifiant: 0,
  suggestions: 2_830,
  ficheVille: 5_000,
  photos: 0,
  mediaPhoto: 7_000,
  // M5d-1 (décision 0147 § 3 point 1) : `places_text_search_pro`, 32 USD les 1 000.
  rechercheLieu: 32_000,
} as const;

/** Identifiant de lieu Google : jamais interpolé dans un chemin sans ce contrôle. */
const PLACE_ID = PLACE_ID_GOOGLE;

export type OptionsPlaces = {
  readonly usage: PortConsommation;
  readonly contexte: () => ContexteAppel;
  readonly plafonds: readonly Plafond[];
  readonly horloge?: Horloge;
  readonly environnement?: Readonly<Record<string, string | undefined>>;
  readonly execArgv?: readonly string[];
};

const TextSearchSchema = z.object({ places: z.array(z.object({ id: z.string().regex(PLACE_ID) })).max(20).optional() });

/**
 * Point d'une période d'ouverture. Places API (New) suit le format JSON de proto3, qui omet un entier à sa valeur par
 * défaut : `day` (dimanche), `hour` (minuit) et `minute` (heure pile) absents valent 0 (Q460). Une valeur présente
 * reste bornée ; `date` et `truncated` ne sont pas lus.
 */
const PointSchema = z.object({
  day: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(24).default(0),
  minute: z.number().int().min(0).max(59).default(0),
});
const DetailsSchema = z.object({
  id: z.string().regex(PLACE_ID),
  // Facultatif (Q460) : Places API (New) ne le renvoie que pour un établissement ; un quartier, un parc ou un site
  // naturel n'en a pas. `BUSINESS_STATUS_UNSPECIFIED` (valeur par défaut de l'énumération) vaut absence. Toute autre
  // valeur reste refusée (`invalid_response`).
  businessStatus: z.enum(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", "BUSINESS_STATUS_UNSPECIFIED"]).optional(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  regularOpeningHours: z.object({ periods: z.array(z.object({ open: PointSchema, close: PointSchema.optional() })).max(50) }).optional(),
});

/** Coin valide : nombres finis, latitude dans [-90, 90], longitude dans [-180, 180]. */
const coinValide = (coin: Coordonnees): boolean =>
  Number.isFinite(coin.lat) && Number.isFinite(coin.lng) && Math.abs(coin.lat) <= 90 && Math.abs(coin.lng) <= 180;

/**
 * Rectangle de restriction valide : deux coins valides, sud au plus égal au nord, ouest au plus égal à l'est (aucun
 * rectangle à cheval sur l'antiméridien : `zone.ts` n'en produit pas).
 */
function rectangleValide(zone: RectangleZone): boolean {
  return coinValide(zone.sudOuest) && coinValide(zone.nordEst) && zone.sudOuest.lat <= zone.nordEst.lat && zone.sudOuest.lng <= zone.nordEst.lng;
}

type Periodes = z.infer<typeof DetailsSchema>["regularOpeningHours"];

/**
 * Plages d'ouverture par jour, en minutes depuis minuit ; une plage qui passe minuit s'arrête à 1 440 (P0) et porte
 * `finLendemain` quand sa fermeture tombe le jour suivant (0085 § 2 point d).
 */
function horairesDe(periodes: Periodes): DetailsLieu["horaires"] {
  if (periodes === undefined) return null;
  const plages: NonNullable<DetailsLieu["horaires"]> = [];
  for (const { open, close } of periodes.periods) {
    const debut = open.hour * 60 + open.minute;
    if (close === undefined) {
      // Ouvert en permanence : une seule période sans fermeture.
      for (let jour = 0; jour < 7; jour += 1) plages.push({ jour, debut: 0, fin: 1440 });
      continue;
    }
    const fermeture = close.hour * 60 + close.minute;
    const fin = close.day === open.day ? fermeture : 1440;
    const lendemain = close.day === (open.day + 1) % 7 && fermeture > 0;
    plages.push({ jour: open.day, debut, fin: Math.max(debut, fin), ...(lendemain ? { finLendemain: fermeture } : {}) });
  }
  return plages;
}

const PositionSchema = z.object({
  id: z.string().regex(PLACE_ID),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
});
const IdentifiantSchema = z.object({ id: z.string().regex(PLACE_ID) });

const TexteSchema = z.object({ text: z.string().min(1).max(300) });
const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string().regex(PLACE_ID),
            structuredFormat: z.object({ mainText: TexteSchema, secondaryText: TexteSchema.optional() }),
          })
          .optional(),
      }),
    )
    .max(10)
    .optional(),
});
const ComposantesSchema = z.array(z.object({ shortText: z.string().max(100).optional(), types: z.array(z.string().max(60)).max(20) })).max(30).optional();
const FicheVilleSchema = z.object({
  id: z.string().regex(PLACE_ID),
  addressComponents: ComposantesSchema,
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
});
/** Fiche sans position (0141 § 6.3 point 3) : une position renvoyée malgré le masque n'est pas lue. */
const FicheVilleSansPositionSchema = z.object({ id: z.string().regex(PLACE_ID), addressComponents: ComposantesSchema });

/** Réponse de la recherche d'un lieu à soi : identifiant, nom affiché et adresse courte ; tout autre champ est ignoré. */
const RechercheLieuSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string().regex(PLACE_ID),
        displayName: z.object({ text: z.string() }).optional(),
        shortFormattedAddress: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
});

/** Caractères de contrôle (C0, DEL, C1) : refusés dans le texte saisi et dans le nom de la ville avant tout envoi. */
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

/** Libellé Google rendu : texte d'une ligne, sans contrôle, de 1 à 200 caractères après retrait des espaces ; sinon `null`. */
function libelleLieu(brut: string | undefined): string | null {
  const texte = brut?.trim() ?? "";
  return texte.length === 0 || texte.length > LIBELLE_LIEU_MAX || CONTROLE.test(texte) ? null : texte;
}

/** Nom de ressource d'une photo du lieu demandé (`places/<placeId>/photos/<référence>`) ; jamais gardé. */
const REFERENCE_PHOTO = /^[A-Za-z0-9_-]{1,1024}$/;

const PhotosSchema = z.object({
  photos: z
    .array(
      z.object({
        name: z.string().max(1400),
        authorAttributions: z.array(z.object({ displayName: z.string().optional(), uri: z.string().optional() })).max(10).optional(),
        googleMapsUri: z.string().max(2048).optional(),
      }),
    )
    .optional(),
});
const MediaPhotoSchema = z.object({ photoUri: z.string().max(4096) });

/** Adresse `https` sans identifiants ni port, dont l'hôte est `suffixe` ou l'un de ses sous-domaines ; sinon `undefined`. */
function adresseSure(brut: string | undefined, suffixes: readonly string[]): string | undefined {
  if (brut === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return undefined;
  const hote = url.hostname.toLowerCase();
  return suffixes.some((suffixe) => hote === suffixe || hote.endsWith(`.${suffixe}`)) ? url.href : undefined;
}

/** Hôtes de l'image (`photoUri`) et des liens d'attribution (profil de l'auteur, photo sur Google Maps). */
const HOTES_IMAGE = ["googleusercontent.com"] as const;
const HOTES_LIENS = ["google.com", "goo.gl"] as const;
/** Longueur d'un nom d'auteur affiché ; au-delà, l'auteur est écarté (jamais un nom tronqué). */
const NOM_AUTEUR_MAX = 120;

function auteursDe(attributions: readonly { displayName?: string; uri?: string }[] | undefined): AuteurPhotoLieu[] {
  const auteurs: AuteurPhotoLieu[] = [];
  for (const { displayName, uri } of attributions ?? []) {
    const nom = displayName?.trim() ?? "";
    if (nom === "" || nom.length > NOM_AUTEUR_MAX) continue;
    const lien = adresseSure(uri, HOTES_LIENS);
    auteurs.push(lien === undefined ? { nom } : { nom, lien });
  }
  return auteurs;
}

/** Fiche introuvable (0085 § 2 point c) : le seul `upstream_not_found` devient `place_not_found`, comme le double. */
async function sansIntrouvable<T>(appel: () => Promise<T>): Promise<T> {
  try {
    return await appel();
  } catch (erreur) {
    if (erreur instanceof ErreurClientGoogle && erreur.code === "upstream_not_found") throw new ErreurAncrage("place_not_found");
    throw erreur;
  }
}

/**
 * Noyau d'appel (réservation auprès du port, enveloppe, clé) de chaque client construit par `createPlacesClient`, lu par
 * `createPlacesPhotosClient` seul : les photos partagent la clé, la barrière et le transport par défaut (le `fetch` global
 * n'est nommé qu'à la signature de `createPlacesClient`, règle de confinement).
 */
type Noyau = {
  readonly appeler: (requete: RequeteGoogle, reservation: DemandeReservation) => Promise<unknown>;
  readonly demande: (methode: DemandeReservation["methode"], sku: string, coutEstimeMicros: number) => DemandeReservation;
};
const NOYAUX = new WeakMap<ClientPlacesMvp, Noyau>();

export function createPlacesClient(options: OptionsPlaces, transport: Transport = fetch): ClientPlacesMvp & ClientVilles & ClientLieux {
  const cle = lireCleGoogle(options.environnement, options.execArgv);
  if (!cle.ok) throw new ErreurClientGoogle(cle.code);
  const parametres = { origine: ORIGINE_PLACES, cle: cle.cle, transport };
  const dependances = { port: options.usage, horloge: options.horloge ?? horlogeSysteme };

  const demande = (methode: DemandeReservation["methode"], sku: string, coutEstimeMicros: number): DemandeReservation =>
    demandeDe(options.contexte(), { fournisseur: "google", methode, sku, unites: { requetes: 1, elements: 0 }, coutEstimeMicros }, options.plafonds);

  async function appeler(requete: RequeteGoogle, reservation: DemandeReservation): Promise<unknown> {
    const issue = await avecReservation(dependances, reservation, DELAI_REQUETE_MS.places, async (signal, transportAppele) => ({
      valeur: await envoyerGoogle(parametres, requete, signal, transportAppele),
      coutReelMicros: null,
    }));
    if (issue.ok) return issue.valeur;
    throw erreurGoogleDe(issue);
  }

  const client: ClientPlacesMvp & ClientVilles & ClientLieux = {
    async textSearch(requete: RequeteTextSearch) {
      const corps: Record<string, unknown> = { textQuery: requete.texte, pageSize: 5 };
      if (requete.restriction !== undefined) {
        // 0055 § 6 point 3 : restriction à la zone du séjour, jamais avec un biais ; refus avant toute réservation.
        if (requete.biais !== null || !rectangleValide(requete.restriction)) throw new ErreurClientGoogle("invalid_request");
        const { sudOuest, nordEst } = requete.restriction;
        corps.locationRestriction = {
          rectangle: { low: { latitude: sudOuest.lat, longitude: sudOuest.lng }, high: { latitude: nordEst.lat, longitude: nordEst.lng } },
        };
      } else if (requete.biais !== null) {
        corps.locationBias = {
          circle: { center: { latitude: requete.biais.lat, longitude: requete.biais.lng }, radius: requete.biais.rayonMetres },
        };
      }
      const brut = await appeler(
        { chemin: "/v1/places:searchText", methode: "POST", masque: MASQUE_TEXT_SEARCH, corps: JSON.stringify(corps) },
        demande("places_text_search", SKU_TEXT_SEARCH, COUT_ESTIME_MICROS.textSearch),
      );
      const lu = TextSearchSchema.safeParse(brut);
      if (!lu.success) throw new ErreurClientGoogle("invalid_response");
      return { placeIds: (lu.data.places ?? []).map((lieu) => lieu.id) };
    },
    async details(placeId: string) {
      if (!PLACE_ID.test(placeId)) throw new ErreurClientGoogle("invalid_request");
      const brut = await sansIntrouvable(() =>
        appeler(
          { chemin: `/v1/places/${placeId}`, methode: "GET", masque: MASQUE_DETAILS, introuvableSur404: true },
          demande("places_details", SKU_DETAILS, COUT_ESTIME_MICROS.details),
        ),
      );
      const lu = DetailsSchema.safeParse(brut);
      if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
      const statut = lu.data.businessStatus;
      return {
        placeId: lu.data.id,
        // Statut absent ou non précisé : la clé est omise (aucun état d'établissement déclaré, Q460).
        ...(statut === undefined || statut === "BUSINESS_STATUS_UNSPECIFIED" ? {} : { statut }),
        position: { lat: lu.data.location.latitude, lng: lu.data.location.longitude },
        horaires: horairesDe(lu.data.regularOpeningHours),
      };
    },
    async position(placeId: string) {
      if (!PLACE_ID.test(placeId)) throw new ErreurClientGoogle("invalid_request");
      const brut = await sansIntrouvable(() =>
        appeler(
          { chemin: `/v1/places/${placeId}`, methode: "GET", masque: MASQUE_POSITION, introuvableSur404: true },
          demande("places_details", SKU_POSITION, COUT_ESTIME_MICROS.position),
        ),
      );
      const lu = PositionSchema.safeParse(brut);
      if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
      return { placeId: lu.data.id, position: { lat: lu.data.location.latitude, lng: lu.data.location.longitude } };
    },
    async identifiant(placeId: string) {
      if (!PLACE_ID.test(placeId)) throw new ErreurClientGoogle("invalid_request");
      const brut = await sansIntrouvable(() =>
        appeler(
          { chemin: `/v1/places/${placeId}`, methode: "GET", masque: MASQUE_IDENTIFIANT, introuvableSur404: true },
          demande("places_details", SKU_IDENTIFIANT, COUT_ESTIME_MICROS.identifiant),
        ),
      );
      // 0085 § 2 point b : un autre `id` valide est le rafraîchissement documenté par Google ; contrôlé par PLACE_ID.
      const lu = IdentifiantSchema.safeParse(brut);
      if (!lu.success) throw new ErreurClientGoogle("invalid_response");
      return { placeId: lu.data.id };
    },
    async suggererVilles(saisie: string, session: string) {
      const texte = saisie.trim();
      if (texte.length < SAISIE_VILLE.min || texte.length > SAISIE_VILLE.max || !JETON_SESSION.test(session)) throw new ErreurClientGoogle("invalid_request");
      const corps = { input: texte, includedPrimaryTypes: ["(cities)"], languageCode: "fr", sessionToken: session };
      const brut = await appeler(
        { chemin: "/v1/places:autocomplete", methode: "POST", masque: MASQUE_SUGGESTIONS, corps: JSON.stringify(corps) },
        demande("places_autocomplete", SKU_SUGGESTIONS, COUT_ESTIME_MICROS.suggestions),
      );
      const lu = SuggestionsSchema.safeParse(brut);
      if (!lu.success) throw new ErreurClientGoogle("invalid_response");
      return (lu.data.suggestions ?? []).flatMap(({ placePrediction: p }) =>
        p === undefined ? [] : [{ placeId: p.placeId, principal: p.structuredFormat.mainText.text, secondaire: p.structuredFormat.secondaryText?.text ?? null }],
      );
    },
    async ficheVille(placeId: string, session: string, options: OptionsFicheVille = {}) {
      if (!PLACE_ID.test(placeId) || !JETON_SESSION.test(session)) throw new ErreurClientGoogle("invalid_request");
      const avecPosition = options.position !== false;
      const chemin = `/v1/places/${placeId}?languageCode=fr&sessionToken=${session}`;
      const reservation = () => demande("places_details", SKU_FICHE_VILLE, COUT_ESTIME_MICROS.ficheVille);
      // Deux appels littéraux, un masque fermé chacun (le test des masques lit chaque `masque:` du client).
      const brut = await sansIntrouvable(() =>
        avecPosition
          ? appeler({ chemin, methode: "GET", masque: MASQUE_FICHE_VILLE, introuvableSur404: true }, reservation())
          : appeler({ chemin, methode: "GET", masque: MASQUE_FICHE_VILLE_SANS_POSITION, introuvableSur404: true }, reservation()),
      );
      const paysDe = (composantes: z.infer<typeof ComposantesSchema>): string | null => {
        const pays = (composantes ?? []).find((composante) => composante.types.includes("country"))?.shortText;
        return pays !== undefined && /^[A-Z]{2}$/.test(pays) ? pays : null;
      };
      if (!avecPosition) {
        const lu = FicheVilleSansPositionSchema.safeParse(brut);
        if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
        return { placeId: lu.data.id, pays: paysDe(lu.data.addressComponents), position: null };
      }
      const lu = FicheVilleSchema.safeParse(brut);
      if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
      return { placeId: lu.data.id, pays: paysDe(lu.data.addressComponents), position: { lat: lu.data.location.latitude, lng: lu.data.location.longitude } };
    },
    async rechercherLieux(saisie: string, ville: string | null): Promise<readonly ResultatLieu[]> {
      const texte = saisie.trim();
      const suffixe = ville?.trim() ?? "";
      if (texte.length < SAISIE_LIEU.min || texte.length > SAISIE_LIEU.max || CONTROLE.test(texte) || suffixe.length > VILLE_LIEU_MAX || CONTROLE.test(suffixe)) {
        throw new ErreurClientGoogle("invalid_request");
      }
      // 0147 § 3 point 2 : le texte saisi, puis le nom maison de la ville ; sans ville, le texte seul. Aucune position.
      const corps = { textQuery: suffixe === "" ? texte : `${texte}, ${suffixe}`, pageSize: RESULTATS_RECHERCHE_LIEU_MAX, languageCode: "fr" };
      const brut = await appeler(
        { chemin: "/v1/places:searchText", methode: "POST", masque: MASQUE_RECHERCHE_LIEU, corps: JSON.stringify(corps) },
        demande("places_text_search", SKU_RECHERCHE_LIEU, COUT_ESTIME_MICROS.rechercheLieu),
      );
      const lu = RechercheLieuSchema.safeParse(brut);
      if (!lu.success) throw new ErreurClientGoogle("invalid_response");
      const vus = new Set<string>();
      const resultats: ResultatLieu[] = [];
      for (const lieu of lu.data.places ?? []) {
        const nom = libelleLieu(lieu.displayName?.text);
        // Sans nom affichable, le résultat n'est pas rendu (rien ne le désignerait à l'écran).
        if (nom === null || vus.has(lieu.id)) continue;
        vus.add(lieu.id);
        resultats.push({ placeId: lieu.id, nom, adresse: libelleLieu(lieu.shortFormattedAddress) });
        if (resultats.length >= RESULTATS_RECHERCHE_LIEU_MAX) break;
      }
      return resultats;
    },
  };
  NOYAUX.set(client, { appeler, demande });
  return client;
}

/**
 * Client des photos du tri (décision 0128) : construit par la composition seule (`composerPhotos`), derrière la garde
 * de relecture et le forfait réservé ; la clé reste côté serveur, dans l'en-tête de l'enveloppe. Deux requêtes au plus
 * par lieu, chacune réservée auprès du port : la fiche au masque `photos` (SKU « IDs Only »), puis, s'il y a une photo
 * du lieu, son média avec `skipHttpRedirect=true` (réponse JSON, jamais une redirection suivie). Le nom de ressource de
 * la photo ne sort pas de cette fonction ; seule l'adresse de l'image (hôte `googleusercontent.com`) et les
 * attributions sont rendues. Fiche sans photo : `null`, sans second appel.
 */
export function createPlacesPhotosClient(options: OptionsPlaces, transport?: Transport): ClientPhotosLieu {
  // Même construction que le client Places (barrière, clé, transport par défaut) ; seule sa méthode `photo` sort.
  const noyau = NOYAUX.get(createPlacesClient(options, transport));
  if (noyau === undefined) throw new ErreurClientGoogle("invalid_request");
  const { appeler } = noyau;
  const demande = (sku: string, coutEstimeMicros: number) => noyau.demande("places_details", sku, coutEstimeMicros);

  return {
    async photo(placeId: string, largeurMaxPx: number): Promise<PhotoLieu | null> {
      if (!PLACE_ID.test(placeId) || !Number.isSafeInteger(largeurMaxPx) || largeurMaxPx < 1 || largeurMaxPx > LARGEUR_PHOTO_MAX_GOOGLE) {
        throw new ErreurClientGoogle("invalid_request");
      }
      const fiche = PhotosSchema.safeParse(
        await sansIntrouvable(() =>
          appeler(
            { chemin: `/v1/places/${placeId}`, methode: "GET", masque: MASQUE_PHOTOS, introuvableSur404: true },
            demande(SKU_PHOTOS, COUT_ESTIME_MICROS.photos),
          ),
        ),
      );
      if (!fiche.success) throw new ErreurClientGoogle("invalid_response");
      const prefixe = `places/${placeId}/photos/`;
      const choisie = (fiche.data.photos ?? [])
        .slice(0, PHOTOS_LUES_MAX)
        .find((photo) => photo.name.startsWith(prefixe) && REFERENCE_PHOTO.test(photo.name.slice(prefixe.length)));
      if (choisie === undefined) return null;
      const media = MediaPhotoSchema.safeParse(
        await appeler(
          {
            chemin: `/v1/${choisie.name}/media?maxWidthPx=${String(largeurMaxPx)}&skipHttpRedirect=true`,
            methode: "GET",
            masque: MASQUE_MEDIA_PHOTO,
          },
          demande(SKU_MEDIA_PHOTO, COUT_ESTIME_MICROS.mediaPhoto),
        ),
      );
      const uri = media.success ? adresseSure(media.data.photoUri, HOTES_IMAGE) : undefined;
      if (uri === undefined) throw new ErreurClientGoogle("invalid_response");
      const lienGoogleMaps = adresseSure(choisie.googleMapsUri, HOTES_LIENS);
      return { uri, auteurs: auteursDe(choisie.authorAttributions), ...(lienGoogleMaps === undefined ? {} : { lienGoogleMaps }) };
    },
  };
}
