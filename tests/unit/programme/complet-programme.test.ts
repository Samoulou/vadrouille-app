// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FixturesModelesSchema } from "@/ai/modeles.simule";
import { lieuxDuProgramme, lireProgramme, ordreEcrit } from "@/ai/sorties";
import type { TripSnapshot } from "@/contracts";
import { joursCandidatsApercu } from "@/domain/apercu";
import { PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { avecLieuxVerifies, etapesRestantes, programmeDesRestantes, villeDeLEtape } from "@/server/generation/complet-programme";
import { joursAVerifier } from "@/server/generation/etapes-programme";
import { requestIdDeVerification, requestIdDeVersion } from "@/server/generation/voyage-complet";
import { assemblerProgrammeIa, modeDeTrajet, type CreneauAssemble } from "@/server/programme/assemblage";
import type { BriefEssai, BriefProgramme } from "@/server/programme/forme";
import { instantaneDuProgramme } from "@/server/programme/instantane";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { lignesDuForfait } from "@/server/usage/forfait";
import { forfaitDuProfil, PROFILS_FORFAIT } from "@/server/usage/reservation";

/**
 * Voyage complet de la chaîne inversée (M1c, ticket 1048 ; réponse de Samuel à Q638), fonctions pures : journées vérifiées
 * avant le paiement, étapes restantes, programme reconstruit, version complétée (parité avec l'assemblage), profil de forfait
 * `verification`. Sortie simulée de Rome (`prototype/fixtures/modeles/rome.json`), identifiants sentinelles, aucun appel.
 */

const RACINE = process.cwd();
const BRIEF_ROME = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/rome-1.json"), "utf8")) as BriefEssai;
const ORG = "00000000-0000-4000-8000-0000000000aa";
const TRIP = "00000000-0000-4000-8000-0000000000bb";

function programmeDeRome() {
  const modeles = FixturesModelesSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/fixtures/modeles/rome.json"), "utf8")));
  const lecture = lireProgramme(JSON.stringify(modeles.programme), { arrivee: BRIEF_ROME.arrivee, depart: BRIEF_ROME.depart });
  if (lecture.valeur === null) throw new Error("fixture rome illisible");
  return ordreEcrit(lecture.valeur);
}

/** Instantané de Rome ; `ancre(indiceJour)` dit quelles journées reçoivent les `placeId` sentinelles de leurs lieux. */
function instantaneDeRome(ancre: (indiceJour: number) => boolean): TripSnapshot {
  const programme = programmeDeRome();
  const { lieux, cleDe } = lieuxDuProgramme(programme, BRIEF_ROME.destination);
  const rangDe = new Map(lieux.map((lieu, rang) => [lieu.id, rang]));
  const jours = programme.jours.map((jour, indiceJour) => ({
    date: jour.date,
    ...(jour.titre === undefined ? {} : { titre: jour.titre }),
    creneaux: jour.creneaux.map((creneau, rang): CreneauAssemble => {
      const cle = cleDe(indiceJour, rang);
      const rangLieu = cle === undefined ? undefined : rangDe.get(cle);
      const sansSite: Omit<typeof creneau, "site"> & { site?: unknown } = { ...creneau };
      delete sansSite.site;
      return {
        ...(sansSite as Omit<typeof creneau, "site">),
        ...(rangLieu === undefined || !ancre(indiceJour) ? {} : { placeId: `SENTINELLE_PLACE_ID_${String(rangLieu + 1).padStart(3, "0")}` }),
      };
    }),
  }));
  const complet = assemblerProgrammeIa({
    tripId: TRIP,
    organizationId: ORG,
    brief: BRIEF_ROME,
    jours,
    bonsPlans: programme.bonsPlans,
    logements: ["SENTINELLE_PLACE_ID_LOGEMENT"],
    configuration: CONFIGURATION_MOTEUR,
    mode: modeDeTrajet(BRIEF_ROME),
    trajets: () => undefined,
  });
  return instantaneDuProgramme(complet.trip);
}

const etapesDe = (instantane: TripSnapshot) => instantane.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [{ jour: jour.index, stop: ligne.stop }] : [])));

