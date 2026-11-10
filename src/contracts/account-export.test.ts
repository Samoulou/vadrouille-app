import { describe, expect, it } from "vitest";

import { ACCOUNT_EXPORT_FORBIDDEN_KEYS, ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_VERSION, AccountExportSchema, accountExportKeys } from "./account-export";
import { ApiErrorSchema } from "./errors";
import { API_ERROR_CODES } from "./values";

/**
 * Contrat `AccountExport` (spécification M9 § 3.2, § 3.5 et § 6.2 ; ticket 1097, M9a) et codes d'erreur du § 6.1. Le
 * fichier complet construit depuis des lignes de la base est éprouvé par `tests/unit/account/export.test.ts`.
 */

const VIDE = {
  format: "vadrouille-export",
  version: 1,
  exportedAt: "2026-11-09T10:00:00.000Z",
  notice: "Texte.",
  account: { email: "samuel@exemple.test", createdAt: "2026-08-01T08:00:00.000Z" },
  trips: [],
  tastes: [],
};

describe("contrats: AccountExport (M9a)", () => {
  it("en-tête fixe : format vadrouille-export, version 1, exportedAt instant UTC, notice non vide", () => {
    expect(ACCOUNT_EXPORT_FORMAT).toBe("vadrouille-export");
    expect(ACCOUNT_EXPORT_VERSION).toBe(1);
    expect(AccountExportSchema.parse(VIDE)).toEqual(VIDE);
    for (const ecart of [{ format: "autre" }, { version: 2 }, { exportedAt: "2026-11-09" }, { exportedAt: "2026-11-09T11:00:00+01:00" }, { notice: "" }]) {
      expect(AccountExportSchema.safeParse({ ...VIDE, ...ecart }).success, JSON.stringify(ecart)).toBe(false);
    }
  });

  it("strict : clé inconnue refusée en tête, dans le compte ; ordre des clés de la sortie = ordre du contrat", () => {
    expect(AccountExportSchema.safeParse({ ...VIDE, sessions: [] }).success).toBe(false);
    expect(AccountExportSchema.safeParse({ ...VIDE, account: { ...VIDE.account, id: "x" } }).success).toBe(false);
    const melange = { tastes: [], trips: [], account: VIDE.account, notice: "Texte.", exportedAt: VIDE.exportedAt, version: 1, format: "vadrouille-export" };
    expect(Object.keys(AccountExportSchema.parse(melange))).toEqual(["format", "version", "exportedAt", "notice", "account", "trips", "tastes"]);
  });

  it("clés exclues (critère 6) : aucune n'est une clé du contrat ; parcours récursif", () => {
    expect(ACCOUNT_EXPORT_FORBIDDEN_KEYS).toEqual(expect.arrayContaining(["token_hash", "stripe_checkout_session_id", "request_id", "patch", "email_verified"]));
    expect(accountExportKeys(VIDE)).toEqual(["format", "version", "exportedAt", "notice", "account", "email", "createdAt", "trips", "tastes"]);
  });
});

describe("contrats: reauthentication_required et forbidden (spécification M9 § 6.1)", () => {
  it("ajoutés à la fin, après not_unlocked, sans renommer ni réordonner", () => {
    // `payment_pending` (M9b, revue de #1108) les suit : les trois codes gardent leur rang.
    const rang = API_ERROR_CODES.indexOf("not_unlocked");
    expect(API_ERROR_CODES.slice(rang, rang + 3)).toEqual(["not_unlocked", "reauthentication_required", "forbidden"]);
    expect(API_ERROR_CODES.slice(-4)).toEqual(["not_unlocked", "reauthentication_required", "forbidden", "payment_pending"]);
    expect(API_ERROR_CODES.indexOf("validation_failed")).toBe(0);
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    expect(ApiErrorSchema.safeParse({ code: "reauthentication_required" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "forbidden" }).success).toBe(true);
  });
});
