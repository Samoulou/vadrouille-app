import "server-only";

import type { Category, DaySnapshot, StopFacts } from "@/contracts";
import type { CandidatEvenement, CandidatMoteur, NotesMoteur, TypeCreneau } from "@/domain/entrees";
import { generer, modesAdmis } from "@/domain/generation";
import { squeletteAvecEngagements } from "@/domain/squelette";
import { joursEntre } from "@/domain/temps";
import {
  AGE_SOURCE_MAX_JOURS_APERCU,
  classeDeSource,
  type CapaciteAncrage,
  type CapaciteFinale,
  type FabriqueGeneration,
  type LieuARedige,
  type LogementVille,
  type OptionsEtape,
} from "@/server/composition/generation";
import { CONFIGURATION_CLASSEMENT } from "@/server/config/classement";
import { DUREE_ETAPE_MS, JOURS_PLANIFIES_APERCU, RANG_ETAPE, type EtapeApercu } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { executeurSql } from "@/server/with-org";

import { ArretEtape, codeDeErreur, codeFerme } from "./codes";
import { composerCases, type LieuDeCase } from "./cases";
import type { DependancesGeneration, DependancesResolues } from "./dependances";
import { resoudre } from "./dependances";
import { lireEtat, type EtatEtape } from "./etat";
import { forfaitDeLEtape, type ForfaitDeLEtape } from "./forfait-etape";
import { cloreEnEchec, commencerEtape, exigerGarde } from "./garde";
import { lireVoyage, nuitsDuVoyage, villesDeLApercu, type ExecuteurLecture, type VilleDeLApercu, type VoyageLu } from "./lecture";
import { publier } from "./publication";

/**
 * Étapes de `generatePreview` (spécification B9, B9c ; décisions 0081 B9-TL-3, 0087 § 2 et 0100). **Fonctions ordinaires,
 * testables sans le SDK de workflows** : `src/workflows/apercu.ts` les enveloppe dans des `"use step"` et n'y ajoute rien.
 * Étapes réutilisables par les workflows 2 et 3 (`etapeAncrage` : ancrage ; `etapeNotation` : notation) ; B9d les enchaîne
 * pour le voyage complet.
 *
 * Règles de chaque étape (0081 B9-TL-3 point 1, comme `p0Run`) :
 * 1. entrée validée par `EtatEtapeSchema` (identifiants et rang, rien d'autre) ; un état déjà arrêté passe tel quel ;
 * 2. **garde d'idempotence** (`commencerEtape`) avant toute composition et tout appel : refusée, l'étape rend l'arrêt
 *    `step_expired` sans rien écrire (jamais une étape suivante sur une étape interrompue) ;
 * 3. **barrière** (`dependances.composer`, B9-TL-8) puis forfait : réservé (idempotent) avant tout appel, refusé → arrêt ;
 * 4. **fabriques appelées dans l'étape** : aucun client, registre ni composition en cache de module ;
 * 5. un registre en mémoire par étape, borné par sa part du forfait ; échéance vérifiée avant chaque appel externe ;
 * 6. toute écriture est conditionnée à `step_seq = n AND phase = 'preparing'` ; un arrêt (plafond, quota, erreur de
 *    fournisseur, échéance) clôt l'exécution en `failed` avec un **code fermé** et rien de la version n'est écrit ;
 * 7. **sortie** : `{ generationRunId, organizationId, rang }` plus, le cas échéant, le code fermé de l'arrêt. Aucune donnée
 *    de lieu ne sort d'une étape : une erreur de fournisseur n'y laisse que son code.
 */

type Executeur = ExecuteurLecture & { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

type Contexte = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly requestId: string | null;
  readonly echeance: number;
  readonly etape: EtapeApercu;
};

const sql = <T>(contexte: Contexte, travail: (executeur: Executeur) => Promise<T>): Promise<T> =>
  contexte.dep.transaction(contexte.organizationId, (tx) => travail(executeurSql(tx)));

const maintenant = (contexte: Contexte): Date => new Date(contexte.dep.maintenant());

