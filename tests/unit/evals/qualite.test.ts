// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { creerCoucheIa } from "@/ai/couche";
import { creerModelesSimules, FixturesModelesSchema, type FixturesModeles } from "@/ai/modeles.simule";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { donneesDe, requeteRaisons } from "@/ai/requetes";
import { bornesSecteurs, cleDeNom, lirePlan, LONGUEURS_INFOS, PLAN_VIDE, type PlanRecherche } from "@/ai/sorties";
import { chercherCandidats, ciblesParSecteur, incontournablesCites, prixParPersonneAdmis } from "@/research/agent";
import { BornesRechercheSchema, type BornesRecherche } from "@/research/bornes";
import { CasEvaluationSchema, type CasEvaluation } from "@/research/evaluation";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule, FixturesPagesSchema, type FixturesPages } from "@/research/pages.simule";
import { creerRechercheSimulee, FixturesRechercheSchema } from "@/research/recherche-web.simule";

/**
 * Jeu d'évaluation hors réseau de l'amendement 3 de `specs/P0-suite-2.md` (P0S2-PO-28), **partie recherche** : plan par
 * secteurs (P0S2-PO-19), un incontournable = un candidat (PO-20), infos pratiques en mémoire (PO-21), compteurs de l'agent
 * (PO-25), répartition des cibles par secteur. Deux cas fabriqués à la main dans `evals/qualite/` (Rome, brief `rome-1`,
 * et `naxos-eval`, destination non monumentale), doubles dans `evals/simule/qualite-*` ; chaque fixture fixe ses propres
 * cibles (`bornes.json`), jamais lues de `recherche.json`. Aucune position, aucune réponse Places ni Routes : la partie
 * moteur (P0S2-PO-22, positions fabriquées) vient avec la tâche suivante (`prototype/fixtures/qualite/`).
 */

const RACINE = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(path.join(RACINE, chemin), "utf8"));

type Fixtures = { modeles: FixturesModeles; recherche: ReturnType<typeof FixturesRechercheSchema.parse>; pages: FixturesPages; bornes: BornesRecherche };
type CandidatFixture = {
  nom: string;
  typeEtape: string;
  categorie: string;
  sourceUrl: string;
  secteur: string | null;
  incontournable: string | null;
  prix?: string;
  horaires?: string;
  conseil?: string;
  prixParPersonne?: number;
};

const CAS = ["rome-1", "naxos-eval"] as const;
const cas = (id: (typeof CAS)[number]): CasEvaluation => CasEvaluationSchema.parse(lireJson(`evals/qualite/${id}.json`));

function fixtures(simulation: string): Fixtures {
  const dossier = `evals/simule/${simulation}`;
  return {
    modeles: FixturesModelesSchema.parse(lireJson(`${dossier}/modeles.json`)),
    recherche: FixturesRechercheSchema.parse(lireJson(`${dossier}/recherche.json`)),
    pages: FixturesPagesSchema.parse(lireJson(`${dossier}/pages.json`)),
    bornes: BornesRechercheSchema.parse(lireJson(`${dossier}/bornes.json`)),
  };
}

const planDe = (f: Fixtures) => f.modeles.plan as PlanRecherche;
const candidatsFixture = (f: Fixtures): CandidatFixture[] =>
  (f.modeles.recherche as { candidats?: CandidatFixture[] }[]).flatMap((tour) => tour.candidats ?? []);
const joursDe = (c: CasEvaluation) => (Date.parse(c.entree.depart) - Date.parse(c.entree.arrivee)) / 86_400_000 + 1;

