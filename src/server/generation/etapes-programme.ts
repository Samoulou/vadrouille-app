import "server-only";

import { ChecklistItemSchema, type Trip, type TripSnapshot } from "@/contracts";
import { identifiantLigneAFaire, lignesDuProgramme } from "@/domain/a-faire";
import {
  lieuxHorsPart,
  reduireSiteDuProgramme,
  type CapaciteProgramme,
  type ControleVerification,
  type ExecuteurPublication,
  type LieuxVerifies,
  type OptionsEtape,
  type RedactionProgramme,
} from "@/server/composition/generation";
import { CASES_APERCU, DUREE_ETAPE_MS, RANG_PROGRAMME, RECIT_API_AUTORISE, type EtapeProgramme } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { errorNameOf, logEvent } from "@/server/log";
import { assemblerProgrammeIa, modeDeTrajet } from "@/server/programme/assemblage";
import { briefDepuisFormulaire, type BriefEssai } from "@/server/programme/brief";
import { entreeProgrammeDepuisBrief } from "@/server/programme/entree";
import { instantaneDuProgramme } from "@/server/programme/instantane";
import { avecSiteGarde, compteursNonSoumis, SITES_DUREE_MAX_MS, sitesDuProgramme, verifierSites, type CompteursSites, type ResultatSites } from "@/server/programme/sites";
import { DELAI_REQUETE_MS } from "@/server/usage/port";
import { executeurSql } from "@/server/with-org";

import type { EtatBarriere } from "./barriere";
import { casesDuProgramme, statutDesCases } from "./cases-programme";
import { ArretEtape, codeDeErreur, codeFerme } from "./codes";
import type { DependancesGeneration, DependancesResolues } from "./dependances";
import { resoudre } from "./dependances";
import { lireEtatProgramme, type EtatProgramme } from "./etat";
import { cibleDuForfait, forfaitDuProgramme, type ForfaitDeLEtape } from "./forfait-etape";
import { cloreEnEchecAuRang, commencerEtapeAuRang } from "./garde";
import { lireVoyage, type ExecuteurLecture, type VoyageLu } from "./lecture";
import { publier } from "./publication";
import { SQL_PLACE_SEJOUR } from "./sql-sejours";

/**
 * Étapes de `generateProgramme`, la chaîne inversée sur `api` (décision 0136 § 2 et § 3 ; verdict 0139). **Fonctions
 * ordinaires, testables sans le SDK de workflows** : `src/workflows/programme.ts` les enveloppe dans des `"use step"` et n'y
 * ajoute rien. Mêmes règles que les étapes de `generatePreview` (`etapes.ts`) : entrée validée par son contrat strict, garde
 * `step_seq` sur la ligne `preview` **au rang de `RANG_PROGRAMME`** (`a` = 1, `e` = 2), barrière évaluée à l'entrée, forfait
 * réservé avant tout appel, toute écriture sous la garde, sortie `{ generationRunId, organizationId, rang }` plus le code
 * fermé d'un arrêt, jamais une donnée de lieu.
 *
 * - **`a`** (rang 1, `maxRetries` 2, déterministe, sans appel) : relit le voyage, le convertit par `briefDepuisFormulaire`
 *   (refus : `invalid_input`, défense en profondeur derrière le refus de `createTrip`, 0136 § 3.8) et **réserve le forfait** du
 *   profil `programme` (§ 6).
 * - **`e`** (rang 2, `maxRetries` 0) : l'étape « programme » (§ 2.3), en mémoire jusqu'à l'écriture : logements d'abord
 *   (`lodging_unresolved` avant toute requête de modèle), une requête `programme` (jamais une donnée Google), lecture tolérante
 *   et ordre écrit (aucune journée lisible : `model_output_invalid`), vérification des lieux sous la part et l'échéance (sans
 *   réserve de trajets : aucun appel Routes, § 2.4) et des sites en parallèle, assemblage sans replanification, puis
 *   **publication en une transaction** (§ 3) : version 1, cases de l'aperçu, `stays.place_id`, lignes « À faire », positions
 *   (variante réelle seulement) et fin de l'exécution, ensemble ou pas du tout.
 *
 * Journal : `generation.programme_written` (compteurs maison, liste fermée tenue par `log.ts`, verdict 0139 § 2), aussi quand
 * l'étape `e` lève (`warn`, nom de l'erreur seul) ; aucun identifiant, aucun événement `p0.*`.
 */

