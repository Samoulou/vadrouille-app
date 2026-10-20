import "server-only";

import { z } from "zod";

import { LONGUEURS_TEXTE, TYPES_CRENEAU, type TypeCreneau } from "@/ai/candidat";
import { avecGardeDataCollection, usdEnMicros, type ClientModeles } from "@/ai/client";
import { MAX_RESULTATS_QUARTIER, type CoucheIa } from "@/ai/couche";
import { codeFermeDe as codeFerme, echecIa as echec } from "@/ai/traces";
import { EntreeModelesSchema, EntreeQuartierSchema, type EntreeModeles, type EntreeQuartier } from "@/ai/entrees";
import type { CodeErreurIa, ResultatIa } from "@/ai/erreurs";
import { nettoyerRequeteWeb, type ClientRechercheWeb, type ResultatWeb } from "@/ai/recherche-web";
import type { Routage } from "@/ai/reglages";
import { LodgingSuggestionSchema, MAX_SUGGESTED_LODGINGS, type LodgingSuggestion } from "@/contracts";
import { chercherCandidats, tempsPourAppel, type EtatAgent } from "@/research/agent";
import { BornesRechercheSchema, bornesMini, ProfilMiniSchema, type BornesRecherche, type ProfilMini } from "@/research/bornes";
import { BilanRechercheSchema, CandidatTrouveSchema, faitsDe, libelleSource, type BilanRecherche, type CandidatTrouve } from "@/research/candidat-trouve";
import { urlNormalisee, type LecteurPages } from "@/research/fetch-page";

/**
 * Recherche bornée de production (spécification B7, « Recherche bornée » et B7b ; décision 0096). `creerRecherche` rend
 * deux fonctions :
 * - `rechercher(demande, profil)` : l'agent de recherche (`chercherCandidats`, inchangé hors `dejaConnus`) sous les
 *   bornes d'un profil (`apercu`, `complet`, `mini`), puis la sortie en `CandidatTrouve` et un `BilanRecherche`. Un candidat
 *   n'est rendu que si sa source est en `https:`, figure dans les résultats de recherche **de l'exécution** et n'est pas
 *   plus vieille que `ageSourceMaxJours` (B7-PO-6) ; un événement n'est rendu que dans les dates de la ville (B7-PO-7).
 *   Aucune relance de recherche après l'ancrage (règle de P0) : l'ancrage n'existe pas ici.
 * - `suggererQuartier(entree)` : la recherche de logements posée par le code (aucune étape `plan`, aucune lecture de page),
 *   puis `ia.proposerQuartier` ; les identifiants sont posés par le code.
 *
 * **Arrêt** (B7-PO-5) : cible de candidats (par `creneauCompte`, une cible à 0 est atteinte d'emblée), total, nombre de
 * tours, délai du profil (horloge injectée : aucun appel de modèle, de recherche ni de lecture ne démarre après), ou
 * premier code fermé d'un client (plafond `cap_reached`, `envelope_reached`, `daily_quota_insufficient`, ou erreur du
 * fournisseur) : les candidats déjà admis sont conservés, le code est dans `bilan.errors`. Sans aucun candidat, le code
 * fermé est rendu tel quel (`ok: false`). Une exception sans code fermé est un défaut de programmation : elle se propage.
 *
 * **Traces** : `creerRecherche` ne reçoit pas de `traces?` (décision 0096 § 2 point 4). La composition lui passe le client
 * de modèles et le client de recherche web **déjà décorés** (`tracerModeles`, `tracerRechercheWeb`).
 *
 * Aucune donnée Google ne passe ici : ni `@/grounding`, ni client Google, ni identifiant de lieu.
 */

/** Réglage de l'étape `recherche` de l'agent (modèle et routage de la configuration, `ia.ts`). */
export type ReglageRecherche = {
  readonly modele: string;
  readonly routage: Routage;
};

/**
 * Configuration de la recherche, remplie par la composition à partir de `CONFIGURATION_IA` (`src/server/config/ia.ts`) :
 * `recherche`, `profils`, et `ageSourceMaxJours` (celui de `recherche.json`, aussi dans `profils.apercu`).
 */
export type ConfigurationRecherche = {
  readonly recherche: ReglageRecherche;
  readonly profils: {
    readonly apercu: BornesRecherche;
    readonly complet: BornesRecherche;
    readonly mini: ProfilMini;
  };
  readonly ageSourceMaxJours: number;
};

