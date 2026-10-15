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
 *
 * **Décision 0065** (ticket 361) : le fichier désigné par `OPENSSL_CONF` (niveau 0, jamais une inclusion) dont les
 * octets sont **exactement** ceux du fichier audité du runtime Lambda `nodejs24.x`
 * (`CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24`) vaut `contenu_audite` : admission, comme `admis`. Avec le verdict
 * `section_nodejs` seulement, l'examen rend aussi `directives` (`directivesOpensslConf`) : des jetons d'une liste fermée
 * (0065 § 4 point 3), jamais une valeur. Le diagnostic n'admet jamais rien.
 */

/** Classes de racine du chemin déclaré (0062 § 5.1, liste fermée de 7 valeurs). */
export const ZONES_OPENSSL_CONF = ["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"] as const;
export type ZoneOpensslConf = (typeof ZONES_OPENSSL_CONF)[number];

/**
 * Verdicts, dans l'ordre de priorité de 0062 § 5.1 (le premier échec l'emporte). `contenu_audite` (0065 § 4 point 2) :
 * admission par égalité d'octets avec le fichier audité, placée entre `section_nodejs` et `admis`.
 */
export const VERDICTS_OPENSSL_CONF = [
  "hors_preview",
  "env_differente",
  "nom_section_refuse",
  "chemin_refuse",
  "fichier_refuse",
  "inclusion_refusee",
  "section_nodejs",
  "contenu_audite",
  "admis",
] as const;
export type VerdictOpensslConf = (typeof VERDICTS_OPENSSL_CONF)[number];

/** Verdicts rendus par l'examen du chemin et du fichier (les conditions 1.1, 1.2 et 1.7 sont jugées par `egress.ts`). */
export type VerdictExamen = Exclude<VerdictOpensslConf, "hors_preview" | "env_differente" | "nom_section_refuse">;
type Echec = Exclude<VerdictExamen, "admis" | "contenu_audite" | "chemin_refuse">;
/** Issue de l'examen d'une cible : un échec, l'admission par contenu audité (niveau 0 seulement), ou rien. */
type Issue = Echec | "contenu_audite";

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

/**
 * Fichier `OPENSSL_CONF` audité du runtime Lambda `nodejs24.x` (décision 0065 § 2 point 1) : 505 octets, fins de ligne
 * `\n`, SHA-256 `d95efaf0856ecfa40c7f1012b99848eb98f770c5c8850320d22492b06b0f2a88` (vérifié par le test du module).
 * Source : image publique `aws/aws-lambda-base-images`, branche `nodejs24.x`, couche
 * `x86_64/f54414bf63a323b0ef2f89c97e6298fc987a4fdd23e81ca4ef99c06c1ca43243.tar.xz`, fichier
 * `var/runtime/openssl_conf/openssl.cnf`, runtime `24.21.0-6ac9237d` (`var/runtime/runtime-release`). Seul effet :
 * `Groups` retire les groupes hybrides post-quantiques (0065 § 3). **À relire** à chaque changement de version du
 * runtime ou de version majeure de Node : un autre fichier ferme la barrière (échec fermé voulu, 0065 § 4 point 5).
 */
export const CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24 = [
  "# OpenSSL configuration for AWS Lambda Node.js runtime.",
  "# Disables PQC (post-quantum) keyshares in the TLS ClientHello by default",
  "# to avoid middlebox compatibility issues with large ClientHello packets.",
  "# Customers can opt-in to PQC by setting OPENSSL_CONF=/dev/null.",
  "nodejs_conf = openssl_init",
  "",
  "[openssl_init]",
  "ssl_conf = ssl_sect",
  "",
  "[ssl_sect]",
  "system_default = system_default_sect",
  "",
  "[system_default_sect]",
  "Groups = X25519:secp256r1:X448:secp521r1:secp384r1:ffdhe2048:ffdhe3072:ffdhe4096:ffdhe6144:ffdhe8192",
  "",
].join("\n");

/**
 * Égalité octet à octet avec le contenu audité (0065 § 4 point 1) : ni décodage, ni normalisation des fins de ligne,
 * ni `trim()`. Le contenu audité est en ASCII : un caractère, un octet.
 */
