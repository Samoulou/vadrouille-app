// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import {
  analyser,
  analyserPackageJson,
  estFichierTest,
  estNomSecret,
  hotesDe,
  horsProgramme,
  idLigneCapacite,
  lireCas,
  nomsSecretsDesListes,
  paquetDe,
  type Constat,
  type Resultat,
} from "./analyse";
import { estAnalyse, fichiersSuivis, lireFichier, RACINE, type FichierSuivi } from "./fichiers";
import { MODULES_CAPACITE_P0R1, verifierFermeture } from "./graphe";
import { LIGNES_CAPACITE, LIGNES_CAPACITE_TEXTES, type LigneCapacite } from "./listes/capacites";
import { FORMES_NOMINATIVES_TESTS } from "./listes/formes-tests";
import { CONSTRUITS, PAQUETS, SUBSTITUTIONS } from "./listes/paquets";
import { ENV_ENTIER, LECTURES_ENV_SECRETES, LECTURES_ENV_TOUTES, PARAMETRES_ENV, PROPRIETES_PROCESS } from "./listes/process";
import { SPECIFICATEURS, SPECIFICATEURS_NOMINATIFS } from "./listes/specificateurs";
import { construireProgramme } from "./programme";

/**
 * Régime de confinement sur le dépôt entier (spécification P0c ; décision 0038, P0c-TL-1 point 5 et P0c-TL-5) :
 * seul fichier qui construit le programme TypeScript du dépôt, une fois par exécution.
 */

const LIGNES: readonly LigneCapacite[] = [...LIGNES_CAPACITE, ...LIGNES_CAPACITE_TEXTES];
/** Lectures de `process.env` : lignes des listes `.ts` et lignes de noms secrets lues dans les données du régime. */
const LECTURES_ENV = LECTURES_ENV_TOUTES;
/**
 * Fichiers des tableaux de la section 3 (exceptions de `40b6738`, lignes du régime lui-même) et de la section 9
 * (`scripts/p0/enregistrer.mjs`) : seules lignes admises sans champ `ecart` (mineur 4 de la revue du head `eb7e3bf`).
 */
const FICHIERS_SECTION_3 = [
  "scripts/serve-standalone.mjs",
  "tests/perf/lighthouse-helpers.ts",
  "tests/unit/ci/visual-update.test.ts",
  "tests/unit/debloquer-regles.test.ts",
  "src/lib/large-screen.test.tsx",
  "src/adapters/simulation.ts",
  "src/components/carte/GoogleMapRenderer.tsx",
  "src/app/fonts.ts",
  "tests/e2e/carte-helpers.ts",
  "tests/e2e/carte.e2e.spec.ts",
  "src/prototype/config.ts",
  "src/prototype/config.test.ts",
  "tests/unit/confinement/fichiers.ts",
  "tests/support/serveur-local.ts",
  "scripts/p0/enregistrer.mjs",
];
/**
 * Fichier de l'ancienne exception de la décision 0040 D1 (section 2.4), retirée par ticket 221 (décision 0042) : il n'a plus
 * qu'une ligne ordinaire (`module:node:child_process`, `spawnSync`).
 */
const CLI_P0 = "tests/unit/p0/cli.test.ts";

let suivis: FichierSuivi[];
let analyses: FichierSuivi[];
let resultats: Resultat[];
let constats: Constat[];
let horsDuProgramme: string[];
let existe: (chemin: string) => boolean;
let duree = 0;

beforeAll(() => {
  const debut = Date.now();
  suivis = fichiersSuivis();
  const ensemble = new Set(suivis.map((f) => f.chemin));
  existe = (chemin) => ensemble.has(chemin);
  analyses = suivis.filter((f) => estAnalyse(f.chemin));
  const { programme, verificateur, racines } = construireProgramme(ensemble);
  resultats = [];
  horsDuProgramme = [];
  for (const { chemin } of analyses) {
    const racine = racines.has(chemin);
    if (horsProgramme(chemin, racine)) horsDuProgramme.push(chemin);
    const arbre = racine && !horsProgramme(chemin, racine) ? programme.getSourceFile(path.join(RACINE, chemin)) : undefined;
    resultats.push(
      analyser(chemin, lireFichier(chemin), {
        existe,
        lire: (c) => (ensemble.has(c) ? lireFichier(c) : undefined),
        racine,
        ...(arbre ? { verificateur, arbre } : {}),
      }),
    );
  }
  constats = resultats.flatMap((r) => r.constats);
  duree = Date.now() - debut;
}, 120_000);

const decrire = (c: Constat) => `${c.fichier}:${c.ligne} [${c.regle}] ${c.capacite} — ${c.forme}`;


const texteNonVide = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const clesExactes = (x: Record<string, unknown>, cles: readonly string[], facultatives: readonly string[] = []) =>
  cles.every((k) => k in x) && Object.keys(x).every((k) => cles.includes(k) || facultatives.includes(k));
/** Texte surveillé (hôte ou fragment de `refus.json`) : seule raison d'écrire une ligne dans les données plutôt qu'en TypeScript (0049 C2). */
const contientTexteSurveille = (...textes: unknown[]) =>
  textes.some((t) => typeof t === "string" && (hotesDe(t, false).hotes.length > 0 || hotesDe(t, false).fragments.length > 0));