export type DependancesRecherche = {
  /** Couche IA (`creerCoucheIa`) : seule l'étape `quartier` (`proposerQuartier`) est utilisée, par `suggererQuartier`. */
  readonly ia: Pick<CoucheIa, "proposerQuartier">;
  /** Client de modèles de l'agent (étapes `plan` et `recherche`), le **même** que celui de la couche IA quand les traces sont actives. */
  readonly modeles: ClientModeles;
  readonly rechercheWeb: ClientRechercheWeb;
  readonly lecteur: LecteurPages;
  readonly configuration: ConfigurationRecherche;
  /** Horloge en millisecondes (`Date.now` par défaut) : délai des profils, dates de lecture, durée du bilan. */
  readonly horloge?: () => number;
};

/** Ce que `rechercher` reçoit : l'entrée d'**une** ville (B9 lance une recherche par ville) et les noms déjà connus. */
export type DemandeRecherche = {
  readonly entree: EntreeModeles;
  readonly dejaTrouves?: readonly string[];
};

/** Profil demandé : `apercu`, `complet`, ou `mini` pour un type de créneau (`{ mini: "meal" }`). */
export type DemandeProfil = "apercu" | "complet" | { readonly mini: TypeCreneau };

export type ResultatRecherche = {
  readonly candidats: readonly CandidatTrouve[];
  readonly bilan: BilanRecherche;
};

/** `LodgingSuggestion` sans `placeId` (posé par B8 à l'ancrage). */
export type QuartierPropose = {
  readonly area: LodgingSuggestion["area"];
  readonly lodgings: readonly {
    readonly lodgingId: string;
    readonly name: string;
    readonly meta: string;
  }[];
};

export type Recherche = {
  rechercher(demande: DemandeRecherche, profil: DemandeProfil): Promise<ResultatIa<ResultatRecherche>>;
  /** `observer` reçoit le nombre de logements écartés (source hors des résultats, au-delà de la borne). */
  suggererQuartier(entree: EntreeQuartier, observer?: (logementsEcartes: number) => void): Promise<ResultatIa<QuartierPropose>>;
};

// --- Aides ----------------------------------------------------------------------------------------------------------------------

const JOUR_MS = 86_400_000;

/** Date « AAAA-MM-JJ » (UTC) d'un instant en millisecondes. */
const dateDe = (instant: number): string => new Date(instant).toISOString().slice(0, 10);

const entier = (valeur: number): number => (Number.isFinite(valeur) ? Math.max(0, Math.round(valeur)) : 0);

const DemandeRechercheSchema = z.strictObject({
  entree: EntreeModelesSchema,
  // Noms remis tels quels au modèle (revue de B7b, sécurité 1) : l'appelant (B9) n'y passe jamais un `displayName` ni un nom
  // issu de Places ou de l'ancrage, seulement des noms produits par la recherche elle-même.
  dejaTrouves: z.array(z.string().min(1).max(200)).max(300).optional(),
});

/**
 * Recherches web de logements posées par le code à partir de la ville seule (B7-PO-3) : aucune donnée du voyage ni de la
 * personne. Prises dans l'ordre, au plus `profil.logements.recherchesWeb`.
 */
export const RECHERCHES_LOGEMENTS: readonly ((ville: string) => string)[] = [
  (ville) => `où loger à ${ville} meilleurs quartiers hôtels maisons d'hôtes`,
  (ville) => `quartier conseillé pour dormir à ${ville} hébergements`,
  (ville) => `${ville} where to stay best areas hotels guesthouses`,
  (ville) => `${ville} hébergement petit hôtel centre`,
];

// --- Fabrique -------------------------------------------------------------------------------------------------------------------

