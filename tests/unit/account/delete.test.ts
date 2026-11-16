// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiErrorSchema } from "@/contracts";
import * as messages from "@/i18n/messages";
import {
  ACTION_LIMITEUR_SUPPRESSION,
  creerSuppressionCompte,
  deciderSuppression,
  type DependancesActionSuppression,
  type EtatCompte,
  identifiantDeVerification,
  PAIEMENT_EN_ATTENTE_S,
  type PortsSuppression,
  type ResultatSuppression,
  SQL_PAIEMENT_EN_ATTENTE,
  supprimerMonCompte,
  TENTATIVES_SUPPRESSION,
} from "@/server/account/delete";
import { creerControleConnexionRecente } from "@/server/account/reauthentification";
import { RATE_LIMITS } from "@/server/config/limites";
import { type CanonicalEmail, parseEmailAddress, rateLimitEmailKey } from "@/server/email";
import { EXPIRATION_SESSION_S } from "@/server/payment/stripe";
import { clesDeLaPersonne, createRateLimiter, OubliLimiteurError, type RateLimitClient, type RateLimitPool, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";

/**
 * « Supprimer mon compte », sans base (spécification M9 § 6.3, tests unitaires : ordre des étapes, reprise, horloge ;
 * ticket 1106, M9b). Le cas d'usage est éprouvé sur des ports simulés qui tiennent un petit état (ce qui reste à
 * supprimer) ; les tests de base réels sont `tests/db/suppression-compte.test.ts`.
 */

const ORG = "0d000000-0000-4000-8000-0000000000a2";
const MOI = "0d000000-0000-4000-8000-0000000000b2";
const SESSION = "0d000000-0000-4000-8000-0000000000c2";
const CTX = { organizationId: ORG, userId: MOI };
const EMAIL = "samuel-m9b@exemple.test";

const SEUL: EtatCompte = { existe: true, email: EMAIL, role: "owner", autresMembres: 0, autresProprietes: 0, personnelle: true };

type NomPort = keyof PortsSuppression;

/** Ports simulés : journal des appels, état minimal, panne programmable par port. */
function portsSimules(depart: EtatCompte = SEUL, dejaEnSuppression = false) {
  const journal: string[] = [];
  const pannes = new Map<NomPort, number>();
  let etat: EtatCompte = depart;
  let paiement = false;
  // Marque « suppression en cours » de l'organisation : hors de `EtatCompte`, lue par la seule reprise.
  let enSuppression = dejaEnSuppression;
  const passer = (nom: NomPort) => {
    journal.push(nom);
    const restantes = pannes.get(nom) ?? 0;
    if (restantes > 0) {
      pannes.set(nom, restantes - 1);
      throw new Error("panne injectée");
    }
  };
  const ports: PortsSuppression = {
    async etat() {
      passer("etat");
      return etat;
    },
    async organisationEnSuppression() {
      passer("organisationEnSuppression");
      return etat.existe && enSuppression ? ORG : null;
    },
    async purger() {
      passer("purger");
      if (paiement) return "paiement_en_attente";
      enSuppression = true;
      return "purge";
    },
    async supprimerSessions() {
      passer("supprimerSessions");
    },
    async supprimerComptes() {
      passer("supprimerComptes");
    },
    async supprimerVerifications(email) {
      passer("supprimerVerifications");
      expect(email).toBe(EMAIL);
    },
    async oublierLimiteur(personne) {
      passer("oublierLimiteur");
      expect(personne).toEqual({ email: EMAIL, userId: MOI });
    },
    async supprimerAdhesionsEtPersonne() {
      passer("supprimerAdhesionsEtPersonne");
      etat = { existe: false };
    },
    async retirerAdhesion() {
      passer("retirerAdhesion");
    },
  };
  return {
    ports,
    journal,
    panne: (nom: NomPort, fois: number) => pannes.set(nom, fois),
    paiementEnAttente: (valeur: boolean) => {
      paiement = valeur;
    },
    etat: () => etat,
    enSuppression: () => enSuppression,
  };
}

const ETAPES = ["etat", "purger", "supprimerSessions", "supprimerComptes", "supprimerVerifications", "oublierLimiteur", "supprimerAdhesionsEtPersonne"];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deciderSuppression (M9-PO-2 ; handover § 12)", () => {
  it.each([
    ["personne absente", { existe: false }, "absent"],
    ["propriétaire seul d'une organisation personnelle", SEUL, "suppression"],
    ["aucune adhésion à l'organisation du contexte", { ...SEUL, role: null }, "forbidden"],
    ["propriétaire d'une organisation à deux membres", { ...SEUL, autresMembres: 1 }, "forbidden"],
    ["conseiller d'une organisation partagée", { ...SEUL, role: "member", autresMembres: 1 }, "retrait"],
    ["adhésion `member` sans autre membre (état incohérent)", { ...SEUL, role: "member" }, "forbidden"],
    ["organisation qui n'est pas personnelle", { ...SEUL, personnelle: false }, "forbidden"],
    ["propriétaire d'une autre organisation", { ...SEUL, autresProprietes: 1 }, "forbidden"],
  ] as const)("%s → %s", (_cas, etat, attendu) => {
    expect(deciderSuppression(etat as EtatCompte)).toBe(attendu);
  });
});