type Executeur = ExecuteurLecture & { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

type Contexte = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly requestId: string | null;
  readonly echeance: number;
  readonly etape: EtapeProgramme;
  readonly barriere: EtatBarriere;
};

/** Une transaction de l'organisation, exécuteur SQL fourni (aussi utilisée par la révision, `etapes-revision.ts`). */
export const sql = <T>(contexte: Pick<Contexte, "dep" | "organizationId">, travail: (executeur: Executeur) => Promise<T>): Promise<T> =>
  contexte.dep.transaction(contexte.organizationId, (tx) => travail(executeurSql(tx)));

/**
 * Marge de la vérification avant l'échéance (celle de `p0Run`, `MARGE_VERIFICATION_AGENT_MS`) : le registre refait le contrôle
 * quelques millisecondes plus tard ; sans elle, un appel admis ici serait refusé par le registre au lieu d'arrêter la boucle.
 */
export const MARGE_VERIFICATION_MS = 1_000;

/** Gabarit commun : garde au rang, barrière, corps, clôture en échec sur un code fermé (règles de `executer`, `etapes.ts`). */
async function executerProgramme(entree: unknown, etape: EtapeProgramme, corps: (contexte: Contexte) => Promise<void>, dependances?: DependancesGeneration): Promise<EtatProgramme> {
  const etat = lireEtatProgramme(entree);
  if (etat.arret !== undefined) return etat;
  const dep = resoudre(dependances);
  const { organizationId, generationRunId } = etat;
  const rang = RANG_PROGRAMME[etape];
  const ouverte = await dep.transaction(organizationId, (tx) => commencerEtapeAuRang(executeurSql(tx), organizationId, generationRunId, etape, rang, new Date(dep.maintenant())));
  if (ouverte === null) return { ...etat, arret: "step_expired" };
  const commun = { dep, organizationId, generationRunId, tripId: ouverte.tripId, requestId: ouverte.requestId, echeance: dep.maintenant() + DUREE_ETAPE_MS, etape };
  try {
    const barriere = await dep.barriere();
    if (barriere === "production") throw new ArretEtape("production_refused");
    await corps({ ...commun, barriere });
    return { generationRunId, organizationId, rang };
  } catch (erreur) {
    // Seule `a` (déterministe, sans appel) est rejouée par la file ; un arrêt fermé ne l'est jamais.
    if (etape === "a" && !(erreur instanceof ArretEtape)) throw erreur;
    const code = erreur instanceof ArretEtape ? erreur.code : codeDeErreur(erreur);
    try {
      await sql(commun, (x) => cloreEnEchecAuRang(x, organizationId, generationRunId, rang, code, new Date(dep.maintenant())));
    } catch {
      // Clôture impossible : l'exécution expire (`step_expired`).
    }
    return { generationRunId, organizationId, rang, arret: code };
  }
}

/** Clôture d'une exécution dont une étape a levé une erreur inattendue (workflow, après les reprises de la file). */
export async function etapeClotureProgramme(entree: unknown, code: unknown, dependances?: DependancesGeneration): Promise<EtatProgramme> {
  const etat = lireEtatProgramme(entree);
  const dep = resoudre(dependances);
  const ferme = codeFerme(code);
  try {
    await sql({ dep, organizationId: etat.organizationId }, (x) =>
      x.query(
        `UPDATE public.generation_runs SET phase = 'failed', stop_reason = $3, updated_at = $4::timestamptz, finished_at = $4::timestamptz
         WHERE organization_id = $1 AND id = $2 AND phase IN ('queued', 'preparing') AND kind = 'preview'`,
        [etat.organizationId, etat.generationRunId, ferme, new Date(dep.maintenant()).toISOString()],
      ),
    );
  } catch {
    // L'exécution expire.
  }
  return { ...etat, arret: etat.arret ?? ferme };
}

// --- Lecture et conversion -----------------------------------------------------------------------------------------------

const SQL_RECIT = "SELECT story FROM public.briefs WHERE organization_id = $1 AND trip_id = $2 ORDER BY version DESC LIMIT 1";

/**
 * Récit du voyage (0136 § 3 « Récit » ; verdict 0139 § 1.2) : **lu seulement si `RECIT_API_AUTORISE`**, garde fermée tant que
 * Samuel n'a pas répondu à Q636 ; fermée, rien n'est lu et la conversion reçoit `undefined`.
 */