export function creerRecherche(dependances: DependancesRecherche): Recherche {
  const { ia, rechercheWeb, lecteur, configuration } = dependances;
  const horloge = dependances.horloge ?? Date.now;
  // Configuration de fond contrôlée à la création : une erreur de composition échoue au démarrage, jamais en cours de route.
  const apercu = BornesRechercheSchema.parse(configuration.profils.apercu);
  const complet = BornesRechercheSchema.parse(configuration.profils.complet);
  const mini = ProfilMiniSchema.parse(configuration.profils.mini);
  const ageSourceMaxJours = z.number().int().min(1).max(3650).parse(configuration.ageSourceMaxJours);
  const modelesGardes = avecGardeDataCollection(dependances.modeles);

  function bornesDe(profil: DemandeProfil): BornesRecherche | undefined {
    if (profil === "apercu") return apercu;
    if (profil === "complet") return complet;
    if (typeof profil === "object" && profil !== null && (TYPES_CRENEAU as readonly string[]).includes(profil.mini)) {
      return bornesMini(mini, profil.mini, ageSourceMaxJours);
    }
    return undefined;
  }

  async function rechercher(demandeBrute: DemandeRecherche, profil: DemandeProfil): Promise<ResultatIa<ResultatRecherche>> {
    const lue = DemandeRechercheSchema.safeParse(demandeBrute);
    const bornes = bornesDe(profil);
    if (!lue.success || bornes === undefined) return echec("invalid_input");
    const { entree, dejaTrouves = [] } = lue.data;

    const debut = horloge();
    // Délai du profil : aucun appel de modèle, de recherche web ni de lecture ne démarre après l'échéance (marge nulle).
    const peutAppeler = bornes.delaiMs === undefined ? undefined : tempsPourAppel(debut + bornes.delaiMs, { modele: 0, page: 0, marge: 0 }, horloge);

    // Ce que l'exécution a vu, enregistré par des décorateurs locaux (l'agent n'est pas modifié pour l'exposer).
    const requetes: string[] = [];
    const sourcesVues = new Map<string, string>(); // adresse normalisée -> date de la recherche qui l'a rendue
    const lectures = new Map<string, number>(); // adresse normalisée -> instant de la lecture réussie
    let coutUsd = 0;
    let pagesLues = 0;
    const cout = (valeur: number) => {
      if (Number.isFinite(valeur) && valeur > 0) coutUsd += valeur;
    };

    const modeles: ClientModeles = {
      async envoyer(requete) {
        const reponse = await modelesGardes.envoyer(requete);
        cout(reponse.coutUsd);
        return reponse;
      },
    };
    const web: ClientRechercheWeb = {
      async rechercher(requete) {
        requetes.push(requete);
        const reponse = await rechercheWeb.rechercher(requete);
        cout(reponse.coutUsd);
        const date = dateDe(horloge());
        for (const resultat of reponse.resultats) {
          const url = urlNormalisee(resultat.url);
          if (url !== undefined && !sourcesVues.has(url)) sourcesVues.set(url, date);
        }
        return reponse;
      },
    };
    const pages: LecteurPages = {
      async lire(url, autorisees) {
        const lecture = await lecteur.lire(url, autorisees);
        if (lecture.ok) {
          pagesLues += 1;
          const normalisee = urlNormalisee(url);
          if (normalisee !== undefined) lectures.set(normalisee, horloge());
        }
        return lecture;
      },
    };

    let etat: EtatAgent | undefined;
    let erreur: CodeErreurIa | undefined;
    let admis: EtatAgent["candidats"] = [];
    try {
      const resultat = await chercherCandidats(entree, {
        modeles,
        modele: configuration.recherche.modele,
        routage: configuration.recherche.routage,
        recherche: web,
        lecteur: pages,
        bornes,
        ...(peutAppeler === undefined ? {} : { peutAppeler }),
        dejaConnus: dejaTrouves,
        observer: (vivant) => {
          etat = vivant;
        },
      });
      admis = resultat.candidats;
    } catch (exception) {
      const code = codeFerme(exception);
      if (code === undefined) throw exception;
      erreur = code;
      admis = etat?.candidats ?? [];
    }

    const reference = horloge();
    const candidats: CandidatTrouve[] = [];
    for (const candidat of admis) {
      const url = candidat.source.url;
      const recherche = sourcesVues.get(url);
      // Source en `https:`, présente dans les résultats de l'exécution : sinon le candidat n'est jamais rendu (R1).
      if (!url.startsWith("https://") || recherche === undefined) continue;
      // Une source plus vieille que `ageSourceMaxJours` n'est pas retenue quand sa date est connue (B7-PO-6).
      if ((reference - Date.parse(`${candidat.source.date}T00:00:00Z`)) / JOUR_MS > bornes.ageSourceMaxJours) continue;
      const lectureInstant = lectures.get(url);
      let evenement: CandidatTrouve["evenement"];
      if (candidat.typeEtape === "event") {
        // Un événement sans date lue, ou hors des dates de la ville, n'est pas rendu (B7-PO-7).
        if (candidat.evenement === undefined || candidat.evenement.date < entree.arrivee || candidat.evenement.date > entree.depart) continue;
        evenement = {
          date: candidat.evenement.date,
          ...(candidat.evenement.heure === undefined ? {} : { heure: candidat.evenement.heure }),
          dateConfirmee: candidat.evenement.dateConfirmee,
          ...(lectureInstant === undefined ? {} : { lueA: new Date(lectureInstant).toISOString() }),
        };
      }
      const trouve = CandidatTrouveSchema.safeParse({
        kind: candidat.typeEtape === "event" ? "event" : "place",
        name: candidat.nom,
        summary: candidat.resume,
        category: candidat.categorie,
        typeEtape: candidat.typeEtape,
        aReserver: candidat.aReserver,
        facts: faitsDe(candidat),
        sources: [
          {
            label: libelleSource(url),
            url,
            checkedOn: dateDe(lectureInstant ?? Date.parse(`${recherche}T00:00:00Z`)),
          },
        ],
        confidence: null,
        ...(evenement === undefined ? {} : { evenement }),
      });
      if (trouve.success) candidats.push(trouve.data);
    }

    if (erreur !== undefined && candidats.length === 0) return echec(erreur);
    // `queries` : requêtes web en texte libre (revue de B7b, sécurité 2). B9 et B9c ne les journalisent pas et ne les
    // envoient pas à l'adaptateur de traces ; le bilan ne sert qu'à l'évaluation et au rapport interne.
    const bilan = BilanRechercheSchema.parse({
      queries: requetes,
      pagesRead: pagesLues,
      durationMs: entier(horloge() - debut),
      costEstimateMicros: entier(usdEnMicros(coutUsd)),
      errors: erreur === undefined ? [] : [erreur],
    });
    return { ok: true, valeur: { candidats, bilan } };
  }

  async function suggererQuartier(entreeBrute: EntreeQuartier, observer?: (logementsEcartes: number) => void): Promise<ResultatIa<QuartierPropose>> {
    const lue = EntreeQuartierSchema.safeParse(entreeBrute);
    if (!lue.success) return echec("invalid_input");
    // La ville est la valeur normalisée par le schéma (`normaliserLieu`), jamais la valeur brute (décision 0096 § 4.2).
    const quartier = lue.data;

    // Bornes du profil `mini` (logements) : au plus `recherchesWeb` recherches posées par le code, dans le délai du profil.
    const debut = horloge();
    const echeance = debut + mini.delaiMs;
    const resultats: ResultatWeb[] = [];
    const vues = new Set<string>();
    let erreur: CodeErreurIa | undefined;
    for (const modeleRequete of RECHERCHES_LOGEMENTS.slice(0, mini.logements.recherchesWeb)) {
      if (horloge() > echeance) break;
      try {
        // Requête posée par le code, nettoyée telle qu'elle part chez le moteur (contrôles, caractères de format sans
        // exception, `<` et `>` retirés) : aucune donnée du brief n'y entre, seulement la ville normalisée.
        const reponse = await rechercheWeb.rechercher(nettoyerRequeteWeb(modeleRequete(quartier.ville), LONGUEURS_TEXTE.requete));
        for (const resultat of reponse.resultats) {
          const url = urlNormalisee(resultat.url);
          if (url === undefined || vues.has(url) || resultats.length >= MAX_RESULTATS_QUARTIER) continue;
          vues.add(url);
          resultats.push({
            url,
            titre: resultat.titre,
            extrait: resultat.extrait,
          });
        }
      } catch (exception) {
        const code = codeFerme(exception);
        if (code === undefined) throw exception;
        erreur = code;
        break;
      }
    }
    // Un code d'échec de la recherche de logements n'est rendu que si aucun résultat n'a été lu : avec des résultats déjà
    // rendus, la proposition se fait sur ceux-là et le code est volontairement ignoré (échec partiel toléré).
    if (erreur !== undefined && resultats.length === 0) return echec(erreur);

    const proposition = await ia.proposerQuartier({ quartier, resultats });
    if (!proposition.ok) return proposition;
    const { zone, logements, refuses } = proposition.valeur;
    // « Aucune zone » explicite : `no_option` (aucune zone proposée, B7-PO-3).
    if (zone === null) return echec("no_option");

    const admis = new Set(resultats.map((resultat) => resultat.url));
    const gardes = logements.filter((logement) => {
      const url = urlNormalisee(logement.sourceUrl);
      return url !== undefined && admis.has(url);
    });
    const retenus = gardes.slice(0, Math.min(mini.logements.cible, MAX_SUGGESTED_LODGINGS));
    observer?.(refuses + (logements.length - retenus.length));

    // Identifiants opaques posés par le code (`area_1`, `lodging_1` à `lodging_3`) ; ceux d'un modèle sont ignorés.
    const complete = LodgingSuggestionSchema.safeParse({
      area: {
        areaId: "area_1",
        name: zone.nom,
        reason: zone.raison,
        center: zone.centre,
        radiusM: zone.rayonM,
      },
      lodgings: retenus.map((logement, rang) => ({
        lodgingId: `lodging_${rang + 1}`,
        name: logement.nom,
        meta: logement.meta,
      })),
    });
    if (!complete.success) return echec("model_output_invalid");
    return {
      ok: true,
      valeur: {
        area: complete.data.area,
        lodgings: complete.data.lodgings.map(({ lodgingId, name, meta }) => ({
          lodgingId,
          name,
          meta,
        })),
      },
    };
  }

  return { rechercher, suggererQuartier };
}
