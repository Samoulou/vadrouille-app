// @vitest-environment node
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";

import { EntreeRevisionSchema, type EntreeRevision } from "@/ai/entree-revision";
import { TripSnapshotSchema, type TripSnapshot } from "@/contracts";
import { PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type EntreeRevisionDuProgramme, type FiltreRevision } from "@/server/composition/generation";
import { ArretEtape } from "@/server/generation/codes";
import { resoudre } from "@/server/generation/dependances";
import { forfaitDeLaRevision } from "@/server/generation/forfait-etape";
import { choixDuTri, verrousReportes } from "@/server/generation/etapes-revision";
import * as p0 from "@/server/p0/revision";
import type { EntreeProgramme } from "@/server/programme/entree";
import {
  entreeRevisionDepuisJours,
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
