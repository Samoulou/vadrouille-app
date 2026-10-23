import "server-only";

import { z } from "zod";

import { envoyerGoogle, ErreurClientGoogle, erreurGoogleDe, PLACE_ID_GOOGLE, type RequeteGoogle, type Transport } from "@/grounding/enveloppe-google";
import {
  ErreurAncrage,
  type ClientPlacesMvp,
  type ClientVilles,
  type Coordonnees,
  type DetailsLieu,
  type RectangleZone,
  type RequeteTextSearch,
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

export const SKU_TEXT_SEARCH = "places_text_search_essentials_ids_only";
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

/** Coûts estimés par requête, en micro-USD, au prix plein (Q329) : table `prototype/config/prix-google.json`. */
export const COUT_ESTIME_MICROS = { textSearch: 0, details: 20_000, position: 5_000, identifiant: 0, suggestions: 2_830, ficheVille: 5_000 } as const;

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
const FicheVilleSchema = z.object({
  id: z.string().regex(PLACE_ID),
  addressComponents: z.array(z.object({ shortText: z.string().max(100).optional(), types: z.array(z.string().max(60)).max(20) })).max(30).optional(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
});

/** Fiche introuvable (0085 § 2 point c) : le seul `upstream_not_found` devient `place_not_found`, comme le double. */
async function sansIntrouvable<T>(appel: () => Promise<T>): Promise<T> {
  try {
    return await appel();
  } catch (erreur) {
    if (erreur instanceof ErreurClientGoogle && erreur.code === "upstream_not_found") throw new ErreurAncrage("place_not_found");
    throw erreur;
  }
}

export function createPlacesClient(options: OptionsPlaces, transport: Transport = fetch): ClientPlacesMvp & ClientVilles {
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

  return {
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
    async ficheVille(placeId: string, session: string) {
      if (!PLACE_ID.test(placeId) || !JETON_SESSION.test(session)) throw new ErreurClientGoogle("invalid_request");
      const brut = await sansIntrouvable(() =>
        appeler(
          { chemin: `/v1/places/${placeId}?languageCode=fr&sessionToken=${session}`, methode: "GET", masque: MASQUE_FICHE_VILLE, introuvableSur404: true },
          demande("places_details", SKU_FICHE_VILLE, COUT_ESTIME_MICROS.ficheVille),
        ),
      );
      const lu = FicheVilleSchema.safeParse(brut);
      if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
      const pays = (lu.data.addressComponents ?? []).find((composante) => composante.types.includes("country"))?.shortText;
      return {
        placeId: lu.data.id,
        pays: pays !== undefined && /^[A-Z]{2}$/.test(pays) ? pays : null,
        position: { lat: lu.data.location.latitude, lng: lu.data.location.longitude },
      };
    },
  };
}
