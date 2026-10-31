// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { FixturesModelesSchema } from "@/ai/modeles.simule";
import { lieuxDuProgramme, lireProgramme, ordreEcrit } from "@/ai/sorties";
import type { Trip } from "@/contracts";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { reduireProgramme } from "@/prototype/reduction";
import { reduireSite } from "@/research/fetch-page";
import {
  CHAINE_APERCU,
  CASES_APERCU,
  RECIT_API_AUTORISE,
} from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import {
  jeuDeFixtures,
  JEUX_PAR_DESTINATION,
} from "@/server/composition/fixtures-simulees";
import {
  casesDuProgramme,
  retenirApercu,
  statutDesCases,
} from "@/server/generation/cases-programme";
import { chaineDe } from "@/server/generation/chaine";
import { resoudre } from "@/server/generation/dependances";
import {
  identifiantBonPlan,
  lignesAFaire,
} from "@/server/generation/etapes-programme";
import {
  CODES_REESSAYABLES,
  CODES_REESSAYABLES_CHAINE_INVERSEE,
  echecDeCode,
  echecSelonChaine,
  relancableSelonChaine,
} from "@/server/generation/raison-echec";
import { CHAMPS_ADMIS_PAR_EVENEMENT, formatLogLine } from "@/server/log";
import {
  assemblerProgrammeIa,
  modeDeTrajet,
  type CreneauAssemble,
} from "@/server/programme/assemblage";
import type { BriefEssai } from "@/server/programme/forme";
import {
  instantaneDuProgramme,
  sourceAdmise,
  URL_SOURCE_REDUITE_MAX,
} from "@/server/programme/instantane";
import { avecSiteGarde, sitesDuProgramme } from "@/server/programme/sites";

const demarrages = vi.hoisted(() => ({ apercu: 0, programme: 0 }));
vi.mock("@/workflows", () => ({
  demarrerApercu: async () => (
    (demarrages.apercu += 1),
    { ok: true, workflowRunId: "wf-apercu" }
  ),
  demarrerProgramme: async () => (
    (demarrages.programme += 1),
    { ok: true, workflowRunId: "wf-programme" }
  ),
}));

import { outils } from "@/server/creation/commun";

/**
 * Chaîne inversée sur `api`, fonctions pures (spécification M1a ; décision 0136 ; verdict 0139) : choix de la chaîne,
 * instantané (parité avec `reduireProgramme`, S4-1), cases de l'aperçu, lignes « À faire », codes réessayables, journal.
 * Sortie simulée de Rome (`prototype/fixtures/modeles/rome.json`), identifiants sentinelles, aucun appel.
 */

const RACINE = process.cwd();
const BRIEF_ROME = JSON.parse(
  readFileSync(path.join(RACINE, "prototype/briefs/rome-1.json"), "utf8"),
) as BriefEssai;
const ORG = "00000000-0000-4000-8000-0000000000aa";
const RUN = "0f0e0d0c-0b0a-4908-8706-050403020100";

/** Programme de Rome lu (ordre écrit) ; `ancre` dit quels lieux reçoivent un `placeId` sentinelle. */
function voyageDeRome(ancre: (rang: number) => boolean = () => true) {
  const modeles = FixturesModelesSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(RACINE, "prototype/fixtures/modeles/rome.json"),
        "utf8",
      ),
    ),
  );
  const lecture = lireProgramme(JSON.stringify(modeles.programme), {
    arrivee: BRIEF_ROME.arrivee,
    depart: BRIEF_ROME.depart,
  });
  if (lecture.valeur === null) throw new Error("fixture rome illisible");
  const programme = ordreEcrit(lecture.valeur);
  const { lieux, cleDe } = lieuxDuProgramme(programme, BRIEF_ROME.destination);
  const rangDe = new Map(lieux.map((lieu, rang) => [lieu.id, rang]));
  const sites = sitesDuProgramme(programme, reduireSite);
  const gardees = new Set(sites.adresses);
  const jours = programme.jours.map((jour, indiceJour) => ({
    date: jour.date,
    ...(jour.titre === undefined ? {} : { titre: jour.titre }),
    creneaux: jour.creneaux.map((creneau, rang): CreneauAssemble => {
      const cle = cleDe(indiceJour, rang);
      const rangLieu = cle === undefined ? undefined : rangDe.get(cle);
      const placeId =
        rangLieu !== undefined && ancre(rangLieu)
          ? `SENTINELLE_PLACE_ID_${String(rangLieu + 1).padStart(3, "0")}`
          : undefined;
      return {
        ...avecSiteGarde(creneau, sites.adresseDe(indiceJour, rang), gardees),
        ...(placeId === undefined ? {} : { placeId }),
      };
    }),
  }));
  const complet = assemblerProgrammeIa({
    tripId: "00000000-0000-4000-8000-0000000000bb",
    organizationId: ORG,
    brief: BRIEF_ROME,
    jours,
    bonsPlans: programme.bonsPlans,
    logements: ["SENTINELLE_PLACE_ID_LOGEMENT"],
    configuration: CONFIGURATION_MOTEUR,
    mode: modeDeTrajet(BRIEF_ROME),
    trajets: () => undefined,
  });
  return { complet, lieux };
}

