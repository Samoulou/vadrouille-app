// @vitest-environment node
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";

import { EntreeRevisionSchema, type EntreeRevision } from "@/ai/entree-revision";
import { TripSnapshotSchema, type TripSnapshot } from "@/contracts";
import { PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type EntreeRevisionDuProgramme, type FiltreRevision } from "@/server/composition/generation";
import { ArretEtape } from "@/server/generation/codes";
import { resoudre } from "@/server/generation/dependances";
import { forfaitDeLaRevision } from "@/server/generation/forfait-etape";
import {
  choixDuTri,
  journaliserReinjection,
  ligneDuJourCoherente,
  lieuxASoiReinjectes,
  reinjecterLieuxASoi,
  versionDeLaRevision,
  verrousReportes,
  type ReglesReinjection,
} from "@/server/generation/etapes-revision";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { formatLogLine } from "@/server/log";
import { modeDeTrajet } from "@/server/programme/assemblage";
import { demandeDeRelectures, recomposerJour } from "@/domain/recomposition";
import { INCONNU, memePoint, type Relectures } from "@/domain/relectures";
import * as p0 from "@/server/p0/revision";
import type { EntreeProgramme } from "@/server/programme/entree";
import {
  entreeRevisionDepuisJours,
  etapesPourLeModele,
  nomNormalise,
  nomsEcartesDesJours,
  retirerEtapesEcartees,
  type EntreeRevisionProgramme,
} from "@/server/programme/revision";
import { forfaitDuProfil, PROFILS_FORFAIT } from "@/server/usage/reservation";
import type { SignalDuRecalcul, TriDuRecalcul } from "@/domain/recalcul";

import { PLAFONDS_LARGES } from "../../support/banc-apercu";
import { PLAFONDS_USAGE_TEST } from "../../support/plafonds-usage";

/**
 * M1b (PR 868 ; décision 0126 § 3 et § 4) : le code de la révision est **partagé** par le site d'essai et la vraie app
 * (`src/server/programme/revision.ts`), et la vraie app tire les choix de la révision du tri clos (`choixDuTri`), sans lire
 * les catégories de repli comme des préférences (PO, 0136 § 11 question 2).
 */

const PLACE = "SENTINELLE_PLACE_REVISION";
const SITE = "https://sentinelle-site.example/officiel";

const BRIEF: EntreeProgramme = {
  destination: "Rome",
  pays: "Italie",
  arrivee: "2027-05-04",
  depart: "2027-05-05",
  heureArrivee: "09:00",
  heureDepart: "20:00",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "equilibre",
  envies: ["museum"],
  deplacements: ["walk"],
  logements: [{ texte: "Monti, Rome", nuits: 1 }],
};

const etape = (id: string, nom: string, extra: Record<string, unknown> = {}) => ({
  type: "stop",
  stop: { id, kind: "activity", name: nom, start: "10:00", end: "11:00", facts: { area: "Monti" }, reason: "Parce que.", exceptions: [], locked: false, ...extra },
});

/** Instantané à deux journées, avec des sentinelles dans chaque champ Google ou de verdict (aucun ne doit passer). */
const INSTANTANE: TripSnapshot = TripSnapshotSchema.parse({
  days: [
    {
      index: 2,
      date: "2027-05-05",
      theme: "Vatican",
      travelBudgetMinutes: 90,
      items: [etape("j2-1", "Musées du Vatican", { placeId: `${PLACE}_2`, source: { label: "sentinelle-site.example", url: SITE } })],
      events: [],
    },
    {
      index: 1,
      date: "2027-05-04",
      theme: "Monti",
      travelBudgetMinutes: 90,
      items: [
        { type: "terminus", role: "start", label: "SENTINELLE_TERMINUS", time: "09:00" },
        etape("j1-1", "Colisée", { placeId: PLACE, exceptions: ["toReserve"], source: { label: "sentinelle-site.example", url: SITE } }),
        { type: "segment", segment: { mode: "walk", estimated: true } },
        etape("j1-2", "Forum romain", { kind: "meal", locked: true }),
        etape("j1-3", "Ai Tre Scalini", { commitment: "reservation" }),
      ],
      events: [],
    },
  ],
});

