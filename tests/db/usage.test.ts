import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PlafondsUsage } from "@/server/config/usage";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { coutTotalMicros, lignesDuForfait } from "@/server/usage/forfait";
import type { PoolSql } from "@/server/usage/neon";
import { avecReservation, demandeDe, horlogeSysteme, type ContexteAppel } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";
import {
  forfaitDeLAction,
  forfaitDuProfil,
  ORGANISATION_ACTIONS_SANS_COMPTE,
  reserverAction,
  reserverForfait,
  type ExecuteurUsage,
  type ReglesUsage,
  type TransactionOrganisation,
} from "@/server/usage/reservation";
import { creerWithOrg, executeurSql } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { PLAFONDS_USAGE_TEST } from "../support/plafonds-usage";
import { attempt, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org } from "./helpers";

/**
 * Consommation du MVP au forfait (spécification B7, B7c ; décision 0083 ; décision 0081, B9-TL-4 ; migration
 * 0010_usage_forfait). Les générations et relectures passent par le vrai `withOrg` (`creerWithOrg`, 0083 § 2) ; les
 * actions sans compte par le pool brut du rôle `vadrouille_app`. Remplace les deux gardes de P0r2 (0046 D13 point 7), levées par la migration avec le verdict de
 * la Sécurité. Les plafonds sont des **valeurs de test** ; les limites globales sont posées par rapport aux sommes déjà
 * présentes dans la base de test (partagée entre fichiers).
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const TABLE = TablePrixGoogleSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/prix-google.json"), "utf8")));

const base = createDatabase("vadrouille_app");
const withOrgTest = creerWithOrg(base);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await createOrg(auth);
});

afterAll(async () => {
  await base.$client.end();
  await closeAll();
});

/**
 * Transaction d'une génération, comme la composera B9 : `withOrg` avec l'organisation et l'utilisateur de la
 * génération, exécuteur `executeurSql` (0083 § 2) ; `compteur` compte les requêtes du module.
 */
function transactionDe(organisation: Pick<Org, "org" | "owner">, compteur?: { requetes: number }): TransactionOrganisation {
  return (fn) =>
    withOrgTest({ organizationId: organisation.org, userId: organisation.owner }, (tx) => {
      const executeur = executeurSql(tx);
      const compte: ExecuteurUsage = {
        query: (texte, valeurs) => {
          if (compteur) compteur.requetes += 1;
          return executeur.query(texte, valeurs);
        },
      };
      return fn(compte);
    });
}

/** Pool brut des actions sans compte sur une connexion `vadrouille_app` déjà ouverte (le module n'importe pas `pg`). */
function poolDe(client: DbClient, compteur?: { requetes: number }): PoolSql {
  return {
    async connect() {
      return {
        query: async (texte: string, valeurs?: readonly unknown[]) => {
          if (compteur) compteur.requetes += 1;
          const resultat = await client.query(texte, valeurs as unknown[] | undefined);
          return { rows: resultat.rows as Record<string, unknown>[] };
        },
        release() {},
      };
    },
  };
}

const regles = (plafonds: PlafondsUsage = PLAFONDS_USAGE_TEST): ReglesUsage => ({ plafonds, table: TABLE, horloge: horlogeSysteme });

type Totaux = {
  org_jour_micros: number;
  jour_text_search: number;
  jour_place_details: number;
  mois_google_micros: number;
  enveloppe_google_micros: number;
  mois_modeles_micros: number;
  enveloppe_modeles_micros: number;
};

async function totaux(org: string): Promise<Totaux> {
  const ligne = await inTx(app, { org }, async (c) => (await c.query("SELECT * FROM public.usage_forfait_totals()")).rows[0]);
  return Object.fromEntries(Object.entries(ligne as Record<string, string>).map(([k, v]) => [k, Number(v)])) as Totaux;
}

const lignesDe = async (org: string, generationRunId: string) =>
  inTx(app, { org }, async (c) =>
    (
      await c.query(
        "SELECT id, organization_id, trip_id, generation_run_id, step, provider, sku, units, cost_estimate_micros, created_at FROM public.usage_ledger WHERE generation_run_id = $1 ORDER BY provider, sku",
        [generationRunId],
      )
    ).rows,
  );