/**
 * Forme d'une ligne de `donnees/lignes-textes.json`. Capacités de texte (`hote`, `fragment`, `secret`, `global`) ;
 * `module:` et `identifiant:` seulement pour les modules de capacité de P0r1 de `refus.json`, dont le chemin contient
 * un fragment surveillé (décision 0049 C3).
 */
function formeLigneTexteAdmise(l: unknown): boolean {
  if (typeof l !== "object" || l === null) return false;
  const x = l as Record<string, unknown>;
  const capacites = x.capacites;
  return (
    typeof x.fichier === "string" &&
    (x.portee === "test" || x.portee === "outil" || x.portee === "application") &&
    typeof x.usage === "string" &&
    (x.ecart === undefined || typeof x.ecart === "string") &&
    Array.isArray(capacites) &&
    capacites.length > 0 &&
    capacites.every(
      (c: Record<string, unknown>) =>
        typeof c.capacite === "string" &&
        (/^(hote|fragment|secret|global):/.test(c.capacite) ||
          (typeof x.fichier === "string" && MODULES_CAPACITE_P0R1.includes(x.fichier) && /^(module|identifiant):/.test(c.capacite))) &&
        Array.isArray(c.formes) &&
        c.formes.length > 0 &&
        c.formes.every((f: unknown) => typeof f === "string") &&
        (c.nombre === undefined || (typeof c.nombre === "number" && Number.isInteger(c.nombre) && c.nombre > 0)),
    ) &&
    clesExactes(x, ["fichier", "portee", "usage", "capacites"], ["ecart"])
  );
}

/** Ligne nominative de spécificateur lue dans les données (0049 C2) : forme exacte et texte surveillé obligatoire. */
function formeNominatifTexteAdmise(l: unknown): boolean {
  if (typeof l !== "object" || l === null) return false;
  const x = l as Record<string, unknown>;
  return (
    clesExactes(x, ["fichier", "specificateur", "noms", "motif"]) &&
    texteNonVide(x.fichier) &&
    texteNonVide(x.specificateur) &&
    texteNonVide(x.motif) &&
    Array.isArray(x.noms) &&
    x.noms.length > 0 &&
    x.noms.every(texteNonVide) &&
    new Set(x.noms).size === x.noms.length &&
    contientTexteSurveille(x.fichier, x.specificateur)
  );
}

/** Ligne de paquet lue dans les données (0049 C2) : forme exacte et texte surveillé obligatoire. */
function formePaquetTexteAdmise(l: unknown): boolean {
  if (typeof l !== "object" || l === null) return false;
  const x = l as Record<string, unknown>;
  return clesExactes(x, ["paquet", "usage", "verdict"]) && texteNonVide(x.paquet) && texteNonVide(x.usage) && texteNonVide(x.verdict) && contientTexteSurveille(x.paquet);
}