describe("révision partagée (PR 868 ; décision 0126 § 3)", () => {
  it("PR 868 : entreeRevisionDepuisJours ne porte que les textes de l'IA et les choix, jamais une donnée Google ni un verdict", () => {
    const entree = entreeRevisionDepuisJours(INSTANTANE.days, BRIEF, { pasPourMoi: ["j1-1", "inconnu", "j1-1"], jAime: ["j2-1", "j1-1"] });
    expect(EntreeRevisionSchema.safeParse(entree).success).toBe(true);
    expect(entree.programme.jours.map((j) => j.date)).toEqual(["2027-05-04", "2027-05-05"]);
    expect(entree.programme.jours[0]!.etapes.map((e) => e.id)).toEqual(["j1-1", "j1-2", "j1-3"]);
    expect(entree.programme.jours[0]!.etapes[1]).toEqual({ id: "j1-2", debut: "10:00", fin: "11:00", repas: true, lieu: "Forum romain", quartier: "Monti", pourquoi: "Parce que." });
    expect(entree.choix).toEqual({ pasPourMoi: ["j1-1"], jAime: ["j2-1"] });
    const texte = JSON.stringify(entree);
    for (const sentinelle of [PLACE, SITE, "SENTINELLE_TERMINUS", "toReserve", "segment", "locked", "commitment", "placeId", "source"]) expect(texte).not.toContain(sentinelle);
  });

  it("M5d-1 (0147 § 12 S4) : une étape ajoutée par la personne n'entre pas dans l'entrée ; un choix qui la vise est ignoré", () => {
    const AJOUT = "ajout-0d000000-0000-4000-8000-0000000000cc";
    const NOM = "SENTINELLE-NOM-SAISI-M5D";
    const jours = INSTANTANE.days.map((jour) =>
      jour.index === 1 ? { ...jour, items: [...jour.items, etape(AJOUT, NOM, { placeId: "SENTINELLE_PLACE_AJOUT", locked: true, addedBy: "person" })] } : jour,
    );
    const avec = entreeRevisionDepuisJours(TripSnapshotSchema.parse({ days: jours }).days, BRIEF, { pasPourMoi: [AJOUT, "j1-1"], jAime: [AJOUT] });
    expect(avec).toEqual(entreeRevisionDepuisJours(INSTANTANE.days, BRIEF, { pasPourMoi: ["j1-1"], jAime: [] }));
    expect(etapesPourLeModele(jours.find((j) => j.index === 1)!).map((e) => e.id)).toEqual(["j1-1", "j1-2", "j1-3"]);
    const texte = JSON.stringify(avec);
    for (const sentinelle of [AJOUT, NOM, "SENTINELLE_PLACE_AJOUT", "addedBy"]) expect(texte).not.toContain(sentinelle);
  });

  it("PR 868 : EntreeRevisionProgramme a la forme de EntreeRevision, celle que reçoit la capacité reviser", () => {
    expectTypeOf<EntreeRevisionProgramme["programme"]>().toEqualTypeOf<EntreeRevision["programme"]>();
    expectTypeOf<EntreeRevisionProgramme["choix"]>().toEqualTypeOf<EntreeRevision["choix"]>();
    expectTypeOf<EntreeRevisionProgramme>().toMatchTypeOf<EntreeRevisionDuProgramme>();
  });

  it("PR 868 : le site d'essai réexporte les fonctions partagées (aucune copie)", () => {
    expect(p0.nomNormalise).toBe(nomNormalise);
    expect(p0.retirerEtapesEcartees).toBe(retirerEtapesEcartees);
  });

  it("PR 868 : filet du code, les étapes écartées retirées par nom normalisé", () => {
    const noms = nomsEcartesDesJours(INSTANTANE.days, ["j1-1"]);
    expect(noms).toEqual(["Colisée"]);
    const sortie = { jours: [{ creneaux: [{ lieu: "COLISÉE !" }, { lieu: "Panthéon" }, {}] }] };
    const { programme, retires } = retirerEtapesEcartees(sortie, noms);
    expect(retires).toBe(1);
    expect(programme.jours[0]!.creneaux).toEqual([{ lieu: "Panthéon" }, {}]);
  });
});

const signal = (s: Partial<SignalDuRecalcul> & Pick<SignalDuRecalcul, "signal">): SignalDuRecalcul =>
  ({ category: "museum", origin: "gesture", status: "confirmed", ...s }) as SignalDuRecalcul;

const TRI: TriDuRecalcul = {
  propositions: [
    { id: "p1", kind: "activity", category: "museum", day: 1, time: "10:00", stopId: "j1-1", placeId: PLACE },
    { id: "p2", kind: "meal", category: "restaurant", day: 1, time: "10:00", stopId: "j1-2" },
    { id: "p3", kind: "activity", category: "walk", day: 1, time: "10:00", stopId: "j1-3" },
    { id: "p4", kind: "activity", category: "museum", day: 2, time: "10:00", stopId: "j2-1" },
    { id: "p5", kind: "activity", category: "museum", day: 2, time: "12:00", stopId: "j9-9" },
  ],
  signaux: [],
};

describe("choix de la révision depuis le tri clos (PR 868)", () => {
  it("PR 868 : « Pas pour moi » et « J'aime » des cases, en identifiants d'étapes ; annulés, inconnus et doublons ignorés", () => {
    const choix = choixDuTri(
      {
        ...TRI,
        signaux: [
          signal({ signal: "dislike", proposalId: "p1" }),
          signal({ signal: "dislike", proposalId: "p1" }),
          signal({ signal: "like", proposalId: "p4" }),
          signal({ signal: "dislike", proposalId: "p5" }),
          signal({ signal: "dislike", proposalId: "p4", status: "cancelled" }),
          signal({ signal: "like", proposalId: "p1" }),
        ],
      },
      INSTANTANE,
    );
    expect(choix).toEqual({ pasPourMoi: ["j1-1"], jAime: ["j2-1"] });
  });

  it("PR 868 : les catégories de repli ne sont pas lues comme des préférences : une réponse « Oui » à une catégorie n'écarte rien", () => {
    const choix = choixDuTri(
      {
        ...TRI,
        signaux: [signal({ signal: "answerYes", origin: "question", category: "museum" }), signal({ signal: "answerNo", origin: "question", category: "walk" }), signal({ signal: "travelReduction", origin: "question", category: null })],
      },
      INSTANTANE,
    );
    expect(choix).toEqual({ pasPourMoi: [], jAime: [] });
  });

  it("PR 868 : « Je choisis » et « Option suivante » ne sont pas des choix de révision ; une étape verrouillée ou un engagement n'est jamais écarté", () => {
    const choix = choixDuTri(
      {
        ...TRI,
        signaux: [signal({ signal: "choose", proposalId: "p1" }), signal({ signal: "nextOption", proposalId: "p2" }), signal({ signal: "dislike", proposalId: "p2" }), signal({ signal: "dislike", proposalId: "p3" })],
      },
      INSTANTANE,
    );
    expect(choix).toEqual({ pasPourMoi: [], jAime: [] });
  });
});

