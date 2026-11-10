import { cibleDe, importateurDe, visiteurs } from "./ia-recherche-imports.mjs";

/**
 * Règle ESLint locale des route handlers (spécification B4, B4a point 7 ; amendement de 0017 § 3.3 et 0020 § 11 écrit
 * dans 0006, conflit C17 ; décision 0097 B4-TL-5). Posée sur tout fichier du dépôt par un seul bloc d'`eslint.config.mjs`
 * (tests/unit/lint/route-handlers-lint.test.ts) :
 * - `@/server/routes/*` ne s'importe que depuis un `route.ts` de `src/app/api/` (et depuis les tests : `*.test.*` et
 *   `tests/`, qui appellent le gestionnaire directement, critère A22), ou depuis `src/server/routes/` lui-même (fabrique
 *   commune des webhooks, décision 0140 § 2.1) ;
 * - un `route.ts` de `src/app/api/` n'importe rien d'autre de `src/server` que `@/server/routes/*` ;
 * - dans `src/server/actions/` : ni `@/server/routes/*`, ni `@/server/env/payment`, ni les identifiants `constructEvent`,
 *   `STRIPE_WEBHOOK_SECRET` et `SIMULATED_WEBHOOK_SECRET`, ni le paquet `stripe` dans aucun fichier, `paiement.ts`
 *   compris (amendement de 0006 par la décision 0140 § 1.3 (b) : la session est créée par l'adaptateur, depuis
 *   `src/server/payment/stripe.ts`, seul importateur du paquet) ;
 * - `PaymentEvent` et `PaymentEventSchema` (contrat interne du serveur) ne s'importent ni dans `src/features` ni dans
 *   `src/components`.
 * La directive `"use server"` d'un fichier de `src/server/routes/` est refusée par `ligne/use-server-only-in-actions`.
 * Les noms d'identifiants sont écrits en clés d'objet (spécification P0c, section 5 : un nom secret n'est jamais un texte).
 */

const ROUTES = "src/server/routes";
const ACTIONS = "src/server/actions/";
const ENV_PAIEMENT = "src/server/env/payment";

/** Identifiants refusés dans les actions (clés d'objet, jamais des textes). */
export const IDENTIFIANTS_REFUSES_ACTIONS = new Set(Object.keys({ constructEvent: 0, STRIPE_WEBHOOK_SECRET: 0, SIMULATED_WEBHOOK_SECRET: 0 }));
/** Noms du contrat interne refusés dans l'interface. */
export const CONTRAT_INTERNE = new Set(Object.keys({ PaymentEvent: 0, PaymentEventSchema: 0 }));

const estTest = (fichier) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier) || fichier.startsWith("tests/");
export const estRouteApi = (fichier) => /^src\/app\/api\/(.+\/)?route\.(ts|tsx|js|mjs)$/.test(fichier);
const dans = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);
const interface_ = (fichier) => fichier.startsWith("src/features/") || fichier.startsWith("src/components/");

/** Motif de refus pour `source` chargée par `importateur`, ou `null`. */
export function refusImport(source, importateur) {
  const cible = cibleDe(source, importateur);
  if (cible.paquet !== undefined) {
    const paquet = cible.paquet;
    if (importateur.startsWith(ACTIONS) && (paquet === "stripe" || paquet.startsWith("stripe/"))) return "stripe";
    return null;
  }
  const chemin = cible.chemin;
  if (dans(chemin, ROUTES)) {
    // B4c (décision 0140 § 2.1) : les modules de `src/server/routes/` s'importent entre eux (fabrique commune des webhooks).
    if (estTest(importateur) || estRouteApi(importateur) || dans(importateur, ROUTES)) return null;
    return "routes";
  }
  if (estRouteApi(importateur) && dans(chemin, "src/server")) return "route";
  if (importateur.startsWith(ACTIONS) && chemin === ENV_PAIEMENT) return "envPaiement";
  return null;
}

const MESSAGES = {
  routes: "@/server/routes/* ne s'importe que depuis un route.ts de src/app/api (B4a point 7 ; amendement de 0006) ({{source}}).",
  route: "Un route.ts de src/app/api n'importe de src/server que @/server/routes/* (B4a point 7 ; amendement de 0006) ({{source}}).",
  envPaiement: "@/server/env/payment est refusé dans src/server/actions (B4a point 7 ; décision 0097 B4-TL-3) ({{source}}).",
  stripe: "Le paquet stripe ne s'importe pas dans src/server/actions (décision 0140 § 1.3 : seul src/server/payment/stripe.ts l'importe) ({{source}}).",
  identifiant: "Identifiant refusé dans src/server/actions (B4a point 7 : vérification de signature et secrets des webhooks) ({{nom}}).",
  contrat: "PaymentEvent est un contrat interne du serveur : jamais importé dans src/features ni src/components (décision 0097 B4-TL-5) ({{nom}}).",
};

export const routeHandlers = {
  meta: {
    type: "problem",
    docs: { description: "Route handlers : importateurs de @/server/routes, imports des route.ts, interdits des actions (B4a point 7)." },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    const importateur = importateurDe(context);
    const actions = importateur.startsWith(ACTIONS) && !estTest(importateur);
    const visites = visiteurs((node, source) => {
      if (source === null) return;
      const motif = refusImport(source, importateur);
      if (motif !== null) context.report({ node, messageId: motif, data: { source } });
    });
    return {
      ...visites,
      ImportDeclaration(node) {
        visites.ImportDeclaration(node);
        if (!interface_(importateur) || typeof node.source.value !== "string" || !node.source.value.startsWith("@/contracts")) return;
        for (const specificateur of node.specifiers) {
          const nom = specificateur.type === "ImportSpecifier" ? (specificateur.imported.name ?? specificateur.imported.value) : null;
          if (nom !== null && CONTRAT_INTERNE.has(nom)) context.report({ node: specificateur, messageId: "contrat", data: { nom } });
        }
      },
      Identifier(node) {
        if (actions && IDENTIFIANTS_REFUSES_ACTIONS.has(node.name)) context.report({ node, messageId: "identifiant", data: { nom: node.name } });
      },
    };
  },
};