describe("chaîne inversée : choix de la chaîne (0136 § 4)", () => {
  it('CHAINE_APERCU vaut "inversee" depuis M1a-3 (attente modifiée (2) de 0136 § 9 : "ancienne" dans M1a-2) ; garde du récit fermée (0139 § 1.2 point 6)', () => {
    expect(CHAINE_APERCU).toBe("inversee");
    expect(RECIT_API_AUTORISE).toBe(false);
  });

  it("composition: chaîne par défaut = CHAINE_APERCU, dépendances injectées sans chaîne = ancienne", () => {
    expect(chaineDe(undefined)).toBe(CHAINE_APERCU);
    expect(chaineDe({})).toBe("ancienne");
    expect(chaineDe({ chaine: "inversee" })).toBe("inversee");
    // Génération : `resoudre()` des workflows (aucun jeu) lit la constante ; un jeu injecté sans chaîne vaut l'ancienne.
    expect(resoudre().chaine).toBe(CHAINE_APERCU);
    expect(resoudre({}).chaine).toBe("ancienne");
    expect(resoudre({ chaine: "inversee" }).chaine).toBe("inversee");
    // Création : mêmes règles, lues à chaque appel.
    expect(outils().chaine()).toBe(CHAINE_APERCU);
    expect(outils({}).chaine()).toBe("ancienne");
    expect(outils({ chaine: "inversee" }).chaine()).toBe("inversee");
  });

  it("le démarrage par défaut suit la chaîne : generatePreview sous l'ancienne, generateProgramme sous l'inversée", async () => {
    demarrages.apercu = 0;
    demarrages.programme = 0;
    expect(await outils({}).demarrerApercu("r", ORG)).toBe("wf-apercu");
    expect(await outils({ chaine: "inversee" }).demarrerApercu("r", ORG)).toBe(
      "wf-programme",
    );
    expect(demarrages).toEqual({ apercu: 1, programme: 1 });
    // Un démarrage injecté sert les deux chaînes (tests).
    const injecte = vi.fn(async () => "wf-injecte");
    expect(
      await outils({
        chaine: "inversee",
        demarrerApercu: injecte,
      }).demarrerApercu("r", ORG),
    ).toBe("wf-injecte");
    expect(demarrages).toEqual({ apercu: 1, programme: 1 });
  });
});

describe("chaîne inversée : codes réessayables (0136 § 2.6, critère 11)", () => {
  it("chaine-inversee: model_output_invalid réessayable, ancienne chaîne inchangée", () => {
    expect(echecDeCode("model_output_invalid").retryable).toBe(false);
    expect(CODES_REESSAYABLES).not.toContain("model_output_invalid");
    expect(echecSelonChaine("model_output_invalid", "ancienne")).toEqual(
      echecDeCode("model_output_invalid"),
    );
    expect(echecSelonChaine("model_output_invalid", "inversee")).toEqual({
      reason: echecDeCode("model_output_invalid").reason,
      retryable: true,
    });
    expect(relancableSelonChaine("model_output_invalid", "inversee")).toBe(
      true,
    );
    expect(relancableSelonChaine("model_output_invalid", "ancienne")).toBe(
      false,
    );
    expect(CODES_REESSAYABLES_CHAINE_INVERSEE).toEqual([
      ...CODES_REESSAYABLES,
      "model_output_invalid",
    ]);
    // Les autres codes ne changent pas d'une chaîne à l'autre.
    for (const code of [
      "lodging_unresolved",
      "cap_reached",
      "upstream_unavailable",
      "invalid_input",
      null,
    ]) {
      expect(echecSelonChaine(code, "inversee"), String(code)).toEqual(
        echecDeCode(code),
      );
    }
  });
});