async function recitDuVoyage(x: Executeur, contexte: Pick<Contexte, "organizationId" | "tripId">): Promise<string | undefined> {
  if (!RECIT_API_AUTORISE) return undefined;
  const story = (await x.query(SQL_RECIT, [contexte.organizationId, contexte.tripId])).rows[0]?.story;
  return typeof story === "string" ? story : undefined;
}

/** Voyage relu et converti (même conversion que le site d'essai) ; illisible ou refusé : `invalid_input`. */
async function briefOuArreter(contexte: Contexte, x: Executeur): Promise<{ readonly voyage: VoyageLu; readonly brief: BriefEssai }> {
  const voyage = await lireVoyage(x, contexte.organizationId, contexte.tripId);
  if (voyage === null) throw new ArretEtape("invalid_input");
  const conversion = briefDepuisFormulaire(voyage.draft, voyage.brief, await recitDuVoyage(x, contexte));
  if (!conversion.ok) throw new ArretEtape("invalid_input");
  return { voyage, brief: conversion.brief };
}

/**
 * Voyage relu et converti **sans récit**, pour la révision de la chaîne inversée (M1b, ticket 868) : la conversion de
 * `briefOuArreter`, `recit` toujours absent (choix conservateur tant que la Sécurité n'a pas jugé une requête de révision qui
 * recevrait le récit, verdict 0139 § 1.2 point 2) ; `briefs.story` n'est pas lu. Illisible ou refusé : `invalid_input`.
 */
export async function voyageEtBriefSansRecit(x: Executeur, organizationId: string, tripId: string): Promise<{ readonly voyage: VoyageLu; readonly brief: BriefEssai }> {
  const voyage = await lireVoyage(x, organizationId, tripId);
  if (voyage === null) throw new ArretEtape("invalid_input");
  const conversion = briefDepuisFormulaire(voyage.draft, voyage.brief, undefined);
  if (!conversion.ok) throw new ArretEtape("invalid_input");
  return { voyage, brief: conversion.brief };
}

// --- Étape a : brief et forfait ------------------------------------------------------------------------------------------

/** Étape `a` (rang 1) : relecture, conversion, réservation du forfait du profil `programme` ; aucun appel externe. */
export function etapeProgrammeDebut(entree: unknown, dependances?: DependancesGeneration): Promise<EtatProgramme> {
  return executerProgramme(
    entree,
    "a",
    async (contexte) => {
      await sql(contexte, (x) => briefOuArreter(contexte, x));
      await forfaitDuProgramme(contexte.dep, cibleDuForfait(contexte));
    },
    dependances,
  );
}

// --- Étape e : programme -------------------------------------------------------------------------------------------------

/**
 * Compteurs maison de `generation.programme_written` (verdict 0139 § 2 point 2 ; ceux de `p0.programme_written`) : des
 * nombres, aucun verdict de vérification, aucun identifiant.
 */
export type CompteursProgramme = {
  days: number;
  slots: number;
  placesToVerify: number;
  daysRemoved: number;
  slotsRemoved: number;
  fieldsRemoved: number;
  textsCut: number;
  modelCalls: number;
  unverifiedForCap: number;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
} & CompteursSites;

function journaliser(compteurs: CompteursProgramme, echec?: { readonly erreur: unknown }): void {
  const nomErreur = echec === undefined ? undefined : errorNameOf(echec.erreur);
  logEvent("generation.programme_written", { ...compteurs, ...(nomErreur === undefined ? {} : { errorName: nomErreur }) }, echec === undefined ? "info" : "warn");
}

/**
 * Identifiant déterministe de la ligne « À faire » de rang `rang` d'une exécution (0136 § 3.3 ; 0139 § 3 condition 4),
 * généralisé par `identifiantLigneAFaire` (décision 0147 § 7.1 point 2) : les 8 premiers chiffres portent le rang, le reste
 * vient de l'identifiant de l'exécution. Jamais tiré d'un texte de l'IA.
 */
export function identifiantBonPlan(generationRunId: string, rang: number): string {
  return identifiantLigneAFaire(generationRunId, rang);
}

/**
 * Bons plans de la chaîne inversée : non vides, dans l'ordre de l'IA, validés par `ChecklistItemSchema`, sorte `other`. Leur
 * rang suit celui des lignes du programme (`premierRang`, 0147 § 7.1 point 2 : un seul rang, réservations et engagements
 * d'abord, puis les bons plans).
 */
