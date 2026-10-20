import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DaySnapshot } from "@/contracts";
import { COUTS_ESTIMES_MICROS, PARTS_FORFAIT } from "@/server/config/generation";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { EtatEtape } from "@/server/generation/etat";

import {
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
import { journalDePrompts } from "../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../support/sentinelles-google";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * « Surprends-moi » à l'étape e (décision 0106 § 1, 0105 § 5) : critère `aperçu: une idée par jour planifié`, invariant des
 * plans, un seul appel de rédaction par lot, idée distincte des étapes du jour, aucune donnée Google dans le prompt.
 * Base jetable, doubles sur les fixtures d'Édimbourg ; aucune clé, aucun appel réel.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("idees");
  ({ app, auth } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const dependances = (fabrique?: () => FabriqueGeneration): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds: PLAFONDS_LARGES,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

async function lancer(org: Org) {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demandeEdimbourg());
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0] as { id: string });
  const etat: EtatEtape = { generationRunId: run.id, organizationId: org.org, rang: 0 };
  return { tripId, etat, run };
}

async function jours(org: Org, tripId: string): Promise<DaySnapshot[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version DESC LIMIT 1", [tripId]);
    const brut = rows[0]?.snapshot as { days: DaySnapshot[] } | string;
    return (typeof brut === "string" ? JSON.parse(brut) : brut).days;
  });
}

const lieuxDuJour = (jour: DaySnapshot): string[] => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []));

const ETAPE_E = 5;

