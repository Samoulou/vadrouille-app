// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contientUrl, LONGUEURS_TEXTE, texteMaison } from "@/ai/candidat";
import { CHAMPS_ENRICHIS_TOLERANTS, couperTexte, LONGUEURS_INFOS, LONGUEURS_PLAN, lireTour } from "@/ai/sorties";
import type { Brief } from "@/prototype/brief";
import * as originalCandidat from "@/prototype/candidat";
import { ConfigRechercheSchema } from "@/prototype/config";

import { chercherCandidatsP0 } from "./agent-p0";

/**
 * Ticket 595 (décision 0111) : à l'essai réel de Rome du 2026-10-20, `turnRefused` 13 pour 4 candidats. Un seul champ
 * facultatif d'enrichissement invalide (`prix`, `horaires`, `conseil`, `secteur`, `incontournable`, `prixParPersonne`,
 * `dureeMinutes`, `slotFit`) ou une clé inconnue faisait écarter tout le lieu. Le champ est désormais retiré seul (la clé
 * inconnue ignorée), le lieu gardé, le texte refusé jamais recopié ; les champs obligatoires et `evenement` restent
 * stricts. Décision de Samuel du 2026-10-20 (21:33 UTC) : un texte trop long, nom et résumé compris, est coupé à sa
 * longueur maximale au lieu d'être refusé ; URL, domaines et caractères interdits restent refusés. Mode simulé seulement.
 */

const URL_SOURCE = "https://guide.example/chateau";
const SENTINELLE = "SENTINELLE_595";
const CANDIDAT = {
  nom: "Château maison",
  resume: "Un château écrit par nous.",
  categorie: "heritage",
  typeEtape: "activity",
  sourceUrl: URL_SOURCE,
  sourceDate: "2026-09-01",
  aReserver: true,
  secteur: "Vieille ville",
  incontournable: "Château",
  prix: "20 £",
  horaires: "9 h 30 – 18 h",
  conseil: "Réserver le billet à l'avance.",
  prixParPersonne: 0,
  dureeMinutes: 90,
  slotFit: ["activity"],
};
const tour = (candidats: unknown[]) => JSON.stringify({ actions: [], candidats, termine: false });
const lu = (candidat: Record<string, unknown>) => lireTour(tour([candidat]));

/**
 * Valeurs invalides par champ tolérant : caractère interdit (saut de ligne, balise, invisible), URL ou domaine (y compris
 * placé au-delà de la longueur de coupe), vide, forme. Un texte seulement trop long n'est plus invalide : il est coupé.
 */
const INVALIDES: Record<(typeof CHAMPS_ENRICHIS_TOLERANTS)[number], unknown[]> = {
  secteur: [`Vieille\nville ${SENTINELLE}`, "", 3],
  incontournable: [`<b>${SENTINELLE}</b>`, ""],
  prix: [`${"x ".repeat(LONGUEURS_INFOS.prix)}${SENTINELLE} exemple.com`, `20 £ ${SENTINELLE} edinburghcastle.scot`, "", null, 20],
  horaires: [`lun.-ven. 9 h – 18 h\nsam. ${SENTINELLE}`, "​", false],
  conseil: [`${"Réserver tôt. ".repeat(20)}voir www.${SENTINELLE}`, `Réserver sur https://billets.example ${SENTINELLE}`, `voir www.${SENTINELLE}`],
  prixParPersonne: [-1, 1001, "20", Number.MAX_VALUE * 10],
  dureeMinutes: [10, 601, 90.5, "90"],
  slotFit: [[], ["brunch"], ["activity", "activity"], "activity"],
};

