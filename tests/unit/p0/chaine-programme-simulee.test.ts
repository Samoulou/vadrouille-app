// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPrototypeAdapter } from "@/adapters/prototype";
import { creerModelesSimules, FixturesModelesSchema } from "@/ai/modeles.simule";
import { TripSchema } from "@/contracts";
import { lieuxDuProgramme, lireProgramme, ordreEcrit } from "@/ai/sorties";
import { lieuxHorsPartTextSearch } from "@/grounding/ancrage";
import { creerPlacesSimule, FixturesPlacesSchema } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { ProgrammeReduitSchema, PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule } from "@/research/pages.simule";
import { creerRechercheSimulee } from "@/research/recherche-web.simule";

import { lireBrief, lireConfiguration, lireFixtures, type Fixtures } from "../../../scripts/p0/fichiers";
import { creerJournal, creerRedacteur } from "../../../scripts/p0/journal";
import { executerProgramme } from "../../../scripts/p0/pipeline";

/**
 * Banc de base du mode simulé par la nouvelle chaîne (spécification P0-programme-par-ia § 1 point 7 ; décision 0116
 * § 7.2 ; revue 1 de #632, bloquant 1) : sortie simulée du prompt `programme` (fixtures `prototype/fixtures/modeles/`),
 * vérification et trajets sur les doubles, écriture du programme réduit, puis **affichage** par l'adaptateur du
 * prototype. Aucun appel réel, aucune variable d'environnement.
 */

const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

/**
 * Fixtures de rome-1 : la sortie simulée du prompt `programme` est commitée (`prototype/fixtures/modeles/rome.json`) ;
 * Places et Routes sont fabriqués ici, en mémoire (identifiants sentinelles, positions calculées autour d'un point
 * fictif, aucune donnée Google), pour que rome-1 garde son statut de brief sans fixtures de lieux de l'ancienne chaîne
 * (`tests/unit/p0/borne-demande-du-jour.test.ts`).
 */
function fixturesRome(): Fixtures {
  const edimbourg = lireFixtures("edimbourg");
  const modeles = FixturesModelesSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/fixtures/modeles/rome.json"), "utf8")));
  const brief = lireBrief("rome-1");
  const programme = lireProgramme(JSON.stringify(modeles.programme), { arrivee: brief.arrivee, depart: brief.depart }).valeur;
  if (programme === null) throw new Error("fixture rome illisible");
  const fiche = (placeId: string, rang: number) => ({
    placeId,
    statut: "OPERATIONAL" as const,
    position: { lat: 41.89 + (rang % 5) / 100, lng: 12.49 + Math.floor(rang / 5) / 100 },
    horaires: null,
    nom: "SENTINELLE-NOM-GOOGLE",
    adresse: "SENTINELLE-ADRESSE-GOOGLE",
    note: 1,
    niveauPrix: "SENTINELLE_NIVEAU_PRIX",
  });
  const lieux: Record<string, ReturnType<typeof fiche>> = { [brief.logements[0]!.texte]: fiche("SENTINELLE_PLACE_ID_LOGEMENT", 0) };
  lieuxDuProgramme(programme, brief.destination).lieux.forEach((lieu, rang) => {
    lieux[lieu.lieu] = fiche(`SENTINELLE_PLACE_ID_${String(rang + 1).padStart(3, "0")}`, rang + 1);
  });
  return { ...edimbourg, modeles, places: FixturesPlacesSchema.parse({ lieux }) };
}

async function executerSimule(nomBrief: string, slug: string, plafondsModifies: Partial<ReturnType<typeof lireConfiguration>["plafonds"]> = {}) {
  const fixtures = slug === "rome" ? fixturesRome() : lireFixtures(slug);
  const lignes: string[] = [];
  const appels: string[] = [];
  const modeles = creerModelesSimules(fixtures.modeles);
  const resultat = await executerProgramme({
    nomBrief,
    brief: lireBrief(nomBrief),
    variante: "b",
    configuration: (() => {
      const configuration = lireConfiguration();
      return { ...configuration, plafonds: { ...configuration.plafonds, ...plafondsModifies } };
    })(),
    dateExecution: "2026-10-12",
    numero: 1,
    journal: creerJournal((ligne) => void lignes.push(ligne), creerRedacteur([])),
    horloge: () => 0,
    clients: {
      modeles: { envoyer: (requete) => (appels.push(requete.etape), modeles.envoyer(requete)) },
      recherche: creerRechercheSimulee(fixtures.recherche),
      lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(fixtures.pages.dns), http: creerHttpSimule(fixtures.pages.pages) }),
      places: creerPlacesSimule(fixtures.places),
      routes: creerRoutesSimule(fixtures.routes),
    },
  });
  return { resultat, lignes, appels };
}

