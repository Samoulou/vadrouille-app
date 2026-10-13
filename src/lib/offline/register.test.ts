import { describe, expect, it, vi } from "vitest";

import { registerOfflineFallback, SERVICE_WORKER_URL } from "./register";

/** Module hors ligne désigné (spécification F10, F10b ; F10-PO-8, F10-TL-4). */
describe("registerOfflineFallback", () => {
  it("enregistre /sw.js sur la portée /, revalidé à chaque visite, avec le réseau", () => {
    const register = vi.fn().mockResolvedValue({});
    registerOfflineFallback({ navigator: { onLine: true, serviceWorker: { register } } });
    expect(register).toHaveBeenCalledExactlyOnceWith(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
    expect(SERVICE_WORKER_URL).toBe("/sw.js");
  });

  it("n'enregistre rien sans réseau", () => {
    const register = vi.fn().mockResolvedValue({});
    registerOfflineFallback({ navigator: { onLine: false, serviceWorker: { register } } });
    expect(register).not.toHaveBeenCalled();
  });

  it("navigateur sans service worker : aucun message, aucune erreur", () => {
    expect(() => registerOfflineFallback({ navigator: { onLine: true } })).not.toThrow();
    expect(() => registerOfflineFallback({})).not.toThrow();
  });

  it("enregistrement refusé (rejet ou exception) : aucune erreur", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("refusé"));
    expect(() => registerOfflineFallback({ navigator: { onLine: true, serviceWorker: { register: rejected } } })).not.toThrow();
    await Promise.resolve();
    const throwing = vi.fn(() => {
      throw new Error("refusé");
    });
    expect(() => registerOfflineFallback({ navigator: { onLine: true, serviceWorker: { register: throwing } } })).not.toThrow();
  });

  it("dans jsdom (sans service worker), l'appel par défaut ne fait rien", () => {
    expect(() => registerOfflineFallback()).not.toThrow();
  });
});
