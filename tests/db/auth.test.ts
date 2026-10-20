import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { envoyerCodeRecu } from "@/server/auth/envoi";
import { disabledCodeMailer } from "@/server/mail/disabled";
import { createSmtpCodeMailer } from "@/server/mail/smtp";
import { creerContexteServeur } from "@/server/session";
import { fabriqueAdaptateur, MODELES } from "@/tenancy/adaptateur";
import { RechercheJetonRefuseeError } from "@/tenancy/jetons-haches";

import { createDatabase } from "../../db/index";
import { adresse, canonique, codeFaux, connecter, demanderCode, identifiant, jetonDuCookie, preparerBanc } from "./auth-outils";
import { closeAll, connect, type DbClient, inTx, unique } from "./helpers";
import { attendreMessages, dernierCodeMailpit, MAILPIT_SMTP } from "./mailpit";

/**
 * Better Auth, organisations et contexte (spécification B3, critères B1, B4 à B10, B12, B13 et B15 ; décision 0077 § 5).
 * Opérations de `src/server/auth` configurées par injection (secret tiré au hasard, double de capture du port
 * d'envoi), sur les rôles réels : `vadrouille_auth` pour la bibliothèque et les lectures du test,
 * `vadrouille_account_admin` pour poser une suppression (`purge_organization_data`, décision 0007). La connexion
 * d'administration ne sert qu'aux relevés transverses (B7, B15) et aux états forcés (B10, B15).
 */

const banc = preparerBanc();
let auth: DbClient;
let admin: DbClient;

beforeAll(async () => {
  auth = await connect("auth");
  admin = await connect("admin");
});

afterAll(async () => {
  await banc.fermer();
  await closeAll();
});

const sha256 = (texte: string) => createHash("sha256").update(texte, "utf8").digest();
const verifier = (email: ReturnType<typeof adresse>, code: string) => banc.operations.verifyCode({ email, code });

async function organisationsDe(userId: string) {
  const { rows } = await auth.query(
    `SELECT o.id, o.name, o.slug, o.kind, o.deletion_requested_at, m.role
     FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = $1`,
    [userId],
  );
  return rows as { id: string; name: string; slug: string; kind: string; deletion_requested_at: Date | null; role: string }[];
}

