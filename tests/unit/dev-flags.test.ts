// @vitest-environment node
import { describe, expect, it } from "vitest";

import { devPagesEnabled } from "@/dev/flags";

describe("pages de développement", () => {
  it("sont actives en développement", () => {
    expect(devPagesEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("sont désactivées en production", () => {
    expect(devPagesEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("ne s'activent en production que sur demande explicite", () => {
    expect(devPagesEnabled({ NODE_ENV: "production", VADROUILLE_DEV_PAGES: "1" })).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "production", VADROUILLE_DEV_PAGES: "true" })).toBe(false);
  });
});
