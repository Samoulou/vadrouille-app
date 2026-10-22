import "server-only";

import type { DaySnapshot, TripSnapshot } from "@/contracts";
import type { EntreeMoteur } from "@/domain/entrees";
import { modesAdmis, replanifierJour } from "@/domain/generation";
import { entreeDuJour, joursTouches, planDuJour, reserveFiltree, type PlanDuJour, type PropositionDuRecalcul } from "@/domain/recalcul";
import type { CapaciteFinale, ExecuteurPublication, FabriqueGeneration, OptionsEtape } from "@/server/composition/generation";
import { DUREE_ETAPE_MS, JOURS_PLANIFIES_APERCU, RANG_LOT, TENTATIVES_PUBLICATION, type EtapeLot } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { DELAI_PORT_MS } from "@/server/usage/port";
import { ecrireVersion, verrouillerVersions } from "@/server/versions/ecrire";
import { executeurSql } from "@/server/with-org";

import type { EtatBarriere } from "./barriere";
import { ArretEtape, codeDeErreur, codeFerme, estArret } from "./codes";
import type { DependancesGeneration, DependancesResolues } from "./dependances";
import { resoudre } from "./dependances";
import { villesDuComplet, villesDuJour } from "./etapes-complet";
import { dateDansFuseau, eligibles, evenementsDe, lireCandidats, logementVille, SQL_OCCURRENCES, type CandidatLu } from "./etapes";
import { lireEtatLot, type EtatLot } from "./etat";
import { forfaitDuLot, type ForfaitDeLEtape } from "./forfait-etape";
import { cloreLotEnEchec, commencerEtapeLot, gardeOuverteAuRang } from "./garde";
import { lireInstantane, lireVersion, lireVoyage, nuitsDuVoyage, villesDeLApercu, type ExecuteurLecture, type VilleDeLApercu, type VoyageLu } from "./lecture";
import { avecRaisons, candidatsDuJour, classementDe, entreeMoteur, lieuxAilleurs, lieuxDuJour, passeDeRaisons, squeletteDesJours, type ContexteMoteur } from "./planification-jour";
import { reserveTextSearchE } from "./reserve-text-search";
import { lireSignauxActifs, lireTriClos, type SignalLuDuRecalcul, type TriClosLu } from "./signaux";

/**
 * Étapes de `batchRecompute`, **workflow 5** (spécification B10, B10b points 1 à 5 ; décision 0119 § 1.4 à § 1.6 ; verdict
 * 0120 S1 points 3 et 4, S3, S4, S5). Fonctions ordinaires, testables sans le SDK : `src/workflows/recalcul.ts` les enveloppe
 * dans des `"use step"`. Mêmes règles que les étapes du voyage complet (0081 B9-TL-3) : entrée validée par son contrat strict
 * (`EtatLotSchema`), garde `step_seq` sur une ligne **`kind = 'batch'`** relue dans l'organisation de l'état (début et échec du
 * lot, `garde.ts`), barrière évaluée à l'entrée de chaque étape, forfait réservé avant tout appel, toute écriture sous la
 * garde, arrêt sur un code fermé, aucune donnée de lieu dans l'état sérialisé.
 *
 * - `a` (rang 1, `maxRetries` 2, aucun appel) : jours touchés (`joursTouches`, version de base et signaux du tri clos de la
 *   ligne, jamais reçus d'une entrée) ; aucun : la ligne finit `ready`, sans version ni réservation ; sinon réserve Text Search
 *   de `e` (une requête par ville `area` ou `none` des jours touchés, 0113 § 3 bis), refus `cap_reached` avant la réservation,
 *   puis réservation du forfait `lot` (idempotente par l'identifiant de l'exécution).
 * - `e` (rang 2, `maxRetries` 0) : réserve filtrée par **tous** les signaux actifs du voyage (`reserveFiltree`), relecture des
 *   candidats repris et des jours touchés (`CapaciteFinale.planifier`, aucun Text Search d'ancrage ni recherche), plan de chaque
 *   jour touché (`planDuJour`, `entreeDuJour`, `replanifierJour` sur la **dernière** version), raisons des **seuls remplaçants**
 *   (une passe, une requête par ville), puis **une** transaction de publication sous la garde et le verrou des versions.
 *
 * Candidats d'un lot : ceux de l'exécution `preview` du tri clos et ceux de la dernière exécution `full` du voyage (un lieu, un
 * candidat : `eligibles`), la ville de chacun ramenée au rang de son séjour dans le voyage (`villesDuLot`). Aucun nom, aucune
 * fiche ni aucun signal n'entre dans l'état ; les fiches relues restent en mémoire et ne survivent pas à `e` (0120 S4 point 3).
 */

