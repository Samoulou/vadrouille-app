import { randomBytes } from "node:crypto";

import { verificateurScram } from "./scram.ts";

/**
 * Calcule le vérificateur SCRAM-SHA-256 d'un mot de passe lu sur l'entrée standard (décision 0046, S5) et l'écrit seul
 * sur la sortie standard, pour `ALTER ROLE … PASSWORD '<vérificateur>'`. Le mot de passe n'est jamais affiché, ni pris
 * en argument (liste des processus) ; un retour à la ligne final est retiré. Sel aléatoire de 16 octets.
 *
 * Usage (hors du dépôt, historique du shell coupé) :
 *   node --disable-warning=ExperimentalWarning scripts/db/scram-verifier.ts < fichier-du-mot-de-passe
 */

const morceaux: Buffer[] = [];
for await (const morceau of process.stdin) morceaux.push(morceau as Buffer);
const motDePasse = Buffer.concat(morceaux).toString("utf8").replace(/\r?\n$/, "");
try {
  process.stdout.write(`${verificateurScram(motDePasse, randomBytes(16))}\n`);
} catch (erreur) {
  process.stderr.write(`${(erreur as Error).message}\n`);
  process.exitCode = 1;
}