/** Fait tourner l'agent de production sur un cas, avec les doubles et une mutation facultative des fixtures. */
async function lancer(id: (typeof CAS)[number], muter?: (f: Fixtures) => void) {
  const c = cas(id);
  const f = structuredClone(fixtures(c.simulation));
  muter?.(f);
  const requetes: RequeteModele[] = [];
  const simules = creerModelesSimules(f.modeles);
  const modeles: ClientModeles = {
    envoyer: async (requete) => {
      requetes.push(requete);
      return simules.envoyer(requete);
    },
  };
  const recherche = creerRechercheSimulee(f.recherche);
  const resultat = await chercherCandidats(c.entree, {
    modeles,
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" },
    recherche,
    lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(f.pages.dns), http: creerHttpSimule(f.pages.pages) }),
    bornes: f.bornes,
  });
  return { cas: c, fixtures: f, requetes, ...resultat };
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("réseau interdit dans le jeu d'évaluation");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("qualite: plan par secteurs (P0S2-PO-19)", () => {
  it.each(CAS)("%s : plan conforme, lu en entier, aux bornes de la spécification", (id) => {
    const c = cas(id);
    const f = fixtures(c.simulation);
    const jours = joursDe(c);
    const contexte = { jours, cibleActivites: f.bornes.ciblesParCreneau.activity };
    const lu = lirePlan(JSON.stringify(f.modeles.plan), contexte);
    expect(lu.refuses).toBe(0);
    const plan = lu.valeur;
    const { min, max } = bornesSecteurs(jours);
    expect(plan.secteurs.length).toBeGreaterThanOrEqual(min);
    expect(plan.secteurs.length).toBeLessThanOrEqual(max);
    const noms = new Set(plan.secteurs.map((s) => cleDeNom(s.nom)));
    for (const s of plan.secteurs) for (const v of s.voisins) expect(noms.has(cleDeNom(v)), v).toBe(true);
    expect(plan.secteurs.flatMap((s) => s.incontournables).length).toBeLessThanOrEqual(2 * jours);
    expect(plan.requetes.filter((r) => r.creneau === "event").length).toBeLessThanOrEqual(2);
    for (const s of plan.secteurs) {
      const siennes = plan.requetes.filter((r) => r.secteur !== null && cleDeNom(r.secteur) === cleDeNom(s.nom));
      expect(siennes.length).toBeLessThanOrEqual(3);
      const activite = siennes.findIndex((r) => r.creneau === "activity");
      if (activite !== -1) expect(activite).toBe(0);
    }
    for (const r of plan.requetes) expect(r.secteur === null ? r.creneau === "event" : noms.has(cleDeNom(r.secteur))).toBe(true);
    // P0S2-PO-26 : requêtes du plan ≤ 20 pour ces deux cas.
    expect(plan.requetes.length).toBeLessThanOrEqual(20);
  });

  it("sortie non conforme : refusée en entier (plan vide, comptée une fois), quelle que soit la règle manquée", () => {
    const c = cas("rome-1");
    const f = fixtures(c.simulation);
    const base = planDe(f);
    const contexte = { jours: joursDe(c), cibleActivites: f.bornes.ciblesParCreneau.activity };
    const secteur = (nom: string) => ({ nom, raison: "Un secteur de plus.", voisins: [], incontournables: [] });
    const premier = base.secteurs[0]?.nom ?? "";
    const mutations: [string, PlanRecherche][] = [
      ["trop de secteurs", { ...base, secteurs: [...base.secteurs, secteur("Septième"), secteur("Huitième")] }],
      ["trop peu de secteurs", { ...base, secteurs: base.secteurs.slice(0, 2), requetes: base.requetes.filter((r) => r.secteur === null) }],
      ["voisin inconnu", { ...base, secteurs: base.secteurs.map((s, i) => (i === 0 ? { ...s, voisins: [...s.voisins, "Ailleurs"] } : s)) }],
      ["requête d'un secteur inconnu", { ...base, requetes: [{ requete: "ailleurs", creneau: "meal", secteur: "Ailleurs" }, ...base.requetes] }],
      ["quatrième requête d'un secteur", { ...base, requetes: [{ requete: "encore", creneau: "meal", secteur: premier }, ...base.requetes] }],
      [
        "repas avant les incontournables du secteur",
        {
          ...base,
          requetes: base.requetes.map((r, i, toutes) =>
            r.secteur === "La Rome antique" && r.creneau === "activity" ? (toutes[i + 1] ?? r) : r.secteur === "La Rome antique" && r.creneau === "meal" ? (toutes[i - 1] ?? r) : r,
          ),
        },
      ],
      [
        "trois requêtes d'événements",
        {
          ...base,
          requetes: [
            ...base.requetes,
            { requete: "fêtes", creneau: "event", secteur: null },
            { requete: "concerts", creneau: "event", secteur: null },
          ],
        },
      ],
      ["événement hors fin de liste", { ...base, requetes: [...base.requetes].reverse() }],
      ["événement avec un secteur", { ...base, requetes: base.requetes.map((r) => (r.creneau === "event" ? { ...r, secteur: premier } : r)) }],
      [
        "plus de 2 × jours incontournables",
        { ...base, secteurs: base.secteurs.map((s, i) => (i === 0 ? { ...s, incontournables: ["Premier en trop", "Second en trop"] } : s)) },
      ],
      ["secteurs hors ordre", { ...base, requetes: [...base.requetes.filter((r) => r.secteur === "Trastevere"), ...base.requetes.filter((r) => r.secteur !== "Trastevere")] }],
      ["incontournable en double", { ...base, secteurs: base.secteurs.map((s, i) => (i === 0 ? { ...s, incontournables: ["Colisée"] } : s)) }],
    ];
    for (const [libelle, plan] of mutations) {
      expect(lirePlan(JSON.stringify(plan), contexte), libelle).toEqual({ valeur: PLAN_VIDE, refuses: 1, illisible: true });
    }
    // Plus d'incontournables que la cible d'activités de l'exécution : refusé aussi (10 nommés, cible de 9).
    expect(lirePlan(JSON.stringify(base), { ...contexte, cibleActivites: 9 }).illisible).toBe(true);
    // Forme v1 (requêtes sans secteurs) : refusée en entier.
    expect(lirePlan(JSON.stringify({ requetes: [{ requete: "musées", creneau: "activity" }] }), contexte).illisible).toBe(true);
  });

  it("plan refusé : l'agent part sans plan, compté illisible, aucun secteur ni règle de secteur", async () => {
    const { compteurs, plan, candidats } = await lancer("rome-1", (f) => {
      f.modeles.plan = { requetes: [] };
    });
    expect(compteurs.sortiesIllisibles.plan).toBe(1);
    expect(plan).toEqual(PLAN_VIDE);
    expect(compteurs.qualite).toMatchObject({ secteursPlan: 0, incontournablesPlan: 0, secteurInconnu: 0, candidatRegroupe: 0 });
    // Sans plan, le candidat d'un secteur hors du plan n'est plus écarté sur ce motif.
    expect(candidats.some((candidat) => candidat.nom === "Plage du littoral")).toBe(true);
  });

  it("la requête du plan porte la borne d'incontournables (min(2 × jours, cible d'activités)), jamais un logement", async () => {
    const { requetes } = await lancer("rome-1");
    const plan = requetes.find((r) => r.etape === "plan");
    expect(plan?.prompt).toEqual({ id: "plan", version: 2 });
    expect(donneesDe(plan?.messages.at(-1)?.contenu ?? "")).toMatchObject({ incontournablesMax: 10 });
    expect(JSON.stringify(plan?.messages)).not.toMatch(/logement/i);
  });
});