describe("p0: mode simulé par la nouvelle chaîne (0116 § 7.2)", () => {
  it.each([
    ["rome-1", "rome"],
    ["edimbourg-1", "edimbourg"],
  ])("p0: mode simulé par la nouvelle chaîne, écriture puis affichage sans appel (%s)", async (nomBrief, slug) => {
    const { resultat, lignes, appels } = await executerSimule(nomBrief, slug);
    // Une seule requête de modèle, la requête `programme` ; aucune recherche web, aucune notation, aucune raison.
    expect(appels).toEqual(["programme"]);
    expect(resultat.rapport.statut).toBe("complete");
    const programme = ProgrammeReduitSchema.parse(resultat.programme);
    expect(lignes.map((ligne) => (JSON.parse(ligne) as { code: string }).code)).toEqual(["run_started", "grounding_done", "planning_done", "validation_done"]);
    // Rapport : des nombres seulement, aucun identifiant de lieu ni nom.
    const rapport = JSON.stringify(resultat.rapport);
    expect(rapport).not.toMatch(/SENTINELLE/);
    expect(resultat.rapport.programme.modelCalls).toBe(1);
    expect(resultat.rapport.etapes.avecPlaceId).toBeGreaterThan(0);
    // toConfirm n'est jamais écrit.
    expect(JSON.stringify(programme)).not.toContain("toConfirm");

    // Affichage : le programme écrit est servi par l'adaptateur du prototype, badge « à confirmer » calculé à la lecture.
    const adaptateur = createPrototypeAdapter({
      programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
      relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 9) }) } },
    });
    const trip = await adaptateur.getTrip(ctx, programme.trip.id);
    expect(trip).not.toBeNull();
    TripSchema.parse(trip);
    expect(trip!.days.length).toBe(resultat.rapport.programme.days);
    const etapes = trip!.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : [])));
    expect(etapes.length).toBe(resultat.rapport.etapes.avecPlaceId + resultat.rapport.etapes.sansPlaceId);
    for (const etape of etapes) expect(etape.exceptions.includes("toConfirm")).toBe(etape.placeId === undefined);
  });

  it("p0: mode simulé, lieu introuvable ou fermé définitivement écrit sans placeId (edimbourg-1)", async () => {
    const { resultat } = await executerSimule("edimbourg-1", "edimbourg");
    expect(resultat.rapport.etapes.sansPlaceId).toBeGreaterThan(0);
    const sansLieu = resultat.programme!.trip.days.flatMap((jour) => jour.items).filter((ligne) => ligne.type === "stop" && ligne.stop.placeId === undefined);
    expect(sansLieu).toHaveLength(resultat.rapport.etapes.sansPlaceId);
  });

  it("p0: unverifiedForCap du mode simulé, même règle que p0Run (parité, part Text Search de 18)", async () => {
    // Mêmes entrées que « p0: unverifiedForCap compte seulement les lieux non envoyés faute de part Text Search »
    // (`tests/unit/workflows/p0-run-finale.test.ts`) : edimbourg-1, 18 requêtes, un logement ; p0Run y écrit lieux − 17.
    const { resultat } = await executerSimule("edimbourg-1", "edimbourg", { placesTextSearch: 18 });
    const fixtures = lireFixtures("edimbourg");
    const brief = lireBrief("edimbourg-1");
    const programme = ordreEcrit(lireProgramme(JSON.stringify(fixtures.modeles.programme), { arrivee: brief.arrivee, depart: brief.depart }).valeur!);
    const lieux = lieuxDuProgramme(programme, brief.destination).lieux.length;
    expect(lieux).toBeGreaterThan(17);
    expect(resultat.rapport.statut).toBe("complete");
    expect(resultat.rapport.programme.placesToVerify).toBe(lieux);
    expect(resultat.rapport.programme.unverifiedForCap).toBe(lieux - 17);
    expect(resultat.rapport.programme.unverifiedForCap).toBe(lieuxHorsPartTextSearch(lieux, 18, brief.logements.length));
    // Programme entier écrit ; les lieux non envoyés le sont sans placeId.
    expect(resultat.rapport.etapes.sansPlaceId).toBeGreaterThanOrEqual(lieux - 17);
  });

  it("p0: une seule définition de la règle unverifiedForCap, importée par p0Run et par le mode simulé", () => {
    const source = (fichier: string) => readFileSync(path.join(process.cwd(), fichier), "utf8");
    const definitions = ["src/grounding/ancrage.ts", "src/grounding/ancrage-zone.ts", "src/workflows/p0-run.ts", "scripts/p0/pipeline.ts"].filter((fichier) =>
      /function lieuxHorsPartTextSearch|Math\.max\(0,\s*\w+\s*-\s*Math\.max\(0,/.test(source(fichier)),
    );
    expect(definitions).toEqual(["src/grounding/ancrage.ts"]);
    for (const fichier of ["src/workflows/p0-run.ts", "scripts/p0/pipeline.ts"]) {
      expect(source(fichier), fichier).toMatch(/import \{[^}]*\blieuxHorsPartTextSearch\b[^}]*\} from "@\/grounding\/ancrage";/);
      expect(source(fichier), fichier).toMatch(/unverifiedForCap = lieuxHorsPartTextSearch\(/);
    }
  });
});
