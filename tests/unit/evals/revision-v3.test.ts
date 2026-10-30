// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EntreeRevisionV3Schema, type EntreeRevisionV3 } from "@/ai/entree-revision";
import { EntreeProgrammeV5Schema, type EntreeProgrammeV5 } from "@/ai/entrees";
import { requeteRevisionV3 } from "@/ai/requetes";
import { cadreLectureChangements, lireProgramme, NATURES_CRENEAU, ordreEcrit, type CreneauIa, type LectureProgramme, type ProgrammeIa } from "@/ai/sorties";
import { entreeRevisionDepuisJours, nomNormalise, retirerEtapesEcartees, type JourRevisable } from "@/server/programme/revision";

/**
 * Jeu d'évaluation hors réseau du prompt `revision` v3, plusieurs villes (M4a-2, ticket #926 ; décision 0148 § 8 point 2).
 * La version précédente est une sortie simulée du prompt `programme` v5 (`evals/programme-v5/<id>.json`) ; la révision
 * est une sortie **simulée** du prompt `revision` v3 (`evals/revision-v3/<id>.json`), écrite à la main, avec les choix du
 * tri exprimés par les noms de la version précédente (convertis ici en identifiants maison `j<jour>-<rang>`). Cas : Rome
 * puis Florence, une étape remplacée dans la ville 2 ; Rome puis Florence, révision des deux côtés du trajet le jour du
 * changement de ville ; Lisbonne puis Porto (départ estimé), révision le jour du changement de ville ; un contrôle qui
 * viole tout. Aucun appel payant, aucune donnée Google.
 *
 * L'entrée v3 est construite comme le fera M4b : `entreeRevisionDepuisJours` (`src/server/programme/revision.ts`) sur des
 * journées qui portent des champs Google sentinelles et, le jour du changement de ville, un titre écrit par le code ; le
 * brief v5, **sans récit** (garde du récit). La sortie est lue par la lecture de production (`lireProgramme`, cadre
 * `cadreLectureChangements`). Mesures de la sortie (des nombres, aucun nom de lieu), jamais un critère d'acceptation : le
 * cadrage et l'assemblage de M4b garantissent le cadre quelle que soit la sortie. Mesures commitées dans
 * `evals/resultats/revision-v3.json` ; après un changement voulu : `pnpm vitest run tests/unit/evals/revision-v3.test.ts -u`,
 * jamais en CI. La fin occupée d'une étape suit 0148 § 5.1 point 3 (a), comme `tests/unit/evals/programme-v5.test.ts`.
 */

const RACINE = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(path.join(RACINE, chemin), "utf8"));
const RESULTATS = path.join(RACINE, "evals", "resultats", "revision-v3.json");

const JEUX = ["rome-florence-ville2", "rome-florence-jour-changement", "lisbonne-porto-jour-changement"] as const;
const CONTROLE = "controle-rome-florence-jour-changement";
const TITRE_CODE = "SENTINELLE_TITRE_DU_CODE";

const MOTEUR = lireJson("src/server/config/moteur.json") as { fenetreJour: { fin: string }; dureesParDefaut: { activity: number; lunch: number; dinner: number; evening: number } };
const CRENEAU_SANS_DUREE_MINUTES = 180;
const { activity, lunch, dinner, evening } = MOTEUR.dureesParDefaut;
const DUREE_PAR_NATURE: Partial<Record<CreneauIa["nature"], number>> = { visite: activity, repas_midi: lunch, repas_soir: dinner, soiree: evening, apero: activity, pause: activity };
const NATURES_ACTIVITE: ReadonlySet<CreneauIa["nature"]> = new Set(["visite", "soiree", "pause"]);
const NATURES_REPAS: ReadonlySet<CreneauIa["nature"]> = new Set(["repas_midi", "repas_soir", "apero"]);

type FichierProgramme = { entree: unknown; sortie: unknown };
type FichierRevision = { id: string; programme: string; cas: string; choix: { pasPourMoi: string[]; jAime: string[] }; sortie: unknown };

const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

function finOccupee(creneau: CreneauIa): number {
  const debut = minutes(creneau.debut);
  if (creneau.fin !== undefined) return minutes(creneau.fin) > debut ? minutes(creneau.fin) : minutes("23:59");
  if (creneau.nature === "pause" && creneau.lieu === undefined) return debut;
  return debut + (DUREE_PAR_NATURE[creneau.nature] ?? 0);
}

function lire(sortie: unknown, brief: EntreeProgrammeV5): { lecture: LectureProgramme; programme: ProgrammeIa } {
  const lecture = lireProgramme(JSON.stringify(sortie), { arrivee: brief.arrivee, depart: brief.depart }, cadreLectureChangements(brief.changements));
  expect(lecture.valeur).not.toBeNull();
  return { lecture, programme: ordreEcrit(lecture.valeur!) };
}

