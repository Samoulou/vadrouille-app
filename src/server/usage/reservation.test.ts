// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { chargerPlafondsUsage, PLAFONDS_USAGE, PlafondsUsageSchema, PREFIXES_SKU_QUOTA } from "@/server/config/usage";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { coutTotalMicros, forfaitAction, lignesDuForfait, refusParOrganisation, STEP_FORFAIT } from "@/server/usage/forfait";
import type { ClientSql, PoolSql } from "@/server/usage/neon";
import { avecReservation, demandeDe, DELAI_PORT_MS, horlogeSysteme, type ContexteAppel } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";
import {
  CLE_VERROU_USAGE,
  forfaitDeLAction,
  forfaitDuProfil,
  ORGANISATION_ACTIONS_SANS_COMPTE,
  plafondsDuForfait,
  reserverAction,
  reserverForfait,
  type ReglesUsage,
  type TransactionOrganisation,
} from "@/server/usage/reservation";

import { creerHorlogeManuelle } from "../../../tests/support/horloge-manuelle";
import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";

/**
 * Réservation du forfait dans `usage_ledger` (spécification B7, B7c ; B7-TL-6, B7-TL-9, B7-TL-10 ; 0081 B9-TL-4), sur
 * une base simulée : sommes rendues par le test, requêtes enregistrées. Les cas sur la vraie base (atomicité,
 * isolation, contraintes) sont dans `tests/db/usage.test.ts`.
 */

const RACINE = process.cwd();
const TABLE = TablePrixGoogleSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/prix-google.json"), "utf8")));
const ORG = "0b5a1c3e-1111-4222-8333-444455556666";
const RUN = "0b5a1c3e-aaaa-4bbb-8ccc-ddddeeeeffff";
const USER = "0b5a1c3e-2222-4333-8444-555566667777";

type Sommes = {
  org_jour_micros: number;
  jour_text_search: number;
  jour_place_details: number;
  mois_google_micros: number;
  enveloppe_google_micros: number;
  mois_modeles_micros: number;
  enveloppe_modeles_micros: number;
};
const ZERO: Sommes = {
  org_jour_micros: 0,
  jour_text_search: 0,
  jour_place_details: 0,
  mois_google_micros: 0,
  enveloppe_google_micros: 0,
  mois_modeles_micros: 0,
  enveloppe_modeles_micros: 0,
};

type LigneExistante = { provider: string; sku: string; units: number; cost_estimate_micros: number };

/**
 * Base simulée : rend `sommes` (en texte, comme `pg` pour un `bigint`), les lignes `existantes` de la génération et
 * l'organisation du contexte posée ; garde chaque requête et chaque `release`.
 */
function baseSimulee(sommes: Sommes = ZERO, existantes: readonly LigneExistante[] = []) {
  const requetes: { texte: string; valeurs: readonly unknown[] }[] = [];
  const liberations: unknown[] = [];
  let org = "";
  const client: ClientSql = {
    async query(texte, valeurs = []) {
      requetes.push({ texte, valeurs });
      if (texte.includes("set_config('app.organization_id'")) org = String(valeurs[0]);
      if (texte.includes("app_current_org")) return { rows: [{ set_config: "2000", org }] };
      if (texte.includes("usage_forfait_totals")) return { rows: [Object.fromEntries(Object.entries(sommes).map(([k, v]) => [k, String(v)]))] };
      if (texte.includes("FROM public.usage_ledger WHERE generation_run_id")) return { rows: existantes.map((l) => ({ ...l, units: String(l.units), cost_estimate_micros: String(l.cost_estimate_micros) })) };
      return { rows: [] };
    },
    release(erreur) {
      liberations.push(erreur);
    },
  };
  const pool: PoolSql = { connect: async () => client };
  /** Transaction de `withOrg` simulée : contexte d'organisation et d'utilisateur posé, annulée sur une erreur. */
  const transaction =
    (organisation = ORG): TransactionOrganisation =>
    async (fn) => {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [organisation, USER]);
      try {
        const resultat = await fn(client);
        await client.query("COMMIT");
        return resultat;
      } catch (erreur) {
        await client.query("ROLLBACK");
        throw erreur;
      }
    };
  const inserts = () => requetes.filter((r) => r.texte.includes("INSERT INTO public.usage_ledger"));
  return { pool, transaction, requetes, inserts, liberations };
}