/** Gabarit commun : garde, corps, clôture en échec sur un code fermé. */
async function executer(entree: unknown, etape: EtapeApercu, corps: (contexte: Contexte) => Promise<void>, dependances?: DependancesGeneration): Promise<EtatEtape> {
  const etat = lireEtat(entree);
  if (etat.arret !== undefined) return etat;
  const dep = resoudre(dependances);
  const { organizationId, generationRunId } = etat;
  const ouverte = await dep.transaction(organizationId, (tx) => commencerEtape(executeurSql(tx), organizationId, generationRunId, etape, new Date(dep.maintenant())));
  if (ouverte === null) return { ...etat, arret: "step_expired" };
  const contexte: Contexte = { dep, organizationId, generationRunId, tripId: ouverte.tripId, requestId: ouverte.requestId, echeance: dep.maintenant() + DUREE_ETAPE_MS, etape };
  try {
    await corps(contexte);
    return { generationRunId, organizationId, rang: RANG_ETAPE[etape] };
  } catch (erreur) {
    // Un code fermé et rien d'autre : ni le message ni la pile de l'erreur (qui peut porter un nom de lieu) ne sortent.
    const code = erreur instanceof ArretEtape ? erreur.code : codeDeErreur(erreur);
    try {
      await sql(contexte, (x) => cloreEnEchec(x, organizationId, generationRunId, etape, code, maintenant(contexte)));
    } catch {
      // Clôture impossible : l'exécution expire (`step_expired`, 0081 B9-TL-3 point 5).
    }
    return { generationRunId, organizationId, rang: RANG_ETAPE[etape], arret: code };
  }
}

