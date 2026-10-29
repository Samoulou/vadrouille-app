import { describe, expect, it } from "vitest";

import { ApiErrorSchema } from "./errors";
import { API_ERROR_CODES } from "./values";

describe("contrats: email_cap_reached (spécification B3d, R4b)", () => {
  it("ajouté après generation_in_progress, sans réordonner (dernier jusqu'à `not_unlocked` de M5, décision 0147 § 8)", () => {
    expect(API_ERROR_CODES.indexOf("generation_in_progress")).toBeGreaterThanOrEqual(0);
    expect(API_ERROR_CODES.indexOf("email_cap_reached")).toBe(API_ERROR_CODES.indexOf("generation_in_progress") + 1);
    expect(API_ERROR_CODES.indexOf("not_unlocked")).toBe(API_ERROR_CODES.indexOf("email_cap_reached") + 1);
  });

  it("retryable faux exigé", () => {
    expect(ApiErrorSchema.safeParse({ code: "email_cap_reached", retryable: false }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "email_cap_reached", retryable: true }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "email_cap_reached" }).success).toBe(false);
  });
});
