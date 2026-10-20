import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import { TripSnapshotSchema, type DaySnapshot, type TripSnapshot } from "@/contracts";
import type { EntreeMoteur } from "@/domain/entrees";
import { BRANCHE_APPELS_REELS, ECRITURE_POSITIONS_AUTORISEE, ECRITURE_PROGRAMMES_REELS_AUTORISEE, PARTS_FORFAIT, RANG_ETAPE, ETAPES_APERCU, MAX_RETRIES_ETAPE } from "@/server/config/generation";
import { PLAFONDS_USAGE } from "@/server/config/usage";

import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { ecriturePositionsPermise, evaluerBarriere, plafondsDeGenerationPoses } from "./barriere";
import { resoudre } from "./dependances";
import { genererSansEchec } from "./programme";
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

describe("génération: barrière, préversion et déclaration du dépôt (B9-TL-8 point 1)", () => {
  const conditions = { VERCEL_GIT_COMMIT_REF: "claude/x", GENERATION_APPELS_REELS: "1" };
  const base = { branche: "claude/x", plafondsNonNuls: true, cookieValide: async () => true };

  it("préversion Vercel seule, ou déclarée `preview` par le dépôt : réelle quand toutes les conditions tiennent", async () => {
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VERCEL_ENV: "preview" } })).toBe("reelle");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VERCEL_ENV: "preview", VADROUILLE_ENV: "preview" } })).toBe("reelle");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VERCEL_ENV: "preview", VADROUILLE_ENV: " Preview " } })).toBe("reelle");
  });

  it.each(["ci", "local", "development", "test", "staging"])("VERCEL_ENV=preview avec VADROUILLE_ENV=%s : jamais réelle, même avec toutes les autres conditions", async (declaration) => {
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VERCEL_ENV: "preview", VADROUILLE_ENV: declaration } })).toBe("simulee");
  });

  it("VADROUILLE_ENV=preview sans préversion Vercel : jamais réelle ; production d'un côté ou valeur inconnue : production", async () => {
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VADROUILLE_ENV: "preview" } })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VADROUILLE_ENV: "preview", VERCEL_ENV: "development" } })).toBe("simulee");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VADROUILLE_ENV: "production", VERCEL_ENV: "preview" } })).toBe("production");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VADROUILLE_ENV: "preview", VERCEL_ENV: "production" } })).toBe("production");
    expect(await evaluerBarriere({ ...base, env: { ...conditions, VADROUILLE_ENV: "preview", VERCEL_ENV: "inconnue" } })).toBe("production");
  });
});

describe("génération: plafonds posés et non nuls (B9-PO-10)", () => {
  it("absents (production), ou nuls : la barrière reste simulée", async () => {
    expect(PLAFONDS_USAGE).toBeNull();
    expect(plafondsDeGenerationPoses(null)).toBe(false);
    expect(plafondsDeGenerationPoses(PLAFONDS_USAGE_TEST)).toBe(true);
    const apercu = PLAFONDS_USAGE_TEST.generations.apercu;
    for (const nul of [{ placesDetails: 0 }, { placesTextSearch: 0 }, { routesRequetes: 0 }, { routesElements: 0 }]) {
      expect(plafondsDeGenerationPoses({ ...PLAFONDS_USAGE_TEST, generations: { ...PLAFONDS_USAGE_TEST.generations, apercu: { ...apercu, ...nul } } })).toBe(false);
    }
    expect(plafondsDeGenerationPoses({ ...PLAFONDS_USAGE_TEST, parOrganisationJourMicros: 0 })).toBe(false);
    const reelle = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/x", GENERATION_APPELS_REELS: "1" };
    const nuls = { ...PLAFONDS_USAGE_TEST, generations: { ...PLAFONDS_USAGE_TEST.generations, apercu: { ...apercu, placesDetails: 0 } } };
    const dep = (plafonds: typeof PLAFONDS_USAGE_TEST | null) => resoudre({ plafonds, barriere: { env: reelle, branche: "claude/x", cookieValide: async () => true } });
    expect(await dep(PLAFONDS_USAGE_TEST).barriere()).toBe("reelle");
    expect(await dep(nuls).barriere()).toBe("simulee");
    expect(await dep(null).barriere()).toBe("simulee");
  });
});

