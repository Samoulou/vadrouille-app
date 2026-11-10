// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as valeurs from "@/contracts/values";

/**
 * Migration 0022_feedback_signalements (M5-D ; décision 0147 § 2 point 3) : la liste fermée de `feedback_reason_check`
 * est exactement `STOP_REPORT_REASONS`, dans le même ordre ; la migration retire l'`UPDATE` de table de `vadrouille_app`
 * et sa descente ne supprime rien et ne le rétablit pas.
 *
 * `STOP_REPORT_REASONS` arrive par la PR de contrat M5-C (0147 § 14), menée en parallèle : tant qu'elle n'est pas
 * fusionnée, la liste est comparée aux cinq motifs écrits par 0147 § 1 point 1 ; dès qu'elle l'est, au contrat lui-même
 * (lu par son nom, sans copie), et le contrat doit alors égaler ces cinq motifs.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const SQL = readFileSync(path.join(MIGRATIONS, "0022_feedback_signalements.sql"), "utf8");
const DOWN = readFileSync(path.join(MIGRATIONS, "0022_feedback_signalements.down.sql"), "utf8");
const MOTIFS_0147 = ["closed", "hours", "wrongPlace", "price", "other"];
const contrat = (valeurs as Record<string, unknown>).STOP_REPORT_REASONS as readonly string[] | undefined;

/** Instructions SQL, commentaires retirés. */
const instructions = (texte: string) =>
  texte
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

describe("migration 0022 : motifs fermés de feedback", () => {
  it("feedback_reason_check : exactement STOP_REPORT_REASONS (ou, avant M5-C, les cinq motifs de 0147 § 1)", () => {
    const debut = SQL.indexOf('"feedback_reason_check" CHECK');
    expect(debut).toBeGreaterThan(-1);
    const liste = SQL.slice(debut).match(/"reason" IN \(([^)]*)\)/);
    expect(liste).not.toBeNull();
    const motifs = [...(liste?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(motifs).toEqual(MOTIFS_0147);
    if (contrat !== undefined) expect([...contrat]).toEqual(motifs);
  });

  it("aucun texte, étape exigée d'un signalement d'étape, deux index uniques partiels", () => {
    expect(SQL).toContain('CHECK ("feedback"."text" IS NULL)');
    expect(SQL).toContain(`CHECK ("feedback"."scope" <> 'stop' OR "feedback"."target_stop_id" IS NOT NULL)`);
    expect(SQL).toContain('("organization_id","trip_id","request_id") WHERE "feedback"."request_id" IS NOT NULL');
    expect(SQL).toContain(`("organization_id","trip_id","target_stop_id","reason",COALESCE("place_id", '')) WHERE "feedback"."scope" = 'stop'`);
    expect(instructions(SQL)).not.toMatch(/NOT VALID/);
  });
});

describe("migration 0022 : droits et retour arrière", () => {
  it("UPDATE de table retiré à vadrouille_app sur feedback ; UPDATE (lieux) seul accordé au rôle des compteurs", () => {
    const texte = instructions(SQL);
    expect(texte).toContain("REVOKE UPDATE ON public.feedback FROM vadrouille_app;");
    expect(texte).toContain("GRANT UPDATE (lieux) ON public.autocomplete_daily_counts TO vadrouille_autocomplete_counter;");
    expect(texte.match(/\bGRANT\b/g)).toHaveLength(1);
    expect(texte).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE\s+(public\.)?"?\w+"?\s+SET)\b/i);
  });

  it("la descente ne supprime rien et ne rétablit aucun UPDATE sur feedback : un seul REVOKE, celui de lieux", () => {
    const texte = instructions(DOWN);
    expect(texte).not.toMatch(/\b(DROP|DELETE|TRUNCATE|GRANT|ALTER\s+TABLE)\b/i);
    expect(texte.split("\n").filter((l) => /^REVOKE /.test(l))).toEqual([
      "REVOKE UPDATE (lieux) ON public.autocomplete_daily_counts FROM vadrouille_autocomplete_counter;",
    ]);
  });
});
