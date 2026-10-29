// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_NAME } from "@/config/site";
import { EMAIL_USAGES, RESEND_SENDER_ADDRESS } from "@/server/config/email";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { LOG_EMAIL_PROVIDER_REASONS, LOG_EMAIL_TRANSPORT_REASONS, LOG_EMAIL_USAGES } from "@/server/log";

import type { DonneesMessage } from "./enveloppe";
import type { EmailReservation, ReserveEmail } from "./plafond";
import { CodeMailerCapError, CodeMailerRefusalError, type LoginCodeMessage } from "./port";
import {
  createResendCodeMailer,
  PlafondIndisponibleError,
  RESEND_API_URL,
  RESEND_DELAI_MS,
  ResendEnvoiError,
  ResendRefusError,
  type OptionsEnvoiResend,
  type ResendDeps,
  type TransportResend,
} from "./resend";
import { NOMS_ERREUR_RESEND, OCTETS_CORPS_MAX, RAISONS_ECHEC_RESEND } from "./reponses-resend";

/**
 * Implémentation Resend du port d'envoi (spécification B3d ; décision 0138 § 1.1, option A) sur un **double** de Resend
 * (`transport` injecté) : aucun appel réseau, aucune clé réelle (sentinelle de la forme admise, manifestement fausse),
 * adresses en `exemple.test`. Critères R2, R3, R9, R10 et R13 ; le plafond sur la base réelle est dans
 * `tests/db/plafond-emails.test.ts` (R4 à R8). La lecture de la clé est injectée : ce test n'importe pas le module de la
 * clé (0138 § 1.1 point 10).
 */

const CLE = "re_SENTINELLE_exemple_0000000000";
const CODE = "042137";
const ID_MESSAGE = "SENTINELLE-ID-MESSAGE-4f1c";

const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};
/** Valeur forcée dans le type de marque, **sans** `parseEmailAddress` (R3, E5 de B3b-envoi) : réservé à ce test. */
const forcee = (valeur: string) => valeur as unknown as LoginCodeMessage["to"];
const A = canonique("a@exemple.test");
const MESSAGE: LoginCodeMessage = { to: A, code: CODE, expiresInMinutes: 10 };

const json = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

/** Compteur en mémoire à la place du plafond (R4 à R8 le vérifient sur la base) : compte les réservations. */
function compteur(refus?: EmailReservation & { ok: false }) {
  const appels: string[] = [];
  const reserver: ReserveEmail = async (usage) => {
    appels.push(usage);
    return refus ?? { ok: true, total: appels.length };
  };
  return { reserver, appels };
}

function banc(reponse: TransportResend, extra: Partial<ResendDeps> = {}) {
  const transport = vi.fn<TransportResend>(reponse);
  const lireCle = vi.fn(() => ({ ok: true as const, cle: CLE }));
  const plafond = compteur();
  const purger = vi.fn(async () => undefined);
  const mailer = createResendCodeMailer({ transport, lireCle, reserver: plafond.reserver, purger, ...extra });
  return { mailer, transport, lireCle, plafond, purger };
}

let espions: ReturnType<typeof vi.spyOn>[];
const sortie = () => espions.flatMap((espion) => espion.mock.calls.flat()).map(String);
const evenements = () => sortie().map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

beforeEach(() => {
  espions = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});

afterEach(() => {
  for (const espion of espions) espion.mockRestore();
});

/** Rien de personnel ni de secret dans un texte : adresse, code, clé, en-tête, identifiant de message, sentinelle. */
function propre(texte: string, contexte: string) {
  for (const interdit of ["exemple.test", CODE, CLE, "re_SENTINELLE", "Bearer", "Authorization", ID_MESSAGE, "SENTINELLE"]) {
    expect(texte, `${contexte} : ${interdit}`).not.toContain(interdit);
  }
}