describe("génération: la variante réelle n'est jamais choisie sans la réponse de Samuel (revue de la PR 563, mineur 12)", () => {
  const reelle = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "claude/x", GENERATION_APPELS_REELS: "1" };
  const ouverte = { env: reelle, branche: "claude/x", cookieValide: async () => true };

  it("les trois garde-fous de configuration sont fermés aujourd'hui", () => {
    expect(BRANCHE_APPELS_REELS).toBeNull();
    expect(ECRITURE_PROGRAMMES_REELS_AUTORISEE).toBe(false);
    expect(ECRITURE_POSITIONS_AUTORISEE).toBe(false);
  });

  it("barrière ouverte mais question 9 sans réponse : composition simulée ; sinon réelle ; jamais en production", async () => {
    const sans = resoudre({ plafonds: PLAFONDS_USAGE_TEST, barriere: ouverte });
    expect(sans.composer(await sans.barriere()).variante).toBe("simulee");
    const avec = resoudre({ plafonds: PLAFONDS_USAGE_TEST, barriere: ouverte, programmesReelsAutorises: true });
    expect(avec.composer(await avec.barriere()).variante).toBe("reelle");
    const production = resoudre({ plafonds: PLAFONDS_USAGE_TEST, barriere: { env: {} } });
    expect(await production.barriere()).toBe("production");
    expect(() => production.composer("production")).toThrow(ArretEtape);
  });

  it("sans cookie d'accès (fermé par défaut) ou sans branche posée, la barrière ne s'ouvre pas", async () => {
    expect(await resoudre({ plafonds: PLAFONDS_USAGE_TEST, barriere: { env: reelle, branche: "claude/x" }, programmesReelsAutorises: true }).barriere()).toBe("simulee");
    expect(await resoudre({ plafonds: PLAFONDS_USAGE_TEST, barriere: { env: reelle, cookieValide: async () => true }, programmesReelsAutorises: true }).barriere()).toBe("simulee");
  });

  it("`src/workflows/apercu.ts` ne passe jamais de dépendances aux étapes (elles sont réservées aux tests)", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../../workflows/apercu.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const appels = [...source.matchAll(/return\s+(\w+)\(([^)]*)\);/g)].map((m) => ({ nom: m[1], arguments: m[2]?.trim() }));
    expect(appels.length).toBeGreaterThanOrEqual(6);
    for (const appel of appels) expect(appel.arguments, `${appel.nom} ne reçoit que l'entrée`).toMatch(/^(entree|entree, "upstream_error")$/);
    expect(source).not.toMatch(/dependances/i);
  });
});

describe("génération: écriture des positions (0081 B9-TL-9, 0060 § 1.3)", () => {
  it("fermée par la configuration tant que coords-purge n'a pas réussi ; suspendue par l'interrupteur", () => {
    expect(ecriturePositionsPermise({ env: {} })).toBe(false);
    expect(ecriturePositionsPermise({ env: {}, autorisee: true })).toBe(true);
    expect(ecriturePositionsPermise({ env: { POSITIONS_ECRITURE_SUSPENDUE: "1" }, autorisee: true })).toBe(false);
    expect(ecriturePositionsPermise({ env: { POSITIONS_ECRITURE_SUSPENDUE: "0" }, autorisee: true })).toBe(true);
    expect(ecriturePositionsPermise({ env: { POSITIONS_ECRITURE_SUSPENDUE: "true" }, autorisee: true })).toBe(true);
  });

  it("jamais pour la variante simulée par défaut ; forcée seulement par les tests", () => {
    const simulee = resoudre({ plafonds: PLAFONDS_USAGE_TEST });
    const fabrique = simulee.composer("simulee");
    expect(simulee.ecriturePositions(fabrique)).toBe(false);
    expect(resoudre({ plafonds: PLAFONDS_USAGE_TEST, ecriturePositions: true }).ecriturePositions(fabrique)).toBe(true);
    expect(resoudre({ plafonds: PLAFONDS_USAGE_TEST, ecriturePositions: false }).ecriturePositions({ ...fabrique, variante: "reelle" })).toBe(false);
    // Variante réelle : la configuration (fermée) décide.
    expect(resoudre({ plafonds: PLAFONDS_USAGE_TEST }).ecriturePositions({ ...fabrique, variante: "reelle" })).toBe(false);
  });
});

