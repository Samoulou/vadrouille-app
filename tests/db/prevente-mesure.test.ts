import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import {
  PREVENTE_CODES,
  PREVENTE_DECOUVERTES,
  PREVENTE_MOTIFS,
  PREVENTE_PERIODES,
  PREVENTE_PLAFOND_REPONSES_JOUR,
  PREVENTE_PREPARATIONS,
  PREVENTE_PROVENANCES,
} from "../../db/prevente-codes";
import { urlBaseJetable } from "./env";
import { closeAll, connect, connectBaseJetable, createOrg, type DbClient, inTx } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Mesure de la prévente dans la base (spécification `specs/C2-prevente-mesure.md`, § 4 et § 5 ; tâche C2a, ticket 1117 ;
 * migration `0029_prevente_mesure`). Critères B1 à B7.
 *
 * Chaque rôle est éprouvé sous sa propre identité : `vadrouille_app` par sa connexion ; le rôle du relevé, créé sans
 * connexion tant que le workflow de C2e n'existe pas, par une connexion du rôle de test passée sous son identité (`SET SESSION AUTHORIZATION vadrouille_prevente_releve` : `session_user` et `current_user` deviennent ce
 * rôle, sans superutilisateur). Le rôle de test (`admin`, superutilisateur du conteneur, hors de l'application) ne sert
 * qu'à lire et vider les trois tables, à reculer le jour par SQL (jamais par l'horloge du processus), à poser un jeu
 * connu et à prouver un refus de contrainte.
 *
 * Les tables sont globales (aucune organisation) : chaque test les vide d'abord (fichiers de base exécutés en série ;
 * `prevente-compteur.test.ts` et `prevente-reponses.test.ts` y écrivent aussi, et les vident de même).
 */

const TABLES = ["prevente_visites", "prevente_reponses_jour", "prevente_reponses"] as const;
const FN_ECRITURE = ["prevente_compter_visite(text)", "prevente_enregistrer_reponse(text, text, text, text, text[], text[], text, integer)"] as const;
const FN_RELEVE = ["prevente_releve_visites()", "prevente_releve_reponses()", "prevente_releve_destinations()"] as const;
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const COMPTER = "SELECT public.prevente_compter_visite($1)";
const ENREGISTRER = "SELECT public.prevente_enregistrer_reponse($1, $2, $3, $4, $5, $6, $7) AS verdict";
const ENREGISTRER_PLAFOND = "SELECT public.prevente_enregistrer_reponse($1, $2, $3, $4, $5, $6, $7, $8) AS verdict";

type Reponse = {
  src?: string | null;
  parcours?: string | null;
  destination?: string | null;
  periode?: string | null;
  preparation?: (string | null)[] | null;
  motifs?: (string | null)[] | null;
  decouverte?: string | null;
};

const parametres = (r: Reponse): unknown[] => [
  r.src === undefined ? "forum" : r.src,
  r.parcours === undefined ? "visite" : r.parcours,
  r.destination ?? null,
  r.periode ?? null,
  r.preparation ?? null,
  r.motifs ?? null,
  r.decouverte ?? null,
];

let admin: DbClient;
let app: DbClient;
let releve: DbClient;

async function vider(): Promise<void> {
  for (const table of TABLES) await admin.query(`DELETE FROM public.${table}`);
}

async function enregistrer(client: DbClient, reponse: Reponse, plafond?: number): Promise<string> {
  const { rows } =
    plafond === undefined ? await client.query(ENREGISTRER, parametres(reponse)) : await client.query(ENREGISTRER_PLAFOND, [...parametres(reponse), plafond]);
  return rows[0].verdict as string;
}

/** Erreur Postgres d'une requête (code et contrainte), ou `undefined` si elle passe. Hors transaction : rien ne reste. */
async function erreur(client: DbClient, sql: string, params: unknown[] = []): Promise<{ code?: string; constraint?: string; detail?: string; message: string } | undefined> {
  try {
    await client.query(sql, params);
    return undefined;
  } catch (e) {
    const { code, constraint, detail, message } = e as { code?: string; constraint?: string; detail?: string; message: string };
    return { code, constraint, detail, message };
  }
}

const compte = async (table: (typeof TABLES)[number]): Promise<number> =>
  Number((await admin.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);

const compteurDuJour = async (): Promise<number | undefined> =>
  (await admin.query(`SELECT reponses FROM public.prevente_reponses_jour WHERE jour = ${JOUR}`)).rows[0]?.reponses as number | undefined;

/**
 * Appels concurrents : dix connexions de `vadrouille_app` ouvertes une fois, chacune enchaîne `parConnexion` appels ; les
 * dix files s'exécutent en même temps (une connexion de `pg` ne porte qu'une requête à la fois).
 */
let concurrents: DbClient[] | undefined;
async function enParallele<T>(parConnexion: number, appel: (client: DbClient) => Promise<T>): Promise<T[]> {
  concurrents ??= await Promise.all(Array.from({ length: 10 }, () => connect("app")));
  const files = await Promise.all(
    concurrents.map(async (client) => {
      const rendus: T[] = [];
      for (let i = 0; i < parConnexion; i++) rendus.push(await appel(client));
      return rendus;
    }),
  );
  return files.flat();
}

/** Recule d'un jour tout ce qui est stocké : pour la base, « demain » est arrivé. */
async function passerAuLendemain(): Promise<void> {
  await admin.query("UPDATE public.prevente_reponses_jour SET jour = jour - 1");
  await admin.query("UPDATE public.prevente_reponses SET jour = jour - 1");
  await admin.query("UPDATE public.prevente_visites SET jour = jour - 1");
}

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
  releve = await connect("admin");
  await releve.query("SET SESSION AUTHORIZATION vadrouille_prevente_releve");
});

beforeEach(vider);

afterAll(async () => {
  await vider();
  await closeAll();
  await supprimerBases();
});

describe("prévente: identité des connexions éprouvées", () => {
  it("vadrouille_app et vadrouille_prevente_releve, sans superutilisateur ni BYPASSRLS", async () => {
    for (const [client, role] of [
      [app, "vadrouille_app"],
      [releve, "vadrouille_prevente_releve"],
    ] as const) {
      const { rows } = await client.query(
        `SELECT session_user::text AS session, current_user::text AS courant, r.rolsuper, r.rolbypassrls
         FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`,
      );
      expect(rows[0], role).toEqual({ session: role, courant: role, rolsuper: false, rolbypassrls: false });
    }
  });
});

