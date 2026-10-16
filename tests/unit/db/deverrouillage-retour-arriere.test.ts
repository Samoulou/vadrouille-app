// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Décision 0056 § 4.2 : le fichier de retour arrière de la migration de déverrouillage est une copie, octet pour
 * octet, du texte figé `db/reverrouillage/retour-deverrouillage.sql` livré par la PR de `db-reverrouillage` (§ 4.6
 * point 1), dont l'empreinte est la constante `REVERROUILLAGE_SHA256` écrite en clair dans le workflow. Ce test ne
 * modifie ni le texte figé ni la constante (0056 § 4.3) : il vérifie seulement qu'ils restent égaux à la copie.
 */
const RACINE = process.cwd();
const TAG = "0006_deverrouillage_positions_prototype";
const RETOUR = path.join(RACINE, "db/migrations", `${TAG}.down.sql`);
const TEXTE_FIGE = path.join(RACINE, "db/reverrouillage/retour-deverrouillage.sql");
const WORKFLOW = path.join(RACINE, ".github/workflows/db-reverrouillage.yml");

const sha256 = (octets: Buffer) => createHash("sha256").update(octets).digest("hex");

/** Constante `REVERROUILLAGE_SHA256` du workflow : une seule affectation, 64 caractères hexadécimaux. */
function constante(): string {
  const affectations = [...readFileSync(WORKFLOW, "utf8").matchAll(/^\s*REVERROUILLAGE_SHA256=([0-9a-f]{64})$/gm)];
  expect(affectations).toHaveLength(1);
  return affectations[0]![1]!;
}

describe("migrations: retour arrière du déverrouillage identique au texte figé de db-reverrouillage", () => {
  it("la migration est au journal, son retour arrière existe", () => {
    const journal = JSON.parse(readFileSync(path.join(RACINE, "db/migrations/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    expect(journal.entries.map((e) => e.tag)).toContain(TAG);
    expect(() => readFileSync(RETOUR)).not.toThrow();
  });

  it("empreintes égales : retour arrière, texte figé et REVERROUILLAGE_SHA256", () => {
    const retour = readFileSync(RETOUR);
    const fige = readFileSync(TEXTE_FIGE);
    expect(retour.equals(fige)).toBe(true);
    expect(sha256(retour)).toBe(sha256(fige));
    expect(sha256(retour)).toBe(constante());
  });

  it("cas négatif : un octet de plus dans le retour arrière change l'empreinte", () => {
    const modifie = Buffer.concat([readFileSync(RETOUR), Buffer.from("\n")]);
    expect(sha256(modifie)).not.toBe(constante());
  });

  it("la migration n'a qu'une instruction de droit, l'inverse du retour arrière, dans le même cadre (0056 § 4.2)", () => {
    const sansCommentaires = (texte: string) =>
      texte
        .split("\n")
        .filter((l) => !l.startsWith("-- "))
        .join("\n")
        .replace(/^--\n/gm, "");
    const migration = sansCommentaires(readFileSync(path.join(RACINE, "db/migrations", `${TAG}.sql`), "utf8"));
    const retour = readFileSync(RETOUR, "utf8");
    const attendu = retour.replace(/^REVOKE EXECUTE ON FUNCTION (.+) FROM vadrouille_prototype;$/m, "GRANT EXECUTE ON FUNCTION $1 TO vadrouille_prototype;");
    expect(attendu).not.toBe(retour);
    expect(migration).toBe(attendu);
  });
});
