// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PREVENTE_PROVENANCES } from "@/contracts/prevente-mesure";
import { CompteurPreventeIndisponibleError, creerVisitesPrevente, REQUETE_COMPTER_VISITE, type PoolVisitesPrevente } from "@/server/prevente/visites";

import { DatabaseGuardError } from "../../../db/connection";

/**
 * Mise en œuvre Postgres du compteur de visites, sans base (spécification `specs/C2-prevente-mesure.md`, § 2.2 points 5
 * et 6, § 4 ; tâche C2b, ticket 1130 ; critère A14). La même mise en œuvre est éprouvée sur une vraie base par
 * `tests/db/prevente-compteur.test.ts`, et sur la vraie garde de connexion par
 * `src/adapters/prevente-disponibilite.test.tsx` (critère A12).
 */

const RACINE = path.resolve(__dirname, "../../..");

function poolEspion(): { pool: PoolVisitesPrevente; requetes: [string, unknown[] | undefined][] } {
  const requetes: [string, unknown[] | undefined][] = [];
  return {
    requetes,
    pool: {
      query: async (text, values) => {
        requetes.push([text, values]);
        return { rows: [{ prevente_compter_visite: "" }] };
      },
    },
  };
}

describe("A14 — une visite s'écrit par la seule fonction « compter une visite »", () => {
  it.each(PREVENTE_PROVENANCES)("%s : une requête, texte constant, la provenance pour seul paramètre", async (src) => {
    const { pool, requetes } = poolEspion();
    const visites = creerVisitesPrevente({ creerPool: () => pool });
    await expect(visites.compter(src)).resolves.toBeUndefined();
    expect(requetes).toEqual([["SELECT public.prevente_compter_visite($1::text)", [src]]]);
    expect(REQUETE_COMPTER_VISITE).toBe("SELECT public.prevente_compter_visite($1::text)");
  });

  it.each(["interne", "inconnu-123", "", "FORUM", "forum'; DROP TABLE prevente_visites; --"])("provenance hors liste (%j) : refusée avant toute requête", async (src) => {
    const { pool, requetes } = poolEspion();
    const visites = creerVisitesPrevente({ creerPool: () => pool });
    await expect(visites.compter(src as never)).rejects.toBeDefined();
    expect(requetes).toEqual([]);
  });

  it("aucune requête du code ne nomme la table des visites : ni l'adaptateur, ni le module du serveur, ni la page", () => {
    for (const fichier of ["src/server/prevente/visites.ts", "src/adapters/prevente-mesure.ts", "src/adapters/prevente-mesure-instance.ts", "src/app/page.tsx"]) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      expect(texte, fichier).not.toMatch(/prevente_visites|prevente_reponses/);
      expect(texte, fichier).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s/);
    }
    const source = readFileSync(path.join(RACINE, "src/server/prevente/visites.ts"), "utf8");
    // Une seule requête dans le module (citée une fois dans son commentaire), et elle n'appelle que la fonction d'écriture.
    expect(source.match(/\bSELECT\b/g)).toHaveLength(2);
    expect(source.match(/public\.[a-z_]+/g)?.every((objet) => objet === "public.prevente_compter_visite")).toBe(true);
  });

  it("le pool ne reçoit rien d'autre : une erreur de la requête remonte telle quelle à l'appelant, qui l'avale", async () => {
    const erreur = Object.assign(new Error("permission denied for function prevente_compter_visite"), { code: "42501" });
    const visites = creerVisitesPrevente({ creerPool: () => ({ query: () => Promise.reject(erreur) }) });
    await expect(visites.compter("forum")).rejects.toBe(erreur);
  });
});

describe("compteur Postgres : disponible sans ouvrir de connexion", () => {
  it("fabrique qui lève (garde de connexion) : indisponible, écriture refusée sans requête ; la création est retentée", async () => {
    let appels = 0;
    const { pool, requetes } = poolEspion();
    const visites = creerVisitesPrevente({
      creerPool: () => {
        appels += 1;
        if (appels < 3) throw new DatabaseGuardError("garde");
        return pool;
      },
    });
    expect(visites.disponible()).toBe(false);
    await expect(visites.compter("forum")).rejects.toBeInstanceOf(CompteurPreventeIndisponibleError);
    expect(requetes).toEqual([]);
    expect(visites.disponible()).toBe(true);
    expect(visites.disponible()).toBe(true);
    expect(appels).toBe(3);
    await visites.compter("forum");
    expect(requetes).toHaveLength(1);
  });

  it("« disponible » n'envoie aucune requête", () => {
    const { pool, requetes } = poolEspion();
    const visites = creerVisitesPrevente({ creerPool: () => pool });
    for (let i = 0; i < 5; i += 1) expect(visites.disponible()).toBe(true);
    expect(requetes).toEqual([]);
  });
});