describe("qualite: un incontournable = un candidat (P0S2-PO-20, sortie de l'agent)", () => {
  it("Rome : chacun des dix incontournables attendus est un candidat propre ; le candidat regroupé est écarté ; le Colisée à billet combiné est gardé", async () => {
    const { cas: c, candidats, infos, compteurs } = await lancer("rome-1");
    const parIncontournable = new Map<string, string[]>();
    for (const candidat of candidats) {
      const incontournable = infos.get(candidat.id)?.incontournable;
      if (incontournable !== undefined) parIncontournable.set(incontournable, [...(parIncontournable.get(incontournable) ?? []), candidat.id]);
    }
    for (const attendu of c.attentes.incontournables) expect(parIncontournable.get(attendu), attendu).toHaveLength(1);
    expect(compteurs.qualite.candidatRegroupe).toBe(1);
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("Balade Panthéon, Trevi et Navone");
    const colisee = candidats.find((candidat) => candidat.nom === "Colisée");
    expect(colisee).toBeDefined();
    expect(infos.get(colisee?.id ?? "")?.prix).toContain("billet combiné");
  });

  it("règle du nom : mots entiers ou mots distinctifs d'un incontournable ; le prix ni le conseil ne sont lus", () => {
    const plan = planDe(fixtures("qualite-rome"));
    expect(incontournablesCites("Balade Panthéon, Trevi et Navone", plan, "Rome")).toEqual(["Panthéon", "Place Navone", "Fontaine de Trevi"]);
    expect(incontournablesCites("Colisée", plan, "Rome")).toEqual(["Colisée"]);
    expect(incontournablesCites("Place du marché", plan, "Rome")).toEqual([]);
    expect(incontournablesCites("Comptoir de la Fontaine", plan, "Rome")).toEqual(["Fontaine de Trevi"]);
    expect(incontournablesCites("Vue du Palatin sur le Forum romain", plan, "Rome")).toEqual(["Forum romain", "Palatin"]);
  });

  it("deux candidats qui désignent le même incontournable : le second est fusionné comme un doublon", async () => {
    const { candidats, compteurs, infos } = await lancer("rome-1", (f) => {
      const tour = (f.modeles.recherche as { candidats: CandidatFixture[] }[]).at(-1);
      const colisee = tour?.candidats.find((candidat) => candidat.nom === "Colisée");
      if (tour !== undefined && colisee !== undefined) tour.candidats.push({ ...colisee, nom: "Amphithéâtre flavien" });
    });
    expect([...infos.values()].filter((info) => info.incontournable === "Colisée")).toHaveLength(1);
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("Amphithéâtre flavien");
    expect(compteurs.candidatsRefuses.duplicate).toBe(1);
  });
});

