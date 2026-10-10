// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CheckoutRequestSchema } from "@/contracts";

import { parseInput } from "./parse-input";

/** `parseInput` (décision 0017 § 4, reprise par 0020 § 11). */

describe("parseInput", () => {
  it("renvoie la valeur validée", () => {
    expect(parseInput(CheckoutRequestSchema, { tripId: "t1", method: "card" })).toEqual({
      ok: true,
      value: { tripId: "t1", method: "card" },
    });
  });

  it("champ refusé : validation_failed avec le chemin du champ", () => {
    expect(parseInput(CheckoutRequestSchema, { tripId: "t1", method: "paypal" })).toEqual({
      ok: false,
      error: { code: "validation_failed", field: "method" },
    });
  });

  it("chemin pointé avec indice de tableau", () => {
    const schema = z.strictObject({ cities: z.array(z.strictObject({ name: z.string().min(1) })) });
    expect(parseInput(schema, { cities: [{ name: "a" }, { name: "" }] })).toEqual({
      ok: false,
      error: { code: "validation_failed", field: "cities.1.name" },
    });
  });

  it.each(["<script>", "personne@example.ch", "amount"])("clé inconnue « %s » : ni dans field ni dans la réponse", (key) => {
    const result = parseInput(CheckoutRequestSchema, { tripId: "t1", method: "card", [key]: "valeur-hostile" });
    expect(result).toEqual({ ok: false, error: { code: "validation_failed" } });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("valeur-hostile");
  });

  it("entrée qui n'est pas un objet : sans field", () => {
    expect(parseInput(CheckoutRequestSchema, "t1")).toEqual({ ok: false, error: { code: "validation_failed" } });
    expect(parseInput(CheckoutRequestSchema, null)).toEqual({ ok: false, error: { code: "validation_failed" } });
  });

  it("la valeur reçue n'apparaît jamais", () => {
    const result = parseInput(CheckoutRequestSchema, { tripId: "<img src=x>", method: "card" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("<img");
  });
});
