import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attempt, closeAll, connect, countAs, type DbClient, expectRefused, inTx, type SeedIds, seedOrganization } from "./helpers";

/**
 * Tri enregistré de B10a (migration `0014_tri_enregistre`, décision 0112 § 3.1 à § 3.7 et § 6, « PR de migration ») :
 * droits restreints (un `UPDATE` de `category` par `vadrouille_app` est refusé), une seconde décision active sur la même
 * proposition refusée par l'index, une seconde question `category` non retirée refusée, formes d'un signal, clôtures en
 * ajout seulement, clés étrangères composées dans l'organisation, purge du compte qui vide les nouvelles tables.
 * Chaque test se connecte avec `vadrouille_app` (contexte de l'organisation) ; la purge, avec `vadrouille_account_admin`.
 */

let app: DbClient;
let auth: DbClient;
let a: SeedIds;
let b: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
});

afterAll(closeAll);

const ctx = (org: SeedIds) => ({ org: org.org, user: org.owner });

/** Une case `proposal` de l'aperçu, à une position libre ; renvoie l'identifiant de la ligne. */
async function proposition(c: DbClient, org: SeedIds): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content)
     VALUES ($1, $2, $3, 'preview', $4, 'proposal', 1, '10:00', 'activity', $5) RETURNING id`,
    [org.org, org.trip, org.generationRun, Math.floor(Math.random() * 1e9) + 1, JSON.stringify({ id: `etape-${randomUUID()}`, kind: "activity" })],
  );
  return rows[0].id as string;
}

/** Décision de carte (forme du § 3.3) sur une proposition ; renvoie l'identifiant du signal. */
async function decision(c: DbClient, org: SeedIds, proposalId: string, signal = "dislike", category = "museum"): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO preference_signals (organization_id, trip_id, request_id, signal, origin, category, proposal_id, place_id)
     VALUES ($1, $2, $3, $4, 'gesture', $5, $6, 'ChIJ-test') RETURNING id`,
    [org.org, org.trip, randomUUID(), signal, category, proposalId],
  );
  return rows[0].id as string;
}

const INSERT_SIGNAL =
  "INSERT INTO preference_signals (organization_id, trip_id, request_id, signal, origin, category, reason, proposal_id, place_id, candidate_id) VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, $6, $7, $8, $9)";

describe("tri enregistré : droits de vadrouille_app sur preference_signals (0112 § 3.1)", () => {
  it("un UPDATE de category, signal, proposal_id, reason, organization_id ou seq est refusé ; les colonnes d'annulation s'écrivent", async () => {
    await inTx(app, ctx(a), async (c) => {
      const p = await proposition(c, a);
      const s = await decision(c, a, p);
      for (const set of ["category = 'walk'", "signal = 'like'", "proposal_id = NULL", "reason = 'other'", "place_id = NULL", "created_at = now()", "trip_id = trip_id", "request_id = gen_random_uuid()"]) {
        await expectRefused(c, `UPDATE preference_signals SET ${set} WHERE id = $1`, [s]);
      }
      const annule = await c.query(
        "UPDATE preference_signals SET status = 'cancelled', previous_status = status, cancelled_at = now(), cancel_request_id = gen_random_uuid() WHERE id = $1",
        [s],
      );
      expect(annule.rowCount).toBe(1);
      // Annulation d'un « Retirer » (B10c) : statut d'avant rétabli, colonnes d'annulation remises à nul.
      const retabli = await c.query(
        "UPDATE preference_signals SET status = previous_status, previous_status = NULL, cancelled_at = NULL, cancel_request_id = NULL WHERE id = $1",
        [s],
      );
      expect(retabli.rowCount).toBe(1);
      await expectRefused(c, "DELETE FROM preference_signals WHERE id = $1", [s]);
    });
  });

  it("colonnes d'annulation : présentes si et seulement si le statut est cancelled ; statut d'avant jamais cancelled", async () => {
    await inTx(app, ctx(a), async (c) => {
      const s = await decision(c, a, await proposition(c, a));
      for (const set of [
        "status = 'cancelled'",
        "status = 'cancelled', previous_status = 'confirmed', cancelled_at = now()",
        "status = 'cancelled', previous_status = 'cancelled', cancelled_at = now(), cancel_request_id = gen_random_uuid()",
        "cancelled_at = now()",
        "previous_status = 'confirmed'",
        "cancel_request_id = gen_random_uuid()",
      ]) {
        expect((await attempt(c, `UPDATE preference_signals SET ${set} WHERE id = $1`, [s])).code, set).toBe("23514");
      }
    });
  });

  it("seq est attribué par la base, croissant, et ne peut être ni fourni ni modifié", async () => {
    await inTx(app, ctx(a), async (c) => {
      const p1 = await decision(c, a, await proposition(c, a));
      const p2 = await decision(c, a, await proposition(c, a));
      const { rows } = await c.query("SELECT id, seq FROM preference_signals WHERE id = ANY($1::uuid[])", [[p1, p2]]);
      const seq = new Map(rows.map((r) => [r.id as string, BigInt(r.seq as string)]));
      expect(seq.get(p2)! > seq.get(p1)!).toBe(true);
      expect(
        (await attempt(c, "INSERT INTO preference_signals (organization_id, trip_id, request_id, signal, origin, category, seq) VALUES ($1, $2, gen_random_uuid(), 'answerYes', 'question', 'walk', 1)", [a.org, a.trip])).code,
      ).toBe("428C9");
      // Refusé par la colonne générée (réécriture, 428C9) avant même le contrôle des droits (42501).
      expect(["428C9", "42501"]).toContain((await attempt(c, "UPDATE preference_signals SET seq = 1 WHERE id = $1", [p1])).code);
    });
  });
});

