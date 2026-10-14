import "server-only";

import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { posix } from "node:path";

/**
 * Examen du fichier désigné par `OPENSSL_CONF` (décision 0062, sections 4 et 5 ; ticket 341). Appelé seulement par la
 * barrière de sortie (`./egress.ts`), en préversion, quand `OPENSSL_CONF` est posée et que les conditions 1.1 et 1.2 de
 * 0062 § 4 tiennent. Rend un **verdict fermé** et une **classe de racine** du chemin, jamais le chemin, un extrait, un
 * nom de fichier inclus, une taille ni un condensat. Aucune erreur du système de fichiers ne sort : toute exception est
 * rattrapée et vaut `fichier_refuse` (échec fermé).
 *
 * Pourquoi le contenu suffit (0062 § 3.2) : Node lit `OPENSSL_CONF` une fois, au démarrage, et ne charge que la section
 * `nodejs_conf` du fichier (et de ses inclusions), sans repli sur `openssl_conf` (drapeau `CONF_MFLAGS_DEFAULT_SECTION`
 * absent). Un fichier qui ne nomme nulle part `nodejs_conf` n'a donc **aucun effet** sur la configuration OpenSSL de
 * Node, donc aucun sur TLS. Le nom `nodejs_conf` est fixé à la construction de Node (`configure.py`,
 * `--openssl-conf-name`), qui l'écrit dans les `defines` de la construction, visibles dans
 * `process.config.target_defaults.defines` (`NODE_OPENSSL_CONF_NAME=nodejs_conf`) : la condition 1.7 de 0062 § 4
 * (`nomSectionOpensslAdmis`) le vérifie et refuse toute autre construction (`nom_section_refuse`). **Limite restante**
 * (risque résiduel (c) de 0062 § 6) : une version de Node qui changerait la section lue par défaut (règle en vigueur
 * depuis Node 18.5), ou qui cesserait d'exposer ce `define`, rendrait cet examen insuffisant ou toujours fermé. **À
 * relire à chaque passage à une version majeure de Node.**
 *
 * Le chemin est un paramètre : ce module ne lit **aucune** variable d'environnement. Le système de fichiers est
 * injectable (sous-ensemble **synchrone** de `node:fs`, type déclaré ici), sur le modèle de
 * `src/adapters/prototype-loader.ts` (asynchrone, lui) : `verifierSortie` est synchrone (0062 § 4 point 5). Pas de
 * mémoïsation : coût borné (16 fichiers de 64 Kio au plus, dossiers de 64 entrées au plus).
 */

/** Classes de racine du chemin déclaré (0062 § 5.1, liste fermée de 7 valeurs). */
export const ZONES_OPENSSL_CONF = ["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"] as const;
export type ZoneOpensslConf = (typeof ZONES_OPENSSL_CONF)[number];

/** Verdicts, dans l'ordre de priorité de 0062 § 5.1 (le premier échec l'emporte). */
export const VERDICTS_OPENSSL_CONF = [
  "hors_preview",
  "env_differente",
  "nom_section_refuse",
  "chemin_refuse",
  "fichier_refuse",
  "inclusion_refusee",
  "section_nodejs",
  "admis",
] as const;
export type VerdictOpensslConf = (typeof VERDICTS_OPENSSL_CONF)[number];

/** Verdicts rendus par l'examen du chemin et du fichier (les conditions 1.1, 1.2 et 1.7 sont jugées par `egress.ts`). */
export type VerdictExamen = Exclude<VerdictOpensslConf, "hors_preview" | "env_differente" | "nom_section_refuse">;
type Echec = Exclude<VerdictExamen, "admis" | "chemin_refuse">;

/** Système de fichiers de l'examen : sous-ensemble synchrone de `node:fs`, injectable pour les tests. */
export interface SystemeFichiersOpenssl {
  lstatSync(chemin: string): { isFile(): boolean; isDirectory(): boolean; readonly size: number };
  readFileSync(chemin: string): Uint8Array;
  readdirSync(chemin: string): readonly string[];
  realpathSync(chemin: string): string;
}

export const FS_OPENSSL_REEL: SystemeFichiersOpenssl = {
  lstatSync: (chemin) => lstatSync(chemin),
  readFileSync: (chemin) => readFileSync(chemin),
  readdirSync: (chemin) => readdirSync(chemin),
  realpathSync: (chemin) => realpathSync(chemin),
};

/** Bornes de 0062 § 7.1. */
export const OPENSSL_CONF_MAX_OCTETS = 64 * 1024;
export const OPENSSL_CONF_MAX_PROFONDEUR = 2;
export const OPENSSL_CONF_MAX_FICHIERS = 16;
export const OPENSSL_CONF_MAX_ENTREES = 64;

const DEV_NULL = "/dev/null";

/**
 * Classes de racine du chemin déclaré (0062 § 5.1). `/opt/` garde sa classe pour le diagnostic, mais n'est **pas** une
 * racine admise : c'est le dossier des couches Lambda (contenu du déployeur, pas de la plateforme), qu'aucune source de
 * 0062 ne justifie (mineur 2 de la revue du head `b0c1c45`).
 */