/**
 * Version précédente sous la forme de l'instantané (`JourRevisable`) : étapes `j<jour>-<rang>` (rang parmi les lieux du
 * jour), champs Google et verdicts en sentinelles, titre du jour de changement de ville écrit par le code (sentinelle).
 */
function versionEcrite(programme: ProgrammeIa, changements: ReadonlySet<string>): JourRevisable[] {
  return programme.jours.map((jour, index) => ({
    index,
    date: jour.date,
    ...(changements.has(jour.date) ? { theme: TITRE_CODE } : jour.titre === undefined ? {} : { theme: jour.titre }),
    items: [
      ...(changements.has(jour.date) ? [{ type: "transfer", transfer: { label: "SENTINELLE_LIBELLE_BILLET", start: "12:10" } }] : []),
      ...jour.creneaux
        .filter((creneau) => creneau.lieu !== undefined)
        .map((creneau, rang) => ({
          type: "stop",
          stop: {
            id: `j${index + 1}-${rang + 1}`,
            name: creneau.lieu!,
            kind: NATURES_REPAS.has(creneau.nature) ? "meal" : "visit",
            start: creneau.debut,
            ...(creneau.fin === undefined ? {} : { end: creneau.fin }),
            ...(creneau.pourquoi === undefined ? {} : { reason: creneau.pourquoi }),
            placeId: "SENTINELLE_PLACE_ID",
            position: { lat: 41.9, lng: 12.5 },
            exceptions: ["SENTINELLE_BADGE"],
            facts: { ...(creneau.quartier === undefined ? {} : { area: creneau.quartier }), durationMinutes: 4242 },
          },
        })),
    ],
  }));
}

function charger(id: string) {
  const revision = lireJson(`evals/revision-v3/${id}.json`) as FichierRevision;
  expect(revision.id).toBe(id);
  expect(revision.cas, id).toMatch(/revision v3/);
  const precedent = lireJson(`evals/programme-v5/${revision.programme}.json`) as FichierProgramme;
  // Garde du récit : la révision ne reçoit jamais le récit (0139 § 1.2) ; le brief v5 du jeu précédent en a un, retiré ici.
  const brief: EntreeProgrammeV5 = { ...EntreeProgrammeV5Schema.parse(precedent.entree) };
  delete brief.recit;
  const changements = new Set(brief.changements.map((changement) => changement.date));
  const avant = lire(precedent.sortie, brief).programme;
  const apres = lire(revision.sortie, brief);
  const jours = versionEcrite(avant, changements);
  const etapes = jours.flatMap((jour) => jour.items.flatMap((item) => (item.stop === undefined ? [] : [{ date: jour.date, ...item.stop }])));
  const idDe = (nom: string) => {
    const trouvees = etapes.filter((etape) => etape.name === nom);
    expect(trouvees, `${id} : ${nom}`).toHaveLength(1);
    return trouvees[0]!;
  };
  const choix = { pasPourMoi: revision.choix.pasPourMoi.map((nom) => idDe(nom).id), jAime: revision.choix.jAime.map((nom) => idDe(nom).id) };
  const construite = entreeRevisionDepuisJours(jours, brief as never, choix);
  const entree: EntreeRevisionV3 = EntreeRevisionV3Schema.parse({ brief, programme: construite.programme, choix: construite.choix });
  return { id, brief, avant, apres: apres.programme, lecture: apres.lecture, brute: revision.sortie, choix: revision.choix, idDe, entree };
}
type Cas = ReturnType<typeof charger>;

const lieuxDuJour = (programme: ProgrammeIa, date: string) => programme.jours.find((jour) => jour.date === date)?.creneaux.filter((creneau) => creneau.lieu !== undefined) ?? [];
const tousLesLieux = (programme: ProgrammeIa) => new Set(programme.jours.flatMap((jour) => jour.creneaux.flatMap((creneau) => (creneau.lieu === undefined ? [] : [nomNormalise(creneau.lieu)]))));