/** Transaction de `withOrg` simulée sur un client donné (pannes). */
const transactionSur =
  (client: Pick<ClientSql, "query">): TransactionOrganisation =>
  async (fn) => {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORG]);
    return fn(client);
  };

const regles = (plafonds = PLAFONDS_USAGE_TEST, horloge = horlogeSysteme): ReglesUsage => ({ plafonds, table: TABLE, horloge });
const demandeApercu = { organisationId: ORG, tripId: null, generationRunId: RUN, profil: "apercu" as const };

describe("usage: configuration des plafonds (B7c point 3)", () => {
  it("valeurs de test admises ; aucun montant réel en production (Q39, Q45, Q465)", () => {
    expect(PlafondsUsageSchema.parse(PLAFONDS_USAGE_TEST)).toEqual(PLAFONDS_USAGE_TEST);
    expect(PLAFONDS_USAGE).toBeNull();
  });

  it("valeur absente, inconnue ou hors bornes refusée au chargement", () => {
    const sansPlafondJour = Object.fromEntries(Object.entries(PLAFONDS_USAGE_TEST).filter(([cle]) => cle !== "parOrganisationJourMicros"));
    expect(() => chargerPlafondsUsage(sansPlafondJour)).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, inconnue: 1 })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: -1 })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: 1.5 })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, actionsSansCompteJourMicros: 2_000_000_000 })).toThrow();
    const apercu = { ...PLAFONDS_USAGE_TEST.generations.apercu, routesElements: 3_001 };
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, generations: { ...PLAFONDS_USAGE_TEST.generations, apercu } })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, skus: { ...PLAFONDS_USAGE_TEST.skus, modeles: "Modèles !" } })).toThrow();
  });

  it("SKU hors du préfixe sommé par usage_forfait_totals() refusé (quota du jour : pas d'échec ouvert)", () => {
    // Un SKU renommé hors de son préfixe ferait tomber la somme du jour à 0 sans erreur : refusé au chargement.
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, skus: { ...PLAFONDS_USAGE_TEST.skus, textSearch: "text_search_ids_only" } })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, skus: { ...PLAFONDS_USAGE_TEST.skus, details: "place_details_pro" } })).toThrow();
    expect(() => chargerPlafondsUsage({ ...PLAFONDS_USAGE_TEST, skus: { ...PLAFONDS_USAGE_TEST.skus, matrice: "places_details_pro" } })).toThrow();
    // Chaque SKU de la table de prix porte le préfixe de sa méthode ; la migration filtre sur ces mêmes préfixes.
    const prefixeDe: Record<string, string> = { places_text_search: PREFIXES_SKU_QUOTA.textSearch, places_details: PREFIXES_SKU_QUOTA.details, routes_matrix: PREFIXES_SKU_QUOTA.matrice };
    for (const [nom, sku] of Object.entries(TABLE.skus)) expect(nom.startsWith(prefixeDe[sku.methode] ?? "?"), nom).toBe(true);
    const migration = readFileSync(path.join(RACINE, "db/migrations/0010_usage_forfait.sql"), "utf8");
    expect(migration).toContain(`starts_with(u.sku, '${PREFIXES_SKU_QUOTA.textSearch}')`);
    expect(migration).toContain(`starts_with(u.sku, '${PREFIXES_SKU_QUOTA.details}')`);
  });
});