// --- Capacité `reviser` et `FiltreRevision` (revue de la PR 875, bloquant 2) -------------------------------------------

type CreneauLu = { readonly lieu?: string } & Record<string, unknown>;
type ProgrammeLu = { readonly jours: readonly ({ readonly date: string; readonly creneaux: readonly CreneauLu[] } & Record<string, unknown>)[] } & Record<string, unknown>;

const RUN = "00000000-0000-4000-8000-0000000008b1";
const ORG = "00000000-0000-4000-8000-0000000008b2";
const TRIP = "00000000-0000-4000-8000-0000000008b3";
const SEJOUR_ROME = { arrivee: "2027-05-04", depart: "2027-05-08" } as const;
const ENTREE = entreeRevisionDepuisJours(INSTANTANE.days, BRIEF, { pasPourMoi: ["j1-1"], jAime: [] });
const sansFiltre: FiltreRevision = (programme) => ({ programme, retires: 0 });

let doublesRome: Awaited<ReturnType<typeof chargerDoubles>>;
beforeAll(async () => {
  doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
});

/** Capacité `programme` simulée sur les fixtures de Rome ; `transformer` réécrit la réponse du modèle (programme de Rome). */
async function capaciteRome(transformer: (programme: ProgrammeLu) => ProgrammeLu = (p) => p) {
  const fabrique = composerSimuleeAvec({
    doubles: () => {
      const d = doublesRome();
      return {
        ...d,
        modeles: {
          async envoyer(requete) {
            const reponse = await d.modeles.envoyer(requete);
            return { ...reponse, texte: JSON.stringify(transformer(JSON.parse(reponse.texte) as ProgrammeLu)) };
          },
        },
      };
    },
  });
  const dep = resoudre({ plafonds: PLAFONDS_VARIANTE_SIMULEE });
  const { forfait, registre, plafonds } = await forfaitDeLaRevision(dep, { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "simulee" });
  return fabrique.programme({ usage: registre, plafonds, executionId: RUN, forfait, horloge: dep.horloge, echeance: Date.now() + 600_000 });
}

const lieux = (programme: { readonly jours: readonly { readonly creneaux: readonly { readonly lieu?: string }[] }[] } | null) =>
  (programme?.jours ?? []).flatMap((jour) => jour.creneaux.flatMap((c) => (c.lieu === undefined ? [] : [nomNormalise(c.lieu)])));

/** Règles de la réinjection (0155 § 2) : mode du brief (marche) et configuration du moteur (seuil du temps libre : 30 min). */
const REGLES: ReglesReinjection = { mode: modeDeTrajet(BRIEF), configuration: CONFIGURATION_MOTEUR };

/** Lignes JSON écrites par `fonction` sur la console (`logEvent`). */
function lignesDuJournal(fonction: () => void): unknown[] {
  const espion = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    fonction();
    return espion.mock.calls.map(([ligne]) => JSON.parse(String(ligne)) as unknown);
  } finally {
    espion.mockRestore();
  }
}

describe("R3 sur la version révisée (spécification M5 § 3, critère 2 ; revue de la PR 923, bloquant 1)", () => {
  // Base : `j1-2` verrouillée (« Forum romain », 10:00-11:00, sans `placeId`).
  const revisee = (j1: unknown[]): TripSnapshot =>
    TripSnapshotSchema.parse({ days: INSTANTANE.days.map((jour) => (jour.index === 1 ? { ...jour, items: j1 } : jour)) });

  it("verrou: révision : étape verrouillée gardée telle quelle, son verrou est reporté (l'assemblage la rend déverrouillée)", () => {
    const sortie = revisee([etape("j1-1", "Panthéon"), etape("j1-2", "Forum romain", { kind: "meal" })]);
    const tenue = verrousReportes(INSTANTANE, sortie);
    expect(tenue).not.toBeNull();
    const j1 = tenue!.days.find((jour) => jour.index === 1)!.items.flatMap((l) => (l.type === "stop" ? [l.stop] : []));
    expect(j1.map((s) => [s.id, s.name, s.locked])).toEqual([
      ["j1-1", "Panthéon", false],
      ["j1-2", "Forum romain", true],
    ]);
    // Sans étape verrouillée dans la base : sortie rendue telle quelle.
    const sansVerrou = TripSnapshotSchema.parse({ days: INSTANTANE.days.map((jour) => ({ ...jour, items: jour.items.map((l) => (l.type === "stop" ? { ...l, stop: { ...l.stop, locked: false } } : l)) })) });
    expect(verrousReportes(sansVerrou, sortie)).toBe(sortie);
  });

  it("verrou: révision : étape verrouillée déplacée, renommée, d'un autre lieu ou retirée : écriture refusée (null)", () => {
    expect(verrousReportes(INSTANTANE, revisee([etape("j1-2", "Forum romain", { start: "12:00", end: "13:00" })]))).toBeNull();
    expect(verrousReportes(INSTANTANE, revisee([etape("j1-2", "Trevi")]))).toBeNull();
    expect(verrousReportes(INSTANTANE, revisee([etape("j1-2", "Forum romain", { placeId: `${PLACE}_9` })]))).toBeNull();
    expect(verrousReportes(INSTANTANE, revisee([etape("j1-1", "Colisée")]))).toBeNull();
  });
});