describe("ia: champs d'enrichissement tolérants (ticket 595)", () => {
  it("candidat complet et valide : gardé tel quel, aucun champ retiré", () => {
    const { valeur, refuses, champsRetires } = lu(CANDIDAT);
    expect(valeur.candidats).toEqual([CANDIDAT]);
    expect(refuses).toBe(0);
    expect(champsRetires).toBe(0);
  });

  it.each(Object.entries(INVALIDES))("%s invalide : retiré seul, le lieu est gardé, le texte refusé n'est jamais recopié", (champ, valeurs) => {
    for (const invalide of valeurs) {
      const { valeur, refuses, champsRetires } = lu({ ...CANDIDAT, [champ]: invalide });
      expect(refuses, String(invalide)).toBe(0);
      expect(champsRetires, String(invalide)).toBe(1);
      expect(valeur.candidats, String(invalide)).toHaveLength(1);
      const garde = valeur.candidats[0] as Record<string, unknown>;
      expect(garde[champ], String(invalide)).toBeUndefined();
      // Les autres champs sont gardés tels quels.
      const reste = Object.fromEntries(Object.entries(CANDIDAT).filter(([cle]) => cle !== champ));
      expect(garde, String(invalide)).toMatchObject(reste);
      expect(JSON.stringify(valeur), String(invalide)).not.toContain(SENTINELLE);
    }
  });

  it("plusieurs champs invalides dans un lieu, et dans plusieurs lieux : tous retirés et comptés, les lieux gardés", () => {
    const { valeur, refuses, champsRetires } = lireTour(
      tour([
        { ...CANDIDAT, prix: "a<b", horaires: "a\nb", conseil: "voir exemple.com" },
        { ...CANDIDAT, nom: "Autre lieu", incontournable: "" },
      ]),
    );
    expect(refuses).toBe(0);
    expect(champsRetires).toBe(4);
    expect(valeur.candidats.map((c) => c.nom)).toEqual(["Château maison", "Autre lieu"]);
  });

  it("textes trop longs, nom et résumé compris : coupés à leur longueur maximale, sur une fin de mot, comptés ; le lieu gardé", () => {
    const longs = {
      nom: `Château ${"fort ".repeat(30)}`,
      resume: `${"Un château écrit par nous. ".repeat(20)}`,
      secteur: `Vieille ville ${"haute ".repeat(15)}`,
      incontournable: `Château ${"royal ".repeat(20)}`,
      prix: `20 £ ${"adulte ".repeat(15)}`,
      horaires: `${"9 h 30 – 18 h, ".repeat(12)}`,
      conseil: `${"Réserver le billet à l'avance. ".repeat(8)}`,
    };
    const bornes = new Map<string, number>([
      ["nom", LONGUEURS_TEXTE.nom],
      ["resume", LONGUEURS_TEXTE.resume],
      ["secteur", LONGUEURS_PLAN.secteur],
      ["incontournable", LONGUEURS_PLAN.incontournable],
      ["prix", LONGUEURS_INFOS.prix],
      ["horaires", LONGUEURS_INFOS.horaires],
      ["conseil", LONGUEURS_INFOS.conseil],
    ]);
    const { valeur, refuses, champsRetires, textesCoupes } = lu({ ...CANDIDAT, ...longs });
    expect(refuses).toBe(0);
    expect(champsRetires).toBe(0);
    expect(textesCoupes).toBe(7);
    const garde = valeur.candidats[0] as unknown as Record<string, string>;
    for (const [champ, texte] of Object.entries(longs)) {
      const max = bornes.get(champ) ?? 0;
      expect(texte.length, champ).toBeGreaterThan(max);
      expect(garde[champ]?.length, champ).toBeLessThanOrEqual(max);
      // Coupe sur une fin de mot : le texte gardé est un début du texte brut suivi, dans le brut, d'une espace.
      expect(texte.startsWith(garde[champ] ?? "?"), champ).toBe(true);
      expect(/\s/.test(texte.charAt(garde[champ]?.length ?? 0)), champ).toBe(true);
      expect(garde[champ], champ).toBe(garde[champ]?.trimEnd());
    }
  });

  it("texte assez court : jamais coupé ni compté", () => {
    expect(lu(CANDIDAT)).toMatchObject({ refuses: 0, textesCoupes: 0 });
    expect(lu({ ...CANDIDAT, prix: "x".repeat(LONGUEURS_INFOS.prix) })).toMatchObject({ refuses: 0, textesCoupes: 0, champsRetires: 0 });
  });

  it("couperTexte : à la borne exacte, sans couper un caractère (paire de substitution, lettre et sa marque), fin de mot de préférence", () => {
    expect(couperTexte("abc", 3)).toBe("abc");
    expect(couperTexte("abcd", 3)).toBe("abc");
    expect(couperTexte("un deux trois", 9)).toBe("un deux");
    expect(couperTexte("un deux trois", 7)).toBe("un deux");
    // Aucune espace dans la seconde moitié : coupe à la borne.
    expect(couperTexte("a motlongsansespace", 10)).toBe("a motlongs");
    // Emoji (deux unités) : jamais coupé en deux.
    expect(couperTexte("ab😀cd", 3)).toBe("ab");
    // « é » décomposé (e + marque) : jamais séparé de sa marque.
    expect(couperTexte("abe\u0301cd", 3)).toBe("ab");
    for (const [texte, max] of [["x".repeat(500), 60], ["😀".repeat(100), 81], ["mot ".repeat(100), 160]] as const) {
      const coupe = couperTexte(texte, max);
      expect(coupe.length).toBeLessThanOrEqual(max);
      expect(coupe.length).toBeGreaterThan(0);
      expect(texte.startsWith(coupe)).toBe(true);
      expect(/[\uD800-\uDBFF]$/.test(coupe)).toBe(false);
    }
  });

  it("URL, domaine ou caractère interdit au-delà de la longueur de coupe : le texte est quand même refusé (vérifié sur le texte entier)", () => {
    // Le nom (obligatoire) avec un domaine après la borne : lieu écarté, jamais un domaine tronqué gardé.
    const nom = `${"Château ".repeat(11)}exemple.com`;
    expect(nom.indexOf("exemple")).toBeGreaterThan(LONGUEURS_TEXTE.nom);
    expect(lu({ ...CANDIDAT, nom })).toMatchObject({ refuses: 1, textesCoupes: 0 });
    expect(lu({ ...CANDIDAT, resume: `${"Un château. ".repeat(30)}<script>` })).toMatchObject({ refuses: 1 });
    // Un domaine coupé en « exemple.c » ne doit pas passer : refusé avant la coupe.
    const conseil = `${"x".repeat(LONGUEURS_INFOS.conseil - 9)} exemple.com`;
    const lecture = lu({ ...CANDIDAT, conseil });
    expect(lecture).toMatchObject({ refuses: 0, champsRetires: 1, textesCoupes: 0 });
    expect(lecture.valeur.candidats[0]?.conseil).toBeUndefined();
  });

  it("coupe qui fait apparaître un domaine (« foo.commerce » → « foo.com ») : échec fermé, champ retiré ou lieu écarté", () => {
    const conseil = `${"x".repeat(LONGUEURS_INFOS.conseil - 5)}a.commerce`;
    expect(contientUrl(conseil)).toBe(false);
    expect(contientUrl(conseil.slice(0, LONGUEURS_INFOS.conseil))).toBe(true);
    const lecture = lu({ ...CANDIDAT, conseil });
    expect(lecture).toMatchObject({ refuses: 0, champsRetires: 1 });
    expect(lecture.valeur.candidats[0]?.conseil).toBeUndefined();
    expect(lu({ ...CANDIDAT, nom: `${"x".repeat(LONGUEURS_TEXTE.nom - 5)}a.commerce` })).toMatchObject({ refuses: 1 });
  });

  it("graphème géant (lettre suivie de milliers de marques) : la coupe ne laisse rien, champ retiré ou lieu écarté, sans le recopier", () => {
    const geant = `e${"\u0301".repeat(5000)}`;
    expect(couperTexte(geant, LONGUEURS_INFOS.conseil)).toBe("");
    const lecture = lu({ ...CANDIDAT, conseil: geant });
    expect(lecture).toMatchObject({ refuses: 0, champsRetires: 1 });
    expect(lecture.valeur.candidats[0]?.conseil).toBeUndefined();
    expect(lu({ ...CANDIDAT, nom: geant })).toMatchObject({ refuses: 1 });
  });

  it("textesCoupes : une valeur assez courte n'est jamais comptée, même avec des espaces de fin", () => {
    expect(lu({ ...CANDIDAT, prix: "20 £   " })).toMatchObject({ refuses: 0, textesCoupes: 0, champsRetires: 0 });
  });

  it("champ absent ou null admis : rien n'est compté comme retiré", () => {
    const facultatifs = new Set(["prix", "horaires", "conseil", "prixParPersonne", "dureeMinutes", "slotFit"]);
    const minimal = Object.fromEntries(Object.entries(CANDIDAT).filter(([cle]) => !facultatifs.has(cle)));
    expect(lu(minimal)).toMatchObject({ refuses: 0, champsRetires: 0 });
    expect(lu({ ...CANDIDAT, secteur: null, incontournable: null })).toMatchObject({ refuses: 0, champsRetires: 0 });
  });

  it("clés inconnues (un placeId proposé, une consigne) : ignorées, jamais recopiées, comptées ; le lieu gardé", () => {
    const { valeur, refuses, champsRetires } = lu({ ...CANDIDAT, placeId: `ChIJ${SENTINELLE}`, instructions: SENTINELLE, prix: "a\tb" });
    expect(refuses).toBe(0);
    expect(champsRetires).toBe(3);
    expect(valeur.candidats).toHaveLength(1);
    expect(valeur.candidats[0]).not.toHaveProperty("placeId");
    expect(valeur.candidats[0]).not.toHaveProperty("instructions");
    expect(JSON.stringify(valeur)).not.toContain(SENTINELLE);
  });

  it("evenement avec clé en trop : toujours strict, le lieu est écarté", () => {
    expect(lu({ ...CANDIDAT, typeEtape: "event", evenement: { date: "2026-11-02", lieu: SENTINELLE } })).toMatchObject({ refuses: 1, champsRetires: 0 });
  });

  it("champs obligatoires et evenement invalides : toujours stricts, le lieu entier est écarté et compté", () => {
    const refuses: Record<string, unknown>[] = [
      { ...CANDIDAT, nom: "" },
      { ...CANDIDAT, nom: undefined },
      { ...CANDIDAT, resume: "   " },
      { ...CANDIDAT, nom: `Lieu https://x.example` },
      { ...CANDIDAT, resume: "a\nb" },
      { ...CANDIDAT, categorie: "church" },
      { ...CANDIDAT, typeEtape: "evening" },
      { ...CANDIDAT, sourceDate: null },
      { ...CANDIDAT, sourceDate: "2026-09" },
      { ...CANDIDAT, aReserver: "oui" },
      { ...CANDIDAT, sourceUrl: "" },
      { ...CANDIDAT, evenement: { date: "2026-11-02", heure: "21h" } },
    ];
    for (const candidat of refuses) {
      const lecture = lu(candidat);
      expect(lecture.valeur.candidats, JSON.stringify(candidat)).toHaveLength(0);
      expect(lecture.refuses, JSON.stringify(candidat)).toBe(1);
      expect(lecture.champsRetires).toBe(0);
    }
  });

  it("réponse illisible : aucun compteur de champs retirés (forme inchangée)", () => {
    expect(lireTour("{}")).toEqual({ valeur: { actions: [], candidats: [], termine: false }, refuses: 1, illisible: true });
  });
});

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const brief = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche-essai.json"), "utf8")));
const SECTEURS = [
  { nom: "Vieille ville", raison: "Un secteur maison.", voisins: [], incontournables: ["Château"] },
  { nom: "Ville neuve", raison: "Un secteur maison.", voisins: [], incontournables: [] },
  { nom: "Port", raison: "Un secteur maison.", voisins: [], incontournables: [] },
];
const PLAN = JSON.stringify({ secteurs: SECTEURS, requetes: [{ requete: "château Édimbourg", creneau: "activity", secteur: "Vieille ville" }] });
const RECHERCHER = JSON.stringify({ actions: [{ type: "rechercher", requete: "château Édimbourg" }], candidats: [], termine: false });

