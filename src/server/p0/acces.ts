import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { isProductionDeployment } from "@/dev/flags";
import {
  CAUSES_ENV_P0,
  CODES_ENV_P0,
  decoderJetonSaisi,
  DIRECTIVES_ENV_P0,
  EXCEPTIONS_ENV_P0,
  lireEnvP0,
  VERDICTS_ENV_P0,
  ZONES_ENV_P0,
  type CodeEnvP0,
  type DiagnosticSortie,
} from "@/server/env/p0";
import { logEvent } from "@/server/log";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Code et cookie d'accès du mode réel (décision 0055, section 2, D19 ; avis de la Sécurité S-2). **Seul module** qui
 * manipule le code saisi et le cookie ; repris tel quel par P0r4 (écrans de lecture, relecture Routes, jugement).
 *
 * - Le code attendu n'est connu que par ses **octets**, rendus par `lireEnvP0` ; ce module ne lit jamais la variable.
 * - Saisie : décodée par `decoderJetonSaisi` (même `decodeSecret` que la variable, sans `trim()`), puis comparée en
 *   temps constant : `K_cmp = HMAC-SHA-256(code, "vadrouille/p0/comparaison/v1")`, empreintes `HMAC(K_cmp, ·)` des deux
 *   suites d'octets, `timingSafeEqual` sur 32 octets (aucune dépendance du temps à la longueur ou au contenu du code).
 * - Essais (décision 0165 § 1, voie (c), confirmée par la Sécurité) : 5 refus par heure glissante ; le bon code n'est
 *   jamais compté contre lui. La saisie est comparée d'abord ; le bon code est accepté sans verrou ni compte ; seuls les
 *   refus sont comptés, sous verrou consultatif, dans `prototype.run_attempts` (seule la colonne `resultat` est écrite ;
 *   aucune adresse, aucune empreinte, aucune longueur). L'attente du verrou est bornée par `lock_timeout`
 *   (`ATTENTE_VERROU_ESSAIS`, risque 4 de l'amendement de 0165) : au-delà, `indisponible`, sans ligne écrite.
 * - Cookie `__Host-p0_acces` = `v1.<exp>.<mac>`, `mac = hex(HMAC(K_cookie, "p0/v1/acces/p0-reel/" + exp))`,
 *   `K_cookie = HMAC-SHA-256(code, "vadrouille/p0/cookie/v1")` ; échéance fixe de 12 heures, jamais prolongée ; une
 *   rotation du code invalide tous les cookies au déploiement suivant.
 * Ni le code ni le cookie n'atteignent un journal, une erreur ou une réponse autre que l'en-tête `Set-Cookie`. Aucune
 * comparaison du code ou du MAC par `===` (test statique).
 */

/** Nom du cookie (préfixe `__Host-` : `Secure`, `Path=/`, aucun `Domain`, imposés par le navigateur). */
export const NOM_COOKIE_ACCES = "__Host-p0_acces";
/** Durée du cookie : 12 heures (0055, section 2 point 4). */
export const DUREE_COOKIE_S = 43_200;
/** Refus par heure glissante (0055, section 2 point 3, amendé par 0165 § 1.2) ; le bon code n'est jamais compté contre lui. */
export const ESSAIS_PAR_HEURE = 5;
/**
 * Attente maximale du verrou des mauvaises saisies (`lock_timeout` local à la transaction ; risque 4 de l'amendement de
 * 0165, revue de #1077, mineur 3). Même borne que `ATTENTE_VERROU` de `src/server/auth/index.ts` (5 s) : un afflux de
 * mauvaises saisies ne tient pas une connexion chacune plus longtemps que cela ; au-delà, Postgres lève 55P03, la
 * transaction est annulée et la saisie reçoit `indisponible`, sans ligne écrite (échec fermé). Le bon code ne prend
 * pas le verrou et n'est pas concerné. Texte écrit dans la requête (constante, aucune valeur tirée de la saisie).
 */
export const ATTENTE_VERROU_ESSAIS = "5s";
/** Saisie au-delà de cette longueur : essai refusé et compté, sans décodage ni calcul (0055, section 2 point 2). */
export const LONGUEUR_SAISIE_MAX = 256;

/** Attributs du cookie (`Max-Age` en secondes). */
export const OPTIONS_COOKIE_ACCES = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: DUREE_COOKIE_S,
} as const;