describe("qualite: incontournable sans candidat avant ancrage (P0S2-PO-20)", () => {
  it.each(CAS)("%s : compteur égal au nombre d'incontournables du plan qu'aucun candidat ne désigne", async (id) => {
    const { compteurs, infos, plan } = await lancer(id);
    const designes = new Set([...infos.values()].flatMap((info) => (info.incontournable === undefined ? [] : [info.incontournable])));
    const attendu = plan.secteurs.flatMap((s) => s.incontournables).filter((nom) => !designes.has(nom)).length;
    expect(compteurs.qualite.incontournableSansCandidat).toBe(attendu);
    expect(attendu).toBe(0);
  });

  it("un incontournable sans candidat (retiré, ou désigné par null) est compté ; aucune donnée d'ancrage n'entre (l'agent n'en reçoit aucune)", async () => {
    const sansPalatin = await lancer("rome-1", (f) => {
      const tour = (f.modeles.recherche as { candidats: CandidatFixture[] }[]).at(-1);
      if (tour !== undefined) tour.candidats = tour.candidats.filter((candidat) => candidat.nom !== "Palatin");
    });
    expect(sansPalatin.compteurs.qualite.incontournableSansCandidat).toBe(1);
    const nonDesigne = await lancer("rome-1", (f) => {
      const tour = (f.modeles.recherche as { candidats: CandidatFixture[] }[]).at(-1);
      for (const candidat of tour?.candidats ?? []) if (candidat.nom === "Palatin") candidat.incontournable = null;
    });
    expect(nonDesigne.compteurs.qualite.incontournableSansCandidat).toBe(1);
    // Incontournable d'un autre secteur : non retenu comme incontournable (champ ramené à null).
    const autreSecteur = await lancer("rome-1", (f) => {
      const tour = (f.modeles.recherche as { candidats: CandidatFixture[] }[]).at(-1);
      for (const candidat of tour?.candidats ?? []) if (candidat.nom === "Palatin") candidat.secteur = "Monti";
    });
    expect(autreSecteur.compteurs.qualite.incontournableSansCandidat).toBe(1);
  });
});

describe("qualite: incontournables sans catégorie codée (partie recherche)", () => {
  it("naxos-eval : plage, point de vue, village et spécialité, hors patrimoine, sont reliés à leur incontournable", async () => {
    const { cas: c, candidats, infos } = await lancer("naxos-eval");
    const relies = candidats.filter((candidat) => infos.get(candidat.id)?.incontournable !== undefined);
    expect(relies.map((candidat) => infos.get(candidat.id)?.incontournable).sort()).toEqual([...c.attentes.incontournables].sort());
    for (const candidat of relies) expect(["heritage", "museum"]).not.toContain(candidat.categorie);
  });

  it.each(CAS)("%s : changer la catégorie des incontournables en heritage, ou en nature, ne change pas leur désignation", async (id) => {
    const designation = (resultat: Awaited<ReturnType<typeof lancer>>) =>
      resultat.candidats.map((candidat) => [candidat.nom, resultat.infos.get(candidat.id)?.incontournable ?? null]);
    const base = await lancer(id);
    for (const categorie of ["heritage", "nature"]) {
      const mute = await lancer(id, (f) => {
        for (const candidat of candidatsFixture(f)) if (candidat.incontournable !== null) candidat.categorie = categorie;
      });
      expect(designation(mute)).toEqual(designation(base));
    }
  });
});