export function lignesAFaire(checklist: Trip["checklist"], generationRunId: string, premierRang = 0): { readonly id: string; readonly label: string }[] {
  return checklist
    .map((item) => item.label.trim())
    .filter((label) => label !== "")
    .map((label, rang) => {
      const item = ChecklistItemSchema.parse({ id: identifiantBonPlan(generationRunId, premierRang + rang), kind: "other", label, when: { type: "beforeDeparture" }, done: false, sponsored: false });
      return { id: item.id, label: item.label };
    });
}

/** Ligne « À faire » de la version 1, telle que `ecrireDePlus` l'écrit. */
export type LigneDeLaVersion1 = {
  readonly id: string;
  readonly kind: "reservation" | "ticket" | "other";
  readonly label: string;
  readonly done: boolean;
  readonly stopId: string | null;
};

/**
 * Lignes « À faire » de la **version 1 seulement** (décision 0147 § 7.1, T9 ; M5-PO-13) : une ligne `reservation` par étape
 * `toReserve` (libellé = le seul nom de l'étape) et une ligne `ticket` faite par engagement, dans l'ordre du programme
 * (`lignesDuProgramme`), puis les bons plans (`other`), sur un seul rang. Aucune autre version n'écrit ces lignes : elle passe
 * par `lignesApresVersion` (`ecrireVersion`, § 7.2).
 */
export function lignesDeLaVersion1(instantane: TripSnapshot, checklist: Trip["checklist"], generationRunId: string): LigneDeLaVersion1[] {
  const programme = lignesDuProgramme(instantane).map((ligne, rang) => ({ id: identifiantBonPlan(generationRunId, rang), ...ligne }));
  const bonsPlans = lignesAFaire(checklist, generationRunId, programme.length).map((ligne) => ({ ...ligne, kind: "other" as const, done: false, stopId: null }));
  return [...programme, ...bonsPlans];
}

/** Compteurs à zéro d'un passage de l'étape « programme » (ou de la révision). */
export function compteursInitiaux(): CompteursProgramme {
  return {
    days: 0,
    slots: 0,
    placesToVerify: 0,
    daysRemoved: 0,
    slotsRemoved: 0,
    fieldsRemoved: 0,
    textsCut: 0,
    modelCalls: 0,
    unverifiedForCap: 0,
    ...compteursNonSoumis(0),
  };
}

/** Programme rédigé, vérifié et assemblé, en mémoire jusqu'à la publication de l'appelant. */
export type ProgrammeVerifie = {
  readonly complet: ReturnType<typeof assemblerProgrammeIa>;
  readonly instantane: TripSnapshot;
  readonly verifies: LieuxVerifies;
  /** `placeId` des logements du brief, dans son ordre. */
  readonly logements: readonly string[];
  /** Instant pris **avant** les fiches qui rendent les positions (0060 § 1.3 point 2). */
  readonly obtenuesA: number;
};

/**
 * **Corps commun** de l'étape « programme » de `generateProgramme` et de la révision de la chaîne inversée (décision 0126 § 1 :
 * « seules la requête et le filet diffèrent », portée sur `api` par M1b), en mémoire jusqu'à la publication, que l'appelant
 * fait : (1) logements d'abord (`lodging_unresolved` avant toute requête de modèle, 0136 § 2.3.2) ; (2) **une** requête de
 * modèle (`rediger`), lecture tolérante et ordre écrit, une seule fois (aucune journée lisible : `model_output_invalid`) ;
 * (3) vérification des lieux distincts dans l'ordre écrit, part et échéance avant chaque appel, sans réserve de trajets
 * (aucun appel Routes, § 2.4), et des sites en parallèle ; (4) assemblage sans replanification ni trajet par le module partagé
 * (`assemblerProgrammeIa`, organisation de l'exécution) et instantané. Les compteurs sont tenus dans `compteurs`.
 */