describe("tri enregistré : formes d'un signal (0112 § 3.3)", () => {
  it("formes admises : décision de carte, answerYes, answerNo (catégorie nulle pour la distance), travelReduction", async () => {
    await inTx(app, ctx(a), async (c) => {
      const p = await proposition(c, a);
      for (const [signal, origin, category, reason, proposal, place] of [
        ["like", "gesture", "walk", null, p, "ChIJ-test"],
        ["answerYes", "question", "museum", "tooBusy", null, null],
        ["answerNo", "question", "museum", null, null, null],
        ["answerNo", "question", null, "tooFar", null, null],
        ["travelReduction", "question", null, null, null, null],
      ] as const) {
        expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, signal, origin, category, reason, proposal, place, null])).code, `${signal} ${category}`).toBeUndefined();
      }
    });
  });

  it("formes refusées : carte sans proposition, sans catégorie, avec raison ou d'origine question ; réponse avec proposition ou lieu ; brief ; codes hors liste", async () => {
    await inTx(app, ctx(a), async (c) => {
      const p = await proposition(c, a);
      const cases: [string, unknown[]][] = [
        ["carte sans proposition", ["dislike", "gesture", "museum", null, null, null, null]],
        ["carte sans catégorie", ["dislike", "gesture", null, null, p, null, null]],
        ["carte avec raison", ["dislike", "gesture", "museum", "other", p, null, null]],
        ["carte d'origine question", ["choose", "question", "restaurant", null, p, null, null]],
        ["answerYes sans catégorie", ["answerYes", "question", null, null, null, null, null]],
        ["answerYes avec proposition", ["answerYes", "question", "museum", null, p, null, null]],
        ["answerNo d'origine gesture", ["answerNo", "gesture", "museum", null, null, null, null]],
        ["answerNo avec lieu", ["answerNo", "question", "museum", null, null, "ChIJ-test", null]],
        ["travelReduction avec catégorie", ["travelReduction", "question", "walk", null, null, null, null]],
        ["travelReduction avec raison", ["travelReduction", "question", null, "tooFar", null, null, null]],
        ["origine brief", ["answerYes", "brief", "museum", null, null, null, null]],
        ["catégorie hors liste", ["answerYes", "question", "casino", null, null, null, null]],
        ["raison hors liste", ["answerNo", "question", "museum", "boring", null, null, null]],
      ];
      for (const [nom, valeurs] of cases) {
        expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, ...valeurs])).code, nom).toBe("23514");
      }
      // Candidat hors décision de carte : refusé (option la plus restrictive, question de la PR).
      const candidat = a.rows.candidates;
      expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, "answerYes", "question", "museum", null, null, null, candidat])).code).toBe("23514");
    });
  });

  it("une décision ne vise jamais la proposition d'une autre organisation (clé étrangère composée)", async () => {
    const pB = await inTx(app, ctx(b), (c) => proposition(c, b));
    await inTx(app, ctx(a), async (c) => {
      expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, "like", "gesture", "museum", null, pB, null, null])).code).toBe("23503");
      expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, "like", "gesture", "museum", null, randomUUID(), null, null])).code).toBe("23503");
    });
  });
});

