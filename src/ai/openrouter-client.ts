import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";

import { MODELE_ID_PATTERN } from "@/prototype/config";
import type { ClientModeles, Message, RequeteModele, ReponseModele } from "@/ai/client";
import { MAX_RESULTATS_WEB, type PointEntreeRechercheWeb, type SourceWebFournisseur } from "@/ai/recherche-web-reelle";
import { lireCleOpenRouter } from "@/server/env/ai";
import { CODE_CLE_ABSENTE } from "@/server/env/egress";
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
 *   modèles) ; seul le greffon `web` est ajouté au corps, avec un nombre de résultats borné. L'enveloppe exige ce
 *   greffon pour `rechercherWeb` et le refuse pour `envoyer` (aucune recherche web cachée dans un appel ordinaire).
 *   Seules les sources (citations d'adresses) sont rendues ; le texte du modèle est ignoré.
 */

/** Origine figée, exportée pour les tests (qui n'écrivent pas l'hôte, surveillé par le régime de confinement). */
export const ORIGINE_MODELES = "https://openrouter.ai";
const BASE_URL = "https://openrouter.ai/api/v1";

/** Transport : la signature du `fetch` global, toujours appelée à travers l'enveloppe. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export const CODES_ERREUR_OPENROUTER = [
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  CODE_CLE_ABSENTE,
  "cap_reached",
  "envelope_reached",
  "daily_quota_insufficient",
  "usage_unavailable",
  "data_collection_missing",
  "model_id_invalid",
  "invalid_request",
  "upstream_redirect",
  "upstream_unavailable",
  "upstream_timeout",
  "upstream_error",
] as const;
export type CodeErreurOpenRouter = (typeof CODES_ERREUR_OPENROUTER)[number];

const REESSAYABLES: ReadonlySet<CodeErreurOpenRouter> = new Set(["upstream_unavailable", "upstream_timeout"]);

export class ErreurOpenRouter extends Error {
  readonly code: CodeErreurOpenRouter;
  readonly retryable: boolean;
  constructor(code: CodeErreurOpenRouter) {
    super(code);
    this.code = code;
    this.retryable = REESSAYABLES.has(code);
    this.name = "ErreurOpenRouter";
  }
}

export type OptionsOpenRouter = {
  readonly usage: PortConsommation;
  readonly contexte: () => ContexteAppel;
  readonly plafonds: readonly Plafond[];
  /** Coût estimé d'une requête, en micro-USD (réservé avant l'appel, remplacé par le coût réel s'il est rendu). */
  readonly coutEstimeMicros: number;
  readonly horloge?: Horloge;
  readonly environnement?: Readonly<Record<string, string | undefined>>;
  readonly execArgv?: readonly string[];
};

/** État propre à un appel, noté par l'enveloppe et lu par le client sur toute erreur de l'AI SDK. */
type EtatAppel = { appele: () => void; redirection: boolean; greffonWeb: number | null };

const CorpsSchema = z.object({ provider: z.object({ data_collection: z.literal("deny") }), plugins: z.unknown().optional() });
/** Seul greffon admis, et seulement pour `rechercherWeb` : `web` et son nombre de résultats. */
const GreffonsWebSchema = z.tuple([z.strictObject({ id: z.literal("web"), max_results: z.number().int().min(1).max(MAX_RESULTATS_WEB) })]);
const CoutSchema = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number().nonnegative() }) }) });

/** Client réel : `envoyer` (interface `ClientModeles`) et le point d'entrée de recherche web du fournisseur. */
export type ClientModelesReel = ClientModeles & { readonly rechercherWeb: PointEntreeRechercheWeb };

/** Appel commun aux deux méthodes : messages déjà contrôlés, greffon `web` éventuel. */
type AppelModele = {
  readonly modele: string;
  readonly routage: RequeteModele["routage"];
  readonly messages: readonly Message[];
  readonly greffonWeb: number | null;
};

/** Résultat brut d'un appel : texte, sources (citations d'adresses) et coût. */
type ResultatAppel = { readonly texte: string; readonly sources: readonly SourceWebFournisseur[]; readonly coutUsd: number };

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
    if (etat.greffonWeb === null ? greffons !== undefined : !GreffonsWebSchema.safeParse(greffons).success || (greffons as [{ max_results: number }])[0].max_results !== etat.greffonWeb) {
      throw new ErreurOpenRouter("invalid_request");
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
    if (greffonWeb !== null && (!Number.isSafeInteger(greffonWeb) || greffonWeb < 1 || greffonWeb > MAX_RESULTATS_WEB)) throw new ErreurOpenRouter("invalid_request");
    const systeme = requete.messages.filter((m) => m.role === "system").map((m) => m.contenu);
    const utilisateur = requete.messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.contenu }));
    const modele = fournisseur.chat(requete.modele, {
      provider: { data_collection: "deny", ...(requete.routage.zdr === undefined ? {} : { zdr: requete.routage.zdr }) },
      usage: { include: true },
      ...(greffonWeb === null ? {} : { plugins: [{ id: "web" as const, max_results: greffonWeb }] }),
    });
    let etat: EtatAppel | undefined;
    const issue = await avecReservation(
      { port: options.usage, horloge },
      demandeDe(
        options.contexte(),
        { fournisseur: "modeles", methode: "chat", sku: requete.modele, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: options.coutEstimeMicros },
        options.plafonds,
      ),
      DELAI_REQUETE_MS.openrouter,
      async (signal, transportAppele) => {
        etat = { appele: transportAppele, redirection: false, greffonWeb };
        etats.set(signal, etat);
        try {
          const resultat = await generateText({
            model: modele,
            ...(systeme.length > 0 ? { system: systeme.join("\n\n") } : {}),
            messages: utilisateur,
            maxRetries: 0,
            abortSignal: signal,
            experimental_telemetry: { isEnabled: false },
          });
          const cout = CoutSchema.safeParse(resultat.providerMetadata);
          const coutReelMicros = cout.success ? Math.round(cout.data.openrouter.usage.cost * 1_000_000) : null;
          const sources: SourceWebFournisseur[] = [];
          if (greffonWeb !== null) {
            for (const brute of resultat.sources) {
              const source = SourceSchema.safeParse(brute);
              if (source.success) sources.push({ url: source.data.url, titre: source.data.title ?? "", extrait: source.data.providerMetadata?.openrouter?.content ?? "" });
            }
          }
          return { valeur: { texte: resultat.text, sources, coutUsd: (coutReelMicros ?? options.coutEstimeMicros) / 1_000_000 }, coutReelMicros };
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
      const { texte, coutUsd } = await appeler({ modele: requete.modele, routage: requete.routage, messages: requete.messages, greffonWeb: null });
      return { texte, coutUsd };
    },
    async rechercherWeb(requete) {
      const { sources, coutUsd } = await appeler({ modele: requete.modele, routage: requete.routage, messages: requete.messages, greffonWeb: requete.maxResultats });
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