type Executeur = ExecuteurLecture & { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

type ContexteLot = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly baseVersion: number;
  readonly clotureId: string;
  readonly requestId: string;
  readonly echeance: number;
  readonly rang: number;
  readonly barriere: EtatBarriere;
};

const sql = <T>(contexte: Pick<ContexteLot, "dep" | "organizationId">, travail: (executeur: Executeur) => Promise<T>): Promise<T> =>
  contexte.dep.transaction(contexte.organizationId, (tx) => travail(executeurSql(tx)));

const maintenant = (contexte: ContexteLot): Date => new Date(contexte.dep.maintenant());

/** Rang de l'étape à commencer depuis le rang de la dernière étape terminée ; `null` si l'étape n'est pas celle attendue. */
function rangSuivant(etat: EtatLot, etape: EtapeLot): number | null {
  if (etape === "a") return RANG_LOT.a;
  return etat.rang === RANG_LOT.a ? RANG_LOT.e : null;
}

/**
 * Gabarit des étapes du lot : garde (ligne `batch`, rang de l'étape), barrière, corps, clôture en échec sur un code fermé. Une
 * ligne déjà finie (`ready`) rend l'entrée **inchangée** : le workflow s'arrête sans rien écrire. Ligne absente dans
 * l'organisation de l'état, d'un autre `kind`, ou refusée par la garde : `step_expired`, sans écriture (0120 S1 point 3).
 */
async function executerLot(entree: unknown, etape: EtapeLot, corps: (contexte: ContexteLot) => Promise<void>, dependances?: DependancesGeneration): Promise<EtatLot> {
  const etat = lireEtatLot(entree);
  if (etat.arret !== undefined) return etat;
  const rang = rangSuivant(etat, etape);
  if (rang === null) return { ...etat, arret: "invalid_input" };
  const dep = resoudre(dependances);
  const { organizationId, generationRunId } = etat;
  const ouverte = await dep.transaction(organizationId, (tx) => commencerEtapeLot(executeurSql(tx), organizationId, generationRunId, etape, rang, new Date(dep.maintenant())));
  if (ouverte === "finie") return etat;
  if (ouverte === null) return { ...etat, arret: "step_expired" };
  const commun = { dep, organizationId, generationRunId, ...ouverte, echeance: dep.maintenant() + DUREE_ETAPE_MS, rang };
  try {
    const barriere = await dep.barriere();
    if (barriere === "production") throw new ArretEtape("production_refused");
    await corps({ ...commun, barriere });
    return { generationRunId, organizationId, rang };
  } catch (erreur) {
    if (etape === "a" && !estArret(erreur)) throw erreur;
    const code = codeDeErreur(erreur);
    try {
      await sql(commun, (x) => cloreLotEnEchec(x, organizationId, generationRunId, rang, code, new Date(dep.maintenant())));
    } catch {
      // Clôture impossible : l'exécution expire (`step_expired`, 20 minutes), par une action du tri ou une lecture d'état.
    }
    return { generationRunId, organizationId, rang, arret: code };
  }
}

/**
 * Clôture sur erreur inattendue, **gardée par le rang** (même règle que `SQL_CLOTURE_COMPLET`) : la ligne `batch` n'est close
 * que si elle est en `preparing` au rang de la dernière étape terminée (`$5`) ou à celui de l'étape qui a levé (`$5 + 1`).
 */
export const SQL_CLOTURE_LOT = `UPDATE public.generation_runs SET phase = 'failed', stop_reason = $3, updated_at = $4::timestamptz, finished_at = $4::timestamptz
  WHERE organization_id = $1 AND id = $2 AND phase = 'preparing' AND kind = 'batch' AND step_seq IN ($5::int, $5::int + 1)
  RETURNING id`;