describe("génération: `no_option` n'est jamais une raison d'échec (B9-PO-9)", () => {
  const jour = (index: number, etapes: string[] = []): DaySnapshot =>
    ({
      index,
      date: `2026-11-${22 + index}`,
      weekday: "mon",
      items: etapes.map((placeId) => ({
        type: "stop",
        stop: { id: `s-${index}-${placeId}`, kind: "activity", placeId, name: placeId, start: "10:00", facts: {} },
      })),
      events: [],
    }) as unknown as DaySnapshot;
  const instantane = (...jours: DaySnapshot[]): TripSnapshot => ({ days: jours }) as unknown as TripSnapshot;
  const candidat = (placeId: string) => ({ id: `c-${placeId}`, placeId }) as unknown as EntreeMoteur["candidats"][number];
  const entree = (candidats: string[], jours: number[] = [1, 2]): EntreeMoteur => ({ jours, candidats: candidats.map(candidat), evenements: [] }) as unknown as EntreeMoteur;

  // Le contrat est validé par le module testé ; ces instantanés de test ne passent pas toujours `TripSnapshotSchema`.
  const sansSchema = vi.spyOn(TripSnapshotSchema, "parse").mockImplementation((v) => v as never);

  it("le programme entier d'abord : aucun repli quand le moteur réussit", () => {
    const moteur = vi.fn(() => ({ ok: true as const, instantane: instantane(jour(1, ["A"]), jour(2, ["B"])), rapport: [] }));
    const resultat = genererSansEchec(entree(["A", "B"]), moteur as never);
    expect(resultat?.days.map((d) => d.index)).toEqual([1, 2]);
    expect(moteur).toHaveBeenCalledTimes(1);
  });

  it("repli par jour : le jour fautif devient vide, l'autre garde ses étapes, un lieu n'est retenu qu'une fois", () => {
    const appels: { jours: readonly number[]; candidats: string[] }[] = [];
    const moteur = (e: EntreeMoteur) => {
      const demande = { jours: e.jours ?? [], candidats: e.candidats.map((c) => c.placeId ?? "") };
      appels.push(demande);
      // Le programme entier échoue ; le jour 2 échoue tant qu'il a des candidats.
      if (demande.jours.length === 2) return { ok: false as const, code: "no_option" as const };
      if (demande.jours[0] === 2 && demande.candidats.length > 0) return { ok: false as const, code: "no_option" as const };
      if (demande.jours[0] === 1) return { ok: true as const, instantane: instantane(jour(1, demande.candidats.slice(0, 1)), jour(2)), rapport: [] };
      return { ok: true as const, instantane: instantane(jour(1), jour(2)), rapport: [] };
    };
    const resultat = genererSansEchec(entree(["A", "B"]), moteur as never);
    expect(resultat).not.toBeNull();
    expect(resultat?.days.map((d) => d.items.length)).toEqual([1, 0]);
    // Le jour 2 est tenté avec les candidats que le jour 1 n'a pas utilisés, puis sans candidat.
    expect(appels.filter((a) => a.jours.length === 1 && a.jours[0] === 2).map((a) => a.candidats)).toEqual([["B"], []]);
  });

  it("un jour qui échoue même sans candidat : null (donnée d'entrée), jamais `no_option`", () => {
    const moteur = () => ({ ok: false as const, code: "no_option" as const });
    expect(genererSansEchec(entree(["A"]), moteur as never)).toBeNull();
    expect(sansSchema).toBeDefined();
  });
});
