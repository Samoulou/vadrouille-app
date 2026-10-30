// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EntreeProgrammeV5Schema, type EntreeProgrammeV5 } from "@/ai/entrees";
import { requeteProgrammeV5 } from "@/ai/requetes";
import { lireProgramme, ordreEcrit, type CreneauIa, type JourIa, type LectureProgramme, type ProgrammeIa } from "@/ai/sorties";

/**
 * Jeu d'évaluation hors réseau du prompt `programme` v5, plusieurs villes (M4a, ticket #920 ; spécification M4 § 14
 * « ia-recherche » ; décision 0148 § 5.1 point 4). Sorties **simulées** du prompt, écrites à la main
 * (`evals/programme-v5/`), avec l'entrée v5 que construira M4b : Rome puis Florence avec un billet saisi ; Lisbonne puis
 * Porto en départ estimé ; Paris, Lyon, Marseille au rythme « intense » ; et un contrôle qui viole le cadre partout.
 * Aucun appel payant, aucune donnée Google.
 *
 * Ce jeu **mesure l'adhésion** du prompt au cadre des journées de changement de ville ; il n'en fait **pas** un critère
 * d'acceptation (0148 § 5.1 point 4) : le cadrage et l'assemblage de M4b garantissent les règles quelle que soit la
 * sortie. Les mesures (des nombres, aucun nom de lieu) sont comparées au fichier commité
 * `evals/resultats/programme-v5.json` ; après un changement voulu d'un jeu ou de la mesure :
 * `pnpm vitest run tests/unit/evals/programme-v5.test.ts -u`, jamais en CI. Le créneau occupé suit 0148 § 5.3 et la fin
 * occupée d'une étape 0148 § 5.1 point 3 (a), recopiés ici comme **mesure** : la règle de production est celle de
 * `cadrerProgramme` (M4b).
 */

const RACINE = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(path.join(RACINE, chemin), "utf8"));
const RESULTATS = path.join(RACINE, "evals", "resultats", "programme-v5.json");

const JEUX = ["rome-florence-billet", "lisbonne-porto-estime", "paris-lyon-marseille-intense"] as const;
const CONTROLE = "controle-rome-florence";

/**
 * Valeurs de mesure lues dans `moteur.json` (revue de la PR #921, mineur 5) : `fenetreJour.fin` et `dureesParDefaut`,
 * natures de la sortie rapportées aux durées comme 0148 § 5.1 point 3 (a). Seul le créneau sans durée (180 minutes,
 * 0148 § 5.3) est écrit ici : la section `changementDeVille` de `moteur.json` vient avec M4b.
 */
const MOTEUR = lireJson("src/server/config/moteur.json") as { fenetreJour: { fin: string }; dureesParDefaut: { activity: number; lunch: number; dinner: number; evening: number } };
const FIN_DU_JOUR = MOTEUR.fenetreJour.fin;
const CRENEAU_SANS_DUREE_MINUTES = 180;
const { activity, lunch, dinner, evening } = MOTEUR.dureesParDefaut;
const DUREE_PAR_NATURE: Partial<Record<CreneauIa["nature"], number>> = { visite: activity, repas_midi: lunch, repas_soir: dinner, soiree: evening, apero: activity, pause: activity };
const NATURES_ACTIVITE: ReadonlySet<CreneauIa["nature"]> = new Set(["visite", "soiree", "pause"]);

type Fichier = { id: string; cas: string; entree: unknown; attendu: { incontournables: Record<string, string[][]> }; sortie: unknown };
type Cas = { id: string; entree: EntreeProgrammeV5; lecture: LectureProgramme; programme: ProgrammeIa; brute: unknown; attendu: Fichier["attendu"] };

function charger(id: string): Cas {
  const fichier = lireJson(`evals/programme-v5/${id}.json`) as Fichier;
  expect(fichier.id).toBe(id);
  expect(fichier.cas, id).toMatch(/programme v5/);
  const entree = EntreeProgrammeV5Schema.parse(fichier.entree);
  const joursDureeEstimee = entree.changements.filter((changement) => changement.source === "estime").map((changement) => changement.date);
  const lecture = lireProgramme(JSON.stringify(fichier.sortie), { arrivee: entree.arrivee, depart: entree.depart }, { joursDureeEstimee });
  expect(lecture.valeur, id).not.toBeNull();
  return { id, entree, lecture, programme: ordreEcrit(lecture.valeur!), brute: fichier.sortie, attendu: fichier.attendu };
}

const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");

