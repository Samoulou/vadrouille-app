import { extraireTexte, nettoyer, TEXTE_MAX } from "@/research/extract-text";
import { adresseAutorisee, estIpLitterale } from "@/research/ip-guard";

/**
 * Seul module de lecture des pages web et de vérification de statut des sites de `p0Run` (spécification P0, « Lecture des
 * pages web : garde contre les requêtes détournées » ; décision 0032, A3 et A7 ; lot 2a : 0121 § 3.7, seul appelant
 * d'une `CoucheHttp`). Les URL sont des **données non fiables**.
 *
 * Dans P0a1, le résolveur DNS et la couche HTTP sont **injectés** (doubles seulement) : aucune couche réseau
 * réelle n'est livrée. Le module ne lit aucune variable d'environnement (les variables de proxy sont donc
 * ignorées par construction, A7.3) et n'a accès à aucune clé.
 *
 * Contrôles, dans cet ordre, à la requête initiale et à chaque redirection :
 * 1. URL `https`, port 443, sans identifiants, nom d'hôte normalisé, aucune IP littérale ni hôte entre crochets ;
 * 2. résolution par le module, refus si **une** adresse est interdite (`ip-guard.ts`), connexion **à l'adresse
 *    vérifiée** (épinglage), nom d'hôte transmis pour TLS et SNI ;
 * 3. redirections suivies à la main, 3 au plus ;
 * 4. 2 Mo de corps au plus après décompression, 10 s au total, `text/html`, `application/xhtml+xml` (lu comme
 *    `text/html`, jamais par un analyseur XML) ou `text/plain` seulement (`TYPES_CONTENU_ADMIS`, décision 0096 § 1) ;
 * 5. ni cookie, ni en-tête d'identification ; `User-Agent` fixe.
 * Ces valeurs sont des constantes : une garde de sécurité ne s'assouplit pas par configuration (A3.1).
 *
 * Second point d'entrée, **vérification de statut des sites** de `p0Run` (lot 2a, la spécification P0-programme-par-ia
 * § 11.3 ; décision 0121 § 3 ; verdict de la Sécurité 0122 § 1) : `creerVerificateurStatut`, qui partage la boucle de
 * saut de `lire` (`suivre` : mêmes contrôles 1 à 3) et ne s'en écarte que sur les quatre points admis pour lui seul
 * (A23) : pas de liste `urlsAutorisees` (l'adresse vient de la sortie de l'IA, contrôlée par `reduireSite`), type de
 * contenu ignoré, corps **jamais lu** (connexion fermée dès le statut reçu), 5 s au lieu de 10 s. Il refuse en plus, à
 * l'adresse et à chaque redirection, les hôtes Google (`estHoteGoogle`), les noms d'une seule étiquette et les suffixes
 * non publics (0122 § 1 conditions 3, 4 et 8). Il ne rend qu'un résultat fermé (gardé ou refusé) : ni statut, ni
 * en-tête, ni corps, ni adresse de redirection, ni motif (0122 § 1 condition 2).
 */

export const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;
export const DELAI_MAX_MS = 10_000;
export const REDIRECTIONS_MAX = 3;
export const PORT_HTTPS = 443;
export const USER_AGENT = "PrototypeRecherche/1.0";

/**
 * Types de contenu admis (décision 0096 § 1 point 3, B7-TL-5) : **constante** du module, jamais une valeur de
 * configuration (A3.1 de 0032 : une garde ne s'assouplit pas par configuration). `application/xhtml+xml` est lu comme
 * `text/html` par `extraireTexte` (`parse5`, analyseur HTML) : aucune entité n'est résolue, aucun accès réseau, aucun
 * analyseur XML. Tout autre type (`application/xml`, `text/xml`, `image/svg+xml`, `application/json`…) est refusé
 * (`content_type`). Le type est lu avant le premier `;`, sans espaces, en minuscules.
 */
