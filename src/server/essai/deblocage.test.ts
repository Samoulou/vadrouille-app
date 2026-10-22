// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Pot de cookies et garde du mode réel simulés pour `lire` / `retenir` (aucun code réel, aucun réseau). */
const pot = vi.hoisted(() => ({
  valeurs: new Map<string, string>(),
  ecrits: [] as { nom: string; valeur: string; options: unknown }[],
  ouverte: true,
  appelsOuverture: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (pot.valeurs.has(nom) ? { name: nom, value: pot.valeurs.get(nom) } : undefined),
    set: (nom: string, valeur: string, options: unknown) => {
      pot.ecrits.push({ nom, valeur, options });
      pot.valeurs.set(nom, valeur);
    },
  }),
}));

vi.mock("@/server/p0/acces", () => ({
  ouvertureP0: () => {
    pot.appelsOuverture += 1;
    return pot.ouverte
      ? { ok: true, attendu: Buffer.from("code-d-acces-de-test", "utf8") }
      : { ok: false, code: "missing" };
  },
}));

import {
  cleDeblocage,
  deblocagesEssaiParCookie,
  DUREE_COOKIE_DEBLOCAGE_S,
  MAX_VOYAGES,
  NOM_COOKIE_DEBLOCAGE,
  OPTIONS_COOKIE_DEBLOCAGE,
  oublierCleDeblocage,
  valeurCookieDeblocage,
  voyagesDuCookie,
} from "./deblocage";

/** Cookie de déblocage de l'essai (décision 0124 § 2) : signature, échéance, refus, bornes, lecture et écriture. */

const cle = cleDeblocage(Buffer.from("code-d-acces-de-test", "utf8"));
const org = "org_prototype";
const T = Date.UTC(2027, 4, 10, 8, 0, 0);
const JOUR_MS = 24 * 3600 * 1000;

describe("essai: cookie signé du déblocage simulé", () => {
  it("aller-retour : voyages dédoublonnés et triés, échéance à 30 jours, attributs du cookie", () => {
    const valeur = valeurCookieDeblocage(cle, org, ["proto_b_1", "proto_a_1", "proto_b_1"], T);
    const echeance = Math.floor(T / 1000) + DUREE_COOKIE_DEBLOCAGE_S;
    expect(valeur).toMatch(new RegExp(`^v1\\.${echeance}\\.proto_a_1,proto_b_1\\.[0-9a-f]{64}$`));
    expect([...voyagesDuCookie(valeur, cle, org, T)]).toEqual(["proto_a_1", "proto_b_1"]);
    expect(NOM_COOKIE_DEBLOCAGE).toBe("__Host-p0_debloque");
    expect(OPTIONS_COOKIE_DEBLOCAGE).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: DUREE_COOKIE_DEBLOCAGE_S,
    });
  });

  it("échéance : valable jusqu'à 30 jours, refusée ensuite, refusée si repoussée à la main", () => {
    const valeur = valeurCookieDeblocage(cle, org, ["proto_a_1"], T);
    expect(voyagesDuCookie(valeur, cle, org, T + 29 * JOUR_MS).size).toBe(1);
    expect(voyagesDuCookie(valeur, cle, org, T + 30 * JOUR_MS).size).toBe(0);
    // Échéance trop lointaine (horloge reculée ou cookie fabriqué avec la clé) : refusée.
    expect(voyagesDuCookie(valeur, cle, org, T - 2 * JOUR_MS).size).toBe(0);
    const repoussee = valeur.replace(/^v1\.(\d{10})\./, (_, e: string) => `v1.${Number(e) + 86_400}.`);
    expect(voyagesDuCookie(repoussee, cle, org, T + 30 * JOUR_MS).size).toBe(0);
  });

  it("refus : autre clé (rotation du code), autre organisation, voyage ajouté à la main, forme inconnue", () => {
    const valeur = valeurCookieDeblocage(cle, org, ["proto_a_1"], T);
    expect(voyagesDuCookie(valeur, cleDeblocage(Buffer.from("autre-code", "utf8")), org, T).size).toBe(0);
    expect(voyagesDuCookie(valeur, cle, "org_autre", T).size).toBe(0);
    expect(voyagesDuCookie(valeur.replace("proto_a_1", "proto_a_1,proto_z_1"), cle, org, T).size).toBe(0);
    for (const brut of [undefined, 42, "", "v1.proto_a_1." + "0".repeat(64), "v1.1.proto a.0", valeur + "x"]) {
      expect(voyagesDuCookie(brut, cle, org, T).size).toBe(0);
    }
  });

  it(`au plus ${MAX_VOYAGES} voyages : le dernier donné est toujours gardé`, () => {
    const ids = Array.from({ length: MAX_VOYAGES + 3 }, (_, i) => `proto_${String(i).padStart(2, "0")}_1`);
    const gardes = voyagesDuCookie(valeurCookieDeblocage(cle, org, [...ids.slice(1), "proto_00_1"], T), cle, org, T);
    expect(gardes.size).toBe(MAX_VOYAGES);
    expect(gardes.has("proto_00_1")).toBe(true);
  });
});

