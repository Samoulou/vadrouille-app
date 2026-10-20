// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKOUT_TTL_MS } from "@/adapters";
import { PAYMENT_EVENT_TYPES } from "@/contracts/values";
import { formatLogLine, LOG_ALERT_CODES, LOG_EVENTS, LOG_PAYMENT_EVENT_TYPES } from "@/server/log";
import { DUREE_VIE_PAIEMENT_MS } from "@/server/payment/dependances";
import { CODES_ALERTE_PAIEMENT } from "@/server/payment/webhook";

/** Journal du paiement (décision 0097 B4-TL-13 point 4) et durée de vie d'un paiement (B4-PO-4). */
describe("paiement: journal et constantes", () => {
  it("codes d'alerte du journal = codes du webhook ; types d'événement du journal = `PAYMENT_EVENT_TYPES`", () => {
    expect([...LOG_ALERT_CODES].sort()).toEqual([...CODES_ALERTE_PAIEMENT].sort());
    expect([...LOG_PAYMENT_EVENT_TYPES]).toEqual([...PAYMENT_EVENT_TYPES]);
    for (const evenement of ["payment.alert", "payment.followup_failed", "payment.webhook_config_invalid"]) expect(LOG_EVENTS).toContain(evenement);
  });

  it("une ligne d'alerte porte `alertCode`, jamais `code` ; champs hors motif retirés", () => {
    const eventId = "evt_sim_0123456789abcdef0123456789abcdef";
    const checkoutId = "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f";
    const ligne = JSON.parse(formatLogLine("payment.alert", { eventId, eventType: "checkoutCompleted", alertCode: "amount_mismatch", checkoutId }, "error")) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "error", event: "payment.alert", eventId, eventType: "checkoutCompleted", alertCode: "amount_mismatch", checkoutId });
    expect(ligne).not.toHaveProperty("code");
    const refusee = JSON.parse(formatLogLine("payment.alert", { eventId: "evt_sim_x!", eventType: "inconnu", alertCode: "autre", checkoutId: "pas-un-uuid" }, "error")) as Record<string, unknown>;
    for (const champ of ["eventId", "eventType", "alertCode", "checkoutId"]) expect(refusee).not.toHaveProperty(champ);
    expect(refusee.dropped).toBe(4);
    // `code` n'admet que `API_ERROR_CODES` : un code d'alerte y est retiré.
    expect(JSON.parse(formatLogLine("payment.alert", { code: "amount_mismatch" } as object, "error"))).not.toHaveProperty("code");
  });

  it("durée de vie d'un paiement serveur = `CHECKOUT_TTL_MS` de l'adaptateur `mock` (30 minutes)", () => {
    expect(DUREE_VIE_PAIEMENT_MS).toBe(CHECKOUT_TTL_MS);
    expect(DUREE_VIE_PAIEMENT_MS).toBe(30 * 60_000);
  });

  it("aucun code de src/server/payment n'écrit checkouts.id : le défaut `gen_random_uuid()` fait l'identifiant (0097 B4-TL-1 point 4)", () => {
    const dossier = path.join(process.cwd(), "src/server/payment");
    const insertions = readdirSync(dossier)
      .filter((nom) => nom.endsWith(".ts"))
      .flatMap((nom) => [...readFileSync(path.join(dossier, nom), "utf8").matchAll(/INSERT INTO checkouts\s*\(([^)]*)\)/g)].map((m) => m[1] ?? ""));
    expect(insertions.length).toBeGreaterThan(0);
    for (const colonnes of insertions) expect(colonnes.split(",").map((c) => c.trim())).not.toContain("id");
    for (const nom of readdirSync(dossier)) expect(readFileSync(path.join(dossier, nom), "utf8"), nom).not.toMatch(/UPDATE checkouts SET(?:(?!WHERE)[^;])*\bid\s*=/);
  });
});