/** Clôture d'une exécution `batch` dont une étape a levé une erreur inattendue (workflow, après les reprises de la file). */
export async function etapeClotureLot(entree: unknown, code: unknown, dependances?: DependancesGeneration): Promise<EtatLot> {
  const etat = lireEtatLot(entree);
  const dep = resoudre(dependances);
  const ferme = codeFerme(code);
  try {
    await dep.transaction(etat.organizationId, (tx) =>
      executeurSql(tx).query(SQL_CLOTURE_LOT, [etat.organizationId, etat.generationRunId, ferme, new Date(dep.maintenant()).toISOString(), etat.rang]),
    );
  } catch {
    // L'exécution expire.
  }
  return { ...etat, arret: etat.arret ?? ferme };
}

// --- Lecture du lot --------------------------------------------------------------------------------------------------------

/** Exécution `preview` dont le tri clos est celui de la ligne (la clôture la désigne). */
const SQL_EXECUTION_DU_TRI = "SELECT generation_run_id FROM public.deck_closures WHERE organization_id = $1 AND trip_id = $2 AND id = $3";
/** Dernière exécution `full` du voyage (candidats des jours qui suivent l'aperçu), ou aucune. */
const SQL_DERNIER_COMPLET = `SELECT id FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full'
  ORDER BY started_at DESC, id DESC LIMIT 1`;

/** Villes d'un lot : **tous** les séjours du voyage, dans l'ordre ; le rang d'une ville est l'indice de son séjour. */
export function villesDuLot(voyage: VoyageLu): VilleDeLApercu[] {
  const { start, end } = voyage.draft;
  return voyage.sejours.map((sejour, rang) => ({ rang, nom: sejour.ville, arrivee: sejour.du > start ? sejour.du : start, depart: sejour.au < end ? sejour.au : end, sejour }));
}

/** Candidats d'une exécution, la ville ramenée au rang de son séjour dans le voyage (`villes` : villes de cette exécution). */
function versLeVoyage(candidats: readonly CandidatLu[], villes: readonly VilleDeLApercu[], voyage: VoyageLu): CandidatLu[] {
  return candidats.flatMap((c) => {
    const sejour = villes.find((v) => v.rang === c.ville)?.sejour;
    const rang = sejour === undefined ? -1 : voyage.sejours.indexOf(sejour);
    return rang < 0 ? [] : [{ ...c, ville: rang }];
  });
}

export type LotLu = {
  readonly voyage: VoyageLu;
  readonly base: TripSnapshot;
  readonly derniere: { readonly version: number; readonly instantane: TripSnapshot };
  readonly tri: TriClosLu;
  readonly signaux: readonly SignalLuDuRecalcul[];
  readonly jours: readonly number[];
  readonly villes: readonly VilleDeLApercu[];
};

/** Voyage, version de base, dernière version, tri clos de la ligne et signaux actifs, lus dans **une** transaction. */
async function lireLot(x: Executeur, contexte: ContexteLot): Promise<LotLu> {
  const voyage = await lireVoyage(x, contexte.organizationId, contexte.tripId);
  if (voyage === null) throw new ArretEtape("invalid_input");
  const base = await lireVersion(x, contexte.organizationId, contexte.tripId, contexte.baseVersion);
  const derniere = await lireInstantane(x, contexte.organizationId, contexte.tripId);
  const tri = await lireTriClos(x, contexte.organizationId, contexte.tripId, contexte.clotureId);
  const signaux = await lireSignauxActifs(x, contexte.organizationId, contexte.tripId);
  return { voyage, base: base.instantane, derniere, tri, signaux, jours: joursTouches(base.instantane, tri), villes: villesDuLot(voyage) };
}