const nombreDeLignes = async () => Number((await admin.query("SELECT count(*) AS n FROM public.usage_ledger")).rows[0].n);

describe("usage: une ligne par forfait, jamais par appel (B7-TL-9 ; 0046 D13 point 7)", () => {
  /** Génération simulée : N fiches, M matrices Routes, K lots de notation, par le registre de P0r2. */
  async function generation(organisation: Org, appels: { details: number; routes: number; lots: number }) {
    const trip = randomUUID();
    const run = randomUUID();
    const compteur = { requetes: 0 };
    const reservation = await reserverForfait(transactionDe(organisation, compteur), { organisationId: organisation.org, tripId: trip, generationRunId: run, profil: "apercu" }, regles());
    if (!reservation.ok) throw new Error(reservation.code);
    const requetesReservation = compteur.requetes;
    const registre = creerRegistreForfait(reservation.forfait, reservation.executionId, horlogeSysteme);
    const contexte: ContexteAppel = { nature: "execution", executionId: run, periodes: { jour: { du: 0, au: Number.MAX_SAFE_INTEGER }, mois: { du: 0, au: Number.MAX_SAFE_INTEGER } } };
    const appeler = (appel: Parameters<typeof demandeDe>[1]) =>
      avecReservation({ port: registre, horloge: horlogeSysteme }, demandeDe(contexte, appel, reservation.plafonds), 10_000, async (_signal, appele) => {
        appele();
        return { valeur: true, coutReelMicros: null };
      });
    for (let i = 0; i < appels.details; i++) {
      expect((await appeler({ fournisseur: "google", methode: "places_details", sku: "places_details_enterprise", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: 20_000 })).ok).toBe(true);
    }
    for (let i = 0; i < appels.routes; i++) {
      expect((await appeler({ fournisseur: "google", methode: "routes_matrix", sku: "routes_matrix_essentials", unites: { requetes: 1, elements: 9 }, coutEstimeMicros: 45_000 })).ok).toBe(true);
    }
    for (let i = 0; i < appels.lots; i++) {
      expect((await appeler({ fournisseur: "modeles", methode: "chat", sku: "modele-test", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: 1_000 })).ok).toBe(true);
    }
    const avant = await nombreDeLignes();
    const consommation = await registre.consumption(null, { methode: "places_details" });
    expect(consommation.requetes).toBe(appels.details);
    // consumption() répond depuis le registre en mémoire : aucune requête à la base, aucune ligne écrite.
    expect(compteur.requetes).toBe(requetesReservation);
    expect(await nombreDeLignes()).toBe(avant);
    return { run, trip, forfait: reservation.forfait };
  }

  it("usage: une ligne par forfait, jamais par appel", async () => {
    const premiere = await generation(a, { details: 3, routes: 2, lots: 4 });
    const seconde = await generation(a, { details: 9, routes: 1, lots: 0 });
    const l1 = await lignesDe(a.org, premiere.run);
    const l2 = await lignesDe(a.org, seconde.run);
    const attendues = lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, PLAFONDS_USAGE_TEST.skus.modeles, premiere.forfait);
    // Une ligne par méthode du forfait, `step` = forfait, valeurs du forfait seul.
    expect(l1.map((l) => ({ step: l.step, provider: l.provider, sku: l.sku, units: Number(l.units), costEstimateMicros: Number(l.cost_estimate_micros) }))).toEqual(
      [...attendues].sort((x, y) => (x.provider + x.sku).localeCompare(y.provider + y.sku)),
    );
    for (const ligne of l1) expect(ligne).toMatchObject({ organization_id: a.org, trip_id: premiere.trip, generation_run_id: premiere.run, step: "forfait" });
    // Deux générations du même profil : lignes identiques hors id, generation_run_id, trip_id et created_at, quels que
    // soient N, M et K.
    const IDENTITE = new Set(["id", "generation_run_id", "trip_id", "created_at"]);
    const sansIdentite = (lignes: Record<string, unknown>[]) => lignes.map((ligne) => Object.fromEntries(Object.entries(ligne).filter(([cle]) => !IDENTITE.has(cle))));
    expect(sansIdentite(l2)).toEqual(sansIdentite(l1));
  });

  it("usage: aucune écriture Google par appel ni par lot de notation (gardes de P0r2 remplacées)", async () => {
    const run = randomUUID();
    await inTx(app, { org: a.org }, async (c) => {
      const inserer = (step: string, provider: string, sku: string, units: number, generation: string | null = null) =>
        attempt(c, "INSERT INTO public.usage_ledger (organization_id, generation_run_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, $2, $3, $4, $5, $6, 1)", [
          a.org,
          generation,
          step,
          provider,
          sku,
          units,
        ]);
      // Toute ligne qui n'est pas une ligne de forfait est refusée (anciens cas des deux gardes compris).
      for (const sku of Object.keys(TABLE.skus)) expect((await inserer("b", "google", sku, 1)).code, sku).toBe("23514");
      for (const step of ["d", "notation", "c"]) expect((await inserer(step, "modeles", "modele-x", 0)).code, step).toBe("23514");
      // Fournisseur hors identité (0049), unités de modèles (un nombre de lots), valeurs négatives.
      expect((await inserer("forfait", "fournisseur_x", "modele-x", 0)).code).toBe("23514");
      expect((await inserer("forfait", "modeles", "modeles_forfait", 3)).code).toBe("23514");
      expect((await inserer("forfait", "google", "places_details_enterprise", -1)).code).toBe("23514");
      // Une seule ligne par méthode et par génération : une seconde ligne (écriture par appel) échoue.
      expect((await inserer("forfait", "google", "places_details_enterprise", 10, run)).code).toBeUndefined();
      expect((await inserer("forfait", "google", "places_details_enterprise", 1, run)).code).toBe("23505");
    });
  });
});