describe("usage: forfait d'un profil et lignes de usage_ledger (B7-TL-9)", () => {
  it("une ligne par méthode du forfait, step = forfait, valeurs du profil seul", () => {
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    expect(coutTotalMicros(forfait)).toBe(750_000);
    const lignes = lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, "modeles_forfait", forfait);
    expect(lignes).toEqual([
      { step: STEP_FORFAIT, provider: "modeles", sku: "modeles_forfait", units: 0, costEstimateMicros: 50_000 },
      { step: STEP_FORFAIT, provider: "google", sku: "places_text_search_essentials_ids_only", units: 20, costEstimateMicros: 0 },
      { step: STEP_FORFAIT, provider: "google", sku: "places_details_enterprise", units: 10, costEstimateMicros: 200_000 },
      { step: STEP_FORFAIT, provider: "google", sku: "routes_matrix_essentials", units: 100, costEstimateMicros: 500_000 },
    ]);
    // Fonction de la configuration seule : deux appels, mêmes lignes.
    expect(lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, "modeles_forfait", forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu"))).toEqual(lignes);
    // Relecture : Routes seulement, aucune ligne de modèles ; mini : aucune ligne Routes (plafond nul).
    expect(lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, "modeles_forfait", forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "relecture")).map((l) => l.sku)).toEqual([
      "routes_matrix_essentials",
    ]);
    expect(lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, "modeles_forfait", forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "mini")).map((l) => l.sku)).not.toContain(
      "routes_matrix_essentials",
    );
  });

  it("SKU de modèles pris dans la table de prix, ou forfait calculé avec d'autres SKU : erreur", () => {
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    expect(() => lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, "places_details_pro", forfait)).toThrow();
    expect(() => lignesDuForfait(TABLE, { ...PLAFONDS_USAGE_TEST.skus, details: "places_details_pro" }, "modeles_forfait", forfait)).toThrow();
  });

  it("forfait d'une action : nature execution, modèles et Text Search seulement", () => {
    expect(forfaitAction(TABLE, PLAFONDS_USAGE_TEST.skus, { coutModelesMicros: 10, placesTextSearch: 3 })).toEqual({
      nature: "execution",
      textSearchRequetes: 3,
      placeDetailsRequetes: 0,
      routesRequetes: 0,
      routesElements: 0,
      coutGoogleMicros: 0,
      coutModelesMicros: 10,
    });
    expect(forfaitDeLAction(PLAFONDS_USAGE_TEST, TABLE, "structureBrief").textSearchRequetes).toBe(0);
  });

  it("plafond par organisation et par jour, forfait compris", () => {
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    expect(refusParOrganisation(0, forfait, 750_000)).toBeNull();
    expect(refusParOrganisation(1, forfait, 750_000)).toBe("cap_reached");
  });

  it("plafonds des demandes dérivés du forfait : portée execution, une borne par méthode", () => {
    const plafonds = plafondsDuForfait(forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu"));
    expect(plafonds.every((p) => p.portee === "execution")).toBe(true);
    expect(plafonds.map((p) => p.methode)).toEqual(["chat", "places_text_search", "places_details", "routes_matrix"]);
    expect(plafondsDuForfait(forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "relecture")).map((p) => p.methode)).not.toContain("chat");
  });
});

