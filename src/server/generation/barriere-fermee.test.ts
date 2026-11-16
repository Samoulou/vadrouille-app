import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAFONDS_USAGE, PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { BRANCHE_APPELS_REELS } from "@/server/config/generation";

import type { OrgTransaction } from "@/server/with-org";

import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { ArretEtape } from "./codes";
import { resoudre, type DependancesGeneration } from "./dependances";
import { etapeBrief, etapeRecherche } from "./etapes";
import { forfaitDeLEtape } from "./forfait-etape";

/**
 * Critère `génération réelle: barrière fermée, aucun appel` (spécification B9, B9e ; décision 0081 B9-TL-8 point 5 et
 * B9-TL-2 point 5) : **un cas par condition manquante** de la barrière. Barrière fermée hors production, la composition est
 * la variante simulée (doubles sur fixtures, jamais un client réel) ; en production, aucune composition : `composer` lève
 * `production_refused` (l'action rend `provider_error`) et aucun client n'est construit. Transport de test : `fetch` échoue
 * s'il est appelé ; la variante rendue par la composition est vérifiée (les clients réels ne sont construits que par la
 * variante `reelle`, dans une étape).
 *
 * Conditions (B9-TL-8 point 1) : préversion Vercel, branche posée par Samuel, drapeau `GENERATION_APPELS_REELS=1`, cookie
 * d'accès valide, plafonds posés et non nuls. La réponse de Samuel à la question 9 (`programmesReelsAutorises`) est forcée
 * à vrai ici, pour que seule la barrière décide.
 */

const BRANCHE = "claude/essai-reel";
const OUVERTE = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCHE, GENERATION_APPELS_REELS: "1" } as const;
const cookieValide = async () => true;

const fetchInterdit = vi.fn(async () => {
  throw new Error("transport de test : aucune requête réseau");
});