describe("prévente: compter une visite (B2, B3)", () => {
  it("une visite : une ligne pour le jour UTC de la base et la provenance, visites = 1 ; la fonction ne rend rien", async () => {
    const { rows } = await app.query(`${COMPTER} AS rendu`, ["forum"]);
    expect(rows).toEqual([{ rendu: "" }]);
    const lignes = await admin.query(`SELECT (jour = ${JOUR}) AS aujourdhui, src, visites FROM public.prevente_visites`);
    expect(lignes.rows).toEqual([{ aujourdhui: true, src: "forum", visites: 1 }]);
  });

  it("B2 : 50 appels concurrents (10 connexions, 5 appels chacune) pour le même jour et la même provenance donnent visites = 50, une seule ligne", async () => {
    await enParallele(5, (client) => client.query(COMPTER, ["groupe"]));
    const { rows } = await admin.query("SELECT src, visites FROM public.prevente_visites");
    expect(rows).toEqual([{ src: "groupe", visites: 50 }]);
  });

  it("chaque provenance de la liste a sa ligne ; deux appels de la même s'additionnent", async () => {
    for (const src of PREVENTE_PROVENANCES) await app.query(COMPTER, [src]);
    await app.query(COMPTER, ["direct"]);
    const { rows } = await admin.query("SELECT src, visites FROM public.prevente_visites ORDER BY src");
    expect(rows).toEqual([...PREVENTE_PROVENANCES].sort().map((src) => ({ src, visites: src === "direct" ? 2 : 1 })));
  });

  it.each(["interne", "inconnu-123", "FORUM", "", " forum"])("B3 : la provenance « %s » est refusée par la base (23514), rien n'est écrit", async (src) => {
    const refus = await erreur(app, COMPTER, [src]);
    expect(refus).toMatchObject({ code: "23514", constraint: "prevente_visites_src_check" });
    // L'erreur ne cite ni la ligne refusée ni la valeur reçue (RLS activée : PostgreSQL retient le détail).
    expect(refus?.detail).toBeUndefined();
    expect(refus?.message).toBe('new row for relation "prevente_visites" violates check constraint "prevente_visites_src_check"');
    expect(await compte("prevente_visites")).toBe(0);
  });

  it("une provenance absente est refusée (23502)", async () => {
    expect(await erreur(app, COMPTER, [null])).toMatchObject({ code: "23502" });
    expect(await compte("prevente_visites")).toBe(0);
  });

  it("B3, table elle-même : interne, un nombre nul et une provenance hors liste sont refusés même au rôle de test", async () => {
    for (const [src, visites, contrainte] of [
      ["interne", 1, "prevente_visites_src_check"],
      ["zzz", 1, "prevente_visites_src_check"],
      ["forum", 0, "prevente_visites_visites_check"],
      ["forum", -3, "prevente_visites_visites_check"],
    ] as const) {
      const refus = await erreur(admin, `INSERT INTO public.prevente_visites (jour, src, visites) VALUES (${JOUR}, $1, $2)`, [src, visites]);
      expect(refus, `${src} ${visites}`).toMatchObject({ code: "23514", constraint: contrainte });
    }
  });
});