describe("lieu à soi dans la révision (M5d-1, ticket 939 ; 0147 § 12 S4 ; revue de la PR 943, bloquant 1)", () => {
  const AJOUT = "ajout-0d000000-0000-4000-8000-0000000000cc";
  const ajoutee = etape(AJOUT, "SENTINELLE-NOM-SAISI-M5D", { start: "15:00", end: "16:00", placeId: "SENTINELLE_PLACE_AJOUT", locked: true, addedBy: "person" });
  const base = TripSnapshotSchema.parse({ days: INSTANTANE.days.map((jour) => (jour.index === 1 ? { ...jour, items: [...jour.items, ajoutee] } : jour)) });
  const revisee = (j1: unknown[]): TripSnapshot =>
    TripSnapshotSchema.parse({ days: INSTANTANE.days.map((jour) => (jour.index === 1 ? { ...jour, items: j1 } : jour)) });
  // M5d-4 (0155 § 2.5, test 2) : Panthéon de 09:00 à 10:00, pour que la ligne du jour ne porte aucun chevauchement de l'IA.
  const sortie = revisee([
    { type: "terminus", role: "start", label: "Monti", time: "09:00" },
    etape("j1-1", "Panthéon", { start: "09:00", end: "10:00" }),
    etape("j1-2", "Forum romain", { kind: "meal" }),
    { type: "segment", segment: { mode: "walk", estimated: true } },
    { type: "free", from: "14:00", to: "15:20" },
    { type: "segment", segment: { mode: "walk", estimated: true } },
    etape("j1-4", "Trevi", { start: "15:30", end: "16:30" }),
    etape("j1-5", "Pincio", { start: "17:00", end: "18:00" }),
    { type: "terminus", role: "end", label: "Monti", time: "20:00" },
  ]);

  it("sans réinjection, la sortie du modèle (qui ne voit pas le lieu à soi) serait refusée par R3 ; réinjecté, il est gardé tel quel et la version s'écrit", () => {
    expect(verrousReportes(base, sortie)).toBeNull();
    const tenue = verrousReportes(base, lieuxASoiReinjectes(base, sortie, REGLES));
    expect(tenue).not.toBeNull();
    expect(versionDeLaRevision(base, sortie, REGLES).tenue).toEqual(tenue);
    const j1 = tenue!.days.find((jour) => jour.index === 1)!.items;
    // Trevi (non verrouillée) et le temps libre qui chevauchent le lieu à soi sont retirés ; M5d-4 (0155 § 2.5, test 2) :
    // l'intervalle libéré hors du lieu est réécrit en « Temps libre » (11:00-15:00, 16:00-17:00), un segment de chaque côté du
    // lieu (depuis le logement : les étapes avant lui n'ont pas de `placeId` ; vers le logement : Pincio n'en a pas).
    expect(j1.map((l) => (l.type === "stop" ? l.stop.id : l.type))).toEqual(["terminus", "j1-1", "j1-2", "free", "segment", AJOUT, "free", "j1-5", "segment", "terminus"]);
    expect(j1.filter((l) => l.type === "free")).toEqual([
      { type: "free", from: "11:00", to: "15:00" },
      { type: "free", from: "16:00", to: "17:00" },
    ]);
    expect(j1.find((l) => l.type === "stop" && l.stop.id === AJOUT)).toEqual(ajoutee);
    // Le verrou de la base reste reporté sur l'étape verrouillée de l'IA.
    expect(j1.find((l) => l.type === "stop" && l.stop.id === "j1-2")).toMatchObject({ stop: { locked: true } });
    // L'étape retirée laisse une trace à compteurs seulement (0155 § 2.4) : `recalcul.lieux_a_soi`, `places: 1`, `stopsRemoved: 1`.
    const { places, stopsRemoved } = reinjecterLieuxASoi(base, sortie, REGLES);
    expect({ places, stopsRemoved }).toEqual({ places: 1, stopsRemoved: 1 });
    expect(lignesDuJournal(() => journaliserReinjection({ places, stopsRemoved }))).toEqual([{ level: "info", event: "recalcul.lieux_a_soi", places: 1, stopsRemoved: 1 }]);
  });

  it("sans lieu à soi dans la base, ou déjà présent : rien ne change", () => {
    expect(lieuxASoiReinjectes(INSTANTANE, sortie, REGLES)).toBe(sortie);
    const deja = lieuxASoiReinjectes(base, lieuxASoiReinjectes(base, sortie, REGLES), REGLES);
    expect(deja).toEqual(lieuxASoiReinjectes(base, sortie, REGLES));
  });
});

