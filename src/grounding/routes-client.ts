import "server-only";

import { z } from "zod";

import { envoyerGoogle, ErreurClientGoogle, erreurGoogleDe, PLACE_ID_GOOGLE, type Transport } from "@/grounding/enveloppe-google";
import type { ClientRoutes, ModeRoutes, RequeteMatrice } from "@/grounding/interfaces";
import { lireCleGoogle } from "@/server/env/grounding";
import {
  avecReservation,
  DELAI_REQUETE_MS,
  demandeDe,
  horlogeSysteme,
  type ContexteAppel,
  type Horloge,
  type Plafond,
  type PortConsommation,
} from "@/server/usage/port";

/**
 * Client réel de Routes API, matrice de durées (spécification de P0r1, « P0, suite : exécutions réelles », « Clients
 * réels » ; module de capacité réseau, exception nominative de 0031 § 5). **Branché à aucun point d'entrée** (P0r1) :
 * importé seulement par ses tests.
 *
 * - Hôte figé `routes.googleapis.com` ; le `fetch` global n'est référencé que comme transport par défaut, toujours
 *   appelé à travers l'enveloppe (`enveloppe-google.ts`).
 * - Clé par `@/server/env/grounding`, après la barrière de sortie ; refus : le client ne se construit pas.
 * - Masque minimal : `originIndex,destinationIndex,duration,condition` ; préférence de routage non posée (SKU
 *   Essentials de la table de prix, facturé par élément).
 * - Une requête réserve ses éléments (origines × destinations) avant l'appel (D13) ; délai de 10 s par requête.
 * Les durées sont des données Google : en mémoire seulement, jamais dans un prompt ni dans le dépôt.
 */

export const ORIGINE_ROUTES = "https://routes.googleapis.com";
const CHEMIN_MATRICE = "/distanceMatrix/v2:computeRouteMatrix";

export const MASQUE_MATRICE = "originIndex,destinationIndex,duration,condition";
export const SKU_MATRICE = "routes_matrix_essentials";
/** Coût estimé d'un élément, en micro-USD, au prix plein (Q329). */
export const COUT_ELEMENT_MICROS = 5_000;

/** Limites de Routes API : 625 éléments, 100 en transports publics ; 25 origines ou destinations au plus. */
const ELEMENTS_MAX = 625;
const ELEMENTS_MAX_TRANSIT = 100;
const COTE_MAX = 25;

const PLACE_ID = PLACE_ID_GOOGLE;

function modeGoogle(mode: ModeRoutes): "WALK" | "TRANSIT" | "DRIVE" {
  if (mode === "walk") return "WALK";
  if (mode === "transit") return "TRANSIT";
  return "DRIVE";
}

export type OptionsRoutes = {
  readonly usage: PortConsommation;
  readonly contexte: () => ContexteAppel;
  readonly plafonds: readonly Plafond[];
  readonly horloge?: Horloge;
  readonly environnement?: Readonly<Record<string, string | undefined>>;
  readonly execArgv?: readonly string[];
};

const ElementSchema = z.object({
  originIndex: z.number().int().min(0).optional(),
  destinationIndex: z.number().int().min(0).optional(),
  duration: z.string().regex(/^\d{1,7}s$/).optional(),
  condition: z.enum(["ROUTE_EXISTS", "ROUTE_NOT_FOUND", "ROUTE_MATRIX_ELEMENT_CONDITION_UNSPECIFIED"]).optional(),
});
const MatriceSchema = z.array(ElementSchema).max(ELEMENTS_MAX);

export function createRoutesClient(options: OptionsRoutes, transport: Transport = fetch): ClientRoutes {
  const cle = lireCleGoogle(options.environnement, options.execArgv);
  if (!cle.ok) throw new ErreurClientGoogle(cle.code);
  const parametres = { origine: ORIGINE_ROUTES, cle: cle.cle, transport };
  const dependances = { port: options.usage, horloge: options.horloge ?? horlogeSysteme };

  return {
    async matrice(requete: RequeteMatrice) {
      const { origines, destinations } = requete;
      const elements = origines.length * destinations.length;
      const maximum = requete.mode === "transit" ? ELEMENTS_MAX_TRANSIT : ELEMENTS_MAX;
      if (
        origines.length === 0 ||
        destinations.length === 0 ||
        origines.length > COTE_MAX ||
        destinations.length > COTE_MAX ||
        elements > maximum ||
        ![...origines, ...destinations].every((id) => PLACE_ID.test(id))
      ) {
        throw new ErreurClientGoogle("invalid_request");
      }
      const corps = JSON.stringify({
        origins: origines.map((placeId) => ({ waypoint: { placeId } })),
        destinations: destinations.map((placeId) => ({ waypoint: { placeId } })),
        travelMode: modeGoogle(requete.mode),
      });
      const issue = await avecReservation(
        dependances,
        demandeDe(
          options.contexte(),
          { fournisseur: "google", methode: "routes_matrix", sku: SKU_MATRICE, unites: { requetes: 1, elements }, coutEstimeMicros: elements * COUT_ELEMENT_MICROS },
          options.plafonds,
        ),
        DELAI_REQUETE_MS.routes,
        async (signal, transportAppele) => ({
          valeur: await envoyerGoogle(parametres, { chemin: CHEMIN_MATRICE, methode: "POST", masque: MASQUE_MATRICE, corps }, signal, transportAppele),
          coutReelMicros: null,
        }),
      );
      if (!issue.ok) throw erreurGoogleDe(issue);
      const lu = MatriceSchema.safeParse(issue.valeur);
      if (!lu.success) throw new ErreurClientGoogle("invalid_response");
      // Correspondance stricte élément → paire (mineur de la revue du head `353bb20`) : la matrice rend exactement un
      // élément par paire, chaque paire une seule fois ; sinon `invalid_response`. Un index absent vaut 0 : c'est la
      // règle du JSON de proto3, qui omet les valeurs par défaut ; il ne peut plus attribuer une durée à une autre
      // paire, puisqu'une paire répétée ou manquante fait refuser toute la réponse.
      if (lu.data.length !== elements) throw new ErreurClientGoogle("invalid_response");
      const durees = new Map<string, number>();
      const vues = new Set<string>();
      for (const element of lu.data) {
        const de = element.originIndex ?? 0;
        const vers = element.destinationIndex ?? 0;
        if (de >= origines.length || vers >= destinations.length) throw new ErreurClientGoogle("invalid_response");
        const paire = `${de}:${vers}`;
        if (vues.has(paire)) throw new ErreurClientGoogle("invalid_response");
        vues.add(paire);
        if (element.condition === "ROUTE_EXISTS" && element.duration !== undefined) durees.set(paire, Number.parseInt(element.duration, 10));
      }
      return { secondes: origines.map((_, de) => destinations.map((__, vers) => durees.get(`${de}:${vers}`) ?? null)) };
    },
  };
}
