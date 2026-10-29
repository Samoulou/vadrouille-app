// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { EntreeRevisionSchema, type EntreeRevision } from "@/ai/entree-revision";
import { TripSnapshotSchema, type TripSnapshot } from "@/contracts";
import type { EntreeRevisionDuProgramme } from "@/server/composition/generation";
import { choixDuTri } from "@/server/generation/etapes-revision";
import * as p0 from "@/server/p0/revision";
import type { EntreeProgramme } from "@/server/programme/entree";
import {
  entreeRevisionDepuisJours,
  nomNormalise,
  nomsEcartesDesJours,
  retirerEtapesEcartees,
  type EntreeRevisionProgramme,
} from "@/server/programme/revision";
import type { SignalDuRecalcul, TriDuRecalcul } from "@/domain/recalcul";

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