const CLASSES: readonly (readonly [string, ZoneOpensslConf])[] = [
  ["/etc/", "etc"],
  ["/usr/", "usr"],
  ["/var/runtime/", "var_runtime"],
  ["/var/lang/", "var_lang"],
  ["/opt/", "opt"],
];

/** Racines en lecture seule du runtime admises (0062 § 4 point 1.3, sans `/opt/`). Tout le reste est refusé. */
const RACINES: readonly string[] = ["/etc/", "/usr/", "/var/runtime/", "/var/lang/"];

/** Classe de racine du chemin **déclaré**, sans accès au système de fichiers (0062 § 5.1). */
export function zoneOpensslConf(chemin: string): ZoneOpensslConf {
  if (chemin === DEV_NULL) return "dev_null";
  return CLASSES.find(([racine]) => chemin.startsWith(racine))?.[1] ?? "autre";
}

const sousRacines = (chemin: string) => RACINES.some((racine) => chemin.startsWith(racine) && chemin.length > racine.length);

/** Entrée des `defines` de la construction de Node qui fixe la section lue (`configure.py`, `--openssl-conf-name`). */
const DEFINE_NOM_SECTION = "NODE_OPENSSL_CONF_NAME=";

/**
 * Condition 1.7 de 0062 § 4 (bloquant 1 de la revue du head `b0c1c45`) : `configNode` (en production,
 * `process.config`, lu par `egress.ts` ; injecté par les tests) a la forme `{ target_defaults: { defines: string[] } }`,
 * et `defines` contient exactement une entrée qui commence par `NODE_OPENSSL_CONF_NAME=`, égale à
 * `NODE_OPENSSL_CONF_NAME=nodejs_conf`. Objet absent, `target_defaults` ou `defines` absent, `defines` qui n'est pas un
 * tableau de chaînes, aucune entrée ou plusieurs : refus. Ne lève jamais (un accesseur qui lève vaut refus).
 */
export function nomSectionOpensslAdmis(configNode: unknown): boolean {
  try {
    if (typeof configNode !== "object" || configNode === null || !("target_defaults" in configNode)) return false;
    const cible = configNode.target_defaults;
    if (typeof cible !== "object" || cible === null || !("defines" in cible)) return false;
    const defines = cible.defines;
    if (!Array.isArray(defines)) return false;
    const noms: string[] = [];
    for (const entree of defines as readonly unknown[]) {
      if (typeof entree !== "string") return false;
      if (entree.startsWith(DEFINE_NOM_SECTION)) noms.push(entree);
    }
    return noms.length === 1 && noms[0] === `${DEFINE_NOM_SECTION}nodejs_conf`;
  } catch {
    return false;
  }
}