function egalAuContenuAudite(octets: Uint8Array): boolean {
  const audite = CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24;
  if (octets.byteLength !== audite.length) return false;
  for (const [i, octet] of octets.entries()) {
    if (octet !== audite.charCodeAt(i)) return false;
  }
  return true;
}

/** Groupes admis sous `Groups` ou `Curves` (0065 § 3, première rangée ; comparaison exacte). */
const GROUPES_ADMIS: ReadonlySet<string> = new Set([
  "X25519",
  "X448",
  "secp256r1",
  "secp384r1",
  "secp521r1",
  "ffdhe2048",
  "ffdhe3072",
  "ffdhe4096",
  "ffdhe6144",
  "ffdhe8192",
  "X25519MLKEM768",
  "SecP256r1MLKEM768",
  "SecP384r1MLKEM1024",
]);

/** Clés rendues sous leur propre nom (0065 § 4 point 3, deux premières listes), en minuscules. */
const CLES_NOMMEES = [
  "nodejs_conf",
  "openssl_conf",
  "ssl_conf",
  "system_default",
  "providers",
  "alg_section",
  "default_properties",
  "engines",
  "random",
  "activate",
  "module",
  "minprotocol",
  "maxprotocol",
  "protocol",
  "cipherstring",
  "ciphersuites",
  "options",
  "verifymode",
  "verifycafile",
  "verifycapath",
  "verifycastore",
  "chaincafile",
  "chaincapath",
  "chaincastore",
  "requestcafile",
  "signaturealgorithms",
  "clientsignaturealgorithms",
] as const;

/** Jetons du diagnostic des directives (0065 § 4 point 3, liste fermée ; copie dans `src/server/log.ts`). */
export const DIRECTIVES_OPENSSL_CONF = [...CLES_NOMMEES, "groups_admis", "groups_autres", "include", "pragma", "autre"] as const;
export type DirectiveOpensslConf = (typeof DIRECTIVES_OPENSSL_CONF)[number];

const NOMMEES: ReadonlySet<string> = new Set(CLES_NOMMEES);
const DIRECTIVE_POINTEE = /^\.(include|pragma)(?=[ \t=]|$)/i;
/**
 * Blancs retirés par le diagnostic : espace, tabulation et retour chariot seulement, comme OpenSSL. Pas `\s` ni
 * `trim()`, qui retireraient aussi 0xA0 (lu en latin1) : `Groups = X25519\xA0` doit sortir `groups_autres` (mineur 4 de
 * la revue du head `e7fe172`).
 */
const BLANCS = /[ \t\r]+/g;
const BLANCS_AUX_BORDS = /^[ \t\r]+|[ \t\r]+$/g;
const sansBlancsAuxBords = (texte: string) => texte.replace(BLANCS_AUX_BORDS, "");

/** Jeton d'une ligne logique sans commentaire, ni vide ni en-tête de section. */
function jetonDeLigne(ligne: string): DirectiveOpensslConf {
  const pointee = DIRECTIVE_POINTEE.exec(ligne)?.[1]?.toLowerCase();
  if (pointee === "include" || pointee === "pragma") return pointee;
  const egal = ligne.indexOf("=");
  if (egal < 0) return "autre";
  const cle = ligne.slice(0, egal).replace(BLANCS, "").toLowerCase();
  if (cle === "groups" || cle === "curves") {
    const groupes = sansBlancsAuxBords(ligne.slice(egal + 1)).split(":");
    return groupes.every((groupe) => GROUPES_ADMIS.has(groupe)) ? "groups_admis" : "groups_autres";
  }
  return NOMMEES.has(cle) ? (cle as DirectiveOpensslConf) : "autre";
}

/**
 * Diagnostic des directives (0065 § 4 point 3), fonction pure : lignes continuées jointes (comme l'examen), commentaires
 * retirés (de `#` à la fin de la ligne), lignes vides et en-têtes `[section]` ignorés ; pour chaque autre ligne, le
 * jeton de sa clé (avant `=`, blancs retirés, casse ignorée). Rend les jetons sans doublon, triés, séparés par `,` :
 * **jamais** une valeur, un nom de section, un nom de groupe, une longueur, un condensat ni un extrait. Ne sert qu'au
 * diagnostic : n'admet jamais rien. Un texte sans aucune directive rend la chaîne vide (que `egress.ts` ne transmet pas).
 *
 * Lecture volontairement simple, qui peut **sous-déclarer** sans effet sur l'admission (mineur 8 de la revue du head
 * `e7fe172`) : `replace(/#.*$/, "")` ignore les guillemets et l'échappement `\#` (un `#` dans une valeur coupe la
 * ligne) ; une ligne qui commence par `[` est un en-tête, et le reste de cette ligne n'est pas lu.
 */