describe("chaîne inversée : instantané (0136 § 1.8 ; 0139 S4-1)", () => {
  it("instantane: mêmes clés retirées que reduireProgramme (sortie simulée de Rome)", () => {
    const { complet } = voyageDeRome();
    const instantane = instantaneDuProgramme(complet.trip);
    const positions = new Map(
      [
        ...new Set(JSON.stringify(complet).match(/SENTINELLE_PLACE_ID_\w+/g)),
      ].map((placeId, rang) => [
        placeId,
        { lat: 41.9 + rang / 1000, lng: 12.5 },
      ]),
    );
    // La forme réduite du prototype n'admet que l'organisation du prototype : seule cette clé, hors des jours, change.
    const reduit = reduireProgramme(
      {
        ...complet,
        trip: { ...complet.trip, organizationId: PROTOTYPE_ORG_ID },
      },
      {
        positions,
        terminus: complet.terminus,
        justifications: complet.justifications,
      },
    );
    const OMIS = ["weekday", "travelMinutes", "generating", "budgetPerPerson"];
    const joursReduits = JSON.parse(
      JSON.stringify(reduit.trip.days),
      (cle, valeur) => (OMIS.includes(cle) ? undefined : valeur),
    );
    expect(instantane.days.length).toBeGreaterThan(2);
    expect(JSON.parse(JSON.stringify(instantane.days))).toEqual(joursReduits);
    // Ni durée, ni date de contrôle, ni position : les clés dérivées de Google sont absentes de l'instantané.
    expect(JSON.stringify(instantane)).not.toMatch(
      /"minutes"|"travelMinutes"|"verifiedAt"|"lat"|"lng"|"weekday"/,
    );
  });

  it("instantane: source hors règle retirée (identifiants, http, plus de 300 caractères, libellé de plus de 120)", () => {
    const bonne = {
      label: "colosseo.example.org",
      url: "https://www.colosseo.example.org/visite",
    };
    expect(sourceAdmise(bonne)).toEqual(bonne);
    expect(sourceAdmise(undefined)).toBeUndefined();
    expect(
      sourceAdmise({
        ...bonne,
        url: "https://moi:secret@colosseo.example.org/",
      }),
    ).toBeUndefined();
    expect(
      sourceAdmise({ ...bonne, url: "http://colosseo.example.org/" }),
    ).toBeUndefined();
    expect(
      sourceAdmise({
        ...bonne,
        url: `https://colosseo.example.org/${"a".repeat(URL_SOURCE_REDUITE_MAX)}`,
      }),
    ).toBeUndefined();
    expect(
      sourceAdmise({
        ...bonne,
        url: `https://colosseo.example.org/${"a".repeat(URL_SOURCE_REDUITE_MAX - 29)}`,
      }),
    ).toBeDefined();
    expect(sourceAdmise({ ...bonne, label: "x".repeat(121) })).toBeUndefined();
    // Dans l'instantané : la source refusée est retirée, l'étape gardée.
    const { complet } = voyageDeRome();
    const jour = complet.trip.days[1]!;
    const rang = jour.items.findIndex((ligne) => ligne.type === "stop");
    const ligne = jour.items[rang]!;
    if (ligne.type !== "stop") throw new Error("étape attendue");
    const trip: Pick<Trip, "days"> = {
      days: [
        {
          ...jour,
          items: jour.items.map((l, r) =>
            r === rang
              ? {
                  type: "stop" as const,
                  stop: {
                    ...ligne.stop,
                    source: {
                      label: "x",
                      url: "https://moi:secret@exemple.org/",
                    },
                  },
                }
              : l,
          ),
        },
      ],
    };
    const gardee = instantaneDuProgramme(trip).days[0]!.items[rang]!;
    expect(gardee.type === "stop" && gardee.stop.id).toBe(ligne.stop.id);
    expect(gardee.type === "stop" && gardee.stop.source).toBeUndefined();
  });
});

