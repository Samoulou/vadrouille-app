// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lireCleOpenRouter } from "@/server/env/ai";
import { CODE_CLE_ABSENTE } from "@/server/env/egress";
import { clesDeServicePosees } from "@/server/env/garde-cles";
import { lireCleGoogle } from "@/server/env/grounding";

// 0046 D21 : la barrière de sortie lit aussi le vrai `process.env` ; ces tests le posent en préversion, puis le rétablissent.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * `p0: modules d'environnement étroits` et `p0: aucune clé dans l'environnement des tests` (P0r1). Chaque module ne
 * lit que ses variables, à l'appel ; la barrière de sortie passe avant toute lecture de clé. Les lectures sont
 * comptées par des accesseurs, sur un environnement injecté (jamais celui du processus). Clés : sentinelles.
 */

const SENTINELLE = "SENTINELLE-VALEUR-CLE-0b7e";

/** Environnement dont chaque lecture est notée ; les noms lisibles sont exactement ceux déclarés ici. */
function environnementCompte(valeurs: { modeles?: string; google?: string; vercel?: string }) {
  const lus: string[] = [];
  const environnement = {
    get VERCEL_ENV() {
      lus.push("VERCEL_ENV");
      return valeurs.vercel ?? "preview";
    },
    get OPENROUTER_API_KEY() {
      lus.push("cle-modeles");
      return valeurs.modeles;
    },
    get GOOGLE_MAPS_SERVER_KEY() {
      lus.push("cle-google");
      return valeurs.google;
    },
  };
  return { environnement, lus };
}

describe("p0: modules d'environnement étroits", () => {
  it("le module de modèles ne lit que sa clé, après la barrière", () => {
    const { environnement, lus } = environnementCompte({ modeles: SENTINELLE, google: "autre" });
    expect(lireCleOpenRouter(environnement, [])).toEqual({ ok: true, cle: SENTINELLE });
    expect(lus.filter((n) => n.startsWith("cle-"))).toEqual(["cle-modeles"]);
    expect(lus.indexOf("VERCEL_ENV")).toBeLessThan(lus.indexOf("cle-modeles"));
  });

  it("le module Google ne lit que sa clé, après la barrière", () => {
    const { environnement, lus } = environnementCompte({ modeles: "autre", google: SENTINELLE });
    expect(lireCleGoogle(environnement, [])).toEqual({ ok: true, cle: SENTINELLE });
    expect(lus.filter((n) => n.startsWith("cle-"))).toEqual(["cle-google"]);
  });

  it.each([
    ["absente", undefined],
    ["vide", ""],
  ])("clé %s : code fermé, aucune valeur", (_nom, valeur) => {
    expect(lireCleOpenRouter(environnementCompte({ modeles: valeur }).environnement, [])).toEqual({ ok: false, code: CODE_CLE_ABSENTE });
    expect(lireCleGoogle(environnementCompte({ google: valeur }).environnement, [])).toEqual({ ok: false, code: CODE_CLE_ABSENTE });
  });

  it.each([
    ["production", "production_refused", []],
    ["preview", "tls_env_refused", ["--openssl-legacy-provider"]],
    ["preview", "proxy_env_refused", ["--use-env-proxy"]],
  ] as [string, string, string[]][])("refus de la barrière (%s, %s) : aucune clé lue", (vercel, code, execArgv) => {
    const { environnement, lus } = environnementCompte({ modeles: SENTINELLE, google: SENTINELLE, vercel });
    const resultats = [lireCleOpenRouter(environnement, execArgv), lireCleGoogle(environnement, execArgv)];
    for (const resultat of resultats) expect(resultat).toEqual({ ok: false, code });
    expect(lus.filter((n) => n.startsWith("cle-"))).toEqual([]);
    expect(JSON.stringify(resultats)).not.toContain(SENTINELLE);
  });
});

describe("p0: aucune clé dans l'environnement des tests", () => {
  it("la garde signale chaque clé de service posée, par libellé fermé, jamais par sa valeur", () => {
    expect(clesDeServicePosees({})).toEqual([]);
    expect(clesDeServicePosees({ OPENROUTER_API_KEY: "", GOOGLE_MAPS_SERVER_KEY: "" })).toEqual([]);
    const posees = clesDeServicePosees({
      OPENROUTER_API_KEY: SENTINELLE,
      GOOGLE_MAPS_SERVER_KEY: SENTINELLE,
      AI_GATEWAY_API_KEY: SENTINELLE,
      VERCEL_OIDC_TOKEN: SENTINELLE,
    });
    expect(posees).toEqual(["modeles", "google", "passerelle", "oidc"]);
    expect(JSON.stringify(posees)).not.toContain(SENTINELLE);
  });

  it("l'environnement de ce processus de test ne porte aucune clé de service (garde de la mise en place)", () => {
    expect(clesDeServicePosees()).toEqual([]);
  });
});
