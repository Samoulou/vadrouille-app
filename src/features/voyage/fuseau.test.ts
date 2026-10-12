import { describe, expect, it } from "vitest";

import { timeZoneMention } from "./fuseau";

describe("timeZoneMention", () => {
  it("élision devant une voyelle ou un « h » muet, « de » devant une consonne ou un « h » aspiré", () => {
    expect(timeZoneMention("Lisbonne")).toBe("Heures de Lisbonne");
    expect(timeZoneMention("Édimbourg")).toBe("Heures d'Édimbourg");
    expect(timeZoneMention("Hendaye")).toBe("Heures d'Hendaye");
    expect(timeZoneMention("Helsinki")).toBe("Heures d'Helsinki");
    expect(timeZoneMention("Hambourg")).toBe("Heures de Hambourg");
    expect(timeZoneMention("Hong Kong")).toBe("Heures de Hong Kong");
  });
});