describe("confinement: dépôt", () => {
  it("énumère les fichiers suivis : liste non vide, aucun lien symbolique analysé", () => {
    expect(analyses.length).toBeGreaterThan(0);
    expect(analyses.filter((f) => f.mode === "120000").map((f) => f.chemin)).toEqual([]);
    // Fichiers hors programme (règle fermée, 0038 TL-5 point 2) : les `.mjs`, `scripts/p0/**` et les zones sensibles.
    expect(horsDuProgramme.length).toBeGreaterThan(0);
  });

  it("confinement: aucune capacité hors des lignes nominatives", () => {
    expect(constats.filter((c) => !c.admis).map(decrire)).toEqual([]);
  });

  it("confinement: aucune ligne inutile", () => {
    const utilisees = new Set(constats.flatMap((c) => (c.par ? [c.par] : [])));
    const inutiles: string[] = [];
    for (const ligne of LIGNES) {
      for (const { capacite, formes } of ligne.capacites) {
        for (const forme of formes) {
          const id = idLigneCapacite(ligne.fichier, capacite, forme);
          if (!utilisees.has(id)) inutiles.push(id);
        }
      }
    }
    for (const l of PROPRIETES_PROCESS) if (!utilisees.has(`process:${l.fichier}:${l.propriete}`)) inutiles.push(`process:${l.fichier}:${l.propriete}`);
    for (const l of LECTURES_ENV) for (const nom of l.noms) if (!utilisees.has(`env:${l.fichier}:${nom}`)) inutiles.push(`env:${l.fichier}:${nom}`);
    for (const l of ENV_ENTIER) for (const forme of l.formes) if (!utilisees.has(`env-entier:${l.fichier}:${forme}`)) inutiles.push(`env-entier:${l.fichier}:${forme}`);
    for (const l of PARAMETRES_ENV) {
      const r = resultats.find((x) => x.fichier === l.fichier);
      if (!r?.fonctionsEnv.includes(l.fonction)) inutiles.push(`parametre-env:${l.fichier}:${l.fonction}`);
    }
    for (const l of SPECIFICATEURS) if (!utilisees.has(`spec:${l.specificateur}`)) inutiles.push(`spec:${l.specificateur}`);
    for (const l of SPECIFICATEURS_NOMINATIFS) {
      if (!utilisees.has(`spec-nominatif:${l.fichier}:${l.specificateur}`)) inutiles.push(`spec-nominatif:${l.fichier}:${l.specificateur}`);
    }
    for (const l of SPECIFICATEURS_NOMINATIFS) {
      for (const nom of l.noms) if (!utilisees.has(`spec-nom:${l.fichier}:${l.specificateur}:${nom}`)) inutiles.push(`spec-nom:${l.fichier}:${l.specificateur}:${nom}`);
    }
    for (const f of FORMES_NOMINATIVES_TESTS) if (!utilisees.has(`forme-test:${f.fichier}:${f.forme}`)) inutiles.push(`forme-test:${f.fichier}:${f.forme}`);
    expect(inutiles).toEqual([]);
  });

  it("confinement: chaque ligne hors des tableaux des sections 3 et 9 porte son écart écrit ; aucune ligne en double", () => {
    expect(LIGNES.filter((l) => !l.ecart && !FICHIERS_SECTION_3.includes(l.fichier)).map((l) => l.fichier)).toEqual([]);
    // Chaque fichier des tableaux a sa ligne (comparaison à la liste exacte, pas à un préfixe de clé).
    expect(FICHIERS_SECTION_3.filter((f) => !LIGNES.some((l) => l.fichier === f && !l.ecart))).toEqual([]);
    const ids = LIGNES.flatMap((l) => l.capacites.flatMap((c) => c.formes.map((f) => idLigneCapacite(l.fichier, c.capacite, f))));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("confinement: chaque ligne de 0040 D6 est bornée en nombre, forme par forme (revue du head ad0b008, bloquant 4)", () => {
    const sansNombre = LIGNES.filter((l) => l.ecart?.includes("0040 D6")).flatMap((l) =>
      l.capacites.filter((c) => c.nombre === undefined).map((c) => `${l.fichier} ${c.capacite}`),
    );
    expect(sansNombre).toEqual([]);
  });

  it("confinement: chaque écart cite une décision numérotée (0040 D5 ; revue du head ad0b008, mineur 1)", () => {
    // Depuis 0040, une PR seule (`#<n>`, `PR <n>`) ne suffit plus : chaque écart nomme la décision qui le tranche.
    const reference = /\b0\d{3}\b/;
    const ecarts = [
      ...LIGNES.flatMap((l) => (l.ecart === undefined ? [] : [{ ou: l.fichier, texte: l.ecart }])),
      ...SPECIFICATEURS_NOMINATIFS.map((l) => ({ ou: `${l.fichier} ${l.specificateur}`, texte: l.motif })),
      ...FORMES_NOMINATIVES_TESTS.filter((f) => f.motif.startsWith("écart")).map((f) => ({ ou: f.fichier, texte: f.motif })),
    ];
    expect(ecarts.filter((e) => !reference.test(e.texte)).map((e) => e.ou)).toEqual([]);
  });

  it("confinement: forme des lignes lues dans donnees/lignes-textes.json (contrôle d'exécution)", () => {
    const fautes = (LIGNES_CAPACITE_TEXTES as readonly unknown[]).filter((l) => !formeLigneTexteAdmise(l)).map((l) => JSON.stringify(l).slice(0, 120));
    expect(fautes).toEqual([]);
  });

  // Décision 0049 C3 : la forme élargie (`module:`, `identifiant:`) ne vaut que pour les modules de capacité de P0r1.
  it("confinement: une ligne module: ou identifiant: de lignes-textes.json hors des modules de capacité de P0r1 est refusée", () => {
    const ligne = (fichier: string, capacite: string) => ({ fichier, portee: "application", usage: "cas", capacites: [{ capacite, formes: ["Agent"], nombre: 1 }], ecart: "cas" });
    const capaciteP0r1 = MODULES_CAPACITE_P0R1[0] ?? "";
    expect(capaciteP0r1).not.toBe("");
    expect(formeLigneTexteAdmise(ligne(capaciteP0r1, "module:undici"))).toBe(true);
    expect(formeLigneTexteAdmise(ligne(capaciteP0r1, "identifiant:fetch"))).toBe(true);
    for (const fichier of ["src/lib/exemple.ts", "src/grounding/enveloppe-google.ts", "src/research/fetch-page.ts", "tests/unit/p0/clients-reels.test.ts"]) {
      expect(formeLigneTexteAdmise(ligne(fichier, "module:undici")), fichier).toBe(false);
      expect(formeLigneTexteAdmise(ligne(fichier, "identifiant:fetch")), fichier).toBe(false);
    }
    expect(formeLigneTexteAdmise(ligne(capaciteP0r1, "acces-calcule:type"))).toBe(false);
  });

  // Décision 0049 C2 : contrôle de forme et d'admission de `donnees/lignes-textes-specificateurs.json`.
  it("confinement: forme et admission des lignes lues dans donnees/lignes-textes-specificateurs.json (contrôle d'exécution)", () => {
    const brut = JSON.parse(lireFichier("tests/unit/confinement/donnees/lignes-textes-specificateurs.json")) as Record<string, unknown>;
    expect(Object.keys(brut).sort()).toEqual(["_", "nominatifs", "paquets"]);
    expect(Array.isArray(brut.nominatifs) && Array.isArray(brut.paquets)).toBe(true);
    const fautes = [
      ...(brut.nominatifs as unknown[]).filter((l) => !formeNominatifTexteAdmise(l)),
      ...(brut.paquets as unknown[]).filter((l) => !formePaquetTexteAdmise(l)),
    ].map((l) => JSON.stringify(l).slice(0, 120));
    expect(fautes).toEqual([]);
  });

  it("confinement: une entrée de lignes-textes-specificateurs.json sans texte surveillé ou mal formée est refusée", () => {
    const motif = "cas";
    expect(formeNominatifTexteAdmise({ fichier: "src/lib/exemple.ts", specificateur: "server-only", noms: ["effet"], motif })).toBe(false);
    expect(formePaquetTexteAdmise({ paquet: "zod", usage: "u", verdict: "v" })).toBe(false);
    const surveille = MODULES_CAPACITE_P0R1.find((f) => hotesDe(f, false).fragments.length > 0) ?? "";
    expect(surveille).not.toBe("");
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "server-only", noms: ["effet"], motif })).toBe(true);
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "server-only", noms: ["effet"], motif, autre: 1 })).toBe(false);
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "server-only", noms: [], motif })).toBe(false);
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "server-only", noms: ["effet", "effet"], motif })).toBe(false);
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "", noms: ["effet"], motif })).toBe(false);
    expect(formeNominatifTexteAdmise({ fichier: surveille, specificateur: "server-only", noms: ["effet"], motif: "" })).toBe(false);
  });

  // Revue du head a89d9a5 (PR 244, mineur 2) : les lignes de noms secrets sont lues par simple conversion de type.
  it("confinement: forme des lignes lues dans donnees/lectures-env-secretes.json (contrôle d'exécution)", () => {
    const fautes: string[] = [];
    for (const l of LECTURES_ENV_SECRETES as readonly unknown[]) {
      const x = l as Record<string, unknown>;
      const noms = x.noms;
      const ok =
        typeof x.fichier === "string" &&
        Array.isArray(noms) &&
        noms.length > 0 &&
        noms.every((n: unknown) => typeof n === "string" && /^[A-Z][A-Z0-9_]*$/.test(n)) &&
        new Set(noms).size === noms.length &&
        typeof x.motif === "string" &&
        x.motif.trim() !== "" &&
        x.constante === undefined &&
        Object.keys(x).every((k) => ["fichier", "noms", "motif"].includes(k));
      if (!ok) fautes.push(JSON.stringify(l).slice(0, 120));
    }
    expect(fautes).toEqual([]);
    expect(LECTURES_ENV_SECRETES.length).toBeGreaterThan(0);
  });

  // Revue du head a89d9a5 (PR 244, mineur 7, Sécurité) : db/migrate.ts exporte la lecture de la variable de
  // vadrouille_migrator ; hors de pnpm db:migrate, seuls des fichiers de tests/ peuvent l'importer.
  it("confinement: seuls des fichiers de tests/ importent db/migrate.ts", () => {
    expect(resultats.some((r) => r.fichier === "db/migrate.ts")).toBe(true);
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "db/migrate.ts")).map((r) => r.fichier);
    expect(importeurs.length).toBeGreaterThan(0);
    expect(importeurs.filter((f) => !f.startsWith("tests/"))).toEqual([]);
  });

  // Revue du head a89d9a5 (PR 244, mineur 8, Sécurité) : `uniqueKeyName` assemble des noms en `_key` ; il reste borné
  // aux noms de contraintes du schéma.
  it("confinement: seuls des fichiers de db/schema/ importent db/schema/naming.ts", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "db/schema/naming.ts")).map((r) => r.fichier);
    expect(importeurs.length).toBeGreaterThan(0);
    expect(importeurs.filter((f) => !f.startsWith("db/schema/"))).toEqual([]);
  });

  // B4a (ticket 531 ; décision 0097 B4-TL-3 point 5 (c)) : chemin de lecture du secret du webhook simulé. B4c (PR 863 ;
  // décision 0140 § 3 point 4 et § 6 ligne 10) : la composition et le webhook Stripe s'y ajoutent, et eux seuls.
  it("confinement: src/server/env/payment.ts n'a que quatre importeurs hors de ses tests (compositions et webhooks simulés et Stripe)", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "src/server/env/payment.ts")).map((r) => r.fichier);
    expect(importeurs.filter((f) => !estFichierTest(f)).sort()).toEqual([
      "src/server/payment/composition-stripe.ts",
      "src/server/payment/composition.ts",
      "src/server/routes/simulated-webhook.ts",
      "src/server/routes/stripe-webhook.ts",
    ]);
    expect(importeurs.filter((f) => estFichierTest(f) && !f.startsWith("src/server/env/"))).toEqual([]);
  });

  it("confinement: `cleWebhookSimule` n'est appelé, hors des tests, que par la composition et le webhook simulés", () => {
    const appelants = analyses
      .filter((f) => f.chemin.startsWith("src/") && !estFichierTest(f.chemin) && /\bcleWebhookSimule\(/.test(lireFichier(f.chemin)))
      .map((f) => f.chemin)
      .sort();
    expect(appelants).toEqual(["src/server/env/payment.ts", "src/server/payment/composition.ts", "src/server/routes/simulated-webhook.ts"]);
  });

  // B4c (PR 863 ; décision 0140 § 6 ligne 9, modèle de `nodemailer` et de 0138 § 9 ligne 7b) : seul module qui importe
  // `stripe`, et ses deux seuls importeurs hors des tests.
  it("confinement: src/server/payment/stripe.ts n'a que la composition et le webhook Stripe pour importeurs hors des tests", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "src/server/payment/stripe.ts")).map((r) => r.fichier);
    expect(importeurs.filter((f) => !estFichierTest(f)).sort()).toEqual(["src/server/payment/composition-stripe.ts", "src/server/routes/stripe-webhook.ts"]);
  });

  it("confinement: `cleStripe` n'est appelé, hors des tests, que par la composition Stripe (et défini dans son module)", () => {
    const appelants = analyses
      .filter((f) => f.chemin.startsWith("src/") && !estFichierTest(f.chemin) && /\bcleStripe\(/.test(lireFichier(f.chemin)))
      .map((f) => f.chemin)
      .sort();
    expect(appelants).toEqual(["src/server/env/payment.ts", "src/server/payment/composition-stripe.ts"]);
  });

  // B3d (M2a ; décision 0138 § 9, ligne 7) : chemin de lecture de la clé de Resend.
  it("confinement: src/server/env/cle-resend.ts n'a que l'implémentation Resend pour importeur hors de src/server/env/", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "src/server/env/cle-resend.ts")).map((r) => r.fichier);
    expect(importeurs.filter((f) => !estFichierTest(f)).sort()).toEqual(["src/server/mail/resend.ts"]);
    expect(importeurs.filter((f) => estFichierTest(f) && !f.startsWith("src/server/env/"))).toEqual([]);
  });

  it("confinement: `cleResend` n'est appelé, hors des tests, que par l'implémentation Resend (et défini dans son module)", () => {
    const appelants = analyses
      .filter((f) => f.chemin.startsWith("src/") && !estFichierTest(f.chemin) && /\bcleResend\(/.test(lireFichier(f.chemin)))
      .map((f) => f.chemin)
      .sort();
    expect(appelants).toEqual(["src/server/env/cle-resend.ts", "src/server/mail/resend.ts"]);
  });

  // B3d (M2a ; décision 0138 § 9, ligne 7b, ajoutée par la Sécurité) : seule la composition de la connexion construit
  // l'implémentation Resend ; ses tests sont nommés.
  it("confinement: src/server/mail/resend.ts n'a que src/server/auth/index.ts pour importeur hors des tests ; tests nommés", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "src/server/mail/resend.ts")).map((r) => r.fichier);
    expect(importeurs.filter((f) => !estFichierTest(f))).toEqual(["src/server/auth/index.ts"]);
    expect(importeurs.filter((f) => estFichierTest(f) && !f.startsWith("src/server/mail/")).sort()).toEqual(["tests/db/plafond-emails.test.ts"]);
  });

  it("confinement: le champ du secret décodé n'est nommé que dans src/server/env/index.ts, src/server/env/payment.ts et leurs tests", () => {
    // Nom assemblé à l'exécution : ce fichier ne doit pas lui-même contenir le texte cherché.
    const champ = ["simulated", "Webhook", "Secret"].join("");
    const admis = ["src/server/env/index.ts", "src/server/env/payment.ts", "src/server/env/payment.test.ts", "tests/unit/server/env.test.ts"];
    const porteurs = suivis.filter((f) => f.mode !== "120000" && !f.chemin.startsWith("docs/") && lireFichier(f.chemin).includes(champ)).map((f) => f.chemin);
    expect(porteurs.filter((f) => !admis.includes(f))).toEqual([]);
    expect(porteurs).toContain("src/server/env/index.ts");
  });

  it("confinement: fonctions qui reçoivent process.env entier (section 5, forme 2)", () => {
    const fonctions = new Set(resultats.flatMap((r) => r.fonctionsEnv));
    const passages = constats.filter((c) => c.regle === "environnement" && c.capacite === "entier" && c.forme.startsWith("argument:"));
    expect(passages.filter((c) => !fonctions.has(c.forme.slice("argument:".length))).map(decrire)).toEqual([]);
  });
});