/** Erreur levée sans valeur : ni dans `message`, `stack`, `cause`, une propriété, ni `util.inspect`. */
function erreurPropre(erreur: unknown, contexte: string) {
  expect(erreur, contexte).toBeInstanceOf(Error);
  const e = erreur as Error;
  expect(e.cause, contexte).toBeUndefined();
  expect(Object.keys(e), contexte).toEqual(["name"]);
  for (const texte of [e.message, e.stack ?? "", String(e), inspect(e, { depth: 5, showHidden: true })]) propre(texte, contexte);
}

describe("email: requête envoyée à Resend (R2)", () => {
  it("un envoi valide appelle le double une fois : URL constante, options fermées, deux en-têtes, corps de quatre champs", async () => {
    const { mailer, transport, plafond } = banc(async () => json(200, { id: ID_MESSAGE }));
    expect(transport).not.toHaveBeenCalled();
    await mailer.sendLoginCode(MESSAGE);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options, ...autres] = transport.mock.calls[0] ?? [];
    expect(autres).toEqual([]);
    expect(url).toBe(RESEND_API_URL);
    expect(new URL(url ?? "").protocol).toBe("https:");
    const o = options as OptionsEnvoiResend;
    expect(Object.keys(o).sort()).toEqual(["body", "cache", "credentials", "headers", "method", "redirect", "signal"]);
    expect(o).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store" });
    expect(o.headers).toEqual({ Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" });
    expect(o.signal).toBeInstanceOf(AbortSignal);
    expect(o.signal.aborted).toBe(false);
    expect(RESEND_DELAI_MS).toBeLessThanOrEqual(10_000);
    const corps = JSON.parse(o.body) as Record<string, unknown>;
    expect(Object.keys(corps).sort()).toEqual(["from", "subject", "text", "to"]);
    expect(corps.from).toBe("onboarding@resend.dev");
    expect(corps.from).toBe(RESEND_SENDER_ADDRESS);
    expect(corps.to).toEqual(["a@exemple.test"]);
    expect(corps.subject).toBe(`Ton code de connexion ${PRODUCT_NAME}`);
    expect(corps.text).toContain(CODE);
    expect(corps.text).toContain("10 minutes");
    expect(corps.text).not.toMatch(/https?:|www\.|<[a-z]/i);
    expect(plafond.appels).toEqual(["connexion"]);
    expect(evenements()).toEqual([{ level: "info", event: "email.sent", usage: "connexion" }]);
  });

  it("clé relue à chaque envoi (0138 C3), jamais gardée", async () => {
    const { mailer, lireCle } = banc(async () => json(200, {}));
    await mailer.sendLoginCode(MESSAGE);
    await mailer.sendLoginCode(MESSAGE);
    expect(lireCle).toHaveBeenCalledTimes(2);
  });

  it("réponse 200 : succès sur le statut seul, corps abandonné sans être lu", async () => {
    let tires = 0;
    let annule = false;
    const flux = new ReadableStream<Uint8Array>({
      pull(controleur) {
        tires += 1;
        controleur.enqueue(new TextEncoder().encode(`{"id":"${ID_MESSAGE}"}`));
      },
      cancel() {
        annule = true;
      },
    });
    const { mailer } = banc(async () => new Response(flux, { status: 200 }));
    await mailer.sendLoginCode(MESSAGE);
    expect(annule).toBe(true);
    // Le flux peut être amorcé par sa création ; aucune lecture n'est demandée par le module.
    expect(tires).toBeLessThanOrEqual(1);
  });
});

describe("email: enveloppe refusée, rien n'est envoyé ni compté (R3)", () => {
  const cas: [string, Partial<ResendDeps>, LoginCodeMessage["to"]][] = [
    ["`a,b@exemple.test` forcé, contrôle d'adresse neutralisé", { adresseAdmise: () => true }, forcee("a,b@exemple.test")],
    ["`bcc` ajouté aux données", { completerDonnees: (d: DonneesMessage) => ({ ...d, bcc: "b@exemple.test" }) }, A],
    ["clé `envelope` ajoutée aux données", { completerDonnees: (d: DonneesMessage) => ({ ...d, envelope: { from: d.from, to: ["b@exemple.test"] } }) }, A],
    ["`envelope` héritée", { completerDonnees: (d: DonneesMessage) => Object.assign(Object.create({ envelope: { to: ["b@exemple.test"] } }) as object, d) }, A],
  ];
  it.each(cas)("%s → refus (provider_error), double non appelé, rien compté, email.envelope_refused sans valeur", async (_cas, deps, to) => {
    const { mailer, transport, plafond, lireCle } = banc(async () => json(200, {}), deps);
    const erreur = await mailer.sendLoginCode({ to, code: CODE, expiresInMinutes: 10 }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(CodeMailerRefusalError);
    expect(erreur).not.toBeInstanceOf(CodeMailerCapError);
    expect(transport).not.toHaveBeenCalled();
    expect(plafond.appels).toEqual([]);
    expect(lireCle).not.toHaveBeenCalled();
    expect(evenements()).toEqual([{ level: "warn", event: "email.envelope_refused" }]);
    erreurPropre(erreur, "enveloppe");
  });

  it("adresse non canonique → email.address_refused, rien d'autre", async () => {
    const { mailer, transport, plafond } = banc(async () => json(200, {}));
    await expect(mailer.sendLoginCode({ to: forcee(" A@Exemple.test "), code: CODE, expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerRefusalError);
    expect(transport).not.toHaveBeenCalled();
    expect(plafond.appels).toEqual([]);
    expect(evenements()).toEqual([{ level: "warn", event: "email.address_refused" }]);
  });

  it.each(["12345", "1234567", "12a456", "１２３４５６", ""])("code %j → refus avant tout", async (code) => {
    const { mailer, transport, plafond } = banc(async () => json(200, {}));
    await expect(mailer.sendLoginCode({ to: A, code, expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerRefusalError);
    expect(transport).not.toHaveBeenCalled();
    expect(plafond.appels).toEqual([]);
  });
});

describe("email: ordre des contrôles (0138 C2)", () => {
  it.each(["egress_refused", "not_admitted", "key_invalid"] as const)("lecture de la clé refusée (%s) → rien réservé, rien appelé, email.transport_refused", async (code) => {
    const { mailer, transport, plafond } = banc(async () => json(200, {}), { lireCle: () => ({ ok: false, code }) });
    const erreur = await mailer.sendLoginCode(MESSAGE).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ResendRefusError);
    expect(transport).not.toHaveBeenCalled();
    expect(plafond.appels).toEqual([]);
    expect(evenements()).toEqual([{ level: "error", event: "email.transport_refused", reason: code }]);
    erreurPropre(erreur, code);
  });

  it("plafond atteint → CodeMailerCapError, double non appelé, email.cap_reached avec usage", async () => {
    const plafond = compteur({ ok: false, reason: "cap_reached" });
    const { mailer, transport } = banc(async () => json(200, {}), { reserver: plafond.reserver });
    const erreur = await mailer.sendLoginCode(MESSAGE).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(CodeMailerCapError);
    expect(transport).not.toHaveBeenCalled();
    expect(evenements()).toEqual([{ level: "warn", event: "email.cap_reached", usage: "connexion" }]);
    erreurPropre(erreur, "plafond");
  });

  it("purge des jours échus : après le transport, une fois, quelle qu'en soit l'issue ; jamais sur un refus d'avant-transport ou de plafond (revue de la PR 850, mineur 2)", async () => {
    const ordre: string[] = [];
    const succes = banc(async () => {
      ordre.push("transport");
      return json(200, {});
    }, { purger: vi.fn(async () => void ordre.push("purge")) });
    await succes.mailer.sendLoginCode(MESSAGE);
    expect(ordre).toEqual(["transport", "purge"]);
    const echec = banc(async () => json(503, {}));
    await expect(echec.mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(echec.purger).toHaveBeenCalledTimes(1);
    const reseau = banc(async () => Promise.reject(new TypeError("fetch failed")));
    await expect(reseau.mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(reseau.purger).toHaveBeenCalledTimes(1);
    const plafond = banc(async () => json(200, {}), { reserver: compteur({ ok: false, reason: "cap_reached" }).reserver });
    await expect(plafond.mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(CodeMailerCapError);
    expect(plafond.purger).not.toHaveBeenCalled();
    const adresse = banc(async () => json(200, {}));
    await expect(adresse.mailer.sendLoginCode({ ...MESSAGE, to: forcee("A@exemple.test") })).rejects.toBeInstanceOf(CodeMailerRefusalError);
    expect(adresse.purger).not.toHaveBeenCalled();
  });

  it("plafond indisponible → erreur d'envoi (provider_error), double non appelé", async () => {
    const plafond = compteur({ ok: false, reason: "unavailable" });
    const { mailer, transport } = banc(async () => json(200, {}), { reserver: plafond.reserver });
    const erreur = await mailer.sendLoginCode(MESSAGE).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(PlafondIndisponibleError);
    expect(transport).not.toHaveBeenCalled();
    erreurPropre(erreur, "indisponible");
  });
});

/** Noms de Resend en `_api_key`, assemblés à l'exécution : ce fichier n'écrit aucun texte à nom secret (P0c, section 5). */
const nomCle = (prefixe: string) => [prefixe, "api", "key"].join("_");

/** Corps d'erreur du double : nom de Resend, et un message qui porte l'adresse, le code et la clé (jamais lu). */
const erreurResend = (name: string) => ({ statusCode: 0, name, message: `SENTINELLE a@exemple.test ${CODE} ${CLE}` });

type Ligne = readonly [string, () => Response | Promise<Response>, "plafond" | (typeof RAISONS_ECHEC_RESEND)[number]];
const LIGNES: readonly Ligne[] = [
  ["429 daily_quota_exceeded", () => json(429, erreurResend("daily_quota_exceeded")), "plafond"],
  ["429 monthly_quota_exceeded", () => json(429, erreurResend("monthly_quota_exceeded")), "plafond"],
  ["429 rate_limit_exceeded", () => json(429, erreurResend("rate_limit_exceeded")), "rate_limited"],
  ["429 corps illisible", () => new Response("SENTINELLE pas du JSON", { status: 429 }), "rate_limited"],
  ["401 clé absente", () => json(401, erreurResend(nomCle("missing"))), "auth"],
  ["401 validation_error", () => json(401, erreurResend("validation_error")), "auth"],
  ["401 clé restreinte", () => json(401, erreurResend(nomCle("restricted"))), "auth"],
  ["403 clé restreinte", () => json(403, erreurResend(nomCle("restricted"))), "auth"],
  ["403 clé suspendue", () => json(403, erreurResend(nomCle("suspended"))), "auth"],
  ["403 invalid_permission", () => json(403, erreurResend("invalid_permission")), "auth"],
  ["403 validation_error", () => json(403, erreurResend("validation_error")), "recipient_refused"],
  ["403 autre nom", () => json(403, erreurResend("email_above_quota")), "auth"],
  ["403 corps illisible", () => new Response("SENTINELLE", { status: 403 }), "auth"],
  ["400 validation_error", () => json(400, erreurResend("validation_error")), "invalid_request"],
  ["404 not_found", () => json(404, erreurResend("not_found")), "invalid_request"],
  ["405 method_not_allowed", () => json(405, erreurResend("method_not_allowed")), "invalid_request"],
  ["409 concurrent_idempotent_requests", () => json(409, erreurResend("concurrent_idempotent_requests")), "invalid_request"],
  ["422 invalid_parameter", () => json(422, erreurResend("invalid_parameter")), "invalid_request"],
  ["422 missing_required_field", () => json(422, erreurResend("missing_required_field")), "invalid_request"],
  ["500 application_error", () => json(500, erreurResend("application_error")), "server_error"],
  ["503 service_unavailable", () => json(503, erreurResend("service_unavailable")), "server_error"],
  ["502 sans corps", () => new Response(null, { status: 502 }), "server_error"],
  ["418 autre statut", () => json(418, erreurResend("daily_quota_exceeded")), "server_error"],
  ["201 autre 2xx", () => json(201, { id: ID_MESSAGE }), "server_error"],
  ["204 sans corps", () => new Response(null, { status: 204 }), "server_error"],
  ["302 redirection rendue", () => new Response(null, { status: 302, headers: { location: "https://autre.exemple.test/" } }), "server_error"],
  [
    "redirection refusée (redirect: error)",
    () => Promise.reject(new TypeError("fetch failed", { cause: new Error("unexpected redirect") })),
    "server_error",
  ],
  ["délai dépassé", () => Promise.reject(new DOMException("SENTINELLE a@exemple.test", "TimeoutError")), "timeout"],
  ["réseau", () => Promise.reject(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED a@exemple.test") })), "network"],
  ["TLS", () => Promise.reject(new TypeError("fetch failed", { cause: new Error("CERT_HAS_EXPIRED") })), "network"],
];

describe("email: correspondance des réponses de Resend (R9) et journaux sans valeur (R10)", () => {
  it.each(LIGNES)("%s → résultat, événement et comptage attendus ; aucune valeur dans l'erreur ni le journal", async (cas, reponse, attendu) => {
    const { mailer, transport, plafond } = banc(async () => reponse());
    const erreur = await mailer.sendLoginCode(MESSAGE).catch((e: unknown) => e);
    expect(transport).toHaveBeenCalledTimes(1);
    // Compté au plafond : l'envoi a été tenté (B3d-PO-2).
    expect(plafond.appels).toEqual(["connexion"]);
    if (attendu === "plafond") {
      expect(erreur).toBeInstanceOf(CodeMailerCapError);
      expect(evenements()).toEqual([{ level: "warn", event: "email.provider_refused", reason: "quota" }]);
    } else {
      expect(erreur).toBeInstanceOf(ResendEnvoiError);
      const niveau = attendu === "auth" || attendu === "server_error" ? "error" : "warn";
      expect(evenements()).toEqual([{ level: niveau, event: "email.provider_refused", reason: attendu }]);
    }
    erreurPropre(erreur, cas);
    for (const ligne of sortie()) propre(ligne, cas);
  });

  it("corps d'erreur lu au plus sur 4 096 octets : un nom placé après la borne n'est pas lu, le flux est abandonné", async () => {
    let annule = false;
    let tires = 0;
    const remplissage = `{"x":"${"a".repeat(OCTETS_CORPS_MAX)}","name":"validation_error"}`;
    const flux = new ReadableStream<Uint8Array>({
      pull(controleur) {
        tires += 1;
        controleur.enqueue(new TextEncoder().encode(tires === 1 ? remplissage : "a".repeat(1_000)));
      },
      cancel() {
        annule = true;
      },
    });
    const { mailer } = banc(async () => new Response(flux, { status: 403 }));
    await expect(mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(evenements()).toEqual([{ level: "error", event: "email.provider_refused", reason: "auth" }]);
    expect(annule).toBe(true);
    expect(tires).toBeLessThanOrEqual(2);
  });

  it("un corps d'erreur en morceaux est réassemblé dans la borne", async () => {
    const morceaux = ['{"na', 'me":"valid', 'ation_error","message":"x"}'];
    const flux = new ReadableStream<Uint8Array>({
      pull(controleur) {
        const suivant = morceaux.shift();
        if (suivant === undefined) controleur.close();
        else controleur.enqueue(new TextEncoder().encode(suivant));
      },
    });
    const { mailer } = banc(async () => new Response(flux, { status: 403 }));
    await expect(mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(evenements()).toEqual([{ level: "warn", event: "email.provider_refused", reason: "recipient_refused" }]);
  });

  it("flux d'erreur interrompu par le délai → timeout", async () => {
    const flux = new ReadableStream<Uint8Array>({
      pull(controleur) {
        controleur.error(new DOMException("SENTINELLE", "TimeoutError"));
      },
    });
    const { mailer } = banc(async () => new Response(flux, { status: 500 }));
    await expect(mailer.sendLoginCode(MESSAGE)).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(evenements()).toEqual([{ level: "warn", event: "email.provider_refused", reason: "timeout" }]);
  });

  it("envoi réussi, refus de plafond, chaque refus du tableau, enveloppe refusée : champs des événements email.* en liste fermée", async () => {
    const champsAdmis = new Map<unknown, readonly string[]>([
      ["email.sent", ["usage"]],
      ["email.cap_reached", ["usage"]],
      ["email.provider_refused", ["reason"]],
      ["email.transport_refused", ["reason"]],
      ["email.envelope_refused", []],
      ["email.address_refused", []],
    ]);
    await banc(async () => json(200, { id: ID_MESSAGE })).mailer.sendLoginCode(MESSAGE);
    await banc(async () => json(200, {}), { reserver: compteur({ ok: false, reason: "cap_reached" }).reserver }).mailer.sendLoginCode(MESSAGE).catch(() => undefined);
    for (const [, reponse] of LIGNES) await banc(async () => reponse()).mailer.sendLoginCode(MESSAGE).catch(() => undefined);
    await banc(async () => json(200, {}), { adresseAdmise: () => true }).mailer.sendLoginCode({ ...MESSAGE, to: forcee("a,b@exemple.test") }).catch(() => undefined);
    const lignes = evenements();
    expect(lignes.length).toBe(LIGNES.length + 3);
    for (const ligne of lignes) {
      const { level, event, ...champs } = ligne;
      expect(["info", "warn", "error"]).toContain(level);
      expect(champsAdmis.has(event)).toBe(true);
      expect(Object.keys(champs).sort()).toEqual([...(champsAdmis.get(event) ?? [])].sort());
      if ("usage" in champs) expect(EMAIL_USAGES).toContain(champs.usage);
      if ("reason" in champs) expect(RAISONS_ECHEC_RESEND).toContain(champs.reason);
    }
    for (const ligne of sortie()) propre(ligne, "journal");
  });
});

describe("email: listes fermées et module (R13)", () => {
  it("raisons et usages du journal égaux à leurs définitions ; noms de Resend retenus", () => {
    expect([...LOG_EMAIL_PROVIDER_REASONS]).toEqual([...RAISONS_ECHEC_RESEND]);
    expect([...LOG_EMAIL_USAGES]).toEqual([...EMAIL_USAGES]);
    // Même liste littérale que `RAISONS_REFUS_TRANSPORT` (src/server/env/cle-resend.test.ts), que ce test n'importe pas.
    expect([...LOG_EMAIL_TRANSPORT_REASONS]).toEqual(["egress_refused", "not_admitted", "key_invalid"]);
    expect([...NOMS_ERREUR_RESEND]).toEqual(["daily_quota_exceeded", "monthly_quota_exceeded", "validation_error"]);
  });

  it("`import \"server-only\"` en tête ; aucun import de src/features, src/components ni src/app ; transport créé à l'envoi", () => {
    for (const nom of ["resend.ts", "plafond.ts", "reponses-resend.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src/server/mail", nom), "utf8");
      expect(source.startsWith('import "server-only";\n'), nom).toBe(true);
      expect(source, nom).not.toMatch(/from "@\/(features|components|app)\//);
    }
    const transport = vi.fn<TransportResend>(async () => json(200, {}));
    createResendCodeMailer({ transport, lireCle: () => ({ ok: true, cle: CLE }), reserver: compteur().reserver });
    expect(transport).not.toHaveBeenCalled();
  });
});