describe("supprimer : ordre des étapes (handover § 12, étapes 1 et 2)", () => {
  it("état, purge, sessions, comptes, vérifications, limiteur, puis adhésions et personne ; rien d'autre", async () => {
    const simule = portsSimules();
    expect(await creerSuppressionCompte(simule.ports).supprimer(CTX)).toEqual({ ok: true, issue: "supprime" });
    expect(simule.journal).toEqual(ETAPES);
    expect(simule.etat()).toEqual({ existe: false });
  });

  it("paiement en attente : refus après la seule étape 1, rien d'autre n'est appelé, aucune relance", async () => {
    const simule = portsSimules();
    simule.paiementEnAttente(true);
    expect(await creerSuppressionCompte(simule.ports).supprimer(CTX)).toEqual({ ok: false, code: "paiement_en_attente" });
    expect(simule.journal).toEqual(["etat", "purger"]);
    expect(simule.etat()).toEqual(SEUL);
  });

  it.each([
    ["propriétaire d'une organisation à deux membres", { ...SEUL, autresMembres: 1 }],
    ["aucune adhésion", { ...SEUL, role: null }],
  ] as const)("%s : forbidden, aucune écriture", async (_cas, etat) => {
    const simule = portsSimules(etat as EtatCompte);
    expect(await creerSuppressionCompte(simule.ports).supprimer(CTX)).toEqual({ ok: false, code: "forbidden" });
    expect(simule.journal).toEqual(["etat"]);
  });

  it("conseiller d'une organisation partagée : seule son adhésion est retirée, sans purge ni suppression d'authentification", async () => {
    const simule = portsSimules({ ...SEUL, role: "member", autresMembres: 1 });
    expect(await creerSuppressionCompte(simule.ports).supprimer(CTX)).toEqual({ ok: true, issue: "adhesion_retiree" });
    expect(simule.journal).toEqual(["etat", "retirerAdhesion"]);
  });

  it("decision : lecture seule de l'état", async () => {
    const simule = portsSimules();
    expect(await creerSuppressionCompte(simule.ports).decision(CTX)).toBe("suppression");
    expect(simule.journal).toEqual(["etat"]);
  });
});