describe("essai: lire / retenir (cookies de la requête, garde du mode réel)", () => {
  const ctx = { organizationId: org } as Parameters<typeof deblocagesEssaiParCookie.lire>[0];

  beforeEach(() => {
    pot.valeurs.clear();
    pot.ecrits.length = 0;
    pot.ouverte = true;
    pot.appelsOuverture = 0;
    oublierCleDeblocage();
  });
  afterEach(() => oublierCleDeblocage());

  it("garde ouverte : retenir pose le cookie (attributs exacts), lire le relit, la clé est mémorisée", async () => {
    expect((await deblocagesEssaiParCookie.lire(ctx)).size).toBe(0);
    await deblocagesEssaiParCookie.retenir(ctx, "proto_b_1");
    await deblocagesEssaiParCookie.retenir(ctx, "proto_a_1");
    await deblocagesEssaiParCookie.retenir(ctx, "proto_a_1");
    expect(pot.ecrits).toHaveLength(3);
    for (const e of pot.ecrits) {
      expect(e.nom).toBe(NOM_COOKIE_DEBLOCAGE);
      expect(e.options).toEqual(OPTIONS_COOKIE_DEBLOCAGE);
    }
    expect([...(await deblocagesEssaiParCookie.lire(ctx))]).toEqual(["proto_a_1", "proto_b_1"]);
    expect(pot.appelsOuverture).toBe(1);
  });

  it("lié à l'organisation : le cookie d'une organisation ne débloque rien pour une autre", async () => {
    await deblocagesEssaiParCookie.retenir(ctx, "proto_a_1");
    const autre = { organizationId: "org_autre" } as typeof ctx;
    expect((await deblocagesEssaiParCookie.lire(autre)).size).toBe(0);
    // Écrire pour l'autre organisation repart d'un ensemble vide (le cookie reçu ne vérifie pas).
    await deblocagesEssaiParCookie.retenir(autre, "proto_z_1");
    expect([...(await deblocagesEssaiParCookie.lire(autre))]).toEqual(["proto_z_1"]);
    expect((await deblocagesEssaiParCookie.lire(ctx)).size).toBe(0);
  });

  it("garde fermée : rien n'est lu ni écrit, même avec un cookie valide présent", async () => {
    pot.valeurs.set(NOM_COOKIE_DEBLOCAGE, valeurCookieDeblocage(cle, org, ["proto_a_1"], Date.now()));
    pot.ouverte = false;
    expect((await deblocagesEssaiParCookie.lire(ctx)).size).toBe(0);
    await deblocagesEssaiParCookie.retenir(ctx, "proto_b_1");
    expect(pot.ecrits).toHaveLength(0);
  });

  it("identifiant hors forme : rien n'est écrit", async () => {
    await deblocagesEssaiParCookie.retenir(ctx, "../proto a");
    expect(pot.ecrits).toHaveLength(0);
  });
});
