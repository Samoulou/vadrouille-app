import "server-only";

import { createHash } from "node:crypto";

import type { DBAdapter, Where } from "better-auth";

/**
 * Jetons de session hachés (décision 0077 § 5.5, B3-TL-9 ; nom de module fixé). Better Auth 1.7.7 stocke le jeton
 * de session en clair dans `sessions.token` (vérification 7.1, amendement de 0008) : cet adaptateur enveloppe
 * l'adaptateur Drizzle et remplace la valeur de `token` par son SHA-256 hexadécimal :
 * - à l'écriture (`create`, `update`, `updateMany` et toute autre méthode qui reçoit `data` ou `update`) ;
 * - dans **toute** condition de recherche sur `token` (opérateurs `eq` et `in`), quelle que soit la méthode
 *   (`findOne`, `findMany`, `update`, `delete`, `deleteMany`, `count`, `consumeOne`…), transactions comprises.
 * Tout autre opérateur sur `token` est refusé (aucune recherche partielle sur un haché).
 *
 * Le cookie garde le jeton en clair : dans les lignes rendues à la bibliothèque, un `token` haché que cet appel a
 * calculé est remplacé par le jeton en clair d'origine (sinon le cookie de prolongation porterait le haché). SHA-256
 * sans clé, admis par la Sécurité sous la condition d'un jeton aléatoire d'au moins 128 bits (vérification 7.1 :
 * `generateId(32)`, alphabet de 62 signes, environ 190 bits). Le jeton, en clair ou haché, n'est jamais journalisé
 * ni joint à une erreur.
 */

const MODELES_SESSION = new Set(["session", "sessions"]);
/** Méthodes de données de l'adaptateur de Better Auth 1.7.7 (`createAdapterFactory`) ; les autres passent telles quelles. */
const METHODES_DONNEES = new Set(["create", "update", "updateMany", "findOne", "findMany", "delete", "deleteMany", "consumeOne", "incrementOne", "count"]);
const CHAMP = "token";

/** Opérateur refusé sur `token` ; ne porte aucune valeur. */
export class RechercheJetonRefuseeError extends Error {
  override name = "RechercheJetonRefuseeError";

  constructor() {
    super("Recherche sur le jeton de session refusée (opérateur autre que eq ou in).");
  }
}

/** SHA-256 hexadécimal du jeton. */
export function hacherJeton(jeton: string): string {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

type Correspondances = Map<string, string>;

function hacher(jeton: unknown, vus: Correspondances): unknown {
  if (typeof jeton !== "string") return jeton;
  const hache = hacherJeton(jeton);
  vus.set(hache, jeton);
  return hache;
}

function conditions(where: readonly Where[], vus: Correspondances): Where[] {
  return where.map((clause) => {
    if (clause.field !== CHAMP) return clause;
    const operateur = clause.operator ?? "eq";
    if (operateur === "eq") return { ...clause, value: hacher(clause.value, vus) as Where["value"] };
    if (operateur === "in" && Array.isArray(clause.value)) {
      return { ...clause, value: (clause.value as unknown[]).map((v) => hacher(v, vus)) as Where["value"] };
    }
    throw new RechercheJetonRefuseeError();
  });
}

function donnees(valeur: unknown, vus: Correspondances): unknown {
  if (typeof valeur !== "object" || valeur === null || !(CHAMP in valeur)) return valeur;
  return { ...valeur, [CHAMP]: hacher((valeur as Record<string, unknown>)[CHAMP], vus) };
}

function restaurer(resultat: unknown, vus: Correspondances): unknown {
  if (vus.size === 0) return resultat;
  if (Array.isArray(resultat)) return resultat.map((ligne) => restaurer(ligne, vus));
  if (typeof resultat !== "object" || resultat === null || !(CHAMP in resultat)) return resultat;
  const hache = (resultat as Record<string, unknown>)[CHAMP];
  const clair = typeof hache === "string" ? vus.get(hache) : undefined;
  return clair === undefined ? resultat : { ...resultat, [CHAMP]: clair };
}

/** Arguments d'une méthode de l'adaptateur sur le modèle de session : `where`, `data` et `update` transformés. */
function transformerArguments(args: unknown[], vus: Correspondances): unknown[] {
  const [premier, ...reste] = args;
  if (typeof premier !== "object" || premier === null) return args;
  const parametres = premier as Record<string, unknown>;
  if (typeof parametres.model !== "string" || !MODELES_SESSION.has(parametres.model)) return args;
  const copie: Record<string, unknown> = { ...parametres };
  if (Array.isArray(parametres.where)) copie.where = conditions(parametres.where as Where[], vus);
  if ("data" in parametres) copie.data = donnees(parametres.data, vus);
  if ("update" in parametres) copie.update = donnees(parametres.update, vus);
  return [copie, ...reste];
}

/**
 * Enveloppe `adaptateur` (et chaque adaptateur de transaction qu'il fournit). L'adaptateur de Better Auth 1.7.7 est un
 * objet littéral de fonctions fléchées (`createAdapterFactory`) : une copie dont les méthodes de données et
 * `transaction` sont remplacées suffit, sans `Proxy`.
 */
export function envelopperJetons<A extends DBAdapter>(adaptateur: A): A {
  const copie: Record<string, unknown> = { ...adaptateur };
  for (const [nom, valeur] of Object.entries(adaptateur)) {
    if (typeof valeur !== "function") continue;
    if (nom === "transaction") {
      copie[nom] = (rappel: (trx: DBAdapter) => Promise<unknown>) =>
        adaptateur.transaction((trx) => rappel(envelopperJetons(trx as DBAdapter)) as Promise<never>);
    } else if (METHODES_DONNEES.has(nom)) {
      copie[nom] = async (...args: unknown[]) => {
        const vus: Correspondances = new Map();
        const resultat: unknown = await (valeur as (...a: unknown[]) => unknown)(...transformerArguments(args, vus));
        return restaurer(resultat, vus);
      };
    }
  }
  return copie as A;
}