describe("supprimer : reprise et idempotence (§ 4.3)", () => {
  it("rejoué après la fin : aucune erreur, aucune écriture", async () => {
    const simule = portsSimules();
    const compte = creerSuppressionCompte(simule.ports);
    await compte.supprimer(CTX);
    simule.journal.length = 0;
    expect(await compte.supprimer(CTX)).toEqual({ ok: true, issue: "deja_supprime" });
    expect(simule.journal).toEqual(["etat"]);
  });

  it.each(["purger", "supprimerSessions", "supprimerComptes", "supprimerVerifications", "oublierLimiteur", "supprimerAdhesionsEtPersonne"] as const)(
    "une panne de `%s` : la relance interne rejoue les étapes 1 et 2 depuis le début et termine",
    async (port) => {
      const simule = portsSimules();
      simule.panne(port, 1);
      expect(await creerSuppressionCompte(simule.ports).supprimer(CTX)).toEqual({ ok: true, issue: "supprime" });
      expect(simule.journal).toEqual([...ETAPES.slice(0, ETAPES.indexOf(port) + 1), ...ETAPES]);
    },
  );

  it("panne tenace entre deux suppressions de l'étape 2 : l'erreur remonte après deux tentatives ; un nouvel appel termine", async () => {
    expect(TENTATIVES_SUPPRESSION).toBe(2);
    const simule = portsSimules();
    const compte = creerSuppressionCompte(simule.ports);
    simule.panne("supprimerComptes", 2);
    await expect(compte.supprimer(CTX)).rejects.toThrow("panne injectée");
    const avant = ETAPES.slice(0, ETAPES.indexOf("supprimerComptes") + 1);
    expect(simule.journal).toEqual([...avant, ...avant]);
    // L'organisation est en suppression, la personne existe encore : rien n'est perdu pour la reprise.
    expect(simule.etat()).toMatchObject({ existe: true });
    expect(simule.enSuppression()).toBe(true);
    simule.journal.length = 0;
    expect(await compte.supprimer(CTX)).toEqual({ ok: true, issue: "supprime" });
    expect(simule.journal).toEqual(ETAPES);
  });

  it("reprendre (verifyCode) : sans effet hors suppression en cours ; sinon rejoue les étapes pour l'organisation personnelle", async () => {
    const calme = portsSimules();
    await creerSuppressionCompte(calme.ports).reprendre(MOI);
    expect(calme.journal).toEqual(["organisationEnSuppression"]);

    const enCours = portsSimules(SEUL, true);
    await creerSuppressionCompte(enCours.ports).reprendre(MOI);
    expect(enCours.journal).toEqual(["organisationEnSuppression", ...ETAPES]);
    expect(enCours.etat()).toEqual({ existe: false });
  });
});

describe("base : textes des requêtes", () => {
  it("la durée d'un paiement en attente est celle de la session de paiement chez Stripe", () => {
    expect(PAIEMENT_EN_ATTENTE_S).toBe(EXPIRATION_SESSION_S);
    expect(SQL_PAIEMENT_EN_ATTENTE).toContain("c.status = 'pending'");
    expect(SQL_PAIEMENT_EN_ATTENTE).toContain("c.organization_id = $1");
  });

  it("identifiant de vérification de Better Auth pour une adresse", () => {
    expect(identifiantDeVerification(EMAIL)).toBe(`sign-in-otp-${EMAIL}`);
  });
});

// --- Action ---------------------------------------------------------------------------------------------------------

const CREEE = new Date("2026-11-10T08:00:00.000Z");

function dependances(surcharges: Partial<DependancesActionSuppression> = {}) {
  const appels: string[] = [];
  const supprimer = vi.fn(async (): Promise<ResultatSuppression> => ({ ok: true, issue: "supprime" }));
  const d: DependancesActionSuppression = {
    disponible: () => true,
    session: async () => {
      appels.push("session");
      return { sessionId: SESSION, userId: MOI, organizationId: ORG, role: "owner" };
    },
    connexionRecente: async (sessionId, maintenant) => {
      appels.push("connexionRecente");
      return creerControleConnexionRecente(async () => CREEE)(sessionId, maintenant);
    },
    limiteur: async () => {
      appels.push("limiteur");
      return { ok: true };
    },
    compte: {
      decision: async () => {
        appels.push("decision");
        return "suppression";
      },
      supprimer: async (ctx) => {
        appels.push("supprimer");
        expect(ctx).toEqual(CTX);
        return supprimer();
      },
    },
    maintenant: () => new Date(CREEE.getTime() + 60_000),
    effacerCookie: async () => {
      appels.push("effacerCookie");
    },
    ...surcharges,
  };
  return { d, appels, supprimer };
}

