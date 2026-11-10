import { randomBytes, randomUUID } from "node:crypto";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { creerVisitesPrevente } from "@/server/prevente/visites";
import { limiteurConfigure } from "@/server/rate-limit";

import { createGuardedPool, DATABASE_URL_VARIABLES } from "../../db/connection";
import { NAVIGATEURS } from "../../tests/support/agents-utilisateurs";
import { CAS_PRODUCTION_COMMUNS, type EnvDeploiement } from "../../tests/support/cas-production-commune";
import { compteurPreventeDisponible, creerMesurePreventeMemoire, questionnairePreventeDisponible } from "./prevente-mesure";
import { brancherMesurePrevente, debrancherMesurePreventePourTests, MesurePreventeDejaBrancheeError } from "./prevente-mesure-instance";

/**
 * « Compteur disponible » et « questionnaire disponible » (spécification `specs/C2-prevente-mesure.md`, § 6.2 ; tâche
 * C2b, ticket 1130 ; critère A12), sur la **mise en œuvre Postgres** et la vraie garde de `db/connection.ts` : variable
 * de connexion absente, puis environnement de production (table de cas commune). Aucune tentative de connexion, aucune
 * écriture, aucune ligne de journal, et `GET /` répond.
 *
 * L'environnement de la garde est passé en objet, comme dans `tests/unit/db/garde-connexion.test.ts` (le nom de la
 * variable de connexion n'est écrit que par `db/connection.ts`). L'adresse est injoignable et construite à l'exécution
 * (mot de passe aléatoire) : aucune chaîne de connexion n'est écrite dans le dépôt.
 */

const requete = vi.hoisted(() => ({ lectures: 0, agent: "", taches: 0 }));

vi.mock("next/headers", () => ({
  headers: async () => {
    requete.lectures += 1;
    return new Headers({ "User-Agent": requete.agent });
  },
}));

vi.mock("next/server", () => ({
  after: () => {
    requete.taches += 1;
  },
}));

const INJOIGNABLE = (() => {
  const url = new URL("postgres://127.0.0.1:1/base");
  url.username = "vadrouille_app";
  url.password = randomUUID();
  return url.href;
})();

type Pool = ReturnType<typeof createGuardedPool>;

let journal: string[];
let pools: Pool[];
let creations = 0;

/** Branche la mise en œuvre Postgres sur la vraie garde, avec l'environnement injecté ; garde ses pools créés. */
function poserCompteur(env: Readonly<Record<string, string | undefined>>, limiteur = false): void {
  const visites = creerVisitesPrevente({
    creerPool: () => {
      creations += 1;
      const pool = createGuardedPool("vadrouille_app", env);
      pools.push(pool);
      return pool;
    },
  });
  debrancherMesurePreventePourTests();
  brancherMesurePrevente({ compteurDisponible: () => visites.disponible(), compterVisite: (src) => visites.compter(src), limiteurConfigure: () => limiteur, visitePerdue: () => undefined });
}

function poserEnvironnementReel(env: EnvDeploiement): void {
  vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV);
  vi.stubEnv("VERCEL_TARGET_ENV", env.VERCEL_TARGET_ENV);
  vi.stubEnv("VADROUILLE_ENV", env.VADROUILLE_ENV);
}

beforeEach(() => {
  journal = [];
  pools = [];
  creations = 0;
  requete.lectures = 0;
  requete.taches = 0;
  requete.agent = NAVIGATEURS[0];
  for (const methode of ["log", "warn", "error"] as const) {
    vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => {
      journal.push(args.map(String).join(" "));
    });
  }
  vi.stubEnv("PREVENTE", "1");
  poserEnvironnementReel({});
});

afterEach(async () => {
  cleanup();
  debrancherMesurePreventePourTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(pools.map((pool) => pool.end()));
});

async function rienNEstTente(): Promise<void> {
  expect(compteurPreventeDisponible()).toBe(false);
  expect(questionnairePreventeDisponible()).toBe(false);
  const { container } = render(await HomePage({ searchParams: Promise.resolve({ src: "forum" }) }));
  expect(container.innerHTML).toContain("Précommander pour 29");
  expect(container.innerHTML).toContain("/precommande?src=forum");
  // La garde a refusé avant de créer un pool : aucune connexion possible, rien de remis après la réponse.
  expect(creations).toBeGreaterThanOrEqual(1);
  expect(pools).toEqual([]);
  expect(requete.taches).toBe(0);
  expect(journal).toEqual([]);
  // La requête n'est même pas lue : ni agent utilisateur, ni autre en-tête.
  expect(requete.lectures).toBe(0);
}