const CAS_FERMETURE = lireCas("cas-fermeture.json");

describe("confinement: fermeture transitive", () => {
  it("aucun fichier de portée test ou outil atteint depuis l'application ; aucun import de test depuis un fichier non-test", () => {
    expect(verifierFermeture(resultats, LIGNES, existe)).toEqual([]);
  });

  for (const cas of CAS_FERMETURE) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      const virtuels = new Map([[cas.chemin, cas.source], ...Object.entries(cas.fichiers ?? {})]);
      const existeVirtuel = (c: string) => virtuels.has(c);
      const analyses = [...virtuels].map(([chemin, source]) => analyser(chemin, source, { existe: existeVirtuel, lire: (c) => virtuels.get(c) }));
      // Violations typées (règle, fichier) : fermeture, plus les spécificateurs non résolus de l'analyseur.
      const violations = [
        ...verifierFermeture(analyses, LIGNES, existeVirtuel),
        ...analyses.flatMap((r) => r.constats).filter((c) => c.capacite === "non-resolu").map((c) => ({ fichier: c.fichier, regle: c.regle, message: decrire(c) })),
      ];
      if (cas.attendu === "refus") {
        expect(violations.filter((v) => v.regle === cas.regle && v.fichier === cas.chemin).length, JSON.stringify(violations)).toBeGreaterThan(0);
      } else expect(violations).toEqual([]);
    });
  }
});