export const TYPES_CONTENU_ADMIS = ["text/html", "application/xhtml+xml", "text/plain"] as const;
type TypeContenuAdmis = (typeof TYPES_CONTENU_ADMIS)[number];

/** En-tête `accept` envoyé : les types admis, dans l'ordre de `TYPES_CONTENU_ADMIS`. */
export const ENTETE_ACCEPT = TYPES_CONTENU_ADMIS.join(", ");

const estTypeAdmis = (type: string): type is TypeContenuAdmis => (TYPES_CONTENU_ADMIS as readonly string[]).includes(type);

/** Raisons fermées d'un refus de lecture (comptées dans le rapport, sans l'URL). */
export const RAISONS_REFUS_PAGE = [
  "not_in_search_results",
  "invalid_url",
  "scheme",
  "port",
  "credentials",
  "ip_literal",
  "bracketed_host",
  "dns_failed",
  "address_blocked",
  "too_many_redirects",
  "http_status",
  "content_type",
  "content_encoding",
  "too_large",
  "timeout",
  "proxy_required",
  // P0r1 : refus de la barrière de sortie (module `egress` de `src/server/env`), transport réel désactivé en entier.
  "production_refused",
  "tls_env_refused",
] as const;
export type RaisonRefusPage = (typeof RAISONS_REFUS_PAGE)[number];

export type Resolveur = (hote: string) => Promise<readonly string[]>;

export type RequeteHttp = {
  /** Adresse vérifiée à laquelle se connecter (épinglage). */
  adresse: string;
  port: typeof PORT_HTTPS;
  /** Nom d'hôte de l'URL : vérification du certificat et SNI. */
  nomHote: string;
  /** Chemin et requête de l'URL. */
  chemin: string;
  entetes: Readonly<Record<string, string>>;
  signal: AbortSignal;
};

export type ReponseHttp = {
  statut: number;
  /** En-têtes, noms en minuscules. */
  entetes: Readonly<Record<string, string>>;
  corps: AsyncIterable<Uint8Array>;
  /** Libère les ressources du saut (transport réel : ferme son `Agent`) ; appelé par la garde à la fin de chaque saut. */
  fermer?: () => Promise<void>;
};

export type CoucheHttp = (requete: RequeteHttp) => Promise<ReponseHttp>;

export type ResultatLecture = { ok: true; texte: string } | { ok: false; raison: RaisonRefusPage };

export type LecteurPages = {
  /** Lit une page si son URL figure parmi les résultats de recherche de l'exécution en cours. */
  lire(url: string, urlsAutorisees: ReadonlySet<string>): Promise<ResultatLecture>;
};

export type DependancesLecteur = {
  resoudre: Resolveur;
  http: CoucheHttp;
  /** L'environnement d'exécution n'autorise la sortie que par un proxy non vérifié : lecture désactivée (A7.3). */
  sortieParProxy?: boolean;
  /** Le transport refuse toute lecture (barrière de sortie de P0r1) : aucune résolution ni connexion. */
  refus?: RaisonRefusPage;
};

class Refus extends Error {
  readonly raison: RaisonRefusPage;
  constructor(raison: RaisonRefusPage) {
    super(raison);
    this.raison = raison;
  }
}

const ENTETES: Readonly<Record<string, string>> = Object.freeze({
  "user-agent": USER_AGENT,
  accept: ENTETE_ACCEPT,
  "accept-encoding": "gzip, deflate, identity",
});

type UrlAnalysee = { href: string; hote: string; chemin: string };

