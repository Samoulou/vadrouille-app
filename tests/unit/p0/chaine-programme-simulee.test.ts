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
function fixturesRome(modifier: (programme: SortieRome) => void = () => undefined): Fixtures {
  const edimbourg = lireFixtures("edimbourg");
  const brut = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/fixtures/modeles/rome.json"), "utf8")) as { programme: SortieRome };
  modifier(brut.programme);
  const modeles = FixturesModelesSchema.parse(brut);
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

/** Sortie simulée brute de rome-1, telle que le modèle la rendrait (avant toute lecture). */
type SortieRome = { jours: { titre?: string; creneaux: Record<string, unknown>[] }[] };

async function executerSimule(
  nomBrief: string,
  slug: string,
  plafondsModifies: Partial<ReturnType<typeof lireConfiguration>["plafonds"]> = {},
  fixturesDonnees?: Fixtures,
) {
  const fixtures = fixturesDonnees ?? (slug === "rome" ? fixturesRome() : lireFixtures(slug));
  const lignes: string[] = [];
  const appels: string[] = [];
  const requetes: string[] = [];
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
      modeles: { envoyer: (requete) => (appels.push(requete.etape), requetes.push(JSON.stringify(requete)), modeles.envoyer(requete)) },
      recherche: creerRechercheSimulee(fixtures.recherche),
      lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(fixtures.pages.dns), http: creerHttpSimule(fixtures.pages.pages) }),
      places: creerPlacesSimule(fixtures.places),
      routes: creerRoutesSimule(fixtures.routes),
    },
  });
  return { resultat, lignes, appels, requetes };
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

  it("p0: mode simulé (pnpm p0) : aucun site vérifié, aucune source écrite, aucun appel de vérification (lot 2a, 0121 § 3.6)", async () => {
    const fixtures = fixturesRome((programme) => {
      for (const jour of programme.jours) for (const creneau of jour.creneaux) if (typeof creneau.lieu === "string") creneau.site = "https://site-officiel.example.org/";
    });
    const { resultat } = await executerSimule("rome-1", "rome", {}, fixtures);
    const programme = ProgrammeReduitSchema.parse(resultat.programme);
    const etapes = programme.trip.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : [])));
    expect(etapes.length).toBeGreaterThan(0);
    expect(etapes.every((etape) => etape.source === undefined)).toBe(true);
    expect(JSON.stringify(resultat)).not.toContain("site-officiel.example.org");
  });

  it("p0: infos pratiques et titre du jour de l'IA écrits dans les étapes et les jours, puis affichés (rome-1, lot 1 bis)", async () => {
    const { resultat, requetes } = await executerSimule("rome-1", "rome");
    // Le prompt ne porte que le brief : aucune donnée des fiches Places (identifiant, nom, adresse, niveau de prix).
    expect(requetes).toHaveLength(1);
    expect(requetes[0]).not.toMatch(/SENTINELLE/);
    const brief = lireBrief("rome-1");
    const modeles = FixturesModelesSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/fixtures/modeles/rome.json"), "utf8")));
    const ecrit = ordreEcrit(lireProgramme(JSON.stringify(modeles.programme), { arrivee: brief.arrivee, depart: brief.depart }).valeur!);
    const attendu = ecrit.jours.map((jour) => ({
      theme: jour.titre,
      etapes: jour.creneaux
        .filter((creneau) => creneau.lieu !== undefined && creneau.nature !== "arrivee" && creneau.nature !== "depart")
        .map((creneau) => ({ name: creneau.lieu, tip: creneau.conseil, priceNote: creneau.prix, hoursNote: creneau.horaires })),
    }));
    // La sortie simulée porte des conseils, des prix, des horaires et un titre par jour.
    const toutes = attendu.flatMap((jour) => jour.etapes);
    for (const champ of ["tip", "priceNote", "hoursNote"] as const) expect(toutes.some((etape) => etape[champ] !== undefined), champ).toBe(true);
    expect(attendu.every((jour) => jour.theme !== undefined)).toBe(true);

    const programme = ProgrammeReduitSchema.parse(resultat.programme);
    const adaptateur = createPrototypeAdapter({
      programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
      relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 9) }) } },
    });
    const trip = TripSchema.parse(await adaptateur.getTrip(ctx, programme.trip.id));
    const affiche = trip.days.map((jour) => ({
      theme: jour.theme,
      etapes: jour.items.flatMap((ligne) =>
        ligne.type === "stop" ? [{ name: ligne.stop.name, tip: ligne.stop.facts.tip, priceNote: ligne.stop.facts.priceNote, hoursNote: ligne.stop.facts.hoursNote }] : [],
      ),
    }));
    expect(affiche).toEqual(attendu);
    // Les fiches Places (nom, adresse, niveau de prix) n'atteignent ni le programme écrit ni les infos pratiques.
    expect(JSON.stringify(programme)).not.toMatch(/SENTINELLE[-_](?:NOM|ADRESSE|NIVEAU)/);
  });

  it("p0: info pratique ou titre du jour refusés par la règle du contrat, champ vide, programme complet (rome-1)", async () => {
    const fixtures = fixturesRome((sortie) => {
      const premier = sortie.jours[0]!;
      premier.titre = "Monti et le Colisée, voir colosseo.it";
      const avecLieu = premier.creneaux.filter((creneau) => typeof creneau.lieu === "string");
      avecLieu[0]!.conseil = "Commande sur fornoserpenti.it avant de venir.";
      avecLieu[1]!.prix = "18 €\u2028(avec le Forum)";
      avecLieu[2]!.horaires = "9:00 à 19:15, voir parcocolosseo\uFF0Ecom";
    });
    const { resultat } = await executerSimule("rome-1", "rome", {}, fixtures);
    const reference = await executerSimule("rome-1", "rome");
    expect(resultat.rapport.statut).toBe("complete");
    // Quatre champs retirés seuls et comptés ; aucun créneau ni aucune journée retirés.
    expect(resultat.rapport.programme.fieldsRemoved).toBe(reference.resultat.rapport.programme.fieldsRemoved + 4);
    expect(resultat.rapport.programme.slotsRemoved).toBe(reference.resultat.rapport.programme.slotsRemoved);
    expect(resultat.rapport.programme.days).toBe(reference.resultat.rapport.programme.days);
    const programme = ProgrammeReduitSchema.parse(resultat.programme);
    const [jour1, jour2] = programme.trip.days;
    expect(jour1!.theme).toBeUndefined();
    expect(jour2!.theme).toBe("Vatican et Prati");
    const etapes = jour1!.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
    expect(etapes[0]!.facts.tip).toBeUndefined();
    expect(etapes[0]!.facts.priceNote).toBe("8 à 12 € par personne");
    expect(etapes[1]!.facts.priceNote).toBeUndefined();
    expect(etapes[1]!.facts.tip).toBe("Réserve le créneau horaire en ligne, les billets partent vite.");
    expect(etapes[2]!.facts.hoursNote).toBeUndefined();
    expect(etapes[2]!.facts.tip).toBe("Entre par la via della Salara Vecchia pour éviter la file.");
    // Rien du texte refusé n'est écrit.
    expect(JSON.stringify(programme)).not.toMatch(/\.it\b|\u2028|\uFF0E/);
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
