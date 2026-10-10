// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { explicitScope } from "@/adapters/simulation";
import { POST } from "@/app/dev/api/simulation/route";

/** `R-sim` (décision 0017 § 10.5, avec `configurePayment` de 0020 § 6). */

const URL_SIM = "http://127.0.0.1/dev/api/simulation";

function post(body: unknown, { scope = "rsim-1", type = "application/json", raw }: { scope?: string | null; type?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": type };
  if (scope) headers["x-vadrouille-simulation"] = scope;
  return POST(new Request(URL_SIM, { method: "POST", headers, body: raw ?? JSON.stringify(body) }));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("R-sim", () => {
  it("reset, advanceClock, configurePayment : 204", async () => {
    expect((await post({ action: "reset", now: "2026-08-01T12:00:00+02:00" })).status).toBe(204);
    expect(explicitScope("rsim-1").clock.now()).toBe(Date.parse("2026-08-01T10:00:00Z"));
    expect((await post({ action: "advanceClock", ms: 1000 })).status).toBe(204);
    expect(explicitScope("rsim-1").clock.now()).toBe(Date.parse("2026-08-01T10:00:01Z"));
    expect((await post({ action: "configurePayment", confirmationDelayMs: 5000 })).status).toBe(204);
    expect(explicitScope("rsim-1").payment.confirmationDelayMs).toBe(5000);
    expect((await post({ action: "reset", now: "2026-08-01T12:00:00+02:00" })).status).toBe(204);
    expect(explicitScope("rsim-1").payment.confirmationDelayMs).toBe(0);
  });

  it("404 sans pages de développement, ou sur un déploiement de production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", undefined);
    expect((await post({ action: "advanceClock", ms: 0 })).status).toBe(404);
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    vi.stubEnv("VADROUILLE_ENV", "production");
    expect((await post({ action: "advanceClock", ms: 0 })).status).toBe(404);
  });

  it("415 sans JSON, 413 au-delà de 1 024 octets", async () => {
    expect((await post({ action: "advanceClock", ms: 0 }, { type: "text/plain" })).status).toBe(415);
    expect((await post(null, { raw: JSON.stringify({ action: "advanceClock", ms: 0, pad: "x".repeat(1100) }) })).status).toBe(413);
  });

  it("413 sur un content-length annoncé au-delà de 1 024 octets, sans lire le corps", async () => {
    const request = new Request(URL_SIM, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "5000", "x-vadrouille-simulation": "rsim-1" },
      body: JSON.stringify({ action: "advanceClock", ms: 0 }),
    });
    expect((await POST(request)).status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    [{ action: "advanceClock", ms: -1 }],
    [{ action: "advanceClock", ms: 604_800_001 }],
    [{ action: "configurePayment", confirmationDelayMs: 600_001 }],
    [{ action: "reset", now: "2026-08-01" }],
    [{ action: "reset", now: "2019-12-31T23:00:00Z" }],
    [{ action: "advanceClock", ms: 1, autre: true }],
    [{ action: "inconnue" }],
  ])("400 hors schéma : %j", async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("400 sans portée explicite valide : la portée par défaut n'est jamais modifiée", async () => {
    expect((await post({ action: "advanceClock", ms: 0 }, { scope: null })).status).toBe(400);
    expect((await post({ action: "advanceClock", ms: 0 }, { scope: "default" })).status).toBe(400);
    expect((await post({ action: "advanceClock", ms: 0 }, { scope: "__proto__" })).status).toBe(400);
    expect((await post(null, { raw: "{" })).status).toBe(400);
  });
});