/** Étape e seule, avec un journal de prompts sur les modèles ; les cinq premières étapes tournent sans idée ni journal. */
async function etapeEAvecJournal(org: Org, etat: EtatEtape, ideesParJour?: number) {
  const progres = await derouler(etat, dependances(), ETAPE_E);
  expect(progres.arret).toBeUndefined();
  const journaux: ReturnType<typeof journalDePrompts>[] = [];
  const sentinelles = avecSentinellesGoogle(doublesEdimbourg());
  const fabrique = () =>
    composerSimuleeAvec({
      doubles: () => {
        const d = doublesEdimbourg();
        const s = avecSentinellesGoogle(d);
        for (const v of s.valeurs) sentinelles.valeurs.add(v);
        const j = journalDePrompts(d.modeles);
        journaux.push(j);
        const places = {
          ...d.places,
          textSearch: s.places.textSearch,
          async details(placeId: string) {
            const [decore, brut] = await Promise.all([s.places.details(placeId), d.places.details(placeId)]);
            return { ...decore, niveauPrix: brut.niveauPrix };
          },
        };
        return { ...d, modeles: j.client, places, routes: s.routes };
      },
    });
  const { etapePlanification } = await import("@/server/generation/etapes");
  const fin = await etapePlanification(progres, { ...dependances(fabrique), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
  void org;
  return { fin, requetes: journaux.flatMap((j) => j.requetes), texte: journaux.map((j) => j.texte()).join("\n"), sentinelles };
}

describe("aperçu : Surprends-moi (0106 § 1, 0105 § 5)", () => {
  it("aperçu: une idée par jour planifié : J1 et J2 ont chacun une idée, jamais une étape du programme ; J3 et suivants aucune", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    const js = await jours(org, tripId);
    const auPlan = new Set(js.flatMap(lieuxDuJour));
    for (const index of [1, 2]) {
      const jour = js.find((j) => j.index === index) as DaySnapshot & { surprise?: { placeId?: string } };
      expect(jour.surprise?.placeId, `idée du jour ${index}`).toBeDefined();
      expect(lieuxDuJour(jour)).not.toContain(jour.surprise?.placeId);
      expect(auPlan.has(jour.surprise?.placeId as string)).toBe(false);
      // Admissibilité complète (0106 § 1) : source `https:`, raison maison écrite.
      const idee = jour.surprise as { source?: { url: string }; reason?: string };
      expect(idee.source?.url.startsWith("https:")).toBe(true);
      expect(idee.reason?.trim()).not.toBe("");
    }
    const idees = js.slice(0, 2).map((j) => (j as { surprise?: { placeId?: string } }).surprise?.placeId);
    expect(new Set(idees).size).toBe(2);
    for (const jour of js.filter((j) => j.index > 2)) expect((jour as { surprise?: unknown }).surprise).toBeUndefined();
    // Hors des huit cases : les cases ne comptent que des activités et des repas.
    const { rows } = await inTx(app, { org: org.org, user: org.owner }, (c) => c.query("SELECT count(*)::int AS n FROM public.proposals WHERE trip_id = $1", [tripId]));
    expect(rows[0].n).toBe(8);
    const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
    expect(run.phase).not.toBe("failed");
    expect(run.stop_reason).toBeNull();
  });

  it("sans candidat admissible : pas d'idée, pas d'erreur ; l'exécution finit incomplète, jamais en échec", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({
      ...base,
      ancrage: (o: Parameters<FabriqueGeneration["ancrage"]>[0]) => {
        const reel = base.ancrage(o);
        return {
          async ancrer(...args: Parameters<typeof reel.ancrer>) {
            const issue = await reel.ancrer(...args);
            // Ordre stable (par nom) : l'ordre de lecture des candidats suit leur `id` aléatoire (même `created_at`), et un
            // découpage dans cet ordre laissait parfois un candidat d'idée admissible (test instable).
            const nom = new Map(args[2].map((c) => [c.id, c.nom] as const));
            const tries = [...(issue.ok ? issue.valeur : [])].sort(([a], [b]) => (nom.get(a) ?? "").localeCompare(nom.get(b) ?? ""));
            return issue.ok ? { ok: true as const, valeur: new Map(tries.slice(0, 3)) } : issue;
          },
        };
      },
    });
    const fin = await derouler(etat, dependances(fabrique));
    expect(fin.arret).toBeUndefined();
    const js = await jours(org, tripId);
    for (const jour of js) expect((jour as { surprise?: unknown }).surprise).toBeUndefined();
    const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
    expect(run.phase).toBe("incomplete");
    expect(run.stop_reason).toBeNull();
  });

  it("invariant : les étapes du programme sont identiques avec et sans idées", async () => {
    const [avec, sans] = await Promise.all(
      [undefined, 0].map(async (ideesParJour) => {
        const org = await createOrg(auth);
        const { tripId, etat } = await lancer(org);
        const progres = await derouler(etat, dependances(), ETAPE_E);
        const { etapePlanification } = await import("@/server/generation/etapes");
        const fin = await etapePlanification(progres, { ...dependances(), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
        expect(fin.arret).toBeUndefined();
        return jours(org, tripId);
      }),
    );
    const etapes = (js: DaySnapshot[]) => js.map((jour) => [jour.index, jour.items.map((item) => (item.type === "stop" ? [item.stop.kind, item.stop.placeId, item.stop.start, item.stop.end, item.stop.reason] : item.type))]);
    expect(etapes(avec!)).toEqual(etapes(sans!));
    expect(avec!.filter((j) => (j as { surprise?: unknown }).surprise !== undefined)).toHaveLength(2);
    expect(sans!.filter((j) => (j as { surprise?: unknown }).surprise !== undefined)).toHaveLength(0);
  });

  it("un seul appel de rédaction par lot : le nombre de requêtes de modèle de l'étape e ne change pas avec les idées, et reste sous sa réserve", async () => {
    const orgA = await createOrg(auth);
    const a = await lancer(orgA);
    const avec = await etapeEAvecJournal(orgA, a.etat);
    const orgB = await createOrg(auth);
    const b = await lancer(orgB);
    const sans = await etapeEAvecJournal(orgB, b.etat, 0);
    expect(avec.fin.arret).toBeUndefined();
    expect(sans.fin.arret).toBeUndefined();
    expect(avec.requetes.length).toBeGreaterThan(0);
    expect(avec.requetes.length).toBe(sans.requetes.length);
    // Réserve de l'étape e : 20 % du plafond de coût des modèles de l'aperçu, à 20 000 micro-USD estimés par requête.
    const reserve = (PLAFONDS_LARGES.generations.apercu.coutModelesMicros * PARTS_FORFAIT.modeles.e) / 100;
    expect(avec.requetes.length * COUTS_ESTIMES_MICROS.requeteModele).toBeLessThanOrEqual(reserve);
    // Les noms des idées voyagent dans le lot de rédaction (nos descriptions), pas ailleurs.
    expect(avec.texte).toContain("Musée national des collections");
  });

  it("aucune donnée Google dans le prompt de rédaction (sentinelles de champs absentes)", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const { fin, texte, sentinelles } = await etapeEAvecJournal(org, etat);
    expect(fin.arret).toBeUndefined();
    expect(texte.length).toBeGreaterThan(0);
    expect(sentinellesPresentes(texte, sentinelles)).toEqual([]);
  });

  /**
   * Coût des idées (0105 § 5.1 point 4, cas (f)) : les candidats d'idée sont mesurés par les relectures et le trajet du premier
   * passage ; aucune fiche ni aucun élément Routes propre aux idées n'est demandé. Le compteur d'appels Google de l'étape e est
   * le même avec et sans idées, et un forfait épuisé juste après les mesures du plan (double qui refuse tout appel de plus)
   * n'empêche ni les étapes ni la publication : rien n'échoue, aucune étape ne change.
   */
  it("coût : aucune fiche ni élément Routes propre aux idées ; forfait Google épuisé après le plan : étapes intactes, jamais failed", async () => {
    async function etapeE(ideesParJour: number | undefined, refuserApresLePlan = false) {
      const org = await createOrg(auth);
      const { tripId, etat } = await lancer(org);
      const progres = await derouler(etat, dependances(), ETAPE_E);
      expect(progres.arret).toBeUndefined();
      const compteurs: Compteurs = compteursVides();
      // Vrai dès que `planifier` a rendu son résultat : le double refuse alors tout appel Google, dès le premier.
      let planFini = false;
      let refusApresLePlan = 0;
      const simulee = () =>
        composerSimuleeAvec({
          doubles: () => {
            const d = compterAppels(doublesEdimbourg(), compteurs);
            if (!refuserApresLePlan) return d;
            const refuser = <T extends object>(famille: "places" | "routes", objet: T): T =>
              Object.fromEntries(
                Object.entries(objet).map(([nom, valeur]) => [
                  nom,
                  typeof valeur !== "function"
                    ? valeur
                    : (...args: unknown[]) => {
                        if (planFini) {
                          refusApresLePlan += 1;
                          throw Object.assign(new Error(`forfait ${famille} épuisé (double)`), { code: "cap_reached" });
                        }
                        return (valeur as (...a: unknown[]) => unknown).apply(objet, args);
                      },
                ]),
              ) as T;
            return { ...d, places: refuser("places", d.places), routes: refuser("routes", d.routes) };
          },
        });
      const fabrique = (): FabriqueGeneration => {
        const base = simulee();
        return {
          ...base,
          finale: (o) => {
            const finale = base.finale(o);
            return {
              ...finale,
              async planifier(entree) {
                const issue = await finale.planifier(entree);
                planFini = true;
                return issue;
              },
            };
          },
        };
      };
      const { etapePlanification } = await import("@/server/generation/etapes");
      const fin = await etapePlanification(progres, { ...dependances(fabrique), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
      const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
      return { fin, compteurs: { ...compteurs }, jours: await jours(org, tripId), run, refusApresLePlan };
    }
    const sans = await etapeE(0);
    const avec = await etapeE(undefined);
    expect(sans.fin.arret).toBeUndefined();
    expect(avec.fin.arret).toBeUndefined();
    expect(avec.compteurs.places).toBe(sans.compteurs.places);
    expect(avec.compteurs.routes).toBe(sans.compteurs.routes);
    expect(avec.compteurs.modeles).toBe(sans.compteurs.modeles);
    // Forfait de fiches et d'éléments Routes épuisé dès la fin du plan : tout appel Google de plus est refusé, et aucun ne part.
    const epuise = await etapeE(undefined, true);
    expect(epuise.fin.arret).toBeUndefined();
    expect(epuise.refusApresLePlan).toBe(0);
    expect(epuise.compteurs.places).toBe(sans.compteurs.places);
    expect(epuise.compteurs.routes).toBe(sans.compteurs.routes);
    expect(epuise.run.phase).not.toBe("failed");
    expect(["ready", "incomplete"]).toContain(epuise.run.phase);
    const etapes = (js: DaySnapshot[]) => js.map((jour) => [jour.index, jour.items.map((item) => (item.type === "stop" ? [item.stop.kind, item.stop.placeId, item.stop.start] : item.type))]);
    expect(etapes(epuise.jours)).toEqual(etapes(sans.jours));
  });

  /**
   * Abandon des idées seules (0105 § 5.1 point 4, bloquant 1 de la revue du head 0b2897a) : un double de la rédaction tient
   * une réserve de modèles réduite, exprimée en lieux par lot ; au-delà, il refuse (`cap_reached`) dès le premier appel. Les
   * idées sont retirées du lot, de la moins bien classée à la mieux classée, jusqu'à ce qu'il passe ; les étapes restent
   * intactes et l'aperçu finit `ready` ou `incomplete`, jamais `failed`. Sans aucune idée, le refus arrête l'étape comme avant.
   */
  it("réserve de modèles réduite : idées abandonnées dans l'ordre, étapes intactes", async () => {
    type Lot = readonly { readonly id: string; readonly nom: string }[];
    async function etapeE(ideesParJour: number | undefined, reserve?: (lot: Lot) => boolean) {
      const org = await createOrg(auth);
      const { tripId, etat } = await lancer(org);
      const progres = await derouler(etat, dependances(), ETAPE_E);
      expect(progres.arret).toBeUndefined();
      const lots: { noms: string[]; refuse: boolean }[] = [];
      const fabrique = (): FabriqueGeneration => {
        const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
        return {
          ...base,
          finale: (o) => {
            const finale = base.finale(o);
            return {
              ...finale,
              async rediger(brief, ville, lieux) {
                const refuse = reserve !== undefined && !reserve(lieux);
                lots.push({ noms: lieux.map((l) => l.nom), refuse });
                if (refuse) return { ok: false as const, code: "cap_reached", retryable: false };
                return finale.rediger(brief, ville, lieux);
              },
            };
          },
        };
      };
      const { etapePlanification } = await import("@/server/generation/etapes");
      const fin = await etapePlanification(progres, { ...dependances(fabrique), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
      const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
      return { fin, lots, jours: await jours(org, tripId).catch(() => [] as DaySnapshot[]), run };
    }
    const etapes = (js: DaySnapshot[]) => js.map((jour) => [jour.index, jour.items.map((item) => (item.type === "stop" ? [item.stop.kind, item.stop.placeId, item.stop.start, item.stop.end, item.stop.reason] : item.type))]);
    const surprises = (js: DaySnapshot[]) => js.flatMap((j) => ((j as { surprise?: { placeId?: string } }).surprise?.placeId === undefined ? [] : [j.index]));

    // Référence : les lots des seules étapes (sans idée), puis les lots avec idées sans refus.
    const sans = await etapeE(0);
    const avec = await etapeE(undefined);
    expect(sans.fin.arret).toBeUndefined();
    expect(avec.fin.arret).toBeUndefined();
    const nomsEtapes = new Set(sans.lots.flatMap((l) => l.noms));
    const ideesDe = (noms: readonly string[]) => noms.filter((nom) => !nomsEtapes.has(nom));
    // Lot unique portant les candidats d'idée (une ville), dans l'ordre de `candidatsDIdees` : du mieux au moins bien classé.
    const lotAvecIdees = avec.lots.find((l) => ideesDe(l.noms).length > 0);
    expect(lotAvecIdees).toBeDefined();
    expect(ideesDe(lotAvecIdees!.noms).length).toBeGreaterThanOrEqual(2);
    expect(surprises(avec.jours)).toEqual([1, 2]);
    // Le premier lot d'un essai porte ses candidats d'idée dans l'ordre de `candidatsDIdees` (le choix exact varie d'un voyage
    // à l'autre : identifiants aléatoires). Quand la réserve n'admet que `garde` idées, chaque nouvel essai retire la dernière
    // (la moins bien classée) ; le lot qui passe garde les `garde` mieux classées, et toutes les étapes.
    const verifierAbandon = (essai: { lots: { noms: string[]; refuse: boolean }[] }, garde: number) => {
      const classees = ideesDe(essai.lots[0]?.noms ?? []);
      expect(classees.length).toBeGreaterThan(garde);
      expect(essai.lots[0]?.refuse).toBe(true);
      const attendus = Array.from({ length: classees.length - garde }, (_, i) => classees.slice(0, classees.length - i));
      expect(essai.lots.filter((l) => l.refuse).map((l) => ideesDe(l.noms))).toEqual(attendus);
      const passes = essai.lots.filter((l) => !l.refuse);
      expect(passes.flatMap((l) => ideesDe(l.noms))).toEqual(classees.slice(0, garde));
      // Les étapes de chaque lot refusé sont toutes reprises dans le lot qui passe.
      for (const refuse of essai.lots.filter((l) => l.refuse)) for (const nom of refuse.noms.filter((n) => nomsEtapes.has(n))) expect(passes.flatMap((l) => l.noms)).toContain(nom);
    };

    // Réserve d'une seule idée : refus dès le premier appel ; les moins bien classées partent une à une, la mieux classée reste.
    const uneIdee = await etapeE(undefined, (lot) => ideesDe(lot.map((l) => l.nom)).length <= 1);
    expect(uneIdee.fin.arret).toBeUndefined();
    verifierAbandon(uneIdee, 1);
    expect(etapes(uneIdee.jours)).toEqual(etapes(sans.jours));
    expect(surprises(uneIdee.jours)).toEqual([1]);
    expect(["ready", "incomplete"]).toContain(uneIdee.run.phase);
    expect(uneIdee.run.stop_reason).toBeNull();

    // Réserve des seules étapes : toutes les idées partent, de la moins bien classée à la mieux classée ; étapes intactes.
    const aucune = await etapeE(undefined, (lot) => ideesDe(lot.map((l) => l.nom)).length === 0);
    expect(aucune.fin.arret).toBeUndefined();
    verifierAbandon(aucune, 0);
    expect(etapes(aucune.jours)).toEqual(etapes(sans.jours));
    expect(surprises(aucune.jours)).toEqual([]);
    expect(["ready", "incomplete"]).toContain(aucune.run.phase);
    expect(aucune.run.stop_reason).toBeNull();

    // Refus qui persiste sans aucune idée : comportement inchangé, l'étape s'arrête sur le code du refus.
    const toujours = await etapeE(undefined, () => false);
    expect(toujours.fin.arret).toBeDefined();
    expect(toujours.lots.at(-1)?.noms.every((nom) => nomsEtapes.has(nom))).toBe(true);
    expect(toujours.run.stop_reason).toBe("cap_reached");
  });
});