describe("tri enregistré : une décision active par proposition (0112 § 3.6)", () => {
  it("une seconde décision active sur la même proposition est refusée par l'index ; après annulation, une nouvelle est admise", async () => {
    await inTx(app, ctx(a), async (c) => {
      const p = await proposition(c, a);
      const premiere = await decision(c, a, p, "like", "walk");
      expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, "dislike", "gesture", "walk", null, p, null, null])).code).toBe("23505");
      await c.query(
        "UPDATE preference_signals SET status = 'cancelled', previous_status = status, cancelled_at = now(), cancel_request_id = gen_random_uuid() WHERE id = $1",
        [premiere],
      );
      expect((await attempt(c, INSERT_SIGNAL, [a.org, a.trip, "dislike", "gesture", "walk", null, p, null, null])).code).toBeUndefined();
      // Rétablir la première décision ferait deux décisions actives : refusé.
      expect(
        (await attempt(c, "UPDATE preference_signals SET status = previous_status, previous_status = NULL, cancelled_at = NULL, cancel_request_id = NULL WHERE id = $1", [premiere])).code,
      ).toBe("23505");
    });
  });
});

describe("tri enregistré : clôtures d'un tri (0112 § 3.4)", () => {
  const INSERT_CLOTURE =
    "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, $4, $5, $6)";

  it("ajout seulement : ni UPDATE ni DELETE pour vadrouille_app ; même requestId ou même borne refusés ; phase et position contrôlées", async () => {
    await inTx(app, ctx(a), async (c) => {
      const requete = randomUUID();
      const position = Math.floor(Math.random() * 1e9) + 1;
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, a.generationRun, "preview", position, requete])).code).toBeUndefined();
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, a.generationRun, "preview", position + 1, requete])).code, "même requestId").toBe("23505");
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, a.generationRun, "preview", position, randomUUID()])).code, "même borne").toBe("23505");
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, a.generationRun, "full", position + 2, randomUUID()])).code, "phase").toBe("23514");
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, a.generationRun, "deck", 0, randomUUID()])).code, "position").toBe("23514");
      await expectRefused(c, "UPDATE deck_closures SET through_position = through_position + 1 WHERE request_id = $1", [requete]);
      await expectRefused(c, "DELETE FROM deck_closures WHERE request_id = $1", [requete]);
    });
  });

  it("une clôture ne vise jamais l'exécution ou le voyage d'une autre organisation", async () => {
    await inTx(app, ctx(a), async (c) => {
      expect((await attempt(c, INSERT_CLOTURE, [a.org, a.trip, b.generationRun, "preview", 1, randomUUID()])).code).toBe("23503");
      expect((await attempt(c, INSERT_CLOTURE, [a.org, b.trip, a.generationRun, "preview", 1, randomUUID()])).code).toBe("23503");
    });
  });
});