describe("chaîne inversée : cases de l'aperçu (0136 § 3.4, critère 4)", () => {
  it("fixtures: Rome donne 8 cases, toutes avec placeId et detour = reason, J1 puis J2, ordre écrit", () => {
    const { complet } = voyageDeRome();
    const instantane = instantaneDuProgramme(complet.trip);
    const cases = casesDuProgramme(complet.trip.days, instantane);
    expect(cases).toHaveLength(CASES_APERCU);
    expect(statutDesCases(cases, CASES_APERCU)).toBe("ready");
    expect(cases.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(cases.map((c) => `${c.day}|${c.time}`)).size).toBe(8);
    for (const c of cases) {
      expect(c.type).toBe("proposal");
      expect(c.candidatId).toBeNull();
      expect(c.contenu.stop.placeId).toMatch(/^SENTINELLE_PLACE_ID_/);
      expect(c.contenu.detour).toBe(c.contenu.stop.reason);
      expect(c.contenu.detour.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(c.day);
    }
    expect(cases.map((c) => c.day)).toEqual(
      [...cases.map((c) => c.day)].sort(),
    );
  });

  it("chaine-inversee: aucune case sans placeId ni detour ; apercu: retenir écarte une étape sans placeId, la suivante prend sa place", () => {
    const toutes = casesDuProgramme(
      voyageDeRome().complet.trip.days,
      instantaneDuProgramme(voyageDeRome().complet.trip),
    );
    const premier = toutes[0]!.contenu.stop.placeId!;
    const rangPremier = Number(premier.slice(-3)) - 1;
    const { complet } = voyageDeRome((rang) => rang !== rangPremier);
    const cases = casesDuProgramme(
      complet.trip.days,
      instantaneDuProgramme(complet.trip),
    );
    expect(cases.map((c) => c.contenu.stop.placeId)).not.toContain(premier);
    expect(cases[0]!.contenu.stop.placeId).toBe(
      toutes[1]!.contenu.stop.placeId,
    );
    expect(
      cases.every(
        (c) => c.contenu.stop.placeId !== undefined && c.contenu.detour !== "",
      ),
    ).toBe(true);
    // L'étape écartée reste dans le programme, sans placeId (badgée à la lecture, M1a-3).
    const etapes = complet.trip.days.flatMap((jour) =>
      jour.items.flatMap((l) => (l.type === "stop" ? [l.stop] : [])),
    );
    expect(etapes.some((stop) => stop.placeId === undefined)).toBe(true);
  });

  it("moins de 8 étapes retenues : moins de cases, aucune case noOption, fin incomplete", () => {
    const { complet } = voyageDeRome((rang) => rang < 3);
    const cases = casesDuProgramme(
      complet.trip.days,
      instantaneDuProgramme(complet.trip),
    );
    expect(cases.length).toBeLessThan(CASES_APERCU);
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((c) => c.type === "proposal")).toBe(true);
    expect(statutDesCases(cases, CASES_APERCU)).toBe("incomplete");
  });
  it("retenirApercu: fabrique exportée pour la lecture (M1a-3), neuve à chaque sélection ; créneau déjà pris et étape sans placeId écartés", () => {
    const jours = voyageDeRome().complet.trip.days;
    const etapes = jours.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : [])));
    const premiere = etapes.find((stop) => stop.placeId !== undefined && (stop.reason ?? "").trim() !== "")!;
    const retenir = retenirApercu(jours);
    expect(retenir(premiere)).toBe(true);
    expect(retenir(premiere)).toBe(false);
    expect(retenirApercu(jours)(premiere)).toBe(true);
    expect(retenirApercu(jours)({ ...premiere, placeId: undefined })).toBe(false);
    expect(retenirApercu(jours)({ ...premiere, reason: " " })).toBe(false);
  });
});

describe("chaîne inversée : lignes « À faire » (0136 § 3.3 ; 0139 § 3 condition 4)", () => {
  it("chaine-inversee: bons plans en lignes « À faire », dans l'ordre de l'IA, libellés non vides", () => {
    const checklist = [
      "Réserver le Colisée",
      "   ",
      "Prendre une carte de transport",
      "Venir tôt",
    ].map((label, rang) => ({
      id: `bon-plan-${rang + 1}`,
      kind: "other" as const,
      label,
      when: { type: "beforeDeparture" as const },
      done: false,
      sponsored: false,
    }));
    const lignes = lignesAFaire(checklist, RUN);
    expect(lignes.map((l) => l.label)).toEqual([
      "Réserver le Colisée",
      "Prendre une carte de transport",
      "Venir tôt",
    ]);
    // Identifiants déterministes (exécution et rang), uuid, dont l'ordre est celui de l'IA ; jamais tirés d'un texte.
    expect(lignes.map((l) => l.id)).toEqual([
      identifiantBonPlan(RUN, 0),
      identifiantBonPlan(RUN, 1),
      identifiantBonPlan(RUN, 2),
    ]);
    for (const { id } of lignes)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    expect([...lignes.map((l) => l.id)].sort()).toEqual(
      lignes.map((l) => l.id),
    );
    expect(identifiantBonPlan(RUN, 0)).toBe(identifiantBonPlan(RUN, 0));
    expect(identifiantBonPlan(RUN, 0)).not.toBe(
      identifiantBonPlan("0f0e0d0c-0b0a-4908-8706-0504030201ff", 0),
    );
    expect(() => identifiantBonPlan(RUN, -1)).toThrow(RangeError);
  });
});

