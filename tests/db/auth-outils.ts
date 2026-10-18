import { randomBytes } from "node:crypto";

import { type AuthOperations, createAuthOperations } from "@/server/auth";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import type { CodeMailer } from "@/server/mail/port";

import { createDatabase } from "../../db/index";
import { type CaptureCodeMailer, createCaptureCodeMailer } from "../support/capture-code-mailer";
import { unique } from "./helpers";

/**
 * Outils des tests de base de B3b (`tests/db/auth*.test.ts`) : opérations de `src/server/auth` configurées par
 * injection (secret tiré au hasard à chaque appel, jamais écrit ; double de capture du port d'envoi ; pools
 * `vadrouille_auth` de `db/index.ts`) et cookies reçus par `onSetCookie`, comme un navigateur les garderait.
 */

export type Banc = {
  readonly operations: AuthOperations;
  readonly mailer: CaptureCodeMailer;
  /** Cookies courants (nom → valeur), mis à jour par chaque `Set-Cookie`. */
  readonly cookies: Map<string, string>;
  /** Tous les `Set-Cookie` reçus, dans l'ordre. */
  readonly setCookies: string[];
  /** En-têtes d'une requête qui porte les cookies courants, plus `extra`. */
  enTetes(extra?: Record<string, string>): Headers;
  fermer(): Promise<void>;
};

export const URL_APPLICATION = "http://127.0.0.1:3999";

export function preparerBanc(
  options: { trustedIpHeader?: "x-vercel-forwarded-for" | null; secret?: Buffer | null; port?: CodeMailer } = {},
): Banc {
  const mailer = createCaptureCodeMailer();
  const cookies = new Map<string, string>();
  const setCookies: string[] = [];
  const database = createDatabase("vadrouille_auth");
  const verrous = createDatabase("vadrouille_auth");
  const operations = createAuthOperations({
    environment: "ci",
    secret: options.secret === undefined ? randomBytes(32) : options.secret,
    baseUrl: URL_APPLICATION,
    appUrl: URL_APPLICATION,
    trustedIpHeader: options.trustedIpHeader ?? null,
    database,
    verrous,
    mailer: options.port ?? mailer,
    onSetCookie(valeur) {
      setCookies.push(valeur);
      const [paire = "", ...attributs] = valeur.split(";");
      const egal = paire.indexOf("=");
      const nom = paire.slice(0, egal).trim();
      const contenu = paire.slice(egal + 1).trim();
      const expire = attributs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || contenu === "";
      if (expire) cookies.delete(nom);
      else cookies.set(nom, contenu);
    },
  });
  return {
    operations,
    mailer,
    cookies,
    setCookies,
    enTetes(extra = {}) {
      const enTetes = new Headers(extra);
      if (cookies.size > 0) enTetes.set("cookie", [...cookies].map(([nom, contenu]) => `${nom}=${contenu}`).join("; "));
      return enTetes;
    },
    async fermer() {
      await Promise.all([database.$client.end(), verrous.$client.end()]);
    },
  };
}

/** Adresse canonique propre au test. */
export function adresse(prefixe = "b3b"): CanonicalEmail {
  const lu = parseEmailAddress(`${prefixe}-${unique()}@exemple.test`);
  if (!lu.ok) throw new Error("adresse de test refusée");
  return lu.email;
}

/** Forme canonique d'une adresse donnée par le test (refus : erreur). */
export function canonique(entree: string): CanonicalEmail {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse de test refusée");
  return lu.email;
}

/** Demande un code et rend celui que le double de capture a reçu. */
export async function demanderCode(banc: Banc, email: CanonicalEmail): Promise<string> {
  const envoi = await banc.operations.requestCode(email);
  if (!envoi.ok) throw new Error(`requestCode refusé : ${envoi.code}`);
  const code = banc.mailer.dernierCode(email);
  if (code === undefined) throw new Error("aucun code capturé");
  return code;
}

/** Un code faux, différent de `code`, de même forme. */
export const codeFaux = (code: string) => (code === "000000" ? "111111" : "000000");

/** Identifiant de vérification de Better Auth 1.7.7 pour une adresse (`sign-in-otp-<adresse>`). */
export const identifiant = (email: CanonicalEmail) => `sign-in-otp-${email}`;

/** Jeton de session du cookie courant (partie avant la signature), ou `undefined`. */
export function jetonDuCookie(banc: Banc): string | undefined {
  for (const [nom, contenu] of banc.cookies) if (nom.endsWith("session_token")) return decodeURIComponent(contenu).split(".")[0];
  return undefined;
}

/** Connexion complète : code demandé puis vérifié ; rend la session ouverte. */
export async function connecter(banc: Banc, email: CanonicalEmail, enTetes?: Headers) {
  const code = await demanderCode(banc, email);
  const resultat = await banc.operations.verifyCode({ email, code, headers: enTetes });
  if (!resultat.ok) throw new Error(`verifyCode refusé : ${resultat.code}`);
  return resultat;
}