describe("tri enregistré : questions posées (0112 § 3.5)", () => {
  /** Organisation neuve : aucune question ni signal hérité du peuplement commun. */
  let c3: SeedIds;
  beforeAll(async () => {
    c3 = await seedOrganization(auth, app);
    await inTx(app, ctx(c3), (c) => c.query("UPDATE preference_prompts SET state = 'closed' WHERE state = 'open'"));
  });

  const INSERT_QUESTION =
    "INSERT INTO preference_prompts (organization_id, trip_id, kind, category, trigger_signal_id) VALUES ($1, $2, $3, $4, $5) RETURNING id";

  it("une seconde question category non retirée est refusée ; retirée, elle peut être reposée ; au plus une question ouverte par voyage", async () => {
    await inTx(app, ctx(c3), async (c) => {
      const d1 = await decision(c, c3, await proposition(c, c3), "dislike", "nightlife");
      const d2 = await decision(c, c3, await proposition(c, c3), "dislike", "nightlife");
      const d3 = await decision(c, c3, await proposition(c, c3), "dislike", "market");
      const q1 = (await c.query(INSERT_QUESTION, [c3.org, c3.trip, "category", "nightlife", d1])).rows[0].id as string;
      expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, "category", "market", d3])).code, "seconde ouverte").toBe("23505");
      await c.query("UPDATE preference_prompts SET state = 'closed', updated_at = now() WHERE id = $1", [q1]);
      expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, "category", "nightlife", d2])).code, "même catégorie, fermée").toBe("23505");
      await c.query("UPDATE preference_prompts SET state = 'withdrawn', updated_at = now() WHERE id = $1", [q1]);
      expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, "category", "nightlife", d2])).code, "après retrait").toBeUndefined();
      expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, "category", "market", d1])).code, "même décision déclenchante").toBe("23505");
    });
  });

  it("réponse non nulle si et seulement si answered ; formes de kind et category ; colonnes hors état et réponse non modifiables", async () => {
    await inTx(app, ctx(c3), async (c) => {
      await c.query("UPDATE preference_prompts SET state = 'closed', updated_at = now() WHERE state = 'open'");
      const d = await decision(c, c3, await proposition(c, c3), "dislike", "heritage");
      const q = (await c.query(INSERT_QUESTION, [c3.org, c3.trip, "category", "heritage", d])).rows[0].id as string;
      const reponse = (
        await c.query(
          "INSERT INTO preference_signals (organization_id, trip_id, request_id, signal, origin, category, reason) VALUES ($1, $2, gen_random_uuid(), 'answerYes', 'question', 'heritage', 'notMyStyle') RETURNING id",
          [c3.org, c3.trip],
        )
      ).rows[0].id as string;
      expect((await attempt(c, "UPDATE preference_prompts SET state = 'answered' WHERE id = $1", [q])).code, "answered sans réponse").toBe("23514");
      expect((await attempt(c, "UPDATE preference_prompts SET answer_signal_id = $2 WHERE id = $1", [q, reponse])).code, "réponse sans answered").toBe("23514");
      expect((await attempt(c, "UPDATE preference_prompts SET state = 'answered', answer_signal_id = $2, updated_at = now() WHERE id = $1", [q, reponse])).code).toBeUndefined();
      for (const set of ["kind = 'distance'", "category = 'walk'", "trigger_signal_id = trigger_signal_id", "trip_id = trip_id", "created_at = now()", "organization_id = organization_id"]) {
        await expectRefused(c, `UPDATE preference_prompts SET ${set} WHERE id = $1`, [q]);
      }
      await expectRefused(c, "DELETE FROM preference_prompts WHERE id = $1", [q]);
      expect((await attempt(c, "UPDATE preference_prompts SET state = 'pending' WHERE id = $1", [q])).code, "état hors liste").toBe("23514");
      for (const [kind, category] of [["category", null], ["distance", "walk"], ["category", "casino"], ["budget", null]] as const) {
        expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, kind, category, await decision(c, c3, await proposition(c, c3))])).code, `${kind} ${category}`).toBe("23514");
      }
    });
  });

  it("une question ne vise jamais le signal d'une autre organisation", async () => {
    await inTx(app, ctx(c3), async (c) => {
      await c.query("UPDATE preference_prompts SET state = 'closed', updated_at = now() WHERE state = 'open'");
      expect((await attempt(c, INSERT_QUESTION, [c3.org, c3.trip, "distance", null, b.rows.preference_signals])).code).toBe("23503");
    });
  });
});

describe("tri enregistré : purge du compte (0112 § 3.7 point 5)", () => {
  it("la purge vide questions, clôtures, signaux rattachés et propositions, sans toucher une autre organisation", async () => {
    const d = await seedOrganization(auth, app);
    await inTx(app, ctx(d), async (c) => {
      await c.query("UPDATE preference_prompts SET state = 'closed', updated_at = now() WHERE state = 'open'");
      const p = await proposition(c, d);
      const s = await decision(c, d, p, "dislike", "tasting");
      await c.query("INSERT INTO preference_prompts (organization_id, trip_id, kind, category, trigger_signal_id) VALUES ($1, $2, 'category', 'tasting', $3)", [d.org, d.trip, s]);
      await c.query(
        "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', 1, gen_random_uuid())",
        [d.org, d.trip, d.generationRun],
      );
    });
    const avantB = { prompts: await countAs(app, ctx(b), "preference_prompts"), closures: await countAs(app, ctx(b), "deck_closures") };
    await inTx(app, ctx(d), (c) => c.query("SELECT purge_organization_data($1)", [d.org]), "vadrouille_account_admin");
    for (const table of ["preference_prompts", "deck_closures", "preference_signals", "proposals", "generation_runs", "trips"]) {
      expect(await countAs(app, ctx(d), table), table).toBe(0);
    }
    expect(await countAs(app, ctx(b), "preference_prompts")).toBe(avantB.prompts);
    expect(await countAs(app, ctx(b), "deck_closures")).toBe(avantB.closures);
  });
});