describe("prévente: enregistrer une réponse (B3)", () => {
  it("une réponse complète du parcours visite : verdict « admise », une ligne aux codes reçus, jour UTC de la base, compteur à 1", async () => {
    const verdict = await enregistrer(app, {
      src: "instagram-pub",
      parcours: "visite",
      destination: "Lisbonne",
      periode: "paques",
      preparation: ["guides-blogs", "assistant"],
      motifs: ["prix", "attendre"],
      decouverte: "ami",
    });
    expect(verdict).toBe("admise");
    const { rows } = await admin.query(
      `SELECT (jour = ${JOUR}) AS aujourdhui, src, parcours, destination, periode, preparation, motifs, decouverte,
              (id::text ~ '^[0-9a-f-]{36}$') AS id_uuid FROM public.prevente_reponses`,
    );
    expect(rows).toEqual([
      {
        aujourdhui: true,
        src: "instagram-pub",
        parcours: "visite",
        destination: "Lisbonne",
        periode: "paques",
        preparation: ["assistant", "guides-blogs"],
        motifs: ["attendre", "prix"],
        decouverte: "ami",
        id_uuid: true,
      },
    ]);
    expect(await compteurDuJour()).toBe(1);
  });

  it("une seule réponse suffit, pour chaque question ; listes absentes rendues vides, doublons retirés", async () => {
    const cas: Reponse[] = [
      { destination: "Rome" },
      { periode: "sans-date" },
      { preparation: ["autre", "autre", "agence"] },
      { parcours: "precommande", motifs: ["adresses-sourcees"] },
      { decouverte: "connait-createur" },
    ];
    for (const reponse of cas) expect(await enregistrer(app, reponse)).toBe("admise");
    expect(await compte("prevente_reponses")).toBe(cas.length);
    const { rows } = await admin.query("SELECT preparation, motifs FROM public.prevente_reponses WHERE preparation <> '{}'");
    expect(rows).toEqual([{ preparation: ["agence", "autre"], motifs: [] }]);
  });

  it("tous les codes des listes fermées sont admis, pour les deux parcours", async () => {
    for (const periode of PREVENTE_PERIODES) expect(await enregistrer(app, { periode })).toBe("admise");
    for (const decouverte of PREVENTE_DECOUVERTES) expect(await enregistrer(app, { decouverte })).toBe("admise");
    expect(await enregistrer(app, { preparation: [...PREVENTE_PREPARATIONS] })).toBe("admise");
    expect(await enregistrer(app, { parcours: "precommande", motifs: [...PREVENTE_MOTIFS.precommande] })).toBe("admise");
    expect(await enregistrer(app, { parcours: "visite", motifs: [...PREVENTE_MOTIFS.visite] })).toBe("admise");
    for (const src of PREVENTE_PROVENANCES) expect(await enregistrer(app, { src, periode: "paques" })).toBe("admise");
  });

  // Un parcours hors liste viole aussi la cohérence des motifs : PostgreSQL nomme la première contrainte par ordre de nom.
  const REFUS: [string, Reponse, string | RegExp][] = [
    ["src interne", { src: "interne", periode: "paques" }, "prevente_reponses_src_check"],
    ["src hors liste", { src: "inconnu-123", periode: "paques" }, "prevente_reponses_src_check"],
    ["parcours hors liste", { parcours: "autre", periode: "paques" }, /^prevente_reponses_(motifs|parcours)_check$/],
    ["période hors liste", { periode: "ete" }, "prevente_reponses_periode_check"],
    ["préparation hors liste", { preparation: ["guides-blogs", "podcast"] }, "prevente_reponses_preparation_check"],
    ["préparation avec un élément nul", { preparation: ["guides-blogs", null] }, "prevente_reponses_preparation_check"],
    ["découverte hors liste", { decouverte: "television" }, "prevente_reponses_decouverte_check"],
    ["motifs du parcours visite dans une précommande", { parcours: "precommande", motifs: ["pas-de-voyage"] }, "prevente_reponses_motifs_check"],
    ["motifs du parcours précommande dans une visite", { parcours: "visite", motifs: ["adresses-sourcees"] }, "prevente_reponses_motifs_check"],
    ["motifs hors des deux listes", { parcours: "visite", motifs: ["meteo"] }, "prevente_reponses_motifs_check"],
    ["destination de 81 caractères", { destination: "x".repeat(81) }, "prevente_reponses_destination_check"],
    ["destination vide", { destination: "" }, "prevente_reponses_destination_check"],
    ["destination faite d'espaces", { destination: "   " }, "prevente_reponses_destination_check"],
    ["destination avec un saut de ligne", { destination: "Lisbonne\n::warning::x" }, "prevente_reponses_destination_check"],
    ["destination avec une tabulation", { destination: "Lis\tbonne" }, "prevente_reponses_destination_check"],
    ["destination avec DEL (U+007F)", { destination: "Lis\u007Fbonne" }, "prevente_reponses_destination_check"],
    ["destination avec un contrôle C1 (U+0085)", { destination: "Lis\u0085bonne" }, "prevente_reponses_destination_check"],
    ["destination avec un contrôle C1 (U+009B)", { destination: "Lis\u009Bbonne" }, "prevente_reponses_destination_check"],
    ["destination avec une inversion du sens d'écriture (U+202E)", { destination: "Lis\u202Ebonne" }, "prevente_reponses_destination_check"],
    ["destination avec un isolat de sens d'écriture (U+2066)", { destination: "\u2066Lisbonne" }, "prevente_reponses_destination_check"],
    ["destination avec une espace de largeur nulle (U+200B)", { destination: "Lis\u200Bbonne" }, "prevente_reponses_destination_check"],
    ["destination avec un liant de largeur nulle (U+200D)", { destination: "Lis\u200Dbonne" }, "prevente_reponses_destination_check"],
    ["destination avec un séparateur de ligne (U+2028)", { destination: "Lis\u2028bonne" }, "prevente_reponses_destination_check"],
    ["destination avec une marque d'ordre des octets (U+FEFF)", { destination: "\uFEFFLisbonne" }, "prevente_reponses_destination_check"],
    ["réponse entièrement vide", {}, "prevente_reponses_non_vide_check"],
    ["réponse vide aux listes vides", { preparation: [], motifs: [] }, "prevente_reponses_non_vide_check"],
  ];

  it.each(REFUS)("B3 : %s : refusé par la base (23514), ni ligne ni compteur consommé", async (_nom, reponse, contrainte) => {
    const refus = await erreur(app, ENREGISTRER, parametres(reponse));
    expect(refus?.code).toBe("23514");
    expect(refus?.constraint).toMatch(contrainte);
    expect(await compte("prevente_reponses")).toBe(0);
    expect(await compte("prevente_reponses_jour")).toBe(0);
  });

  it("provenance ou parcours absents : refusés (23502), rien n'est écrit", async () => {
    expect(await erreur(app, ENREGISTRER, parametres({ src: null, periode: "paques" }))).toMatchObject({ code: "23502" });
    expect(await erreur(app, ENREGISTRER, parametres({ parcours: null, periode: "paques" }))).toMatchObject({ code: "23502" });
    expect(await compte("prevente_reponses")).toBe(0);
    expect(await compte("prevente_reponses_jour")).toBe(0);
  });

  it("une destination de 80 caractères est admise, comme les lettres accentuées, l'espace insécable, l'apostrophe et les écritures non latines ; un refus ne cite jamais le texte saisi", async () => {
    expect(await enregistrer(app, { destination: "é".repeat(80) })).toBe("admise");
    for (const destination of ["São Tomé", "L\u2019Île\u00A0d\u2019Yeu", "Zürich – Genève", "東京", "Αθήνα", "القاهرة", "Saint-Jean-de-Luz (64)"]) {
      expect(await enregistrer(app, { destination }), destination).toBe("admise");
    }
    const texte = "Texte-saisi-a-ne-jamais-citer";
    const refus = await erreur(app, ENREGISTRER, parametres({ src: "interne", destination: texte }));
    expect(refus?.code).toBe("23514");
    expect(JSON.stringify(refus)).not.toContain(texte);
    expect(refus?.detail).toBeUndefined();
  });

  it("B3, table elle-même : les mêmes refus pour le rôle de test, sans passer par la fonction", async () => {
    const INSERER = `INSERT INTO public.prevente_reponses (jour, src, parcours, destination, periode, preparation, motifs, decouverte)
       VALUES (${JOUR}, $1, $2, $3, $4, COALESCE($5::text[], '{}'), COALESCE($6::text[], '{}'), $7)`;
    for (const [nom, reponse, contrainte] of REFUS) {
      const refus = await erreur(admin, INSERER, parametres(reponse));
      expect(refus?.code, nom).toBe("23514");
      expect(refus?.constraint, nom).toMatch(contrainte);
    }
    expect(await compte("prevente_reponses")).toBe(0);
  });
});

