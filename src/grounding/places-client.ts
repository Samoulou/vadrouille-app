import "server-only";

import { z } from "zod";

import { envoyerGoogle, ErreurClientGoogle, erreurGoogleDe, PLACE_ID_GOOGLE, type RequeteGoogle, type Transport } from "@/grounding/enveloppe-google";
import type { ClientPlaces, DetailsLieu, RequeteTextSearch } from "@/grounding/interfaces";
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
 *   position et horaires réguliers (SKU Enterprise de la table de prix).
 * - Chaque requête réserve une unité auprès du port de consommation avant l'appel (D13) ; délai de 10 s par requête.
 * Tout ce qui sort est une donnée Google : il reste en mémoire et n'atteint jamais un prompt.
 */

export const ORIGINE_PLACES = "https://places.googleapis.com";

export const MASQUE_TEXT_SEARCH = "places.id";
export const MASQUE_DETAILS = "id,businessStatus,location,regularOpeningHours";

export const SKU_TEXT_SEARCH = "places_text_search_essentials_ids_only";
export const SKU_DETAILS = "places_details_enterprise";

/** Coûts estimés par requête, en micro-USD, au prix plein (Q329) : table `prototype/config/prix-google.json`. */
export const COUT_ESTIME_MICROS = { textSearch: 0, details: 20_000 } as const;

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

const PointSchema = z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(24), minute: z.number().int().min(0).max(59) });
const DetailsSchema = z.object({
  id: z.string().regex(PLACE_ID),
  businessStatus: z.enum(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"]),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  regularOpeningHours: z.object({ periods: z.array(z.object({ open: PointSchema, close: PointSchema.optional() })).max(50) }).optional(),
});

type Periodes = z.infer<typeof DetailsSchema>["regularOpeningHours"];

/** Plages d'ouverture par jour, en minutes depuis minuit ; une plage qui passe minuit s'arrête à 1 440. */
function horairesDe(periodes: Periodes): DetailsLieu["horaires"] {
  if (periodes === undefined) return null;
  const plages: { jour: number; debut: number; fin: number }[] = [];
  for (const { open, close } of periodes.periods) {
    const debut = open.hour * 60 + open.minute;
    if (close === undefined) {
      // Ouvert en permanence : une seule période sans fermeture.
      for (let jour = 0; jour < 7; jour += 1) plages.push({ jour, debut: 0, fin: 1440 });
      continue;
    }
    const fin = close.day === open.day ? close.hour * 60 + close.minute : 1440;
    plages.push({ jour: open.day, debut, fin: Math.max(debut, fin) });
  }
  return plages;
}

export function createPlacesClient(options: OptionsPlaces, transport: Transport = fetch): ClientPlaces {
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
      if (requete.biais !== null) {
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
      const brut = await appeler(
        { chemin: `/v1/places/${placeId}`, methode: "GET", masque: MASQUE_DETAILS },
        demande("places_details", SKU_DETAILS, COUT_ESTIME_MICROS.details),
      );
      const lu = DetailsSchema.safeParse(brut);
      if (!lu.success || lu.data.id !== placeId) throw new ErreurClientGoogle("invalid_response");
      return {
        placeId: lu.data.id,
        statut: lu.data.businessStatus,
        position: { lat: lu.data.location.latitude, lng: lu.data.location.longitude },
        horaires: horairesDe(lu.data.regularOpeningHours),
      };
    },
  };
}