function mesurer(cas: Cas) {
  const brute = cas.brute as { jours: { date: string; titre?: unknown; creneaux: Record<string, unknown>[] }[] } & Record<string, unknown>;
  const apres = tousLesLieux(cas.apres);
  const avant = tousLesLieux(cas.avant);

  // Étapes écartées : aucune ne revient ; chacune est remplacée le même jour, pour le même usage, à peu près au même moment
  // (90 minutes), par un lieu nouveau ; le jour d'un changement de ville, du même côté du trajet.
  const changementDe = (date: string) => cas.brief.changements.find((changement) => changement.date === date);
  const occupe = (date: string) => {
    const changement = changementDe(date);
    if (changement === undefined) return undefined;
    const jour = cas.apres.jours.find((j) => j.date === date);
    const fin = changement.source === "saisi" ? minutes(changement.arrivee ?? changement.depart) : minutes(changement.depart) + (jour?.dureeEstimeeMinutes ?? CRENEAU_SANS_DUREE_MINUTES);
    return { debut: minutes(changement.depart), fin: Math.min(fin, minutes(MOTEUR.fenetreJour.fin)) };
  };
  const utilises = new Set<CreneauIa>();
  const ecartees = cas.choix.pasPourMoi.map((nom) => {
    const etape = cas.idDe(nom);
    const repas = etape.kind === "meal";
    const trajet = occupe(etape.date);
    const avantLeTrajet = trajet !== undefined && minutes(etape.start) < trajet.debut;
    const remplacant = lieuxDuJour(cas.apres, etape.date).find(
      (creneau) =>
        !utilises.has(creneau) &&
        !avant.has(nomNormalise(creneau.lieu!)) &&
        NATURES_REPAS.has(creneau.nature) === repas &&
        Math.abs(minutes(creneau.debut) - minutes(etape.start)) <= 90,
    );
    if (remplacant !== undefined) utilises.add(remplacant);
    const bonCote =
      remplacant !== undefined && (trajet === undefined || (avantLeTrajet ? finOccupee(remplacant) <= trajet.debut : minutes(remplacant.debut) >= trajet.fin));
    return { jourDeChangement: trajet !== undefined, revient: apres.has(nomNormalise(nom)), remplacee: remplacant !== undefined, memeCoteDuTrajet: bonCote };
  });
  const aimees = cas.choix.jAime.map((nom) => {
    const etape = cas.idDe(nom);
    return lieuxDuJour(cas.apres, etape.date).some((creneau) => nomNormalise(creneau.lieu!) === nomNormalise(nom));
  });

  // Cadre du jour de changement de ville, mesuré comme `tests/unit/evals/programme-v5.test.ts`.
  const changements = cas.brief.changements.map((changement) => {
    const jour = cas.apres.jours.find((j) => j.date === changement.date);
    const trajet = occupe(changement.date)!;
    const etapes = (jour?.creneaux ?? []).filter((creneau) => creneau.nature !== "arrivee" && creneau.nature !== "depart");
    const activites = etapes.filter((creneau) => NATURES_ACTIVITE.has(creneau.nature) && creneau.lieu !== undefined).length;
    const aReserver = etapes.filter((creneau) => creneau.aReserver === true).length;
    const aChevalOuPendantLeTrajet = etapes.filter((creneau) => !(finOccupee(creneau) <= trajet.debut || minutes(creneau.debut) >= trajet.fin)).length;
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

  // Ville par créneau et `transfer` : jamais demandés ; comptés sur la sortie brute (clés et natures hors de la liste).
  const natures = new Set<string>(NATURES_CRENEAU);
  const villesParCreneau = brute.jours.reduce((total, jour) => total + jour.creneaux.filter((creneau) => "ville" in creneau).length, 0);
  const transfers =
    ("transfer" in brute ? 1 : 0) +
    brute.jours.reduce(
      (total, jour) => total + ("transfer" in jour ? 1 : 0) + jour.creneaux.filter((creneau) => "transfer" in creneau || !natures.has(String(creneau.nature))).length,
      0,
    );

  return {
    cas: cas.id,
    lecture: {
      joursRetires: cas.lecture.joursRetires,
      creneauxRetires: cas.lecture.creneauxRetires,
      champsRetires: cas.lecture.champsRetires,
      textesCoupes: cas.lecture.textesCoupes,
    },
    ecartees: {
      total: ecartees.length,
      leJourDuChangement: ecartees.filter((e) => e.jourDeChangement).length,
      reviennent: ecartees.filter((e) => e.revient).length,
      remplacees: ecartees.filter((e) => e.remplacee).length,
      memeCoteDuTrajet: ecartees.filter((e) => e.jourDeChangement && e.memeCoteDuTrajet).length,
    },
    aimees: { total: aimees.length, gardeesLeMemeJour: aimees.filter(Boolean).length },
    filetDuCode: retirerEtapesEcartees(cas.apres, cas.choix.pasPourMoi).retires,
    changements,
    adhesion: { journees: changements.length, tenues: changements.filter((m) => m.adhesion).length },
    villesParCreneau,
    transfers,
  };
}

describe("evals: revision v3, plusieurs villes (M4a-2 ; 0148 § 8 point 2)", () => {
  it.each(JEUX)("%s : entrée v3 valide ; sortie lue sans perte par la lecture de production ; une journée par date", (id) => {
    const cas = charger(id);
    expect(cas.lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0, textesCoupes: 0 });
    const jours = (Date.parse(cas.brief.depart) - Date.parse(cas.brief.arrivee)) / 86_400_000 + 1;
    expect(cas.apres.jours).toHaveLength(jours);
  });

  it.each([...JEUX, CONTROLE])("%s : requête v3 sans donnée Google, ni libellé du billet, ni titre du code, ni récit, ni transfer", (id) => {
    const cas = charger(id);
    const requete = JSON.stringify(requeteRevisionV3(cas.entree, "modele-test", { data_collection: "deny", zdr: true }));
    for (const valeur of ["SENTINELLE", "41.9", "4242", "Train", "recit"]) expect(requete, valeur).not.toContain(valeur);
    for (const cle of ["placeId", "place_id", "position", "exceptions", "durationMinutes", "lat", "lng", "ville", "transfer", "theme"]) expect(requete, cle).not.toContain(`\\"${cle}\\"`);
    // Les étapes écartées sont nommées (textes de l'IA) ; le cadre du changement de ville passe.
    for (const nom of cas.choix.pasPourMoi) expect(requete).toContain(nom);
    expect(requete).toContain('\\"activitesMax\\"');
  });

  it("Rome puis Florence : l'étape écartée de la ville 2 est remplacée le même jour, les étapes aimées restent", () => {
    const mesure = mesurer(charger("rome-florence-ville2"));
    expect(mesure.ecartees).toEqual({ total: 1, leJourDuChangement: 0, reviennent: 0, remplacees: 1, memeCoteDuTrajet: 0 });
    expect(mesure.aimees).toEqual({ total: 2, gardeesLeMemeJour: 2 });
    expect(mesure.adhesion).toEqual({ journees: 1, tenues: 1 });
  });

  it("Rome puis Florence, jour du changement de ville : remplaçants des deux côtés du trajet, cadre tenu", () => {
    const mesure = mesurer(charger("rome-florence-jour-changement"));
    expect(mesure.ecartees).toEqual({ total: 2, leJourDuChangement: 2, reviennent: 0, remplacees: 2, memeCoteDuTrajet: 2 });
    expect(mesure.aimees).toEqual({ total: 1, gardeesLeMemeJour: 1 });
    expect(mesure.changements[0]).toMatchObject({ source: "saisi", adhesion: true, titreEcrit: false });
  });

  it("Lisbonne puis Porto, départ estimé : durée réécrite lue et arrondie (178 → 180), remplaçant après le trajet", () => {
    const cas = charger("lisbonne-porto-jour-changement");
    expect(cas.apres.jours.find((jour) => jour.date === "2027-06-13")?.dureeEstimeeMinutes).toBe(180);
    const mesure = mesurer(cas);
    expect(mesure.ecartees).toMatchObject({ remplacees: 1, memeCoteDuTrajet: 1, reviennent: 0 });
    expect(mesure.changements[0]).toMatchObject({ source: "estime", dureeEstimee: "lue", adhesion: true });
  });

  it("la mesure mord : le contrôle viole chaque point mesuré, la lecture retire la durée d'un départ saisi et le transfer", () => {
    const mesure = mesurer(charger(CONTROLE));
    expect(mesure.ecartees).toMatchObject({ reviennent: 2, remplacees: 0, memeCoteDuTrajet: 0 });
    expect(mesure.aimees.gardeesLeMemeJour).toBe(0);
    expect(mesure.filetDuCode).toBe(2);
    expect(mesure.changements[0]).toMatchObject({ titreEcrit: true, adhesion: false, aReserver: 1 });
    expect(mesure.changements[0]!.activitesEnTrop).toBeGreaterThan(0);
    expect(mesure.changements[0]!.aChevalOuPendantLeTrajet).toBeGreaterThan(0);
    expect(mesure.villesParCreneau).toBe(3);
    expect(mesure.transfers).toBe(2);
    // Durée sur un départ saisi et clé `transfer` du jour : retirées et comptées ; créneau de nature `transfer` : retiré.
    expect(mesure.lecture).toMatchObject({ champsRetires: 2, creneauxRetires: 1 });
    expect(mesure.adhesion).toEqual({ journees: 1, tenues: 0 });
  });

  it("mesures commitées (evals/resultats/revision-v3.json), sans nom de lieu", async () => {
    const cas = [...JEUX, CONTROLE].map(charger);
    const mesures = cas.map(mesurer);
    const attendu = `${JSON.stringify({ schema: 1, mode: "simule", prompt: { id: "revision", version: 3 }, mesures }, null, 2)}\n`;
    for (const un of cas) {
      for (const programme of [un.avant, un.apres]) for (const jour of programme.jours) for (const creneau of jour.creneaux) if (creneau.lieu !== undefined) expect(attendu).not.toContain(creneau.lieu);
    }
    // Mise à jour voulue : `pnpm vitest run tests/unit/evals/revision-v3.test.ts -u` (jamais en CI).
    await expect(attendu).toMatchFileSnapshot(RESULTATS);
  });
});