beforeEach(() => {
  fetchInterdit.mockClear();
  vi.stubGlobal("fetch", fetchInterdit);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

type Cas = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly branche?: string | null;
  readonly cookie?: () => Promise<boolean>;
  readonly plafonds?: typeof PLAFONDS_USAGE_TEST | null;
};

const ouverte: Cas = { env: OUVERTE, branche: BRANCHE, cookie: cookieValide, plafonds: PLAFONDS_USAGE_TEST };

const dependances = (cas: Cas) =>
  resoudre({
    plafonds: cas.plafonds === undefined ? PLAFONDS_USAGE_TEST : cas.plafonds,
    programmesReelsAutorises: true,
    barriere: { env: cas.env, ...(cas.branche === undefined ? {} : { branche: cas.branche }), ...(cas.cookie === undefined ? {} : { cookieValide: cas.cookie }) },
  });

describe("génération réelle: barrière fermée, aucun appel", () => {
  it("contrôle : toutes les conditions réunies, la barrière s'ouvre et la composition serait la variante réelle", async () => {
    const dep = dependances(ouverte);
    expect(await dep.barriere()).toBe("reelle");
    // Composition seulement (aucune étape, donc aucun client construit ni appel).
    expect((await dep.composer("reelle")).variante).toBe("reelle");
    expect(fetchInterdit).not.toHaveBeenCalled();
  });

  it.each<[string, Cas]>([
    ["déploiement local (VADROUILLE_ENV=local)", { ...ouverte, env: { VADROUILLE_ENV: "local" } }],
    ["CI (VADROUILLE_ENV=ci, même sur une préversion déclarée)", { ...ouverte, env: { ...OUVERTE, VADROUILLE_ENV: "ci" } }],
    ["préversion non déclarée (VERCEL_ENV=development)", { ...ouverte, env: { ...OUVERTE, VERCEL_ENV: "development" } }],
    ["branche non posée par Samuel (null)", { ...ouverte, branche: null }],
    ["autre branche que celle posée", { ...ouverte, env: { ...OUVERTE, VERCEL_GIT_COMMIT_REF: "claude/autre" } }],
    ["drapeau d'activation absent", { ...ouverte, env: { ...OUVERTE, GENERATION_APPELS_REELS: undefined } }],
    ["drapeau d'activation différent de 1", { ...ouverte, env: { ...OUVERTE, GENERATION_APPELS_REELS: "true" } }],
    ["cookie d'accès absent (crochet fermé par défaut)", { ...ouverte, cookie: undefined }],
    ["cookie d'accès invalide", { ...ouverte, cookie: async () => false }],
    ["vérification du cookie en échec", { ...ouverte, cookie: async () => Promise.reject(new Error("illisible")) }],
    ["plafonds absents (configuration de production)", { ...ouverte, plafonds: null }],
    [
      "plafonds nuls",
      { ...ouverte, plafonds: { ...PLAFONDS_USAGE_TEST, generations: { ...PLAFONDS_USAGE_TEST.generations, apercu: { ...PLAFONDS_USAGE_TEST.generations.apercu, placesDetails: 0 } } } },
    ],
  ])("%s : variante simulée, aucun client réel, aucune requête", async (_cas, cas) => {
    const dep = dependances(cas);
    const etat = await dep.barriere();
    expect(etat).toBe("simulee");
    const fabrique = await dep.composer(etat);
    expect(fabrique.variante).toBe("simulee");
    expect(fetchInterdit).not.toHaveBeenCalled();
  });

  it.each<[string, Cas]>([
    ["production déclarée (VERCEL_ENV=production)", { ...ouverte, env: { ...OUVERTE, VERCEL_ENV: "production" } }],
    ["production déclarée (VADROUILLE_ENV=production)", { ...ouverte, env: { ...OUVERTE, VADROUILLE_ENV: "production" } }],
    ["aucune déclaration de déploiement", { ...ouverte, env: {} }],
    ["déclaration inconnue", { ...ouverte, env: { VADROUILLE_ENV: "recette" } }],
  ])("%s : production, aucune composition (production_refused), aucun client", async (_cas, cas) => {
    const dep = dependances(cas);
    const etat = await dep.barriere();
    expect(etat).toBe("production");
    await expect(dep.composer(etat)).rejects.toBeInstanceOf(ArretEtape);
    await expect(dep.composer(etat)).rejects.toThrow("production_refused");
    expect(dep.reglesPour(etat)).toBeNull();
    expect(fetchInterdit).not.toHaveBeenCalled();
  });

  // Attente modifiée par la décision 0169 § 2 et § 3 (M1h) : la branche et les plafonds sont posés ; la barrière par défaut
  // reste fermée partout où l'environnement n'est pas la préversion de `mvp-essai` avec son drapeau.
  it("configuration du dépôt (0169) : branche mvp-essai et plafonds posés ; hors de cette branche, la barrière par défaut reste fermée", async () => {
    expect(BRANCHE_APPELS_REELS).toBe("mvp-essai");
    expect(PLAFONDS_USAGE).not.toBeNull();
    // Dépendances de production (aucun remplacement), conditions d'environnement réunies sur une autre branche : simulée.
    expect(OUVERTE.VERCEL_GIT_COMMIT_REF).not.toBe("mvp-essai");
    const dep = resoudre({ programmesReelsAutorises: true, barriere: { env: OUVERTE, cookieValide } });
    expect(await dep.barriere()).toBe("simulee");
    expect((await dep.composer(await dep.barriere())).variante).toBe("simulee");
    // Sur la branche, sans le drapeau serveur ou sans préversion : simulée ; production : refus.
    const surBranche = { ...OUVERTE, VERCEL_GIT_COMMIT_REF: "mvp-essai" };
    for (const env of [{ ...surBranche, GENERATION_APPELS_REELS: undefined }, { ...surBranche, GENERATION_APPELS_REELS: "true" }, { ...surBranche, VERCEL_ENV: "development" }, { ...surBranche, VADROUILLE_ENV: "ci" }]) {
      expect(await resoudre({ barriere: { env, cookieValide } }).barriere(), JSON.stringify(env)).toBe("simulee");
    }
    expect(await resoudre({ barriere: { env: { ...surBranche, VERCEL_ENV: "production" }, cookieValide } }).barriere()).toBe("production");
    // Toutes les conditions réunies sur la branche : réelle (c'est l'ouverture décidée par 0169).
    expect(await resoudre({ barriere: { env: surBranche, cookieValide } }).barriere()).toBe("reelle");
  });

  it("crochet par défaut de la génération (0169 § 5) : fermé hors de la garde api, donc simulée même sur la branche", async () => {
    // L'environnement du processus de test n'ouvre pas `assertApiAdapter` : le crochet par défaut rend `false`.
    const dep = resoudre({ barriere: { env: { ...OUVERTE, VERCEL_GIT_COMMIT_REF: "mvp-essai" } } });
    expect(await dep.barriere()).toBe("simulee");
  });
});

describe("génération: les valeurs de test de la variante simulée n'autorisent aucun appel réel (B9-PO-10)", () => {
  // Attente modifiée par la décision 0169 § 3 : `PLAFONDS_USAGE` est posé ; la règle éprouvée reste la même (la barrière ne
  // lit jamais les valeurs de la variante simulée), sur des plafonds absents injectés.
  it("la barrière lit PLAFONDS_USAGE seul : plafonds absents, elle reste simulée, quelles que soient les valeurs simulées", async () => {
    const dep = resoudre({ plafonds: null, programmesReelsAutorises: true, barriere: { env: OUVERTE, branche: BRANCHE, cookieValide } });
    expect(dep.plafonds).toBeNull();
    expect(await dep.barriere()).toBe("simulee");
    expect(resoudre().plafonds).toBe(PLAFONDS_USAGE);
    expect(resoudre().plafonds).not.toBe(PLAFONDS_VARIANTE_SIMULEE);
  });

  // Attente modifiée par la décision 0169 § 3 : la variante réelle lit `PLAFONDS_USAGE`, désormais posé.
  it("règles du forfait par variante : simulée sur les valeurs de test, réelle sur PLAFONDS_USAGE, production aucune", () => {
    const dep = resoudre();
    expect(dep.reglesPour("simulee")?.plafonds).toBe(PLAFONDS_VARIANTE_SIMULEE);
    expect(dep.reglesPour("reelle")?.plafonds).toBe(PLAFONDS_USAGE);
    expect(dep.reglesPour("production")).toBeNull();
    expect(resoudre({ plafonds: null }).reglesPour("reelle")).toBeNull();
  });

  it("des plafonds passés par un test valent pour les deux variantes", () => {
    const dep = resoudre({ plafonds: PLAFONDS_USAGE_TEST });
    expect(dep.reglesPour("simulee")?.plafonds).toBe(PLAFONDS_USAGE_TEST);
    expect(dep.reglesPour("reelle")?.plafonds).toBe(PLAFONDS_USAGE_TEST);
  });
});

/** Transaction de test : chaque requête est notée et rend une ligne d'exécution ouverte (garde de l'étape, clôture). */
function transactionNotee(requetes: string[]): NonNullable<DependancesGeneration["transaction"]> {
  const tx = {
    execute: async (requete: unknown) => {
      requetes.push(JSON.stringify(requete));
      return { rows: [{ trip_id: TRIP, request_id: null, id: RUN }] };
    },
  } as unknown as OrgTransaction;
  return async (_organisation, fn) => fn(tx);
}

const ORG = "5e1f0000-0000-4000-8000-0000000000aa";
const TRIP = "5e1f0000-0000-4000-8000-0000000000bb";
const RUN = "5e1f0000-0000-4000-8000-0000000000cc";

describe("génération réelle: barrière fermée, aucun appel (étape complète)", () => {
  it.each<[string, (entree: unknown, dep?: DependancesGeneration) => Promise<unknown>]>([
    ["étape a (brief)", etapeBrief],
    ["étape b (recherche)", etapeRecherche],
  ])("%s en production : arrêt production_refused, exécution close, aucune requête réseau ni réservation", async (_nom, etape) => {
    const requetes: string[] = [];
    const sortie = await etape(
      { generationRunId: RUN, organizationId: ORG, rang: 0 },
      { transaction: transactionNotee(requetes), plafonds: PLAFONDS_USAGE_TEST, programmesReelsAutorises: true, barriere: { env: { VERCEL_ENV: "production" }, branche: BRANCHE, cookieValide } },
    );
    expect(sortie).toMatchObject({ arret: "production_refused" });
    expect(fetchInterdit).not.toHaveBeenCalled();
    // Garde de l'étape puis clôture en échec ; jamais `usage_ledger` (aucun forfait), ni lecture du voyage.
    expect(requetes).toHaveLength(2);
    expect(requetes.some((r) => r.includes("usage_ledger"))).toBe(false);
    expect(requetes[1]).toContain("phase = 'failed'");
  });
});

describe("génération: forfait de la variante simulée en mémoire, aucune ligne dans usage_ledger (0110 § 3)", () => {
  const contexte = (barriere: "simulee" | "reelle") => ({ organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere });

  it("simulée par défaut : forfait de l'aperçu borné, aucune transaction ouverte", async () => {
    const transaction = vi.fn();
    const dep = resoudre({ transaction: transaction as unknown as NonNullable<DependancesGeneration["transaction"]> });
    const { forfait, registre } = await forfaitDeLEtape(dep, contexte("simulee"), "c");
    expect(transaction).not.toHaveBeenCalled();
    expect(forfait.nature).toBe("execution");
    expect(registre).toBeDefined();
    expect(forfait.textSearchRequetes).toBeGreaterThan(0);
  });

  it("simulée sous un banc de la base (`reserverEnSimulee`) et réelle : la réservation ouvre une transaction", async () => {
    for (const [barriere, options] of [
      ["simulee", { reserverEnSimulee: true }],
      ["reelle", {}],
    ] as const) {
      const transaction = vi.fn(async () => {
        throw new Error("base de test absente");
      });
      const dep = resoudre({ ...options, plafonds: PLAFONDS_USAGE_TEST, transaction: transaction as unknown as NonNullable<DependancesGeneration["transaction"]> });
      await expect(forfaitDeLEtape(dep, contexte(barriere), "c")).rejects.toThrow("usage_unavailable");
      expect(transaction).toHaveBeenCalled();
    }
  });
});
