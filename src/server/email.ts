import "server-only";

import { EMAIL_INPUT_MAX_LENGTH, stripEdgeSpaces } from "@/contracts/values";

/**
 * Adresse e-mail (spécification B3, B3a point 8 ; décision 0050, B3-TL-6 point 6 ; 0051 point 4). **Une seule**
 * fonction, `parseEmailAddress`, rend la forme canonique ou un refus ; c'est la seule forme utilisée ensuite par le
 * limiteur, par `src/server/auth` et par le port d'envoi (B3b), et par Better Auth (`users.email`,
 * `verifications.identifier`). Seul ce fichier fabrique le type `CanonicalEmail` (règle `no-restricted-syntax`
 * d'`eslint.config.mjs` : ni conversion, ni assertion, ni prédicat de type ailleurs).
 *
 * Forme canonique : espaces U+0020 retirés aux extrémités seulement, puis contrôle de la liste blanche, **puis
 * seulement** `toLowerCase()` (sans paramètre régional) ; rien d'autre (B3-PO-2). L'ordre compte : `toLowerCase()`
 * change des caractères non ASCII en ASCII (signe Kelvin U+212A → `k`). Tout caractère hors de la liste blanche est
 * refusé, jamais corrigé. Le contrôle est un parcours caractère par caractère, après une borne de longueur : aucune
 * expression régulière (0051 point 4.3).
 */

export type CanonicalEmail = string & { readonly __brand: "CanonicalEmail" };

export type ParsedEmail = { readonly ok: true; readonly email: CanonicalEmail } | { readonly ok: false };

const LONGUEUR_MAX = 254;
const PARTIE_LOCALE_MAX = 64;
const LABEL_MAX = 63;

const estLettreOuChiffre = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
const estChiffre = (c: string) => c >= "0" && c <= "9";

/** Partie locale : 1 à 64 caractères de `[A-Za-z0-9._+-]`, sans `.` ni `+` en tête, sans `.` en fin ni `..`. */
function partieLocaleAdmise(locale: string): boolean {
  if (locale.length < 1 || locale.length > PARTIE_LOCALE_MAX) return false;
  for (const c of locale) if (!(estLettreOuChiffre(c) || c === "." || c === "_" || c === "+" || c === "-")) return false;
  if (locale.startsWith(".") || locale.startsWith("+") || locale.endsWith(".")) return false;
  return !locale.includes("..");
}

/** Domaine : au moins deux labels `[A-Za-z0-9-]` de 1 à 63 caractères, sans `-` aux bords ; dernier non numérique. */
function domaineAdmis(domaine: string): boolean {
  const labels = domaine.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length < 1 || label.length > LABEL_MAX) return false;
    for (const c of label) if (!(estLettreOuChiffre(c) || c === "-")) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const dernier = labels[labels.length - 1] ?? "";
  return ![...dernier].every(estChiffre);
}

export function parseEmailAddress(entree: unknown): ParsedEmail {
  if (typeof entree !== "string" || entree.length > EMAIL_INPUT_MAX_LENGTH) return { ok: false };
  const adresse = stripEdgeSpaces(entree); // Décision 0084 : seule implémentation, `src/contracts/values.ts`.
  if (adresse.length === 0 || adresse.length > LONGUEUR_MAX) return { ok: false };
  const arobase = adresse.indexOf("@");
  if (arobase < 0 || adresse.indexOf("@", arobase + 1) >= 0) return { ok: false };
  if (!partieLocaleAdmise(adresse.slice(0, arobase)) || !domaineAdmis(adresse.slice(arobase + 1))) return { ok: false };
  return { ok: true, email: adresse.toLowerCase() as CanonicalEmail };
}

/** Vrai si `valeur` est déjà canonique (`parseEmailAddress` la rend à l'identique) : défense en profondeur, 0051 4.5. */
export function isCanonicalEmail(valeur: unknown): boolean {
  const lu = parseEmailAddress(valeur);
  return lu.ok && lu.email === valeur;
}

/** Clé e-mail du limiteur seulement (décision 0008) : forme canonique, partie locale coupée au premier `+`. */
export function rateLimitEmailKey(email: CanonicalEmail): string {
  const arobase = email.indexOf("@");
  const locale = email.slice(0, arobase);
  const plus = locale.indexOf("+");
  return plus < 0 ? email : `${locale.slice(0, plus)}${email.slice(arobase)}`;
}