async function compter(table: "users" | "sessions" | "verifications", colonne: string, valeur: string): Promise<number> {
  const { rows } = await auth.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${colonne} = $1`, [valeur]);
  return rows[0].n as number;
}

describe("B3b : code de connexion", () => {
  it("auth: code à 6 chiffres valable 10 minutes, 3 essais", async () => {
    // Code reçu par le double de capture : 6 chiffres ASCII ; stocké en HMAC à clé, ni en clair ni en SHA-256 simple.
    const accepte = adresse();
    const code = await demanderCode(banc, accepte);
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(banc.mailer.envois.at(-1)).toEqual({ to: accepte, code, expiresInMinutes: 10 });
    const { rows } = await auth.query(
      "SELECT value, extract(epoch FROM expires_at - created_at)::float AS duree FROM verifications WHERE identifier = $1",
      [identifiant(accepte)],
    );
    expect(rows).toHaveLength(1);
    const valeur = rows[0].value as string;
    for (const interdit of [code, sha256(code).toString("hex"), sha256(code).toString("base64"), sha256(code).toString("base64url")]) {
      expect(valeur).not.toContain(interdit);
    }
    expect(valeur).toMatch(/^[0-9a-f]{64}:0$/);
    expect(Math.abs((rows[0].duree as number) - 600)).toBeLessThan(5);
    // Accepté avant 10 minutes.
    expect((await verifier(accepte, code)).ok).toBe(true);

    // Expiration reculée en base : `code_expired`.
    const expire = adresse();
    const codeExpire = await demanderCode(banc, expire);
    await auth.query("UPDATE verifications SET expires_at = now() - interval '1 second' WHERE identifier = $1", [identifiant(expire)]);
    expect(await verifier(expire, codeExpire)).toEqual({ ok: false, code: "code_expired" });

    // 3 codes faux, puis le code juste et un quatrième code faux : `too_many_attempts`.
    const essais = adresse();
    const codeEssais = await demanderCode(banc, essais);
    for (let i = 0; i < 3; i += 1) expect(await verifier(essais, codeFaux(codeEssais))).toEqual({ ok: false, code: "invalid_code" });
    expect(await verifier(essais, codeEssais)).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await verifier(essais, codeFaux(codeEssais))).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await compter("users", "email", essais)).toBe(0);

    // 5 essais faux simultanés, puis le code juste : refus (vérification 7.11, verrou par adresse).
    const simultanes = adresse();
    const codeSimultane = await demanderCode(banc, simultanes);
    const resultats = await Promise.all(Array.from({ length: 5 }, () => verifier(simultanes, codeFaux(codeSimultane))));
    expect(resultats.filter((r) => !r.ok && r.code === "invalid_code")).toHaveLength(3);
    expect(resultats.filter((r) => !r.ok && r.code === "too_many_attempts")).toHaveLength(2);
    expect(await verifier(simultanes, codeSimultane)).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await compter("users", "email", simultanes)).toBe(0);
  });

  it("un nouveau code remplace l'ancien et remet les essais à zéro (B3-PO-5, vérification 7.7)", async () => {
    const email = adresse();
    const ancien = await demanderCode(banc, email);
    for (let i = 0; i < 2; i += 1) expect(await verifier(email, codeFaux(ancien))).toEqual({ ok: false, code: "invalid_code" });
    const nouveau = await demanderCode(banc, email);
    expect(await compter("verifications", "identifier", identifiant(email))).toBe(1);
    if (nouveau !== ancien) expect(await verifier(email, ancien)).toEqual({ ok: false, code: "invalid_code" });
    expect((await verifier(email, nouveau)).ok).toBe(true);
    expect(await compter("verifications", "identifier", identifiant(email))).toBe(0);
  });

  it("un code mal formé est refusé sans compter d'essai (revue du head f0b8c5a, mineur 3)", async () => {
    const email = adresse();
    const code = await demanderCode(banc, email);
    for (const forme of ["12345", "1234567", "12a456", " 123456", "１２３４５６", ""]) {
      expect(await verifier(email, forme)).toEqual({ ok: false, code: "invalid_code" });
    }
    for (let i = 0; i < 2; i += 1) expect(await verifier(email, codeFaux(code))).toEqual({ ok: false, code: "invalid_code" });
    expect((await verifier(email, code)).ok).toBe(true);
  });

  it("deux demandes simultanées pour la même adresse ne laissent qu'une vérification (revue du head f0b8c5a, mineur 2)", async () => {
    const email = adresse();
    const resultats = await Promise.all([banc.operations.requestCode(email), banc.operations.requestCode(email), banc.operations.requestCode(email)]);
    expect(resultats.every((r) => r.ok)).toBe(true);
    expect(await compter("verifications", "identifier", identifiant(email))).toBe(1);
    const dernier = banc.mailer.dernierCode(email);
    expect(dernier).toBeDefined();
    expect((await verifier(email, dernier ?? "")).ok).toBe(true);
  });
});

describe("B3b : compte et organisation personnelle", () => {
  it("auth: organisation personnelle créée à la première connexion", async () => {
    const email = adresse();
    const code = await demanderCode(banc, email);
    expect(await compter("users", "email", email)).toBe(0);

    const ouverte = await verifier(email, code);
    expect(ouverte.ok).toBe(true);
    if (!ouverte.ok) return;
    const { rows: utilisateurs } = await auth.query("SELECT id, email_verified FROM users WHERE email = $1", [email]);
    expect(utilisateurs).toEqual([{ id: ouverte.userId, email_verified: true }]);
    const organisations = await organisationsDe(ouverte.userId);
    expect(organisations).toHaveLength(1);
    const [organisation] = organisations;
    expect(organisation).toMatchObject({ id: ouverte.organizationId, kind: "personal", role: "owner", deletion_requested_at: null });
    const locale = email.slice(0, email.indexOf("@"));
    for (const champ of [organisation?.name ?? "", organisation?.slug ?? ""]) {
      expect(champ).not.toContain(email);
      expect(champ).not.toContain(locale);
    }
    const { rows: sessions } = await auth.query("SELECT id, active_organization_id FROM sessions WHERE user_id = $1", [ouverte.userId]);
    expect(sessions).toEqual([{ id: ouverte.sessionId, active_organization_id: ouverte.organizationId }]);

    // Seconde connexion : ni organisation ni adhésion de plus.
    const seconde = await connecter(banc, email);
    expect(seconde.userId).toBe(ouverte.userId);
    expect(seconde.organizationId).toBe(ouverte.organizationId);
    expect(await organisationsDe(ouverte.userId)).toHaveLength(1);
    expect(await compter("users", "email", email)).toBe(1);
  });

  it("auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts", async () => {
    const u = unique();
    const simple = canonique(`a-${u}@exemple.test`);
    const alias = canonique(`a-${u}+x@exemple.test`);
    const a = await connecter(banc, simple);
    const b = await connecter(banc, alias);
    expect(b.userId).not.toBe(a.userId);
    expect(b.organizationId).not.toBe(a.organizationId);
    const majuscules = canonique(`A-${u}@Exemple.test`);
    expect(majuscules).toBe(simple);
    const c = await connecter(banc, majuscules);
    expect(c.userId).toBe(a.userId);
    expect(c.organizationId).toBe(a.organizationId);
  });

  it("organisations: exactement un propriétaire", async () => {
    // Rejoué par le chemin de Better Auth (critère B12) : création par la configuration, puis chaque opération de la
    // liste blanche ; aucune ne crée de seconde organisation ni ne change un rôle.
    const email = adresse();
    const ouverte = await connecter(banc, email);
    const { rows: adhesions } = await auth.query("SELECT user_id, role FROM memberships WHERE organization_id = $1", [ouverte.organizationId]);
    expect(adhesions).toEqual([{ user_id: ouverte.userId, role: "owner" }]);
    await banc.operations.readSession(banc.enTetes());
    await banc.operations.signOut(banc.enTetes());
    await connecter(banc, email);
    await banc.operations.readSession(banc.enTetes());
    await banc.operations.requestCode(email);
    expect(await organisationsDe(ouverte.userId)).toEqual([expect.objectContaining({ id: ouverte.organizationId, role: "owner" })]);
    const { rows: apres } = await auth.query("SELECT user_id, role FROM memberships WHERE organization_id = $1", [ouverte.organizationId]);
    expect(apres).toEqual([{ user_id: ouverte.userId, role: "owner" }]);
  });

  it("auth: la création du compte est atomique", async () => {
    const orphelines = async () =>
      (await admin.query("SELECT count(*)::int AS n FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = o.id)")).rows[0].n as number;
    for (const table of ["organizations", "memberships"] as const) {
      const avant = await orphelines();
      const contrainte = `b15_refus_${unique()}`;
      const email = adresse();
      const code = await demanderCode(banc, email);
      const cookiesAvant = banc.setCookies.length;
      await admin.query(`ALTER TABLE ${table} ADD CONSTRAINT ${contrainte} CHECK (false) NOT VALID`);
      try {
        expect(await verifier(email, code), table).toEqual({ ok: false, code: "provider_error" });
      } finally {
        await admin.query(`ALTER TABLE ${table} DROP CONSTRAINT ${contrainte}`);
      }
      expect(banc.setCookies.length, table).toBe(cookiesAvant);
      expect(await compter("users", "email", email), table).toBe(0);
      expect(await orphelines(), table).toBe(avant);
      const { rows } = await admin.query("SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1", [email]);
      expect(rows[0].n, table).toBe(0);
      // Nouvel essai, erreur retirée : il réussit.
      const reprise = await connecter(banc, email);
      expect(await organisationsDe(reprise.userId), table).toHaveLength(1);
    }
  });
});

describe("B3b : purges techniques", () => {
  it("auth: les vérifications et sessions expirées sont purgées", async () => {
    const valide = await connecter(banc, adresse());
    // Vérification consommée : supprimée par la consommation elle-même.
    const consommee = adresse();
    await connecter(banc, consommee);
    expect(await compter("verifications", "identifier", identifiant(consommee))).toBe(0);

    for (const operation of ["requestCode", "verifyCode"] as const) {
      const perimee = `sign-in-otp-perimee-${unique()}@exemple.test`;
      await auth.query("INSERT INTO verifications (identifier, value, expires_at) VALUES ($1, 'x:0', '1970-01-02')", [perimee]);
      const jeton = randomBytes(24).toString("hex");
      await auth.query("INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, '1970-01-02')", [valide.userId, jeton]);
      if (operation === "requestCode") await banc.operations.requestCode(adresse());
      else await banc.operations.verifyCode({ email: adresse(), code: "123456" });
      expect(await compter("verifications", "identifier", perimee), operation).toBe(0);
      expect(await compter("sessions", "token", jeton), operation).toBe(0);
      expect(await compter("sessions", "id", valide.sessionId), operation).toBe(1);
    }
  });
});

describe("B3b : sessions", () => {
  it("auth: IP et agent utilisateur absents de sessions", async () => {
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const agent = `agent-sentinelle-${randomBytes(6).toString("hex")}`;
    const forgee = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
    const bancIp = preparerBanc({ trustedIpHeader: "x-vercel-forwarded-for" });
    try {
      const email = adresse();
      const ouverte = await connecter(bancIp, email, new Headers({ "x-vercel-forwarded-for": ip, "user-agent": agent, "x-forwarded-for": forgee }));
      expect(ouverte.ok).toBe(true);
      for (const table of ["users", "sessions", "accounts", "verifications", "organizations", "memberships"]) {
        for (const sentinelle of [ip, agent, forgee]) {
          const { rows } = await admin.query(`SELECT count(*)::int AS n FROM ${table} t WHERE t::text LIKE '%' || $1 || '%'`, [sentinelle]);
          expect(rows[0].n, `${table} : ${sentinelle}`).toBe(0);
        }
      }
    } finally {
      await bancIp.fermer();
    }
  });

  it("auth: aucun jeton de session en clair dans sessions", async () => {
    // Chemins de la liste blanche : création (connexion), lecture (getSession), prolongation (mise à jour), déconnexion.
    const ouverte = await connecter(banc, adresse());
    const jeton = jetonDuCookie(banc);
    expect(jeton).toMatch(/^[A-Za-z0-9]{32}$/);
    if (jeton === undefined) return;
    const enClair = async () => (await auth.query("SELECT count(*)::int AS n FROM sessions s WHERE s::text LIKE '%' || $1 || '%'", [jeton])).rows[0].n;
    const { rows } = await auth.query("SELECT token FROM sessions WHERE id = $1", [ouverte.sessionId]);
    expect(rows).toEqual([{ token: sha256(jeton).toString("hex") }]);
    expect(await enClair()).toBe(0);
    expect((await banc.operations.readSession(banc.enTetes()))?.sessionId).toBe(ouverte.sessionId);
    await auth.query("UPDATE sessions SET expires_at = now() + interval '5 days' WHERE id = $1", [ouverte.sessionId]);
    expect((await banc.operations.readSession(banc.enTetes()))?.sessionId).toBe(ouverte.sessionId);
    expect(jetonDuCookie(banc)).toBe(jeton);
    expect(await enClair()).toBe(0);
    expect((await banc.operations.signOut(banc.enTetes())).ok).toBe(true);
    expect(await compter("sessions", "id", ouverte.sessionId)).toBe(0);
  });

  describe("auth: aucun jeton de session en clair dans sessions (chemins de la bibliothèque, hors liste blanche)", () => {
    // Formes d'appel relues dans `better-auth` 1.7.7 (`db/internal-adapter.mjs`) : findSession (findOne eq),
    // findSessions (findMany in), listSessions (findMany par utilisateur), updateSession (update eq), deleteSession
    // (delete eq), deleteSessions et revokeSessions (deleteMany in). Adaptateur réel de `src/tenancy`, base réelle.
    const db = createDatabase("vadrouille_auth");
    const adaptateur = fabriqueAdaptateur(db)({ ...MODELES, advanced: { database: { generateId: "uuid" } } });
    afterAll(async () => {
      await db.$client.end();
    });
    const jetons = () => [randomBytes(24).toString("hex"), randomBytes(24).toString("hex")] as const;
    const creer = async (userId: string, jeton: string) =>
      adaptateur.create<Record<string, unknown>>({
        model: "session",
        data: { userId, token: jeton, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() },
      });
    const enClair = async (jeton: string) => (await auth.query("SELECT count(*)::int AS n FROM sessions s WHERE s::text LIKE '%' || $1 || '%'", [jeton])).rows[0].n;
    let userId = "";
    beforeAll(async () => {
      userId = (await connecter(banc, adresse())).userId;
    });

    it("création et findSession (findOne eq)", async () => {
      const [jeton] = jetons();
      expect((await creer(userId, jeton)).token).toBe(jeton);
      expect(await enClair(jeton)).toBe(0);
      expect(await compter("sessions", "token", sha256(jeton).toString("hex"))).toBe(1);
      const lue = await adaptateur.findOne<Record<string, unknown>>({ model: "session", where: [{ field: "token", value: jeton }] });
      expect(lue?.token).toBe(jeton);
    });

    it("findSessions (findMany in) et listSessions (findMany par utilisateur)", async () => {
      const [a, b] = jetons();
      await creer(userId, a);
      await creer(userId, b);
      const lues = await adaptateur.findMany<Record<string, unknown>>({ model: "session", where: [{ field: "token", value: [a, b], operator: "in" }] });
      expect(lues.map((l) => l.token).sort()).toEqual([a, b].sort());
      const parUtilisateur = await adaptateur.findMany<Record<string, unknown>>({ model: "session", where: [{ field: "userId", value: userId }] });
      expect(parUtilisateur.map((l) => l.token)).not.toContain(a);
      expect(parUtilisateur.map((l) => l.token)).toContain(sha256(a).toString("hex"));
    });

    it("updateSession (update eq)", async () => {
      const [jeton] = jetons();
      await creer(userId, jeton);
      const echeance = new Date(Date.now() + 7_200_000);
      const misAJour = await adaptateur.update<Record<string, unknown>>({ model: "session", where: [{ field: "token", value: jeton }], update: { expiresAt: echeance } });
      expect(misAJour?.token).toBe(jeton);
      expect(await enClair(jeton)).toBe(0);
      const { rows } = await auth.query("SELECT expires_at FROM sessions WHERE token = $1", [sha256(jeton).toString("hex")]);
      expect((rows[0].expires_at as Date).getTime()).toBe(echeance.getTime());
    });

    it("revokeSession et signOut (delete eq), revokeSessions (deleteMany in)", async () => {
      const [a, b] = jetons();
      const [c] = jetons();
      await creer(userId, a);
      await creer(userId, b);
      await creer(userId, c);
      await adaptateur.delete({ model: "session", where: [{ field: "token", value: a }] });
      expect(await compter("sessions", "token", sha256(a).toString("hex"))).toBe(0);
      await adaptateur.deleteMany({ model: "session", where: [{ field: "token", value: [b, c], operator: "in" }] });
      expect(await compter("sessions", "token", sha256(b).toString("hex"))).toBe(0);
      expect(await compter("sessions", "token", sha256(c).toString("hex"))).toBe(0);
    });

    it("tout autre opérateur sur token est refusé", async () => {
      await expect(adaptateur.findMany({ model: "session", where: [{ field: "token", value: "abc", operator: "contains" }] })).rejects.toBeInstanceOf(
        RechercheJetonRefuseeError,
      );
    });
  });

  it("auth: une organisation en suppression n'ouvre aucune session", async () => {
    const email = adresse();
    const ouverte = await connecter(banc, email);
    const cookiesSession = new Headers(banc.enTetes());
    // Suppression posée sous le rôle prévu par 0007 (`vadrouille_account_admin`, depuis `vadrouille_app`, contexte de
    // l'organisation et de son owner ; même forme que `tests/db/purge.test.ts`).
    const client = await connect("app");
    await inTx(client, { org: ouverte.organizationId, user: ouverte.userId }, (c) => c.query("SELECT purge_organization_data($1)", [ouverte.organizationId]), "vadrouille_account_admin");
    const code = await demanderCode(banc, email);
    const cookiesAvant = banc.setCookies.length;
    expect(await verifier(email, code)).toEqual({ ok: false, code: "unauthenticated" });
    expect(banc.setCookies.length).toBe(cookiesAvant);
    const { rows } = await auth.query("SELECT id FROM sessions WHERE user_id = $1", [ouverte.userId]);
    expect(rows).toEqual([{ id: ouverte.sessionId }]);
    // Session existante de cette organisation : refusée.
    expect(await creerContexteServeur(banc.operations)(cookiesSession)).toBeNull();
  });

  it("auth: le contexte vient de la session, jamais du client", async () => {
    const a = await connecter(banc, adresse());
    const enTetesA = new Headers(banc.enTetes());
    const b = await connecter(banc, adresse());
    const cookieA = enTetesA.get("cookie") ?? "";
    const forges = new Headers({
      cookie: `${cookieA}; organizationId=${b.organizationId}; userId=${b.userId}`,
      "x-organization-id": b.organizationId,
      "x-user-id": b.userId,
      "x-role": "owner",
      referer: `http://127.0.0.1:3999/voyages?organizationId=${b.organizationId}&userId=${b.userId}`,
    });
    const contexte = await creerContexteServeur(banc.operations)(forges);
    expect(contexte).toEqual({ organizationId: a.organizationId, userId: a.userId, role: "owner" });

    // Sans cookie : null.
    expect(await creerContexteServeur(banc.operations)(new Headers({ "x-organization-id": a.organizationId }))).toBeNull();

    // Adhésion disparue : null (adhésion `member` à l'organisation de B, rendue active, puis retirée).
    await admin.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'member')", [b.organizationId, a.userId]);
    await admin.query("UPDATE sessions SET active_organization_id = $1 WHERE id = $2", [b.organizationId, a.sessionId]);
    expect(await creerContexteServeur(banc.operations)(enTetesA)).toEqual({
      organizationId: b.organizationId,
      userId: a.userId,
      role: "member",
    });
    await admin.query("DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2", [b.organizationId, a.userId]);
    expect(await creerContexteServeur(banc.operations)(enTetesA)).toBeNull();
  });

  it("prolongation : expires_at repoussé une fois par jour, created_at inchangé (B3-PO-8)", async () => {
    const ouverte = await connecter(banc, adresse());
    const enTetes = new Headers(banc.enTetes());
    await auth.query("UPDATE sessions SET expires_at = now() + interval '6 days' - interval '1 minute' WHERE id = $1", [ouverte.sessionId]);
    const avant = (await auth.query("SELECT expires_at, created_at FROM sessions WHERE id = $1", [ouverte.sessionId])).rows[0];
    const cookiesAvant = banc.setCookies.length;
    expect((await banc.operations.readSession(enTetes))?.sessionId).toBe(ouverte.sessionId);
    const apres = (await auth.query("SELECT expires_at, created_at FROM sessions WHERE id = $1", [ouverte.sessionId])).rows[0];
    expect((apres.expires_at as Date).getTime()).toBeGreaterThan((avant.expires_at as Date).getTime() + 23 * 3_600_000);
    expect((apres.created_at as Date).getTime()).toBe((avant.created_at as Date).getTime());
    expect(banc.setCookies.length).toBeGreaterThan(cookiesAvant);
    await banc.operations.readSession(new Headers(banc.enTetes()));
    const encore = (await auth.query("SELECT expires_at FROM sessions WHERE id = $1", [ouverte.sessionId])).rows[0];
    expect((encore.expires_at as Date).getTime()).toBe((apres.expires_at as Date).getTime());
  });
});

