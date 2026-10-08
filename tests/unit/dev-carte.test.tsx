import { afterEach, describe, expect, it, vi } from "vitest";

import DevCartePage from "@/app/dev/carte/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("/dev/carte", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("répond 404 en production sans VADROUILLE_DEV_PAGES=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    await expect(DevCartePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("s'affiche en production avec VADROUILLE_DEV_PAGES=1 (Playwright)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    const element = await DevCartePage({ searchParams: Promise.resolve({ rendu: "google", config: "absente" }) });
    expect(element.props).toMatchObject({ renderer: "google", config: "absente", vue: "jour" });
    expect(element.props.days).toHaveLength(6);
    expect(element.props.maps).toHaveLength(6);
  });
});