const ETIQUETTE_COMPARAISON = "vadrouille/p0/comparaison/v1";
const ETIQUETTE_COOKIE = "vadrouille/p0/cookie/v1";
const ETIQUETTE_EMPREINTE = "vadrouille/p0/empreinte-cookie/v1";
const PREFIXE_SIGNE = "p0/v1/acces/p0-reel/";
const FORME_COOKIE = /^v1\.([0-9]{10})\.([0-9a-f]{64})$/;

const hmac = (cle: Buffer, donnee: Buffer | string): Buffer => createHmac("sha256", cle).update(donnee).digest();

/** Comparaison des octets saisis aux octets attendus, en temps constant et sans fuite de longueur. */
export function memeCode(saisi: Buffer, attendu: Buffer): boolean {
  const cleComparaison = hmac(attendu, ETIQUETTE_COMPARAISON);
  return timingSafeEqual(hmac(cleComparaison, saisi), hmac(cleComparaison, attendu));
}

/** Signature d'une échéance (texte de 10 chiffres), en hexadécimal minuscule. */
function signer(attendu: Buffer, echeance: string): string {
  return hmac(hmac(attendu, ETIQUETTE_COOKIE), PREFIXE_SIGNE + echeance).toString("hex");
}

/**
 * Empreinte d'un cookie d'accès (décision 0129 § 3 : limite de débit de la recherche de ville, par cookie) :
 * `hex(HMAC(K_empreinte, cookie))`, `K_empreinte = HMAC-SHA-256(code, "vadrouille/p0/empreinte-cookie/v1")`. Clé dérivée
 * du code : une empreinte lue en base ne permet ni de retrouver le cookie, ni d'éprouver un cookie deviné sans le code ;
 * une rotation du code change toutes les empreintes. 64 caractères hexadécimaux.
 */
export function empreinteCookieAcces(attendu: Buffer, cookie: string): string {
  return hmac(hmac(attendu, ETIQUETTE_EMPREINTE), cookie).toString("hex");
}

/** Valeur du cookie émis à `maintenantMs` : échéance = émission + 12 heures, en secondes depuis l'époque. */
export function valeurCookieAcces(attendu: Buffer, maintenantMs: number): string {
  const echeance = String(Math.floor(maintenantMs / 1000) + DUREE_COOKIE_S);
  return `v1.${echeance}.${signer(attendu, echeance)}`;
}

/**
 * Vérification d'un cookie reçu : forme exacte, `maintenant < exp ≤ maintenant + 12 h`, signature recalculée et
 * comparée par `timingSafeEqual`. Faux sur toute autre entrée.
 */
export function cookieAccesValide(brut: unknown, attendu: Buffer, maintenantMs: number): boolean {
  if (typeof brut !== "string") return false;
  const forme = FORME_COOKIE.exec(brut);
  if (forme === null) return false;
  const texteEcheance = forme[1] ?? "";
  const recue = Buffer.from(forme[2] ?? "", "utf8");
  const echeance = Number(texteEcheance);
  const maintenant = Math.floor(maintenantMs / 1000);
  if (!(maintenant < echeance && echeance <= maintenant + DUREE_COOKIE_S)) return false;
  // Deux textes de 64 caractères hexadécimaux (forme vérifiée ci-dessus) : longueurs égales par construction.
  return timingSafeEqual(Buffer.from(signer(attendu, texteEcheance), "utf8"), recue);
}

// --- Ouverture -----------------------------------------------------------------------------------------------

/** Environnement et horloge, injectés par les tests ; par défaut `process.env` (lu par `lireEnvP0`) et `Date.now`. */
export type DependancesAcces = {
  readonly env?: NodeJS.ProcessEnv;
  readonly execArgv?: readonly string[];
  readonly maintenant?: () => number;
};

/** Codes de la garde fermée : ceux de `lireEnvP0`, puis le déploiement de production (0017 § 11.0). */
export const CODES_GARDE_FERMEE = [...CODES_ENV_P0, "production_deployment"] as const;
export type CodeGardeFermee = CodeEnvP0 | "production_deployment";