async function rejouer(candidats: unknown[]) {
  const reponses = [PLAN, RECHERCHER, JSON.stringify({ actions: [], candidats, termine: true })];
  return chercherCandidatsP0(brief, {
    modeles: { envoyer: async () => ({ texte: reponses.shift() ?? JSON.stringify({ actions: [], candidats: [], termine: true }), coutUsd: 0 }) },
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" },
    recherche: { rechercher: async () => ({ resultats: [{ url: URL_SOURCE, titre: "Château", extrait: "Extrait." }], coutUsd: 0 }) },
    lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
    config,
  });
}

/** Formes que `contientUrl` doit refuser : la réécriture linéaire des motifs (revue de #597) n'affaiblit rien. */
const AVEC_URL = [
  "https://exemple.org/page",
  "voir ftp://serveur",
  "svn+ssh://depot",
  "x-y.z://a",
  "www.exemple",
  "javascript:alert(1)",
  "mailto:a",
  "data:text/html",
  "file:///etc",
  "exemple.com",
  "a.b.c.co.uk",
  "chateau-fort.scot",
  "musee.fr.",
  "guide.example",
  "Voir EXEMPLE.COM demain",
];
const SANS_URL = ["Château maison", "9 h 30 – 18 h", "20 £ adulte", "Réserver tôt.", "foo.commerce", "a.b", "M. Dupont", "fr", "com"];
const TAILLE_REPONSE = 256 * 1024;

