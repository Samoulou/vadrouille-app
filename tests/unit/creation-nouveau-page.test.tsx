import { afterEach, describe, expect, it, vi } from "vitest";

import NouveauVoyagePage, { dynamic } from "@/app/(creation)/voyages/nouveau/page";
import { CreateTripForm } from "@/features/creation/CreateTripForm";
import { rechercheVilleApiOuverte } from "@/server/composition/villes-api";

vi.mock("@/server/composition/villes-api", () => ({ rechercheVilleApiOuverte: vi.fn(async () => false) }));

/**
 * `R1`, aiguillage de la page de l'écran 1 (décision 0141 § 6.4 ; revue consolidée du head `bcaa346`, mineur 11) : la
 * recherche de ville de `api` n'est montée que sur l'adaptateur `api` **et** quand `rechercheVilleApiOuverte()` est vraie ;
 * le prédicat n'est pas lu ailleurs.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(rechercheVilleApiOuverte).mockClear();
  vi.mocked(rechercheVilleApiOuverte).mockResolvedValue(false);
});

describe("R1 : aiguillage de la recherche de ville", () => {
  it("rendu à chaque requête", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("api et recherche ouverte : CreateTripForm recherche=\"api\"", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.mocked(rechercheVilleApiOuverte).mockResolvedValueOnce(true);
    const element = await NouveauVoyagePage();
    expect(element.type).toBe(CreateTripForm);
    // M4c (spécification M4 § 7.1) : sur `api`, les autres villes sont contrôlées à « Continuer » (`controleVilles`).
    expect(element.props).toEqual({ recherche: "api", controleVilles: true });
    expect(rechercheVilleApiOuverte).toHaveBeenCalledTimes(1);
    expect(rechercheVilleApiOuverte).toHaveBeenCalledWith();
  });

  it("api et recherche fermée (dépôt : seuils non validés, crochet fermé) : le champ d'aujourd'hui", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    const element = await NouveauVoyagePage();
    expect(element.type).toBe(CreateTripForm);
    expect(element.props).toEqual({ controleVilles: true });
  });

  it.each(["mock", ""])("adaptateur %j : le champ d'aujourd'hui, le prédicat de api n'est pas lu", async (adaptateur) => {
    vi.stubEnv("DATA_ADAPTER", adaptateur);
    vi.mocked(rechercheVilleApiOuverte).mockResolvedValue(true);
    const element = await NouveauVoyagePage();
    expect(element.props).toEqual({});
    expect(rechercheVilleApiOuverte).not.toHaveBeenCalled();
  });
});