describe("A12 — compteur indisponible : aucune tentative de connexion, aucune écriture, GET / répond", () => {
  it.each([undefined, "", "   "])("variable de connexion absente ou vide (%j)", async (valeur) => {
    poserCompteur({ [DATABASE_URL_VARIABLES.vadrouille_app]: valeur });
    await rienNEstTente();
  });

  it("seule la variable d'un autre rôle est posée", async () => {
    poserCompteur({ [DATABASE_URL_VARIABLES.vadrouille_auth]: INJOIGNABLE, DATABASE_URL: INJOIGNABLE });
    await rienNEstTente();
  });

  it.each(CAS_PRODUCTION_COMMUNS.filter((cas) => cas.app === "refusee"))("production, variable posée : $nom", async (cas) => {
    poserEnvironnementReel(cas.reel);
    poserCompteur({ ...cas.injecte, [DATABASE_URL_VARIABLES.vadrouille_app]: INJOIGNABLE });
    await rienNEstTente();
  });

  it.each(CAS_PRODUCTION_COMMUNS.filter((cas) => cas.app === "admise"))("hors production, variable posée : disponible, sans ouvrir de connexion ($nom)", (cas) => {
    poserEnvironnementReel(cas.reel);
    poserCompteur({ ...cas.injecte, [DATABASE_URL_VARIABLES.vadrouille_app]: INJOIGNABLE });
    expect(compteurPreventeDisponible()).toBe(true);
    expect(compteurPreventeDisponible()).toBe(true);
    // Un seul pool, créé une fois, et aucun client : `pg` ne connecte qu'à la première requête.
    expect(creations).toBe(1);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.totalCount).toBe(0);
    expect(journal).toEqual([]);
  });

  it("la table commune porte bien des cas de production refusés et des cas admis", () => {
    expect(CAS_PRODUCTION_COMMUNS.filter((cas) => cas.app === "refusee").length).toBeGreaterThanOrEqual(5);
    expect(CAS_PRODUCTION_COMMUNS.filter((cas) => cas.app === "admise").length).toBeGreaterThanOrEqual(5);
  });

  it("un limiteur configuré n'y change rien : sans compteur, pas de questionnaire", async () => {
    poserCompteur({}, true);
    await rienNEstTente();
  });

  it("mesure non branchée (tests, next build) : rien de disponible, la page de prévente répond sans lire la requête", async () => {
    debrancherMesurePreventePourTests();
    expect(compteurPreventeDisponible()).toBe(false);
    expect(questionnairePreventeDisponible()).toBe(false);
    const { container } = render(await HomePage({ searchParams: Promise.resolve({ src: "forum" }) }));
    expect(container.innerHTML).toContain("/precommande?src=forum");
    expect(requete.lectures).toBe(0);
    expect(requete.taches).toBe(0);
    expect(journal).toEqual([]);
  });
});

describe("questionnaire disponible : compteur disponible et limiteur configuré (§ 6.2)", () => {
  const brancher = (compteur: () => boolean, limiteur: () => boolean) =>
    brancherMesurePrevente({ compteurDisponible: compteur, compterVisite: async () => undefined, limiteurConfigure: limiteur, visitePerdue: () => undefined });

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])("compteur %j, limiteur %j : questionnaire %j", (compteurDisponible, limiteur, attendu) => {
    brancher(
      () => compteurDisponible,
      () => limiteur,
    );
    expect(compteurPreventeDisponible()).toBe(compteurDisponible);
    expect(questionnairePreventeDisponible()).toBe(attendu);
  });

  it("prédicat qui lève, ou qui rend autre chose qu'un booléen vrai : indisponible, sans lever", () => {
    const leve = () => {
      throw new Error("configuration");
    };
    brancher(() => true, leve);
    expect(compteurPreventeDisponible()).toBe(true);
    expect(questionnairePreventeDisponible()).toBe(false);
    debrancherMesurePreventePourTests();
    brancher(leve, () => true);
    expect(compteurPreventeDisponible()).toBe(false);
    expect(questionnairePreventeDisponible()).toBe(false);
    debrancherMesurePreventePourTests();
    brancher(
      () => "oui" as unknown as boolean,
      () => "oui" as unknown as boolean,
    );
    expect(compteurPreventeDisponible()).toBe(false);
    expect(questionnairePreventeDisponible()).toBe(false);
  });

  it("un second branchement est refusé", () => {
    brancher(
      () => true,
      () => true,
    );
    expect(() =>
      brancher(
        () => true,
        () => true,
      ),
    ).toThrow(MesurePreventeDejaBrancheeError);
  });

  it("mise en œuvre en mémoire : limiteur non configuré par défaut ; jamais disponible sur un déploiement de production", async () => {
    const memoire = creerMesurePreventeMemoire({ limiteurConfigure: true });
    brancherMesurePrevente(memoire);
    expect(creerMesurePreventeMemoire().limiteurConfigure()).toBe(false);
    expect(compteurPreventeDisponible()).toBe(true);
    expect(questionnairePreventeDisponible()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(compteurPreventeDisponible()).toBe(false);
    expect(questionnairePreventeDisponible()).toBe(false);
    await expect(memoire.compterVisite("forum")).rejects.toBeDefined();
    expect(memoire.lignes()).toEqual([]);
  });
});

describe("limiteur configuré : les variables que le limiteur exige à l'usage", () => {
  const secret = () => randomBytes(32).toString("base64");

  it("secret absent : non configuré ; secret valide en local et en ci : configuré", () => {
    expect(limiteurConfigure({ VADROUILLE_ENV: "local" })).toBe(false);
    expect(limiteurConfigure({ VADROUILLE_ENV: "ci" })).toBe(false);
    expect(limiteurConfigure({ VADROUILLE_ENV: "local", RATE_LIMIT_HMAC_SECRET: secret() })).toBe(true);
    expect(limiteurConfigure({ VADROUILLE_ENV: "ci", RATE_LIMIT_HMAC_SECRET: secret() })).toBe(true);
  });

  it("secret invalide, ou environnement non déclaré : non configuré, sans lever", () => {
    expect(limiteurConfigure({ VADROUILLE_ENV: "local", RATE_LIMIT_HMAC_SECRET: "trop-court" })).toBe(false);
    expect(limiteurConfigure({ RATE_LIMIT_HMAC_SECRET: secret() })).toBe(false);
  });

  it("préversion : l'en-tête d'adresse de confiance est exigé en plus du secret", () => {
    const base = { VERCEL_ENV: "preview", VERCEL: "1", RATE_LIMIT_HMAC_SECRET: secret() };
    expect(limiteurConfigure(base)).toBe(false);
    expect(limiteurConfigure({ ...base, TRUSTED_IP_HEADER: "x-vercel-forwarded-for" })).toBe(true);
  });
});