describe("ia: contientUrl linéaire (revue de la PR 597, décision 0111 § 6)", () => {
  it("URL et domaines toujours détectés, textes ordinaires admis, même verdict des deux copies", () => {
    for (const texte of AVEC_URL) {
      expect(contientUrl(texte), texte).toBe(true);
      expect(originalCandidat.contientUrl(texte), texte).toBe(true);
    }
    for (const texte of SANS_URL) {
      expect(contientUrl(texte), texte).toBe(false);
      expect(originalCandidat.contientUrl(texte), texte).toBe(false);
    }
  });

  it.each(["a-", "a.", "a", "a+", "a-a.", "1.a-"])("texte de 256 Ki en « %s » répété : contrôle en temps linéaire (texte entier avant la coupe)", (motif) => {
    const texte = motif.repeat(Math.ceil(TAILLE_REPONSE / motif.length)).slice(0, TAILLE_REPONSE);
    const debut = performance.now();
    expect(contientUrl(texte)).toBe(false);
    expect(originalCandidat.contientUrl(texte)).toBe(false);
    expect(texteMaison(Number.MAX_SAFE_INTEGER).safeParse(texte).success).toBe(true);
    expect(originalCandidat.texteMaison(Number.MAX_SAFE_INTEGER).safeParse(texte).success).toBe(true);
    // Chemin complet : un nom presque aussi long que la réponse admise (`LONGUEUR_REPONSE_MAX`), contrôlé entier puis
    // coupé à sa borne (le lieu est gardé).
    expect(lu({ ...CANDIDAT, nom: texte.slice(0, TAILLE_REPONSE - 2048) })).toMatchObject({ refuses: 0, textesCoupes: 1 });
    // Avant la réécriture : ~9 s mesurées pour 80 000 caractères, ~90 s extrapolées pour 256 Ki.
    expect(performance.now() - debut).toBeLessThan(2000);
  });
});