describe("parcours", () => {
  it("journaux: aucun email ni code dans les journaux", async () => {
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const bancIp = preparerBanc({ trustedIpHeader: "x-vercel-forwarded-for" });
    const bancDesactive = preparerBanc({ port: disabledCodeMailer });
    const email = adresse("journal");
    const autre = adresse("journal-panne");
    // Sortie standard et sortie d'erreur capturées aussi (critère B13), en plus des méthodes de la console.
    const espions = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((methode) => vi.spyOn(console, methode)),
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
    ];
    const codes: string[] = [];
    let jeton: string | undefined;
    try {
      const enTetes = new Headers({ "x-vercel-forwarded-for": ip, "user-agent": `agent-${ip}` });
      const code = await demanderCode(bancIp, email);
      codes.push(code, codeFaux(code));
      expect(await bancIp.operations.verifyCode({ email, code: codeFaux(code), headers: enTetes })).toEqual({ ok: false, code: "invalid_code" });
      expect((await bancIp.operations.verifyCode({ email, code, headers: enTetes })).ok).toBe(true);
      jeton = jetonDuCookie(bancIp);
      await bancIp.operations.readSession(bancIp.enTetes());
      expect((await bancIp.operations.signOut(bancIp.enTetes())).ok).toBe(true);
      // Erreur du port simulée dont le message contient l'adresse.
      bancIp.mailer.echouerAvec = new Error(`panne d'envoi vers ${autre}`);
      expect(await bancIp.operations.requestCode(autre)).toEqual({ ok: false, code: "provider_error" });
      // Envoi refusé par l'implémentation désactivée.
      expect(await bancDesactive.operations.requestCode(autre)).toEqual({ ok: false, code: "provider_error" });
      // Adresse reçue de la bibliothèque, refusée par le contrôle refait dans `src/server/auth`.
      await expect(envoyerCodeRecu(bancIp.mailer, { email: ` ${email.toUpperCase()}`, otp: code })).rejects.toThrow();
      const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
      expect(ecrit).toContain("email.transport_disabled");
      expect(ecrit).toContain("email.address_refused");
      for (const interdit of [email, autre, email.toUpperCase(), ip, ...codes, ...(jeton === undefined ? [] : [jeton])]) {
        expect(ecrit).not.toContain(interdit);
      }
      expect(jeton).toBeDefined();
    } finally {
      for (const espion of espions) espion.mockRestore();
      await bancIp.fermer();
      await bancDesactive.fermer();
    }
  });
  it("journaux: aucun email ni code dans les journaux (SMTP vers Mailpit, critère E6)", async () => {
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const email = adresse("journal-smtp");
    const panne = adresse("journal-smtp-panne");
    const refusee = adresse("journal-smtp-refus");
    const bancSmtp = preparerBanc({ trustedIpHeader: "x-vercel-forwarded-for", port: createSmtpCodeMailer(MAILPIT_SMTP) });
    // Port fermé de la boucle locale : erreur de connexion dont le message de `nodemailer` porte l'adresse IP et le port.
    const bancPanne = preparerBanc({ trustedIpHeader: "x-vercel-forwarded-for", port: createSmtpCodeMailer({ host: "127.0.0.1", port: 1 }) });
    const espions = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((methode) => vi.spyOn(console, methode)),
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
    ];
    const codes: string[] = [];
    try {
      const enTetes = new Headers({ "x-vercel-forwarded-for": ip, "user-agent": `agent-${ip}` });
      // Envoi réel vers Mailpit, code lu par l'API, vérification.
      expect(await bancSmtp.operations.requestCode(email)).toEqual({ ok: true });
      await attendreMessages(email);
      const code = await dernierCodeMailpit(email);
      expect(code).toMatch(/^[0-9]{6}$/);
      codes.push(code ?? "", codeFaux(code ?? ""));
      expect((await bancSmtp.operations.verifyCode({ email, code: code ?? "", headers: enTetes })).ok).toBe(true);
      // Erreur SMTP réelle (connexion refusée) : `provider_error`, message de la bibliothèque jamais journalisé.
      expect(await bancPanne.operations.requestCode(panne)).toEqual({ ok: false, code: "provider_error" });
      // Enveloppe refusée : valeur forcée dans le type de marque, contrôle d'adresse neutralisé.
      const mailerRefus = createSmtpCodeMailer(MAILPIT_SMTP, { adresseAdmise: () => true });
      await expect(mailerRefus.sendLoginCode({ to: `${refusee},autre@exemple.test` as typeof refusee, code: "135791", expiresInMinutes: 10 })).rejects.toThrow();
      const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
      expect(ecrit).toContain("email.envelope_refused");
      for (const interdit of [email, panne, refusee, "autre@exemple.test", "127.0.0.1", ip, "135791", ...codes]) {
        expect(ecrit).not.toContain(interdit);
      }
    } finally {
      for (const espion of espions) espion.mockRestore();
      await bancSmtp.fermer();
      await bancPanne.fermer();
    }
  });
});
