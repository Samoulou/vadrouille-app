import "server-only";

/**
 * Robots déclarés, pour le compteur de visites de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2
 * point 3 ; tâche C2b, ticket 1130).
 *
 * **Liste maison, embarquée dans le code, sans appel réseau ni dépendance : proposition, à confirmer par le Tech Lead
 * (T2).** Une bibliothèque embarquée (liste tenue par d'autres, plus large) reste possible ; elle ajouterait un paquet
 * au régime de confinement.
 *
 * Un agent utilisateur est tenu pour un robot déclaré s'il contient l'un de ces fragments, sans tenir compte de la
 * casse. La liste vise ce qui **se présente** comme un automate : moteurs de recherche, aperçus de lien des
 * messageries et des réseaux, clients HTTP de scripts, navigateurs sans écran, sondes de disponibilité. Les
 * navigateurs intégrés d'applications (qui portent le nom de l'application sans être des automates) n'y sont pas. Un
 * robot qui se présente comme un navigateur est compté (limite connue, § 2.3 ; S4). Une valeur s'ajoute par une PR.
 */
export const FRAGMENTS_ROBOTS: readonly string[] = Object.freeze([
  // Génériques : Googlebot, bingbot, Twitterbot, Slackbot-LinkExpanding, Discordbot, GPTBot, ClaudeBot, AdsBot…
  "bot",
  "crawl",
  "spider",
  "slurp",
  "scrap",
  "fetch",
  "preview",
  "monitor",
  "uptime",
  "checker",
  "validator",
  "archiver",
  "headless",
  // Aperçus de lien des messageries et des réseaux.
  "facebookexternalhit",
  "facebookcatalog",
  "meta-externalagent",
  "whatsapp",
  "skypeuri",
  "embedly",
  "vkshare",
  // Moteurs et services sans « bot » dans leur nom.
  "mediapartners-google",
  "google-inspectiontool",
  "googleother",
  "google-safety",
  "apis-google",
  "perplexity-user",
  "chatgpt-user",
  "anthropic-ai",
  "claude-web",
  "lighthouse",
  "pagespeed",
  "gtmetrix",
  "pingdom",
  "statuscake",
  "datadog",
  "newrelic",
  "vercel-screenshot",
  // Clients HTTP de scripts et outils.
  "curl",
  "wget",
  "httpie",
  "python",
  "aiohttp",
  "httpx",
  "go-http-client",
  "undici",
  "axios",
  "got (",
  "okhttp",
  "java/",
  "apache-httpclient",
  "libwww",
  "lwp::",
  "ruby",
  "php/",
  "guzzle",
  "postman",
  "insomnia",
  "playwright",
  "puppeteer",
  "phantomjs",
  "selenium",
  "cypress",
]);

/** Fragments qui contiennent « bot » sans désigner un automate : téléphones de la marque Cubot. */
const FAUX_AMIS: readonly string[] = Object.freeze(["cubot"]);

/** Au-delà, l'agent utilisateur n'est pas lu : aucun navigateur n'en approche. */
const LONGUEUR_LUE = 512;

/**
 * Vrai si l'agent utilisateur est celui d'un robot déclaré, **ou s'il est absent ou vide** (C2-PO-3 : non compté, comme
 * un robot). La valeur n'est ni gardée, ni journalisée, ni rendue.
 */
export function estRobotDeclare(agentUtilisateur: string | null | undefined): boolean {
  if (typeof agentUtilisateur !== "string") return true;
  let agent = agentUtilisateur.slice(0, LONGUEUR_LUE).trim().toLowerCase();
  if (agent === "") return true;
  for (const fauxAmi of FAUX_AMIS) agent = agent.split(fauxAmi).join("");
  return FRAGMENTS_ROBOTS.some((fragment) => agent.includes(fragment));
}
