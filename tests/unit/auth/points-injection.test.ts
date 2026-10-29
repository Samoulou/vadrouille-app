// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RACINE, rel } from "../p0/resolution";

/**
 * Points d'injection de la connexion réelle (revue consolidée du head `ed79edb` de la PR 446, mineur 4 ; B3c, ticket
 * 447) : `createAuthOperations` (configuration injectée : secret, base, port d'envoi), `creerWithOrg` (base injectée) et
 * `creerContexteServeur` (opérations injectées) ne servent qu'aux tests. Hors de `tests/`, leur nom n'apparaît que dans
 * leur propre module, commentaires compris : le serveur passe par `authOperations()`, `withOrg` et
 * `getServerRequestContext()`, qui lisent leur configuration de l'environnement validé.
 *
 * Revue consolidée du head `2b80bd7` de la PR 452, bloquant 2 : `brancherConnexionReelle` (opérations, limiteur et
 * contexte de session de l'adaptateur `better-auth`, sur `globalThis`) n'est nommée hors de `tests/` que par son module
 * et par `src/instrumentation.ts`, seul appelant du serveur ; `debrancherConnexionReellePourTests` (remise à zéro)
 * n'est nommée hors de `tests/` que par son module. Les tests colocalisés de `src/` n'y font pas exception.
 *
 * Dossiers lus : `src/` (tests colocalisés compris), `db/`, `scripts/` et `eslint-rules/`.
 */

/** Nom du point d'injection → fichiers admis hors de `tests/` (le premier est son module). */
const POINTS: Readonly<Record<string, readonly string[]>> = {
  createAuthOperations: ["src/server/auth/index.ts"],
  creerWithOrg: ["src/server/with-org.ts"],
  creerContexteServeur: ["src/server/session.ts"],
  brancherConnexionReelle: ["src/adapters/better-auth.ts", "src/instrumentation.ts"],
  debrancherConnexionReellePourTests: ["src/adapters/better-auth.ts"],
  // B6b (spécification B6, B6b point 1) : même règle pour le branchement de l'adaptateur `api` (fabrique sur `globalThis`).
  brancherLectureVoyages: ["src/adapters/api-instance.ts", "src/instrumentation.ts"],
  debrancherLectureVoyagesPourTests: ["src/adapters/api-instance.ts"],
  // B9e (spécification B9, B9e point 1) : même règle pour le branchement de la création `api`.
  brancherCreationVoyages: ["src/adapters/api-creation-instance.ts", "src/instrumentation.ts"],
  debrancherCreationVoyagesPourTests: ["src/adapters/api-creation-instance.ts"],
  // B10a (décision 0112 § 2 point 3) : même règle pour le branchement du tri enregistré `api`.
  brancherTriEnregistre: ["src/adapters/api-tri-instance.ts", "src/instrumentation.ts"],
  debrancherTriEnregistrePourTests: ["src/adapters/api-tri-instance.ts"],
  // PR 879 (M1e) : même règle pour le branchement des photos du tri `api`.
  brancherPhotosApi: ["src/adapters/api-photos-instance.ts", "src/instrumentation.ts"],
  debrancherPhotosApiPourTests: ["src/adapters/api-photos-instance.ts"],
  // B4b (spécification B4, B4b point 1) : même règle pour le branchement du paiement simulé en base.
  brancherPaiementSimule: ["src/adapters/simulated-payment-instance.ts", "src/instrumentation.ts"],
  debrancherPaiementSimulePourTests: ["src/adapters/simulated-payment-instance.ts"],
  // B4c (ticket 863) : branchement du paiement Stripe, même modèle.
  brancherPaiementStripe: ["src/adapters/stripe-payment-instance.ts", "src/instrumentation.ts"],
  debrancherPaiementStripePourTests: ["src/adapters/stripe-payment-instance.ts"],
};

const DOSSIERS = ["src", "db", "scripts", "eslint-rules"];
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IGNORES = new Set(["node_modules", ".next", ".git", "coverage"]);

function fichiers(dossier: string): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    if (IGNORES.has(nom)) continue;
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin)));
    else if (EXTENSIONS.test(nom)) resultat.push(rel(chemin));
  }
  return resultat;
}

describe("points d'injection de la connexion réelle", () => {
  it("auth: createAuthOperations, creerWithOrg, creerContexteServeur et le branchement de la connexion réservés à tests/ et aux fichiers admis", () => {
    const lus = DOSSIERS.flatMap(fichiers);
    expect(lus).toEqual(expect.arrayContaining(Object.values(POINTS).flat()));
    const ecarts: string[] = [];
    for (const fichier of lus) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      for (const [nom, admis] of Object.entries(POINTS)) {
        if (!admis.includes(fichier) && new RegExp(`\\b${nom}\\b`).test(texte)) ecarts.push(`${fichier} : ${nom}`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});
