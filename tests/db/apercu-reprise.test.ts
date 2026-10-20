import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composerSimuleeAvec, type CapaciteAncrage, type CapaciteRecherche, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { EtatEtapeSchema, type EtatEtape } from "@/server/generation/etat";

import {
  ETAPES,
  MAINTENANT,
  PLAFONDS_LARGES,
  banc,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  derouler,
  doublesEdimbourg,
} from "../support/banc-apercu";
import { compterAppels, compteursVides, type Compteurs } from "../support/compteur-appels";
import { journalDePrompts, type JournalPrompts } from "../support/journal-prompts";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * B9c-suite (ticket #573 ; décisions 0106 § 5 et 0105 § 6) : un « Réessayer » de l'aperçu (`retryGeneration`) reprend les
 * recherches et les candidats des essais précédents du même voyage, ré-ancrés, au lieu de refaire la recherche. Base réelle,
 * doubles de fournisseurs (variante simulée, fixtures d'Édimbourg) ; aucune clé, aucun appel réel.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("reprise");
  ({ app, auth } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const ECHEC_FOURNISSEUR = { ok: false, code: "upstream_unavailable", retryable: true } as const;
/** Étapes de requête des modèles de la recherche (plan, tours, structuration) : aucune ne part pour une ville reprise. */
const ETAPES_RECHERCHE = ["plan", "recherche", "structuration"];

const dependances = (fabrique?: () => FabriqueGeneration): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds: PLAFONDS_LARGES,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

/** Fabrique simulée dont les modèles passent par un journal de prompts et dont les doubles comptent leurs appels. */
function observee(
  journaux: JournalPrompts[],
  compteurs: Compteurs,
  options: {
    readonly surcharge?: (base: FabriqueGeneration) => Partial<Omit<FabriqueGeneration, "variante">>;
    readonly doubles?: (d: DoublesGeneration) => DoublesGeneration;
  } = {},
): () => FabriqueGeneration {
  return () => {
    const fabrique = composerSimuleeAvec({
      doubles: () => {
        const d = (options.doubles ?? ((x) => x))(doublesEdimbourg());
        const j = journalDePrompts(d.modeles);
        journaux.push(j);
        return compterAppels({ ...d, modeles: j.client }, compteurs);
      },
    });
    return { ...fabrique, ...(options.surcharge?.(fabrique) ?? {}) };
  };
}

async function lancer(org: Org, demande = demandeEdimbourg()) {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demande);
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await dernierRun(org, tripId);
  const etat: EtatEtape = { generationRunId: run.id, organizationId: org.org, rang: 0 };
  return { adapter, tripId, run, etat };
}

async function dernierRun(org: Org, tripId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query("SELECT id, phase, stop_reason, step_seq FROM public.generation_runs WHERE trip_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1", [tripId]);
    return rows[0] as { id: string; phase: string; stop_reason: string | null; step_seq: number };
  });
}

/** Nouvel essai par `retryGeneration`, puis l'état d'entrée de sa nouvelle exécution. */
async function reessayer(org: Org, adapter: ReturnType<typeof banc>["adapter"], tripId: string, precedent: string): Promise<EtatEtape> {
  const relance = await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID() });
  expect(relance).toEqual({ ok: true, value: { tripId } });
  const run = await dernierRun(org, tripId);
  expect(run.id).not.toBe(precedent);
  expect(run.phase).toBe("queued");
  return { generationRunId: run.id, organizationId: org.org, rang: 0 };
}

/** Toutes les lignes d'une exécution (elle-même, ses recherches, ses candidats, leurs occurrences), pour comparer avant et après. */
async function lignesDe(org: Org, runId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => ({
    run: (await c.query("SELECT * FROM public.generation_runs WHERE id = $1", [runId])).rows,
    recherches: (await c.query("SELECT * FROM public.research_runs WHERE generation_run_id = $1 ORDER BY started_at, id", [runId])).rows,
    candidats: (
      await c.query(
        "SELECT c.* FROM public.candidates c JOIN public.research_runs r ON r.id = c.research_run_id WHERE r.generation_run_id = $1 ORDER BY r.started_at, c.created_at, c.id",
        [runId],
      )
    ).rows,
    occurrences: (
      await c.query(
        `SELECT o.* FROM public.event_occurrences o JOIN public.candidates c ON c.id = o.candidate_id
         JOIN public.research_runs r ON r.id = c.research_run_id WHERE r.generation_run_id = $1 ORDER BY o.starts_at, o.id`,
        [runId],
      )
    ).rows,
  }));
}

const contenu = (candidat: Record<string, unknown>) => {
  const { kind, name, summary, category, facts, sources, confidence, fit, not_for_me_risk, must_see, slot_fit, stop_kind, to_reserve } = candidat;
  return { kind, name, summary, category, facts, sources, confidence, fit, not_for_me_risk, must_see, slot_fit, stop_kind, to_reserve };
};