/** Clôture d'une exécution dont une étape a levé une erreur inattendue (workflow, après les reprises de la file). */
export async function etapeCloture(entree: unknown, code: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  const etat = lireEtat(entree);
  const dep = resoudre(dependances);
  const ferme = codeFerme(code);
  try {
    await dep.transaction(etat.organizationId, (tx) =>
      executeurSql(tx).query(
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

// --- Outils communs ------------------------------------------------------------------------------------------------------------

function optionsEtape(contexte: Contexte, forfait: ForfaitDeLEtape): OptionsEtape {
  const regles = contexte.dep.regles;
  if (regles === null) throw new ArretEtape("usage_unavailable");
  return {
    usage: forfait.registre,
    plafonds: forfait.plafonds,
    executionId: contexte.generationRunId,
    forfait: forfait.forfait,
    skus: regles.plafonds.skus,
    horloge: contexte.dep.horloge,
    echeance: contexte.echeance,
  };
}

async function ouvrirCapacites(contexte: Contexte): Promise<{ readonly fabrique: FabriqueGeneration; readonly forfait: ForfaitDeLEtape; readonly options: OptionsEtape }> {
  const forfait = await forfaitDeLEtape(contexte.dep, { organizationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: contexte.generationRunId }, contexte.etape);
  const fabrique = await contexte.dep.composer();
  return { fabrique, forfait, options: optionsEtape(contexte, forfait) };
}

/** Jours planifiés de l'aperçu : J1 et J2, limités à la durée du voyage. */
function joursPlanifies(voyage: VoyageLu): number[] {
  const nombre = joursEntre(voyage.draft.start, voyage.draft.end) + 1;
  return JOURS_PLANIFIES_APERCU.filter((jour) => jour <= nombre);
}

async function lireVoyageOuArreter(contexte: Contexte, x: Executeur): Promise<{ voyage: VoyageLu; jours: number[]; villes: VilleDeLApercu[] }> {
  const voyage = await lireVoyage(x, contexte.organizationId, contexte.tripId);
  if (voyage === null) throw new ArretEtape("invalid_input");
  const jours = joursPlanifies(voyage);
  const villes = villesDeLApercu(voyage, jours);
  if (jours.length === 0 || villes.length === 0) throw new ArretEtape("invalid_input");
  return { voyage, jours, villes };
}

/** Logement d'une ville prêt pour la zone : `placeId` vérifié (étape `l`) pour `known` et `suggestedLodging`, sinon le quartier. */
function logementVille(ville: VilleDeLApercu): LogementVille {
  const { logement, placeId } = ville.sejour;
  switch (logement.kind) {
    case "known":
      return placeId === null ? { kind: "area", label: logement.label } : { kind: "known", placeId };
    case "suggestedLodging": {
      const id = placeId ?? logement.placeId ?? null;
      return id === null ? { kind: "area", label: logement.name } : { kind: "suggestedLodging", placeId: id };
    }
    default:
      return logement;
  }
}

const normaliser = (nom: string): string =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type CandidatLu = {
  readonly id: string;
  readonly nom: string;
  readonly resume: string;
  readonly categorie: Category;
  readonly kind: "place" | "event";
  readonly stopKind: "activity" | "meal" | "event" | null;
  readonly aReserver: boolean;
  readonly faits: StopFacts;
  readonly sources: readonly { readonly label: string; readonly url: string; readonly checkedOn: string }[];
  readonly placeId: string | null;
  readonly fit: boolean | null;
  readonly risque: number | null;
  readonly incontournable: boolean | null;
  readonly slotFit: readonly TypeCreneau[] | null;
  readonly ville: number;
};

/**
 * Candidats de l'exécution. La ville d'un candidat est le rang (0, 1…) de son `research_run` parmi ceux de l'exécution, par
 * `started_at` puis `id` : `candidates` n'a ni colonne de ville ni de `generation_run_id` (question au rôle data, dans la
 * PR). Une recherche par ville, écrite dans l'ordre du séjour, avec un `started_at` strictement croissant.
 */
const SQL_CANDIDATS = `WITH villes AS (
    SELECT id, (row_number() OVER (ORDER BY started_at, id) - 1)::int AS ville
    FROM public.research_runs WHERE organization_id = $1 AND generation_run_id = $2)
  SELECT c.id, c.name, c.summary, c.category, c.kind, c.stop_kind, c.to_reserve, c.facts, c.sources, c.place_id, c.fit,
    c.not_for_me_risk, c.must_see, c.slot_fit, v.ville
  FROM public.candidates c JOIN villes v ON v.id = c.research_run_id
  WHERE c.organization_id = $1
  ORDER BY v.ville, c.created_at, c.id`;

const json = (valeur: unknown): unknown => (typeof valeur === "string" ? JSON.parse(valeur) : valeur);

async function lireCandidats(x: Executeur, contexte: Contexte): Promise<CandidatLu[]> {
  const { rows } = await x.query(SQL_CANDIDATS, [contexte.organizationId, contexte.generationRunId]);
  return rows.map((ligne): CandidatLu => ({
    id: String(ligne.id),
    nom: String(ligne.name),
    resume: typeof ligne.summary === "string" ? ligne.summary : "",
    categorie: String(ligne.category) as Category,
    kind: ligne.kind === "event" ? "event" : "place",
    stopKind: ligne.stop_kind === "activity" || ligne.stop_kind === "meal" || ligne.stop_kind === "event" ? ligne.stop_kind : null,
    aReserver: ligne.to_reserve === true,
    faits: (json(ligne.facts) ?? {}) as StopFacts,
    sources: (json(ligne.sources) ?? []) as CandidatLu["sources"],
    placeId: typeof ligne.place_id === "string" ? ligne.place_id : null,
    fit: typeof ligne.fit === "boolean" ? ligne.fit : null,
    risque: ligne.not_for_me_risk === null || ligne.not_for_me_risk === undefined ? null : Number(ligne.not_for_me_risk),
    incontournable: typeof ligne.must_see === "boolean" ? ligne.must_see : null,
    slotFit: Array.isArray(ligne.slot_fit) ? (ligne.slot_fit as TypeCreneau[]) : null,
    ville: Number(ligne.ville),
  }));
}

// --- Étape a : brief ---------------------------------------------------------------------------------------------------------

/**
 * Étape `a` (rang 1) : lit le brouillon et le brief, vérifie que l'aperçu a des jours et des villes, et **réserve le forfait**
 * (profil `apercu`) avant tout appel : refusé, l'exécution s'arrête sur le code de refus. Déterministe, sans appel externe :
 * seule étape rejouable par la file (`maxRetries` 2).
 */
export function etapeBrief(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "a",
    async (contexte) => {
      await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      await forfaitDeLEtape(contexte.dep, { organizationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: contexte.generationRunId }, "a");
    },
    dependances,
  );
}

// --- Étape l : logement ------------------------------------------------------------------------------------------------------

const SQL_PLACE_SEJOUR = `UPDATE public.stays SET place_id = $5
  WHERE organization_id = $1 AND trip_id = $2 AND city = $3 AND from_date = $4::date`;

/**
 * Étape `l` (rang 2, décision 0087 § 2) : contrôle de validité du logement de chaque ville de l'aperçu, **avant toute dépense
 * d'IA**. `known` et `suggestedLodging` : une fiche `details` (Text Search pour `known`), `placeId` écrit sur le séjour ;
 * non résolu ou fermé définitivement : `lodging_unresolved`. `suggestedArea`, `area`, `none` : aucun appel.
 */
export function etapeLogement(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "l",
    async (contexte) => {
      const { villes } = await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      const aVerifier = villes.filter((ville) => ville.sejour.logement.kind === "known" || ville.sejour.logement.kind === "suggestedLodging");
      if (aVerifier.length === 0) return;
      const { fabrique, options } = await ouvrirCapacites(contexte);
      const capacite = fabrique.logement(options);
      const verifies: { ville: VilleDeLApercu; placeId: string }[] = [];
      for (const ville of aVerifier) {
        const issue = await capacite.verifier(ville.sejour.logement, ville.nom);
        if (!issue.ok) throw new ArretEtape(issue.code);
        if (issue.valeur !== null) verifies.push({ ville, placeId: issue.valeur.placeId });
      }
      await sql(contexte, async (x) => {
        await exigerGarde(x, contexte.organizationId, contexte.generationRunId, "l", maintenant(contexte));
        for (const { ville, placeId } of verifies) {
          await x.query(SQL_PLACE_SEJOUR, [contexte.organizationId, contexte.tripId, ville.sejour.ville, ville.sejour.du, placeId]);
        }
      });
    },
    dependances,
  );
}

// --- Étape b : recherche -----------------------------------------------------------------------------------------------------

const SQL_RECHERCHE = `INSERT INTO public.research_runs (organization_id, trip_id, generation_run_id, queries, pages_read, duration_ms, cost_estimate_micros, errors, started_at, finished_at)
  VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8::text[], $9::timestamptz, $10::timestamptz) RETURNING id`;
const SQL_CANDIDAT = `INSERT INTO public.candidates (organization_id, trip_id, research_run_id, kind, name, summary, category, facts, sources, confidence, stop_kind, to_reserve)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12) RETURNING id`;
const SQL_OCCURRENCE = `INSERT INTO public.event_occurrences (organization_id, trip_id, candidate_id, starts_at, ends_at, timezone, category, price_note, source_url, source_checked_at, status)
  VALUES ($1, $2, $3, $4::timestamptz, NULL, $5, $6, NULL, $7, $8::timestamptz, $9)`;
const SQL_NOMS = `SELECT c.name FROM public.candidates c
  JOIN public.research_runs r ON r.organization_id = c.organization_id AND r.id = c.research_run_id
  WHERE c.organization_id = $1 AND r.generation_run_id = $2`;

/**
 * Étape `b` (rang 3) : une recherche par ville de l'aperçu (profil `apercu`), dans l'ordre du séjour, une transaction gardée
 * par ville : `research_runs` (bilan, sans compteur de candidats), `candidates` par `versLignes` (B7-PO-10) et
 * `event_occurrences` pour un événement dont l'heure est lue. Les noms déjà écrits pour l'exécution sont passés au modèle
 * (`dejaTrouves`) et jamais réécrits (unicité par exécution et nom normalisé). Une recherche sans candidat échoue sur son
 * code fermé ; une recherche partielle (des candidats et des erreurs) continue, ses codes d'erreur sont dans `errors`.
 */
export function etapeRecherche(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "b",
    async (contexte) => {
      const { voyage, villes } = await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      const { fabrique, options } = await ouvrirCapacites(contexte);
      const capacite = fabrique.recherche(options);
      for (const ville of villes) {
        const connus = (await sql(contexte, (x) => x.query(SQL_NOMS, [contexte.organizationId, contexte.generationRunId]))).rows.map((ligne) => String(ligne.name));
        const debut = contexte.dep.maintenant();
        const issue = await capacite.rechercher(voyage.brief, { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart }, connus, voyage.timeZone);
        if (!issue.ok) throw new ArretEtape(issue.code);
        const { lignes, bilan } = issue.valeur;
        const dejaConnus = new Set(connus.map(normaliser));
        await sql(contexte, async (x) => {
          await exigerGarde(x, contexte.organizationId, contexte.generationRunId, "b", maintenant(contexte));
          const run = (
            await x.query(SQL_RECHERCHE, [
              contexte.organizationId,
              contexte.tripId,
              contexte.generationRunId,
              [...bilan.queries],
              bilan.pagesRead,
              bilan.durationMs,
              bilan.costEstimateMicros,
              [...bilan.errors],
              new Date(debut + ville.rang).toISOString(),
              new Date(contexte.dep.maintenant() + ville.rang).toISOString(),
            ])
          ).rows[0];
          if (run === undefined) throw new Error("recherche : exécution non écrite");
          for (const { candidat, occurrence } of lignes) {
            const cle = normaliser(candidat.name);
            if (dejaConnus.has(cle)) continue;
            dejaConnus.add(cle);
            const ecrit = (
              await x.query(SQL_CANDIDAT, [
                contexte.organizationId,
                contexte.tripId,
                run.id,
                candidat.kind,
                candidat.name,
                candidat.summary,
                candidat.category,
                JSON.stringify(candidat.facts),
                JSON.stringify(candidat.sources),
                candidat.confidence,
                candidat.stopKind,
                candidat.toReserve,
              ])
            ).rows[0];
            if (ecrit === undefined) throw new Error("recherche : candidat non écrit");
            if (occurrence !== null) {
              await x.query(SQL_OCCURRENCE, [
                contexte.organizationId,
                contexte.tripId,
                ecrit.id,
                occurrence.startsAt.toISOString(),
                occurrence.timezone,
                occurrence.category,
                occurrence.sourceUrl,
                occurrence.sourceCheckedAt === null ? null : occurrence.sourceCheckedAt.toISOString(),
                occurrence.status,
              ]);
            }
          }
        });
      }
    },
    dependances,
  );
}

// --- Étape c : ancrage (workflow 2) ----------------------------------------------------------------------------------------

const SQL_ANCRAGE = `UPDATE public.candidates SET place_id = $3 WHERE organization_id = $1 AND id = $2`;

/**
 * Étape `c` (rang 4 ; **workflow 2**, réutilisable par B9d) : zone du séjour de chaque ville (une fiche de position, ou
 * aucun appel pour un quartier suggéré), puis Text Search de **tous** les candidats de la ville, y compris ceux qui ont déjà
 * un `placeId` : la présence d'un `placeId` ne vaut jamais verdict. `candidates.place_id` est écrit pour les seuls candidats
 * résolus, les autres le perdent (aucune proposition ne les porte). Les événements ne sont pas ancrés.
 */
export function etapeAncrage(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "c",
    async (contexte) => {
      const { villes } = await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      const candidats = (await sql(contexte, (x) => lireCandidats(x, contexte))).filter((candidat) => candidat.kind === "place");
      if (candidats.length === 0) return;
      const { fabrique, options } = await ouvrirCapacites(contexte);
      const capacite: CapaciteAncrage = fabrique.ancrage(options);
      const resolus = new Map<string, string>();
      const traites: string[] = [];
      for (const ville of villes) {
        const deLaVille = candidats.filter((candidat) => candidat.ville === ville.rang);
        if (deLaVille.length === 0) continue;
        const issue = await capacite.ancrer(logementVille(ville), ville.nom, deLaVille.map(({ id, nom }) => ({ id, nom })));
        if (!issue.ok) throw new ArretEtape(issue.code);
        for (const candidat of deLaVille) {
          traites.push(candidat.id);
          const placeId = issue.valeur.get(candidat.id);
          if (placeId !== undefined) resolus.set(candidat.id, placeId);
        }
      }
      await sql(contexte, async (x) => {
        await exigerGarde(x, contexte.organizationId, contexte.generationRunId, "c", maintenant(contexte));
        for (const id of traites) await x.query(SQL_ANCRAGE, [contexte.organizationId, id, resolus.get(id) ?? null]);
      });
    },
    dependances,
  );
}