describe("qualite: infos pratiques en mémoire (P0S2-PO-21)", () => {
  it.each(CAS)("%s : chaque incontournable a prix, horaires et conseil quand sa source les donne ; rien d'inventé ; textes bornés", async (id) => {
    const { candidats, infos, fixtures: f, compteurs } = await lancer(id);
    const parNom = new Map(candidatsFixture(f).map((candidat) => [candidat.nom, candidat]));
    const textesSource = new Map<string, string>();
    for (const resultats of Object.values(f.recherche.resultats)) for (const r of resultats) textesSource.set(r.url, `${textesSource.get(r.url) ?? ""} ${r.extrait}`);
    for (const [url, page] of Object.entries(f.pages.pages)) textesSource.set(url, `${textesSource.get(url) ?? ""} ${page.corps}`);
    for (const candidat of candidats) {
      const info = infos.get(candidat.id) ?? {};
      const fixture = parNom.get(candidat.nom);
      expect(fixture, candidat.nom).toBeDefined();
      // Sortie de l'agent égale à ce que la source donne (fixture), champ absent compris.
      expect(info.prix, candidat.nom).toBe(fixture?.prix);
      expect(info.horaires, candidat.nom).toBe(fixture?.horaires);
      expect(info.conseil, candidat.nom).toBe(fixture?.conseil);
      if (info.incontournable !== undefined) expect(info.prix ?? info.horaires, candidat.nom).toBeDefined();
      // Rien d'inventé : chaque nombre des horaires figure dans le texte de la source (page lue ou extrait).
      for (const nombre of info.horaires?.match(/\d+/g) ?? []) expect(textesSource.get(candidat.source.url) ?? "", `${candidat.nom} : ${nombre}`).toContain(nombre);
      expect((info.prix ?? "").length).toBeLessThanOrEqual(LONGUEURS_INFOS.prix);
      expect((info.horaires ?? "").length).toBeLessThanOrEqual(LONGUEURS_INFOS.horaires);
      expect((info.conseil ?? "").length).toBeLessThanOrEqual(LONGUEURS_INFOS.conseil);
      for (const texte of [info.prix, info.horaires, info.conseil]) expect(texte ?? "").not.toMatch(/https?:|www\.|[<>]/);
    }
    // Aucune lecture de page de plus que les lectures demandées par le modèle (aucune lecture pour les infos pratiques).
    const lectures = (f.modeles.recherche as { actions?: { type: string }[] }[]).flatMap((tour) => tour.actions ?? []).filter((a) => a.type === "lire").length;
    expect(compteurs.pagesLues).toBe(lectures);
  });

  it("Rome : la page sans horaires donne un candidat sans horaires ; prixParPersonne seulement en CHF (texte de prix exigé), 0 pour « gratuit »", async () => {
    const { candidats, infos } = await lancer("rome-1");
    const par = (nom: string) => candidats.find((candidat) => candidat.nom === nom);
    expect(infos.get(par("Place Navone")?.id ?? "")?.horaires).toBeUndefined();
    expect(par("Place Navone")?.prixParPersonne).toBe(0);
    expect(par("Colisée")?.prixParPersonne).toBeUndefined();
    expect(par("Panthéon")?.prixParPersonne).toBeUndefined();
    expect(par("Musées du Vatican")?.prixParPersonne).toBeUndefined();
    expect(par("Fontaine de Trevi")?.prixParPersonne).toBe(0);
    expect(prixParPersonneAdmis({ prix: "12 CHF", prixParPersonne: 12 })).toBe(12);
    expect(prixParPersonneAdmis({ prix: "CHF 8.50", prixParPersonne: 8.5 })).toBe(8.5);
    expect(prixParPersonneAdmis({ prix: "15 €", prixParPersonne: 15 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prix: "gratuit", prixParPersonne: 0 })).toBe(0);
    // Correction 1 (bloquant 1) : un montant sans texte de prix en CHF est retiré ; un 0 contredit par le texte aussi.
    expect(prixParPersonneAdmis({ prixParPersonne: 20 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prix: "18 € (≈ 17 CHF)", prixParPersonne: 17 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prix: "5000 francs CFA", prixParPersonne: 8 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prix: "12 fr. par personne", prixParPersonne: 12 })).toBe(12);
    expect(prixParPersonneAdmis({ prix: "fr. 9.50", prixParPersonne: 9.5 })).toBe(9.5);
    expect(prixParPersonneAdmis({ prix: "20 francs suisses", prixParPersonne: 20 })).toBe(20);
    // Correction 2 (bloquant 1) : un 0 sans texte de prix est retiré (absent, jamais deviné).
    expect(prixParPersonneAdmis({ prixParPersonne: 0 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prix: "free entry", prixParPersonne: 0 })).toBe(0);
    expect(prixParPersonneAdmis({ prix: "15 €", prixParPersonne: 0 })).toBeUndefined();
    expect(prixParPersonneAdmis({ prixParPersonne: undefined })).toBeUndefined();
  });

  it("le 0 n'est gardé que si le texte de prix dit l'entrée gratuite, sans négation, chiffre ni devise (correction 2)", () => {
    for (const prix of ["gratuit", "Entrée gratuite", "entrée libre", "visite offerte", "gratis", "Free entry"]) {
      expect(prixParPersonneAdmis({ prix, prixParPersonne: 0 }), prix).toBe(0);
    }
    for (const prix of ["non gratuit", "pas gratuit", "n'est pas gratuite", "not free", "free cancellation, 45 CHF", "gratuit enfants, 15 CHF adultes", "gratuit le premier dimanche, sinon 12 €", "payant"]) {
      expect(prixParPersonneAdmis({ prix, prixParPersonne: 0 }), prix).toBeUndefined();
    }
  });

  it("un montant en CHF accompagné d'une autre devise est retiré (correction 2, mineur 6)", () => {
    for (const prix of ["12 CHF (≈ 13 CAD)", "12 CHF ou 1500 JPY", "CHF 20 / 180 kr", "12 CHF (13 dollars)", "12 CHF (≈ 11 £)", "12 CHF, 1000 ₹"]) {
      expect(prixParPersonneAdmis({ prix, prixParPersonne: 12 }), prix).toBeUndefined();
    }
    expect(prixParPersonneAdmis({ prix: "12 CHF, réservation conseillée", prixParPersonne: 12 })).toBe(12);
  });

  it("un texte d'info pratique trop long ou avec une URL fait écarter le candidat (compté), jamais tronquer", async () => {
    const { candidats, compteurs } = await lancer("rome-1", (f) => {
      for (const candidat of candidatsFixture(f)) {
        if (candidat.nom === "Panthéon") candidat.conseil = "x".repeat(LONGUEURS_INFOS.conseil + 1);
        if (candidat.nom === "Palatin") candidat.horaires = "voir www.site-fabrique.example";
      }
    });
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("Panthéon");
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("Palatin");
    expect(compteurs.sortiesRefusees.recherche).toBe(2);
  });
});