describe("voyage complet (chaîne inversée) : avant le paiement, les journées de l'aperçu (Q638)", () => {
  it("joursCandidatsApercu : J1 et J2 d'un voyage d'une ville ; une journée de changement de ville est passée, J1 jamais", () => {
    const jour = (index: number, transfert = false) => ({ index, items: transfert ? [{ type: "transfer" }] : [{ type: "stop" }] });
    expect([...joursCandidatsApercu([jour(3), jour(1), jour(2)])]).toEqual([1, 2]);
    expect([...joursCandidatsApercu([jour(1, true), jour(2, true), jour(3), jour(4)])]).toEqual([1, 3]);
    expect([...joursCandidatsApercu([jour(1)])]).toEqual([1]);
  });

  it("joursAVerifier : seules les journées de l'aperçu gardent leurs créneaux, indices inchangés", () => {
    const programme = programmeDeRome();
    const reduit = joursAVerifier(programme, { tripId: TRIP, organizationId: ORG, brief: BRIEF_ROME, logements: ["SENTINELLE_PLACE_ID_LOGEMENT"] });
    expect(reduit.jours).toHaveLength(programme.jours.length);
    reduit.jours.forEach((jour, indice) => {
      expect(jour.date).toBe(programme.jours[indice]!.date);
      expect(jour.creneaux).toEqual(indice < 2 ? programme.jours[indice]!.creneaux : []);
    });
    expect(reduit.bonsPlans).toEqual(programme.bonsPlans);
  });
});