export async function redigerEtVerifier(
  contexte: Pick<Contexte, "dep" | "organizationId" | "tripId" | "echeance">,
  entree: {
    readonly brief: BriefEssai;
    readonly capacite: CapaciteProgramme;
    readonly forfait: ForfaitDeLEtape["forfait"];
    readonly registre: ForfaitDeLEtape["registre"];
    readonly compteurs: CompteursProgramme;
  },
  rediger: (capacite: CapaciteProgramme) => Promise<RedactionProgramme>,
): Promise<ProgrammeVerifie> {
  const { brief, capacite, forfait, registre, compteurs } = entree;
  // Instant pris **avant** les fiches qui rendent les positions (0060 § 1.3 point 2).
  const obtenuesA = contexte.dep.maintenant();
  // 1. Logements d'abord : introuvable, `lodging_unresolved` avant toute requête de modèle (0136 § 2.3.2).
  const logements = await capacite.logements(brief);

  // 2. Rédaction : une requête de modèle, lecture tolérante et ordre écrit, une seule fois.
  compteurs.modelCalls += 1;
  const redaction = await rediger(capacite);
  if (redaction.fin !== undefined) compteurs.finishReason = redaction.fin;
  if (redaction.tokens !== undefined) {
    compteurs.inputTokens = redaction.tokens.entree;
    compteurs.outputTokens = redaction.tokens.sortie;
  }
  compteurs.daysRemoved = redaction.joursRetires;
  compteurs.slotsRemoved = redaction.creneauxRetires;
  compteurs.fieldsRemoved = redaction.champsRetires;
  compteurs.textsCut = redaction.textesCoupes;
  const programme = redaction.programme;
  if (programme === null) throw new ArretEtape("model_output_invalid");
  compteurs.days = programme.jours.length;
  compteurs.slots = programme.jours.reduce((total, jour) => total + jour.creneaux.length, 0);
  // Sites proposés : adresses réduites distinctes en ordre écrit, en mémoire seulement (0121 § 2.1 point 1).
  const sites = sitesDuProgramme(programme, reduireSiteDuProgramme);
  compteurs.fieldsRemoved += sites.formesRefusees;
  Object.assign(compteurs, compteursNonSoumis(sites.adresses.length));

  // 3. Vérification des lieux distincts dans l'ordre écrit, part et échéance avant chaque appel, sans réserve de trajets.
  const lieux = capacite.lieux(brief.destination);
  compteurs.placesToVerify = lieux.nombre;
  compteurs.unverifiedForCap = lieuxHorsPart(lieux.nombre, forfait.textSearchRequetes, brief.logements.length);
  const controle: ControleVerification = async (methode) => {
    const methodeGoogle = methode === "textSearch" ? "places_text_search" : "places_details";
    if (contexte.dep.maintenant() + DELAI_REQUETE_MS.places + MARGE_VERIFICATION_MS > contexte.echeance) return "temps";
    const consomme = await registre.consumption(null, { methode: methodeGoogle });
    const plafond = methode === "textSearch" ? forfait.textSearchRequetes : forfait.placeDetailsRequetes;
    return consomme.requetes + 1 > plafond ? "part" : "ok";
  };
  // Sites en parallèle (0121 § 2.1 points 2 et 4), sans donnée commune ; 60 s au plus, jamais au-delà de l'échéance. Si
  // la vérification des lieux lève, les vérifications de sites en cours sont abandonnées et attendues.
  const abandonSites = new AbortController();
  const verificationSites = verifierSites(sites.adresses, capacite.sites, {
    limite: Math.min(contexte.dep.maintenant() + SITES_DUREE_MAX_MS, contexte.echeance),
    maintenant: () => contexte.dep.maintenant(),
    signal: abandonSites.signal,
  });
  const verificationLieux = lieux.verifier(controle).catch((erreur: unknown) => {
    abandonSites.abort();
    throw erreur;
  });
  const [issueLieux, issueSites] = await Promise.allSettled([verificationLieux, verificationSites]);
  const resultatSites: ResultatSites = issueSites.status === "fulfilled" ? issueSites.value : { gardees: new Set(), compteurs: compteursNonSoumis(sites.adresses.length) };
  Object.assign(compteurs, resultatSites.compteurs);
  if (issueLieux.status === "rejected") throw issueLieux.reason;
  const verifies: LieuxVerifies = issueLieux.value;

  // 4. Assemblage sans replanification ni trajet (0136 § 2.3.5 et § 2.4) par le module partagé, puis instantané.
  const jours = programme.jours.map((jour, indiceJour) => ({
    date: jour.date,
    ...(jour.titre === undefined ? {} : { titre: jour.titre }),
    creneaux: jour.creneaux.map((creneau, rang) => ({ ...avecSiteGarde(creneau, sites.adresseDe(indiceJour, rang), resultatSites.gardees), placeId: verifies.placeIdDe(indiceJour, rang) })),
  }));
  const complet = assemblerProgrammeIa({
    tripId: contexte.tripId,
    organizationId: contexte.organizationId,
    brief,
    jours,
    bonsPlans: programme.bonsPlans,
    logements,
    configuration: CONFIGURATION_MOTEUR,
    mode: modeDeTrajet(brief),
    trajets: () => undefined,
  });
  return { complet, instantane: instantaneDuProgramme(complet.trip), verifies, logements, obtenuesA };
}

