// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import type { RateLimitVerdict } from "@/server/rate-limit";
import { ACTION_LIMITE_LIEN, borneDeFin, creerCasLiens, type DependancesLiens, SQL_DESACTIVER, SQL_INSERER, SQL_LIEN_ACTIF, SQL_VOYAGE_VERROU } from "@/server/partage/liens";

import { fausseTransaction, type RequeteNotee } from "./fausse-base";

// `executeurSql` doublé par l'identité : la transaction simulée est l'exécuteur (aucune base, aucun Drizzle).
vi.mock("@/server/with-org", () => ({
  executeurSql: (tx: unknown) => tx,
  withOrg: () => {
    throw new Error("withOrg non injecté");
  },
}));

/**
 * Cas d'usage du lien privé sur `api` (ticket 1013, M6a ; spécification M6 § 3.2 ; décision 0157 § 1.2, § 1.3 et § 1.9 ;
 * décision 0158 § 3 points 6 et 7), sur une transaction simulée : propriétaire, déblocage, fin et borne, limite
 * `partage-lien`, colonnes de l'insertion, rejeu sur `23505`. Le comportement en base (droits, déclencheur, vues) est
 * éprouvé par `tests/db/partage-api.test.ts`.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const MOI = "22222222-2222-4222-8222-222222222222";
const AUTRE = "33333333-3333-4333-8333-333333333333";
const VOYAGE = "44444444-4444-4444-8444-444444444444";
const JETON = "A".repeat(43);
const CTX = { organizationId: ORG, userId: MOI } as AdapterContext;
const CREE_MS = Date.parse("2026-11-01T09:00:00.000Z");

type Etat = {
  createdBy?: string;
  fin?: string;
  timeZone?: string;
  debloque?: boolean;
  lien?: Record<string, unknown> | undefined;
  /** Nombre d'insertions qui échouent en `23505` avant de réussir. */
  conflits?: number;
  /** L'insertion ne rend aucune ligne (fin hors des bornes de la base). */
  horsBornes?: boolean;
  /** Toute requête dont le texte commence ainsi échoue comme une erreur de Drizzle (texte et paramètres dans le message). */
  panne?: string;
};

/** Erreur de base à la façon de Drizzle (`DrizzleQueryError`) : texte, paramètres en clair, et cause de `pg`. */
function erreurDeBase(requete: RequeteNotee): Error {
  const parametres = requete.valeurs.map((v) => (Buffer.isBuffer(v) ? v.toString("hex") : String(v))).join(",");
  return Object.assign(new Error(`Failed query: ${requete.texte}\nparams: ${parametres}`), {
    cause: Object.assign(new Error("deadlock detected"), { code: "40P01", detail: parametres, parameters: requete.valeurs }),
  });
}

function monter(etat: Etat = {}, verdict: RateLimitVerdict | Error = { ok: true }) {
  const { createdBy = MOI, fin = "2026-11-10", timeZone = "Europe/Paris", debloque = true, lien } = etat;
  let conflits = etat.conflits ?? 0;
  const { tx, requetes } = fausseTransaction((requete: RequeteNotee) => {
    if (etat.panne !== undefined && requete.texte.startsWith(etat.panne)) throw erreurDeBase(requete);
    if (requete.texte.includes("FROM public.trips t WHERE t.organization_id = $1 AND t.id = $2") && requete.texte.startsWith("SELECT t.created_by")) {
      return [{ created_by: createdBy, fin, time_zone: timeZone, debloque }];
    }
    if (requete.texte.startsWith("INSERT INTO public.share_links")) {
      if (conflits > 0) {
        conflits -= 1;
        throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
      }
      return etat.horsBornes ? [] : [{ cree_ms: CREE_MS }];
    }
    if (requete.texte === SQL_LIEN_ACTIF) return lien === undefined ? [] : [lien];
    return [];
  });
  const withOrg = vi.fn();
  const fauxWithOrg = (async (ctx, fn) => {
    withOrg(ctx);
    return fn(tx);
  }) as NonNullable<DependancesLiens["withOrg"]>;
  const limiteur = vi.fn(async (): Promise<RateLimitVerdict> => {
    if (verdict instanceof Error) throw verdict;
    return verdict;
  });
  const entetes = { get: () => null };
  const cas = creerCasLiens({ withOrg: fauxWithOrg, limiteur, entetes: async () => entetes, jeton: () => JETON, accessDaysAfterReturn: 30 });
  return { cas, requetes, limiteur, withOrg, entetes };
}

