import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";

import {
  FINS_MODELE,
  MAX_RESULTATS_WEB,
  MAX_TOKENS,
  MOTEURS_GREFFON_WEB,
  type ClientModeles,
  type FinModele,
  type Message,
  type MoteurGreffonWeb,
  type PointEntreeRechercheWeb,
  type RequeteModele,
  type ReponseModele,
  type SourceWebFournisseur,
  usdEnMicros,
} from "@/ai/client";
import { REESSAYABLES, type CodeErreurOpenRouter } from "@/ai/erreurs";
import { MODELE_ID_PATTERN } from "@/ai/reglages";
import { lireCleOpenRouter } from "@/server/env/ai";
import {
  avecReservation,
  DELAI_REQUETE_MS,
  demandeDe,
  horlogeSysteme,
  type ContexteAppel,
  type Horloge,
  type Plafond,
  type PortConsommation,
} from "@/server/usage/port";

/**
 * Client réel de modèles : AI SDK et fournisseur OpenRouter (spécification de P0r1, « P0, suite : exécutions réelles »,
 * « Clients réels » ; module de capacité réseau, exception nominative de 0031 § 5). **Branché à aucun point
 * d'entrée** (P0r1) : importé seulement par ses tests ; le module de composition `src/server/composition/p0-reel.ts`
 * arrive avec P0r3.
 *
 * - **Fournisseur explicite** : une seule instance, `createOpenRouter({ apiKey, baseURL, fetch })`, clé passée
 *   explicitement (lue par `@/server/env/ai` après la barrière de sortie), adresse de base figée, `fetch` égal à
 *   l'enveloppe. Chaque appel reçoit un **objet modèle** de cette instance, jamais un identifiant en chaîne (une
 *   chaîne ferait passer l'AI SDK par l'AI Gateway de Vercel).
 * - `provider.data_collection: "deny"` sur chaque requête : l'enveloppe refuse de laisser partir un corps sans lui.
 * - `maxRetries: 0` sur chaque appel : une réservation couvre une seule requête au transport ; une nouvelle tentative
 *   est un nouvel appel du client, avec une nouvelle réservation (D13).
 * - Télémétrie des prompts désactivée sur chaque appel.
 * - L'enveloppe impose `redirect: "manual"`, refuse toute origine autre que l'origine figée, vérifie que la clé
 *   n'est ni dans l'URL ni dans le corps, et sort en `upstream_redirect` sur une réponse 300 à 399.
 * - Erreurs réduites à un code fermé : aucun message, corps ni pile du fournisseur ne sort.
 * - **Recherche web du fournisseur** (P0r3c, décision 0055, section 7 point 2 ; verdict Sécurité dans la PR) :
 *   `rechercherWeb`, point d'entrée remis par la composition au client de recherche web (`recherche-web-reelle.ts`,
 *   sans capacité réseau propre). Même instance, même enveloppe, même réservation (méthode `chat`, plafond des
 *   modèles) ; seul le greffon `web` est ajouté au corps, avec un **moteur fixé** (`engine`, valeur de la
 *   configuration : `native` ou `exa`, jamais le défaut variable du fournisseur ; bloquant 1c de la PR 326) et un nombre
 *   de résultats borné. L'enveloppe exige ce greffon, avec ce moteur, pour `rechercherWeb` et le refuse pour `envoyer`
 *   (aucune recherche web cachée dans un appel ordinaire). Seules les sources (citations d'adresses) sont rendues ; le
 *   texte du modèle est ignoré. Le moteur `exa` sort du réglage `data_collection: "deny"` (sous-traitant d'OpenRouter) :
 *   question pour Samuel dans la PR 326, aucune exécution réelle sans sa réponse écrite.
 * - **Coût estimé distinct** pour `rechercherWeb` (`coutEstimeRechercheWebMicros` : jetons du modèle et frais du
 *   moteur), réservé avant l'appel et repli quand le coût réel n'est pas rendu (mineur 2 de la PR 326).
 */

/** Origine figée, exportée pour les tests (qui n'écrivent pas l'hôte, surveillé par le régime de confinement). */
export const ORIGINE_MODELES = "https://openrouter.ai";
const BASE_URL = "https://openrouter.ai/api/v1";