describe("chaîne inversée : fixtures par destination (0136 § 9, amende 0110 § 2)", () => {
  it("liste fermée : Édimbourg et Rome ; toute autre destination (ou aucune) prend Édimbourg", () => {
    expect([...JEUX_PAR_DESTINATION]).toEqual([
      ["Édimbourg", "edimbourg"],
      ["Rome", "rome"],
    ]);
    expect(jeuDeFixtures("Rome")).toBe("rome");
    expect(jeuDeFixtures("Édimbourg")).toBe("edimbourg");
    for (const autre of [undefined, "rome", "Rome ", "../rome", "Lisbonne"])
      expect(jeuDeFixtures(autre), String(autre)).toBe("edimbourg");
  });
});

describe("journal: generation.programme_written (0139 § 2)", () => {
  const COMPTEURS = {
    days: 5,
    slots: 30,
    placesToVerify: 30,
    daysRemoved: 0,
    slotsRemoved: 1,
    fieldsRemoved: 2,
    textsCut: 0,
    modelCalls: 1,
    unverifiedForCap: 0,
    sitesProposed: 4,
    sitesChecked: 0,
    sitesRemoved: 0,
    sitesUnchecked: 4,
  };

  it("journal: generation.programme_written, champs hors liste retirés", () => {
    const ligne = formatLogLine(
      "generation.programme_written",
      {
        ...COMPTEURS,
        tripId: "00000000-0000-4000-8000-000000000001",
        organizationId: ORG,
        generationRunId: RUN,
        stopReason: "cap_reached",
        verifies: 12,
      },
      "info",
    );
    expect(ligne).toBe(
      JSON.stringify({
        level: "info",
        event: "generation.programme_written",
        ...COMPTEURS,
        dropped: 5,
      }),
    );
    for (const retire of [
      "00000000-0000-4000-8000-000000000001",
      ORG,
      RUN,
      "cap_reached",
      "verifies",
    ])
      expect(ligne).not.toContain(retire);
    // Les autres événements ne changent pas : generation.full_stuck garde ses identifiants.
    const bloque = JSON.parse(
      formatLogLine(
        "generation.full_stuck",
        {
          tripId: "00000000-0000-4000-8000-000000000001",
          organizationId: ORG,
          generationRunId: RUN,
          stopReason: "cap_reached",
        },
        "warn",
      ),
    );
    expect(bloque).toEqual({
      level: "warn",
      event: "generation.full_stuck",
      tripId: "00000000-0000-4000-8000-000000000001",
      organizationId: ORG,
      generationRunId: RUN,
      stopReason: "cap_reached",
    });
  });

  it("liste fermée exacte : les compteurs de p0.programme_written et errorName, rien d'autre", () => {
    expect(
      [
        ...(CHAMPS_ADMIS_PAR_EVENEMENT.get("generation.programme_written") ??
          []),
      ].sort(),
    ).toEqual(
      [
        ...Object.keys(COMPTEURS),
        "finishReason",
        "inputTokens",
        "outputTokens",
        "errorName",
      ].sort(),
    );
    // Décision 0141 § 6.3 point 4 (PR 885) : `ville.refusee` et `ville.purge_failed` ont aussi leur liste fermée.
    // Décision 0147 § 12 S1 point 4 (M5c, ticket 904) : `voyages.stop_reported`, motif seul.
    // Décision 0147 § 12 S1 point 5 (M5d-1, ticket 939) : `lieu.recherche`, motif, nombre de résultats et diagnostic fermé.
    // Décision 0155 § 2.4 (M5d-4, ticket 976) : `recalcul.lieux_a_soi`, deux compteurs.
    // Spécification M6 § 4 (M6b, ticket 1005) : `calendrier.version_unavailable`, aucun champ.
    expect([...CHAMPS_ADMIS_PAR_EVENEMENT.keys()].sort()).toEqual([
      "calendrier.version_unavailable",
      "generation.programme_written",
      "lieu.recherche",
      "recalcul.lieux_a_soi",
      "ville.purge_failed",
      "ville.refusee",
      "voyages.stop_reported",
    ]);
    // Ligne `warn` : le nom de l'erreur passe, jamais son message.
    const warn = JSON.parse(
      formatLogLine(
        "generation.programme_written",
        { ...COMPTEURS, errorName: "ArretEtape", message: "Colisée" },
        "warn",
      ),
    );
    expect(warn).toMatchObject({
      level: "warn",
      errorName: "ArretEtape",
      dropped: 1,
    });
    expect(JSON.stringify(warn)).not.toContain("Colisée");
  });
});