describe("qualite: secteur de chaque candidat (P0S2-PO-20)", () => {
  it("Rome : un lieu hors des secteurs du plan est écarté et compté ; l'événement sans secteur est gardé ; chaque lieu porte un nom de secteur du plan", async () => {
    const { candidats, infos, compteurs, plan } = await lancer("rome-1");
    expect(compteurs.qualite.secteurInconnu).toBe(1);
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("Plage du littoral");
    const evenement = candidats.find((candidat) => candidat.typeEtape === "event");
    expect(evenement).toBeDefined();
    expect(infos.get(evenement?.id ?? "")?.secteur).toBeUndefined();
    const noms = plan.secteurs.map((s) => s.nom);
    for (const candidat of candidats.filter((c) => c.typeEtape !== "event")) expect(noms).toContain(infos.get(candidat.id)?.secteur);
  });

  it("secteur écrit autrement (casse, accents) : ramené au nom exact du plan", async () => {
    const { candidats, infos } = await lancer("rome-1", (f) => {
      for (const candidat of candidatsFixture(f)) if (candidat.nom === "Colisée") candidat.secteur = "la rome ANTIQUE";
    });
    expect(infos.get(candidats.find((c) => c.nom === "Colisée")?.id ?? "")?.secteur).toBe("La Rome antique");
  });
});

