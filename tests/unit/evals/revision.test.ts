// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EntreeRevisionSchema } from "@/ai/entree-revision";
import { requeteRevision } from "@/ai/requetes";
import { lireProgramme, ordreEcrit, type ProgrammeIa } from "@/ai/sorties";
import type { Category } from "@/contracts";
import { BriefSchema, type Brief } from "@/prototype/brief";
import { entreeRevisionDepuisProgramme, nomNormalise, retirerEtapesEcartees } from "@/server/p0/revision";

/**
 * Jeu d'évaluation hors réseau du prompt `revision` v1 (spécification E2E-essai, lot 4 ; décision 0126). La version
 * précédente est une sortie simulée du prompt `programme` (`evals/programme/<id>.json`) ; la révision est une sortie
 * **simulée** du prompt `revision` (`evals/revision/<id>.json`), écrite à la main, avec les choix du tri exprimés par les
 * noms de la version précédente (convertis ici en identifiants maison `j<jour>-<rang>`, comme à l'écriture). Mesures de la
 * sortie, jamais des règles du prompt ni du code : aucune étape « Pas pour moi » ne revient (même sous un nom
 * normalisé), les étapes aimées restent le même jour, aucune étape ne relève d'une catégorie « à éviter » (repères de
 * `evals/programme/config.json`), et l'entrée de la révision ne porte aucune donnée Google. Le contrôle (la version
 * précédente) prouve que la mesure mord. Ce jeu prouve le schéma et la mesure, pas la qualité. Aucune donnée Google.
 */

const RACINE = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(path.join(RACINE, chemin), "utf8"));
const JEUX = ["rome-a-eviter-1"] as const;

type Reperes = Record<Category, { natures: string[]; motsCles: string[] }>;
const REPERES = (lireJson("evals/programme/config.json") as { aEviter: { reperes: Reperes } }).aEviter.reperes;

type FichierProgramme = { brief: string; briefModifie?: Record<string, unknown>; sortie: unknown };
type FichierRevision = { id: string; programme: string; cas: string; choix: { pasPourMoi: string[]; jAime: string[] }; sortie: unknown };

function lire(sortie: unknown, brief: Brief): ProgrammeIa {
  const lecture = lireProgramme(JSON.stringify(sortie), { arrivee: brief.arrivee, depart: brief.depart });
  // La sortie simulée passe la lecture de production sans rien perdre.
  expect(lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0, textesCoupes: 0 });
  return ordreEcrit(lecture.valeur!);
}

/** Version précédente sous la forme du programme écrit : étapes `j<jour>-<rang>` (rang parmi les lieux du jour). */
function versionEcrite(programme: ProgrammeIa) {
  return {
    trip: {
      days: programme.jours.map((jour, index) => ({
        index,
        date: jour.date,
        ...(jour.titre === undefined ? {} : { theme: jour.titre }),
        items: jour.creneaux
          .filter((creneau) => creneau.lieu !== undefined)
          .map((creneau, rang) => ({
            type: "stop",
            stop: {
              id: `j${index + 1}-${rang + 1}`,
              name: creneau.lieu,
              kind: creneau.nature.startsWith("repas") ? "meal" : "visit",
              start: creneau.debut,
              ...(creneau.fin === undefined ? {} : { end: creneau.fin }),
              ...(creneau.pourquoi === undefined ? {} : { reason: creneau.pourquoi }),
              // Champs Google et verdicts posés en sentinelles : l'entrée ne doit jamais les reprendre.
              placeId: "SENTINELLE_PLACE_ID",
              position: { lat: 41.9, lng: 12.5 },
              exceptions: ["SENTINELLE_BADGE"],
              facts: { ...(creneau.quartier === undefined ? {} : { area: creneau.quartier }), durationMinutes: 4242 },
            },
          })),
      })),
    },
  } as never;
}