/** Fin occupée d'une étape (0148 § 5.1 point 3 (a)) : `fin`, bornée à 23:59 si elle passe minuit ; sinon la durée de sa nature. */
function finOccupee(creneau: CreneauIa): number {
  const debut = minutes(creneau.debut);
  if (creneau.fin !== undefined) return minutes(creneau.fin) > debut ? minutes(creneau.fin) : minutes("23:59");
  if (creneau.nature === "pause" && creneau.lieu === undefined) return debut;
  return debut + (DUREE_PAR_NATURE[creneau.nature] ?? 0);
}

/** Créneau occupé par le changement de ville (0148 § 5.3), borné à la fin du jour. */
function creneauOccupe(changement: EntreeProgrammeV5["changements"][number], jour: JourIa | undefined): { debut: number; fin: number } {
  const debut = minutes(changement.depart);
  const fin =
    changement.source === "saisi"
      ? minutes(changement.arrivee ?? changement.depart)
      : debut + (jour?.dureeEstimeeMinutes ?? CRENEAU_SANS_DUREE_MINUTES);
  return { debut, fin: Math.min(fin, minutes(FIN_DU_JOUR)) };
}

type MesureChangement = {
  date: string;
  source: "saisi" | "estime";
  activites: number;
  activitesMax: number;
  activitesEnTrop: number;
  aReserver: number;
  aChevalOuPendantLeTrajet: number;
  titreEcrit: boolean;
  dureeEstimee: "lue" | "absente" | "non demandee";
  /** Le cadre est tenu sur tous les points ci-dessus. */
  adhesion: boolean;
};

function mesurer(cas: Cas) {
  const brute = cas.brute as { jours: { date: string; titre?: unknown; dureeEstimeeMinutes?: unknown; creneaux: Record<string, unknown>[] }[] };
  const changements: MesureChangement[] = cas.entree.changements.map((changement) => {
    const jour = cas.programme.jours.find((j) => j.date === changement.date);
    const occupe = creneauOccupe(changement, jour);
    const etapes = (jour?.creneaux ?? []).filter((creneau) => creneau.nature !== "arrivee" && creneau.nature !== "depart");
    const activites = etapes.filter((creneau) => NATURES_ACTIVITE.has(creneau.nature) && creneau.lieu !== undefined).length;
    const aReserver = etapes.filter((creneau) => creneau.aReserver === true).length;
    const aChevalOuPendantLeTrajet = etapes.filter((creneau) => !(finOccupee(creneau) <= occupe.debut || minutes(creneau.debut) >= occupe.fin)).length;
    const titreEcrit = brute.jours.find((j) => j.date === changement.date)?.titre !== undefined;
    const dureeEstimee = changement.source === "saisi" ? "non demandee" : jour?.dureeEstimeeMinutes === undefined ? "absente" : "lue";
    const activitesEnTrop = Math.max(0, activites - changement.activitesMax);
    return {
      date: changement.date,
      source: changement.source,
      activites,
      activitesMax: changement.activitesMax,
      activitesEnTrop,
      aReserver,
      aChevalOuPendantLeTrajet,
      titreEcrit,
      dureeEstimee,
      adhesion: activitesEnTrop === 0 && aReserver === 0 && aChevalOuPendantLeTrajet === 0 && !titreEcrit && dureeEstimee !== "absente",
    };
  });

  // Ville par créneau : jamais demandée par la v5 (0148 § 7.1 point 3) ; comptée sur la sortie brute.
  const villesParCreneau = brute.jours.reduce((total, jour) => total + jour.creneaux.filter((creneau) => "ville" in creneau).length, 0);

  // Incontournables attendus de chaque ville, trouvés sur une journée de cette ville (changement de ville compris).
  const villesDeLaDate = (date: string): string[] => {
    const rang = cas.entree.villes.reduce((dernier, ville, i) => (ville.arrivee <= date ? i : dernier), -1);
    const ville = cas.entree.villes[rang];
    if (ville === undefined) return [];
    const precedente = cas.entree.villes[rang - 1];
    return precedente !== undefined && ville.arrivee === date ? [precedente.nom, ville.nom] : [ville.nom];
  };
  const incontournables = Object.entries(cas.attendu.incontournables).map(([ville, attendus]) => {
    const lieux = cas.programme.jours
      .filter((jour) => villesDeLaDate(jour.date).includes(ville))
      .flatMap((jour) => jour.creneaux.flatMap((creneau) => (creneau.lieu === undefined ? [] : [normaliser(creneau.lieu)])));
    return { ville, attendus: attendus.length, surSesJours: attendus.filter((variantes) => variantes.some((v) => lieux.some((lieu) => lieu.includes(normaliser(v))))).length };
  });

  return {
    cas: cas.id,
    lecture: {
      joursRetires: cas.lecture.joursRetires,
      creneauxRetires: cas.lecture.creneauxRetires,
      champsRetires: cas.lecture.champsRetires,
      textesCoupes: cas.lecture.textesCoupes,
    },
    changements,
    adhesion: { journees: changements.length, tenues: changements.filter((m) => m.adhesion).length },
    villesParCreneau,
    incontournables,
  };
}