/** Blancs (Unicode compris), `$`, `\`, guillemets, caractères de contrôle : refusés dans un chemin (0062 § 4 point 1.3). */
const CARACTERE_REFUSE = /[\s$\\"'`\p{Cc}]/u;

/**
 * Condition 1.3 de 0062 § 4 : chemin absolu, canonique (égal à `posix.normalize`, sans `/` final), sans caractère
 * refusé ; exactement `/dev/null` ou sous une racine admise. Aucun `trim()`.
 */
export function cheminOpensslAdmis(chemin: string): boolean {
  if (chemin === DEV_NULL) return true;
  if (!chemin.startsWith("/") || chemin.endsWith("/") || CARACTERE_REFUSE.test(chemin)) return false;
  return posix.normalize(chemin) === chemin && sousRacines(chemin);
}

/**
 * Lignes logiques au sens d'OpenSSL (`crypto/conf/conf_def.c`) : coupe sur `\n`, retire les `\r` et `\n` de fin, puis
 * joint la ligne suivante quand le texte accumulé finit par un `\` qui ne suit pas un autre `\` (ce `\` est retiré).
 * Jonction d'abord, commentaires ensuite, comme OpenSSL.
 */
function lignesLogiques(texte: string): string[] {
  const lignes: string[] = [];
  let courante: string | undefined;
  for (const physique of texte.split("\n")) {
    courante = (courante ?? "") + physique.replace(/\r+$/, "");
    if (courante.endsWith("\\") && !courante.endsWith("\\\\")) {
      courante = courante.slice(0, -1);
      continue;
    }
    lignes.push(courante);
    courante = undefined;
  }
  if (courante !== undefined) lignes.push(courante);
  return lignes;
}

/** Directive `.include` entière (0062 § 4 point 1.6) : blancs, `.include`, `=` ou un blanc, chemin, blancs. */
const DIRECTIVE_INCLUSION = /^[ \t]*\.include(?:[ \t]*=[ \t]*|[ \t]+)([^\s$\\"'`#]+)[ \t]*$/i;
const OCCURRENCE_INCLUSION = /\.include/gi;
const LIGNE_COMMENTAIRE = /^[ \t]*#/;

export type AnalyseOpensslConf = { readonly nodejs: boolean; readonly inclusions: readonly string[] };

/**
 * Analyse pure d'un fichier de configuration (0062 § 4 points 1.5 et 1.6). `nodejs` : le texte joint, tous les `\`
 * retirés, contient `nodejs_conf` (casse ignorée, **commentaires compris** : un faux positif refuse). `inclusions` :
 * chemins des directives `.include`, chacun soumis à la condition 1.3 ; une ligne de commentaire entière est ignorée
 * pour les inclusions seulement ; toute autre occurrence de `.include` qui n'est pas une directive entière, un chemin
 * refusé : `inclusion_refusee`. Une ligne `.pragma` n'a pas de règle propre.
 */
export function analyserTexteOpensslConf(texte: string): AnalyseOpensslConf | "inclusion_refusee" {
  const lignes = lignesLogiques(texte);
  const nodejs = lignes.join("\n").replaceAll("\\", "").toLowerCase().includes("nodejs_conf");
  const inclusions: string[] = [];
  for (const ligne of lignes) {
    if (LIGNE_COMMENTAIRE.test(ligne)) continue;
    const occurrences = ligne.match(OCCURRENCE_INCLUSION)?.length ?? 0;
    if (occurrences === 0) continue;
    const directive = DIRECTIVE_INCLUSION.exec(ligne);
    const chemin = directive?.[1];
    if (occurrences !== 1 || chemin === undefined || !cheminOpensslAdmis(chemin)) return "inclusion_refusee";
    inclusions.push(chemin);
  }
  return { nodejs, inclusions };
}

/** Octets lus en texte, un caractère par octet : les caractères ASCII restent ceux qu'OpenSSL lit. */
const texteDe = (octets: Uint8Array) => Array.from(octets, (octet) => String.fromCharCode(octet)).join("");

type Etat = { fichiers: number };

/**
 * Cible d'un chemin admis par la condition 1.3 : `/dev/null` (rien à lire), sinon chemin réel sous les racines, puis
 * fichier ordinaire, ou dossier quand il s'agit d'une inclusion.
 */
function examinerCible(chemin: string, niveau: number, etat: Etat, fs: SystemeFichiersOpenssl, dossierAdmis: boolean): Echec | undefined {
  if (chemin === DEV_NULL) return undefined;
  const reel = fs.realpathSync(chemin);
  if (!sousRacines(reel)) return "fichier_refuse";
  const stats = fs.lstatSync(reel);
  if (dossierAdmis && stats.isDirectory()) return examinerDossier(reel, niveau, etat, fs);
  if (!stats.isFile() || stats.size > OPENSSL_CONF_MAX_OCTETS) return "fichier_refuse";
  if (etat.fichiers >= OPENSSL_CONF_MAX_FICHIERS) return "inclusion_refusee";
  etat.fichiers += 1;
  const octets = fs.readFileSync(reel);
  if (octets.byteLength > OPENSSL_CONF_MAX_OCTETS) return "fichier_refuse";
  const texte = texteDe(octets);
  // Octet nul : OpenSSL lit des chaînes C, et le texte qu'il verrait n'est plus celui examiné. Échec fermé.
  if (texte.includes("\0")) return "fichier_refuse";
  const analyse = analyserTexteOpensslConf(texte);
  if (analyse === "inclusion_refusee") return analyse;
  if (analyse.nodejs) return "section_nodejs";
  for (const inclusion of analyse.inclusions) {
    if (niveau + 1 > OPENSSL_CONF_MAX_PROFONDEUR) return "inclusion_refusee";
    const echec = examinerCible(inclusion, niveau + 1, etat, fs, true);
    if (echec !== undefined) return echec;
  }
  return undefined;
}

/** Dossier inclus : 64 entrées au plus ; chaque nom en `.cnf` ou `.conf` (casse ignorée, comme OpenSSL) est examiné. */
function examinerDossier(reel: string, niveau: number, etat: Etat, fs: SystemeFichiersOpenssl): Echec | undefined {
  const noms = fs.readdirSync(reel);
  if (noms.length > OPENSSL_CONF_MAX_ENTREES) return "inclusion_refusee";
  for (const nom of [...noms].sort()) {
    if (!/\.(cnf|conf)$/i.test(nom)) continue;
    const echec = examinerCible(posix.join(reel, nom), niveau, etat, fs, false);
    if (echec !== undefined) return echec;
  }
  return undefined;
}

/**
 * Conditions 1.3 à 1.6 de 0062 § 4 sur le chemin déclaré : verdict fermé et classe de racine. Ne lève jamais.
 */
export function examinerOpensslConf(
  chemin: string,
  fs: SystemeFichiersOpenssl = FS_OPENSSL_REEL,
): { readonly zone: ZoneOpensslConf; readonly verdict: VerdictExamen } {
  const zone = zoneOpensslConf(chemin);
  if (!cheminOpensslAdmis(chemin)) return { zone, verdict: "chemin_refuse" };
  let echec: Echec | undefined;
  try {
    echec = examinerCible(chemin, 0, { fichiers: 0 }, fs, false);
  } catch {
    echec = "fichier_refuse";
  }
  return { zone, verdict: echec ?? "admis" };
}
