/**
 * Lecture des workflows de la base (`db-migrate.yml`, décision 0056 ; `db-releve.yml`, décision 0057) par les tests,
 * sans analyseur YAML : le sous-ensemble employé par ces deux fichiers seulement (clés simples, chaînes entre
 * guillemets sans échappement, entre apostrophes, scalaires littéraux `|`). Toute autre forme fait échouer la lecture
 * plutôt que d'être devinée.
 */

export type Etape = {
  /** Variables de l'`env:` de l'étape, valeurs décodées (scalaire littéral : lignes jointes, saut de ligne final). */
  readonly env: Readonly<Record<string, string>>;
  /** Clés de l'`env:` dans l'ordre du fichier. */
  readonly cles: readonly string[];
  /** Texte brut de chaque valeur de l'`env:`, tel qu'écrit après `clé:`. */
  readonly brut: Readonly<Record<string, string>>;
  /** Bloc `run: |`, sans l'indentation YAML. */
  readonly run: string;
  /** `shell:` de l'étape, s'il est écrit. */
  readonly shell?: string;
};

const indentation = (ligne: string) => ligne.search(/\S/);

/** Lignes d'un bloc qui suit la ligne `debut` (plus indentées qu'elle ; lignes vides comprises). */
function blocSuivant(lignes: readonly string[], debut: number): string[] {
  const base = indentation(lignes[debut]!);
  const bloc: string[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() !== "" && indentation(ligne) <= base) break;
    bloc.push(ligne);
  }
  while (bloc.length > 0 && bloc[bloc.length - 1]!.trim() === "") bloc.pop();
  return bloc;
}

/** Scalaire littéral `|` : indentation de la première ligne retirée, saut de ligne final (« clip »). */
function litteral(bloc: readonly string[]): string {
  const premiere = bloc.find((l) => l.trim() !== "");
  if (premiere === undefined) return "";
  const marge = indentation(premiere);
  return `${bloc.map((l) => (l.trim() === "" ? "" : l.slice(marge))).join("\n")}\n`;
}

function scalaire(brut: string): string {
  if (/^"[^"\\]*"$/.test(brut)) return brut.slice(1, -1);
  if (/^'([^']|'')*'$/.test(brut)) return brut.slice(1, -1).replace(/''/g, "'");
  if (/^["'|>]/.test(brut)) throw new Error(`valeur YAML non prise en charge : ${brut}`);
  return brut;
}

/** Étape nommée `nom` (`- name: <nom>`) d'un workflow. */
export function etape(workflow: string, nom: string): Etape {
  const lignes = workflow.split("\n");
  const debut = lignes.findIndex((l) => l.trim() === `- name: ${nom}`);
  if (debut < 0) throw new Error(`étape introuvable : ${nom}`);
  const tiret = lignes[debut]!.indexOf("-");
  const corps: string[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() !== "" && indentation(ligne) <= tiret) break;
    corps.push(ligne);
  }
  const cleEtape = tiret + 2;
  const champ = (cle: string) => corps.findIndex((l) => indentation(l) === cleEtape && l.trim().startsWith(`${cle}:`));
  const iRun = champ("run");
  if (iRun < 0 || corps[iRun]!.trim() !== "run: |") throw new Error(`run: | introuvable : ${nom}`);
  const run = litteral(blocSuivant(corps, iRun));
  const iShell = champ("shell");
  const shell = iShell < 0 ? undefined : corps[iShell]!.trim().slice("shell:".length).trim();
  const env: Record<string, string> = {};
  const brut: Record<string, string> = {};
  const cles: string[] = [];
  const iEnv = champ("env");
  if (iEnv >= 0) {
    const bloc = blocSuivant(corps, iEnv);
    const marge = cleEtape + 2;
    for (let i = 0; i < bloc.length; i++) {
      const ligne = bloc[i]!;
      if (ligne.trim() === "" || ligne.trim().startsWith("#")) continue;
      if (indentation(ligne) !== marge) continue;
      const m = /^([A-Za-z_][A-Za-z0-9_]*): ?(.*)$/.exec(ligne.trim());
      if (!m) throw new Error(`ligne d'env: illisible : ${ligne}`);
      const [, cle, valeur] = m as unknown as [string, string, string];
      cles.push(cle);
      brut[cle] = valeur;
      env[cle] = valeur === "|" ? litteral(blocSuivant(bloc, i)) : scalaire(valeur);
    }
  }
  return { env, cles, brut, run, shell };
}

/** Lignes utiles d'un workflow : sans commentaire de ligne ni ligne vide. */
export function lignesUtiles(workflow: string): string[] {
  return workflow.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
}

/** Remplace `avant` par `apres` dans `texte`, en exigeant exactement une occurrence. */
export function remplacerUneFois(texte: string, avant: string, apres: string): string {
  const n = texte.split(avant).length - 1;
  if (n !== 1) throw new Error(`substitution : ${n} occurrence(s) de ${JSON.stringify(avant.slice(0, 80))} au lieu d'une`);
  return texte.replace(avant, () => apres);
}

/** Premiers mots des commandes simples d'un script bash (sous-ensemble : une commande par segment). */
export function commandes(script: string): string[] {
  const mots: string[] = [];
  for (const brute of script.split("\n")) {
    const ligne = brute.replace(/^\s+/, "");
    if (ligne === "" || ligne.startsWith("#")) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*\(\) \{$/.test(ligne)) continue;
    // Branches d'un `case` : `motif) affectation ;;`.
    if (/^[^\s()]+\) /.test(ligne)) {
      const action = ligne.slice(ligne.indexOf(")") + 1).trim();
      if (/^[a-z_]+(\+)?=/.test(action) || action === ";;") continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*(\+)?=/.test(ligne) && !ligne.includes("$(")) continue;
    const net = ligne
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/\[\[.*?\]\]/g, "[[");
    for (const segment of net.split(/;|&&|\|\||\||\$\(|\bthen\b|\belse\b|\bdo\b/)) {
      const s = segment.trim().replace(/^!\s*/, "");
      if (s === "" || s === ")" || s.startsWith("#")) continue;
      if (/^[A-Za-z_][A-Za-z0-9_]*(\+)?=/.test(s)) continue;
      mots.push(s.split(/\s+/)[0]!.replace(/\)+$/, ""));
    }
  }
  return mots;
}
