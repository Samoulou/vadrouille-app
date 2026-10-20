import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAFONDS_USAGE, PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { BRANCHE_APPELS_REELS } from "@/server/config/generation";

import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { ArretEtape } from "./codes";
import { resoudre } from "./dependances";

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

  it("configuration du dépôt : branche non posée et plafonds absents, donc la barrière par défaut reste fermée", async () => {
    expect(BRANCHE_APPELS_REELS).toBeNull();
    expect(PLAFONDS_USAGE).toBeNull();
    // Dépendances de production (aucun remplacement), conditions d'environnement réunies : simulée.
    const dep = resoudre({ programmesReelsAutorises: true, barriere: { env: OUVERTE, cookieValide } });
    expect(await dep.barriere()).toBe("simulee");
    expect((await dep.composer(await dep.barriere())).variante).toBe("simulee");
  });
});

describe("génération: les valeurs de test de la variante simulée n'autorisent aucun appel réel (B9-PO-10)", () => {
  it("la barrière lit PLAFONDS_USAGE seul : avec les valeurs simulées posées, elle reste simulée", async () => {
    const dep = resoudre({ programmesReelsAutorises: true, barriere: { env: OUVERTE, branche: BRANCHE, cookieValide } });
    expect(dep.plafonds).toBeNull();
    expect(await dep.barriere()).toBe("simulee");
  });

  it("règles du forfait par variante : simulée sur les valeurs de test, réelle sur PLAFONDS_USAGE (aucune), production aucune", () => {
    const dep = resoudre();
    expect(dep.reglesPour("simulee")?.plafonds).toBe(PLAFONDS_VARIANTE_SIMULEE);
    expect(dep.reglesPour("reelle")).toBeNull();
    expect(dep.reglesPour("production")).toBeNull();
  });

  it("des plafonds passés par un test valent pour les deux variantes", () => {
    const dep = resoudre({ plafonds: PLAFONDS_USAGE_TEST });
    expect(dep.reglesPour("simulee")?.plafonds).toBe(PLAFONDS_USAGE_TEST);
    expect(dep.reglesPour("reelle")?.plafonds).toBe(PLAFONDS_USAGE_TEST);
  });
});