describe("usage: plafonds appliqués à la réservation, avant tout appel", () => {
  it("usage: plafond atteint, aucun appel (par organisation et par jour, par mois et par fournisseur, enveloppe, quota du jour)", async () => {
    const organisation = await createOrg(auth);
    const org = organisation.org;
    const t = await totaux(org);
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    const modeles = forfait.coutModelesMicros ?? 0;
    const cas: [string, PlafondsUsage, string][] = [
      ["par organisation et par jour", { ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: coutTotalMicros(forfait) - 1 }, "cap_reached"],
      ["mois Google", { ...PLAFONDS_USAGE_TEST, limites: { ...PLAFONDS_USAGE_TEST.limites, moisGoogleMicros: t.mois_google_micros + forfait.coutGoogleMicros - 1, enveloppeGoogleMicros: 1e12 } }, "cap_reached"],
      ["mois des modèles", { ...PLAFONDS_USAGE_TEST, limites: { ...PLAFONDS_USAGE_TEST.limites, moisModelesMicros: t.mois_modeles_micros + modeles - 1, enveloppeModelesMicros: 1e12 } }, "cap_reached"],
      ["enveloppe Google", { ...PLAFONDS_USAGE_TEST, limites: { ...PLAFONDS_USAGE_TEST.limites, enveloppeGoogleMicros: t.enveloppe_google_micros + forfait.coutGoogleMicros - 1 } }, "envelope_reached"],
      ["enveloppe des modèles", { ...PLAFONDS_USAGE_TEST, limites: { ...PLAFONDS_USAGE_TEST.limites, enveloppeModelesMicros: t.enveloppe_modeles_micros + modeles - 1 } }, "envelope_reached"],
      ["quota du jour Google", { ...PLAFONDS_USAGE_TEST, limites: { ...PLAFONDS_USAGE_TEST.limites, quotaJourParMethode: t.jour_text_search + forfait.textSearchRequetes - 1 } }, "daily_quota_insufficient"],
    ];
    const avant = await nombreDeLignes();
    for (const [nom, plafonds, code] of cas) {
      const resultat = await reserverForfait(transactionDe(organisation), { organisationId: org, tripId: null, generationRunId: randomUUID(), profil: "apercu" }, regles(plafonds));
      // Refus avant l'appel : aucun forfait rendu, donc aucun registre ni transport ; rien n'est écrit.
      expect(resultat, nom).toEqual({ ok: false, code });
    }
    expect(await nombreDeLignes()).toBe(avant);
    // Avec les plafonds de test, la même réservation passe.
    expect((await reserverForfait(transactionDe(organisation), { organisationId: org, tripId: null, generationRunId: randomUUID(), profil: "apercu" }, regles())).ok).toBe(true);
  });

  it("usage: réservation atomique", async () => {
    const organisation = await createOrg(auth);
    const org = organisation.org;
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    // Le plafond du jour de l'organisation tient un forfait, pas deux.
    const plafonds = { ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: Math.floor(coutTotalMicros(forfait) * 1.5) };
    const demande = () => ({ organisationId: org, tripId: null, generationRunId: randomUUID(), profil: "apercu" as const });
    // Deux transactions withOrg simultanées, sur deux connexions du pool.
    const resultats = await Promise.all([reserverForfait(transactionDe(organisation), demande(), regles(plafonds)), reserverForfait(transactionDe(organisation), demande(), regles(plafonds))]);
    expect(resultats.filter((r) => r.ok)).toHaveLength(1);
    expect(resultats.filter((r) => !r.ok)).toEqual([{ ok: false, code: "cap_reached" }]);
    expect((await totaux(org)).org_jour_micros).toBe(coutTotalMicros(forfait));
  });
});