describe("usage: réservation du forfait (séquence de « Consommation et plafonds »)", () => {
  it("transaction de withOrg : contexte de la génération vérifié, verrou global, reprise, sommes, une écriture", async () => {
    const base = baseSimulee();
    const resultat = await reserverForfait(base.transaction(), demandeApercu, regles());
    expect(resultat).toMatchObject({ ok: true, executionId: RUN });
    const textes = base.requetes.map((r) => r.texte);
    expect(textes[0]).toBe("BEGIN");
    // Contexte posé par withOrg (organisation et utilisateur), jamais par le module.
    expect(base.requetes[1]?.valeurs).toEqual([ORG, USER]);
    expect(textes.filter((t) => t.includes("set_config('app.organization_id'"))).toHaveLength(1);
    expect(base.requetes[2]?.valeurs).toEqual([String(DELAI_PORT_MS)]);
    expect(textes[2]).toContain("app_current_org");
    expect(base.requetes[3]?.valeurs).toEqual([CLE_VERROU_USAGE]);
    expect(base.requetes[4]?.valeurs).toEqual([RUN]);
    expect(textes[5]).toContain("usage_forfait_totals");
    expect(base.inserts()).toHaveLength(1);
    expect(base.inserts()[0]?.valeurs.slice(0, 3)).toEqual([ORG, null, RUN]);
    expect(base.inserts()[0]?.valeurs[3]).toEqual(["forfait", "forfait", "forfait", "forfait"]);
    expect(textes.at(-1)).toBe("COMMIT");
  });

  it("usage: plafond atteint, aucun appel", async () => {
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    const limites = PLAFONDS_USAGE_TEST.limites;
    const cas: [string, Sommes, string][] = [
      ["par organisation et par jour", { ...ZERO, org_jour_micros: PLAFONDS_USAGE_TEST.parOrganisationJourMicros - coutTotalMicros(forfait) + 1 }, "cap_reached"],
      ["mois Google", { ...ZERO, mois_google_micros: limites.moisGoogleMicros - forfait.coutGoogleMicros + 1 }, "cap_reached"],
      ["mois des modèles", { ...ZERO, mois_modeles_micros: limites.moisModelesMicros }, "cap_reached"],
      ["enveloppe Google", { ...ZERO, enveloppe_google_micros: limites.enveloppeGoogleMicros }, "envelope_reached"],
      ["enveloppe des modèles", { ...ZERO, enveloppe_modeles_micros: limites.enveloppeModelesMicros }, "envelope_reached"],
      ["quota du jour Google (fiches)", { ...ZERO, jour_place_details: limites.quotaJourParMethode }, "daily_quota_insufficient"],
    ];
    for (const [nom, sommes, code] of cas) {
      const base = baseSimulee(sommes);
      const appels: string[] = [];
      // Composition de B9 : réservation, puis registre et appels seulement si elle réussit.
      const resultat = await reserverForfait(base.transaction(), demandeApercu, regles());
      if (resultat.ok) appels.push("transport");
      expect(resultat, nom).toEqual({ ok: false, code });
      expect(appels, nom).toEqual([]);
      expect(base.inserts(), nom).toEqual([]);
      expect(base.requetes.at(-1)?.texte, nom).toBe("ROLLBACK");
    }
  });

  it("usage: plafond atteint, aucun appel (par génération : le registre borné par le forfait)", async () => {
    const reservation = await reserverForfait(baseSimulee().transaction(), demandeApercu, regles());
    if (!reservation.ok) throw new Error(reservation.code);
    const registre = creerRegistreForfait(reservation.forfait, reservation.executionId, horlogeSysteme);
    const contexte: ContexteAppel = { nature: "execution", executionId: RUN, periodes: { jour: { du: 0, au: 1 }, mois: { du: 0, au: 1 } } };
    let appels = 0;
    const fiche = () =>
      avecReservation(
        { port: registre, horloge: horlogeSysteme },
        demandeDe(contexte, { fournisseur: "google", methode: "places_details", sku: "places_details_enterprise", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: 20_000 }, reservation.plafonds),
        10_000,
        async (_signal, appele) => {
          appele();
          appels += 1;
          return { valeur: true, coutReelMicros: null };
        },
      );
    for (let i = 0; i < PLAFONDS_USAGE_TEST.generations.apercu.placesDetails; i++) expect((await fiche()).ok).toBe(true);
    // Au-delà du plafond de la génération : refus fermé, transport jamais appelé.
    expect(await fiche()).toEqual({ ok: false, code: "cap_reached" });
    expect(appels).toBe(PLAFONDS_USAGE_TEST.generations.apercu.placesDetails);
  });

  it("usage: port muet, appel refusé", async () => {
    // Base qui ne répond pas : usage_unavailable à 2 000 ms exactement (horloge injectée), aucun forfait, aucun appel.
    const horloge = creerHorlogeManuelle();
    const muette: TransactionOrganisation = () => new Promise<never>(() => {});
    let fini = false;
    const promesse = reserverForfait(muette, demandeApercu, regles(PLAFONDS_USAGE_TEST, horloge)).then((r) => {
      fini = true;
      return r;
    });
    await horloge.avancer(DELAI_PORT_MS - 1);
    expect(fini).toBe(false);
    await horloge.avancer(1);
    expect(await promesse).toEqual({ ok: false, code: "usage_unavailable" });
    expect(horloge.enAttente()).toBe(0);
    // Connexion refusée, requête en erreur, sommes illisibles : usage_unavailable (échec fermé).
    expect(await reserverForfait(() => Promise.reject(new Error("x")), demandeApercu, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    let org = "";
    const contexte = (texte: string, valeurs: readonly unknown[] = []) => {
      if (texte.includes("set_config('app.organization_id'")) org = String(valeurs[0]);
      return texte.includes("app_current_org") ? [{ org }] : [];
    };
    const enErreur = transactionSur({
      query: async (texte: string, valeurs?: readonly unknown[]) => {
        if (texte.includes("usage_forfait_totals")) throw new Error("x");
        return { rows: contexte(texte, valeurs) };
      },
    });
    expect(await reserverForfait(enErreur, demandeApercu, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    const illisible = transactionSur({
      query: async (texte: string, valeurs?: readonly unknown[]) => ({
        rows: texte.includes("usage_forfait_totals") ? [{ ...ZERO, org_jour_micros: "abc" }] : contexte(texte, valeurs),
      }),
    });
    expect(await reserverForfait(illisible, demandeApercu, regles())).toEqual({ ok: false, code: "usage_unavailable" });
  });

  it("usage: écritures isolées par organisation (contexte de withOrg d'une autre organisation : refus, rien d'écrit)", async () => {
    const base = baseSimulee();
    const autre = "0b5a1c3e-9999-4999-8999-999999999999";
    expect(await reserverForfait(base.transaction(autre), demandeApercu, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    expect(base.inserts()).toEqual([]);
    expect(base.requetes.some((r) => r.texte.includes("usage_forfait_totals"))).toBe(false);
    expect(base.requetes.at(-1)?.texte).toBe("ROLLBACK");
  });

  it("reprise : même generationRunId réservée deux fois, même forfait, aucune nouvelle ligne (0083 § 4)", async () => {
    const forfait = forfaitDuProfil(PLAFONDS_USAGE_TEST, TABLE, "apercu");
    const deja = lignesDuForfait(TABLE, PLAFONDS_USAGE_TEST.skus, PLAFONDS_USAGE_TEST.skus.modeles, forfait).map((l) => ({
      provider: l.provider,
      sku: l.sku,
      units: l.units,
      cost_estimate_micros: l.costEstimateMicros,
    }));
    // Lignes identiques (ordre quelconque) : réservation rendue telle quelle, sans sommes ni écriture, même plafond atteint.
    const reprise = baseSimulee({ ...ZERO, org_jour_micros: PLAFONDS_USAGE_TEST.parOrganisationJourMicros }, [...deja].reverse());
    expect(await reserverForfait(reprise.transaction(), demandeApercu, regles())).toEqual({ ok: true, forfait, executionId: RUN, plafonds: plafondsDuForfait(forfait) });
    expect(reprise.inserts()).toEqual([]);
    expect(reprise.requetes.some((r) => r.texte.includes("usage_forfait_totals"))).toBe(false);
    expect(reprise.requetes.at(-1)?.texte).toBe("COMMIT");
    // Lignes différentes (autre profil, configuration changée) : échec fermé, rien d'écrit.
    for (const autres of [deja.slice(1), deja.map((l, i) => (i === 0 ? { ...l, cost_estimate_micros: l.cost_estimate_micros + 1 } : l))]) {
      const base = baseSimulee(ZERO, autres);
      expect(await reserverForfait(base.transaction(), demandeApercu, regles())).toEqual({ ok: false, code: "usage_unavailable" });
      expect(base.inserts()).toEqual([]);
    }
  });

  it("demande mal formée : usage_unavailable sans requête", async () => {
    const base = baseSimulee();
    for (const demande of [
      { ...demandeApercu, organisationId: "x" },
      { ...demandeApercu, organisationId: ORGANISATION_ACTIONS_SANS_COMPTE },
      { ...demandeApercu, generationRunId: null },
      { ...demandeApercu, tripId: "x" },
      { ...demandeApercu, profil: "relecture" as const },
      { ...demandeApercu, profil: "inconnu" as never },
    ]) {
      expect(await reserverForfait(base.transaction(), demande, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    }
    expect(base.requetes).toEqual([]);
    // Relecture : sans génération, identifiant d'exécution nul (registre de P0r2), aucune recherche de reprise.
    expect(await reserverForfait(base.transaction(), { ...demandeApercu, generationRunId: null, profil: "relecture" }, regles())).toMatchObject({ ok: true, executionId: null });
    expect(base.requetes.some((r) => r.texte.includes("WHERE generation_run_id"))).toBe(false);
  });
});

describe("usage: actions sans compte (B7-TL-10 ; 0081 B9-TL-4)", () => {
  it("usage: actions sans compte", async () => {
    // Sans organisation : rattachée à l'organisation technique, identifiant d'exécution opaque tiré à chaque appel.
    const base = baseSimulee();
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const r1 = await reserverAction(base.pool, "structureBrief", regles(), () => ids[0] ?? "");
    const r2 = await reserverAction(base.pool, "suggestLodging", regles(), () => ids[1] ?? "");
    expect(r1).toMatchObject({ ok: true, executionId: ids[0] });
    expect(r2).toMatchObject({ ok: true, executionId: ids[1] });
    expect(base.requetes[1]?.valeurs[0]).toBe(ORGANISATION_ACTIONS_SANS_COMPTE);
    expect(base.inserts().map((r) => r.valeurs.slice(0, 3))).toEqual([
      [ORGANISATION_ACTIONS_SANS_COMPTE, null, ids[0]],
      [ORGANISATION_ACTIONS_SANS_COMPTE, null, ids[1]],
    ]);
    // Plafond global quotidien atteint : refus sans appel, rien d'écrit.
    const pleine = baseSimulee({ ...ZERO, org_jour_micros: PLAFONDS_USAGE_TEST.actionsSansCompteJourMicros });
    let appels = 0;
    const resultat = await reserverAction(pleine.pool, "structureBrief", regles());
    if (resultat.ok) appels += 1;
    expect(resultat).toEqual({ ok: false, code: "cap_reached" });
    expect(appels).toBe(0);
    expect(pleine.inserts()).toEqual([]);
    // Le registre de P0r2, repris tel quel, accepte l'appel de modèle de l'action (nature execution).
    if (!r1.ok) return;
    const registre = creerRegistreForfait(r1.forfait, r1.executionId, horlogeSysteme);
    const contexte: ContexteAppel = { nature: "execution", executionId: r1.executionId, periodes: { jour: { du: 0, au: 1 }, mois: { du: 0, au: 1 } } };
    const demande = demandeDe(contexte, { fournisseur: "modeles", methode: "chat", sku: "m", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: 10_000 }, r1.plafonds);
    expect((await registre.reserve(demande)).ok).toBe(true);
    expect(await registre.reserve(demande)).toEqual({ ok: false, code: "cap_reached" });
  });

  it("pool brut : connexion en erreur rendue avec l'erreur, connexion saine après un refus", async () => {
    const pleine = baseSimulee({ ...ZERO, org_jour_micros: PLAFONDS_USAGE_TEST.actionsSansCompteJourMicros });
    expect(await reserverAction(pleine.pool, "structureBrief", regles())).toEqual({ ok: false, code: "cap_reached" });
    expect(pleine.liberations).toEqual([undefined]);
    const liberations: unknown[] = [];
    const enErreur: PoolSql = {
      connect: async () => ({
        query: async (texte: string) => {
          if (texte.includes("pg_advisory_xact_lock")) throw new Error("connexion perdue");
          return { rows: texte.includes("app_current_org") ? [{ org: ORGANISATION_ACTIONS_SANS_COMPTE }] : [] };
        },
        release: (erreur?: Error | boolean) => void liberations.push(erreur),
      }),
    };
    expect(await reserverAction(enErreur, "structureBrief", regles())).toEqual({ ok: false, code: "usage_unavailable" });
    expect(liberations).toHaveLength(1);
    expect(liberations[0]).toBeInstanceOf(Error);
  });

  it("identifiant d'exécution illisible ou action inconnue : usage_unavailable", async () => {
    const base = baseSimulee();
    expect(await reserverAction(base.pool, "structureBrief", regles(), () => "x")).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await reserverAction(base.pool, "autre" as never, regles())).toEqual({ ok: false, code: "usage_unavailable" });
    expect(base.requetes).toEqual([]);
  });

  it("uuid de l'organisation égal à celui de la migration 0010", () => {
    const migration = readFileSync(path.join(RACINE, "db/migrations/0010_usage_forfait.sql"), "utf8");
    expect(migration).toContain(`'${ORGANISATION_ACTIONS_SANS_COMPTE}'`);
  });
});