describe("evals: programme v5, plusieurs villes (M4a ; 0148 § 5.1 point 4)", () => {
  it.each(JEUX)("%s : entrée v5 valide ; sortie lue sans perte par la lecture de production", (id) => {
    const cas = charger(id);
    expect(cas.lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0, textesCoupes: 0 });
    // Une journée par date du séjour.
    const jours = (Date.parse(cas.entree.depart) - Date.parse(cas.entree.arrivee)) / 86_400_000 + 1;
    expect(cas.programme.jours).toHaveLength(jours);
  });

  it.each(JEUX)("%s : requête v5 sans donnée Google ni ville par créneau demandée", (id) => {
    const cas = charger(id);
    const requete = JSON.stringify(requeteProgrammeV5(cas.entree, "modele-test", { data_collection: "deny", zdr: true }));
    for (const cle of ["placeId", "place_id", "lat", "lng", "location", "duration", "distanceMeters", "ville"]) expect(requete, cle).not.toContain(`\\"${cle}\\"`);
  });

  it("Rome puis Florence : le libellé du billet n'est ni dans l'entrée ni dans la requête ; ses heures y sont", () => {
    const cas = charger("rome-florence-billet");
    const requete = JSON.stringify(requeteProgrammeV5(cas.entree, "modele-test", { data_collection: "deny", zdr: true }));
    expect(requete).not.toMatch(/Train|billet de train/i);
    expect(requete).toContain('\\"depart\\":\\"12:10\\"');
    expect(requete).toContain('\\"arrivee\\":\\"13:45\\"');
  });

  it("Lisbonne puis Porto : durée estimée lue, arrondie aux 5 minutes ; Paris, Lyon, Marseille : deux durées lues", () => {
    expect(charger("lisbonne-porto-estime").programme.jours.find((jour) => jour.date === "2027-06-13")?.dureeEstimeeMinutes).toBe(180);
    const plm = charger("paris-lyon-marseille-intense");
    expect(plm.entree.villes).toHaveLength(3);
    expect(plm.entree.rythme).toBe("intense");
    expect(plm.programme.jours.filter((jour) => jour.dureeEstimeeMinutes !== undefined).map((jour) => [jour.date, jour.dureeEstimeeMinutes])).toEqual([
      ["2027-09-04", 150],
      ["2027-09-06", 120],
    ]);
  });

  it("la mesure mord : le contrôle viole le cadre sur chaque point mesuré", () => {
    const mesure = mesurer(charger(CONTROLE));
    const [changement] = mesure.changements;
    expect(changement).toMatchObject({ titreEcrit: true, adhesion: false, aReserver: 1, activitesEnTrop: 3 });
    expect(changement!.aChevalOuPendantLeTrajet).toBe(2);
    expect(mesure.villesParCreneau).toBe(6);
    // La durée écrite sur un départ saisi est retirée et comptée à la lecture (0149 S-M4-2 point 2).
    expect(mesure.lecture.champsRetires).toBe(1);
    expect(mesure.adhesion).toEqual({ journees: 1, tenues: 0 });
  });

  it("mesures d'adhésion commitées (evals/resultats/programme-v5.json), sans nom de lieu", async () => {
    const mesures = [...JEUX, CONTROLE].map((id) => mesurer(charger(id)));
    const attendu = `${JSON.stringify({ schema: 1, mode: "simule", prompt: { id: "programme", version: 5 }, mesures }, null, 2)}\n`;
    // Aucun nom de lieu dans les mesures (evals/README.md) : seuls les noms de ville maison et des nombres.
    for (const cas of [...JEUX, CONTROLE].map(charger)) {
      for (const jour of cas.programme.jours) for (const creneau of jour.creneaux) if (creneau.lieu !== undefined) expect(attendu).not.toContain(`"${creneau.lieu}"`);
    }
    // Mise à jour voulue : `pnpm vitest run tests/unit/evals/programme-v5.test.ts -u` (jamais en CI).
    await expect(attendu).toMatchFileSnapshot(RESULTATS);
  });
});
