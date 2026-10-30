import "server-only";

import {
  PlaceSearchRequestSchema,
  PlaceSearchResultSchema,
  PlaceSearchResultsSchema,
  fail,
  ok,
  type PlaceSearchResult,
  type Result,
} from "@/contracts";
import { errorNameOf, type LogFields, type LogLieuReason } from "@/server/log";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { periodesDe } from "@/server/usage/periodes";
import { horlogeSysteme, type PortConsommation } from "@/server/usage/port";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";

/**
 * Cœur de la recherche d'un lieu à soi sur `api` (tâche M5d-1, ticket 939 ; décision 0147 § 3 point 6, sur le modèle de
 * M1f, 0141 § 6.1) : contrôles d'entrée, ordre d'une action, port de consommation borné à **un** appel, construction du
 * client par une fabrique **injectée**. Il n'importe ni la fabrique des clients Google, ni le limiteur, ni la barrière, ni
 * les compteurs, ni `src/grounding` : tout ce qui est propre au terminal (`src/server/composition/lieux-api.ts`, seul
 * importateur de `clients-google` pour ce chemin) passe par les ports (`PortsRechercheLieux`).
 *
 * **Ordre d'une action, fixé** (0147 § 3 point 6, § 8 point 2, § 6.4 point 1) :
 *
 * 1. cadre des actions sur un voyage (`executerActionVoyage`) : session (`unauthenticated`), entrée stricte
 *    `PlaceSearchRequestSchema` (`validation_failed`), voyage dans l'organisation (`not_found`) ; dans la même transaction en
 *    lecture seule, droit « voyage débloqué » et **nom maison** de la ville de la journée (`stays.city` du séjour qui couvre
 *    sa date ; nul : texte saisi seul, § 3 point 2). Ces refus ne sont pas journalisés par `lieu.recherche` (§ 12 S1 point 5) ;
 * 2. entrée revalidée par le cœur (caractère de contrôle dans le texte : `validation_failed`, motif `entree_invalide`) ;
 * 3. voyage non débloqué : `not_unlocked` (`retryable` faux), motif `non_debloque`, sans rien appeler ;
 * 4. `ouvrir` (garde des seuils, puis barrière ; fermée : `provider_error`, aucune clé lue, aucun compteur) ;
 * 5. client construit (clé lue après la barrière de sortie, sans appel ; échec : `provider_error`, motif `client`, aucune
 *    unité consommée) ;
 * 6. `reserver` (limiteur `ip` puis `trip`, puis compteur global du jour) : `rate_limited` ou `cost_cap_reached` ;
 * 7. **un** appel Google ; erreur : `provider_error`, motif `google_erreur` (diagnostic fermé) ;
 * 8. `apres` (purge des compteurs), après tout appel tenté ; ne lève jamais ;
 * 9. réponse : `PlaceSearchResult[]` (5 au plus, `resultId` = `placeId`), motif `ok` ou `aucun_resultat` avec `places`.
 *
 * **Une ligne `lieu.recherche` par action** qui atteint l'étape 2, par le port `journal` du terminal. Jamais journalisés : la
 * requête saisie, la ville, un `placeId`, un nom ou une adresse Google, le voyage, l'organisation. Rien n'est stocké : ni la
 * requête, ni les résultats (le serveur ne garde rien entre la recherche et l'ajout, § 3 point 4).
 */

/** Ville de la journée et droit « voyage débloqué », lus dans la transaction du cadre. */
type LectureVoyage = { readonly debloque: boolean; readonly ville: string | null };

/**
 * Nom maison de la ville du séjour qui couvre la date de la journée (0147 § 3 point 2 ; spécification M5 § 6, en attendant
 * M4) : date = début du voyage + (jour − 1) ; séjour dont `from_date ≤ date < to_date`, sinon celui qui se termine ce jour-là
 * (jour du départ). `stays.city` est un libellé du `TripDraft`, jamais une donnée Google ; nul : aucune ville.
 */
export const SQL_VILLE_DU_JOUR = `SELECT s.city FROM public.stays s
  JOIN public.trips t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.organization_id = $1 AND s.trip_id = $2
    AND s.from_date <= t.start_date + ($3::integer - 1) AND t.start_date + ($3::integer - 1) <= s.to_date
  ORDER BY (t.start_date + ($3::integer - 1) < s.to_date) DESC, s.from_date DESC, s.id
  LIMIT 1`;