/** Transport : la signature du `fetch` global, toujours appelée à travers l'enveloppe. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Codes fermés de ce client (`CODES_ERREUR_OPENROUTER`) et codes réessayables (`REESSAYABLES`) : définis une seule fois
 * dans `@/ai/erreurs` (décision 0077 § 3 point 1), composés des refus de la barrière, de la clé absente et du port.
 */
const reessayable = (code: CodeErreurOpenRouter) => (REESSAYABLES as readonly string[]).includes(code);

export class ErreurOpenRouter extends Error {
  readonly code: CodeErreurOpenRouter;
  readonly retryable: boolean;
  constructor(code: CodeErreurOpenRouter) {
    super(code);
    this.code = code;
    this.retryable = reessayable(code);
    this.name = "ErreurOpenRouter";
  }
}

export type OptionsOpenRouter = {
  readonly usage: PortConsommation;
  readonly contexte: () => ContexteAppel;
  readonly plafonds: readonly Plafond[];
  /** Coût estimé d'une requête, en micro-USD (réservé avant l'appel, remplacé par le coût réel s'il est rendu). */
  readonly coutEstimeMicros: number;
  /** Coût estimé d'une recherche web (`rechercherWeb` : jetons du modèle et frais du moteur), en micro-USD. */
  readonly coutEstimeRechercheWebMicros: number;
  readonly horloge?: Horloge;
  readonly environnement?: Readonly<Record<string, string | undefined>>;
  readonly execArgv?: readonly string[];
};

/** État propre à un appel, noté par l'enveloppe et lu par le client sur toute erreur de l'AI SDK. */
type EtatAppel = { appele: () => void; redirection: boolean; greffonWeb: GreffonWeb | null };

/** Greffon `web` d'un appel de `rechercherWeb` : moteur fixé et nombre de résultats. */
type GreffonWeb = { readonly moteur: MoteurGreffonWeb; readonly maxResultats: number };

/**
 * Requête `programme` (décision 0116 § 2 ; revue 1 de #632, mineur 9) : plafond de jetons de sortie (`max_tokens`) et
 * coût estimé réservé, **constantes du code** propres à cette seule nature (les autres requêtes gardent
 * `coutEstimeMicros` de la configuration, sans plafond de jetons). 32 000 jetons couvrent un séjour de 7 jours à
 * 12 créneaux avec leurs textes (environ 128 Kio, sous `LONGUEUR_REPONSE_MAX`). Réservation : 32 000 jetons de sortie
 * et 10 000 d'entrée au tarif ZDR le plus cher de `deepseek/deepseek-v4.1-flash` relevé le 2026-10-21 (2,40 USD et
 * 0,60 USD le million), soit 0,083 USD arrondis à 0,09 USD : très en deçà du plafond de 3 USD par exécution (une
 * requête, sans relance). Le coût réel est confirmé à la réponse, comme pour toute requête.
 */
export const JETONS_SORTIE_MAX_PROGRAMME = 32_000;
export const COUT_ESTIME_PROGRAMME_MICROS = 90_000;

/**
 * Budget de raisonnement de la requête `programme` (révision comprise, même nature) : `reasoning.max_tokens` d'OpenRouter.
 * Chez la plupart des fournisseurs, `max_tokens` couvre **le raisonnement et la réponse ensemble** ; sans borne, un modèle
 * qui raisonne (`deepseek/deepseek-v4.1-flash`) peut consommer tout `JETONS_SORTIE_MAX_PROGRAMME` et rendre un texte vide
 * (`finish_reason: "length"`), lu comme programme illisible (`model_output_invalid`, essais du 2026-10-24, cause
 * déduite, le texte n'étant jamais journalisé). 8 000 jetons laissent au moins 24 000 jetons à la réponse JSON ; un
 * modèle qui ne prend qu'un niveau d'effort reçoit le niveau correspondant (environ un quart de `max_tokens`, selon la
 * documentation d'OpenRouter). Le plafond total ne change pas : le pire cas réservé (`COUT_ESTIME_PROGRAMME_MICROS`,
 * jetons de raisonnement facturés comme jetons de sortie) reste le même.
 */
