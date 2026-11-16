import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { nettoyerDestinationPrevente, PREVENTE_PLAFOND_REPONSES_JOUR, type PreventeReponse } from "@/contracts/prevente-mesure";
import { RATE_LIMITS } from "@/server/config/limites";
import { ACTION_LIMITEUR_QUESTIONNAIRE, envoyerQuestionnaire, type DependancesQuestionnaire } from "@/server/prevente/questionnaire";
import { creerReponsesPrevente, type ReponsesPrevente } from "@/server/prevente/reponses";
import { createRateLimiter, type RateLimiter, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";

import { createDatabase } from "../../db/index";
import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Envoi du questionnaire de la prévente sur une vraie base (spécification `specs/C2-prevente-mesure.md`, § 3.3, § 3.4 et
 * § 4 ; tâche C2c, ticket 1137 ; décision 0177 § 7 et § 11 ; critères C1, C3, C5, C6 et C7 côté base). Le module
 * d'écriture de l'application (`src/server/prevente/reponses.ts`) écrit sous `vadrouille_app`, par le pool gardé de
 * `db/connection.ts` ; le limiteur est le vrai, avec **la règle de `RATE_LIMITS`** ; le rôle de test (`admin`, hors de
 * l'application) ne sert qu'à lire et vider les tables, et à poser le compteur du jour.
 *
 * Plafond : la fonction prend un plafond de test en huitième argument, mais le module de l'application n'en passe que
 * sept (0172 § 1 point 3). Le verdict « plafond_atteint » est donc obtenu ici en posant le compteur du jour, sous le rôle
 * de test ; le plafond de test par argument est éprouvé par `tests/db/prevente-mesure.test.ts` (B6).
 *
 * Les droits, les contraintes et la concurrence de la fonction d'écriture sont éprouvés par
 * `tests/db/prevente-mesure.test.ts` (C2a). Les tables sont globales : chaque test les vide d'abord (fichiers de base
 * exécutés en série). Chaque test tire son secret de limiteur : aucun compteur partagé.
 */

const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
const ENTETE = "x-vercel-forwarded-for";
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const LIGNES = `SELECT (jour = ${JOUR}) AS aujourdhui, src, parcours, destination, periode, preparation, motifs, decouverte FROM public.prevente_reponses ORDER BY src, parcours`;
const TABLES = ["prevente_reponses", "prevente_reponses_jour"] as const;

let admin: DbClient;
let pool: { end(): Promise<void>; query(text: string, values?: unknown[]): Promise<unknown> };
let reponses: ReponsesPrevente;
const pools: { end(): Promise<void> }[] = [];

async function vider(): Promise<void> {
  for (const table of TABLES) await admin.query(`DELETE FROM public.${table}`);
}
const lignes = async () => (await admin.query(LIGNES)).rows as Record<string, unknown>[];
const compte = async () => Number((await admin.query("SELECT count(*)::int AS n FROM public.prevente_reponses")).rows[0]?.n);
const compteurDuJour = async () => (await admin.query(`SELECT reponses FROM public.prevente_reponses_jour WHERE jour = ${JOUR}`)).rows[0]?.reponses as number | undefined;

/** Limiteur réel, configuration de l'application, secret propre au test ; `entete` : nom de l'en-tête de confiance. */
function limiteurReel(entete: string | null): { limiteur: RateLimiter; secret: Buffer } {
  const secret = randomBytes(32);
  const env = { VADROUILLE_ENV: "ci", [HMAC]: secret.toString("base64url"), ...(entete === null ? {} : { TRUSTED_IP_HEADER: entete }) };
  const propre = createDatabase("vadrouille_app").$client;
  pools.push(propre);
  return { limiteur: createRateLimiter({ env, pool: propre }), secret };
}

function dependances(limiteur: RateLimiter): Partial<DependancesQuestionnaire> {
  return {
    ouvert: () => true,
    limiteur: async (headers) => (await limiteur.check({ action: ACTION_LIMITEUR_QUESTIONNAIRE, headers })).ok,
    enregistrer: (reponse) => reponses.enregistrer(reponse),
  };
}

function formulaire(champs: Record<string, string | readonly string[]>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (typeof valeur === "string") donnees.append(cle, valeur);
    else for (const v of valeur) donnees.append(cle, v);
  }
  return donnees;
}

