// @vitest-environment node
import { describe, expect, it } from "vitest";

import { projectSharedDay } from "@/adapters/share-projection";
import { type Day, ExceptionSchema } from "@/contracts";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { SNAPSHOT_STOP_EXCEPTIONS } from "../../../db/jsonb-keys";

/**
 * Exceptions d'une étape (ticket 1019, décision 0159) : le contrat (`ExceptionSchema`) a trois valeurs, la base n'en
 * garde que deux ; `toConfirm`, tirée des horaires Google (décision 0011, point 5), n'existe qu'après une lecture. La
 * preuve sur la base réelle est dans `tests/db/adaptateur-api.test.ts` (étape « À confirmer » créée sur api).
 */
describe("exceptions d'une étape : contrat et base alignés (décision 0159)", () => {
  it("le contrat = les valeurs stockées + toConfirm, seule valeur calculée à la lecture", () => {
    expect([...ExceptionSchema.options].sort()).toEqual([...SNAPSHOT_STOP_EXCEPTIONS, "toConfirm"].sort());
    expect(SNAPSHOT_STOP_EXCEPTIONS).not.toContain("toConfirm");
  });

  it("projection de la vue partagée : une étape [toReserve, unconfirmed, toConfirm] ne rend que [unconfirmed, toConfirm]", () => {
    const jour = edimbourgDebloque.days.find((d) => d.items.some((i) => i.type === "stop"));
    if (jour === undefined) throw new Error("jour avec étape absent du voyage simulé");
    let marquee = false;
    const items = jour.items.map((item): Day["items"][number] => {
      if (item.type !== "stop" || marquee) return item;
      marquee = true;
      return { ...item, stop: { ...item.stop, exceptions: ["toReserve", "unconfirmed", "toConfirm"] } };
    });
    const partage = projectSharedDay({ ...jour, items });
    const premiere = partage.items.find((i) => i.type === "stop");
    expect(premiere?.type === "stop" ? premiere.stop.exceptions : null).toEqual(["unconfirmed", "toConfirm"]);
  });
});