/** Candidats du lot : ceux de l'aperçu du tri clos, puis ceux de la dernière exécution `full` (villes ramenées au voyage). */
async function lireCandidatsDuLot(x: Executeur, contexte: ContexteLot, voyage: VoyageLu): Promise<CandidatLu[]> {
  const { organizationId, tripId } = contexte;
  const apercu = (await x.query(SQL_EXECUTION_DU_TRI, [organizationId, tripId, contexte.clotureId])).rows[0]?.generation_run_id;
  if (typeof apercu !== "string") throw new ArretEtape("invalid_input");
  const complet = (await x.query(SQL_DERNIER_COMPLET, [organizationId, tripId])).rows[0]?.id;
  const depuisApercu = versLeVoyage(await lireCandidats(x, { organizationId, generationRunId: apercu }), villesDeLApercu(voyage, JOURS_PLANIFIES_APERCU), voyage);
  const depuisComplet = typeof complet === "string" ? versLeVoyage(await lireCandidats(x, { organizationId, generationRunId: complet }), villesDuComplet(voyage), voyage) : [];
  return [...depuisApercu, ...depuisComplet];
}

/** Réserve Text Search de `e` : une requête par ville `area` ou `none` des jours touchés (0113 § 3 bis, même fonction pure). */
export function reserveDuLot(lot: Pick<LotLu, "voyage" | "villes" | "jours">): number {
  const { nuitsVille } = nuitsDuVoyage(lot.voyage, lot.villes);
  return reserveTextSearchE({ jours: lot.jours, nuitsVille, villes: lot.villes.map((ville) => ({ rang: ville.rang, logement: ville.sejour.logement })) });
}

const forfait = (contexte: ContexteLot, lot: Pick<LotLu, "voyage" | "villes" | "jours">): Promise<ForfaitDeLEtape> =>
  forfaitDuLot(contexte.dep, { organizationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: contexte.generationRunId, barriere: contexte.barriere }, reserveDuLot(lot));

const SQL_FIN_LOT = `UPDATE public.generation_runs SET phase = 'ready', stop_reason = NULL, last_version = COALESCE($4, last_version), updated_at = $5::timestamptz, finished_at = $5::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' AND kind = 'batch' RETURNING id`;

/** Jour inchangé depuis la version de base (instantané du jour identique) : sinon la modification de la personne l'emporte. */
const inchange = (base: TripSnapshot, derniere: TripSnapshot, index: number): boolean => {
  const avant = base.days.find((jour) => jour.index === index);
  const apres = derniere.days.find((jour) => jour.index === index);
  return avant !== undefined && apres !== undefined && JSON.stringify(avant) === JSON.stringify(apres);
};

// --- Étape a ---------------------------------------------------------------------------------------------------------------

/**
 * Étape `a` (rang 1) : jours touchés depuis la version de base et le tri clos de la ligne ; aucun : la ligne finit `ready`, sans
 * version ni réservation ; sinon réserve Text Search de `e` (refus `cap_reached` avant la réservation) et réservation du forfait.
 */
export function etapeLotDebut(entree: unknown, dependances?: DependancesGeneration): Promise<EtatLot> {
  return executerLot(
    entree,
    "a",
    async (contexte) => {
      const lot = await sql(contexte, (x) => lireLot(x, contexte));
      if (lot.jours.length === 0) {
        await sql(contexte, async (x) => {
          const fin = await x.query(SQL_FIN_LOT, [contexte.organizationId, contexte.generationRunId, contexte.rang, null, maintenant(contexte).toISOString()]);
          if (fin.rows.length === 0) throw new ArretEtape("step_expired");
        });
        return;
      }
      await forfait(contexte, lot);
    },
    dependances,
  );
}

// --- Étape e ---------------------------------------------------------------------------------------------------------------

/** Ce que l'étape `e` a préparé pour un jour touché : son plan, son entrée du moteur, le jour planifié et ses remplaçants. */
type JourDuLot = {
  readonly index: number;
  readonly plan: PlanDuJour;
  /** Entrée du moteur du jour (version à recaler sous le verrou), sans `version` définitive. */
  readonly entree: (version: number) => EntreeMoteur;
  jour: DaySnapshot;
};

/** Planifie un jour par `replanifierJour` ; refusé : repli sur les seules étapes conservées (temps libre, `openMeal`). */
function planifierJour(entree: EntreeMoteur, base: TripSnapshot, index: number): DaySnapshot {
  const plein = replanifierJour(entree, base, index);
  if (plein.ok) return plein.jour;
  const replie = replanifierJour({ ...entree, candidats: [], evenements: [] }, base, index);
  if (replie.ok) return replie.jour;
  throw new ArretEtape("invalid_input");
}