describe("confinement: spécificateurs et paquets (dépôt)", () => {
  it("package.json : clés, pnpm, versions exactes, aucun script de cycle de vie, liste des paquets", () => {
    expect((JSON.parse(lireFichier("package.json")) as { pnpm?: { overrides?: unknown } }).pnpm?.overrides).toEqual(SUBSTITUTIONS);
    expect(analyserPackageJson(JSON.stringify({ packageManager: "pnpm@10.28.0", pnpm: { onlyBuiltDependencies: [...CONSTRUITS], overrides: { "x>y": "1.0.0" } } }), [], CONSTRUITS, SUBSTITUTIONS).map((c) => c.capacite)).toEqual([
      "override-non-liste",
    ]);
    const resultat = analyserPackageJson(lireFichier("package.json"), PAQUETS, CONSTRUITS, SUBSTITUTIONS);
    expect(resultat.filter((c) => !c.admis).map((c) => `${c.capacite} — ${c.forme}`)).toEqual([]);
  });

  it("aucune dépendance fantôme : chaque spécificateur tiers appartient à un paquet déclaré", () => {
    const json = JSON.parse(lireFichier("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const declares = new Set([...Object.keys(json.dependencies), ...Object.keys(json.devDependencies)]);
    const fantomes = resultats.flatMap((r) =>
      r.imports
        .filter((i) => i.cible === undefined && !i.specificateur.startsWith("node:") && !i.specificateur.startsWith("@/") && !i.specificateur.startsWith("."))
        .filter((i) => !declares.has(paquetDe(i.specificateur)))
        .map((i) => `${r.fichier}:${i.ligne} ${i.specificateur}`),
    );
    expect(fantomes).toEqual([]);
  });

  it("aucun fichier .npmrc, .yarnrc ou pnpm-workspace.yaml suivi", () => {
    expect(suivis.map((f) => f.chemin).filter((c) => /(^|\/)(\.npmrc|\.yarnrc[^/]*|pnpm-workspace\.yaml)$/.test(c))).toEqual([]);
  });
});

type CasListesEnv = {
  readonly id: string;
  readonly lectures: readonly { fichier: string; noms: string[] }[];
  readonly tables: readonly { fichier: string; valeur: string }[];
  readonly attendu: "refus" | "admis";
};
const CAS_LISTES_ENV = (JSON.parse(readFileSync(new URL("./donnees/cas-listes-env.json", import.meta.url), "utf8")) as { cas: CasListesEnv[] }).cas;

describe("confinement: noms secrets dans les listes (section 5 ; bloquant 3 de la revue du head eb7e3bf)", () => {
  it("aucun nom de LECTURES_ENV ni de table de vi.stubEnv n'est secret hors de src/server/env/", () => {
    const tables = FORMES_NOMINATIVES_TESTS.filter((f) => f.forme === "stubEnv-table");
    expect(nomsSecretsDesListes(LECTURES_ENV, tables)).toEqual([]);
    // Les données de noms secrets ne portent que des noms secrets ; tout autre nom reste dans les listes `.ts`.
    expect(LECTURES_ENV_SECRETES.flatMap((l) => l.noms.filter((nom) => !estNomSecret(nom)).map((nom) => `${l.fichier} : ${nom}`))).toEqual([]);
  });

  it("aucune exception : aucun vi.stubEnv non littéral ni à nom secret admis par une ligne (0040 D1 retirée, 0042)", () => {
    // Aucun constat `stubEnv-non-litteral` n'est admis par une ligne de capacité (les tables d'`it.each` de
    // `listes/formes-tests.ts` restent jugées par le contrôle précédent).
    expect(constats.filter((c) => c.capacite === "stubEnv-non-litteral" && c.par?.startsWith("capacite:")).map(decrire)).toEqual([]);
    // Aucune ligne, dans `listes/*.ts` ni dans `donnees/lignes-textes.json`, ne porte une forme de `vi.stubEnv`.
    expect(LIGNES.flatMap((l) => l.capacites.filter((c) => c.capacite.startsWith("regime-tests:stubEnv")).map((c) => `${l.fichier} ${c.capacite}`))).toEqual(
      [],
    );
    // Aucun vi.stubEnv d'un nom secret n'est admis, où que ce soit.
    expect(constats.filter((c) => c.capacite.startsWith("stubEnv:") && c.admis).map(decrire)).toEqual([]);
    expect(constats.filter((c) => c.regle === "nom-secret" && c.capacite.startsWith("stubEnv:")).map(decrire)).toEqual([]);
  });

  for (const cas of CAS_LISTES_ENV) {
    it(`${cas.id} (${cas.attendu})`, () => {
      const violations = nomsSecretsDesListes(cas.lectures, cas.tables);
      if (cas.attendu === "refus") expect(violations.length).toBeGreaterThan(0);
      else expect(violations).toEqual([]);
    });
  }
});

describe("confinement: aucune exception à la section 2.4 (0040 D1 retirée par ticket 221, décision 0042)", () => {
  it("aucune ligne n'admet reflexion:Proxy ni reflexion:Reflect ; aucun écart ne cite 0040 D1", () => {
    // `LIGNES` réunit `listes/capacites.ts` et `donnees/lignes-textes.json`.
    const reflexion = LIGNES.filter((l) => l.capacites.some((c) => /^reflexion:(Proxy|Reflect)$/.test(c.capacite)));
    expect(reflexion.map((l) => l.fichier)).toEqual([]);
    const ecrits = [
      ...LIGNES.flatMap((l) => (l.ecart === undefined ? [] : [{ ou: l.fichier, texte: l.ecart }])),
      ...SPECIFICATEURS_NOMINATIFS.map((l) => ({ ou: `${l.fichier} ${l.specificateur}`, texte: l.motif })),
      ...FORMES_NOMINATIVES_TESTS.map((f) => ({ ou: f.fichier, texte: f.motif })),
    ];
    expect(ecrits.filter((e) => /0040 D1/.test(e.texte)).map((e) => e.ou)).toEqual([]);
    // cli.test.ts : aucune ligne n'admet pour lui les formes de l'ancienne exception, un texte de nom secret ou un module réseau.
    const formesD1 = /^(reflexion:|environnement:(usage|ecriture|acces-calcule)$|regime-tests:stubEnv-non-litteral$|secret:|fragment:|hote:|identifiant:fetch$|module:node:(dns|http|https|net|tls)(\/|$))/;
    expect(LIGNES.filter((l) => l.fichier === CLI_P0).flatMap((l) => l.capacites.map((c) => c.capacite)).filter((c) => formesD1.test(c))).toEqual([]);
    expect(LIGNES.filter((l) => l.fichier === CLI_P0).flatMap((l) => l.capacites.map((c) => c.capacite))).toEqual(["module:node:child_process"]);
  });

  it("cli.test.ts ne contient aucun texte de nom secret ni d'hôte surveillé, et aucune lecture calculée de process.env", () => {
    const source = lireFichier(CLI_P0);
    const arbre = ts.createSourceFile(CLI_P0, source, ts.ScriptTarget.Latest, true);
    // Aucun littéral de texte du fichier n'est un nom secret (le régime s'applique à lui-même : aucun nom n'est écrit ici).
    const litteraux: string[] = [];
    const visiter = (n: ts.Node) => {
      if (ts.isStringLiteralLike(n)) litteraux.push(n.text);
      ts.forEachChild(n, visiter);
    };
    visiter(arbre);
    expect(litteraux.length).toBeGreaterThan(0);
    expect(litteraux.filter(estNomSecret)).toEqual([]);
    const duFichier = constats.filter((c) => c.fichier === CLI_P0);
    expect(duFichier.filter((c) => c.regle === "nom-secret" || c.regle === "hote" || c.regle === "reflexion").map(decrire)).toEqual([]);
    expect(duFichier.filter((c) => c.regle === "environnement" && c.capacite !== "lecture").map(decrire)).toEqual([]);
    expect(duFichier.filter((c) => !c.admis).map(decrire)).toEqual([]);
  });
});

describe("confinement: recherche de ville de api (décision 0141 § 11 ligne 6)", () => {
  const COMPTEURS = "src/server/villes/compteurs.ts";
  const RECHERCHE = "src/server/villes/recherche.ts";
  const TERMINAL_API = "src/server/composition/villes-api.ts";
  const CONFIG = "src/server/config/villes.ts";
  const horsTests = (chemin: string) => !estFichierTest(chemin) && !chemin.startsWith("docs/");
  const importateursHorsTests = (cible: string) =>
    resultats
      .filter((r) => horsTests(r.fichier) && r.imports.some((i) => i.cible === cible))
      .map((r) => r.fichier)
      .sort();
  /** Fichiers suivis hors des tests et de `docs/` : code analysé, et migrations de `db/migrations/` (SQL et clichés). */
  const fichiersDuCode = () => suivis.map((f) => f.chemin).filter((c) => horsTests(c) && (estAnalyse(c) || c.startsWith("db/migrations/")));
  const contenant = (texte: string) => fichiersDuCode().filter((c) => lireFichier(c).includes(texte)).sort();

  it("compteurs : seul importateur hors des tests, le terminal de api ; cœur : les deux terminaux seulement", () => {
    expect(importateursHorsTests(COMPTEURS)).toEqual([TERMINAL_API]);
    expect(importateursHorsTests(RECHERCHE)).toEqual(["src/server/composition/villes-api.ts", "src/server/composition/villes.ts"]);
  });

  it("rôle des compteurs pris dans le seul module des compteurs ; nom de la table dans le module, le schéma et la migration 0021", () => {
    expect(contenant("SET LOCAL ROLE vadrouille_autocomplete_counter")).toEqual([COMPTEURS]);
    const table = contenant("autocomplete_daily_counts");
    expect(table.filter((c) => c !== COMPTEURS && c !== "db/schema/auth.ts" && !/^db\/migrations\/(meta\/)?0021_/.test(c))).toEqual([]);
    for (const attendu of [COMPTEURS, "db/schema/auth.ts", "db/migrations/0021_compteurs_autocompletion.sql"]) expect(table).toContain(attendu);
  });

  it("crochet accesReelApi : défini dans acces-reel.ts, lu par le seul terminal de api (jamais par la page de l'écran 1)", () => {
    expect(contenant("accesReelApi")).toEqual(["src/server/composition/villes-api.ts", "src/server/generation/acces-reel.ts"]);
  });

  it("SEUILS_AUTOCOMPLETION_VALIDES : une seule déclaration, `export const …: boolean = false`, aucune affectation", () => {
    const NOM = "SEUILS_AUTOCOMPLETION_VALIDES";
    const declarations: string[] = [];
    const affectations: string[] = [];
    const AFFECTATIONS = new Set([
      ts.SyntaxKind.EqualsToken,
      ts.SyntaxKind.BarBarEqualsToken,
      ts.SyntaxKind.AmpersandAmpersandEqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken,
    ]);
    const nomme = (n: ts.Node) => (ts.isIdentifier(n) && n.text === NOM) || (ts.isPropertyAccessExpression(n) && n.name.text === NOM);
    for (const chemin of suivis.map((f) => f.chemin).filter(estAnalyse)) {
      const texte = lireFichier(chemin);
      if (!texte.includes(NOM)) continue;
      const arbre = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true);
      const visiter = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === NOM) declarations.push(`${chemin}: ${n.parent.parent.getText(arbre)}`);
        if (ts.isBinaryExpression(n) && AFFECTATIONS.has(n.operatorToken.kind) && nomme(n.left)) affectations.push(`${chemin}: ${n.getText(arbre)}`);
        ts.forEachChild(n, visiter);
      };
      visiter(arbre);
    }
    expect(declarations).toEqual([`${CONFIG}: export const ${NOM}: boolean = false;`]);
    expect(affectations).toEqual([]);
  });
});