describe("aperçu (B9c-suite) : « Réessayer » reprend les recherches déjà faites", () => {
  it("échec à l'étape e : le nouvel essai ne cherche rien, n'appelle aucun modèle de recherche, ré-ancre les candidats repris et publie", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, run, etat } = await lancer(org);
    // Premier essai : recherche, ancrage et notation passent ; la planification échoue (erreur passagère du fournisseur).
    const echec = await derouler(etat, dependances(observee([], compteursVides(), { surcharge: (f) => ({ finale: (o) => ({ ...f.finale(o), planifier: async () => ECHEC_FOURNISSEUR }) }) })));
    expect(echec.arret).toBe("upstream_unavailable");
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(true);
    const avant = await lignesDe(org, run.id);
    expect(avant.recherches.length).toBeGreaterThan(0);
    const lieuxAncres = avant.candidats.filter((c) => c.kind === "place" && c.place_id !== null);
    expect(lieuxAncres.length).toBeGreaterThan(1);

    // Nouvel essai : l'ancrage observé ne résout plus le premier lieu ancré (lieu disparu), et enregistre les noms demandés.
    const disparu = String(lieuxAncres[0]!.name);
    const demandes: string[] = [];
    const journaux: JournalPrompts[] = [];
    const compteurs = compteursVides();
    const ancrage = (f: FabriqueGeneration) => ({
      ancrage: (o: Parameters<FabriqueGeneration["ancrage"]>[0]): CapaciteAncrage => {
        const capacite = f.ancrage(o);
        return {
          async ancrer(logement, ville, candidats) {
            demandes.push(...candidats.map((c) => c.nom));
            const issue = await capacite.ancrer(logement, ville, candidats);
            if (!issue.ok) return issue;
            const sans = new Map(issue.valeur);
            for (const c of candidats) if (c.nom === disparu) sans.delete(c.id);
            return { ok: true, valeur: sans };
          },
        };
      },
    });
    const essai = await reessayer(org, adapter, tripId, run.id);
    const deps = dependances(observee(journaux, compteurs, { surcharge: ancrage }));
    const sorties: EtatEtape[] = [];
    let courant = essai;
    for (const etape of ETAPES) {
      courant = await etape(courant, deps);
      sorties.push(courant);
      expect(courant.arret).toBeUndefined();
    }

    // Aucune recherche refaite : ni modèle de recherche (journal de prompts), ni recherche web, ni page lue.
    const requetes = journaux.flatMap((j) => j.requetes);
    expect(requetes.filter((r) => ETAPES_RECHERCHE.includes(r.etape))).toEqual([]);
    expect(compteurs.rechercheWeb).toBe(0);
    expect(compteurs.lecteur).toBe(0);

    const apres = await lignesDe(org, essai.generationRunId);
    // Une recherche par ville, copiée, au bilan vide ; candidats repris dans le même ordre, avec leur contenu et leurs notes.
    expect(apres.recherches).toHaveLength(avant.recherches.length);
    for (const r of apres.recherches) {
      expect(r.queries).toEqual([]);
      expect(r.pages_read).toBe(0);
      expect(Number(r.cost_estimate_micros)).toBe(0);
      expect(r.errors).toEqual([]);
    }
    expect(apres.candidats.map(contenu)).toEqual(avant.candidats.map(contenu));
    expect(apres.candidats.map((c) => c.id).filter((id) => avant.candidats.some((a) => a.id === id))).toEqual([]);
    expect(apres.occurrences.map((o) => [o.starts_at, o.source_url, o.status])).toEqual(avant.occurrences.map((o) => [o.starts_at, o.source_url, o.status]));

    // Ré-ancrage : le double est appelé pour chaque lieu repris ; le lieu non résolu perd son place_id, aucune case ne le porte.
    for (const lieu of avant.candidats.filter((c) => c.kind === "place")) expect(demandes).toContain(String(lieu.name));
    const copieDisparue = apres.candidats.find((c) => c.name === disparu);
    expect(copieDisparue?.place_id).toBeNull();
    const portes = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      (await c.query("SELECT 1 FROM public.proposals WHERE trip_id = $1 AND candidate_id = $2", [tripId, copieDisparue!.id])).rows,
    );
    expect(portes).toEqual([]);

    // Aucune écriture de l'exécution précédente ni de ses lignes (0105 § 6).
    expect(await lignesDe(org, run.id)).toEqual(avant);

    // Publication du nouvel essai ; l'état sérialisé reste fermé (aucun compteur, 0011 point 2).
    const fin = await dernierRun(org, tripId);
    expect(fin.id).toBe(essai.generationRunId);
    expect(["ready", "incomplete"]).toContain(fin.phase);
    for (const s of sorties) {
      expect(EtatEtapeSchema.safeParse(s).success).toBe(true);
      expect(Object.keys(s).sort()).toEqual(["generationRunId", "organizationId", "rang"]);
    }
  });

  it("échec à la recherche de la seconde ville : le nouvel essai ne cherche que la ville manquante", async () => {
    const org = await createOrg(auth);
    const demande = demandeEdimbourg({ start: "2026-11-23", end: "2026-11-28", otherCities: [{ name: "Glasgow", arrival: "2026-11-24", lodging: { kind: "none" } }] });
    const { adapter, tripId, run, etat } = await lancer(org, demande);
    const cherchees: string[] = [];
    const recherche = (echoue: boolean) => (f: FabriqueGeneration) => ({
      recherche: (o: Parameters<FabriqueGeneration["recherche"]>[0]): CapaciteRecherche => {
        const capacite = f.recherche(o);
        return {
          async rechercher(brief, ville, dejaTrouves, fuseau) {
            cherchees.push(ville.nom);
            if (echoue && ville.rang === 1) return ECHEC_FOURNISSEUR;
            return capacite.rechercher(brief, ville, dejaTrouves, fuseau);
          },
        };
      },
    });
    const echec = await derouler(etat, dependances(observee([], compteursVides(), { surcharge: recherche(true) })));
    expect(echec.arret).toBe("upstream_unavailable");
    expect(cherchees).toEqual(["Édimbourg", "Glasgow"]);
    const avant = await lignesDe(org, run.id);
    expect(avant.recherches).toHaveLength(1);

    cherchees.length = 0;
    const journaux: JournalPrompts[] = [];
    const essai = await reessayer(org, adapter, tripId, run.id);
    const apresB = await derouler(essai, dependances(observee(journaux, compteursVides(), { surcharge: recherche(false) })), 3);
    expect(apresB.arret).toBeUndefined();
    // Seule la ville jamais cherchée l'est ; la première est reprise, sans appel.
    expect(cherchees).toEqual(["Glasgow"]);
    expect(journaux.flatMap((j) => j.requetes).filter((r) => ETAPES_RECHERCHE.includes(r.etape)).length).toBeGreaterThan(0);
    const apres = await lignesDe(org, essai.generationRunId);
    expect(apres.recherches).toHaveLength(2);
    // La première recherche (rang 0) est la copie de celle d'Édimbourg, la seconde une recherche neuve.
    expect(apres.recherches[0]!.queries).toEqual([]);
    expect(apres.recherches[1]!.queries.length).toBeGreaterThan(0);
    const premiere = apres.candidats.filter((c) => c.research_run_id === apres.recherches[0]!.id);
    expect(premiere.map(contenu)).toEqual(avant.candidats.map(contenu));
    // Unicité des noms par exécution : la recherche neuve n'a réécrit aucun nom repris.
    const noms = apres.candidats.map((c) => String(c.name).toLowerCase());
    expect(new Set(noms).size).toBe(noms.length);
    expect(await lignesDe(org, run.id)).toEqual(avant);
  });

  it("premier essai d'un voyage : rien à reprendre, même quand un autre voyage de l'organisation a déjà cherché la même ville", async () => {
    const org = await createOrg(auth);
    const premier = await lancer(org);
    expect((await derouler(premier.etat, dependances())).arret).toBeUndefined();
    const second = await lancer(org);
    const cherchees: string[] = [];
    const fabrique = observee([], compteursVides(), {
      surcharge: (f) => ({
        recherche: (o) => {
          const capacite = f.recherche(o);
          return {
            rechercher(brief, ville, dejaTrouves, fuseau) {
              cherchees.push(ville.nom);
              return capacite.rechercher(brief, ville, dejaTrouves, fuseau);
            },
          };
        },
      }),
    });
    expect((await derouler(second.etat, dependances(fabrique), 3)).arret).toBeUndefined();
    expect(cherchees).toEqual(["Édimbourg"]);
    const lignes = await lignesDe(org, second.run.id);
    expect(lignes.recherches).toHaveLength(1);
    expect(lignes.recherches[0]!.queries.length).toBeGreaterThan(0);
  });

  it("étape b redistribuée après une reprise : la garde l'arrête, aucune copie en double", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, run, etat } = await lancer(org);
    const echec = await derouler(etat, dependances(observee([], compteursVides(), { surcharge: (f) => ({ ancrage: (o) => ({ ...f.ancrage(o), ancrer: async () => ECHEC_FOURNISSEUR }) }) })));
    expect(echec.arret).toBe("upstream_unavailable");
    const essai = await reessayer(org, adapter, tripId, run.id);
    const apresL = await derouler(essai, dependances(), 2);
    const apresB = await ETAPES[2]!(apresL, dependances());
    expect(apresB.arret).toBeUndefined();
    const une = await lignesDe(org, essai.generationRunId);
    const rejeu = await ETAPES[2]!(apresL, dependances());
    expect(rejeu.arret).toBe("step_expired");
    expect(await lignesDe(org, essai.generationRunId)).toEqual(une);
  });
});