const ENVOI = { src: "forum", parcours: "precommande", destination: "  Lisbonne \n", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" };

beforeAll(async () => {
  admin = await connect("admin");
  // Même fabrique que le module (`createDatabase("vadrouille_app")`, pool gardé), gardée ici pour la fermer.
  pool = createDatabase("vadrouille_app", undefined, { max: 2, connectionTimeoutMillis: 10_000, query_timeout: 10_000 }).$client;
  reponses = creerReponsesPrevente({ creerPool: () => pool });
});

beforeEach(async () => {
  await vider();
  // Le journal du limiteur (compartiment commun) n'encombre pas la sortie.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await vider();
  await pool.end();
  await Promise.all(pools.splice(0).map((p) => p.end().catch(() => undefined)));
  await closeAll();
});

describe("prévente : écriture d'une réponse par l'application, sur la base", () => {
  it("C1 — vadrouille_app écrit une réponse par la seule fonction : une ligne pour le jour UTC de la base, aux codes attendus", async () => {
    const verdict = await reponses.enregistrer({ src: "forum", parcours: "precommande", destination: "Lisbonne", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" });
    expect(verdict).toBe("admise");
    // La fonction range les listes par ordre de code.
    expect(await lignes()).toEqual([
      { aujourdhui: true, src: "forum", parcours: "precommande", destination: "Lisbonne", periode: "paques", preparation: ["agence", "assistant"], motifs: ["demonstration", "prix"], decouverte: "ami" },
    ]);
    expect(await compteurDuJour()).toBe(1);
  });

  it("C1 — la ligne ne contient que l'identifiant, le jour, la provenance, le parcours et les réponses", async () => {
    await reponses.enregistrer({ src: "direct", parcours: "visite", destination: null, periode: null, preparation: [], motifs: ["autre"], decouverte: null });
    const { rows, fields } = await admin.query("SELECT * FROM public.prevente_reponses");
    expect(fields.map((champ) => champ.name).sort()).toEqual(["decouverte", "destination", "id", "jour", "motifs", "parcours", "periode", "preparation", "src"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ src: "direct", parcours: "visite", destination: null, periode: null, preparation: [], motifs: ["autre"], decouverte: null });
  });

  it("C7 — plafond du jour lu sur la vraie fonction : au compteur 199, « admise » puis « plafond_atteint », une seule ligne", async () => {
    await admin.query(`INSERT INTO public.prevente_reponses_jour (jour, reponses) VALUES (${JOUR}, $1)`, [PREVENTE_PLAFOND_REPONSES_JOUR - 1]);
    const reponse: PreventeReponse = { src: "reddit", parcours: "visite", destination: null, periode: "paques", preparation: [], motifs: [], decouverte: null };
    expect(await reponses.enregistrer(reponse)).toBe("admise");
    expect(await reponses.enregistrer(reponse)).toBe("plafond_atteint");
    expect(await compte()).toBe(1);
    expect(await compteurDuJour()).toBe(PREVENTE_PLAFOND_REPONSES_JOUR);
  });

  it("question 1 : une valeur nettoyée de ses caractères de contrôle et de mise en forme passe le CHECK de la base", async () => {
    const c = (...points: number[]) => String.fromCodePoint(...points);
    const brut = `${c(0xfeff)}  Saint${c(0x200b)}-Malo${c(0x2028)}et${c(0x00)} ${c(0x202e)}Cancale${c(0x85)}\t\r\n`;
    const destination = nettoyerDestinationPrevente(brut);
    expect(destination).toBe("Saint-Malo et Cancale");
    expect(await reponses.enregistrer({ src: "direct", parcours: "visite", destination, periode: null, preparation: [], motifs: [], decouverte: null })).toBe("admise");
    expect((await lignes()).map((l) => l.destination)).toEqual(["Saint-Malo et Cancale"]);
    // 80 caractères après nettoyage : admis par la base aussi.
    const long = nettoyerDestinationPrevente(` ${"é".repeat(80)} `);
    expect(await reponses.enregistrer({ src: "direct", parcours: "visite", destination: long, periode: null, preparation: [], motifs: [], decouverte: null })).toBe("admise");
  });

  it("une réponse hors contrat est refusée avant la base : rien n'est écrit, le compteur du jour n'est pas consommé", async () => {
    await expect(reponses.enregistrer({ src: "interne", parcours: "visite", destination: null, periode: "paques", preparation: [], motifs: [], decouverte: null } as never)).rejects.toBeDefined();
    await expect(reponses.enregistrer({ src: "forum", parcours: "visite", destination: null, periode: null, preparation: [], motifs: [], decouverte: null })).rejects.toBeDefined();
    expect(await compte()).toBe(0);
    expect(await compteurDuJour()).toBeUndefined();
  });
});

describe("prévente : envoi du questionnaire de bout en bout (cas d'usage, limiteur réel, fonction d'écriture)", () => {
  it("C1, C3 — un envoi valide : accepté, une ligne ; la question 1 entourée d'espaces et suivie d'un saut de ligne est stockée « Lisbonne »", async () => {
    const { limiteur } = limiteurReel(ENTETE);
    const resultat = await envoyerQuestionnaire(formulaire(ENVOI), new Headers({ [ENTETE]: "192.0.2.10" }), dependances(limiteur));
    expect(resultat).toEqual({ statut: "envoyee" });
    expect(await lignes()).toEqual([
      { aujourdhui: true, src: "forum", parcours: "precommande", destination: "Lisbonne", periode: "paques", preparation: ["agence", "assistant"], motifs: ["demonstration", "prix"], decouverte: "ami" },
    ]);
  });

  it("C3 — une question 1 faite d'espaces est stockée absente", async () => {
    const { limiteur } = limiteurReel(ENTETE);
    await envoyerQuestionnaire(formulaire({ src: "groupe", parcours: "visite", destination: "   \n ", decouverte: "ami" }), new Headers({ [ENTETE]: "192.0.2.11" }), dependances(limiteur));
    expect((await lignes()).map(({ src, destination, decouverte }) => ({ src, destination, decouverte }))).toEqual([{ src: "groupe", destination: null, decouverte: "ami" }]);
  });

  it("C2, C4, C5 — envoi invalide, réponse vide, src=interne : aucune ligne ; seul interne consomme le limiteur", async () => {
    const { limiteur, secret } = limiteurReel(ENTETE);
    const entetes = () => new Headers({ [ENTETE]: "192.0.2.12" });
    expect((await envoyerQuestionnaire(formulaire({ ...ENVOI, periode: "noel" }), entetes(), dependances(limiteur))).statut).toBe("validation_failed");
    expect((await envoyerQuestionnaire(formulaire({ src: "forum", parcours: "visite" }), entetes(), dependances(limiteur))).statut).toBe("reponse_vide");
    expect((await envoyerQuestionnaire(formulaire({ ...ENVOI, src: "interne" }), entetes(), dependances(limiteur))).statut).toBe("envoyee");
    expect(await compte()).toBe(0);
    expect(await compteurDuJour()).toBeUndefined();
    const cle = rateLimitKey(secret, rateLimitMessage(ACTION_LIMITEUR_QUESTIONNAIRE, 3600, "ip/192.0.2.12"));
    expect((await admin.query("SELECT count FROM action_rate_limits WHERE key = $1", [cle])).rows).toEqual([{ count: 1 }]);
  });

  it("C6 — même adresse : cinq envois admis, le sixième rate_limited avec la saisie, aucune sixième ligne ; une autre adresse passe", async () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_QUESTIONNAIRE]).toEqual([{ kind: "ip", windowSeconds: 3600, threshold: 5, noTrustedIpThreshold: 30 }]);
    const { limiteur } = limiteurReel(ENTETE);
    const envoyer = (ip: string) => envoyerQuestionnaire(formulaire(ENVOI), new Headers({ [ENTETE]: ip }), dependances(limiteur));
    const statuts: string[] = [];
    for (let i = 0; i < 6; i += 1) statuts.push((await envoyer("192.0.2.20")).statut);
    expect(statuts).toEqual(["envoyee", "envoyee", "envoyee", "envoyee", "envoyee", "rate_limited"]);
    expect(await envoyer("192.0.2.20")).toEqual({
      statut: "rate_limited",
      saisie: { destination: "Lisbonne", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" },
    });
    expect(await compte()).toBe(5);
    expect((await envoyer("192.0.2.21")).statut).toBe("envoyee");
    expect(await compte()).toBe(6);
  });

  it("C6 — sans en-tête d'adresse de confiance : le sixième envoi est admis, le trentième aussi, le trente et unième est refusé", async () => {
    const { limiteur, secret } = limiteurReel(null);
    const statuts: string[] = [];
    for (let i = 1; i <= 31; i += 1) {
      const entetes = new Headers({ "x-forwarded-for": `198.51.100.${i}`, [ENTETE]: `203.0.113.${i}` });
      statuts.push((await envoyerQuestionnaire(formulaire(ENVOI), entetes, dependances(limiteur))).statut);
    }
    expect(statuts.slice(0, 30)).toEqual(Array.from({ length: 30 }, () => "envoyee"));
    expect(statuts[5]).toBe("envoyee");
    expect(statuts[30]).toBe("rate_limited");
    expect(await compte()).toBe(30);
    // Une seule clé : celle du compartiment commun.
    const cle = rateLimitKey(secret, rateLimitMessage(ACTION_LIMITEUR_QUESTIONNAIRE, 3600, "no-trusted-ip"));
    expect((await admin.query("SELECT count FROM action_rate_limits WHERE key = $1", [cle])).rows).toEqual([{ count: 31 }]);
  });

  it("C6 — en-tête configuré, valeur non analysable : même compartiment commun, même seuil de 30", async () => {
    const { limiteur } = limiteurReel(ENTETE);
    const statuts: string[] = [];
    for (let i = 1; i <= 31; i += 1) {
      const entetes = i % 2 === 0 ? new Headers() : new Headers({ [ENTETE]: "inconnu" });
      statuts.push((await envoyerQuestionnaire(formulaire({ src: "direct", parcours: "visite", periode: "paques" }), entetes, dependances(limiteur))).statut);
    }
    expect(statuts.filter((s) => s === "envoyee")).toHaveLength(30);
    expect(statuts[30]).toBe("rate_limited");
    expect(await compte()).toBe(30);
  });

  it("C7 — plafond du jour atteint : rate_limited comme le limiteur, saisie rendue, aucune ligne de plus ; l'application ne compte rien", async () => {
    await admin.query(`INSERT INTO public.prevente_reponses_jour (jour, reponses) VALUES (${JOUR}, $1)`, [PREVENTE_PLAFOND_REPONSES_JOUR]);
    const { limiteur } = limiteurReel(ENTETE);
    const journal: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
    const resultat = await envoyerQuestionnaire(formulaire(ENVOI), new Headers({ [ENTETE]: "192.0.2.30" }), dependances(limiteur));
    expect(resultat).toEqual({
      statut: "rate_limited",
      saisie: { destination: "Lisbonne", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" },
    });
    expect(await compte()).toBe(0);
    expect(await compteurDuJour()).toBe(PREVENTE_PLAFOND_REPONSES_JOUR);
    const evenements = journal.map((ligne) => JSON.parse(ligne) as { event?: string });
    expect(evenements.filter((e) => e.event?.startsWith("prevente."))).toEqual([{ level: "warn", event: "prevente.plafond_atteint" }]);
  });
});
