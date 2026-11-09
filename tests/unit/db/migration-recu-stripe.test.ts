// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0025_recu_stripe (B4e, partie `data`, ticket 887 ; décision 0144 § 5.2 et § 5.3 point 1) : texte de la
 * contrainte (motif de la Sécurité inchangé, puis refus de `..` et de `%2e%2e`), déclencheur d'écriture unique, droit de
 * colonne de `vadrouille_webhook` seul, descente étendue dans l'ordre de 0144. Les effets en base :
 * `tests/db/recu-stripe.test.ts`.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0025_recu_stripe.sql");
const DOWN = lire("0025_recu_stripe.down.sql");
const instructions = (texte: string) =>
  texte
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("--") || ligne.startsWith("--> statement-breakpoint"))
    .join("\n")
    .split("--> statement-breakpoint")
    .map((i) => i.trim())
    .filter(Boolean);

/** Motif de la Sécurité, recopié de 0144 § 5.2 (réponse à Q11 de la revue de #884), sans aucun changement. */
const MOTIF_SECURITE = String.raw`^https://pay\.stripe\.com/receipts/[A-Za-z0-9_%./~-]+(\?[A-Za-z0-9_%=&.~-]*)?$`;

describe("migration 0025 : colonne, contrainte, déclencheur et droit (0144 § 5.3 point 1)", () => {
  const liste = instructions(SQL);

  it("sous vadrouille_owner, du premier au dernier objet ; aucun DELETE, UPDATE de lignes, REVOKE ni DROP", () => {
    expect(liste[0]).toBe("SET LOCAL ROLE vadrouille_owner;");
    expect(liste.at(-1)).toBe("RESET ROLE;");
    expect(liste.filter((i) => /^(SET LOCAL ROLE|RESET ROLE)/.test(i))).toHaveLength(2);
    for (const i of liste) expect(i, i).not.toMatch(/^(DELETE|UPDATE|TRUNCATE|REVOKE|DROP)\b/);
  });

  it("colonne nullable et CHECK : motif de la Sécurité inchangé, 2048 caractères au plus, `..` et `%2e` refusés sans égard à la casse", () => {
    expect(liste).toContain('ALTER TABLE "checkouts" ADD COLUMN "stripe_receipt_url" text;');
    const check = liste.find((i) => i.includes("checkouts_stripe_receipt_url_check"));
    expect(check).toBe(
      'ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_stripe_receipt_url_check" CHECK ("checkouts"."stripe_receipt_url" IS NULL OR ' +
        '(length("checkouts"."stripe_receipt_url") <= 2048 AND "checkouts"."stripe_receipt_url" ~ ' +
        `'${MOTIF_SECURITE}'` +
        ` AND "checkouts"."stripe_receipt_url" !~* '(\\.|%2e)(\\.|%2e)'));`,
    );
  });

  it("déclencheur checkouts_receipt_once : BEFORE INSERT OR UPDATE OF stripe_receipt_url, fonction ordinaire à search_path fixé, refus 42501 sans la valeur", () => {
    const fonction = liste.find((i) => i.startsWith("CREATE FUNCTION public.checkouts_receipt_once() RETURNS trigger"));
    expect(fonction).toBeDefined();
    expect(fonction).toContain("LANGUAGE plpgsql\n  SET search_path = pg_catalog, pg_temp\nAS $$");
    expect(fonction).not.toMatch(/SECURITY DEFINER/);
    expect(fonction).toContain("IF NEW.stripe_receipt_url IS NOT NULL THEN");
    expect(fonction).toContain("ELSIF OLD.stripe_receipt_url IS NOT NULL\n     AND NEW.stripe_receipt_url IS DISTINCT FROM OLD.stripe_receipt_url THEN");
    const refus = [...(fonction ?? "").matchAll(/RAISE EXCEPTION '([^']|'')*' USING ERRCODE = 'insufficient_privilege';/g)];
    expect(refus).toHaveLength(2);
    // Les messages ne citent jamais la valeur reçue (aucun paramètre `%` dans RAISE).
    for (const r of refus) expect(r[0]).not.toMatch(/%|NEW\.|OLD\./);
    expect(liste).toContain(
      "CREATE TRIGGER checkouts_receipt_once BEFORE INSERT OR UPDATE OF stripe_receipt_url ON public.checkouts\n  FOR EACH ROW EXECUTE FUNCTION public.checkouts_receipt_once();",
    );
    // Mode ordinaire, comme checkouts_session_once (0144 § 5.3 point 1 : ENABLE ALWAYS non retenu).
    expect(SQL).not.toMatch(/ENABLE (ALWAYS|REPLICA) TRIGGER/);
  });

  it("un seul droit : UPDATE (stripe_receipt_url) à vadrouille_webhook", () => {
    expect(liste.filter((i) => /^GRANT\b/.test(i))).toEqual(["GRANT UPDATE (stripe_receipt_url) ON public.checkouts TO vadrouille_webhook;"]);
  });
});

describe("migration 0025 : descente étendue (0144 § 5.3 point 1)", () => {
  it("déclencheur, fonction, puis colonne ; rien d'autre (ni DELETE, ni TRUNCATE, ni autre colonne)", () => {
    expect(instructions(DOWN)).toEqual([
      "SET LOCAL ROLE vadrouille_owner;",
      "DROP TRIGGER checkouts_receipt_once ON public.checkouts;",
      "DROP FUNCTION public.checkouts_receipt_once();",
      "ALTER TABLE public.checkouts DROP COLUMN stripe_receipt_url;",
      "RESET ROLE;",
    ]);
  });
});