const textes = (requetes: RequeteNotee[]) => requetes.map((r) => r.texte);
const attendus = (...sql: string[]) => sql;
const ecritures = (requetes: RequeteNotee[]) => requetes.filter((r) => /^(INSERT|UPDATE)/.test(r.texte));
const midi = (jour: string) => Date.parse(`${jour}T12:00:00Z`);

describe("création du lien (0157 § 1.2 et § 1.3)", () => {
  it("voyage débloqué de la personne : désactive l'ancien lien puis insère les cinq colonnes admises", async () => {
    const { cas, requetes, limiteur, entetes } = monter();
    const r = await cas.creer(CTX, VOYAGE, midi("2026-11-01"));
    expect(r).toEqual({ ok: true, value: { token: JETON, createdAt: "2026-11-01T09:00:00.000Z", expiresOn: "2026-12-10" } });
    expect(textes(requetes)).toEqual(attendus(SQL_VOYAGE_VERROU, "SAVEPOINT partage_lien", SQL_DESACTIVER, SQL_INSERER));
    const insertion = requetes[3];
    expect(insertion?.texte).toMatch(/^INSERT INTO public\.share_links \(organization_id, trip_id, token_hash, created_by, expires_at\)/);
    // Liste des colonnes : exactement les cinq admises (une requête qui cite `id`, `created_at` ou `revoked_at` est refusée).
    const colonnes = /^INSERT INTO public\.share_links \(([^)]*)\)/.exec(insertion?.texte ?? "")?.[1]?.split(",").map((c) => c.trim());
    expect(colonnes).toEqual(["organization_id", "trip_id", "token_hash", "created_by", "expires_at"]);
    // Empreinte SHA-256 du jeton, jamais le jeton en clair.
    const [org, voyage, empreinte, personne, fin] = insertion?.valeurs ?? [];
    expect([org, voyage, personne, fin]).toEqual([ORG, VOYAGE, MOI, "2026-12-10"]);
    expect(Buffer.isBuffer(empreinte) && empreinte.equals(createHash("sha256").update(JETON).digest())).toBe(true);
    expect(JSON.stringify(requetes)).not.toContain(JETON);
    expect(limiteur).toHaveBeenCalledWith({ action: ACTION_LIMITE_LIEN, headers: entetes, tripId: VOYAGE });
  });

  it("la désactivation n'écrit que revoked_at, et expires_at n'est jamais réécrit", () => {
    expect(SQL_DESACTIVER).toMatch(/^UPDATE public\.share_links SET revoked_at = now\(\)\s+WHERE/);
    for (const sql of [SQL_DESACTIVER, SQL_INSERER]) expect(sql).not.toMatch(/SET[^;]*expires_at/);
  });

  it.each([
    ["autre personne de l'organisation", { createdBy: AUTRE }],
    ["voyage verrouillé ou reverrouillé (0158 § 3 point 7)", { debloque: false }],
    ["fin du partage passée", { fin: "2026-09-01" }],
  ])("%s : not_found, ni limiteur ni écriture", async (_cas, etat) => {
    const { cas, requetes, limiteur } = monter(etat);
    expect(await cas.creer(CTX, VOYAGE, midi("2026-11-01"))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(limiteur).not.toHaveBeenCalled();
    expect(ecritures(requetes)).toEqual([]);
  });

  it("identifiant qui n'est pas un uuid : not_found sans transaction", async () => {
    const { cas, withOrg } = monter();
    expect(await cas.creer(CTX, "edimbourg", midi("2026-11-01"))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(withOrg).not.toHaveBeenCalled();
  });

  it("fin au dernier jour, à l'heure de la destination : admise jusqu'à 23 h 59 locale, refusée ensuite", async () => {
    // Fin du partage : 2026-11-10 + 30 jours = 2026-12-10, à Paris (UTC+1 en décembre).
    const dernier = Date.parse("2026-12-10T22:59:00Z");
    const lendemain = Date.parse("2026-12-10T23:00:00Z");
    expect((await monter().cas.creer(CTX, VOYAGE, dernier)).ok).toBe(true);
    expect(await monter().cas.creer(CTX, VOYAGE, lendemain)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("borne de 3 ans moins 2 jours (0157 § 1.9) : au-delà, not_found avant toute écriture", async () => {
    const aujourdhui = "2026-11-01";
    const borne = borneDeFin(aujourdhui);
    expect(borne).toBe("2029-10-30");
    // Dernier jour du voyage tel que la fin du partage tombe sur la borne, puis un jour plus loin.
    const surLaBorne = monter({ fin: "2029-09-30" });
    expect((await surLaBorne.cas.creer(CTX, VOYAGE, midi(aujourdhui))).ok).toBe(true);
    const auDela = monter({ fin: "2029-10-01" });
    expect(await auDela.cas.creer(CTX, VOYAGE, midi(aujourdhui))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(ecritures(auDela.requetes)).toEqual([]);
  });

  it("borneDeFin : un 29 février passe au calendrier UTC sans fuseau", () => {
    expect(borneDeFin("2028-02-29")).toBe("2031-02-27");
    expect(borneDeFin("2026-01-01")).toBe("2028-12-30");
  });

  it("limite partage-lien refusée : rate_limited, rien n'est écrit", async () => {
    const { cas, requetes } = monter({}, { ok: false });
    expect(await cas.creer(CTX, VOYAGE, midi("2026-11-01"))).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(ecritures(requetes)).toEqual([]);
  });

  it("panne du limiteur à la création : l'erreur remonte (fermé), rien n'est écrit", async () => {
    const { cas, requetes } = monter({}, new Error("panne"));
    await expect(cas.creer(CTX, VOYAGE, midi("2026-11-01"))).rejects.toThrow("partage : création impossible");
    expect(ecritures(requetes)).toEqual([]);
  });

  it("23505 malgré le verrou : rejoué une fois depuis le point de sauvegarde", async () => {
    const { cas, requetes } = monter({ conflits: 1 });
    expect((await cas.creer(CTX, VOYAGE, midi("2026-11-01"))).ok).toBe(true);
    expect(textes(requetes)).toEqual(
      attendus(SQL_VOYAGE_VERROU, "SAVEPOINT partage_lien", SQL_DESACTIVER, SQL_INSERER, "ROLLBACK TO SAVEPOINT partage_lien", SQL_DESACTIVER, SQL_INSERER),
    );
  });

  it("fin hors des bornes de la base (horloge de la portée décalée) : not_found, désactivation annulée", async () => {
    const { cas, requetes } = monter({ horsBornes: true });
    expect(await cas.creer(CTX, VOYAGE, midi("2026-11-01"))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(textes(requetes).at(-1)).toBe("ROLLBACK TO SAVEPOINT partage_lien");
    expect(SQL_INSERER).toMatch(/f\.expires_at > now\(\) AND f\.expires_at <= now\(\) \+ interval '3 years'/);
  });

  it("23505 deux fois : internal", async () => {
    const { cas } = monter({ conflits: 2 });
    expect(await cas.creer(CTX, VOYAGE, midi("2026-11-01"))).toEqual({ ok: false, error: { code: "internal" } });
  });
});

describe("désactivation (0157 § 1.2 ; 0158 § 3 point 6)", () => {
  it("toujours possible pour la personne, même voyage reverrouillé ou partage fini : n'écrit que revoked_at", async () => {
    for (const etat of [{}, { debloque: false }, { fin: "2020-01-01" }]) {
      const { cas, requetes } = monter(etat);
      expect(await cas.desactiver(CTX, VOYAGE)).toEqual({ ok: true, value: { active: false } });
      expect(textes(ecritures(requetes))).toEqual(attendus(SQL_DESACTIVER));
    }
  });

  it("comptée, jamais refusée : verdict négatif ou panne du limiteur ignorés", async () => {
    for (const verdict of [{ ok: false } as RateLimitVerdict, new Error("panne")]) {
      const { cas, requetes, limiteur } = monter({}, verdict);
      expect(await cas.desactiver(CTX, VOYAGE)).toEqual({ ok: true, value: { active: false } });
      expect(limiteur).toHaveBeenCalledTimes(1);
      expect(ecritures(requetes)).toHaveLength(1);
    }
  });

  it("autre personne : not_found, rien n'est écrit ni compté", async () => {
    const { cas, requetes, limiteur } = monter({ createdBy: AUTRE });
    expect(await cas.desactiver(CTX, VOYAGE)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(ecritures(requetes)).toEqual([]);
    expect(limiteur).not.toHaveBeenCalled();
  });
});

describe("état (0157 § 1.3 points 2 et 4)", () => {
  const lien = (fin_stockee: string, en_cours = true) => ({ cree_ms: CREE_MS, fin_stockee, en_cours });

  it("lien en cours : date de fin rendue telle quelle, la plus proche des deux règles", async () => {
    const { cas, requetes, limiteur } = monter({ lien: lien("2026-12-10") });
    expect(await cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toEqual({
      ok: true,
      value: { active: true, createdAt: "2026-11-01T09:00:00.000Z", expiresOn: "2026-12-10" },
    });
    expect(requetes[0]?.texte).toBe("SET TRANSACTION READ ONLY");
    expect(ecritures(requetes)).toEqual([]);
    expect(limiteur).not.toHaveBeenCalled();
    // Voyage raccourci après la création : la fin recalculée, plus proche, l'emporte.
    const raccourci = monter({ fin: "2026-11-05", lien: lien("2026-12-10") });
    expect(await raccourci.cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toMatchObject({ ok: true, value: { expiresOn: "2026-12-05" } });
    // Voyage allongé : la borne stockée l'emporte, jamais réécrite.
    const allonge = monter({ fin: "2027-01-10", lien: lien("2026-12-10") });
    expect(await allonge.cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toMatchObject({ ok: true, value: { expiresOn: "2026-12-10" } });
  });

  it("aucun lien, lien expiré en base ou fin recalculée passée : { active: false }", async () => {
    expect(await monter().cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toEqual({ ok: true, value: { active: false } });
    expect(await monter({ lien: lien("2026-12-10", false) }).cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toEqual({ ok: true, value: { active: false } });
    expect(await monter({ fin: "2026-09-01", lien: lien("2026-12-10") }).cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toEqual({ ok: true, value: { active: false } });
  });

  it("voyage reverrouillé ou d'une autre personne : not_found (0158 § 3 point 7)", async () => {
    for (const etat of [{ debloque: false, lien: lien("2026-12-10") }, { createdBy: AUTRE, lien: lien("2026-12-10") }]) {
      expect(await monter(etat).cas.etat(CTX, VOYAGE, midi("2026-11-02"))).toEqual({ ok: false, error: { code: "not_found" } });
    }
  });
});

describe("erreurs de la base sans détail (spécification M6, critère 16 ; revue du ticket 1013, point 4)", () => {
  const EMPREINTE = createHash("sha256").update(JETON).digest("hex");

  /** Tout ce qu'une page d'erreur, un journal ou un rapport pourrait sérialiser de l'erreur propagée. */
  function texteDe(erreur: unknown): string {
    const e = erreur as Error & { cause?: unknown };
    return [String(e), e.message, e.stack ?? "", JSON.stringify(e), JSON.stringify(e.cause ?? null), String(e.cause ?? "")].join("\n");
  }

  it.each([
    ["création, à l'insertion (empreinte en paramètre)", "INSERT INTO public.share_links", (cas: ReturnType<typeof monter>["cas"]) => cas.creer(CTX, VOYAGE, midi("2026-11-01")), "partage : création impossible"],
    ["désactivation", "UPDATE public.share_links", (cas: ReturnType<typeof monter>["cas"]) => cas.desactiver(CTX, VOYAGE), "partage : désactivation impossible"],
    ["état", "SET TRANSACTION READ ONLY", (cas: ReturnType<typeof monter>["cas"]) => cas.etat(CTX, VOYAGE, midi("2026-11-02")), "partage : état impossible"],
  ])("%s : message fixe, sans cause, ni jeton, ni empreinte, ni identifiants", async (_cas, panne, appel, message) => {
    const { cas, requetes } = monter({ panne });
    const erreur = await appel(cas).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toBe(message);
    expect((erreur as { cause?: unknown }).cause).toBeUndefined();
    // La requête en panne a bien reçu des paramètres sensibles (sinon le test ne prouverait rien).
    const fautive = requetes.find((r) => r.texte.startsWith(panne));
    expect(fautive).toBeDefined();
    const texte = texteDe(erreur);
    for (const interdit of [JETON, EMPREINTE, ORG, VOYAGE, MOI, "Failed query", "params"]) expect(texte, interdit).not.toContain(interdit);
  });

  it("l'erreur de la base simulée porte bien l'empreinte : sans l'enveloppe, elle fuirait", () => {
    const brute = erreurDeBase({ texte: "INSERT INTO public.share_links", valeurs: [ORG, VOYAGE, createHash("sha256").update(JETON).digest()] });
    expect(texteDe(brute)).toContain(EMPREINTE);
  });
});