/** Causes que `p0.guard_closed` peut nommer (décision 0058) : celles de la barrière de sortie. */
export const CAUSES_GARDE_FERMEE: readonly string[] = CAUSES_ENV_P0;
/** Marques d'exception, classes de racine et verdicts que `p0.guard_closed` peut écrire (décision 0062 § 5). */
export const EXCEPTIONS_GARDE_FERMEE: readonly string[] = EXCEPTIONS_ENV_P0;
export const ZONES_GARDE_FERMEE: readonly string[] = ZONES_ENV_P0;
export const VERDICTS_GARDE_FERMEE: readonly string[] = VERDICTS_ENV_P0;
/** Jetons des directives que `p0.guard_closed` peut écrire (`openssl_conf_directives`, décision 0065 § 4 point 3). */
export const DIRECTIVES_GARDE_FERMEE: readonly string[] = DIRECTIVES_ENV_P0;

export type ResultatOuverture = { readonly ok: true; readonly attendu: Buffer } | { readonly ok: false; readonly code: CodeGardeFermee };

/**
 * Conditions (1) à (7) de `lireEnvP0`, puis `isProductionDeployment()` faux (0017 § 11.0, contrôlé seul bien qu'il
 * soit impliqué par la condition (2)). Un refus écrit `p0.guard_closed` avec son code fermé, jamais une valeur, sauf
 * si l'appelant passe `journaliser = false` (affichage de la page : voir `etatPageAcces`).
 */
export function ouvertureP0(dependances: DependancesAcces = {}, journaliser = true): ResultatOuverture {
  const { resultat, diagnostic } = ouvrir(dependances);
  if (!resultat.ok && journaliser) logEvent("p0.guard_closed", { guard: resultat.code, ...diagnostic });
  return resultat;
}

/**
 * Ouverture et diagnostic de la barrière de sortie (décisions 0058 et 0062) : nom de la variable ou de l'option de
 * proxy ou de TLS en cause, marque de l'exception, classe de racine et verdict de l'examen d'`OPENSSL_CONF`
 * (`openssl_conf_zone`, `openssl_conf_verdict`) et, avec `section_nodejs`, directives en jetons
 * (`openssl_conf_directives`, 0065), écrits avec le code dans `p0.guard_closed` ; jamais une valeur.
 */
function ouvrir(dependances: DependancesAcces): { readonly resultat: ResultatOuverture; readonly diagnostic: DiagnosticSortie } {
  let diagnostic: DiagnosticSortie = {};
  const lu = lireEnvP0(dependances.env, dependances.execArgv, (resultat) => {
    diagnostic = resultat;
  });
  const resultat: ResultatOuverture = !lu.ok
    ? lu
    : isProductionDeployment(dependances.env)
      ? { ok: false, code: "production_deployment" }
      : { ok: true, attendu: lu.jeton };
  return { resultat, diagnostic };
}

/** État de la page de saisie : fermée (404), saisie attendue, ou accès déjà ouvert par un cookie valide. */
export type EtatPageAcces = "fermee" | "saisie" | "ouverte";

/** Refus propres à un déploiement de production : jamais journalisés à l'affichage de la page. */
const REFUS_DE_PRODUCTION: ReadonlySet<CodeGardeFermee> = new Set(["production_refused", "environment_refused", "production_deployment"]);

/**
 * Lu à chaque affichage de la page (`GET`). Revue du head 6be9299, mineur 11 : en production, la page est publique et un
 * robot pourrait inonder le journal ; l'affichage n'y écrit donc **rien** (refus de production, ou déploiement de
 * production). Hors production, les préversions sont publiques depuis la désactivation de la protection Vercel
 * (avis 0164, 2026-11-09). L'affichage y écrit `p0.guard_closed`, par choix (décision 0165 § 2) : c'est l'outil du relevé
 * de 0055 S-1 point 4 sur `p0-reel` (ouvrir la page et lire le code). Un inconnu peut l'inonder, ce qui ne produit que du
 * bruit dans un journal gardé une heure. Depuis 0163, seules `main` et `p0-reel` sont construites. Les actions
 * journalisent toujours.
 */
export function etatPageAcces(cookie: string | undefined, dependances: DependancesAcces = {}): EtatPageAcces {
  const { resultat: ouverture, diagnostic } = ouvrir(dependances);
  if (!ouverture.ok) {
    if (!REFUS_DE_PRODUCTION.has(ouverture.code) && !isProductionDeployment(dependances.env)) {
      logEvent("p0.guard_closed", { guard: ouverture.code, ...diagnostic });
    }
    return "fermee";
  }
  const maintenant = (dependances.maintenant ?? Date.now)();
  return cookieAccesValide(cookie, ouverture.attendu, maintenant) ? "ouverte" : "saisie";
}

