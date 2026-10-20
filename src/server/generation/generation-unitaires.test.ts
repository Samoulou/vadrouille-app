import { describe, expect, it } from "vitest";

import { PARTS_FORFAIT, RANG_ETAPE, ETAPES_APERCU, MAX_RETRIES_ETAPE } from "@/server/config/generation";

import { evaluerBarriere } from "./barriere";
import { ArretEtape, codeDeErreur, codeFerme } from "./codes";
import { EtatEtapeSchema, lireEtat } from "./etat";
import { partDe } from "./forfait-etape";
import { CODES_ARRET } from "./raison-echec";

const ID = "9292b925-a665-4b43-88c2-963c1cd0ecd8";

describe("génération: codes fermés", () => {
  it("un code connu passe, tout le reste devient upstream_error", () => {
    expect(codeFerme("cap_reached")).toBe("cap_reached");
    expect(codeFerme("Rue de Rivoli, 75001 Paris")).toBe("upstream_error");
    expect(codeFerme(42)).toBe("upstream_error");
    expect(new ArretEtape("n'importe quoi").message).toBe("upstream_error");
    expect(codeDeErreur(new Error("test_place_fuite"))).toBe("upstream_error");
    expect(codeDeErreur(Object.assign(new Error("x"), { code: "quota_reached" }))).toBe(codeFerme("quota_reached"));
    expect(CODES_ARRET).toContain("step_expired");
  });
});

describe("génération: état sérialisé", () => {
  it("quatre champs, rien d'autre", () => {
    const etat = { generationRunId: ID, organizationId: ID, rang: 0 };
    expect(lireEtat(etat)).toEqual(etat);
    expect(EtatEtapeSchema.safeParse({ ...etat, placeId: "x" }).success).toBe(false);
    expect(EtatEtapeSchema.safeParse({ ...etat, arret: "message libre" }).success).toBe(false);
    expect(EtatEtapeSchema.safeParse({ ...etat, rang: 7 }).success).toBe(false);
    expect(Object.keys(EtatEtapeSchema.shape).sort()).toEqual(["arret", "generationRunId", "organizationId", "rang"]);
  });
});

describe("génération: parts du forfait", () => {
  it("les parts de chaque ressource somment au total, le dernier consommateur reçoit le reste", () => {
    for (const total of [0, 1, 7, 10, 90, 840, 5_000_000]) {
      for (const parts of Object.values(PARTS_FORFAIT)) {
        const etapes = Object.keys(parts) as (keyof typeof RANG_ETAPE)[];
        const somme = etapes.reduce((s, e) => s + partDe(total, parts as never, e), 0);
        expect(somme).toBe(total);
      }
    }
  });

  it("une étape sans part n'a rien", () => {
    expect(partDe(100, PARTS_FORFAIT.routes, "b")).toBe(0);
  });
});

describe("génération: étapes et nouvel essai", () => {
  it("six étapes dans l'ordre, maxRetries 2 pour a et 0 pour les autres", () => {
    expect(ETAPES_APERCU).toEqual(["a", "l", "b", "c", "d", "e"]);
    expect(ETAPES_APERCU.map((e) => RANG_ETAPE[e])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MAX_RETRIES_ETAPE.a).toBe(2);
    for (const e of ETAPES_APERCU.filter((x) => x !== "a")) expect(MAX_RETRIES_ETAPE[e]).toBe(0);
  });
});

describe("génération: barrière des appels réels (B9-TL-8)", () => {
  const reelle = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/x", GENERATION_APPELS_REELS: "1" };
  it("sans déclaration, en production ou sur une valeur inconnue : production", async () => {
    expect(await evaluerBarriere({ env: {}, plafondsNonNuls: true })).toBe("production");
    expect(await evaluerBarriere({ env: { VERCEL_ENV: "production" }, plafondsNonNuls: true })).toBe("production");
    expect(await evaluerBarriere({ env: { VADROUILLE_ENV: "ci", VERCEL_ENV: "production" }, plafondsNonNuls: true })).toBe("production");
    expect(await evaluerBarriere({ env: { VADROUILLE_ENV: "quelque-chose" }, plafondsNonNuls: true })).toBe("production");
  });
  it("local et CI : simulée", async () => {
    expect(await evaluerBarriere({ env: { VADROUILLE_ENV: "ci", ...reelle, VERCEL_ENV: "development" }, branche: "claude/x", plafondsNonNuls: true })).toBe("simulee");
    expect(await evaluerBarriere({ env: { VADROUILLE_ENV: "local" }, plafondsNonNuls: true })).toBe("simulee");
  });
  it("réelle seulement si toutes les conditions tiennent, cookie compris (fermé par défaut)", async () => {
    const base = { env: reelle, branche: "claude/x", plafondsNonNuls: true, cookieValide: async () => true };
    expect(await evaluerBarriere(base)).toBe("reelle");
    expect(await evaluerBarriere({ env: reelle, branche: "claude/x", plafondsNonNuls: true })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, cookieValide: async () => { throw new Error("x"); } })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, branche: null })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, branche: "claude/autre" })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, env: { ...reelle, GENERATION_APPELS_REELS: "0" } })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, plafondsNonNuls: false })).toBe("simulee");
    // Par défaut aucune branche n'est autorisée : jamais d'appel réel sans décision de Samuel.
    expect(await evaluerBarriere({ env: reelle, plafondsNonNuls: true, cookieValide: async () => true })).toBe("simulee");
  });
});