export function directivesOpensslConf(texte: string): string {
  const jetons = new Set<DirectiveOpensslConf>();
  for (const brute of lignesLogiques(texte)) {
    const ligne = sansBlancsAuxBords(brute.replace(/#.*$/, ""));
    if (ligne === "" || ligne.startsWith("[")) continue;
    jetons.add(jetonDeLigne(ligne));
  }
  return [...jetons].sort().join(",");
}

type Etat = { fichiers: number; texteNodejs?: string };

/**
 * Cible d'un chemin admis par la condition 1.3 : `/dev/null` (rien à lire), sinon chemin réel sous les racines, puis
 * fichier ordinaire, ou dossier quand il s'agit d'une inclusion.
 */
function examinerCible(chemin: string, niveau: number, etat: Etat, fs: SystemeFichiersOpenssl, dossierAdmis: boolean): Issue | undefined {
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
  // 0065 § 4 point 1 : le fichier désigné par `OPENSSL_CONF` (niveau 0 seulement), égal octet à octet au fichier audité.
  if (niveau === 0 && egalAuContenuAudite(octets)) return "contenu_audite";
  const analyse = analyserTexteOpensslConf(texte);
  if (analyse === "inclusion_refusee") return analyse;
  if (analyse.nodejs) {
    etat.texteNodejs = texte;
    return "section_nodejs";
  }
  for (const inclusion of analyse.inclusions) {
    if (niveau + 1 > OPENSSL_CONF_MAX_PROFONDEUR) return "inclusion_refusee";
    const echec = examinerCible(inclusion, niveau + 1, etat, fs, true);
    if (echec !== undefined) return echec;
  }
  return undefined;
}

/** Dossier inclus : 64 entrées au plus ; chaque nom en `.cnf` ou `.conf` (casse ignorée, comme OpenSSL) est examiné. */
function examinerDossier(reel: string, niveau: number, etat: Etat, fs: SystemeFichiersOpenssl): Issue | undefined {
  const noms = fs.readdirSync(reel);
  if (noms.length > OPENSSL_CONF_MAX_ENTREES) return "inclusion_refusee";
  for (const nom of [...noms].sort()) {
    if (!/\.(cnf|conf)$/i.test(nom)) continue;
    const echec = examinerCible(posix.join(reel, nom), niveau, etat, fs, false);
    if (echec !== undefined) return echec;
  }
  return undefined;
}

export type ExamenOpensslConf = {
  readonly zone: ZoneOpensslConf;
  readonly verdict: VerdictExamen;
  /** Jetons de `directivesOpensslConf` pour le fichier qui a donné `section_nodejs` (0065 § 4 point 3), seulement là. */
  readonly directives?: string;
};

/**
 * Conditions 1.3 à 1.6 de 0062 § 4 sur le chemin déclaré, et admission par contenu audité de 0065 § 4 : verdict fermé
 * et classe de racine ; avec `section_nodejs`, les directives du fichier en cause. Ne lève jamais : une erreur du calcul
 * des directives laisse `section_nodejs`, sans `directives` (0065 § 5 point 6).
 */
export function examinerOpensslConf(chemin: string, fs: SystemeFichiersOpenssl = FS_OPENSSL_REEL): ExamenOpensslConf {
  const zone = zoneOpensslConf(chemin);
  if (!cheminOpensslAdmis(chemin)) return { zone, verdict: "chemin_refuse" };
  const etat: Etat = { fichiers: 0 };
  let issue: Issue | undefined;
  try {
    issue = examinerCible(chemin, 0, etat, fs, false);
  } catch {
    issue = "fichier_refuse";
  }
  const verdict = issue ?? "admis";
  if (verdict !== "section_nodejs" || etat.texteNodejs === undefined) return { zone, verdict };
  try {
    return { zone, verdict, directives: directivesOpensslConf(etat.texteNodejs) };
  } catch {
    return { zone, verdict };
  }
}
