import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type DaySnapshot, type Result, type RetainedTaste } from "@/contracts";
import { lireRevue } from "@/server/avis/avis";
import { restaurerGout, retenirGouts, retirerGout, retirerTousLesGouts, type DependancesGouts } from "@/server/gouts/gouts";
import { lireGoutsRetenus } from "@/server/gouts/lecture";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Retenir et retirer ses goûts sur la base réelle (tâche M8c-1, ticket 1121 ; spécification M8 § 5.1 à § 5.3 et § 6.5,
 * critères 2 à 7 ; décision 0160 § 1.3 point 7, § 1.8 et § 2.2) : `retenirGouts`, `retirerGout`, `restaurerGout`,
 * `retirerTousLesGouts` et les lectures (`lireRevue`, `lireGoutsRetenus`), sous `vadrouille_app` avec le `withOrg` réel,
 * sur la table `preferences` durcie par la migration 0026, comme `tests/db/avis.test.ts` pour les avis. L'horloge est
 * injectée (voyage simulé d'Édimbourg débloqué, fin le 2026-09-03, heure de Londres) ; le débit est injecté. Les signaux
 * sont des `answerYes` posés en base (forme admise sans proposition par 0014) : le seuil des goûts déduits est éprouvé par
 * les tests unitaires du domaine. Aucune donnée Google : `placeId` sentinelles du jeu simulé.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;

const EDIMBOURG_DEBLOQUE = "mock_trip_edimbourg_debloque";
/** 2026-09-03 à 00:00, heure de Londres : écran 16 ouvert. */
const OUVERT = Date.parse("2026-09-02T23:00:00Z");
/** 2026-10-04 à 00:00, heure de Londres : écran 16 en lecture seule. */
const LECTURE_SEULE = Date.parse("2026-10-03T23:00:00Z");

const MUSEES = "category:museum:less";
const NATURE = "category:nature:less";
const BALADES = "category:walk:less";

const contexte = (org: Org, userId = org.owner, role: AdapterContext["role"] = "owner"): AdapterContext => ({ organizationId: org.org, userId, role });

const donnees = (): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_DEBLOQUE);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG_DEBLOQUE}`);
  return converti.donnees;
};

const dependances = (ctx: AdapterContext, maintenant: number, plus: Partial<DependancesGouts> = {}): DependancesGouts => ({
  withOrg,
  contexte: async () => ctx,
  maintenant: () => maintenant,
  limiteur: async (): Promise<Result<void>> => ok(undefined),
  compter: async () => undefined,
  ...plus,
});

const retenir = (org: Org, tripId: string, candidateIds: string[], maintenant = OUVERT, ctx = contexte(org)) =>
  retenirGouts(dependances(ctx, maintenant), { tripId, candidateIds, requestId: randomUUID() });
const retirer = (org: Org, tasteId: string, ctx = contexte(org), plus: Partial<DependancesGouts> = {}) =>
  retirerGout(dependances(ctx, LECTURE_SEULE, plus), { tasteId, requestId: randomUUID() });
const liste = (org: Org, ctx = contexte(org)) => lireGoutsRetenus({ withOrg }, ctx);
const revue = (org: Org, tripId: string, maintenant = OUVERT, ctx = contexte(org)) =>
  lireRevue({ withOrg, maintenant: () => maintenant }, ctx, tripId);

/** Signaux `answerYes` actifs du voyage, un par catégorie. */
const poserReponses = (org: Org, tripId: string, categories: string[]) =>
  inTx(app, { org: org.org, user: org.owner }, async (c) => {
    for (const category of categories) {
      await c.query(
        "INSERT INTO public.preference_signals (organization_id, trip_id, request_id, signal, origin, category) VALUES ($1, $2, gen_random_uuid(), 'answerYes', 'question', $3)",
        [org.org, tripId, category],
      );
    }
  });

/** Organisation neuve, voyage débloqué terminé, trois réponses « éviter ». */
async function banc(membres = 0) {
  const org = await createOrg(auth, membres);
  const tripId = await ecrireVoyage(app, org, donnees());
  await poserReponses(org, tripId, ["museum", "nature", "walk"]);
  return { org, tripId };
}

type Ligne = Record<string, unknown>;
/** Lignes de `preferences` d'une personne, lues sous son propre contexte (RLS par personne de 0026). */
const lignes = (org: Org, user = org.owner): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user }, async (c) => (await c.query("SELECT to_jsonb(p) AS ligne FROM public.preferences AS p WHERE organization_id = $1 AND user_id = $2 ORDER BY consented_at, category", [org.org, user])).rows.map((r) => r.ligne as Ligne));

const gout = (id: string, tripId: string | null): RetainedTaste => {
  const [, category, direction] = id.split(":");
  return { id, origin: "confirmed", subject: { kind: "category", category, direction }, fromTripId: tripId } as RetainedTaste;
};

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
});

afterAll(closeAll);

describe("goûts retenus sur api (M8c-1, ticket 1121)", () => {
  it("lecture : les candidats viennent des signaux actifs du voyage ; rien de retenu au départ", async () => {
    const { org, tripId } = await banc();
    const lue = await revue(org, tripId);
    expect(lue?.tasteCandidates.map((candidat) => candidat.id)).toEqual([MUSEES, NATURE, BALADES]);
    expect(lue?.tasteCandidates.every((candidat) => candidat.origin === "confirmed")).toBe(true);
    expect(lue?.retainedIds).toEqual([]);
    expect(await liste(org)).toEqual([]);
  });

  it("goûts: aucune donnée Google ni texte en base — critère 2 : une ligne par goût (accord, origine, voyage), rien d'autre", async () => {
    const { org, tripId } = await banc();
    expect(await retenir(org, tripId, [NATURE, MUSEES])).toEqual(ok([gout(MUSEES, tripId), gout(NATURE, tripId)]));
    const ecrites = await lignes(org);
    expect(ecrites).toHaveLength(2);
    for (const ligne of ecrites) {
      expect(Object.keys(ligne).sort()).toEqual(["category", "consented_at", "created_at", "direction", "id", "organization_id", "origin", "source_trip_id", "subject_kind", "user_id"]);
      expect(ligne).toMatchObject({ organization_id: org.org, user_id: org.owner, subject_kind: "category", direction: "less", origin: "confirmed", source_trip_id: tripId });
      expect(typeof ligne.consented_at).toBe("string");
    }
    expect(ecrites.map((ligne) => ligne.category)).toEqual(["museum", "nature"]);
    // Un geste, une transaction : un seul instant d'accord.
    expect(ecrites[0]?.consented_at).toBe(ecrites[1]?.consented_at);
    // Sentinelles : aucun nom d'étape, aucun `placeId`, aucune destination du voyage d'origine dans les lignes.
    const versions = donnees().versions;
    const jours = (versions[versions.length - 1]?.snapshot as { days: DaySnapshot[] }).days;
    const sentinelles = jours.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" ? [item.stop.name, item.stop.placeId] : []))).filter((v): v is string => typeof v === "string" && v.length > 0);
    expect(sentinelles.length).toBeGreaterThan(0);
    const texte = JSON.stringify(ecrites);
    for (const sentinelle of [...sentinelles, "Édimbourg", "Edimbourg"]) expect(texte).not.toContain(sentinelle);
  });

  it("critère 2 : sans case, ou avec une clé hors des candidats recalculés : validation_failed, rien d'écrit", async () => {
    const { org, tripId } = await banc();
    expect((await retenir(org, tripId, [])).ok).toBe(false);
    expect(await retenir(org, tripId, [MUSEES, "category:tasting:more"])).toEqual(fail("validation_failed", "candidateIds"));
    expect(await retenir(org, tripId, ["distance"])).toEqual(fail("validation_failed", "candidateIds"));
    expect(await lignes(org)).toEqual([]);
  });

  it("critère 3 : un goût déjà retenu est rendu par la lecture ; le retenir de nouveau n'écrit rien (première origine, premier voyage)", async () => {
    const { org, tripId } = await banc();
    expect(await retenir(org, tripId, [MUSEES])).toEqual(ok([gout(MUSEES, tripId)]));
    expect((await revue(org, tripId))?.retainedIds).toEqual([MUSEES]);
    const autre = await ecrireVoyage(app, org, donnees());
    await poserReponses(org, autre, ["museum", "nature"]);
    expect(await retenir(org, autre, [MUSEES, NATURE])).toEqual(ok([gout(NATURE, autre)]));
    expect(await liste(org)).toEqual([gout(MUSEES, tripId), gout(NATURE, autre)]);
    expect(await lignes(org)).toHaveLength(2);
  });

  it("ordre de la liste : ordre des gestes, puis preferenceKey dans un même geste (0160 § 1.3 point 7)", async () => {
    const { org, tripId } = await banc();
    await retenir(org, tripId, [BALADES]);
    await retenir(org, tripId, [NATURE, MUSEES]);
    expect((await liste(org)).map((taste) => taste.id)).toEqual([BALADES, MUSEES, NATURE]);
  });

  it("critère 4 : retirer supprime la ligne et rend le goût ; « Annuler » le rétablit (sujet, origine, voyage) ; tout retirer : plus aucune ligne", async () => {
    const { org, tripId } = await banc();
    await retenir(org, tripId, [MUSEES, NATURE]);
    expect(await retirer(org, MUSEES)).toEqual(ok(gout(MUSEES, tripId)));
    expect((await liste(org)).map((taste) => taste.id)).toEqual([NATURE]);
    expect(await retirer(org, MUSEES)).toEqual(fail("not_found"));

    const deps = dependances(contexte(org), LECTURE_SEULE);
    expect(await restaurerGout(deps, { taste: gout(MUSEES, tripId), requestId: randomUUID() })).toEqual(ok(undefined));
    // Rejouer « Annuler » n'écrit pas deux fois (unicité).
    expect(await restaurerGout(deps, { taste: gout(MUSEES, tripId), requestId: randomUUID() })).toEqual(ok(undefined));
    expect(await liste(org)).toEqual([gout(NATURE, tripId), gout(MUSEES, tripId)]);

    expect(await retirerTousLesGouts(deps, { requestId: randomUUID() })).toEqual(ok(undefined));
    expect(await lignes(org)).toEqual([]);
    // Sans goût, « tout retirer » réussit encore.
    expect(await retirerTousLesGouts(deps, { requestId: randomUUID() })).toEqual(ok(undefined));
  });

  it("« Annuler » : le voyage d'origine doit être un voyage de la personne dans l'organisation (validation_failed, rien d'écrit)", async () => {
    const { org } = await banc();
    const ailleurs = await banc();
    const deps = dependances(contexte(org), OUVERT);
    expect(await restaurerGout(deps, { taste: gout(MUSEES, ailleurs.tripId), requestId: randomUUID() })).toEqual(fail("validation_failed", "taste"));
    expect(await restaurerGout(deps, { taste: gout(MUSEES, randomUUID()), requestId: randomUUID() })).toEqual(fail("validation_failed", "taste"));
    expect(await lignes(org)).toEqual([]);
  });

  it("critères 5 et 7 : retrait jamais refusé — limiteur en panne, écran en lecture seule, goût sans voyage d'origine", async () => {
    const { org, tripId } = await banc();
    await retenir(org, tripId, [MUSEES, NATURE]);
    // Lecture seule : retenir est refusé, les candidats restent lus, le retrait reste possible.
    expect(await retenir(org, tripId, [BALADES], LECTURE_SEULE)).toEqual(fail("not_found"));
    expect((await revue(org, tripId, LECTURE_SEULE))?.access).toBe("readOnly");
    const panne = { compter: async () => Promise.reject(new Error("limiteur en panne")) };
    expect(await retirer(org, MUSEES, contexte(org), panne)).toEqual(ok(gout(MUSEES, tripId)));
    // Goût dont le voyage d'origine n'est plus connu (`source_trip_id` nul, comme après `ON DELETE SET NULL`).
    const deps = dependances(contexte(org), LECTURE_SEULE, panne);
    expect(await restaurerGout(deps, { taste: gout(BALADES, null), requestId: randomUUID() })).toEqual(ok(undefined));
    expect(await retirer(org, BALADES, contexte(org), panne)).toEqual(ok(gout(BALADES, null)));
    expect(await retirerTousLesGouts(deps, { requestId: randomUUID() })).toEqual(ok(undefined));
    expect(await lignes(org)).toEqual([]);
  });

  it("critère 6 : isolation — ni lus ni retirés par une autre personne de l'organisation ni par une autre organisation", async () => {
    const { org, tripId } = await banc(1);
    const autre = await banc();
    await retenir(org, tripId, [MUSEES, NATURE]);
    await retenir(autre.org, autre.tripId, [MUSEES]);
    const membre = contexte(org, org.members[0]!, "member");

    // Autre personne de la même organisation : liste vide, retrait `not_found`, « tout retirer » sans effet sur autrui.
    expect(await liste(org, membre)).toEqual([]);
    expect(await retirer(org, MUSEES, membre)).toEqual(fail("not_found"));
    expect(await retirerTousLesGouts(dependances(membre, OUVERT), { requestId: randomUUID() })).toEqual(ok(undefined));
    // Un membre non propriétaire ne retient rien par le voyage d'un autre.
    expect(await retenir(org, tripId, [BALADES], OUVERT, membre)).toEqual(fail("not_found"));

    // Autre organisation : son propre goût seulement ; son « tout retirer » ne touche pas la première.
    expect(await liste(autre.org)).toEqual([gout(MUSEES, autre.tripId)]);
    expect(await retenir(autre.org, tripId, [MUSEES])).toEqual(fail("not_found"));
    expect(await retirerTousLesGouts(dependances(contexte(autre.org), OUVERT), { requestId: randomUUID() })).toEqual(ok(undefined));
    expect(await liste(autre.org)).toEqual([]);

    expect(await liste(org)).toEqual([gout(MUSEES, tripId), gout(NATURE, tripId)]);
  });
});
