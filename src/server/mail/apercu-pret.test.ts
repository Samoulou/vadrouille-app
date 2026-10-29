// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type CanonicalEmail, parseEmailAddress } from "@/server/email";

import { type ApercuPretClient, type ApercuPretPool, type CompositionNotifications, envoyerApercuPret, SQL_EXECUTION_PUBLIEE, SQL_RECLAMATION } from "./apercu-pret";
import { disabledNotificationMailer } from "./disabled";
import { type ApercuPretMessage, CodeMailerCapError, CodeMailerRefusalError, type NotificationMailer, PlafondIndisponibleError } from "./port";

/**
 * E-mail « propositions prêtes » (M7a, PR 870) sur une **base simulée** (pool injecté qui joue les requêtes du module) et un
 * port double : idempotence par la réclamation, ordre des requêtes, issues fermées, échec jamais levé, journal sans valeur.
 * Le même chemin sur la vraie base et le vrai Mailpit est dans `tests/db/apercu-pret.test.ts`.
 */

const ORG = "00000000-0000-4000-8000-0000000000a1";
const RUN = "00000000-0000-4000-8000-0000000000b2";
const TRIP = "00000000-0000-4000-8000-0000000000c3";
const AUTEUR = "00000000-0000-4000-8000-0000000000d4";
const ORIGINE = "http://127.0.0.1:3999";
const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};
const ADRESSE = canonique("voyageuse-sentinelle@exemple.test");