// --- Étape d : notation (workflow 3) -----------------------------------------------------------------------------------------

const SQL_NOTES = `UPDATE public.candidates SET fit = $3, not_for_me_risk = $4, must_see = $5, slot_fit = $6::text[]
  WHERE organization_id = $1 AND id = $2`;

/**
 * Étape `d` (rang 5 ; **workflow 3**, réutilisable par B9d) : note les candidats ancrés qui n'ont pas encore de notes
 * (`fit` nul), ville par ville, sur nos descriptions seules (nom, résumé, catégorie, type d'étape : jamais une donnée Google).
 * Les notes sont écrites pour les candidats notés ; un candidat que le modèle n'a pas noté reste sans notes et sans rôle.
 */
export function etapeNotation(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "d",
    async (contexte) => {
      const { voyage, villes } = await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      const aNoter = (await sql(contexte, (x) => lireCandidats(x, contexte))).filter(
        (candidat) => candidat.kind === "place" && candidat.placeId !== null && candidat.fit === null && (candidat.stopKind === "activity" || candidat.stopKind === "meal"),
      );
      if (aNoter.length === 0) return;
      const { fabrique, options } = await ouvrirCapacites(contexte);
      const capacite = fabrique.notation(options);
      const notes = new Map<string, NotesMoteur>();
      for (const ville of villes) {
        const deLaVille = aNoter.filter((candidat) => candidat.ville === ville.rang);
        if (deLaVille.length === 0) continue;
        const issue = await capacite.noter(
          voyage.brief,
          { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart },
          deLaVille.map((candidat) => ({ id: candidat.id, nom: candidat.nom, resume: candidat.resume, categorie: candidat.categorie, typeEtape: candidat.stopKind as "activity" | "meal" })),
        );
        if (!issue.ok) throw new ArretEtape(issue.code);
        for (const [id, note] of issue.valeur) notes.set(id, note);
      }
      await sql(contexte, async (x) => {
        await exigerGarde(x, contexte.organizationId, contexte.generationRunId, "d", maintenant(contexte));
        for (const [id, note] of notes) await x.query(SQL_NOTES, [contexte.organizationId, id, note.matchesWishes, note.notForMeRisk, note.mustSee, [...note.slotFit]]);
      });
    },
    dependances,
  );
}

