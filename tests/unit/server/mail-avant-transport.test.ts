// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Chemin d'avant-transport commun (décision 0138 C2 ; revue de la PR 850, bloquant 1) : les contrôles de sûreté du port
 * (adresse refaite, forme du code, construction des quatre champs, `checkEnvelope`) n'ont qu'**une** définition,
 * `preparerMessageCode` (`src/server/mail/avant-transport.ts`), appelée par les deux transports. Le comportement de
 * chaque transport est vérifié par ses propres tests (E4 et E5 de B3b-envoi pour SMTP, R3 de B3d pour Resend) ; ce
 * test empêche le retour d'une seconde copie, qui pourrait diverger sans qu'un test le voie.
 */

const lire = (fichier: string) => readFileSync(path.join(process.cwd(), fichier), "utf8");
const TRANSPORTS = ["src/server/mail/smtp.ts", "src/server/mail/resend.ts"] as const;

describe("email: chemin d'avant-transport commun aux transports SMTP et Resend", () => {
  it.each(TRANSPORTS)("%s appelle preparerMessageCode une fois et ne refait aucun contrôle lui-même", (fichier) => {
    const source = lire(fichier);
    expect(source).toContain('from "./avant-transport"');
    expect(source.match(/\bpreparerMessageCode\(/g)).toHaveLength(1);
    for (const copie of [/\bcheckEnvelope\(/, /\bparseEmailAddress\(/, /\[0-9\]\{6\}/, /logEvent\("email\.address_refused"/, /logEvent\("email\.envelope_refused"/, /emailCode\./]) {
      expect(source).not.toMatch(copie);
    }
  });

  it("le module commun porte seul les contrôles et leurs événements", () => {
    const source = lire("src/server/mail/avant-transport.ts");
    for (const controle of [/\bcheckEnvelope\(/, /\bparseEmailAddress\(/, /logEvent\("email\.address_refused"/, /logEvent\("email\.envelope_refused"/]) {
      expect(source).toMatch(controle);
    }
  });
});