describe("voyage complet (chaîne inversée) : lieux restants après le déblocage", () => {
  it("etapesRestantes : étapes sans placeId hors de l'aperçu seulement, dans l'ordre ; ni verrouillée, ni ajoutée, ni engagement", () => {
    const v1 = instantaneDeRome((indiceJour) => indiceJour < 2);
    const restantes = etapesRestantes(v1);
    const horsApercu = etapesDe(v1).filter((e) => e.jour > 2);
    expect(restantes.map((r) => r.stopId)).toEqual(horsApercu.map((e) => e.stop.id));
    expect(restantes.every((r) => r.jour > 2 && !r.apresChangement)).toBe(true);
    // Une étape de l'aperçu sans lieu n'est jamais revérifiée.
    const sansLieuApercu: TripSnapshot = {
      days: v1.days.map((jour) => (jour.index === 1 ? { ...jour, items: jour.items.map((l) => (l.type === "stop" ? { ...l, stop: { ...l.stop, placeId: undefined } } : l)) } : jour)),
    };
    expect(etapesRestantes(JSON.parse(JSON.stringify(sansLieuApercu)) as TripSnapshot)).toEqual(restantes);
    // Verrouillée, ajoutée par la personne, engagement : écartées.
    const [premiere, deuxieme, troisieme] = restantes;
    const marque: TripSnapshot = {
      days: v1.days.map((jour) => ({
        ...jour,
        items: jour.items.map((l) => {
          if (l.type !== "stop") return l;
          if (l.stop.id === premiere!.stopId) return { ...l, stop: { ...l.stop, locked: true } };
          if (l.stop.id === deuxieme!.stopId) return { ...l, stop: { ...l.stop, addedBy: "person" as const } };
          if (l.stop.id === troisieme!.stopId) return { ...l, stop: { ...l.stop, commitment: "reservation" as const } };
          return l;
        }),
      })),
    };
    expect(etapesRestantes(marque).map((r) => r.stopId)).toEqual(restantes.slice(3).map((r) => r.stopId));
    // Tout vérifié : rien ne reste.
    expect(etapesRestantes(instantaneDeRome(() => true))).toEqual([]);
  });

  it("programmeDesRestantes : nom et heure maison seulement, une journée par journée qui en a ; correspondance (jour, rang)", () => {
    const restantes = etapesRestantes(instantaneDeRome((indiceJour) => indiceJour < 2));
    const { programme, etapeDe } = programmeDesRestantes(restantes, BRIEF_ROME);
    expect(programme.bonsPlans).toEqual([]);
    const aplati = programme.jours.flatMap((jour, j) => jour.creneaux.map((creneau, r) => ({ creneau, stopId: etapeDe(j, r) })));
    expect(aplati.map((a) => a.stopId)).toEqual(restantes.map((r) => r.stopId));
    for (const [rang, { creneau }] of aplati.entries()) {
      expect(Object.keys(creneau).sort()).toEqual(["debut", "lieu", "nature"]);
      expect(creneau.lieu).toBe(restantes[rang]!.nom);
      expect(creneau.debut).toBe(restantes[rang]!.debut);
    }
    expect(JSON.stringify(programme)).not.toMatch(/SENTINELLE|placeId/);
    expect(etapeDe(99, 0)).toBeUndefined();
  });

  it("villeDeLEtape : aucune pour une ville ; plusieurs villes, celle du jour, ou celle quittée avant la ligne « Vers » et celle d'arrivée après", () => {
    expect(villeDeLEtape(BRIEF_ROME, { jour: 3, apresChangement: false })).toBeUndefined();
    const deux = {
      ...BRIEF_ROME,
      arrivee: "2027-05-04",
      villes: [
        { nom: "Rome", arrivee: "2027-05-04", nuits: 2, logement: "Monti" },
        { nom: "Florence", arrivee: "2027-05-06", nuits: 2, logement: "Oltrarno" },
      ],
      changements: [],
      billets: [],
      logements: [],
    } as unknown as BriefProgramme;
    expect(villeDeLEtape(deux, { jour: 2, apresChangement: false })).toBe("Rome");
    expect(villeDeLEtape(deux, { jour: 3, apresChangement: false })).toBe("Rome");
    expect(villeDeLEtape(deux, { jour: 3, apresChangement: true })).toBe("Florence");
    expect(villeDeLEtape(deux, { jour: 4, apresChangement: false })).toBe("Florence");
    expect(villeDeLEtape(deux, { jour: 9, apresChangement: false })).toBeNull();
  });

  it("avecLieuxVerifies : la version complétée est celle de l'assemblage avec tous les lieux vérifiés (placeId et segments)", () => {
    const v1 = instantaneDeRome((indiceJour) => indiceJour < 2);
    const attendu = instantaneDeRome(() => true);
    const placeIds = new Map(
      etapesDe(attendu)
        .filter((e) => e.jour > 2 && e.stop.placeId !== undefined)
        .map((e) => [e.stop.id, e.stop.placeId!] as const),
    );
    expect(placeIds.size).toBeGreaterThan(0);
    const complete = avecLieuxVerifies(v1, placeIds, modeDeTrajet(BRIEF_ROME));
    expect(JSON.parse(JSON.stringify(complete))).toEqual(JSON.parse(JSON.stringify(attendu)));
    // Journées sans étape vérifiée : mêmes objets.
    complete.days.forEach((jour, rang) => {
      if (jour.index <= 2) expect(jour).toBe(v1.days[rang]);
    });
    expect(avecLieuxVerifies(v1, new Map(), "walk").days.every((jour, rang) => jour === v1.days[rang])).toBe(true);
  });

  it("requestIdDeVerification : stable par passage, distinct d'un passage à l'autre et des versions d'un jour", () => {
    const ligne = { id: "0f0e0d0c-0b0a-4908-8706-050403020100", reprisesPersonne: 0, reprisesStudio: 0 };
    expect(requestIdDeVerification(ligne)).toBe(requestIdDeVerification({ ...ligne }));
    expect(requestIdDeVerification(ligne)).not.toBe(requestIdDeVerification({ ...ligne, reprisesPersonne: 1 }));
    for (let jour = 1; jour <= 15; jour += 1) expect(requestIdDeVerification(ligne)).not.toBe(requestIdDeVersion(ligne, jour));
  });
});

describe("voyage complet (chaîne inversée) : profil de forfait verification (Q639)", () => {
  it("forfait verification : Text Search et fiches seulement, aucun coût de modèle (requête refusée), aucune requête Routes", () => {
    expect(PROFILS_FORFAIT).toContain("verification");
    const table = TablePrixGoogleSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/prix-google.json"), "utf8")));
    const forfait = forfaitDuProfil(PLAFONDS_VARIANTE_SIMULEE, table, "verification");
    expect(forfait).toMatchObject({ nature: "execution", textSearchRequetes: 100, placeDetailsRequetes: 100, routesRequetes: 0, routesElements: 0, coutModelesMicros: null });
    // Lignes réservées dans `usage_ledger` : Text Search et fiches seulement, aucune ligne de modèles ni Routes.
    expect(lignesDuForfait(table, PLAFONDS_VARIANTE_SIMULEE.skus, "modeles_forfait", forfait).map((l) => l.sku)).toEqual(["places_text_search_essentials_ids_only", "places_details_enterprise"]);
  });
});