const SQL_A_FAIRE = `INSERT INTO public.checklist_items (id, organization_id, trip_id, stop_id, kind, label, moment, sponsored, done, done_at)
  VALUES ($3::uuid, $1, $2, $4, $5, $6, '{"type":"beforeDeparture"}'::jsonb, false, $7, CASE WHEN $7 THEN now() END)`;

/**
 * Étape `e` (rang 2) : l'étape « programme » de la chaîne inversée (0136 § 2.3), voir l'en-tête. Variante simulée : doubles et
 * fixtures du jeu de la destination, aucun appel réel, aucune position écrite.
 */
export function etapeProgrammeEcriture(entree: unknown, dependances?: DependancesGeneration): Promise<EtatProgramme> {
  return executerProgramme(
    entree,
    "e",
    async (contexte) => {
      const { voyage, brief } = await sql(contexte, (x) => briefOuArreter(contexte, x));
      const { forfait, registre, plafonds } = await forfaitDuProgramme(contexte.dep, cibleDuForfait(contexte));
      const options: OptionsEtape = {
        usage: registre,
        plafonds,
        executionId: contexte.generationRunId,
        forfait,
        horloge: contexte.dep.horloge,
        echeance: contexte.echeance,
      };
      const fabrique = await contexte.dep.composer(contexte.barriere, { destination: voyage.draft.destination });
      const capacite = fabrique.programme(options);
      const compteurs = compteursInitiaux();
      try {
        const { complet, instantane, verifies, logements, obtenuesA } = await redigerEtVerifier(
          contexte,
          { brief, capacite, forfait, registre, compteurs },
          (c) => c.rediger(entreeProgrammeDepuisBrief(brief), { arrivee: brief.arrivee, depart: brief.depart }),
        );
        const cases = casesDuProgramme(complet.trip.days, instantane);
        const aFaire = lignesDeLaVersion1(instantane, complet.trip.checklist, contexte.generationRunId);
        // `stays.place_id` : logements `known` et `suggestedLodging` seulement (la zone ne vit qu'en mémoire, 0136 § 3.2).
        const sejoursAncres = voyage.sejours.flatMap((sejour, rang) => {
          const placeId = logements[rang];
          return (sejour.logement.kind === "known" || sejour.logement.kind === "suggestedLodging") && placeId !== undefined ? [{ sejour, placeId }] : [];
        });
        // Positions des seuls lieux de la version publiée, dans la transaction de publication (0081 B9-TL-9), réelle seulement.
        const publies = new Set(instantane.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []))));
        const ecrirePositions = contexte.dep.ecriturePositions(fabrique)
          ? (executeur: ExecuteurPublication) => verifies.positions.ecrire(executeur, publies, obtenuesA, contexte.dep.portPositions)
          : undefined;
        await publier(
          contexte.dep,
          { organizationId: contexte.organizationId, generationRunId: contexte.generationRunId, tripId: contexte.tripId, requestId: contexte.requestId, echeance: contexte.echeance, rang: RANG_PROGRAMME.e },
          {
            instantane,
            // Version 1 : ses lignes « À faire » sont écrites ci-dessous (0147 § 7.1), jamais par `lignesApresVersion`.
            instantanePrecedent: null,
            cases,
            statut: statutDesCases(cases, CASES_APERCU),
            ...(ecrirePositions === undefined ? {} : { ecrirePositions }),
            ecrireDePlus: async (x) => {
              for (const { sejour, placeId } of sejoursAncres) {
                await x.query(SQL_PLACE_SEJOUR, [contexte.organizationId, contexte.tripId, sejour.ville, sejour.du, placeId]);
              }
              for (const ligne of aFaire) {
                await x.query(SQL_A_FAIRE, [contexte.organizationId, contexte.tripId, ligne.id, ligne.stopId, ligne.kind, ligne.label, ligne.done]);
              }
            },
          },
        );
      } catch (erreur) {
        journaliser(compteurs, { erreur });
        throw erreur;
      }
      journaliser(compteurs);
    },
    dependances,
  );
}
