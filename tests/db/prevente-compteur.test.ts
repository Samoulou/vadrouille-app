import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { visiteACompter } from "@/adapters/prevente-mesure";
import { PREVENTE_PROVENANCES } from "@/contracts/prevente-mesure";
import { creerVisitesPrevente, type VisitesPrevente } from "@/server/prevente/visites";

import { createDatabase } from "../../db/index";
import { NAVIGATEURS } from "../support/agents-utilisateurs";
import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Compteur de visites de la prévente sur une vraie base (spécification `specs/C2-prevente-mesure.md`, § 2 et § 4 ; tâche
 * C2b, ticket 1130 ; critères A1, A2, A4, A8, A9 et A14 côté base). La mise en œuvre Postgres de l'application
 * (`src/server/prevente/visites.ts`) écrit sous `vadrouille_app`, par le pool gardé de `db/connection.ts` ; le rôle de
 * test (`admin`, hors de l'application) ne sert qu'à lire et vider la table.
 *
 * Un affichage est joué en deux temps, comme dans l'adaptateur : la décision (`visiteACompter`, sur la provenance et
 * les en-têtes), puis l'écriture de la provenance rendue. La décision prise dans la page et son écriture après la
 * réponse sont éprouvées par `src/adapters/prevente-mesure.test.tsx`. Les droits, les contraintes et la concurrence
 * de la fonction d'écriture le sont par `tests/db/prevente-mesure.test.ts` (C2a, critères B1 à B7).
 * La table est globale : chaque test la vide d'abord (fichiers de base exécutés en série).
 */

const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const LIGNES = `SELECT (jour = ${JOUR}) AS aujourdhui, src, visites FROM public.prevente_visites ORDER BY src`;

let admin: DbClient;
let pool: { end(): Promise<void>; query(text: string, values?: unknown[]): Promise<unknown> };
let visites: VisitesPrevente;

const vider = () => admin.query("DELETE FROM public.prevente_visites");
const lignes = async () => (await admin.query(LIGNES)).rows as { aujourdhui: boolean; src: string; visites: number }[];

beforeAll(async () => {
  admin = await connect("admin");
  // Même fabrique que le module (`createDatabase("vadrouille_app")`, pool gardé), gardée ici pour la fermer.
  pool = createDatabase("vadrouille_app", undefined, { max: 2, connectionTimeoutMillis: 10_000, query_timeout: 10_000 }).$client;
  visites = creerVisitesPrevente({ creerPool: () => pool });
});

beforeEach(vider);

afterAll(async () => {
  await vider();
  await pool.end();
  await closeAll();
});

/** Un affichage : décision de l'adaptateur, puis écriture si elle compte. Rend vrai si une écriture a eu lieu. */
async function afficher(src: string | null, entetes: Record<string, string> = { "User-Agent": NAVIGATEURS[0] }): Promise<boolean> {
  const provenance = visiteACompter(src, new Headers(entetes));
  if (provenance === null) return false;
  await visites.compter(provenance);
  return true;
}

describe("prévente : compteur de visites de l'application sur la base", () => {
  it("A14 — vadrouille_app écrit une visite par la seule fonction : une ligne pour le jour UTC de la base", async () => {
    expect(visites.disponible()).toBe(true);
    await visites.compter("forum");
    expect(await lignes()).toEqual([{ aujourdhui: true, src: "forum", visites: 1 }]);
  });

  it("A1, A8 — un affichage sans src : + 1 sous direct ; deux affichages identiques : deux visites, une seule ligne", async () => {
    expect(await afficher(null)).toBe(true);
    expect(await lignes()).toEqual([{ aujourdhui: true, src: "direct", visites: 1 }]);
    expect(await afficher(null)).toBe(true);
    expect(await lignes()).toEqual([{ aujourdhui: true, src: "direct", visites: 2 }]);
  });

  it("A2, A4 — chaque provenance stockée a sa ligne ; une valeur hors liste va sous autre", async () => {
    for (const src of PREVENTE_PROVENANCES.filter((p) => p !== "direct" && p !== "autre")) await afficher(src);
    await afficher("inconnu-123");
    await afficher(null);
    expect(await lignes()).toEqual([...PREVENTE_PROVENANCES].sort().map((src) => ({ aujourdhui: true, src, visites: 1 })));
  });

  it("A3, A5, A6 — interne, robot, agent utilisateur absent et préchargement : la table reste vide", async () => {
    expect(await afficher("interne")).toBe(false);
    expect(await afficher("forum", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })).toBe(false);
    expect(await afficher("forum", {})).toBe(false);
    expect(await afficher("forum", { "User-Agent": NAVIGATEURS[0], "Next-Router-Prefetch": "1" })).toBe(false);
    expect(await lignes()).toEqual([]);
  });

  it("A9 — la ligne écrite ne contient que jour, src et visites ; rien de la requête n'atteint la base", async () => {
    await afficher("groupe", { "User-Agent": NAVIGATEURS[1], "X-Forwarded-For": "203.0.113.7", Referer: "https://exemple.test/fil/42", Cookie: "session=abc" });
    const { rows, fields } = await admin.query("SELECT * FROM public.prevente_visites");
    expect(fields.map((champ) => champ.name).sort()).toEqual(["jour", "src", "visites"]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113\.7|Mozilla|exemple\.test|session/);
  });

  it("20 écritures concurrentes de l'application : visites = 20, une seule ligne", async () => {
    await Promise.all(Array.from({ length: 20 }, () => visites.compter("reddit")));
    expect(await lignes()).toEqual([{ aujourdhui: true, src: "reddit", visites: 20 }]);
  });

  it("une provenance hors liste est refusée avant la base ; interne ne peut pas être écrite par ce module", async () => {
    await expect(visites.compter("interne" as never)).rejects.toBeDefined();
    expect(await lignes()).toEqual([]);
  });
});