describe("supprimerMonCompte : ordre des contrôles (§ 6.3, critères 1 et 10)", () => {
  it("réussite : session, accès, connexion récente, limiteur, suppression, puis cookie effacé", async () => {
    const { d, appels } = dependances();
    expect(await supprimerMonCompte(d)).toEqual({ ok: true, value: { deleted: true } });
    expect(appels).toEqual(["session", "decision", "connexionRecente", "limiteur", "supprimer", "effacerCookie"]);
  });

  it("hors de `api` avec la connexion réelle : not_found, rien lu", async () => {
    const { d, appels } = dependances({ disponible: () => false });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(appels).toEqual([]);
  });

  it("sans session (second onglet après la suppression) : unauthenticated, rien d'autre", async () => {
    const { d, appels } = dependances({ session: async () => null });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(appels).toEqual([]);
  });

  it("conseiller : forbidden sur le rôle, avant toute lecture", async () => {
    const { d, appels } = dependances({ session: async () => ({ sessionId: SESSION, userId: MOI, organizationId: ORG, role: "member" }) });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(appels).toEqual([]);
  });

  it.each(["forbidden", "retrait", "absent"] as const)("organisation non admise (%s) : forbidden, avant la connexion récente et le limiteur", async (decision) => {
    const { d, appels, supprimer } = dependances();
    const resultat = await supprimerMonCompte({ ...d, compte: { ...d.compte, decision: async () => decision } });
    expect(resultat).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(appels).toEqual(["session"]);
    expect(supprimer).not.toHaveBeenCalled();
  });

  it("horloge : 9 min 59 s après le code, la suppression se fait ; à 10 min 00 s, reauthentication_required et rien supprimé", async () => {
    const juste = dependances({ maintenant: () => new Date(CREEE.getTime() + 599_000) });
    expect((await supprimerMonCompte(juste.d)).ok).toBe(true);
    expect(juste.supprimer).toHaveBeenCalledTimes(1);

    const tard = dependances({ maintenant: () => new Date(CREEE.getTime() + 600_000) });
    expect(await supprimerMonCompte(tard.d)).toEqual({ ok: false, error: { code: "reauthentication_required" } });
    expect(tard.appels).toEqual(["session", "decision", "connexionRecente"]);
    expect(tard.supprimer).not.toHaveBeenCalled();
  });

  it("limite atteinte : rate_limited (retryable), rien supprimé", async () => {
    const { d, supprimer } = dependances({ limiteur: async () => ({ ok: false }) });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(supprimer).not.toHaveBeenCalled();
  });

  it("paiement en attente : payment_pending (retryable), cookie gardé ; erreur valide pour le contrat", async () => {
    const { d, appels, supprimer } = dependances();
    supprimer.mockResolvedValueOnce({ ok: false, code: "paiement_en_attente" });
    const resultat = await supprimerMonCompte(d);
    expect(resultat).toEqual({ ok: false, error: { code: "payment_pending", retryable: true } });
    expect(appels).not.toContain("effacerCookie");
    expect(ApiErrorSchema.safeParse(resultat.ok ? null : resultat.error).success).toBe(true);
    expect(messages.compte.suppression.paiementEnAttente).toBe("Un paiement est en cours. Réessaie quand il sera terminé.");
  });

  it.each(["connexionRecente", "limiteur"] as const)("exception de `%s` : internal (retryable), une ligne de journal, rien supprimé", async (controle) => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    class PanneDeControleError extends Error {
      override name = "PanneDeControleError";
    }
    const panne = async (): Promise<never> => {
      throw new PanneDeControleError(`échec pour ${EMAIL} ${MOI}`);
    };
    const { d, appels, supprimer } = dependances({ [controle]: panne });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "internal", retryable: true } });
    expect(supprimer).not.toHaveBeenCalled();
    expect(appels).not.toContain("supprimer");
    expect(appels).not.toContain("effacerCookie");
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? "")).toMatchObject({ event: "compte.suppression_failed", errorName: "PanneDeControleError", level: "error" });
    for (const interdit of [EMAIL, MOI, ORG, SESSION]) expect(lignes[0]).not.toContain(interdit);
  });

  it("organisation devenue partagée entre le contrôle et la suppression : forbidden", async () => {
    const { d, supprimer } = dependances();
    supprimer.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("échec de la base : internal (retryable) et une ligne `compte.suppression_failed` sans adresse ni identifiant", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    class PanneDeBaseError extends Error {
      override name = "PanneDeBaseError";
    }
    const { d, appels, supprimer } = dependances();
    supprimer.mockRejectedValueOnce(new PanneDeBaseError(`échec pour ${EMAIL} ${MOI}`));
    expect(await supprimerMonCompte(d)).toEqual({ ok: false, error: { code: "internal", retryable: true } });
    expect(appels).not.toContain("effacerCookie");
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? "")).toMatchObject({ event: "compte.suppression_failed", errorName: "PanneDeBaseError", level: "error" });
    for (const interdit of [EMAIL, MOI, ORG, SESSION]) expect(lignes[0]).not.toContain(interdit);
  });

  it("lecture de la session en échec : internal ; cookie impossible à effacer : la réussite reste une réussite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const panne = dependances({
      session: async () => {
        throw new Error("connexion non branchée");
      },
    });
    expect(await supprimerMonCompte(panne.d)).toEqual({ ok: false, error: { code: "internal", retryable: true } });
    const cookie = dependances({
      effacerCookie: async () => {
        throw new Error("déconnexion en échec");
      },
    });
    expect(await supprimerMonCompte(cookie.d)).toEqual({ ok: true, value: { deleted: true } });
  });
});