/** Normalise une URL : refuse tout ce qui n'est pas `https://nom-d-hote/…` sur le port 443. */
export function analyserUrl(brut: string): UrlAnalysee {
  const autorite = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(brut)?.[1];
  if (autorite !== undefined && autorite.includes("[")) throw new Refus("bracketed_host");
  if (autorite !== undefined && autorite.includes("%")) throw new Refus("invalid_url");
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    throw new Refus("invalid_url");
  }
  if (url.protocol !== "https:") throw new Refus("scheme");
  if (url.username !== "" || url.password !== "") throw new Refus("credentials");
  if (url.port !== "" && url.port !== String(PORT_HTTPS)) throw new Refus("port");
  // La classe URL met en minuscules, convertit un nom IDN en ASCII et réécrit les IPv4 décimales, octales ou
  // hexadécimales en notation pointée : le contrôle porte sur la forme normalisée.
  const hote = url.hostname.replace(/\.$/, "");
  if (hote === "" || hote.startsWith("[")) throw new Refus(hote === "" ? "invalid_url" : "bracketed_host");
  if (estIpLitterale(hote)) throw new Refus("ip_literal");
  url.hostname = hote;
  url.hash = "";
  return { href: url.href, hote, chemin: `${url.pathname}${url.search}` };
}

/** Forme normalisée d'une URL pour comparer les résultats de recherche et les demandes de lecture. */
export function urlNormalisee(brut: string): string | undefined {
  try {
    return analyserUrl(brut).href;
  } catch {
    return undefined;
  }
}

function course<T>(promesse: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Refus("timeout"));
      return;
    }
    const surAbandon = () => reject(new Refus("timeout"));
    signal.addEventListener("abort", surAbandon, { once: true });
    promesse.then(
      (valeur) => {
        signal.removeEventListener("abort", surAbandon);
        resolve(valeur);
      },
      (erreur: unknown) => {
        signal.removeEventListener("abort", surAbandon);
        reject(erreur);
      },
    );
  });
}

async function lireBorne(source: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<Uint8Array[]> {
  const morceaux: Uint8Array[] = [];
  let total = 0;
  const iterateur = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      const { value, done } = await course(iterateur.next(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > TAILLE_MAX_OCTETS) throw new Refus("too_large");
      morceaux.push(value);
    }
  } finally {
    void iterateur.return?.();
  }
  return morceaux;
}

async function decompresser(
  morceaux: Uint8Array[],
  codage: "gzip" | "deflate",
  signal: AbortSignal,
): Promise<Uint8Array[]> {
  const flux = new Blob(morceaux as BlobPart[]).stream().pipeThrough(new DecompressionStream(codage));
  const sortie: AsyncIterable<Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      const lecteur = flux.getReader();
      try {
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) return;
          yield value;
        }
      } catch {
        throw new Refus("content_encoding");
      } finally {
        void lecteur.cancel().catch(() => undefined);
      }
    },
  };
  return lireBorne(sortie, signal);
}

function concatener(morceaux: readonly Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((somme, morceau) => somme + morceau.byteLength, 0);
  const resultat = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, position);
    position += morceau.byteLength;
  }
  return resultat;
}

const REDIRECTIONS = new Set([301, 302, 303, 307, 308]);

/**
 * Boucle de saut et de redirections, **commune** à `lire` et au vérificateur de statut (décision 0121 § 3.1 point 1 ;
 * 0122 § 1 condition 1) : résolution par le module, refus si **une** adresse est interdite (`ip-guard.ts`), connexion à
 * l'adresse vérifiée, redirections `301, 302, 303, 307, 308` suivies à la main, 3 au plus, chaque destination repassée
 * par `analyserUrl` puis par `controleSaut` (contrôle supplémentaire du seul mode « statut seulement »). Chaque réponse
 * de redirection est fermée à la fin de son saut ; la réponse finale (hors redirection) est rendue **ouverte** : l'appelant
 * la ferme. Une réponse arrivée après l'abandon du signal est fermée aussitôt (aucun `Agent` ne survit à l'abandon).
 */