describe("qualite: totaux de la PR 490 répartis par secteur", () => {
  it.each(CAS)("%s : somme des cibles par secteur égale à la cible de l'exécution par créneau ; d'abord un candidat par incontournable", (id) => {
    const f = fixtures(cas(id).simulation);
    const plan = planDe(f);
    for (const cibles of [f.bornes.ciblesParCreneau, { activity: 3, meal: 2, evening: 1 }, { activity: 40, meal: 30, evening: 9 }, { activity: 0, meal: 0, evening: 1 }]) {
      const reparties = ciblesParSecteur(plan, cibles);
      expect(reparties.map((r) => r.nom)).toEqual(plan.secteurs.map((s) => s.nom));
      for (const creneau of ["activity", "meal", "evening"] as const) {
        expect(reparties.reduce((total, r) => total + r.cibles[creneau], 0), creneau).toBe(cibles[creneau]);
      }
      const incontournables = plan.secteurs.reduce((total, s) => total + s.incontournables.length, 0);
      if (cibles.activity >= incontournables) {
        for (const [i, s] of plan.secteurs.entries()) expect(reparties[i]?.cibles.activity ?? 0).toBeGreaterThanOrEqual(s.incontournables.length);
      }
      if (cibles.meal >= 2 * plan.secteurs.length) for (const r of reparties) expect(r.cibles.meal).toBeGreaterThanOrEqual(2);
      if (cibles.evening >= plan.secteurs.length) for (const r of reparties) expect(r.cibles.evening).toBeGreaterThanOrEqual(1);
    }
    expect(ciblesParSecteur(PLAN_VIDE, f.bornes.ciblesParCreneau)).toEqual([]);
  });

  it("incontournables plus nombreux que la cible d'activités : un par incontournable dans l'ordre du plan, jusqu'à la cible", () => {
    const plan = planDe(fixtures("qualite-rome"));
    const reparties = ciblesParSecteur(plan, { activity: 4, meal: 12, evening: 6 });
    // Ordre du plan : Monti (aucun), La Rome antique (3), Centre historique (2) : 3 puis 1.
    expect(reparties.map((r) => r.cibles.activity)).toEqual([0, 3, 1, 0, 0, 0]);
    expect(reparties.map((r) => r.cibles.meal)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(reparties.map((r) => r.cibles.evening)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("noms en écriture non latine : clés non vides, plan lu (réserve Sécurité 15)", () => {
    expect(cleDeNom("東京駅")).not.toBe("");
    const secteurs = ["浅草", "銀座", "新宿"].map((nom, i, tous) => ({ nom, raison: "Un secteur.", voisins: [tous[(i + 1) % 3] as string], incontournables: [`${nom}寺`] }));
    const requetes = secteurs.map((s) => ({ requete: `${s.nom} 観光`, creneau: "activity", secteur: s.nom }));
    expect(lirePlan(JSON.stringify({ secteurs, requetes }), { jours: 5 }).refuses).toBe(0);
    expect(cleDeNom("Château d'Ô")).toBe("chateau d o");
  });

  it("clé de nom : marques porteuses de sens gardées, NFKC, lettres sans décomposition, symboles (correction 2)", () => {
    expect(cleDeNom("ガイド")).not.toBe(cleDeNom("カイド"));
    expect(cleDeNom("ガイド")).toBe(cleDeNom("ｶﾞｲﾄﾞ"));
    expect(cleDeNom("नमस्ते")).not.toBe(cleDeNom("नमसत"));
    expect(cleDeNom("Αθήνα")).toBe("αθηνα");
    expect(cleDeNom("Łódź")).toBe("łodz");
    expect(cleDeNom("ＡＢＣ ﬁn")).toBe("abc fin");
    expect(cleDeNom("★ ✦ !")).toBe("");
  });

  it("un candidat au nom fait seulement de symboles est écarté (invalid), jamais pris pour un doublon (correction 2)", async () => {
    const { candidats, compteurs } = await lancer("rome-1", (f) => {
      const tour = candidatsFixture(f)[0];
      if (tour !== undefined) tour.nom = "★★★";
    });
    expect(candidats.map((candidat) => candidat.nom)).not.toContain("★★★");
    expect(compteurs.candidatsRefuses.invalid).toBeGreaterThanOrEqual(1);
    expect(compteurs.candidatsRefuses.duplicate).toBe(0);
  });

  it("écriture sans espaces : un nom qui réunit deux incontournables est détecté (correction 2, mineur 5)", () => {
    const plan: PlanRecherche = {
      secteurs: [{ nom: "浅草", raison: "Un secteur.", voisins: [], incontournables: ["浅草寺", "雷門"] }],
      requetes: [],
    };
    expect(incontournablesCites("浅草寺と雷門めぐり", plan, "東京")).toEqual(["浅草寺", "雷門"]);
    expect(incontournablesCites("浅草寺", plan, "東京")).toEqual(["浅草寺"]);
  });

  it("chaque tour reçoit ce qui manque par secteur, incontournables sans candidat compris (noms du plan seulement)", async () => {
    const { requetes, plan } = await lancer("rome-1");
    const premier = requetes.find((r) => r.etape === "recherche");
    const donnees = donneesDe(premier?.messages.at(-1)?.contenu ?? "") as { secteurs: { nom: string; incontournablesSansCandidat: string[] }[] };
    expect(donnees.secteurs.map((s) => s.nom)).toEqual(plan.secteurs.map((s) => s.nom));
    expect(donnees.secteurs.flatMap((s) => s.incontournablesSansCandidat)).toEqual(plan.secteurs.flatMap((s) => s.incontournables));
  });
});

describe("qualite: compteurs de l'agent (P0S2-PO-25, partie recherche)", () => {
  it("Rome : secteurs, incontournables, sans candidat, regroupés, secteurs inconnus ; des nombres, aucun nom", async () => {
    const { compteurs, plan, candidats } = await lancer("rome-1");
    expect(compteurs.qualite).toEqual({ secteursPlan: 6, incontournablesPlan: 10, incontournableSansCandidat: 0, candidatRegroupe: 1, secteurInconnu: 1 });
    const texte = JSON.stringify(compteurs);
    for (const nom of [...plan.secteurs.map((s) => s.nom), ...plan.secteurs.flatMap((s) => s.incontournables), ...candidats.map((c) => c.nom)]) {
      expect(texte.includes(nom), nom).toBe(false);
    }
  });
});

describe("qualite: raisons v2 (P0S2-PO-21)", () => {
  it("le prompt raisons reçoit le secteur et la qualité d'incontournable, jamais prix, horaires ni conseil", async () => {
    const { candidats, infos } = await lancer("rome-1");
    const colisee = candidats.find((c) => c.nom === "Colisée");
    const info = infos.get(colisee?.id ?? "");
    expect(PROMPT_RAISONS.version).toBe(2);
    const lieu = {
      id: colisee?.id ?? "",
      nom: colisee?.nom ?? "",
      resume: colisee?.resume ?? "",
      categorie: colisee?.categorie ?? "heritage",
      typeEtape: colisee?.typeEtape ?? "activity",
      sourceDomaine: new URL(colisee?.source.url ?? "https://x.example").hostname,
      ...(info?.secteur === undefined ? {} : { secteur: info.secteur }),
      incontournable: true as const,
    };
    const requete = requeteRaisons(cas("rome-1").entree, [lieu], "fournisseur/raisons-test", { data_collection: "deny" });
    const donnees = donneesDe(requete.messages.at(-1)?.contenu ?? "") as { lieux: Record<string, unknown>[] };
    expect(donnees.lieux[0]).toMatchObject({ secteur: "La Rome antique", incontournable: true });
    const texte = JSON.stringify(requete.messages);
    for (const champ of [info?.prix, info?.horaires, info?.conseil]) expect(texte.includes(champ ?? "§"), champ).toBe(false);
    // La couche IA accepte ces deux champs (entrée validée en strict).
    const couche = creerCoucheIa({
      modeles: creerModelesSimules(fixtures("qualite-rome").modeles),
      reglages: Object.fromEntries(["structuration", "quartier", "plan", "notation", "raisons"].map((e) => [e, { modele: "fournisseur/test", routage: { data_collection: "deny" } }])) as never,
    });
    expect((await couche.rediger({ entree: cas("rome-1").entree, lieux: [lieu] })).ok).toBe(true);
  });
});
