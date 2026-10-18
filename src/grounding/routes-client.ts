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

/**
 * Élément de la matrice, lu **un à un** (décision 0090 § 1). Formes documentées de `RouteMatrixElement` (référence REST de
 * `computeRouteMatrix` et page « route matrix on transit ») :
 * - `originIndex` et `destinationIndex` : entiers ; une valeur 0 peut être omise (JSON de proto3) ;
 * - `duration` : secondes avec **jusqu'à neuf décimales**, suivies de `s` (« 160s », mais aussi « 3.5s ») ;
 * - `condition` : `ROUTE_EXISTS`, `ROUTE_NOT_FOUND`, ou omise (`…_UNSPECIFIED`, seulement quand `status` n'est pas OK) ;
 * - `status` (absent du masque, toléré s'il est rendu ; 0090 § 3 point 5 : ne pas l'ajouter au masque, le SKU facturé
 *   pourrait changer) : objet `google.rpc.Status`, `{}` ou `code` 0 pour OK, seul `code` est gardé ;
 * - tout autre champ (`localizedValues`, `fallbackInfo`, `travelAdvisory`…) est ignoré.
 */
const ElementSchema = z.object({
  originIndex: z.number().int().min(0).optional(),
  destinationIndex: z.number().int().min(0).optional(),
  duration: z.string().optional(),
  condition: z.string().optional(),
  // `code` seul : Zod retire les champs inconnus (`message`, `details` de `google.rpc.Status` jamais gardés ; 0090 § 3
  // point 3, défense en profondeur).
  status: z.object({ code: z.number().int().optional() }).optional(),
});
const MatriceSchema = z.array(z.unknown()).max(ELEMENTS_MAX);
const DUREE = /^\d{1,9}(?:\.\d{1,9})?s$/;

/** Durée en secondes d'une valeur `duration` documentée (fraction gardée), ou `undefined`. */
function secondesDe(duree: string | undefined): number | undefined {
  if (duree === undefined || !DUREE.test(duree)) return undefined;
  const valeur = Number.parseFloat(duree.slice(0, -1));
  return Number.isFinite(valeur) && valeur >= 0 ? valeur : undefined;
}

/**
 * Lecture de la matrice, paire par paire (décision 0090 § 1, ticket 493 : une réponse Routes en transports en commun
 * ne doit plus arrêter l'exécution ; remplace la correspondance stricte élément → paire de P0r1). Règle unique : **jamais une durée attribuée à une mauvaise paire** ; toute incertitude donne une durée inconnue
 * (`null`), que le moteur traite comme un trajet inconnu (lieu non planifié depuis ou vers ce point), jamais une erreur :
 * - élément illisible (pas un objet, index non entier…) : ignoré ; `status` en erreur : sa paire est inconnue ;
 * - index absent : 0 (JSON de proto3) ; index hors de la matrice : la réponse ne correspond pas à la requête, **toute**
 *   la matrice est inconnue ;
 * - paire rendue deux fois ou plus (élément répété, ou élément sans index qui retombe sur 0) : paire inconnue ;
 * - paire manquante : inconnue ;
 * - durée seulement si `condition` vaut `ROUTE_EXISTS` et si `duration` suit la forme documentée ; fraction gardée,
 *   **aucun arrondi ici** (0090 § 2 : la conversion en minutes, `Math.ceil`, est faite par chaque usage).
 * Résidu accepté (0090 § 1) : une réponse d'un seul élément sans aucun index est lue comme la paire `0:0` ; c'est la
 * lecture correcte d'un JSON proto3 pour une matrice 1 × 1, et pour une matrice plus grande les autres paires restent
 * inconnues.
 * Une réponse qui n'est pas un tableau (ou de plus de 625 éléments) reste refusée : `invalid_response`.
 */
function lireMatrice(brut: unknown, origines: number, destinations: number): (number | null)[][] {
  const lu = MatriceSchema.safeParse(brut);
  if (!lu.success) throw new ErreurClientGoogle("invalid_response");
  const inconnue = () => Array.from({ length: origines }, () => Array.from({ length: destinations }, (): number | null => null));
  const vues = new Map<string, number>();
  const durees = new Map<string, number>();
  for (const brutElement of lu.data) {
    const element = ElementSchema.safeParse(brutElement);
    if (!element.success) continue;
    const { originIndex, destinationIndex, duration, condition, status } = element.data;
    const de = originIndex ?? 0;
    const vers = destinationIndex ?? 0;
    if (de >= origines || vers >= destinations) return inconnue();
    const paire = `${de}:${vers}`;
    vues.set(paire, (vues.get(paire) ?? 0) + 1);
    const enErreur = status?.code !== undefined && status.code !== 0;
    const secondes = condition === "ROUTE_EXISTS" && !enErreur ? secondesDe(duration) : undefined;
    if (secondes !== undefined) durees.set(paire, secondes);
  }
  return inconnue().map((ligne, de) =>
    ligne.map((_, vers) => {
      const paire = `${de}:${vers}`;
      return vues.get(paire) === 1 ? (durees.get(paire) ?? null) : null;
    }),
  );
}

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
      return { secondes: lireMatrice(issue.valeur, origines.length, destinations.length) };
    },
  };
}
