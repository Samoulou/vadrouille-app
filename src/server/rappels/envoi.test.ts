import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENTE_APRES_ECHEC_MS } from "@/server/config/rappels";
import { parseEmailAddress, type CanonicalEmail } from "@/server/email";
import { disabledNotificationMailer } from "@/server/mail/disabled";
import { CodeMailerCapError, type NotificationMailer, type RappelVeilleMessage } from "@/server/mail/port";

import { EtatRappelSchema, SuiteRappelSchema, type EtatRappel, type SuiteRappel } from "./etat";
import { reveillerRappel, SQL_ACCORD, SQL_JOURNEE, SQL_RECLAMATION, SQL_RECLAMES, SQL_VOYAGE, type DependancesReveil } from "./envoi";

const journal = vi.hoisted(() => ({
  lignes: [] as { evenement: string; champs: Record<string, unknown> }[],
}));
vi.mock("@/server/log", async (original) => {
  const reel = await original<typeof import("@/server/log")>();
  return {
    ...reel,
    logEvent: (evenement: string, champs: Record<string, unknown>) => void journal.lignes.push({ evenement, champs }),
  };
});

/**
 * Réveil d'une exécution de rappels sans base (M6c, ticket 1021 ; spécification M6 § 5.3, § 6.3 critères 4 à 12 ; décision
 * 0157 § 1.7) : `withOrg` simulé (réponses selon le texte de la requête, réclamations en mémoire), port simulé, horloge
 * injectée. La boucle `derouler` rejoue le workflow (réveil, attente, réveil…) en avançant l'horloge de l'attente rendue.
 */

const ETAT: EtatRappel = {
  organizationId: "0a000000-0000-4000-8000-00000000000a",
  tripId: "0b000000-0000-4000-8000-00000000000b",
  userId: "0c000000-0000-4000-8000-00000000000c",
  consentId: "0d000000-0000-4000-8000-00000000000d",
};
const ADRESSE: CanonicalEmail = (() => {
  const lue = parseEmailAddress("voyageuse@exemple.test");
  if (!lue.ok) throw new Error("adresse de test refusée");
  return lue.email;
})();
const ORIGINE = "http://localhost:3000";
const t = (s: string) => Date.parse(s);

type Base = {
  consentiA: number;
  actif: boolean;
  debloque: boolean;
  enCours: boolean;
  voyage: boolean;
  /** Journées de la version courante : `true` si elle a une étape. */
  jours: Map<number, boolean>;
  reclames: Set<number>;
  email: unknown;
  verifiee: boolean;
  panne?: boolean;
};

function base(partiel: Partial<Base> = {}): Base {
  return {
    consentiA: t("2026-08-20T09:00:00Z"),
    actif: true,
    debloque: true,
    enCours: false,
    voyage: true,
    jours: new Map([1, 2, 3, 4, 5, 6].map((n) => [n, true])),
    reclames: new Set(),
    email: ADRESSE,
    verifiee: true,
    ...partiel,
  };
}

/** Texte et valeurs d'une requête de `executeurSql` (morceaux de drizzle). */
function lire(requete: { queryChunks: unknown[] }): {
  texte: string;
  valeurs: unknown[];
} {
  const morceaux: string[] = [];
  const valeurs: unknown[] = [];
  for (const morceau of requete.queryChunks) {
    const m = morceau as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
    else if (m.queryChunks !== undefined) {
      for (const interne of m.queryChunks) {
        const i = interne as { value?: unknown };
        if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
        else {
          valeurs.push(i.value);
          morceaux.push(`$${valeurs.length}`);
        }
      }
    }
  }
  return { texte: morceaux.join(""), valeurs };
}

