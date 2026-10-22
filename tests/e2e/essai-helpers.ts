import { join } from "node:path";

import { PROTOTYPE_PORT_OFFSET, e2ePort } from "../../scripts/e2e-port.mjs";

/**
 * Sixième serveur de test (spécification E2E-essai, lot 1 ; `playwright.config.ts`) : même build, adaptateur
 * `prototype` sur un programme d'essai fabriqué à la main **sans propositions enregistrées**
 * (`prototype/programmes-essai/`), relecteur simulé, paiement simulé ouvert par la liste blanche de `prototype`.
 */
export const ESSAI_URL = `http://127.0.0.1:${e2ePort({ env: process.env, repoPath: join(__dirname, "..", "..") }) + 5 * PROTOTYPE_PORT_OFFSET}`;
export const ESSAI_TRIP = "proto_essai_20271010_1";
export const ESSAI_R6 = `/voyages/${ESSAI_TRIP}/presentation`;
export const ESSAI_R9 = `/voyages/${ESSAI_TRIP}/debloquer`;
export const ESSAI_R11 = `/voyages/${ESSAI_TRIP}`;
export const ESSAI_R9_SIM = new RegExp(`^/voyages/${ESSAI_TRIP}/debloquer/paiement-simule/[A-Za-z0-9_-]{22}$`);
/** Étapes du programme d'essai : jour 1 (4), jour 2 (2), jour 3 (4) ; l'aperçu prend les 6 premières. */
export const APERCU_ESSAI = ["[Lieu de test 1]", "[Table de test 2]", "[Lieu de test 3]", "[Table de test 4]", "[Lieu de test 5]", "[Table de test 6]"];