// --- Étape e : planification et publication ----------------------------------------------------------------------------------

const SQL_OCCURRENCES = `SELECT candidate_id, to_char(starts_at AT TIME ZONE timezone, 'YYYY-MM-DD') AS date,
    to_char(starts_at AT TIME ZONE timezone, 'HH24:MI') AS heure, status
  FROM public.event_occurrences WHERE organization_id = $1 AND trip_id = $2`;

function candidatMoteur(candidat: CandidatLu): (CandidatMoteur & { readonly ville: number }) | undefined {
  if ((candidat.stopKind !== "activity" && candidat.stopKind !== "meal") || candidat.placeId === null) return undefined;
  if (candidat.fit === null || candidat.risque === null || candidat.incontournable === null || candidat.slotFit === null) return undefined;
  return {
    id: candidat.id,
    nom: candidat.nom,
    resume: candidat.resume,
    categorie: candidat.categorie,
    typeEtape: candidat.stopKind,
    faits: candidat.faits,
    sources: candidat.sources.map((source) => ({ url: source.url, date: source.checkedOn, classe: classeDeSource(source.url) })),
    notes: { matchesWishes: candidat.fit, notForMeRisk: candidat.risque, mustSee: candidat.incontournable, slotFit: [...candidat.slotFit] },
    placeId: candidat.placeId,
    aReserver: candidat.aReserver,
    ville: candidat.ville,
  };
}