describe("confinement: le régime s'applique à lui-même", () => {
  const DU_REGIME = (chemin: string) => chemin.startsWith("tests/unit/confinement/") || chemin.startsWith("tests/support/");

  it("ses fichiers .ts sont analysés comme les autres, sans exclusion nominative", () => {
    const fichiers = analyses.map((f) => f.chemin).filter(DU_REGIME);
    for (const attendu of [
      "tests/unit/confinement/analyse.ts",
      "tests/unit/confinement/graphe.ts",
      "tests/unit/confinement/fichiers.ts",
      "tests/unit/confinement/programme.ts",
      "tests/unit/confinement/depot.test.ts",
      "tests/support/serveur-local.ts",
    ]) {
      expect(fichiers).toContain(attendu);
    }
    expect(resultats.filter((r) => DU_REGIME(r.fichier)).length).toBe(fichiers.length);
  });

  it("ni hôte surveillé, ni nom secret, ni texte refusé ; seules capacités : ses deux lignes", () => {
    const duRegime = constats.filter((c) => DU_REGIME(c.fichier));
    expect(duRegime.filter((c) => c.regle === "hote" || c.regle === "nom-secret" || c.regle === "texte-interdit").map(decrire)).toEqual([]);
    const capacites = duRegime.filter((c) => c.par?.startsWith("capacite:")).map((c) => c.par);
    expect([...new Set(capacites)].sort()).toEqual([
      idLigneCapacite("tests/support/serveur-local.ts", "module:node:http", "createServer"),
      // B4c (PR 863 ; décision 0140 § 6 ligne 3) : émetteur Stripe de test, seul fichier de test qui importe `stripe`.
      idLigneCapacite("tests/support/stripe-evenements.ts", "module:stripe", "default"),
      idLigneCapacite("tests/unit/confinement/fichiers.ts", "module:node:child_process", "execFileSync"),
    ]);
  });

  it("typescript n'est importé que dans la zone de sa ligne, et chaque fichier nommé de la zone l'importe (amendement A1 de 0038)", () => {
    const zone = SPECIFICATEURS.find((l) => l.specificateur === "typescript")?.zones ?? [];
    const importateurs = resultats
      .filter((r) => r.imports.some((i) => i.specificateur === "typescript" || i.specificateur.startsWith("typescript/")))
      .map((r) => r.fichier);
    for (const f of importateurs) expect(zone.some((z) => z === f || (z.endsWith("/**") && f.startsWith(z.slice(0, -2)))), f).toBe(true);
    // Mineur 8 : les fichiers nommés (sans motif) sont vérifiés un à un ; un fichier qui ne l'importe plus sort de la zone.
    expect(zone.filter((z) => !z.includes("*") && !importateurs.includes(z))).toEqual([]);
  });

  it("énumérateur : execFileSync(\"git\", [\"ls-files\", \"-z\", \"-s\"], …) sans shell ; serveur local sur 127.0.0.1, port 0", () => {
    const appels = (chemin: string, nom: string) => {
      const arbre = ts.createSourceFile(chemin, lireFichier(chemin), ts.ScriptTarget.Latest, true);
      const trouves: ts.CallExpression[] = [];
      const visiter = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const e = n.expression;
          if ((ts.isIdentifier(e) && e.text === nom) || (ts.isPropertyAccessExpression(e) && e.name.text === nom)) trouves.push(n);
        }
        ts.forEachChild(n, visiter);
      };
      visiter(arbre);
      return trouves.map((a) => a.arguments.map((x) => x.getText(arbre)));
    };
    const git = appels("tests/unit/confinement/fichiers.ts", "execFileSync");
    expect(git).toHaveLength(1);
    expect(git[0]?.slice(0, 2)).toEqual(['"git"', '["ls-files", "-z", "-s"]']);
    expect(git[0]?.[2]).not.toMatch(/shell/);
    expect(appels("tests/support/serveur-local.ts", "createServer")).toHaveLength(1);
    const ecoute = appels("tests/support/serveur-local.ts", "listen");
    expect(ecoute).toHaveLength(1);
    expect(ecoute[0]?.slice(0, 2)).toEqual(["0", '"127.0.0.1"']);
  });

  it("délai : la suite du dépôt reste sous le plafond de sécurité (120 s)", () => {
    expect(duree).toBeLessThan(120_000);
    expect(analyses.filter((f) => estFichierTest(f.chemin)).length).toBeGreaterThan(0);
  });
});