function charger(id: string) {
  const revision = lireJson(`evals/revision/${id}.json`) as FichierRevision;
  expect(revision.id).toBe(id);
  expect(revision.cas, id).toContain("prompt revision v1");
  const precedent = lireJson(`evals/programme/${revision.programme}.json`) as FichierProgramme;
  const brief = BriefSchema.parse({ ...(lireJson(`prototype/briefs/${precedent.brief}.json`) as object), ...precedent.briefModifie });
  const avant = lire(precedent.sortie, brief);
  const apres = lire(revision.sortie, brief);
  const ecrite = versionEcrite(avant);
  const etapes = (ecrite as { trip: { days: { date: string; items: { stop: { id: string; name: string } }[] }[] } }).trip.days.flatMap((jour) =>
    jour.items.map((item) => ({ date: jour.date, ...item.stop })),
  );
  const idDe = (nom: string) => {
    const trouvees = etapes.filter((etape) => etape.name === nom);
    expect(trouvees, `${id} : ${nom}`).toHaveLength(1);
    return trouvees[0]!;
  };
  return { id, brief, avant, apres, ecrite, choix: revision.choix, idDe };
}

const lieux = (programme: ProgrammeIa) => programme.jours.flatMap((jour) => jour.creneaux.flatMap((creneau) => (creneau.lieu === undefined ? [] : [{ date: jour.date, ...creneau }])));
const normaliser = (texte: string) => nomNormalise(texte);
const motEntier = (texte: string, mot: string) => ` ${normaliser(texte)} `.includes(` ${normaliser(mot)} `);
const etapesAEviter = (programme: ProgrammeIa, categories: readonly Category[]) =>
  lieux(programme).filter((creneau) => categories.some((c) => REPERES[c].natures.includes(creneau.nature) || REPERES[c].motsCles.some((mot) => motEntier(creneau.lieu!, mot))));

describe("evals: révision après le tri (E2E-essai, lot 4 ; décision 0126)", () => {
  it.each(JEUX)("%s : aucune étape « Pas pour moi » ne revient, les étapes aimées restent le même jour", (id) => {
    const cas = charger(id);
    const ecartes = new Set(cas.choix.pasPourMoi.map(normaliser));
    expect(lieux(cas.apres).filter((creneau) => ecartes.has(normaliser(creneau.lieu!)))).toEqual([]);
    for (const nom of cas.choix.jAime) {
      const avant = cas.idDe(nom);
      expect(lieux(cas.apres).some((creneau) => creneau.date === avant.date && normaliser(creneau.lieu!) === normaliser(nom)), nom).toBe(true);
    }
    // Chaque étape écartée est remplacée : même nombre de lieux par jour.
    for (const [rang, jour] of cas.apres.jours.entries()) expect(jour.creneaux.length, jour.date).toBe(cas.avant.jours[rang]!.creneaux.length);
    // Le filet du code n'a rien à retirer d'une sortie conforme.
    expect(retirerEtapesEcartees(cas.apres, cas.choix.pasPourMoi).retires).toBe(0);
  });

  it.each(JEUX)("%s : la règle « à éviter » tient après la révision", (id) => {
    const cas = charger(id);
    expect(cas.brief.aEviter?.length ?? 0).toBeGreaterThan(0);
    expect(etapesAEviter(cas.apres, cas.brief.aEviter!)).toEqual([]);
  });

  it.each(JEUX)("%s : l'entrée de la révision ne porte que des textes de l'IA et des choix (canari)", (id) => {
    const cas = charger(id);
    const entree = entreeRevisionDepuisProgramme(cas.ecrite, cas.brief, {
      pasPourMoi: cas.choix.pasPourMoi.map((nom) => cas.idDe(nom).id),
      jAime: cas.choix.jAime.map((nom) => cas.idDe(nom).id),
    });
    const requete = JSON.stringify(requeteRevision(EntreeRevisionSchema.parse(entree), "modele-test", { zdr: true, data_collection: "deny" } as never));
    for (const valeur of ["SENTINELLE", "41.9", "4242"]) expect(requete).not.toContain(valeur);
    for (const cle of ["placeId", "position", "exceptions", "durationMinutes"]) expect(requete).not.toContain(`"${cle}"`);
    for (const nom of cas.choix.pasPourMoi) expect(requete).toContain(nom);
  });

  it.each(JEUX)("%s : la mesure mord (contrôle : la version précédente a les étapes écartées)", (id) => {
    const cas = charger(id);
    const ecartes = new Set(cas.choix.pasPourMoi.map(normaliser));
    expect(lieux(cas.avant).filter((creneau) => ecartes.has(normaliser(creneau.lieu!)))).toHaveLength(cas.choix.pasPourMoi.length);
    expect(retirerEtapesEcartees(cas.avant, cas.choix.pasPourMoi).retires).toBe(cas.choix.pasPourMoi.length);
  });
});