/** Étapes nouvelles d'un jour planifié : toutes celles qui ne sont pas conservées du jour de base (les remplaçants). */
const nouvelles = (jour: DaySnapshot, plan: PlanDuJour): Set<string> =>
  new Set(jour.items.flatMap((item) => (item.type === "stop" && !plan.conservees.has(item.stop.id) ? [item.stop.id] : [])));

/**
 * Étape `e` (rang 2) : relecture et planification des seuls jours touchés, raisons des seuls remplaçants, publication d'**une**
 * version. Aucun signal, aucune catégorie arrêtée, aucune raison de refus ni aucun texte de question n'entre dans une requête de
 * modèle : `rediger` reçoit les champs maison des lignes `candidates` des remplaçants (module commun, 0120 S5 point 2).
 */
export function etapeLotPlanification(entree: unknown, dependances?: DependancesGeneration): Promise<EtatLot> {
  return executerLot(
    entree,
    "e",
    async (contexte) => {
      const lus = await sql(contexte, async (x) => {
        const lot = await lireLot(x, contexte);
        return { lot, candidats: await lireCandidatsDuLot(x, contexte, lot.voyage), occurrences: (await x.query(SQL_OCCURRENCES, [contexte.organizationId, contexte.tripId])).rows };
      });
      const { lot } = lus;
      const { voyage, derniere } = lot;
      // Jours touchés encore identiques à la version de base : un jour modifié par la personne n'est ni relu ni replanifié.
      const aPlanifier = lot.jours.filter((index) => inchange(lot.base, derniere.instantane, index));
      if (aPlanifier.length === 0) {
        await terminer(contexte, null);
        return;
      }
      const forfaitDuLot = await forfait(contexte, lot);
      const fabrique: FabriqueGeneration = await contexte.dep.composer(contexte.barriere);
      if (contexte.dep.reglesPour(contexte.barriere) === null) throw new ArretEtape("usage_unavailable");
      const options: OptionsEtape = {
        usage: forfaitDuLot.registre,
        plafonds: forfaitDuLot.plafonds,
        executionId: contexte.generationRunId,
        forfait: forfaitDuLot.forfait,
        horloge: contexte.dep.horloge,
        echeance: contexte.echeance,
      };
      const capacite: CapaciteFinale = fabrique.finale(options);

      const obtenuesA = contexte.dep.maintenant();
      const dateReference = dateDansFuseau(obtenuesA, voyage.timeZone);
      const { nuits, nuitsVille } = nuitsDuVoyage(voyage, lot.villes);
      const touches = new Set(aPlanifier);
      const ailleurs = lieuxAilleurs(derniere.instantane, touches);
      const villes = lot.villes.filter((ville) => aPlanifier.some((jour) => villesDuJour(voyage, [ville], jour).length > 0));
      const rangs = new Set(villes.map((v) => v.rang));
      const tous = eligibles(lus.candidats);
      const dansLesJours = tous.filter(({ moteur }) => rangs.has(moteur.ville) && (moteur.placeId === undefined || !ailleurs.has(moteur.placeId)));
      const admis = new Set(reserveFiltree(dansLesJours.map(({ moteur }) => moteur), lot.signaux).map((c) => c.id));
      const retenables = dansLesJours.filter(({ moteur }) => admis.has(moteur.id));
      // Repas choisis (B10-PO-10 point 3) : le candidat de l'option, pris dans sa proposition (jamais dans la réserve).
      const parId = new Map(tous.map((e) => [e.lu.id, e] as const));
      const parLieu = new Map(tous.flatMap((e) => (e.moteur.placeId === undefined ? [] : [[e.moteur.placeId, e] as const])));
      const choisis = new Map<string, (typeof tous)[number]>();
      const choisies = new Set(lot.tri.signaux.flatMap((s) => (s.signal === "choose" && s.status !== "cancelled" && s.proposalId !== undefined ? [s.proposalId] : [])));
      for (const proposition of lot.tri.propositions) {
        if (proposition.kind !== "meal" || !choisies.has(proposition.id)) continue;
        const candidat = lot.tri.candidats.get(proposition.id);
        const trouve = (candidat === undefined ? undefined : parId.get(candidat)) ?? (proposition.placeId === undefined ? undefined : parLieu.get(proposition.placeId));
        if (trouve !== undefined) choisis.set(proposition.id, trouve);
      }
      const aRelire = [...retenables];
      for (const e of choisis.values()) if (!aRelire.some((r) => r.lu.id === e.lu.id)) aRelire.push(e);

      const planification = await capacite.planifier({
        jours: squeletteDesJours(voyage, nuits.length, touches),
        nuitsVille,
        villes: lot.villes.map((ville) => ({ rang: ville.rang, nom: ville.nom, logement: logementVille(ville) })),
        candidats: aRelire.map(({ moteur }) => moteur),
        modes: [...modesAdmis(voyage.brief.mobility)],
        classement: classementDe(dateReference),
        configuration: CONFIGURATION_MOTEUR,
      });
      if (!planification.ok) throw new ArretEtape(planification.code);

      const relus = new Map(planification.valeur.candidats.map((c) => [c.id, c] as const));
      const propositions: PropositionDuRecalcul[] = lot.tri.propositions.map((p) => {
        const e = choisis.get(p.id);
        return e === undefined ? p : { ...p, candidat: relus.get(e.moteur.id) ?? e.moteur };
      });
      const tri = { ...lot.tri, propositions };
      const reserve = planification.valeur.candidats.filter((c) => admis.has(c.id));
      const contexteMoteur: Omit<ContexteMoteur, "version"> = {
        voyage,
        nuits,
        evenements: evenementsDe(lus.candidats, lus.occurrences),
        relectures: planification.valeur.relectures,
        dateReference,
      };

      // Plan de chaque jour touché, jours croissants, sur la dernière version mise à jour au fil des jours (un lieu, une fois).
      let courant = derniere.instantane;
      const jours: JourDuLot[] = [];
      for (const index of aPlanifier) {
        const jourBase = lot.base.days.find((jour) => jour.index === index);
        if (jourBase === undefined) throw new ArretEtape("invalid_input");
        const plan = planDuJour(jourBase, tri);
        const entreeDe = (version: number) => entreeDuJour(entreeMoteur({ ...contexteMoteur, version }, reserve), plan, lot.signaux);
        const jour = planifierJour(entreeDe(derniere.version + 1), courant, index);
        courant = { ...courant, days: courant.days.map((d) => (d.index === index ? jour : d)) };
        jours.push({ index, plan, entree: entreeDe, jour });
      }

      // Raisons des seuls remplaçants (B10-PO-11) : une passe, une requête `raisons` par ville qui en a au moins un.
      const parPlaceId = new Map(aRelire.flatMap(({ lu, moteur }) => (moteur.placeId === undefined ? [] : [[moteur.placeId, lu] as const])));
      const raisons = new Map<string, string>();
      const remplacants = jours.flatMap(({ jour, plan }) => candidatsDuJour(jour, parPlaceId, nouvelles(jour, plan)));
      await passeDeRaisons(capacite, voyage.brief, villes, remplacants, raisons, new Set());
      for (const j of jours) j.jour = avecRaisons(j.jour, parPlaceId, raisons, nouvelles(j.jour, j.plan));

      const ecrirePositions = contexte.dep.ecriturePositions(fabrique)
        ? (executeur: ExecuteurPublication, publies: ReadonlySet<string>) => planification.valeur.positions.ecrire(executeur, publies, obtenuesA, contexte.dep.portPositions)
        : undefined;
      await publierLot(contexte, { base: lot.base, jours, parPlaceId, raisons, ...(ecrirePositions === undefined ? {} : { ecrirePositions }) });
    },
    dependances,
  );
}