describe("prévente: plafond du jour, dans la base (B6)", () => {
  it("plafond de test de 3 : trois « admise », le quatrième verdict est « plafond_atteint », sans ligne ; le compteur reste à 3", async () => {
    const verdicts: string[] = [];
    for (let i = 0; i < 4; i++) verdicts.push(await enregistrer(app, { periode: "paques" }, 3));
    expect(verdicts).toEqual(["admise", "admise", "admise", "plafond_atteint"]);
    expect(await compte("prevente_reponses")).toBe(3);
    expect(await compteurDuJour()).toBe(3);
  });

  it("20 appels concurrents (10 connexions, 2 appels chacune), plafond de 3 : jamais plus de trois lignes, 17 verdicts « plafond_atteint »", async () => {
    const verdicts = await enParallele(2, (client) => enregistrer(client, { decouverte: "ami" }, 3));
    expect(verdicts.filter((v) => v === "admise")).toHaveLength(3);
    expect(verdicts.filter((v) => v === "plafond_atteint")).toHaveLength(17);
    expect(await compte("prevente_reponses")).toBe(3);
    expect(await compteurDuJour()).toBe(3);
  });

  it("le lendemain (jour reculé dans la base), l'écriture reprend avec un compteur neuf", async () => {
    for (let i = 0; i < 3; i++) await enregistrer(app, { periode: "paques" }, 3);
    expect(await enregistrer(app, { periode: "paques" }, 3)).toBe("plafond_atteint");
    await passerAuLendemain();
    expect(await enregistrer(app, { periode: "ascension" }, 3)).toBe("admise");
    expect(await compteurDuJour()).toBe(1);
    const { rows } = await admin.query(`SELECT (${JOUR} - jour) AS age, count(*)::int AS n FROM public.prevente_reponses GROUP BY 1 ORDER BY 1`);
    expect(rows).toEqual([
      { age: 0, n: 1 },
      { age: 1, n: 3 },
    ]);
  });

  it("plafond par défaut : 200 ; au compteur 200, le verdict est « plafond_atteint » et rien n'est écrit", async () => {
    expect(PREVENTE_PLAFOND_REPONSES_JOUR).toBe(200);
    await admin.query(`INSERT INTO public.prevente_reponses_jour (jour, reponses) VALUES (${JOUR}, 199)`);
    expect(await enregistrer(app, { periode: "paques" })).toBe("admise");
    expect(await enregistrer(app, { periode: "paques" })).toBe("plafond_atteint");
    expect(await compteurDuJour()).toBe(200);
    expect(await compte("prevente_reponses")).toBe(1);
  });

  it.each([0, -1, 201, 100000, null])("plafond %s : hors bornes (1 à 200), appel refusé (22023), rien n'est écrit", async (plafond) => {
    expect(await erreur(app, ENREGISTRER_PLAFOND, [...parametres({ periode: "paques" }), plafond])).toMatchObject({ code: "22023" });
    expect(await compte("prevente_reponses")).toBe(0);
    expect(await compte("prevente_reponses_jour")).toBe(0);
  });

  it("la table du compteur refuse elle-même 0 et 201 (borne haute tenue par la base)", async () => {
    for (const n of [0, 201]) {
      const refus = await erreur(admin, `INSERT INTO public.prevente_reponses_jour (jour, reponses) VALUES (${JOUR}, $1)`, [n]);
      expect(refus, String(n)).toMatchObject({ code: "23514", constraint: "prevente_reponses_jour_reponses_check" });
    }
  });

  it("une réponse refusée par une contrainte ne consomme pas le plafond", async () => {
    await enregistrer(app, { periode: "paques" }, 3);
    await erreur(app, ENREGISTRER_PLAFOND, [...parametres({ src: "interne", periode: "paques" }), 3]);
    await erreur(app, ENREGISTRER_PLAFOND, [...parametres({}), 3]);
    expect(await compteurDuJour()).toBe(1);
    expect(await enregistrer(app, { periode: "paques" }, 3)).toBe("admise");
    expect(await enregistrer(app, { periode: "paques" }, 3)).toBe("admise");
    expect(await enregistrer(app, { periode: "paques" }, 3)).toBe("plafond_atteint");
  });
});