export const JETONS_RAISONNEMENT_MAX_PROGRAMME = 8_000;

const CorpsSchema = z.object({ provider: z.object({ data_collection: z.literal("deny") }), plugins: z.unknown().optional() });
/** Seul greffon admis, et seulement pour `rechercherWeb` : `web`, son moteur fixé (littéral) et son nombre de résultats. */
const GreffonsWebSchema = z.tuple([
  z.strictObject({ id: z.literal("web"), engine: z.enum(MOTEURS_GREFFON_WEB), max_results: z.number().int().min(1).max(MAX_RESULTATS_WEB) }),
]);
const CoutSchema = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number().nonnegative() }) }) });

/** Client réel : `envoyer` (interface `ClientModeles`) et le point d'entrée de recherche web du fournisseur. */
export type ClientModelesReel = ClientModeles & { readonly rechercherWeb: PointEntreeRechercheWeb };

/** Appel commun aux deux méthodes : messages déjà contrôlés, greffon `web` éventuel. */
type AppelModele = {
  readonly modele: string;
  readonly routage: RequeteModele["routage"];
  readonly messages: readonly Message[];
  readonly greffonWeb: GreffonWeb | null;
  /** Délai de la requête (`DELAI_REQUETE_MS`) : `openrouterProgramme` pour la seule nature `programme` (0116 § 2.3). */
  readonly delaiMs: number;
  /** Requête de nature `programme` : plafond de jetons de sortie et coût estimé propres (`JETONS_SORTIE_MAX_PROGRAMME`). */
  readonly programme: boolean;
};

/** Résultat brut d'un appel : texte, sources (citations d'adresses), coût et raison de fin (liste fermée). */
type ResultatAppel = {
  readonly texte: string;
  readonly sources: readonly SourceWebFournisseur[];
  readonly coutUsd: number;
  readonly fin: FinModele;
  readonly tokens?: { readonly entree: number; readonly sortie: number };
};

const jetons = z.number().int().min(0).max(MAX_TOKENS);
const UsageSchema = z.object({ inputTokens: jetons, outputTokens: jetons });

/**
 * Jetons lus dans `usage` de l'AI SDK (décision 0096 § 2 point 6) : `inputTokens` et `outputTokens` **seulement**, gardés
 * si entiers sûrs de 0 à `MAX_TOKENS` ; absents sinon (les deux, ou aucun). Rien d'autre de `usage` n'est lu.
 */
function jetonsDe(usage: unknown): { entree: number; sortie: number } | undefined {
  const lu = UsageSchema.safeParse(usage);
  return lu.success ? { entree: lu.data.inputTokens, sortie: lu.data.outputTokens } : undefined;
}

/** Raison de fin de l'AI SDK, réduite à la liste fermée (`other` sinon) : jamais la raison brute du fournisseur. */
function finDe(raison: unknown): FinModele {
  return typeof raison === "string" && (FINS_MODELE as readonly string[]).includes(raison) ? (raison as FinModele) : "other";
}

const SourceSchema = z.object({
  type: z.literal("source"),
  sourceType: z.literal("url"),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: z.object({ openrouter: z.object({ content: z.string().optional() }).optional() }).optional(),
});