describe("relecture du lieu réinjecté (M5d-4, ticket 976 ; décision 0155 § 2, Q765)", () => {
  const AJOUT = "ajout-0d000000-0000-4000-8000-0000000000dd";
  const NOM = "SENTINELLE-NOM-SAISI-M5D4";
  const PLACE_AJOUT = "SENTINELLE_PLACE_AJOUT_M5D4";
  const MODE = modeDeTrajet({ deplacements: ["walk", "transit"] });
  const REGLES_TRANSIT: ReglesReinjection = { mode: MODE, configuration: CONFIGURATION_MOTEUR };
  const seg = (mode: ReglesReinjection["mode"] = MODE) => ({ type: "segment", segment: { mode, estimated: false } });
  const debut = { type: "terminus", role: "start", label: "Monti", time: "09:00" };
  const fin = { type: "terminus", role: "end", label: "Monti", time: "19:00" };
  const lieuASoi = (start: string, end: string, extra: Record<string, unknown> = {}) =>
    etape(AJOUT, NOM, { start, end, placeId: PLACE_AJOUT, locked: true, addedBy: "person", ...extra });
  /** Version à un jour (J1, 2027-05-04) ; `items` de la base et de la révision. */
  const version = (items: unknown[]): TripSnapshot =>
    TripSnapshotSchema.parse({ days: [{ index: 1, date: "2027-05-04", theme: "Monti", travelBudgetMinutes: 90, items, events: [] }] });
  const baseAvec = (ajout: unknown) => version([debut, ajout, fin]);
  const ligne = (instantane: TripSnapshot) => instantane.days[0]!.items;
  const forme = (instantane: TripSnapshot) => ligne(instantane).map((l) => (l.type === "stop" ? l.stop.id : l.type));
  const voisins = (instantane: TripSnapshot) => {
    const items = ligne(instantane);
    const rang = items.findIndex((l) => l.type === "stop" && l.stop.id === AJOUT);
    return { avant: items[rang - 1], apres: items[rang + 1] };
  };
  const coherent = (instantane: TripSnapshot) => ligneDuJourCoherente(instantane.days[0]!, new Set([AJOUT]), CONFIGURATION_MOTEUR);

  // Jour de l'IA : Colisée 09:00-10:00, pause de 10:00 à 16:00, Forum 16:00-17:00 (forme de l'assemblage).
  const revisionAvecPause = version([
    debut,
    seg("walk"),
    etape("j1-1", "Colisée", { start: "09:00", end: "10:00", placeId: `${PLACE}_A` }),
    { type: "free", from: "10:00", to: "16:00" },
    seg("walk"),
    etape("j1-2", "Forum romain", { start: "16:00", end: "17:00", placeId: `${PLACE}_B` }),
    seg("walk"),
    fin,
  ]);

  it("test 1 : lieu au milieu d'un temps libre de l'IA : deux temps libres d'au moins le seuil ; une part sous le seuil n'est pas écrite", () => {
    const milieu = reinjecterLieuxASoi(baseAvec(lieuASoi("12:00", "13:00")), revisionAvecPause, REGLES_TRANSIT);
    expect(milieu).toMatchObject({ places: 1, stopsRemoved: 0, coherente: true });
    expect(forme(milieu.instantane)).toEqual(["terminus", "segment", "j1-1", "free", "segment", AJOUT, "free", "segment", "j1-2", "segment", "terminus"]);
    const libres = ligne(milieu.instantane).filter((l) => l.type === "free");
    expect(libres).toEqual([
      { type: "free", from: "10:00", to: "12:00" },
      { type: "free", from: "13:00", to: "16:00" },
    ]);
    // Une part de 15 minutes (10:00-10:15), sous le seuil de 30 : pas de temps libre, et ce n'est pas un trou.
    expect(CONFIGURATION_MOTEUR.seuilTempsLibreMinutes).toBe(30);
    const courte = reinjecterLieuxASoi(baseAvec(lieuASoi("10:15", "11:00")), revisionAvecPause, REGLES_TRANSIT);
    expect(courte.coherente).toBe(true);
    expect(ligne(courte.instantane).filter((l) => l.type === "free")).toEqual([{ type: "free", from: "11:00", to: "16:00" }]);
  });

  it("test 3 : un segment, au mode du brief, entre le lieu et chaque voisin à placeId ; jamais deux segments voisins", () => {
    const reinjectee = lieuxASoiReinjectes(baseAvec(lieuASoi("12:00", "13:00")), revisionAvecPause, REGLES_TRANSIT);
    expect(MODE).toBe("transit");
    const { avant, apres } = voisins(reinjectee);
    expect(avant).toEqual({ type: "segment", segment: { mode: "transit", estimated: false } });
    // Après le lieu : le « Temps libre », puis le segment juste avant Forum (comme l'assemblage).
    expect(apres?.type).toBe("free");
    expect(forme(reinjectee).slice(forme(reinjectee).indexOf(AJOUT))).toEqual([AJOUT, "free", "segment", "j1-2", "segment", "terminus"]);
    const items = ligne(reinjectee);
    expect(items.some((l, i) => l.type === "segment" && items[i - 1]?.type === "segment")).toBe(false);
  });

  it("test 3 : en début et en fin de jour, le segment va au logement (terminus)", () => {
    const tot = lieuxASoiReinjectes(baseAvec(lieuASoi("08:00", "08:45")), revisionAvecPause, REGLES_TRANSIT);
    expect(forme(tot).slice(0, 5)).toEqual(["terminus", "segment", AJOUT, "segment", "j1-1"]);
    expect(coherent(tot)).toBe(true);
    const tard = lieuxASoiReinjectes(baseAvec(lieuASoi("17:30", "18:30")), revisionAvecPause, REGLES_TRANSIT);
    expect(forme(tard).slice(-6)).toEqual(["j1-2", "free", "segment", AJOUT, "segment", "terminus"]);
    expect(voisins(tard).apres).toEqual({ type: "segment", segment: { mode: "transit", estimated: false } });
    expect(coherent(tard)).toBe(true);
  });

  it("test 3 : aucun segment à travers un changement de ville, d'un côté comme de l'autre", () => {
    const changement = { type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "12:00", estimatedMinutes: 120 };
    // Jour de l'IA : Colisée, « Temps libre » jusqu'au départ, changement (arrivée 14:00), « Temps libre » dès l'arrivée, Offices
    // sans segment avant (première étape après la ligne « Vers {ville} »), retour au logement.
    const revisionChangement = version([
      debut,
      seg("walk"),
      etape("j1-1", "Colisée", { start: "09:00", end: "10:00", placeId: `${PLACE}_A` }),
      { type: "free", from: "10:00", to: "12:00" },
      changement,
      { type: "free", from: "14:00", to: "15:00" },
      etape("j1-2", "Offices", { start: "15:00", end: "16:00", placeId: `${PLACE}_C` }),
      seg("walk"),
      fin,
    ]);
    expect(coherent(revisionChangement)).toBe(true);
    // Avant le départ : un segment depuis Colisée, aucun vers le changement ; temps libres réécrits jusqu'au départ.
    const avantDepart = lieuxASoiReinjectes(baseAvec(lieuASoi("10:30", "11:30")), revisionChangement, REGLES_TRANSIT);
    expect(forme(avantDepart)).toEqual(["terminus", "segment", "j1-1", "free", "segment", AJOUT, "free", "transfer", "free", "j1-2", "segment", "terminus"]);
    expect(coherent(avantDepart)).toBe(true);
    // À l'arrivée : aucun segment depuis le changement, un vers Offices.
    const arrivee = lieuxASoiReinjectes(baseAvec(lieuASoi("14:00", "14:30")), revisionChangement, REGLES_TRANSIT);
    expect(forme(arrivee).slice(forme(arrivee).indexOf("transfer"))).toEqual(["transfer", AJOUT, "free", "segment", "j1-2", "segment", "terminus"]);
    expect(coherent(arrivee)).toBe(true);
    // En fin de jour, après Offices : un segment depuis Offices, un vers le logement.
    const apresArrivee = lieuxASoiReinjectes(baseAvec(lieuASoi("16:30", "17:00")), revisionChangement, REGLES_TRANSIT);
    expect(forme(apresArrivee).slice(forme(apresArrivee).indexOf("transfer"))).toEqual(["transfer", "free", "j1-2", "free", "segment", AJOUT, "segment", "terminus"]);
    expect(coherent(apresArrivee)).toBe(true);
  });

  it("test 4 : le jour réinjecté, recomposé avec un double qui ne sert que la demande, donne une durée à chaque segment voisin du lieu", () => {
    const reinjectee = lieuxASoiReinjectes(baseAvec(lieuASoi("12:00", "13:00")), revisionAvecPause, REGLES_TRANSIT);
    const jour = reinjectee.days[0]!;
    const contexte = { nombreDeNuits: 2, modes: [MODE] as const };
    const demande = demandeDeRelectures({ jours: [{ jour, mesure: true }], ...contexte });
    // Règle des doubles (0147 A.3) : une durée pour un trajet demandé seulement, avec son mode ; inconnu sinon.
    const double: Relectures = {
      validite: () => "valide",
      plages: () => INCONNU,
      duree: (depuis, vers, mode) =>
        demande.trajets.some((trajet) => memePoint(trajet.depuis, depuis) && memePoint(trajet.vers, vers) && trajet.modes.includes(mode)) ? { minutes: 12, estimee: false } : INCONNU,
    };
    expect(demande.trajets).toEqual(
      expect.arrayContaining([
        { depuis: { lieu: `${PLACE}_A` }, vers: { lieu: PLACE_AJOUT }, modes: ["transit"] },
        { depuis: { lieu: PLACE_AJOUT }, vers: { lieu: `${PLACE}_B` }, modes: ["transit"] },
      ]),
    );
    const lu = recomposerJour(jour, { ...contexte, generating: false, relectures: double, verification: () => undefined });
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    const items = lu.valeur.items;
    const rang = items.findIndex((l) => l.type === "stop" && l.stop.id === AJOUT);
    const segmentApres = items.slice(rang + 1).find((l) => l.type === "segment");
    expect(items[rang - 1]).toEqual({ type: "segment", segment: { mode: "transit", minutes: 12, estimated: false } });
    expect(segmentApres).toEqual({ type: "segment", segment: { mode: "transit", minutes: 12, estimated: false } });
  });

  it("test 5 : cohérence de la ligne du jour : un jour forgé incohérent fait que rien n'est écrit", () => {
    const etapeA = etape("j1-1", "Colisée", { start: "09:00", end: "10:00", placeId: `${PLACE}_A` });
    const etapeB = etape("j1-2", "Forum romain", { start: "10:00", end: "11:00", placeId: `${PLACE}_B` });
    const jour = (items: unknown[]) => version(items).days[0]!;
    const tient = (items: unknown[], verrouillees: string[] = []) => ligneDuJourCoherente(jour(items), new Set(verrouillees), CONFIGURATION_MOTEUR);
    expect(tient([debut, seg(), etapeA, seg(), etapeB, seg(), fin])).toBe(true);
    // Deux segments entre deux points.
    expect(tient([debut, seg(), etapeA, seg(), seg(), etapeB, seg(), fin])).toBe(false);
    // Terminus hors de sa place.
    expect(tient([seg(), etapeA, debut, seg(), etapeB, seg(), fin])).toBe(false);
    expect(tient([debut, seg(), etapeA, fin, seg(), etapeB])).toBe(false);
    // Lignes hors d'ordre ; chevauchement (admis seulement entre deux étapes verrouillées dans la base).
    expect(tient([debut, seg(), etapeB, seg(), etapeA, seg(), fin])).toBe(false);
    const chevauche = etape("j1-3", "Panthéon", { start: "09:30", end: "10:30" });
    expect(tient([debut, seg(), etapeA, chevauche, seg(), etapeB, seg(), fin])).toBe(false);
    expect(tient([debut, seg(), etapeA, chevauche, seg(), etapeB, seg(), fin], ["j1-1", "j1-2", "j1-3"])).toBe(true);
    // Trou : 11:00-12:00 sans « Temps libre ».
    const tard = etape("j1-4", "Panthéon", { start: "12:00", end: "13:00", placeId: `${PLACE}_D` });
    expect(tient([debut, seg(), etapeA, seg(), etapeB, seg(), tard, seg(), fin])).toBe(false);
    expect(tient([debut, seg(), etapeA, seg(), etapeB, { type: "free", from: "11:00", to: "12:00" }, seg(), tard, seg(), fin])).toBe(true);
    // Segment à travers un changement de ville.
    const changement = { type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "11:00", estimatedMinutes: 30 };
    expect(tient([debut, seg(), etapeA, seg(), etapeB, changement, seg(), etape("j1-5", "Offices", { start: "11:30", end: "12:00", placeId: `${PLACE}_C` }), seg(), fin])).toBe(false);
    expect(tient([debut, seg(), etapeA, seg(), etapeB, seg(), changement, etape("j1-5", "Offices", { start: "11:30", end: "12:00", placeId: `${PLACE}_C` }), seg(), fin])).toBe(false);

    // Par la révision : un lieu à soi **non verrouillé** qui chevauche une étape verrouillée dans la base (jamais retirée) : la
    // réinjection ne peut pas tenir le jour, R3 seule l'aurait laissé passer, et rien n'est écrit.
    const verrouillee = etape("j1-2", "Forum romain", { start: "12:30", end: "13:30", placeId: `${PLACE}_B`, locked: true });
    const base = version([debut, seg(), verrouillee, lieuASoi("12:00", "13:00", { locked: false }), fin]);
    const sortieIa = version([debut, seg(), etape("j1-2", "Forum romain", { start: "12:30", end: "13:30", placeId: `${PLACE}_B` }), seg(), fin]);
    const reinjection = reinjecterLieuxASoi(base, sortieIa, REGLES_TRANSIT);
    expect(reinjection.coherente).toBe(false);
    expect(verrousReportes(base, reinjection.instantane)).not.toBeNull();
    expect(versionDeLaRevision(base, sortieIa, REGLES_TRANSIT).tenue).toBeNull();
  });

  it("test 6 : R3 bloque toujours ; un voyage sans lieu à soi : version identique, aucun événement", () => {
    const sansLieu = reinjecterLieuxASoi(INSTANTANE, revisionAvecPause, REGLES_TRANSIT);
    expect(sansLieu).toEqual({ instantane: revisionAvecPause, places: 0, stopsRemoved: 0, coherente: true });
    expect(sansLieu.instantane).toBe(revisionAvecPause);
    expect(lignesDuJournal(() => journaliserReinjection(sansLieu))).toEqual([]);
    // R3 : une étape verrouillée de la base absente de la révision : rien n'est écrit, lieu à soi réinjecté ou non.
    const base = version([debut, etape("j1-9", "Panthéon", { start: "17:30", end: "18:30", locked: true }), lieuASoi("12:00", "13:00"), fin]);
    expect(versionDeLaRevision(base, revisionAvecPause, REGLES_TRANSIT).tenue).toBeNull();
  });

  it("test 7 : journal : recalcul.lieux_a_soi garde places et stopsRemoved, retire identifiants, placeId et textes, refuse une chaîne", () => {
    const ligneJournal = JSON.parse(
      formatLogLine("recalcul.lieux_a_soi", { places: 2, stopsRemoved: 1, tripId: "00000000-0000-4000-8000-000000000001", placeId: PLACE_AJOUT, name: NOM, start: "12:00" }),
    ) as Record<string, unknown>;
    expect(ligneJournal).toEqual({ level: "info", event: "recalcul.lieux_a_soi", places: 2, stopsRemoved: 1, dropped: 4 });
    expect(JSON.parse(formatLogLine("recalcul.lieux_a_soi", { places: 1, stopsRemoved: "1" }))).toEqual({ level: "info", event: "recalcul.lieux_a_soi", places: 1, dropped: 1 });
    expect(JSON.parse(formatLogLine("recalcul.lieux_a_soi", { places: 1, stopsRemoved: -1 }))).toEqual({ level: "info", event: "recalcul.lieux_a_soi", places: 1, dropped: 1 });
    // Par la révision : compteurs seulement, ni nom ni `placeId` du lieu à soi.
    const lignes = lignesDuJournal(() => journaliserReinjection(reinjecterLieuxASoi(baseAvec(lieuASoi("12:00", "13:00")), revisionAvecPause, REGLES_TRANSIT)));
    expect(lignes).toEqual([{ level: "info", event: "recalcul.lieux_a_soi", places: 1, stopsRemoved: 0 }]);
    for (const sentinelle of [NOM, PLACE_AJOUT, AJOUT]) expect(JSON.stringify(lignes)).not.toContain(sentinelle);
  });
});