/** Base simulée : une exécution publiée, réclamable une seule fois (comme l'écriture conditionnelle de Postgres). */
function base(options: { publiee?: boolean; email?: unknown; echoue?: "connect" | "lecture" | "reclamation"; reclamationPerdue?: boolean } = {}) {
  const etat = { reclamee: false, transactions: [] as string[][] };
  const pool: ApercuPretPool = {
    async connect(): Promise<ApercuPretClient> {
      if (options.echoue === "connect") throw new Error("connexion refusée");
      const requetes: string[] = [];
      etat.transactions.push(requetes);
      return {
        async query(texte: string, valeurs: unknown[] = []) {
          requetes.push(texte.startsWith("SELECT pg_catalog.set_config") ? `${texte.includes("organization_id") ? "org" : "user"}=${String(valeurs[0])}` : texte);
          if (texte === SQL_EXECUTION_PUBLIEE) {
            if (options.echoue === "lecture") throw new Error("lecture impossible");
            expect(valeurs).toEqual([ORG, RUN]);
            return { rows: options.publiee === false ? [] : [{ trip_id: TRIP, created_by: AUTEUR, reclamee: etat.reclamee }] };
          }
          if (texte.startsWith("SELECT email FROM public.users")) return { rows: options.email === undefined ? [{ email: ADRESSE }] : options.email === null ? [] : [{ email: options.email }] };
          if (texte === SQL_RECLAMATION) {
            if (options.echoue === "reclamation") throw new Error("écriture impossible");
            if (etat.reclamee || options.reclamationPerdue) return { rows: [] };
            etat.reclamee = true;
            return { rows: [{ id: RUN }] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  return { pool, etat };
}

function port(comportement: (message: ApercuPretMessage) => Promise<void> = async () => undefined) {
  const sendApercuPret = vi.fn(comportement);
  const mailer: NotificationMailer = { sendApercuPret };
  const composer = vi.fn((): CompositionNotifications => ({ mailer, origine: ORIGINE }));
  return { sendApercuPret, composer };
}

let espions: ReturnType<typeof vi.spyOn>[];
const sortie = () => espions.flatMap((espion) => espion.mock.calls.flat()).map(String);
const evenements = () => sortie().map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

beforeEach(() => {
  espions = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ENTREE = { organizationId: ORG, generationRunId: RUN };

describe("email: « propositions prêtes », idempotence (PR 870)", () => {
  it("exécution publiée : lecture, adresse, réclamation dans une transaction validée, puis un seul envoi avec l'adresse, l'origine et le voyage", async () => {
    const { pool, etat } = base();
    const { sendApercuPret, composer } = port();
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("sent");
    expect(sendApercuPret).toHaveBeenCalledTimes(1);
    expect(sendApercuPret).toHaveBeenCalledWith({ to: ADRESSE, origine: ORIGINE, tripId: TRIP });
    expect(etat.transactions).toEqual([["BEGIN", `org=${ORG}`, SQL_EXECUTION_PUBLIEE, `user=${AUTEUR}`, "SELECT email FROM public.users WHERE id = $1", SQL_RECLAMATION, "COMMIT"]]);
  });

  it("deuxième appel (reprise du workflow ou de l'étape) : déjà réclamée, aucun envoi, aucune écriture", async () => {
    const { pool, etat } = base();
    const { sendApercuPret, composer } = port();
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("sent");
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("already_sent");
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("already_sent");
    expect(sendApercuPret).toHaveBeenCalledTimes(1);
    expect(etat.transactions[1]).toEqual(["BEGIN", `org=${ORG}`, SQL_EXECUTION_PUBLIEE, "ROLLBACK"]);
  });

  it("appels concurrents : une seule réclamation réussit, un seul envoi", async () => {
    const { pool } = base();
    const { sendApercuPret, composer } = port();
    const issues = await Promise.all(Array.from({ length: 5 }, () => envoyerApercuPret(ENTREE, { pool, composer })));
    expect(issues.filter((i) => i === "sent")).toHaveLength(1);
    expect(issues.filter((i) => i === "already_sent")).toHaveLength(4);
    expect(sendApercuPret).toHaveBeenCalledTimes(1);
  });

  it("réclamation perdue après la lecture (concurrent gagnant) : already_sent, ROLLBACK, aucun envoi", async () => {
    const { pool, etat } = base({ reclamationPerdue: true });
    const { sendApercuPret, composer } = port();
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("already_sent");
    expect(etat.transactions[0]?.at(-1)).toBe("ROLLBACK");
    expect(sendApercuPret).not.toHaveBeenCalled();
  });

  it("la réclamation n'écrit que updated_at, strictement après finished_at, sur une ligne preview publiée non réclamée", () => {
    expect(SQL_RECLAMATION).toMatch(/^UPDATE public\.generation_runs\nSET updated_at = GREATEST\(pg_catalog\.clock_timestamp\(\), finished_at \+ interval '1 millisecond'\)\n/);
    expect(SQL_RECLAMATION).toContain("kind = 'preview' AND phase IN ('ready', 'incomplete') AND updated_at = finished_at");
    expect(SQL_RECLAMATION.split("\n").filter((ligne) => / = /.test(ligne) && !ligne.startsWith("WHERE"))).toHaveLength(1);
  });
});

describe("email: « propositions prêtes », issues sans envoi (PR 870)", () => {
  it("exécution absente, non publiée ou d'une autre organisation : not_ready, aucun envoi", async () => {
    const { pool } = base({ publiee: false });
    const { sendApercuPret, composer } = port();
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("not_ready");
    expect(await envoyerApercuPret({ organizationId: "pas-un-uuid", generationRunId: RUN }, { pool, composer })).toBe("not_ready");
    expect(sendApercuPret).not.toHaveBeenCalled();
  });

  it("adresse absente ou non canonique : no_address, email.address_refused sans valeur, rien n'est réclamé", async () => {
    for (const email of [null, "Voyageuse-SENTINELLE@Exemple.test ", 42]) {
      const { pool, etat } = base({ email });
      const { sendApercuPret, composer } = port();
      expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("no_address");
      expect(sendApercuPret).not.toHaveBeenCalled();
      expect(etat.reclamee).toBe(false);
      expect(etat.transactions[0]).not.toContain(SQL_RECLAMATION);
    }
    expect(evenements()).toEqual(Array.from({ length: 3 }, () => ({ level: "warn", event: "email.address_refused" })));
    expect(sortie().join("\n")).not.toContain("SENTINELLE");
  });

  it("port désactivé ou origine nulle : disabled, email.transport_disabled, aucune lecture de la base", async () => {
    const { pool, etat } = base();
    expect(await envoyerApercuPret(ENTREE, { pool, composer: () => ({ mailer: disabledNotificationMailer, origine: ORIGINE }) })).toBe("disabled");
    const { sendApercuPret } = port();
    expect(await envoyerApercuPret(ENTREE, { pool, composer: () => ({ mailer: { sendApercuPret }, origine: null }) })).toBe("disabled");
    expect(etat.transactions).toEqual([]);
    expect(sendApercuPret).not.toHaveBeenCalled();
    expect(evenements().map((e) => e.event)).toEqual(["email.transport_disabled", "email.transport_disabled"]);
  });
});

describe("email: « propositions prêtes », échec jamais bloquant (PR 870)", () => {
  it.each([["connect"], ["lecture"], ["reclamation"]] as const)("base en échec (%s) : failed, email.notification_failed avec errorName seul, rien de levé", async (echoue) => {
    const { pool } = base({ echoue });
    const { sendApercuPret, composer } = port();
    await expect(envoyerApercuPret(ENTREE, { pool, composer })).resolves.toBe("failed");
    expect(sendApercuPret).not.toHaveBeenCalled();
    expect(evenements()).toEqual([{ level: "warn", event: "email.notification_failed", errorName: "Error" }]);
  });

  it("composition refusée (configuration invalide) : failed, rien de levé, aucune lecture", async () => {
    const { pool, etat } = base();
    const erreur = Object.assign(new Error("SENTINELLE"), { name: "ServerEnvError" });
    await expect(envoyerApercuPret(ENTREE, { pool, composer: () => { throw erreur; } })).resolves.toBe("failed");
    expect(etat.transactions).toEqual([]);
    expect(evenements()).toEqual([{ level: "warn", event: "email.notification_failed", errorName: "ServerEnvError" }]);
  });

  it("plafond atteint : cap_reached, aucun événement de plus (le port l'écrit), la réclamation reste (au plus un e-mail)", async () => {
    const { pool, etat } = base();
    const { composer } = port(async () => {
      throw new CodeMailerCapError();
    });
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("cap_reached");
    expect(etat.reclamee).toBe(true);
    expect(evenements()).toEqual([]);
    expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("already_sent");
  });

  it("refus déjà journalisés (adresse, enveloppe, Resend) : failed sans second événement ; panne du transport ou plafond indisponible : un événement", async () => {
    const nommee = (name: string) => Object.assign(new Error("SENTINELLE"), { name });
    for (const erreur of [new CodeMailerRefusalError(), nommee("ResendRefusError"), nommee("ResendEnvoiError")]) {
      const { pool } = base();
      const { composer } = port(async () => {
        throw erreur;
      });
      expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("failed");
    }
    expect(evenements()).toEqual([]);
    for (const erreur of [nommee("SmtpEnvoiError"), new PlafondIndisponibleError()]) {
      const { pool } = base();
      const { composer } = port(async () => {
        throw erreur;
      });
      expect(await envoyerApercuPret(ENTREE, { pool, composer })).toBe("failed");
    }
    expect(evenements()).toEqual([
      { level: "warn", event: "email.notification_failed", errorName: "SmtpEnvoiError" },
      { level: "warn", event: "email.notification_failed", errorName: "PlafondIndisponibleError" },
    ]);
    expect(sortie().join("\n")).not.toContain("SENTINELLE");
  });
});