/**
 * Étape `e` (rang 6) : relectures Google des seuls jours planifiés (J1 et J2 : fiches des lieux retenus, une matrice Routes
 * par jour, aucune pour un jour non planifié, B9-TL-13), moteur partiel (`generer` avec `jours`), réparation déterministe
 * (**aucun appel de modèle** entre la validation et la rédaction), raisons (`rediger`, par ville, seuls les lieux retenus),
 * puis la **transaction unique de publication** (`publication.ts`). Statut `ready` avec 8 cases `proposal`, `incomplete`
 * sinon (cases `noOption` à la suite, jamais un lieu non ancré). Une case dont la raison ou le détour manque devient
 * `noOption` (choix signalé dans la PR).
 */
export function etapePlanification(entree: unknown, dependances?: DependancesGeneration): Promise<EtatEtape> {
  return executer(
    entree,
    "e",
    async (contexte) => {
      const { voyage, jours, villes } = await sql(contexte, (x) => lireVoyageOuArreter(contexte, x));
      const lus = await sql(contexte, async (x) => ({
        candidats: await lireCandidats(x, contexte),
        occurrences: (await x.query(SQL_OCCURRENCES, [contexte.organizationId, contexte.tripId])).rows,
      }));
      const { fabrique, options } = await ouvrirCapacites(contexte);
      const capacite: CapaciteFinale = fabrique.finale(options);

      const dateReference = new Date(contexte.dep.maintenant()).toISOString().slice(0, 10);
      const { nuits, nuitsVille } = nuitsDuVoyage(voyage, villes);
      const squeletteDuVoyage = squeletteAvecEngagements({
        voyage: { start: voyage.draft.start, end: voyage.draft.end },
        pace: voyage.brief.pace,
        nombreDeNuits: nuits.length,
        engagements: voyage.draft.commitments,
        configuration: CONFIGURATION_MOTEUR,
        budgetTrajetReduit: false,
      });
      const squelette = squeletteDuVoyage.filter((jour) => jours.includes(jour.index));
      const classement = { classement: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU, dateReference };

      const retenus = lus.candidats.flatMap((candidat) => candidatMoteur(candidat) ?? []);
      const planification = await capacite.planifier({
        jours: squelette,
        nuitsVille,
        villes: villes.map((ville) => ({ rang: ville.rang, nom: ville.nom, logement: logementVille(ville) })),
        candidats: retenus,
        modes: [...modesAdmis(voyage.brief.mobility)],
        classement,
        configuration: CONFIGURATION_MOTEUR,
      });
      if (!planification.ok) throw new ArretEtape(planification.code);

      const evenements = evenementsDe(lus.candidats, lus.occurrences);
      const entreeMoteur = {
        voyage: {
          destination: voyage.draft.destination,
          start: voyage.draft.start,
          end: voyage.draft.end,
          timeZone: voyage.timeZone,
          travellers: { adults: voyage.brief.travellers.adults, children: voyage.brief.travellers.children },
        },
        brief: voyage.brief,
        nuits,
        engagements: voyage.draft.commitments,
        candidats: planification.valeur.candidats,
        evenements,
        // Idée « Surprends-moi » : hors de l'aperçu (signalé dans la PR), aucun candidat d'idée n'est construit.
        idees: [],
        choix: new Map(),
        configuration: CONFIGURATION_MOTEUR,
        classement: { formule: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU },
        relectures: planification.valeur.relectures,
        porteeR1: { evenementsSansLieu: "admis" as const },
        dateReference,
        version: 1,
        budgetTrajetReduit: false,
        jours,
      };
      let resultat = generer(entreeMoteur);
      // `no_option` n'est jamais une raison d'échec (B9-PO-9) : sans programme valide, version sans étape et cases `noOption`.
      if (!resultat.ok) resultat = generer({ ...entreeMoteur, candidats: [], evenements: [] });
      if (!resultat.ok) throw new ArretEtape("no_option");

      // Raisons : par ville, les seuls lieux retenus par le moteur.
      const parPlaceId = new Map(lus.candidats.flatMap((candidat) => (candidat.placeId === null ? [] : [[candidat.placeId, candidat] as const])));
      const etapes = resultat.instantane.days
        .filter((jour) => jours.includes(jour.index))
        .flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined && parPlaceId.has(item.stop.placeId) ? [{ stop: item.stop, candidat: parPlaceId.get(item.stop.placeId) as CandidatLu }] : [])));
      const raisons = new Map<string, { raison: string; detour: string }>();
      for (const ville of villes) {
        const lieux: LieuARedige[] = etapes
          .filter(({ candidat }) => candidat.ville === ville.rang)
          .map(({ candidat }) => ({
            id: candidat.id,
            nom: candidat.nom,
            resume: candidat.resume,
            categorie: candidat.categorie,
            typeEtape: candidat.stopKind === "meal" ? "meal" : "activity",
            sourceUrl: candidat.sources[0]?.url ?? "https://example.invalid/",
          }));
        if (lieux.length === 0) continue;
        const issue = await capacite.rediger(voyage.brief, { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart }, lieux);
        if (!issue.ok) throw new ArretEtape(issue.code);
        for (const [id, raison] of issue.valeur) raisons.set(id, raison);
      }

      const lieux = new Map<string, LieuDeCase>();
      const jourAvecRaisons = (jour: DaySnapshot): DaySnapshot => ({
        ...jour,
        items: jour.items.map((item) => {
          if (item.type !== "stop") return item;
          const etape = etapes.find((e) => e.stop.id === item.stop.id);
          const raison = etape === undefined ? undefined : raisons.get(etape.candidat.id);
          if (etape === undefined || raison === undefined) return item;
          lieux.set(item.stop.id, { candidatId: etape.candidat.id, categorie: etape.candidat.categorie, raison: raison.raison, detour: raison.detour });
          return { ...item, stop: { ...item.stop, reason: raison.raison } };
        }),
      });
      const instantane = { days: resultat.instantane.days.map(jourAvecRaisons) };
      const cases = composerCases({ instantane, jours, lieux, squelette, configuration: CONFIGURATION_MOTEUR });
      const pretes = cases.filter((c) => c.type === "proposal").length;

      await publier(
        contexte.dep,
        { organizationId: contexte.organizationId, generationRunId: contexte.generationRunId, tripId: contexte.tripId, requestId: contexte.requestId, echeance: contexte.echeance },
        { instantane, cases, statut: pretes === 8 ? "ready" : "incomplete" },
      );
    },
    dependances,
  );
}

type LigneOccurrence = Record<string, unknown>;

/** Événements de l'aperçu : candidats `event` dont l'heure est lue (une occurrence), date et heure dans le fuseau du voyage. */
function evenementsDe(candidats: readonly CandidatLu[], occurrences: readonly LigneOccurrence[]): CandidatEvenement[] {
  const parCandidat = new Map(occurrences.map((ligne) => [String(ligne.candidate_id), ligne] as const));
  return candidats.flatMap((candidat): CandidatEvenement[] => {
    const occurrence = parCandidat.get(candidat.id);
    if (candidat.kind !== "event" || occurrence === undefined) return [];
    return [
      {
        id: candidat.id,
        nom: candidat.nom,
        resume: candidat.resume,
        categorie: candidat.categorie,
        faits: candidat.faits,
        sources: candidat.sources.map((source) => ({ url: source.url, date: source.checkedOn, classe: classeDeSource(source.url) })),
        ...(candidat.placeId === null ? {} : { placeId: candidat.placeId }),
        aReserver: candidat.aReserver,
        evenement: { date: String(occurrence.date), heure: String(occurrence.heure), dateRelue: occurrence.status === "confirmed" },
      },
    ];
  });
}