describe("prévente: droits des rôles (B4)", () => {
  const INSTRUCTIONS: Record<(typeof TABLES)[number], string[]> = {
    prevente_visites: [
      "SELECT 1 FROM public.prevente_visites",
      "SELECT count(*) FROM public.prevente_visites",
      `INSERT INTO public.prevente_visites (jour, src, visites) VALUES (${JOUR}, 'forum', 1)`,
      "UPDATE public.prevente_visites SET visites = visites + 1",
      "UPDATE public.prevente_visites SET visites = 1",
      "DELETE FROM public.prevente_visites",
      "TRUNCATE public.prevente_visites",
    ],
    prevente_reponses_jour: [
      "SELECT 1 FROM public.prevente_reponses_jour",
      "SELECT reponses FROM public.prevente_reponses_jour",
      `INSERT INTO public.prevente_reponses_jour (jour, reponses) VALUES (${JOUR}, 1)`,
      "UPDATE public.prevente_reponses_jour SET reponses = 1",
      "DELETE FROM public.prevente_reponses_jour",
      "TRUNCATE public.prevente_reponses_jour",
    ],
    prevente_reponses: [
      "SELECT 1 FROM public.prevente_reponses",
      "SELECT destination FROM public.prevente_reponses",
      "SELECT id FROM public.prevente_reponses",
      `INSERT INTO public.prevente_reponses (jour, src, parcours, periode) VALUES (${JOUR}, 'forum', 'visite', 'paques')`,
      "UPDATE public.prevente_reponses SET destination = NULL",
      "DELETE FROM public.prevente_reponses",
      "TRUNCATE public.prevente_reponses",
    ],
  };
  const CAS = TABLES.flatMap((table) => INSTRUCTIONS[table].map((sql) => [table, sql] as const));

  beforeEach(async () => {
    await app.query(COMPTER, ["forum"]);
    await enregistrer(app, { destination: "Lisbonne" });
  });

  it.each(CAS)("vadrouille_app, %s : « %s » refusé (42501)", async (_table, sql) => {
    expect(await erreur(app, sql)).toMatchObject({ code: "42501" });
  });

  it.each(CAS)("vadrouille_prevente_releve, %s : « %s » refusé (42501)", async (_table, sql) => {
    expect(await erreur(releve, sql)).toMatchObject({ code: "42501" });
  });

  it("vadrouille_app : EXECUTE sur les deux fonctions d'écriture seulement, aucune fonction de relevé", async () => {
    for (const fonction of FN_RELEVE) {
      expect(await erreur(app, `SELECT * FROM public.${fonction.replace("()", "")}()`), fonction).toMatchObject({ code: "42501" });
    }
    const { rows } = await app.query(
      `SELECT p.proname FROM pg_catalog.pg_proc p WHERE p.proname LIKE 'prevente\\_%' AND pg_catalog.has_function_privilege('vadrouille_app', p.oid, 'EXECUTE') ORDER BY 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["prevente_compter_visite", "prevente_enregistrer_reponse"]);
  });

  it("vadrouille_prevente_releve : EXECUTE sur les trois fonctions de relevé seulement ; les fonctions d'écriture lui sont refusées", async () => {
    expect(await erreur(releve, COMPTER, ["forum"])).toMatchObject({ code: "42501" });
    expect(await erreur(releve, ENREGISTRER, parametres({ periode: "paques" }))).toMatchObject({ code: "42501" });
    for (const fonction of FN_RELEVE) expect(await erreur(releve, `SELECT * FROM public.${fonction.replace("()", "")}()`), fonction).toBeUndefined();
    const { rows } = await admin.query(
      `SELECT p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND pg_catalog.has_function_privilege('vadrouille_prevente_releve', p.oid, 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["prevente_releve_destinations", "prevente_releve_reponses", "prevente_releve_visites"]);
  });

  it("vadrouille_prevente_releve : aucun droit sur aucune table ni vue (public et prototype), aucune appartenance, sans connexion, aucun rôle de connexion ne peut le prendre", async () => {
    const droits = await admin.query(
      `SELECT n.nspname || '.' || c.relname AS rel FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S') AND n.nspname IN ('public', 'prototype', 'vadrouille_migrations')
         AND (pg_catalog.has_table_privilege('vadrouille_prevente_releve', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR pg_catalog.has_any_column_privilege('vadrouille_prevente_releve', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))`,
    );
    expect(droits.rows).toEqual([]);
    const appartenances = await admin.query(
      `SELECT r.rolname AS role, m.rolname AS membre FROM pg_catalog.pg_auth_members am
       JOIN pg_catalog.pg_roles r ON r.oid = am.roleid JOIN pg_catalog.pg_roles m ON m.oid = am.member
       WHERE r.rolname = 'vadrouille_prevente_releve' OR m.rolname = 'vadrouille_prevente_releve'`,
    );
    expect(appartenances.rows).toEqual([]);
    const attributs = await admin.query(
      "SELECT rolcanlogin, rolconnlimit, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_catalog.pg_roles WHERE rolname = 'vadrouille_prevente_releve'",
    );
    expect(attributs.rows).toEqual([{ rolcanlogin: false, rolconnlimit: -1, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false }]);
    for (const login of ["app", "auth", "migrator", "p0", "p0_purge", "coords_purge"] as const) {
      const client = await connect(login);
      expect(await erreur(client, "SET ROLE vadrouille_prevente_releve"), login).toMatchObject({ code: "42501" });
    }
    for (const role of ["vadrouille_app", "vadrouille_owner", "vadrouille_fn_prevente", "vadrouille_fn_prevente_releve"]) {
      expect(await erreur(releve, `SET ROLE ${role}`), role).toMatchObject({ code: "42501" });
    }
  });

  it("droits de table exacts : les deux propriétaires de fonctions seulement, au plus juste ; ni DELETE ni TRUNCATE pour personne", async () => {
    const { rows } = await admin.query(
      `SELECT c.relname AS tbl, r.rolname AS role,
              ARRAY(SELECT p FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p
                    WHERE pg_catalog.has_table_privilege(r.oid, c.oid, p)) AS droits,
              ARRAY(SELECT p || ':' || a.attname FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS p, pg_catalog.pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                      AND NOT pg_catalog.has_table_privilege(r.oid, c.oid, p) AND pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, p)
                    ORDER BY 1) AS colonnes
       FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
       WHERE c.oid = ANY ($1::regclass[]) AND r.rolname LIKE 'vadrouille\\_%' AND r.rolname NOT IN ('vadrouille_owner', 'vadrouille_migrator')
       ORDER BY 1, 2`,
      [TABLES.map((t) => `public.${t}`)],
    );
    const avecDroits = rows.filter((r) => r.droits.length > 0 || r.colonnes.length > 0).map((r) => [r.tbl, r.role, r.droits, r.colonnes]);
    expect(avecDroits).toEqual([
      ["prevente_reponses", "vadrouille_fn_prevente", ["INSERT"], []],
      [
        "prevente_reponses",
        "vadrouille_fn_prevente_releve",
        [],
        ["SELECT:decouverte", "SELECT:destination", "SELECT:motifs", "SELECT:parcours", "SELECT:periode", "SELECT:preparation", "SELECT:src"],
      ],
      ["prevente_reponses_jour", "vadrouille_fn_prevente", ["SELECT", "INSERT"], ["UPDATE:reponses"]],
      ["prevente_visites", "vadrouille_fn_prevente", ["SELECT", "INSERT"], ["UPDATE:visites"]],
      ["prevente_visites", "vadrouille_fn_prevente_releve", ["SELECT"], []],
    ]);
    const publics = await admin.query(
      `SELECT c.relname FROM pg_catalog.pg_class c WHERE c.oid = ANY ($1::regclass[])
       AND pg_catalog.has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
      [TABLES.map((t) => `public.${t}`)],
    );
    expect(publics.rows).toEqual([]);
  });

  it("RLS activée et forcée sur les trois tables ; politiques exactes ; le propriétaire lit zéro ligne", async () => {
    const rls = await admin.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity, pg_catalog.pg_get_userbyid(relowner) AS owner FROM pg_catalog.pg_class WHERE oid = ANY ($1::regclass[]) ORDER BY 1",
      [TABLES.map((t) => `public.${t}`)],
    );
    expect(rls.rows).toEqual(
      [...TABLES].sort().map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true, owner: "vadrouille_owner" })),
    );
    const politiques = await admin.query(
      `SELECT tablename, policyname, permissive, roles::text[] AS roles, cmd, qual, with_check FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = ANY ($1) ORDER BY tablename COLLATE "C", policyname COLLATE "C"`,
      [TABLES],
    );
    expect(politiques.rows.map((p) => [p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check])).toEqual([
      ["prevente_reponses", "prevente_reponses_fn_prevente_insert", "PERMISSIVE", ["vadrouille_fn_prevente"], "INSERT", null, "true"],
      ["prevente_reponses", "prevente_reponses_fn_prevente_releve", "PERMISSIVE", ["vadrouille_fn_prevente_releve"], "SELECT", "true", null],
      ["prevente_reponses_jour", "prevente_reponses_jour_fn_prevente_insert", "PERMISSIVE", ["vadrouille_fn_prevente"], "INSERT", null, "true"],
      ["prevente_reponses_jour", "prevente_reponses_jour_fn_prevente_select", "PERMISSIVE", ["vadrouille_fn_prevente"], "SELECT", "true", null],
      ["prevente_reponses_jour", "prevente_reponses_jour_fn_prevente_update", "PERMISSIVE", ["vadrouille_fn_prevente"], "UPDATE", "true", "true"],
      ["prevente_visites", "prevente_visites_fn_prevente_insert", "PERMISSIVE", ["vadrouille_fn_prevente"], "INSERT", null, "true"],
      ["prevente_visites", "prevente_visites_fn_prevente_releve", "PERMISSIVE", ["vadrouille_fn_prevente_releve"], "SELECT", "true", null],
      ["prevente_visites", "prevente_visites_fn_prevente_select", "PERMISSIVE", ["vadrouille_fn_prevente"], "SELECT", "true", null],
      ["prevente_visites", "prevente_visites_fn_prevente_update", "PERMISSIVE", ["vadrouille_fn_prevente"], "UPDATE", "true", "true"],
    ]);
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      for (const table of TABLES) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n), table).toBe(0);
      }
    } finally {
      await migrator.query("ROLLBACK");
    }
    expect(await compte("prevente_reponses")).toBe(1);
  });

  it("fonctions : SECURITY DEFINER, search_path figé, propriétaire et EXECUTE exacts, PUBLIC exclu ; types de retour des écritures : void et text", async () => {
    const { rows } = await admin.query(
      `SELECT p.oid::regprocedure::text AS fonction, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
              p.prorettype::regtype::text AS retour, p.provolatile,
              ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r
                    WHERE r.rolname <> pg_catalog.pg_get_userbyid(p.proowner) AND NOT r.rolsuper
                      AND r.rolname NOT LIKE 'pg\\_%' AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE') ORDER BY 1) AS execute,
              pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') AS public
       FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'prevente\\_%' ORDER BY 1`,
    );
    const CONFIG = ["search_path=pg_catalog, pg_temp"];
    const attendu = (fonction: string, owner: string, retour: string, provolatile: string, execute: string[]) => ({
      fonction,
      owner,
      prosecdef: true,
      proconfig: CONFIG,
      retour,
      provolatile,
      execute,
      public: false,
    });
    expect(rows).toEqual([
      attendu("prevente_compter_visite(text)", "vadrouille_fn_prevente", "void", "v", ["vadrouille_app"]),
      attendu("prevente_enregistrer_reponse(text,text,text,text,text[],text[],text,integer)", "vadrouille_fn_prevente", "text", "v", ["vadrouille_app"]),
      attendu("prevente_releve_destinations()", "vadrouille_fn_prevente_releve", "record", "s", ["vadrouille_prevente_releve"]),
      attendu("prevente_releve_reponses()", "vadrouille_fn_prevente_releve", "record", "s", ["vadrouille_prevente_releve"]),
      attendu("prevente_releve_visites()", "vadrouille_fn_prevente_releve", "record", "s", ["vadrouille_prevente_releve"]),
    ]);
    expect(FN_ECRITURE).toHaveLength(2);
  });

  it("les fonctions d'écriture ne rendent aucune donnée stockée : rien pour une visite, le verdict seul pour une réponse", async () => {
    await vider();
    await admin.query(`INSERT INTO public.prevente_visites (jour, src, visites) VALUES (${JOUR}, 'forum', 41)`);
    expect((await app.query(`${COMPTER} AS rendu`, ["forum"])).rows).toEqual([{ rendu: "" }]);
    const verdicts = new Set<string>();
    for (let i = 0; i < 3; i++) verdicts.add(await enregistrer(app, { destination: `Ville ${i}` }, 2));
    expect([...verdicts].sort()).toEqual(["admise", "plafond_atteint"]);
  });
});

describe("prévente: aucune organisation ne lit ni n'écrit ces tables (isolation)", () => {
  it("deux organisations, chacune dans son contexte : même refus (42501) sur les trois tables ; les compteurs sont globaux et sans organisation", async () => {
    const auth = await connect("auth");
    const [a, b] = [await createOrg(auth), await createOrg(auth)];
    for (const org of [a, b]) {
      await inTx(app, { org: org.org, user: org.owner }, async (c) => {
        await c.query(COMPTER, ["proches"]);
        for (const table of TABLES) {
          await c.query("SAVEPOINT s");
          await expect(c.query(`SELECT 1 FROM public.${table}`), `${table}`).rejects.toMatchObject({ code: "42501" });
          await c.query("ROLLBACK TO SAVEPOINT s");
        }
      });
    }
    // Les deux visites tombent dans la même ligne : aucune colonne ne porte d'organisation ni de personne.
    expect((await admin.query("SELECT src, visites FROM public.prevente_visites")).rows).toEqual([{ src: "proches", visites: 2 }]);
    const colonnes = await admin.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY ($1) AND column_name IN ('organization_id', 'user_id')`,
      [TABLES],
    );
    expect(colonnes.rows[0].n).toBe(0);
  });
});

describe("prévente: colonnes figées (B5)", () => {
  it("les trois tables n'ont que ces colonnes : ni adresse IP, ni agent utilisateur, ni heure, ni identifiant de paiement ou de session", async () => {
    const { rows } = await admin.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY ($1) ORDER BY table_name COLLATE "C", ordinal_position`,
      [TABLES],
    );
    expect(rows.map((r) => `${r.table_name}.${r.column_name} ${r.data_type === "ARRAY" ? r.udt_name : r.data_type}${r.is_nullable === "YES" ? " null" : ""}`)).toEqual([
      "prevente_reponses.id uuid",
      "prevente_reponses.jour date",
      "prevente_reponses.src text",
      "prevente_reponses.parcours text",
      "prevente_reponses.destination text null",
      "prevente_reponses.periode text null",
      "prevente_reponses.preparation _text",
      "prevente_reponses.motifs _text",
      "prevente_reponses.decouverte text null",
      "prevente_reponses_jour.jour date",
      "prevente_reponses_jour.reponses integer",
      "prevente_visites.jour date",
      "prevente_visites.src text",
      "prevente_visites.visites integer",
    ]);
    // Aucun type d'heure, d'adresse réseau ni de document libre ; `destination` est le seul texte hors liste fermée.
    const types = new Set(rows.map((r) => r.udt_name as string));
    expect([...types].sort()).toEqual(["_text", "date", "int4", "text", "uuid"]);
    const textes = await admin.query(
      `SELECT c.conrelid::regclass::text AS tbl, c.conname FROM pg_catalog.pg_constraint c
       WHERE c.contype = 'c' AND c.conrelid = ANY ($1::regclass[]) ORDER BY 1, 2`,
      [TABLES.map((t) => `public.${t}`)],
    );
    expect(textes.rows.map((r) => r.conname)).toEqual([
      "prevente_reponses_decouverte_check",
      "prevente_reponses_destination_check",
      "prevente_reponses_motifs_check",
      "prevente_reponses_non_vide_check",
      "prevente_reponses_parcours_check",
      "prevente_reponses_periode_check",
      "prevente_reponses_preparation_check",
      "prevente_reponses_src_check",
      "prevente_reponses_jour_reponses_check",
      "prevente_visites_src_check",
      "prevente_visites_visites_check",
    ]);
  });

  it("aucun déclencheur, aucune clé étrangère, aucun index hors des clés primaires", async () => {
    const regs = TABLES.map((t) => `public.${t}`);
    expect((await admin.query("SELECT tgname FROM pg_catalog.pg_trigger WHERE tgrelid = ANY ($1::regclass[]) AND NOT tgisinternal", [regs])).rows).toEqual([]);
    expect((await admin.query("SELECT conname FROM pg_catalog.pg_constraint WHERE contype = 'f' AND (conrelid = ANY ($1::regclass[]) OR confrelid = ANY ($1::regclass[]))", [regs])).rows).toEqual([]);
    const index = await admin.query("SELECT indexrelid::regclass::text AS nom FROM pg_catalog.pg_index WHERE indrelid = ANY ($1::regclass[]) ORDER BY 1", [regs]);
    expect(index.rows.map((r) => r.nom)).toEqual(["prevente_reponses_jour_pkey", "prevente_reponses_pkey", "prevente_visites_pkey"]);
  });
});

describe("prévente: fonctions de relevé (B7 ; nombres attendus sur un jeu connu)", () => {
  it("B7 : les types rendus ne sont que bigint, date et le domaine prevente_code ; aucun paramètre d'entrée", async () => {
    const { rows } = await admin.query(
      `SELECT p.proname, p.pronargs, p.proretset,
              ARRAY(SELECT n || ' ' || t::regtype::text FROM unnest(p.proargnames, p.proallargtypes) AS a(n, t)) AS sorties,
              ARRAY(SELECT DISTINCT m::text FROM unnest(p.proargmodes) AS m) AS modes
       FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'prevente\\_releve\\_%' ORDER BY 1`,
    );
    expect(rows).toEqual([
      { proname: "prevente_releve_destinations", pronargs: 0, proretset: true, sorties: ["reponses_avec_destination bigint", "destinations_citees_deux_fois bigint"], modes: ["t"] },
      { proname: "prevente_releve_reponses", pronargs: 0, proretset: true, sorties: ["rubrique prevente_code", "code prevente_code", "reponses bigint"], modes: ["t"] },
      { proname: "prevente_releve_visites", pronargs: 0, proretset: true, sorties: ["semaine date", "src prevente_code", "visites bigint"], modes: ["t"] },
    ]);
    const types = new Set(rows.flatMap((r) => (r.sorties as string[]).map((s) => s.split(" ")[1])));
    expect([...types].sort()).toEqual(["bigint", "date", "prevente_code"]);
  });

  it("B7 : le domaine prevente_code n'admet que les codes des listes fermées et les rubriques ; un texte saisi ne passe pas", async () => {
    const { rows } = await admin.query(
      `SELECT t.typbasetype::regtype::text AS base, pg_catalog.pg_get_userbyid(t.typowner) AS owner, pg_catalog.pg_get_constraintdef(c.oid) AS def
       FROM pg_catalog.pg_type t JOIN pg_catalog.pg_constraint c ON c.contypid = t.oid
       WHERE t.oid = 'public.prevente_code'::regtype`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base: "text", owner: "vadrouille_owner" });
    const dansDomaine = [...(rows[0].def as string).matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
    expect([...dansDomaine].sort()).toEqual([...PREVENTE_CODES].sort());
    expect(new Set(dansDomaine).size).toBe(dansDomaine.length);
    for (const code of PREVENTE_CODES) expect(await erreur(releve, "SELECT $1::public.prevente_code", [code]), code).toBeUndefined();
    for (const texte of ["Lisbonne", "lisbonne", "::warning::x", "interne", "", "Forum", "prix "]) {
      expect(await erreur(releve, "SELECT $1::public.prevente_code", [texte]), texte).toMatchObject({ code: "23514" });
    }
  });

  it("visites : par semaine (lundi, jours UTC) et par provenance ; les totaux s'en déduisent", async () => {
    // 2026-11-02 est un lundi, 2026-11-08 un dimanche, 2026-11-09 le lundi suivant.
    await admin.query(
      `INSERT INTO public.prevente_visites (jour, src, visites) VALUES
         ('2026-11-02', 'forum', 3), ('2026-11-08', 'forum', 4), ('2026-11-08', 'direct', 10),
         ('2026-11-09', 'forum', 5), ('2026-11-11', 'autre', 1), ('2026-11-15', 'instagram-pub', 2)`,
    );
    const { rows } = await releve.query("SELECT semaine::text AS semaine, src::text AS src, visites::int AS visites FROM public.prevente_releve_visites()");
    expect(rows).toEqual([
      { semaine: "2026-11-02", src: "direct", visites: 10 },
      { semaine: "2026-11-02", src: "forum", visites: 7 },
      { semaine: "2026-11-09", src: "autre", visites: 1 },
      { semaine: "2026-11-09", src: "forum", visites: 5 },
      { semaine: "2026-11-09", src: "instagram-pub", visites: 2 },
    ]);
    expect(rows.reduce((somme, r) => somme + (r.visites as number), 0)).toBe(25);
  });

  it("réponses : total, provenances, parcours et codes des questions 2 à 5 ; une réponse compte une fois par code", async () => {
    await enregistrer(app, { src: "forum", parcours: "visite", destination: "Lisbonne", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix"], decouverte: "ami" });
    await enregistrer(app, { src: "forum", parcours: "visite", periode: "paques", motifs: ["prix", "attendre"] });
    await enregistrer(app, { src: "direct", parcours: "precommande", periode: "plus-tard", preparation: ["assistant"], motifs: ["prix", "evenements"], decouverte: "ami" });
    await enregistrer(app, { src: "proches", parcours: "precommande", decouverte: "connait-createur" });
    const { rows } = await releve.query("SELECT rubrique::text AS rubrique, code::text AS code, reponses::int AS reponses FROM public.prevente_releve_reponses()");
    expect(rows.map((r) => `${r.rubrique} ${r.code ?? "-"} ${r.reponses}`)).toEqual([
      "total - 4",
      "src direct 1",
      "src forum 2",
      "src proches 1",
      "parcours precommande 2",
      "parcours visite 2",
      "periode paques 2",
      "periode plus-tard 1",
      "preparation agence 1",
      "preparation assistant 2",
      "motifs-precommande evenements 1",
      "motifs-precommande prix 1",
      "motifs-visite attendre 1",
      "motifs-visite prix 2",
      "decouverte ami 2",
      "decouverte connait-createur 1",
    ]);
  });

  it("sans aucune donnée : aucune visite, une ligne total à 0, deux zéros", async () => {
    expect((await releve.query("SELECT * FROM public.prevente_releve_visites()")).rows).toEqual([]);
    expect((await releve.query("SELECT rubrique::text, code::text, reponses::int FROM public.prevente_releve_reponses()")).rows).toEqual([
      { rubrique: "total", code: null, reponses: 0 },
    ]);
    expect((await releve.query("SELECT reponses_avec_destination::int AS a, destinations_citees_deux_fois::int AS b FROM public.prevente_releve_destinations()")).rows).toEqual([
      { a: 0, b: 0 },
    ]);
  });

  it("question 1 : deux nombres seulement ; Lisbonne, « lisbonne » entouré d'espaces, Rome et deux fois ::warning::x donnent 5 et 2, et aucun texte ne sort", async () => {
    // Jeu du critère E2 (C2e), posé par le rôle de test : « lisbonne » entouré d'espaces n'est pas nettoyé ici.
    for (const destination of ["Lisbonne", " lisbonne ", "Rome", "::warning::x", "::warning::x"]) {
      await admin.query(`INSERT INTO public.prevente_reponses (jour, src, parcours, destination) VALUES (${JOUR}, 'forum', 'visite', $1)`, [destination]);
    }
    await enregistrer(app, { periode: "paques" });
    const sorties: unknown[] = [];
    for (const fonction of FN_RELEVE) sorties.push((await releve.query(`SELECT * FROM public.${fonction.replace("()", "")}()`)).rows);
    expect(sorties[2]).toEqual([{ reponses_avec_destination: "5", destinations_citees_deux_fois: "2" }]);
    const texte = JSON.stringify(sorties).toLowerCase();
    for (const interdit of ["lisbonne", "rome", "::warning"]) expect(texte, interdit).not.toContain(interdit);
  });

  it("le rôle du relevé n'obtient aucune destination par une autre requête", async () => {
    await enregistrer(app, { destination: "Lisbonne" });
    for (const sql of [
      "SELECT destination FROM public.prevente_reponses",
      "SELECT * FROM public.prevente_reponses",
      "SELECT count(*) FROM public.prevente_reponses WHERE destination LIKE 'L%'",
      "COPY public.prevente_reponses TO STDOUT",
    ]) {
      expect(await erreur(releve, sql), sql).toMatchObject({ code: "42501" });
    }
  });
});

const DOWN_0029 = readFileSync(path.join(process.cwd(), "db/migrations/0029_prevente_mesure.down.sql"), "utf8");

describe("prévente: migration et retour arrière de 0029 (B1, base jetable)", () => {
  it("la migration s'applique sur une base vide après les précédentes ; une seconde exécution ne fait rien ; la descente retire fonctions, domaine, politiques et droits, et garde les tables et leurs lignes", async () => {
    const nom = await creerBase("prevente_retour");
    const env = { VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) };
    const premiere = await runMigrations(env);
    expect(premiere.applied.at(-1)).toBe("0029_prevente_mesure");
    expect(premiere.skipped).toEqual([]);
    const seconde = await runMigrations(env);
    expect(seconde.applied).toEqual([]);
    expect(seconde.skipped).toEqual(premiere.applied);

    const [appJ, adminJ, migrateur] = await Promise.all([connectBaseJetable("app", nom), connectBaseJetable("admin", nom), connectBaseJetable("migrator", nom)]);
    await appJ.query(COMPTER, ["forum"]);
    expect(await enregistrer(appJ, { destination: "Lisbonne", periode: "paques" })).toBe("admise");

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0029);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");

    // Plus de fonctions ni de domaine : le compteur et l'envoi échouent fermés.
    expect(await erreur(appJ, COMPTER, ["forum"])).toMatchObject({ code: "42883" });
    expect(await erreur(appJ, ENREGISTRER, parametres({ periode: "paques" }))).toMatchObject({ code: "42883" });
    const restes = await adminJ.query(
      `SELECT (SELECT count(*)::int FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'prevente\\_%') AS fonctions,
              (SELECT count(*)::int FROM pg_catalog.pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'prevente_code') AS domaines,
              (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE tablename = ANY ($1)) AS politiques`,
      [TABLES],
    );
    expect(restes.rows[0]).toEqual({ fonctions: 0, domaines: 0, politiques: 0 });
    // Aucune donnée supprimée ; RLS toujours activée et forcée ; plus aucun droit pour les rôles vadrouille_* hors propriétaire.
    expect((await adminJ.query("SELECT src, visites FROM public.prevente_visites")).rows).toEqual([{ src: "forum", visites: 1 }]);
    expect((await adminJ.query("SELECT destination, periode FROM public.prevente_reponses")).rows).toEqual([{ destination: "Lisbonne", periode: "paques" }]);
    expect((await adminJ.query("SELECT reponses FROM public.prevente_reponses_jour")).rows).toEqual([{ reponses: 1 }]);
    const rls = await adminJ.query(
      "SELECT relrowsecurity AND relforcerowsecurity AS forcee FROM pg_catalog.pg_class WHERE oid = ANY ($1::regclass[])",
      [TABLES.map((t) => `public.${t}`)],
    );
    expect(rls.rows).toEqual([{ forcee: true }, { forcee: true }, { forcee: true }]);
    const droits = await adminJ.query(
      `SELECT r.rolname FROM pg_catalog.pg_roles r, unnest($1::regclass[]) AS t(oid)
       WHERE r.rolname LIKE 'vadrouille\\_%' AND r.rolname NOT IN ('vadrouille_owner', 'vadrouille_migrator')
         AND (pg_catalog.has_table_privilege(r.oid, t.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR pg_catalog.has_any_column_privilege(r.oid, t.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))`,
      [TABLES.map((t) => `public.${t}`)],
    );
    expect(droits.rows).toEqual([]);
    // Les appartenances temporaires de la descente sont retirées : vadrouille_migrator ne peut prendre aucun des deux rôles.
    for (const role of ["vadrouille_fn_prevente", "vadrouille_fn_prevente_releve"]) {
      expect(await erreur(migrateur, `SET ROLE ${role}`), role).toMatchObject({ code: "42501" });
    }
  });
});