/** Ville lue : texte d'une ligne de 1 à 120 caractères, sinon aucune ville (requête sans suffixe). */
function villeLue(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const ville = valeur.trim();
  return ville.length === 0 || ville.length > 120 || CONTROLE.test(ville) ? null : ville;
}

/** Caractères de contrôle (C0, DEL, C1) : refusés dans le texte saisi (§ 12 S2 : rien d'inattendu n'est envoyé). */
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Formes du client de la recherche (`ClientLieux` de `@/grounding/interfaces`), recopiées ici : ce module n'atteint pas
 * `src/grounding` (graphe de l'application, 0081 B9-TL-1) ; le contrôle de type de `creerClientLieux` dans le terminal les
 * tient égales.
 */
export type ResultatLieu = { readonly placeId: string; readonly nom: string; readonly adresse: string | null };
export type ClientLieux = { rechercherLieux(texte: string, ville: string | null): Promise<readonly ResultatLieu[]> };

/** Options remises à la fabrique : port borné à un appel, nature `execution` sans exécution, aucun plafond de forfait. */
export type OptionsFabriqueLieux = {
  readonly usage: PortConsommation;
  readonly contexte: () => { readonly nature: "execution"; readonly executionId: null; readonly periodes: ReturnType<typeof periodesDe> };
  readonly plafonds: readonly [];
  readonly horloge: typeof horlogeSysteme;
};

/** Refus de la barrière (`ouvrir`) : seuils non validés ou barrière fermée. */
export type RefusOuverture = "seuils_non_valides" | "barriere";
/** Refus de la réservation (`reserver`) : limiteur par adresse IP, par voyage, compteur du jour, compteur indisponible. */
export type RefusReservation = "limite" | "limite_voyage" | "limite_jour" | "compteur_indisponible";

/** Diagnostic fermé : code et code HTTP d'une erreur de Google, nom de classe ; jamais le message. */
export type DiagnosticLieu = Pick<LogFields, "googleCode" | "httpStatus" | "errorName">;

/** Ports du terminal (0147 § 3 point 6). */
export type PortsRechercheLieux = {
  /** Garde des seuils, puis barrière B9-TL-8 (crochet de `api` du terminal) : `null` si ouverte. Aucune clé, aucune base. */
  readonly ouvrir: () => Promise<RefusOuverture | null>;
  /** Fabrique du client (`creerClientLieux`, passé par le terminal). */
  readonly fabrique: (options: OptionsFabriqueLieux) => ClientLieux;
  /** Limiteur (`lieu-recherche`, espèces `ip` puis `trip`), puis compteur global du jour : `null` si accordé. */
  readonly reserver: (tripId: string) => Promise<{ readonly refus: RefusReservation; readonly errorName?: string } | null>;
  /** Après tout appel Google tenté ; ne lève jamais. */
  readonly apres: () => Promise<void>;
  /** Une ligne `lieu.recherche` : issue fermée, nombre de résultats, diagnostic fermé. */
  readonly journal: (raison: LogLieuReason, details?: DiagnosticLieu & { readonly places?: number }) => void;
};

export type DependancesRechercheLieux = DependancesAction;

/**
 * Diagnostic fermé d'une erreur levée par le client Google : code, code HTTP, nom de classe ; jamais le message (même
 * lecture que la recherche de ville, `diagnosticGoogle` de `src/server/villes/recherche.ts`, que ce module n'importe pas).
 */
export function diagnosticLieu(erreur: unknown): DiagnosticLieu {
  const lu = typeof erreur === "object" && erreur !== null ? (erreur as { code?: unknown; status?: unknown }) : {};
  const errorName = errorNameOf(erreur);
  return {
    ...(typeof lu.code === "string" ? { googleCode: lu.code } : {}),
    ...(typeof lu.status === "number" ? { httpStatus: lu.status } : {}),
    ...(errorName !== undefined ? { errorName } : {}),
  };
}

/** Port en mémoire borné à **une** requête : chaque recherche ne peut appeler Google qu'une fois. */
function portUnAppel(): PortConsommation {
  let reservees = 0;
  return {
    async reserve() {
      if (reservees >= 1) return { ok: false, code: "cap_reached" };
      reservees += 1;
      return { ok: true, reservationId: "lieu_1" };
    },
    async confirm() {},
    async abandon() {},
    async release() {
      reservees = Math.max(0, reservees - 1);
    },
    async consumption() {
      return { requetes: reservees, elements: 0, coutMicros: 0 };
    },
  };
}

/** Résultats rendus : forme `PlaceSearchResult` contrôlée une à une (un résultat hors contrat est écarté), 5 au plus. */
export function resultatsRendus(resultats: readonly ResultatLieu[]): PlaceSearchResult[] {
  const rendus: PlaceSearchResult[] = [];
  const vus = new Set<string>();
  for (const resultat of resultats) {
    const lu = PlaceSearchResultSchema.safeParse({
      resultId: resultat.placeId,
      name: resultat.nom,
      ...(resultat.adresse === null ? {} : { address: resultat.adresse }),
    });
    if (!lu.success || vus.has(lu.data.resultId)) continue;
    vus.add(lu.data.resultId);
    rendus.push(lu.data);
    if (rendus.length >= 5) break;
  }
  return PlaceSearchResultsSchema.parse(rendus);
}

const NON_DEBLOQUE: Result<never> = { ok: false, error: { code: "not_unlocked", retryable: false } };

/** Erreur rendue pour un refus de réservation : débit (`rate_limited`), plafond du jour (`cost_cap_reached`), panne. */
function erreurDeReservation(refus: RefusReservation): Result<never> {
  if (refus === "limite" || refus === "limite_voyage") return { ok: false, error: { code: "rate_limited", retryable: true } };
  if (refus === "limite_jour") return fail("cost_cap_reached");
  return fail("provider_error");
}

/** `searchPlaces` de `api` (voir l'en-tête du module) : `PlaceSearchRequest` → `PlaceSearchResult[]`. */
export async function rechercherLieux(dependances: DependancesRechercheLieux, entree: unknown, ports: PortsRechercheLieux): Promise<Result<PlaceSearchResult[]>> {
  // 1. Cadre : session, entrée stricte, voyage dans l'organisation ; droit et ville lus en lecture seule.
  const lu = await executerActionVoyage("search-places", dependances, PlaceSearchRequestSchema, entree, async (executeur: ExecuteurAction, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const debloque = (await lireDroitVoyage(executeur, valeur.tripId)) !== null;
    const ville = debloque ? villeLue((await executeur.query(SQL_VILLE_DU_JOUR, [ctx.organizationId, valeur.tripId, valeur.day])).rows[0]?.city) : null;
    return { lecture: { debloque, ville } satisfies LectureVoyage, valeur };
  });
  if (!lu.ok) return lu;
  const { lecture, valeur } = lu.value;

  // 2. Entrée revalidée (le schéma a déjà retiré les espaces et borné la longueur).
  if (CONTROLE.test(valeur.query)) {
    ports.journal("entree_invalide");
    return fail("validation_failed", "query");
  }
  // 3. Voyage débloqué (0147 § 8 point 2), avant tout appel.
  if (!lecture.debloque) {
    ports.journal("non_debloque");
    return NON_DEBLOQUE;
  }
  // 4. Barrière.
  const ferme = await ports.ouvrir();
  if (ferme !== null) {
    ports.journal(ferme);
    return fail("provider_error");
  }
  // 5. Client, avant toute réservation.
  let client: ClientLieux;
  try {
    const horloge = horlogeSysteme;
    client = ports.fabrique({
      usage: portUnAppel(),
      contexte: () => ({ nature: "execution", executionId: null, periodes: periodesDe("google", horloge) }),
      plafonds: [],
      horloge,
    });
  } catch (erreur) {
    ports.journal("client", diagnosticLieu(erreur));
    return fail("provider_error");
  }
  // 6. Débit et plafond du jour.
  const refus = await ports.reserver(valeur.tripId);
  if (refus !== null) {
    ports.journal(refus.refus, refus.errorName === undefined ? {} : { errorName: refus.errorName });
    return erreurDeReservation(refus.refus);
  }
  // 7. Un appel ; 8. purge.
  let resultats: PlaceSearchResult[];
  try {
    resultats = resultatsRendus(await client.rechercherLieux(valeur.query, lecture.ville));
  } catch (erreur) {
    await apres(ports);
    ports.journal("google_erreur", diagnosticLieu(erreur));
    return fail("provider_error");
  }
  await apres(ports);
  // 9. Réponse.
  ports.journal(resultats.length === 0 ? "aucun_resultat" : "ok", { places: resultats.length });
  return ok(resultats);
}

/** Port `apres`, gardé : il ne change jamais le résultat de l'action. */
async function apres(ports: PortsRechercheLieux): Promise<void> {
  try {
    await ports.apres();
  } catch {
    // La purge ne lève jamais ; une erreur inattendue reste sans effet sur la réponse.
  }
}