function doubleWithOrg(b: Base) {
  const requetes: { texte: string; valeurs: unknown[] }[] = [];
  const withOrg = vi.fn(async (_ctx: unknown, fn: (tx: never) => Promise<unknown>) => {
    if (b.panne === true) throw new Error("SENTINELLE_PANNE voyageuse@exemple.test");
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const { texte, valeurs } = lire(requete);
        requetes.push({ texte, valeurs });
        if (texte === SQL_ACCORD) return { rows: [{ consenti_ms: b.consentiA, actif: b.actif }] };
        if (texte === SQL_VOYAGE)
          return {
            rows: b.voyage
              ? [
                  {
                    start: "2026-08-29",
                    end: "2026-09-03",
                    time_zone: "Europe/London",
                    debloque: b.debloque,
                    en_cours: b.enCours,
                  },
                ]
              : [],
          };
        if (texte === SQL_RECLAMES)
          return {
            rows: [...b.reclames].map((day_index) => ({ day_index })),
          };
        if (texte === SQL_JOURNEE) {
          const jour = b.jours.get(Number(valeurs[2]));
          return { rows: jour === undefined ? [] : [{ a_etape: jour }] };
        }
        if (texte.startsWith("SELECT email, email_verified")) return { rows: [{ email: b.email, email_verified: b.verifiee }] };
        if (texte === SQL_RECLAMATION) {
          const jour = Number(valeurs[3]);
          if (b.reclames.has(jour)) return { rows: [] };
          b.reclames.add(jour);
          return { rows: [{ day_index: jour }] };
        }
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return {
    withOrg: withOrg as unknown as NonNullable<DependancesReveil["withOrg"]>,
    requetes,
  };
}

function banc(b: Base, envoi: (m: RappelVeilleMessage) => Promise<void> = async () => undefined) {
  const envoyes: { message: RappelVeilleMessage; instant: number }[] = [];
  let maintenant = 0;
  const sendRappelVeille = vi.fn(async (message: RappelVeilleMessage) => {
    await envoi(message);
    envoyes.push({ message, instant: maintenant });
  });
  const mailer: NotificationMailer = {
    sendApercuPret: vi.fn(),
    sendRappelVeille,
  };
  const { withOrg, requetes } = doubleWithOrg(b);
  const deps = (): DependancesReveil => ({
    composer: () => ({ mailer, origine: ORIGINE }),
    withOrg,
    maintenant: () => maintenant,
  });
  return {
    envoyes,
    requetes,
    sendRappelVeille,
    reveil: (instant: number) => {
      maintenant = instant;
      return reveillerRappel(ETAT, deps());
    },
    /** Rejoue le workflow depuis `debut` ; `avant` est appelé avant chaque réveil (changer la base à un instant donné). */
    async derouler(debut: number, avant: (instant: number) => void = () => undefined): Promise<SuiteRappel[]> {
      const suites: SuiteRappel[] = [];
      maintenant = debut;
      for (let i = 0; i < 200; i += 1) {
        avant(maintenant);
        const suite = await reveillerRappel(ETAT, deps());
        suites.push(suite);
        if (suite.suite === "fin") return suites;
        maintenant += suite.attenteMs;
      }
      throw new Error("boucle sans fin");
    },
  };
}

beforeEach(() => {
  journal.lignes = [];
});

describe("rappels : réveil (spécification M6 § 5.3)", () => {
  it("critère 4 : accord le 2026-08-20, six e-mails du 2026-08-28 au 2026-09-02 à 17:00Z, aucun le 2026-09-03 ; puis fin", async () => {
    const b = banc(base());
    const suites = await b.derouler(t("2026-08-20T09:00:00Z"));
    expect(b.envoyes.map((e) => new Date(e.instant).toISOString())).toEqual([
      "2026-08-28T17:00:00.000Z",
      "2026-08-29T17:00:00.000Z",
      "2026-08-30T17:00:00.000Z",
      "2026-08-31T17:00:00.000Z",
      "2026-09-01T17:00:00.000Z",
      "2026-09-02T17:00:00.000Z",
    ]);
    expect(b.envoyes.map((e) => e.message.dayIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.envoyes[0]?.message).toEqual({
      to: ADRESSE,
      origine: ORIGINE,
      tripId: ETAT.tripId,
      dayIndex: 1,
    });
    expect(suites.at(-1)).toEqual({ suite: "fin" });
    // Réveils bornés : jamais plus de 24 heures d'attente.
    for (const suite of suites) if (suite.suite === "attendre") expect(suite.attenteMs).toBeLessThanOrEqual(24 * 3_600_000);
    expect(journal.lignes.filter((l) => l.evenement !== "email.sent")).toEqual([]);
  });

  it("critère 5 : accord le 2026-08-30 à 20:00 (Londres) : premier e-mail le 2026-08-31 à 18:00 (veille de J4), aucun rattrapage", async () => {
    const accord = t("2026-08-30T19:00:00Z");
    const b = banc(base({ consentiA: accord }));
    await b.derouler(accord);
    expect(b.envoyes.map((e) => [e.message.dayIndex, new Date(e.instant).toISOString()])).toEqual([
      [4, "2026-08-31T17:00:00.000Z"],
      [5, "2026-09-01T17:00:00.000Z"],
      [6, "2026-09-02T17:00:00.000Z"],
    ]);
  });

  it("critère 6 : retrait le 2026-08-30 à 12:00 : plus aucun e-mail, l'exécution se termine au réveil suivant", async () => {
    const donnees = base();
    const b = banc(donnees);
    const suites = await b.derouler(t("2026-08-20T09:00:00Z"), (instant) => {
      if (instant >= t("2026-08-30T11:00:00Z")) donnees.actif = false;
    });
    expect(b.envoyes.map((e) => e.message.dayIndex)).toEqual([1, 2]);
    expect(suites.at(-1)).toEqual({ suite: "fin" });
  });

  it("critère 7 : journée du lendemain en préparation : pas d'e-mail ce soir-là, envoi repris le soir suivant ; journée absente : idem", async () => {
    const donnees = base({
      enCours: true,
      jours: new Map([1, 2, 3, 4, 5, 6].map((n) => [n, n !== 3])),
    });
    donnees.jours.delete(5);
    const b = banc(donnees);
    await b.derouler(t("2026-08-20T09:00:00Z"));
    expect(b.envoyes.map((e) => e.message.dayIndex)).toEqual([1, 2, 4, 6]);
    // Sans exécution en cours, une journée sans étape n'est pas « en préparation ».
    const sansExecution = banc(base({ jours: new Map([1, 2, 3, 4, 5, 6].map((n) => [n, n !== 3])) }));
    await sansExecution.derouler(t("2026-08-20T09:00:00Z"));
    expect(sansExecution.envoyes.map((e) => e.message.dayIndex)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("critère 8 (rappels: une relance ne double aucun envoi) : reprise après l'envoi, double démarrage, nouvel accord le même jour", async () => {
    const donnees = base();
    const b = banc(donnees);
    const soir = t("2026-08-28T17:00:00.200Z");
    expect(await b.reveil(soir)).toEqual({
      suite: "attendre",
      attenteMs: 24 * 3_600_000 - 200,
    });
    // Reprise de l'étape, et une seconde exécution du même accord, au même instant ou un peu plus tard.
    await b.reveil(soir);
    await b.reveil(soir + 60_000);
    // Accord retiré puis redonné le même jour : la réclamation est par journée, pas par accord.
    donnees.consentiA = t("2026-08-28T16:00:00Z");
    await b.reveil(soir + 120_000);
    expect(b.envoyes.map((e) => e.message.dayIndex)).toEqual([1]);
    expect(b.sendRappelVeille).toHaveBeenCalledTimes(1);
  });

  it("critère 9 : plafond atteint, aucun envoi ce soir-là, la réclamation reste ; e-mail du lendemain envoyé", async () => {
    let plafond = true;
    const b = banc(base(), async () => {
      if (plafond) {
        plafond = false;
        throw new CodeMailerCapError();
      }
    });
    await b.derouler(t("2026-08-27T12:00:00Z"));
    expect(b.envoyes.map((e) => e.message.dayIndex)).toEqual([2, 3, 4, 5, 6]);
    expect(b.sendRappelVeille).toHaveBeenCalledTimes(6);
    expect(journal.lignes.some((l) => l.evenement === "email.notification_failed")).toBe(false);
  });

  it("voyage absent ou plus débloqué, accord d'une autre exécution : fin sans rien lire d'autre ni envoyer", async () => {
    for (const partiel of [{ voyage: false }, { debloque: false }, { actif: false }]) {
      const b = banc(base(partiel));
      expect(await b.reveil(t("2026-08-28T17:00:01Z"))).toEqual({
        suite: "fin",
      });
      expect(b.sendRappelVeille).not.toHaveBeenCalled();
      expect(b.requetes.some((r) => r.texte === SQL_RECLAMATION)).toBe(false);
    }
  });

  it("adresse illisible ou non vérifiée (email_verified faux) : rien n'est réclamé ni envoyé, email.address_refused, suite au soir suivant", async () => {
    for (const partiel of [{ verifiee: false }, { email: " Voyageuse@Exemple.test" }, { email: null }]) {
      journal.lignes = [];
      const b = banc(base(partiel));
      const suite = await b.reveil(t("2026-08-28T17:00:01Z"));
      expect(suite).toEqual({
        suite: "attendre",
        attenteMs: 24 * 3_600_000 - 1_000,
      });
      expect(b.sendRappelVeille).not.toHaveBeenCalled();
      expect(b.requetes.some((r) => r.texte === SQL_RECLAMATION)).toBe(false);
      expect(journal.lignes).toEqual([{ evenement: "email.address_refused", champs: {} }]);
    }
  });

  it("port désactivé (sans transport, ou Resend sans RAPPELS_ENVOI_REEL) ou origine nulle : fin, rien n'est lu", async () => {
    const b = doubleWithOrg(base());
    for (const composition of [
      { mailer: disabledNotificationMailer, origine: ORIGINE },
      {
        mailer: { sendApercuPret: vi.fn(), sendRappelVeille: vi.fn() },
        origine: null,
      },
    ]) {
      expect(
        await reveillerRappel(ETAT, {
          composer: () => composition,
          withOrg: b.withOrg,
          maintenant: () => t("2026-08-28T17:00:01Z"),
        }),
      ).toEqual({ suite: "fin" });
    }
    expect(b.requetes).toEqual([]);
  });

  it("panne de la base ou de la composition : email.notification_failed (errorName seul), attente d'une heure marquée echec", async () => {
    const b = banc(base({ panne: true }));
    expect(await b.reveil(t("2026-08-28T17:00:01Z"))).toEqual({
      suite: "attendre",
      attenteMs: ATTENTE_APRES_ECHEC_MS,
      echec: true,
    });
    expect(
      await reveillerRappel(ETAT, {
        composer: () => {
          throw new Error("SENTINELLE");
        },
      }),
    ).toEqual({
      suite: "attendre",
      attenteMs: ATTENTE_APRES_ECHEC_MS,
      echec: true,
    });
    expect(journal.lignes).toEqual([
      {
        evenement: "email.notification_failed",
        champs: { errorName: "Error" },
      },
      {
        evenement: "email.notification_failed",
        champs: { errorName: "Error" },
      },
    ]);
    expect(JSON.stringify(journal.lignes)).not.toMatch(/SENTINELLE|exemple\.test/);
  });

  it("transport en échec après la réclamation : aucune nouvelle tentative (0138 C4), journal sans valeur", async () => {
    const b = banc(base(), async () => {
      throw new Error("SENTINELLE voyageuse@exemple.test");
    });
    await b.reveil(t("2026-08-28T17:00:01Z"));
    await b.reveil(t("2026-08-28T18:00:01Z"));
    expect(b.sendRappelVeille).toHaveBeenCalledTimes(1);
    expect(journal.lignes).toEqual([
      {
        evenement: "email.notification_failed",
        champs: { errorName: "Error" },
      },
    ]);
  });

  it("critère 11 : état sérialisé strict (identifiants seulement), sortie fin ou attente ; entrée hors contrat : fin sans lecture", async () => {
    expect(EtatRappelSchema.safeParse(ETAT).success).toBe(true);
    for (const champ of ["email", "adresse", "destination", "nom", "placeId", "displayName", "formattedAddress", "lat", "dayIndex"]) {
      expect(
        EtatRappelSchema.safeParse({
          ...ETAT,
          [champ]: "SENTINELLE_ChIJ_sentinelle",
        }).success,
        champ,
      ).toBe(false);
    }
    expect(SuiteRappelSchema.safeParse({ suite: "attendre", attenteMs: 1_000 }).success).toBe(true);
    expect(
      SuiteRappelSchema.safeParse({
        suite: "attendre",
        attenteMs: 1_000,
        dayIndex: 2,
      }).success,
    ).toBe(false);
    expect(SuiteRappelSchema.safeParse({ suite: "fin", email: ADRESSE }).success).toBe(false);
    const b = doubleWithOrg(base());
    const composer = vi.fn();
    expect(await reveillerRappel({ ...ETAT, email: ADRESSE }, { composer, withOrg: b.withOrg })).toEqual({ suite: "fin" });
    expect(composer).not.toHaveBeenCalled();
    // Chaque sortie d'un déroulé complet respecte le contrat, sans aucune valeur personnelle.
    const banc4 = banc(base());
    const suites = await banc4.derouler(t("2026-08-20T09:00:00Z"));
    for (const suite of suites) expect(SuiteRappelSchema.safeParse(suite).success).toBe(true);
    expect(JSON.stringify(suites)).not.toMatch(/exemple\.test|Europe|2026/);
  });

  it("requêtes : organisation, voyage et personne de l'état sérialisé en paramètres liés ; réclamation des quatre colonnes de la clé", async () => {
    const b = banc(base());
    await b.reveil(t("2026-08-28T17:00:01Z"));
    expect(b.requetes.find((r) => r.texte === SQL_ACCORD)?.valeurs).toEqual([ETAT.organizationId, ETAT.tripId, ETAT.userId, ETAT.consentId]);
    expect(b.requetes.find((r) => r.texte === SQL_RECLAMATION)?.valeurs).toEqual([ETAT.organizationId, ETAT.tripId, ETAT.userId, 1]);
    expect(SQL_RECLAMATION).toMatch(/\(organization_id, trip_id, user_id, day_index\)/);
  });
});