/** Fin de l'exécution sans version (aucun jour à publier) : `ready`, `last_version` inchangée. */
async function terminer(contexte: ContexteLot, version: number | null): Promise<void> {
  await sql(contexte, async (x) => {
    const fin = await x.query(SQL_FIN_LOT, [contexte.organizationId, contexte.generationRunId, contexte.rang, version, maintenant(contexte).toISOString()]);
    if (fin.rows.length === 0) throw new ArretEtape("step_expired");
  });
}

type DonneesLot = {
  readonly base: TripSnapshot;
  readonly jours: readonly JourDuLot[];
  readonly parPlaceId: ReadonlyMap<string, CandidatLu>;
  readonly raisons: ReadonlyMap<string, string>;
  readonly ecrirePositions?: (executeur: ExecuteurPublication, publies: ReadonlySet<string>) => Promise<{ readonly ok: boolean; readonly code?: string; readonly retryable?: boolean }>;
};

/**
 * Publication du lot, **une transaction** (rejeu borné sans nouvel appel externe, 0081 B9-TL-3 point 4) : garde de l'étape `e`,
 * puis **verrou des versions** (0119 § 1.6 point 1, sérialise avec le workflow 4), puis la dernière version relue sous ce verrou :
 * - jour touché modifié depuis la version de base : **non remplacé** (la modification de la personne l'emporte) ;
 * - jour à publier dont un lieu figure dans un autre jour de la dernière version : **replanifié sous le verrou**, par
 *   `replanifierJour`, pur (candidats et relectures en mémoire, aucun appel externe) ; une étape devenue nouvelle reste sans raison ;
 * - jours non touchés : copiés de la dernière version (jamais de la version de base).
 * Aucun jour à publier : aucune version, fin `ready`. Sinon une version par le module unique (`request_id` de la ligne : un
 * rejeu la reconnaît), les positions des seules étapes publiées, `last_version` et la phase `ready`, dans la même transaction.
 */