async function suivre(
  dependances: DependancesLecteur,
  depart: UrlAnalysee,
  entetes: Readonly<Record<string, string>>,
  signal: AbortSignal,
  controleSaut: (url: UrlAnalysee) => void = () => undefined,
): Promise<ReponseHttp> {
  let courante = depart;
  for (let redirections = 0; ; ) {
    let adresses: readonly string[];
    try {
      adresses = await course(dependances.resoudre(courante.hote), signal);
    } catch (erreur) {
      if (erreur instanceof Refus) throw erreur;
      throw new Refus("dns_failed");
    }
    if (adresses.length === 0) throw new Refus("dns_failed");
    if (!adresses.every(adresseAutorisee)) throw new Refus("address_blocked");
    const adresse = adresses[0] as string;
    const envoi = dependances.http({
      adresse,
      port: PORT_HTTPS,
      nomHote: courante.hote,
      chemin: courante.chemin,
      entetes,
      signal,
    });
    // Réponse arrivée après l'abandon (course déjà perdue) : fermée, jamais laissée ouverte.
    envoi.then(
      (tardive) => {
        if (signal.aborted) void tardive.fermer?.().catch(() => undefined);
      },
      () => undefined,
    );
    const reponse = await course(envoi, signal);
    if (!REDIRECTIONS.has(reponse.statut)) return reponse;
    try {
      const destination = reponse.entetes.location;
      if (destination === undefined) throw new Refus("http_status");
      if (redirections >= REDIRECTIONS_MAX) throw new Refus("too_many_redirects");
      redirections += 1;
      let suivante: string;
      try {
        suivante = new URL(destination, courante.href).href;
      } catch {
        throw new Refus("invalid_url");
      }
      courante = analyserUrl(suivante);
      controleSaut(courante);
    } finally {
      await reponse.fermer?.();
    }
  }
}