describe("capacité reviser et filet du code (PR 868 ; revue de la PR 875, bloquant 2)", () => {
  it("PR 868 : profil de forfait `revision` (décision 0142) : même valeurs de test partout, aucune requête Routes", async () => {
    expect(PROFILS_FORFAIT).toContain("revision");
    const attendu = { coutModelesMicros: 700_000, placesTextSearch: 100, placesDetails: 100, routesRequetes: 0, routesElements: 0 };
    expect(PLAFONDS_VARIANTE_SIMULEE.generations.revision).toEqual(attendu);
    expect(PLAFONDS_USAGE_TEST.generations.revision).toEqual(attendu);
    expect(PLAFONDS_LARGES.generations.revision).toEqual(attendu);
    const dep = resoudre({ plafonds: PLAFONDS_VARIANTE_SIMULEE });
    const { forfait } = await forfaitDeLaRevision(dep, { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "simulee" });
    expect(forfait).toEqual(forfaitDuProfil(PLAFONDS_VARIANTE_SIMULEE, dep.reglesPour("simulee")?.table ?? (undefined as never), "revision"));
    expect(forfait.routesRequetes).toBe(0);
    expect(forfait.coutModelesMicros).not.toBe(forfaitDuProfil(PLAFONDS_VARIANTE_SIMULEE, dep.reglesPour("simulee")?.table ?? (undefined as never), "programme").coutModelesMicros);
    await expect(forfaitDeLaRevision(dep, { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "production" })).rejects.toEqual(new ArretEtape("usage_unavailable"));
  });

  it("PR 868 (a) : un lieu écarté rendu par le modèle est retiré, compté dans creneauxRetires en plus de ceux de la lecture", async () => {
    const temoin = await (await capaciteRome()).reviser(ENTREE, SEJOUR_ROME, sansFiltre);
    expect(lieux(temoin.programme)).toContain(nomNormalise("Colisée"));
    const revue = await (await capaciteRome()).reviser(ENTREE, SEJOUR_ROME, (p) => retirerEtapesEcartees(p, ["Colisée", "Forum romain"]));
    expect(revue.programme).not.toBeNull();
    expect(lieux(revue.programme)).not.toContain(nomNormalise("Colisée"));
    expect(lieux(revue.programme)).not.toContain(nomNormalise("Forum romain"));
    expect(revue.creneauxRetires).toBe(temoin.creneauxRetires + 2);
    expect(lieux(revue.programme)).toHaveLength(lieux(temoin.programme).length - 2);
  });

  it("PR 868 (b) : le filtre vide toutes les journées : programme nul (l'étape s'arrête sur model_output_invalid, aucune version)", async () => {
    // Chaque journée ne porte que le lieu écarté.
    const seulEcarte = (p: ProgrammeLu): ProgrammeLu => {
      const colisee = p.jours.flatMap((j) => j.creneaux).find((c) => c.lieu === "Colisée")!;
      return { ...p, jours: p.jours.map((j) => ({ ...j, creneaux: [colisee] })) };
    };
    const temoin = await (await capaciteRome(seulEcarte)).reviser(ENTREE, SEJOUR_ROME, sansFiltre);
    expect(temoin.programme).not.toBeNull();
    const revue = await (await capaciteRome(seulEcarte)).reviser(ENTREE, SEJOUR_ROME, (p) => retirerEtapesEcartees(p, ["Colisée"]));
    expect(revue.programme).toBeNull();
    const capacite = await capaciteRome(seulEcarte);
    await capacite.reviser(ENTREE, SEJOUR_ROME, (p) => retirerEtapesEcartees(p, ["Colisée"]));
    // Rien n'a été lu : la suite de l'étape (lieux, vérification) n'a aucun programme.
    expect(() => capacite.lieux({ jours: [], bonsPlans: [] })).toThrow(RangeError);
  });

  it("PR 868 (c) : une seule journée vidée par le filtre : les autres journées sont gardées", async () => {
    // Première journée réduite au lieu écarté ; les autres inchangées.
    const premiereEcartee = (p: ProgrammeLu): ProgrammeLu => ({
      ...p,
      jours: p.jours.map((j, i) => (i === 0 ? { ...j, creneaux: j.creneaux.filter((c) => c.lieu === "Colisée") } : j)),
    });
    const temoin = await (await capaciteRome(premiereEcartee)).reviser(ENTREE, SEJOUR_ROME, sansFiltre);
    const revue = await (await capaciteRome(premiereEcartee)).reviser(ENTREE, SEJOUR_ROME, (p) => retirerEtapesEcartees(p, ["Colisée"]));
    expect(revue.programme).not.toBeNull();
    const autres = (programme: typeof revue.programme) => (programme?.jours ?? []).filter((j) => j.date !== "2027-05-04");
    expect(autres(revue.programme)).toEqual(autres(temoin.programme));
    expect(autres(revue.programme).length).toBeGreaterThan(0);
    expect(lieux(revue.programme)).not.toContain(nomNormalise("Colisée"));
  });

  it("PR 868 : limite connue (décision 0142) : un lieu écarté rendu sous un autre nom n'est pas retiré par le filet", async () => {
    const renomme = (p: ProgrammeLu): ProgrammeLu => ({
      ...p,
      jours: p.jours.map((j) => ({ ...j, creneaux: j.creneaux.map((c) => (c.lieu === "Colisée" ? { ...c, lieu: "Amphithéâtre Flavien" } : c)) })),
    });
    const revue = await (await capaciteRome(renomme)).reviser(ENTREE, SEJOUR_ROME, (p) => retirerEtapesEcartees(p, ["Colisée"]));
    expect(lieux(revue.programme)).not.toContain(nomNormalise("Colisée"));
    expect(lieux(revue.programme)).toContain(nomNormalise("Amphithéâtre Flavien"));
  });
});