describe("usage: écritures isolées par organisation", () => {
  it("usage: écritures isolées par organisation", async () => {
    // Organisations propres à ce test : les sommes ne dépendent d'aucun autre test.
    const x = await createOrg(auth);
    const y = await createOrg(auth);
    const run = randomUUID();
    const reservation = await reserverForfait(transactionDe(y), { organisationId: y.org, tripId: null, generationRunId: run, profil: "mini" }, regles());
    expect(reservation.ok).toBe(true);
    // Le contexte vient de la génération : les lignes sont celles de Y, invisibles depuis X.
    expect((await lignesDe(y.org, run)).every((l) => l.organization_id === y.org)).toBe(true);
    expect(await lignesDe(x.org, run)).toEqual([]);
    // Contexte withOrg de X pour une génération de Y : refusé avant toute somme, rien d'écrit.
    const avant = await nombreDeLignes();
    expect(await reserverForfait(transactionDe(x), { organisationId: y.org, tripId: null, generationRunId: randomUUID(), profil: "mini" }, regles())).toEqual({
      ok: false,
      code: "usage_unavailable",
    });
    expect(await nombreDeLignes()).toBe(avant);
    await inTx(app, { org: x.org }, async (c) => {
      // X n'écrit pas pour Y (RLS, WITH CHECK).
      await expectRefused(c, "INSERT INTO public.usage_ledger (organization_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, 'forfait', 'modeles', 'modeles_forfait', 0, 1)", [y.org]);
      // vadrouille_app ne lit pas les sommes sans passer par la fonction ; la fonction ne rend que des sommes.
      const colonnes = Object.keys((await c.query("SELECT * FROM public.usage_forfait_totals()")).rows[0]).sort();
      expect(colonnes).toEqual(
        ["enveloppe_google_micros", "enveloppe_modeles_micros", "jour_place_details", "jour_text_search", "mois_google_micros", "mois_modeles_micros", "org_jour_micros"].sort(),
      );
    });
    // Somme du jour de l'organisation du contexte seulement.
    expect((await totaux(y.org)).org_jour_micros).toBe(coutTotalMicros(forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "mini")));
    expect((await totaux(x.org)).org_jour_micros).toBe(0);
    expect((await reserverForfait(transactionDe(x), { organisationId: x.org, tripId: null, generationRunId: randomUUID(), profil: "apercu" }, regles())).ok).toBe(true);
    expect((await totaux(x.org)).org_jour_micros).toBe(coutTotalMicros(forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu")));
    // Sans organisation dans le contexte : refusée.
    await inTx(app, {}, (c) => expectRefused(c, "SELECT * FROM public.usage_forfait_totals()"));
  });

  it("usage: demande mal formée ou organisation technique refusée sans requête", async () => {
    const compteur = { requetes: 0 };
    const transaction = transactionDe(a, compteur);
    for (const demande of [
      { organisationId: "pas-un-uuid", tripId: null, generationRunId: randomUUID(), profil: "apercu" as const },
      { organisationId: ORGANISATION_ACTIONS_SANS_COMPTE, tripId: null, generationRunId: randomUUID(), profil: "apercu" as const },
      { organisationId: "5e1f0000-0000-4000-8000-000000000001", tripId: null, generationRunId: randomUUID(), profil: "apercu" as const },
      { organisationId: a.org, tripId: null, generationRunId: null, profil: "apercu" as const },
      { organisationId: a.org, tripId: null, generationRunId: randomUUID(), profil: "relecture" as const },
    ]) {
      expect(await reserverForfait(transaction, demande, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    }
    expect(compteur.requetes).toBe(0);
  });
});

describe("usage: reprise et relectures (décision 0083 § 3 et § 4)", () => {
  it("usage: une même génération réservée deux fois (reprise d'étape) rend le même forfait sans nouvelle ligne", async () => {
    const organisation = await createOrg(auth);
    const demande = { organisationId: organisation.org, tripId: null, generationRunId: randomUUID(), profil: "apercu" as const };
    const premiere = await reserverForfait(transactionDe(organisation), demande, regles());
    expect(premiere.ok).toBe(true);
    const lignes = await lignesDe(organisation.org, demande.generationRunId);
    const jour = (await totaux(organisation.org)).org_jour_micros;
    // Reprise : même résultat, aucune ligne de plus, même avec un plafond du jour désormais atteint.
    const plein = { ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: jour };
    expect(await reserverForfait(transactionDe(organisation), demande, regles(plein))).toEqual(premiere);
    expect(await lignesDe(organisation.org, demande.generationRunId)).toEqual(lignes);
    expect((await totaux(organisation.org)).org_jour_micros).toBe(jour);
    // Même identifiant, autre profil : forfait différent, échec fermé, rien d'écrit.
    expect(await reserverForfait(transactionDe(organisation), { ...demande, profil: "mini" }, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await lignesDe(organisation.org, demande.generationRunId)).toEqual(lignes);
  });

  it("usage: deux relectures successives sont comptées chacune (index unique partiel)", async () => {
    const organisation = await createOrg(auth);
    const relecture = coutTotalMicros(forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "relecture"));
    for (let i = 0; i < 2; i++) {
      expect((await reserverForfait(transactionDe(organisation), { organisationId: organisation.org, tripId: null, generationRunId: null, profil: "relecture" }, regles())).ok).toBe(true);
    }
    const lignes = await inTx(app, { org: organisation.org }, async (c) => (await c.query("SELECT sku FROM public.usage_ledger WHERE generation_run_id IS NULL")).rows);
    expect(lignes).toEqual([{ sku: "routes_matrix_essentials" }, { sku: "routes_matrix_essentials" }]);
    expect((await totaux(organisation.org)).org_jour_micros).toBe(2 * relecture);
  });
});

describe("usage: actions sans compte (0081 B9-TL-4)", () => {
  it("usage: actions sans compte", async () => {
    const jour = (await totaux(ORGANISATION_ACTIONS_SANS_COMPTE)).org_jour_micros;
    const brief = forfaitDeLAction(PLAFONDS_USAGE_TEST, TABLE, "structureBrief");
    const logement = forfaitDeLAction(PLAFONDS_USAGE_TEST, TABLE, "suggestLodging");
    // Plafond global quotidien : tient une action de chaque, pas une troisième.
    const plafonds = { ...PLAFONDS_USAGE_TEST, actionsSansCompteJourMicros: jour + coutTotalMicros(brief) + coutTotalMicros(logement) };
    const r1 = await reserverAction(poolDe(app), "structureBrief", regles(plafonds));
    const r2 = await reserverAction(poolDe(app), "suggestLodging", regles(plafonds));
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.executionId).not.toBe(r2.executionId);
    // Lignes dans l'organisation des actions sans compte, sans voyage ; une par méthode du forfait de l'action.
    const lignes = await lignesDe(ORGANISATION_ACTIONS_SANS_COMPTE, r2.executionId ?? "");
    expect(lignes.map((l) => [l.provider, l.sku, Number(l.units)])).toEqual([
      ["google", "places_text_search_essentials_ids_only", 3],
      ["modeles", "modeles_forfait", 0],
    ]);
    for (const l of lignes) expect(l).toMatchObject({ organization_id: ORGANISATION_ACTIONS_SANS_COMPTE, trip_id: null, step: "forfait" });
    // Plafond atteint : refus, aucun registre, aucun appel, rien d'écrit.
    const avant = await nombreDeLignes();
    expect(await reserverAction(poolDe(app), "structureBrief", regles(plafonds))).toEqual({ ok: false, code: "cap_reached" });
    expect(await nombreDeLignes()).toBe(avant);
    // Le plafond par organisation des générations ne s'applique pas aux actions (et inversement).
    expect((await reserverAction(poolDe(app), "structureBrief", regles({ ...plafonds, actionsSansCompteJourMicros: 1e9, parOrganisationJourMicros: 1 }))).ok).toBe(true);
  });

  it("usage: l'organisation des actions sans compte n'a aucun membre", async () => {
    const { rows } = await admin.query(
      "SELECT (SELECT count(*) FROM public.memberships WHERE organization_id = $1) AS membres, (SELECT kind FROM public.organizations WHERE id = $1) AS kind, (SELECT slug FROM public.organizations WHERE id = $1) AS slug",
      [ORGANISATION_ACTIONS_SANS_COMPTE],
    );
    expect(rows[0]).toEqual({ membres: "0", kind: "personal", slug: "actions-sans-compte" });
    // Une adhésion est refusée à l'insertion, même par vadrouille_auth.
    await auth.query("BEGIN");
    try {
      const user = (await auth.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [`intrus-${randomUUID().slice(0, 8)}@exemple.ch`])).rows[0].id as string;
      expect((await attempt(auth, "INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [ORGANISATION_ACTIONS_SANS_COMPTE, user])).code).toBe("42501");
    } finally {
      await auth.query("ROLLBACK");
    }
    // Aucune ligne métier hors usage_ledger.
    for (const table of ["trips", "briefs", "stays", "candidates"]) {
      expect(Number((await admin.query(`SELECT count(*) AS n FROM public.${table} WHERE organization_id = $1`, [ORGANISATION_ACTIONS_SANS_COMPTE])).rows[0].n), table).toBe(0);
    }
  });

  it("base: l'organisation des actions sans compte ne peut être ni supprimée ni modifiée", async () => {
    for (const sql of ["DELETE FROM public.organizations WHERE id = $1", "UPDATE public.organizations SET name = 'x' WHERE id = $1"]) {
      await admin.query("BEGIN");
      try {
        expect((await attempt(admin, sql, [ORGANISATION_ACTIONS_SANS_COMPTE])).code, sql).toBe("42501");
      } finally {
        await admin.query("ROLLBACK");
      }
    }
    // vadrouille_auth (politiques USING (true)) : même refus.
    await inTx(auth, {}, async (c) => {
      expect((await attempt(c, "DELETE FROM organizations WHERE id = $1", [ORGANISATION_ACTIONS_SANS_COMPTE])).code).toBe("42501");
    });
    expect(Number((await admin.query("SELECT count(*) AS n FROM public.organizations WHERE id = $1", [ORGANISATION_ACTIONS_SANS_COMPTE])).rows[0].n)).toBe(1);
  });
});