export function creerLecteurPages(dependances: DependancesLecteur): LecteurPages {
  return {
    async lire(url, urlsAutorisees) {
      if (dependances.refus !== undefined) return { ok: false, raison: dependances.refus };
      if (dependances.sortieParProxy === true) return { ok: false, raison: "proxy_required" };
      const autorisees = new Set([...urlsAutorisees].flatMap((valeur) => urlNormalisee(valeur) ?? []));
      const controleur = new AbortController();
      const minuterie = setTimeout(() => controleur.abort(), DELAI_MAX_MS);
      try {
        const depart = analyserUrl(url);
        if (!autorisees.has(depart.href)) throw new Refus("not_in_search_results");
        const reponse = await suivre(dependances, depart, ENTETES, controleur.signal);
        try {
          if (reponse.statut !== 200) throw new Refus("http_status");
          const type = (reponse.entetes["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
          if (!estTypeAdmis(type)) throw new Refus("content_type");
          const codage = (reponse.entetes["content-encoding"] ?? "identity").trim().toLowerCase();
          if (codage !== "identity" && codage !== "gzip" && codage !== "deflate") throw new Refus("content_encoding");
          const bruts = await lireBorne(reponse.corps, controleur.signal);
          const morceaux = codage === "identity" ? bruts : await decompresser(bruts, codage, controleur.signal);
          const contenu = new TextDecoder("utf-8", { fatal: false }).decode(concatener(morceaux));
          // `application/xhtml+xml` passe par l'analyseur HTML comme `text/html` (décision 0096 § 1) : jamais d'analyseur XML.
          const texte = type === "text/plain" ? nettoyer(contenu).slice(0, TEXTE_MAX) : extraireTexte(contenu);
          return { ok: true, texte };
        } finally {
          await reponse.fermer?.();
        }
      } catch (erreur) {
        return { ok: false, raison: erreur instanceof Refus ? erreur.raison : "http_status" };
      } finally {
        clearTimeout(minuterie);
      }
    },
  };
}

// --- Vérification de statut des sites de `p0Run` (lot 2a ; décision 0121 § 3 ; verdict 0122 § 1) -------------------

/** Délai d'une vérification, résolution et redirections comprises (§ 11.3 point 3, 0122 § 1 condition 10). */
export const DELAI_STATUT_MS = 5_000;

/** Longueur maximale de l'adresse **réduite** de l'IA (§ 11.3 point 1, 0122 § 1 condition 3). */
export const SITE_LONGUEUR_MAX = 300;

/** Longueur maximale d'une adresse lue brute ou d'une destination de redirection (`URL_SOURCE_MAX`, 0122 § 1 condition 8). */
export const ADRESSE_BRUTE_MAX = 2_048;

/**
 * En-têtes du mode « statut seulement » : les trois noms du transport, valeurs **constantes** (0122 § 1 conditions 5
 * et 6) ; `accept-encoding: identity` (le corps n'est jamais décompressé), `accept: *\/*` (le type est ignoré), le même
 * `User-Agent` que la lecture des pages.
 */
export const ENTETES_STATUT: Readonly<Record<string, string>> = Object.freeze({
  "user-agent": USER_AGENT,
  accept: "*/*",
  "accept-encoding": "identity",
});

/**
 * Suffixes non publics refusés (0122 § 1 condition 3, défense en profondeur : l'adresse résolue reste le contrôle
 * décisif). Comparés à la dernière ou aux deux dernières étiquettes du nom d'hôte normalisé. Les neuf premiers sont la
 * liste de 0122 § 1 condition 3 ; les six derniers (`lan`, `corp`, `intranet`, `private`, `localdomain`, `home`) sont un
 * resserrement (noms d'usage interne courants, aucun domaine de premier niveau public) demandé par la revue Sécurité du
 * lot 2a, qui le juge : la règle « ajout sans nouveau verdict » de 0122 § 1 condition 4 ne vise que la liste Google.
 */
export const SUFFIXES_NON_PUBLICS: readonly string[] = [
  "localhost",
  "local",
  "internal",
  "home.arpa",
  "arpa",
  "test",
  "invalid",
  "example",
  "onion",
  "lan",
  "corp",
  "intranet",
  "private",
  "localdomain",
  "home",
];

/**
 * Hôtes Google refusés, **liste fermée tenue par la Sécurité** (0122 § 1 condition 4) : toute étiquette qui commence
 * par `PREFIXE_ETIQUETTE_GOOGLE` (dont l'étiquette égale), et ces domaines avec leurs sous-domaines (égalité ou suffixe
 * précédé d'un point, jamais une sous-chaîne). Un ajout est un resserrement ; un retrait demande un verdict. Les quatre
 * derniers (`business.site`, `page.link`, `youtube.com`, `youtu.be`, services de Google) sont un resserrement demandé
 * par la revue Sécurité de #694 (correction 1, mineur ; 0122 § 1 condition 4 : « peut ajouter un hôte sans nouveau
 * verdict »).
 */
export const PREFIXE_ETIQUETTE_GOOGLE = "google";
export const DOMAINES_GOOGLE: readonly string[] = [
  "gstatic.com",
  "ggpht.com",
  "goo.gl",
  "goo.gle",
  "g.page",
  "g.co",
  "withgoogle.com",
  "business.site",
  "page.link",
  "youtube.com",
  "youtu.be",
];

/** Nom d'hôte normalisé (minuscules, ASCII, sans point final) d'un domaine Google (0122 § 1 condition 4). */
export function estHoteGoogle(hote: string): boolean {
  const normalise = hote.toLowerCase().replace(/\.$/, "");
  if (normalise.split(".").some((etiquette) => etiquette.startsWith(PREFIXE_ETIQUETTE_GOOGLE))) return true;
  return DOMAINES_GOOGLE.some((domaine) => normalise === domaine || normalise.endsWith(`.${domaine}`));
}

/** Nom d'hôte public plausible : deux étiquettes au moins, aucun suffixe non public (0122 § 1 condition 3). */
function hotePublicPlausible(hote: string): boolean {
  const etiquettes = hote.split(".");
  if (etiquettes.length < 2 || etiquettes.some((etiquette) => etiquette === "")) return false;
  const derniere = etiquettes.at(-1) ?? "";
  const deuxDernieres = etiquettes.slice(-2).join(".");
  return !SUFFIXES_NON_PUBLICS.includes(derniere) && !SUFFIXES_NON_PUBLICS.includes(deuxDernieres);
}

/** Contrôle de chaque saut du mode « statut seulement » : hôte public plausible, non Google, adresse bornée. */
function controleSautStatut(url: UrlAnalysee): void {
  if (url.href.length > ADRESSE_BRUTE_MAX) throw new Refus("invalid_url");
  if (!hotePublicPlausible(url.hote) || estHoteGoogle(url.hote)) throw new Refus("address_blocked");
}

/**
 * Forme de l'adresse `site` proposée par l'IA (§ 11.3 point 1 ; 0121 § 3.1 point 3 ; 0122 § 1 condition 3) : contrôles
 * d'`analyserUrl` (`https`, port 443, sans identifiants, ni `[` ni `%` dans l'autorité, aucune IP littérale), deux
 * étiquettes au moins, aucun suffixe non public, aucun hôte Google ; **réduction** (paramètres et fragment retirés, nom
 * d'hôte normalisé), puis 300 caractères au plus. Rend l'adresse réduite, seule forme soumise, comparée et écrite, ou
 * `undefined` (échec de forme, aucun motif).
 */
export function reduireSite(brut: unknown): string | undefined {
  if (typeof brut !== "string" || brut.length > ADRESSE_BRUTE_MAX) return undefined;
  try {
    const analysee = analyserUrl(brut);
    controleSautStatut(analysee);
    const url = new URL(analysee.href);
    url.search = "";
    url.hash = "";
    const reduite = url.href;
    return reduite.length > SITE_LONGUEUR_MAX ? undefined : reduite;
  } catch {
    return undefined;
  }
}

/** Résultat fermé d'une vérification : gardé ou refusé, rien d'autre (0122 § 1 condition 2). */
export type ResultatStatut = { readonly ok: boolean };

export type VerificateurStatut = {
  /**
   * Barrière de sortie fermée (production, hors mode réel, proxy ; `refus` du transport) : aucune adresse ne doit être
   * soumise (0121 § 2.3, 0122 § 1 condition 1). Booléen seul, jamais le code.
   */
  readonly barriereFermee: boolean;
  /**
   * Vérifie une adresse **déjà réduite** (`reduireSite`) : `GET` par saut, trois en-têtes constants, redirections
   * contrôlées, 5 s au plus (ou `signal` externe), statut final 2xx seulement ; corps jamais lu. Ne rejette jamais.
   */
  verifier(adresse: string, signal?: AbortSignal): Promise<ResultatStatut>;
};

/** Point d'entrée « statut seulement » (0121 § 3.1 point 2) sur les mêmes dépendances que `creerLecteurPages`. */
export function creerVerificateurStatut(dependances: DependancesLecteur): VerificateurStatut {
  const barriereFermee = dependances.refus !== undefined || dependances.sortieParProxy === true;
  return {
    barriereFermee,
    async verifier(adresse, signal) {
      if (barriereFermee) return { ok: false };
      // Contrôle refait sur l'adresse reçue : seule une adresse réduite admise peut partir.
      if (reduireSite(adresse) !== adresse) return { ok: false };
      const controleur = new AbortController();
      const minuterie = setTimeout(() => controleur.abort(), DELAI_STATUT_MS);
      const signalSaut = signal === undefined ? controleur.signal : AbortSignal.any([controleur.signal, signal]);
      try {
        const reponse = await suivre(dependances, analyserUrl(adresse), ENTETES_STATUT, signalSaut, controleSautStatut);
        // Corps jamais lu ni décodé : connexion fermée dès le statut reçu (0122 § 1 condition 7).
        await reponse.fermer?.();
        return { ok: reponse.statut >= 200 && reponse.statut <= 299 };
      } catch {
        // Toute erreur (refus de la garde, DNS, TLS, réseau, délai, abandon) : refus fermé, sans message ni motif.
        return { ok: false };
      } finally {
        clearTimeout(minuterie);
      }
    },
  };
}