// --- Limiteur -------------------------------------------------------------------------------------------------------

describe("limiteur : règle `suppression` et entrées d'une personne (S7 ; handover § 12, étape 2)", () => {
  const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
  const adresse = (): CanonicalEmail => {
    const lu = parseEmailAddress(EMAIL);
    if (!lu.ok) throw new Error("adresse de test refusée");
    return lu.email;
  };

  function poolSimule() {
    const requetes: { texte: string; valeurs?: unknown[] }[] = [];
    const client: RateLimitClient = {
      query: async (texte, valeurs) => {
        requetes.push(valeurs === undefined ? { texte } : { texte, valeurs });
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool: RateLimitPool = { connect: async () => client };
    return { pool, requetes };
  }

  it("`suppression` : 5 par heure et par personne, espèce `user` seule", () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_SUPPRESSION]).toEqual([{ kind: "user", windowSeconds: 3600, threshold: 5 }]);
  });

  it("clesDeLaPersonne : une clé par règle `email` ou `user` de la configuration réelle, aucune par adresse IP ni par voyage", () => {
    const secret = randomBytes(32);
    const cles = clesDeLaPersonne(secret, RATE_LIMITS, { email: adresse(), userId: MOI.toUpperCase() });
    const parEmail = (action: string, fenetre: number) => rateLimitKey(secret, rateLimitMessage(action, fenetre, `email/${rateLimitEmailKey(adresse())}`));
    const parPersonne = (action: string) => rateLimitKey(secret, rateLimitMessage(action, 3600, `user/${MOI}`));
    expect([...cles].sort()).toEqual([parEmail("request-code", 3600), parEmail("verify-code", 3600), parPersonne("export"), parPersonne("suppression")].sort());
    const attendues = Object.values(RATE_LIMITS).flat().filter((regle) => regle.kind === "email" || regle.kind === "user").length;
    expect(cles).toHaveLength(attendues);
  });

  it("oublier : une transaction sous vadrouille_limiter, une suppression par clés, paramètres liés", async () => {
    const secret = randomBytes(32);
    const env = { VADROUILLE_ENV: "ci", [HMAC]: secret.toString("base64url") };
    const { pool, requetes } = poolSimule();
    const personne = { email: adresse(), userId: MOI };
    await createRateLimiter({ pool, env, config: RATE_LIMITS }).oublier(personne);
    expect(requetes.map((r) => r.texte)).toEqual(["BEGIN", "SET LOCAL ROLE vadrouille_limiter", "DELETE FROM action_rate_limits WHERE key = ANY($1::text[])", "COMMIT"]);
    expect(requetes[2]?.valeurs).toEqual([clesDeLaPersonne(secret, RATE_LIMITS, personne)]);
  });

  it("oublier : échec fermé (variable du limiteur absente, identifiant qui n'est pas un uuid, base en panne) sans rien journaliser de la personne", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    const env = { VADROUILLE_ENV: "ci", [HMAC]: randomBytes(32).toString("base64url") };
    const personne = { email: adresse(), userId: MOI };
    const sansVariable = poolSimule();
    await expect(createRateLimiter({ pool: sansVariable.pool, env: { VADROUILLE_ENV: "ci" }, config: RATE_LIMITS }).oublier(personne)).rejects.toBeInstanceOf(OubliLimiteurError);
    const sansUuid = poolSimule();
    await expect(createRateLimiter({ pool: sansUuid.pool, env, config: RATE_LIMITS }).oublier({ ...personne, userId: "moi" })).rejects.toBeInstanceOf(OubliLimiteurError);
    expect([...sansVariable.requetes, ...sansUuid.requetes]).toEqual([]);
    const enPanne: RateLimitPool = {
      connect: async () => {
        throw new Error("base injoignable");
      },
    };
    await expect(createRateLimiter({ pool: enPanne, env, config: RATE_LIMITS }).oublier(personne)).rejects.toBeInstanceOf(OubliLimiteurError);
    for (const ligne of lignes) for (const interdit of [EMAIL, MOI]) expect(ligne).not.toContain(interdit);
  });
});