export function createOpenRouterClient(options: OptionsOpenRouter, transport: Transport = fetch): ClientModelesReel {
  const lecture = lireCleOpenRouter(options.environnement, options.execArgv);
  if (!lecture.ok) throw new ErreurOpenRouter(lecture.code);
  const cle = lecture.cle;
  const horloge = options.horloge ?? horlogeSysteme;
  /** États des appels en cours, par signal d'abandon (un par appel, posé par le client). */
  const etats = new WeakMap<AbortSignal, EtatAppel>();

  /** Seule fonction qui appelle le transport. */
  const enveloppe = async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    const etat = signal ? etats.get(signal) : undefined;
    if (etat === undefined || signal === undefined || signal === null) throw new ErreurOpenRouter("invalid_request");
    if (typeof entree !== "string" && !(entree instanceof URL)) throw new ErreurOpenRouter("invalid_request");
    const url = new URL(entree.toString());
    if (url.origin !== ORIGINE_MODELES || url.username !== "" || url.password !== "" || url.href.includes(cle)) {
      throw new ErreurOpenRouter("invalid_request");
    }
    const corps = init?.body;
    if (typeof corps !== "string" || corps.includes(cle)) throw new ErreurOpenRouter("invalid_request");
    let json: unknown;
    try {
      json = JSON.parse(corps);
    } catch {
      throw new ErreurOpenRouter("invalid_request");
    }
    const lu = CorpsSchema.safeParse(json);
    if (!lu.success) throw new ErreurOpenRouter("data_collection_missing");
    const greffons = lu.data.plugins;
    if (etat.greffonWeb === null) {
      if (greffons !== undefined) throw new ErreurOpenRouter("invalid_request");
    } else {
      const greffon = GreffonsWebSchema.safeParse(greffons);
      if (!greffon.success || greffon.data[0].engine !== etat.greffonWeb.moteur || greffon.data[0].max_results !== etat.greffonWeb.maxResultats) {
        throw new ErreurOpenRouter("invalid_request");
      }
    }
    const entetes = new Headers(init?.headers);
    // `Authorization` est posé par le fournisseur ; il ne part que vers l'origine figée (contrôlée ci-dessus).
    etat.appele();
    const reponse = await transport(url.href, {
      method: init?.method ?? "POST",
      headers: entetes,
      body: corps,
      signal,
      redirect: "manual",
    });
    if (reponse.type === "opaqueredirect" || (reponse.status >= 300 && reponse.status < 400)) {
      etat.redirection = true;
      try {
        await reponse.body?.cancel();
      } catch {
        // Rien ne sort.
      }
      throw new ErreurOpenRouter("upstream_redirect");
    }
    return reponse;
  };

  const fournisseur = createOpenRouter({ apiKey: cle, baseURL: BASE_URL, fetch: enveloppe, compatibility: "strict" });

  /** Seule fonction qui réserve et appelle l'AI SDK (un seul `generateText` dans ce module). */
  async function appeler(requete: AppelModele): Promise<ResultatAppel> {
    if (requete.routage?.data_collection !== "deny") throw new ErreurOpenRouter("data_collection_missing");
    if (typeof requete.modele !== "string" || requete.modele.length > 100 || !MODELE_ID_PATTERN.test(requete.modele)) {
      throw new ErreurOpenRouter("model_id_invalid");
    }
    // Rôle hors de `system` et `user` (aucun autre n'est prévu par l'interface) : refusé, jamais ignoré en silence.
    if (!Array.isArray(requete.messages) || requete.messages.some((m) => m.role !== "system" && m.role !== "user")) {
      throw new ErreurOpenRouter("invalid_request");
    }
    const greffonWeb = requete.greffonWeb;
    if (
      greffonWeb !== null &&
      (!Number.isSafeInteger(greffonWeb.maxResultats) ||
        greffonWeb.maxResultats < 1 ||
        greffonWeb.maxResultats > MAX_RESULTATS_WEB ||
        !(MOTEURS_GREFFON_WEB as readonly string[]).includes(greffonWeb.moteur))
    ) {
      throw new ErreurOpenRouter("invalid_request");
    }
    const { programme } = requete;
    const coutEstimeMicros = greffonWeb !== null ? options.coutEstimeRechercheWebMicros : programme ? COUT_ESTIME_PROGRAMME_MICROS : options.coutEstimeMicros;
    const systeme = requete.messages.filter((m) => m.role === "system").map((m) => m.contenu);
    const utilisateur = requete.messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.contenu }));
    const modele = fournisseur.chat(requete.modele, {
      provider: { data_collection: "deny", ...(requete.routage.zdr === undefined ? {} : { zdr: requete.routage.zdr }) },
      usage: { include: true },
      ...(programme ? { reasoning: { max_tokens: JETONS_RAISONNEMENT_MAX_PROGRAMME } } : {}),
      ...(greffonWeb === null ? {} : { plugins: [{ id: "web" as const, engine: greffonWeb.moteur, max_results: greffonWeb.maxResultats }] }),
    });
    let etat: EtatAppel | undefined;
    const issue = await avecReservation(
      { port: options.usage, horloge },
      demandeDe(
        options.contexte(),
        { fournisseur: "modeles", methode: "chat", sku: requete.modele, unites: { requetes: 1, elements: 0 }, coutEstimeMicros },
        options.plafonds,
      ),
      requete.delaiMs,
      async (signal, transportAppele) => {
        etat = { appele: transportAppele, redirection: false, greffonWeb };
        etats.set(signal, etat);
        try {
          const resultat = await generateText({
            model: modele,
            ...(systeme.length > 0 ? { system: systeme.join("\n\n") } : {}),
            messages: utilisateur,
            ...(programme ? { maxOutputTokens: JETONS_SORTIE_MAX_PROGRAMME } : {}),
            maxRetries: 0,
            abortSignal: signal,
            experimental_telemetry: { isEnabled: false },
          });
          const cout = CoutSchema.safeParse(resultat.providerMetadata);
          const coutReelMicros = cout.success ? usdEnMicros(cout.data.openrouter.usage.cost) : null;
          const sources: SourceWebFournisseur[] = [];
          if (greffonWeb !== null) {
            for (const brute of resultat.sources) {
              const source = SourceSchema.safeParse(brute);
              if (source.success) sources.push({ url: source.data.url, titre: source.data.title ?? "", extrait: source.data.providerMetadata?.openrouter?.content ?? "" });
            }
          }
          const tokens = jetonsDe(resultat.usage);
          return {
            valeur: { texte: resultat.text, sources, coutUsd: (coutReelMicros ?? coutEstimeMicros) / 1_000_000, fin: finDe(resultat.finishReason), ...(tokens === undefined ? {} : { tokens }) },
            coutReelMicros,
          };
        } finally {
          etats.delete(signal);
        }
      },
    );
    if (issue.ok) return issue.valeur;
    if ("code" in issue) throw new ErreurOpenRouter(issue.code);
    // Erreur de l'AI SDK : l'état de l'appel est consulté d'abord, quelle que soit l'enveloppe de l'erreur.
    if (etat?.redirection === true) throw new ErreurOpenRouter("upstream_redirect");
    if (issue.erreur instanceof ErreurOpenRouter) throw new ErreurOpenRouter(issue.erreur.code);
    throw new ErreurOpenRouter(codeDeStatut(issue.erreur));
  }

  return {
    async envoyer(requete: RequeteModele): Promise<ReponseModele> {
      const { texte, coutUsd, fin, tokens } = await appeler({
        modele: requete.modele,
        routage: requete.routage,
        messages: requete.messages,
        greffonWeb: null,
        // Décision 0116 § 2.3 : 300 s pour la seule requête `programme` (réponse longue), 120 s pour toute autre.
        delaiMs: requete.etape === "programme" ? DELAI_REQUETE_MS.openrouterProgramme : DELAI_REQUETE_MS.openrouter,
        programme: requete.etape === "programme",
      });
      return { texte, coutUsd, fin, ...(tokens === undefined ? {} : { tokens }) };
    },
    async rechercherWeb(requete) {
      const { sources, coutUsd } = await appeler({ modele: requete.modele, routage: requete.routage, messages: requete.messages, greffonWeb: { moteur: requete.moteur, maxResultats: requete.maxResultats }, delaiMs: DELAI_REQUETE_MS.openrouter, programme: false });
      return { sources, coutUsd };
    },
  };
}

const StatutSchema = z.object({ statusCode: z.number().int() });

/** Code fermé d'une erreur de l'AI SDK, sans jamais lire son message ni son corps. */
function codeDeStatut(erreur: unknown): CodeErreurOpenRouter {
  const statut = StatutSchema.safeParse(erreur);
  if (!statut.success) return "upstream_unavailable";
  if (statut.data.statusCode === 429 || statut.data.statusCode >= 500) return "upstream_unavailable";
  return "upstream_error";
}
