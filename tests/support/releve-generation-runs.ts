import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Relevé des écritures de `generation_runs` par le code de `src/` (migration 0016_restriction_update_generation_runs,
 * décision 0120 S8 point 1 : l'`UPDATE` de `vadrouille_app` est accordé sur la liste des colonnes que `src/` écrit).
 * Lecture du texte seulement (aucune exécution, aucune importation de `src/`). Partagé par le test de forme de la
 * migration (`tests/unit/db/migration-restriction-update.test.ts`) et par le test de base qui joue chaque `UPDATE` relevé
 * sous `vadrouille_app` (`tests/db/restriction-update-generation-runs.test.ts`).
 *
 * Chaque requête de `src/` qui modifie `generation_runs` est un gabarit littéral qui commence par
 * `UPDATE public.generation_runs SET` (forme de tout le serveur) ; une autre forme (alias, liste entre parenthèses, chaîne
 * entre guillemets, Drizzle `.update(generationRuns)`) fait échouer le relevé plutôt que de passer inaperçue.
 */

export type UpdateReleve = {
  /** Chemin relatif à la racine du dépôt. */
  readonly fichier: string;
  /** Ligne (à partir de 1) du début de la requête. */
  readonly ligne: number;
  /** Texte de la requête, interpolations `${…}` remplacées par `x` (la requête reste du SQL valide). */
  readonly texte: string;
  /** Colonnes affectées par `SET`, dans l'ordre. */
  readonly colonnes: readonly string[];
  /** Plus grand numéro de paramètre (`$n`) de la requête. */
  readonly parametres: number;
};

export type Releve = {
  readonly updates: readonly UpdateReleve[];
  /** Mentions de `UPDATE … generation_runs` dans le code (hors commentaires de doc), relevées ou non. */
  readonly mentions: number;
  /** Fichiers qui écrivent `generation_runs` par Drizzle (`.update(generationRuns)`) : attendu vide. */
  readonly drizzle: readonly string[];
  /** Requêtes `INSERT INTO … generation_runs … DO UPDATE` : attendu vide. */
  readonly insertionsAvecMiseAJour: readonly string[];
};

const GABARIT_UPDATE = /`(UPDATE\s+(?:public\.)?"?generation_runs"?\s[^`]*)`/g;
const GABARIT_INSERT = /`(INSERT\s+INTO\s+(?:public\.)?"?generation_runs"?\s[^`]*)`/g;
const MENTION_UPDATE = /UPDATE\s+(?:public\.)?"?generation_runs"?\s+SET\b/gi;
const DRIZZLE = /\.update\(\s*(?:\w+\.)?generationRuns\b/;
const FORME = /^UPDATE\s+public\.generation_runs\s+SET\s+([\s\S]*?)\s+WHERE\s/;

/** Fichiers `.ts` et `.tsx` de `src/`, hors tests. */
function fichiersSource(racine: string): string[] {
  const dossier = path.join(racine, "src");
  return readdirSync(dossier, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join("src", f))
    .sort();
}

/** Découpe la liste du `SET` aux virgules de premier niveau (hors parenthèses et chaînes). */
function affectations(liste: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let chaine = false;
  let courant = "";
  for (const c of liste) {
    if (c === "'") chaine = !chaine;
    else if (!chaine && c === "(") profondeur += 1;
    else if (!chaine && c === ")") profondeur -= 1;
    if (c === "," && profondeur === 0 && !chaine) {
      morceaux.push(courant.trim());
      courant = "";
    } else courant += c;
  }
  morceaux.push(courant.trim());
  return morceaux;
}

function colonnesDuSet(fichier: string, texte: string): string[] {
  const forme = FORME.exec(texte);
  if (forme === null) throw new Error(`${fichier} : UPDATE de generation_runs hors de la forme « UPDATE public.generation_runs SET … WHERE » : ${texte.slice(0, 120)}`);
  return affectations(forme[1] ?? "").map((affectation) => {
    const colonne = /^"?([a-z_]+)"?\s*=/.exec(affectation);
    if (colonne === null) throw new Error(`${fichier} : affectation non reconnue dans le SET : ${affectation}`);
    return colonne[1] ?? "";
  });
}

/** Relève, dans `src/` sous `racine`, chaque écriture de `generation_runs`. */
export function releverEcrituresGenerationRuns(racine: string): Releve {
  const updates: UpdateReleve[] = [];
  const drizzle: string[] = [];
  const insertionsAvecMiseAJour: string[] = [];
  let mentions = 0;
  for (const fichier of fichiersSource(racine)) {
    const source = readFileSync(path.join(racine, fichier), "utf8");
    // Les commentaires de doc (lignes qui commencent par `*` ou `//`) peuvent citer une requête sans l'exécuter.
    const code = source
      .split("\n")
      .map((l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? "" : l))
      .join("\n");
    mentions += [...code.matchAll(MENTION_UPDATE)].length;
    if (DRIZZLE.test(code)) drizzle.push(fichier);
    for (const m of code.matchAll(GABARIT_INSERT)) if (/\bDO\s+UPDATE\b/i.test(m[1] ?? "")) insertionsAvecMiseAJour.push(fichier);
    for (const m of code.matchAll(GABARIT_UPDATE)) {
      const brut = m[1] ?? "";
      const texte = brut.replace(/\$\{[^}]*\}/g, "x");
      const numeros = [...texte.matchAll(/\$(\d+)/g)].map((p) => Number(p[1]));
      updates.push({
        fichier,
        ligne: code.slice(0, m.index).split("\n").length,
        texte,
        colonnes: colonnesDuSet(fichier, texte),
        parametres: numeros.length === 0 ? 0 : Math.max(...numeros),
      });
    }
  }
  return { updates, mentions, drizzle, insertionsAvecMiseAJour };
}

/** Colonnes de la liste `GRANT UPDATE (…) ON public.generation_runs TO vadrouille_app` d'un texte de migration. */
export function colonnesAccordees(migration: string): string[] {
  const m = /GRANT UPDATE \(([^)]*)\) ON public\.generation_runs TO vadrouille_app;/.exec(migration);
  if (m === null) throw new Error("GRANT UPDATE (…) ON public.generation_runs TO vadrouille_app absent");
  return (m[1] ?? "").split(",").map((c) => c.trim());
}