describe("ia: agent de recherche, champs d'enrichissement retirés (ticket 595)", () => {
  it("clé inconnue placeId : ignorée par l'agent aussi, jamais dans le candidat admis", async () => {
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, placeId: `ChIJ${SENTINELLE}` }]);
    expect(candidats).toHaveLength(1);
    expect(JSON.stringify(candidats)).not.toContain(SENTINELLE);
    expect(compteurs.champsRetires).toBe(1);
  });

  it("horaires avec saut de ligne et conseil avec URL : le lieu est admis sans eux, résumé trop long coupé, comptés, aucun refus", async () => {
    const resume = `${"Un château écrit par nous. ".repeat(20)}`;
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, resume, horaires: `9 h – 18 h\n${SENTINELLE}`, conseil: `voir exemple.com ${SENTINELLE}` }]);
    expect(candidats).toHaveLength(1);
    expect(candidats[0]).toMatchObject({ nom: "Château maison", secteur: "Vieille ville", incontournable: "Château", prix: "20 £" });
    expect(candidats[0]?.resume.length).toBeLessThanOrEqual(LONGUEURS_TEXTE.resume);
    expect(candidats[0]).not.toHaveProperty("horaires");
    expect(candidats[0]).not.toHaveProperty("conseil");
    expect(JSON.stringify(candidats)).not.toContain(SENTINELLE);
    expect(compteurs.champsRetires).toBe(2);
    expect(compteurs.textesCoupes).toBe(1);
    expect(compteurs.sortiesRefusees.recherche).toBe(0);
    expect(compteurs.qualite.incontournableSansCandidat).toBe(0);
  });

  it("incontournable invalide : retiré, le lieu est gardé comme lieu ordinaire du secteur", async () => {
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, incontournable: `Château\u200b` }]);
    expect(candidats).toHaveLength(1);
    expect(candidats[0]).not.toHaveProperty("incontournable");
    expect(compteurs).toMatchObject({ champsRetires: 1, qualite: { incontournableSansCandidat: 1 } });
  });

  it("secteur invalide d'un lieu : retiré, puis le lieu est écarté par la règle du plan (secteur_inconnu), comme sans secteur", async () => {
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, secteur: `Vieille\nville` }]);
    expect(candidats).toHaveLength(0);
    expect(compteurs).toMatchObject({ champsRetires: 1, qualite: { secteurInconnu: 1 }, sortiesRefusees: { recherche: 0 } });
  });

  it("secteur trop long coupé en un nom hors plan : le lieu est écarté par la règle du plan (secteur_inconnu)", async () => {
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, secteur: `Vieille ville ${"haute ".repeat(15)}` }]);
    expect(candidats).toHaveLength(0);
    expect(compteurs).toMatchObject({ champsRetires: 0, textesCoupes: 1, qualite: { secteurInconnu: 1 }, sortiesRefusees: { recherche: 0 } });
  });

  it("incontournable trop long coupé en un nom hors plan : le lieu est gardé comme lieu ordinaire du secteur", async () => {
    const { candidats, compteurs } = await rejouer([{ ...CANDIDAT, incontournable: `Château ${"royal ".repeat(20)}` }]);
    expect(candidats).toHaveLength(1);
    expect(compteurs).toMatchObject({ champsRetires: 0, textesCoupes: 1, qualite: { incontournableSansCandidat: 1 } });
  });
});