// --- Saisie du code --------------------------------------------------------------------------------------------

/**
 * Issue d'une saisie : cookie à poser, ou code fermé. `fermee` : garde fermée (aucune base lue) ; `indisponible` :
 * base injoignable, attente du verrou dépassée ou erreur, l'essai n'a pas pu être compté (échec fermé).
 */
export type ResultatSaisie =
  | { readonly ok: true; readonly cookie: string }
  | { readonly ok: false; readonly code: "fermee" | "invalid_code" | "too_many_attempts" | "indisponible" };

const SQL_ATTENTE_VERROU = `SELECT pg_catalog.set_config('lock_timeout', '${ATTENTE_VERROU_ESSAIS}', true)`;
const SQL_VERROU = "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('p0_run_attempts'))";
const SQL_COMPTE = `SELECT pg_catalog.count(*) AS n FROM prototype.run_attempts
WHERE resultat = 'refuse' AND created_at > pg_catalog.now() - pg_catalog.make_interval(mins => 60)`;
const SQL_ESSAI = "INSERT INTO prototype.run_attempts (resultat) VALUES ($1)";

/** Résultat d'un essai : la saisie est-elle le code attendu ? Une saisie trop longue ou indécodable est refusée. */
function essaiAccepte(saisie: unknown, attendu: Buffer): boolean {
  if (typeof saisie !== "string" || saisie.length > LONGUEUR_SAISIE_MAX) return false;
  const octets = decoderJetonSaisi(saisie);
  return octets !== null && memeCode(octets, attendu);
}

/**
 * Saisie du code (formulaire `POST` de l'action serveur ; décision 0165 § 1.2) : 5 refus par heure glissante ; le bon
 * code n'est jamais compté contre lui.
 * 1. Garde, sans base si elle est fermée (`fermee`).
 * 2. Comparaison (`essaiAccepte`), avant toute connexion : calcul local seulement.
 * 3. Bon code : transaction `vadrouille_prototype` sans verrou ni compte, ligne `accepte`, `COMMIT`, puis cookie (rendu
 *    seulement après un `COMMIT` réussi).
 * 4. Mauvais code (ou saisie hors forme) : transaction avec `lock_timeout` local (`ATTENTE_VERROU_ESSAIS`), verrou
 *    consultatif et compte des seuls refus des 60 dernières minutes ; à 5 ou plus, `too_many_attempts` sans ligne
 *    nouvelle ; sinon ligne `refuse`, `invalid_code`. Attente du verrou au-delà de la borne : `indisponible`, sans ligne.
 * Base injoignable, attente du verrou dépassée, compte illisible ou toute erreur : `indisponible`, jamais un cookie
 * (échec fermé).
 */
export async function saisirCodeAcces(saisie: unknown, pool: () => PoolSql, dependances: DependancesAcces = {}): Promise<ResultatSaisie> {
  const ouverture = ouvertureP0(dependances);
  if (!ouverture.ok) return { ok: false, code: "fermee" };
  const accepte = essaiAccepte(saisie, ouverture.attendu);
  let client: ClientSql;
  try {
    client = await pool().connect();
  } catch {
    return { ok: false, code: "indisponible" };
  }
  let enTransaction = false;
  try {
    await client.query("BEGIN");
    enTransaction = true;
    if (!accepte) {
      // `set_config(…, true)` : borne locale à cette transaction, levée au `COMMIT` ou au `ROLLBACK`.
      await client.query(SQL_ATTENTE_VERROU);
      await client.query(SQL_VERROU);
      const refus = Number((await client.query(SQL_COMPTE)).rows[0]?.n);
      if (!Number.isSafeInteger(refus)) throw new Error("p0: refus illisibles");
      if (refus >= ESSAIS_PAR_HEURE) {
        await client.query("ROLLBACK");
        enTransaction = false;
        return { ok: false, code: "too_many_attempts" };
      }
    }
    await client.query(SQL_ESSAI, [accepte ? "accepte" : "refuse"]);
    await client.query("COMMIT");
    enTransaction = false;
    if (!accepte) return { ok: false, code: "invalid_code" };
    return { ok: true, cookie: valeurCookieAcces(ouverture.attendu, (dependances.maintenant ?? Date.now)()) };
  } catch {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    return { ok: false, code: "indisponible" };
  } finally {
    client.release();
  }
}