async function publierLot(contexte: ContexteLot, donnees: DonneesLot): Promise<void> {
  const { organizationId, generationRunId, tripId } = contexte;
  for (let tentative = 1; tentative <= TENTATIVES_PUBLICATION; tentative += 1) {
    try {
      await contexte.dep.transaction(organizationId, async (tx) => {
        const x = executeurSql(tx);
        const instant = maintenant(contexte);
        if (!(await gardeOuverteAuRang(x, organizationId, generationRunId, contexte.rang, instant))) throw new ArretEtape("step_expired");
        await verrouillerVersions(x, tripId);
        const { version, instantane } = await lireInstantane(x, organizationId, tripId);
        let travail = instantane;
        const publies: DaySnapshot[] = [];
        for (const j of donnees.jours) {
          if (!inchange(donnees.base, instantane, j.index)) continue;
          let publie = j.jour;
          const ailleurs = lieuxAilleurs(travail, new Set([j.index]));
          if (lieuxDuJour(publie).some((lieu) => ailleurs.has(lieu))) {
            const replanifie = planifierJour(j.entree(version + 1), travail, j.index);
            // Seuls les remplaçants déjà rédigés gardent leur raison ; un lieu devenu nouveau ici reste sans raison (B10-PO-11).
            publie = avecRaisons(replanifie, donnees.parPlaceId, donnees.raisons, nouvelles(replanifie, j.plan));
          }
          travail = { ...travail, days: travail.days.map((d) => (d.index === j.index ? publie : d)) };
          publies.push(publie);
        }
        let derniere: number | null = null;
        if (publies.length > 0) {
          const ecrite = await ecrireVersion(x, { organizationId, tripId, requestId: contexte.requestId, auteur: "workflow", instantane: { days: travail.days } });
          derniere = ecrite.version;
          if (ecrite.creee && donnees.ecrirePositions !== undefined) {
            const positions = await donnees.ecrirePositions(x, new Set(publies.flatMap(lieuxDuJour)));
            if (!positions.ok && positions.code === "base") {
              if (positions.retryable === true) throw new Error("positions");
              throw new ArretEtape("upstream_error");
            }
          }
        }
        const fin = await x.query(SQL_FIN_LOT, [organizationId, generationRunId, contexte.rang, derniere, instant.toISOString()]);
        if (fin.rows.length === 0) throw new ArretEtape("step_expired");
      });
      return;
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      if (contexte.dep.maintenant() + DELAI_PORT_MS >= contexte.echeance) break;
    }
  }
  throw new ArretEtape("upstream_unavailable");
}
