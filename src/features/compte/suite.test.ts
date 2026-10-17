import { describe, expect, it } from "vitest";

import { connexionRoute, normaliserSuite } from "./suite";

/**
 * `normaliserSuite` (F8-PO-10, décision 0017 § 1) : entrée = valeur déjà décodée une fois. Un cas de test par
 * contournement (spécification F8, « Tests »).
 */

const TRIP = "mock_trip_edimbourg";

describe("connexionRoute", () => {
  it("encode la suite une fois", () => {
    expect(connexionRoute("/voyages/nouveau/lancer")).toBe("/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer");
  });
});

describe("normaliserSuite : liste blanche", () => {
  it.each(["/voyages", "/voyages/nouveau/lancer", `/voyages/${TRIP}`, `/voyages/${TRIP}/preparation`, `/voyages/${TRIP}/presentation`])(
    "accepte et renvoie à l'identique %s",
    (valeur) => {
      expect(normaliserSuite(valeur)).toBe(valeur);
    },
  );
});

describe("normaliserSuite : repli sur /voyages", () => {
  const cas: [string, string | undefined][] = [
    ["absente", undefined],
    ["chaîne vide", ""],
    ["adresse externe", "https://exemple.org"],
    ["javascript:", "javascript:alert(1)"],
    ["sans / initial", "voyages"],
    ["//", "//exemple.org"],
    ["/\\", "/\\exemple.org"],
    ["\\/", "\\/exemple.org"],
    ["tabulation", "/\t/exemple.org"],
    ["saut de ligne", "/\n/exemple.org"],
    ["caractère nul", "/\u0000voyages"],
    ["valeur décodée de ?suite=/%09/exemple.org", new URLSearchParams("suite=/%09/exemple.org").get("suite") ?? ""],
    ["%5C restant (double encodage)", "/%5Cexemple.org"],
    ["%2F restant (double encodage)", "/%2Fexemple.org"],
    ["valeur décodée de ?suite=%252F%252Fexemple.org", new URLSearchParams("suite=%252F%252Fexemple.org").get("suite") ?? ""],
    ["// au milieu", "/voyages//exemple.org"],
    ["segment ..", "/voyages/../connexion"],
    ["%2e%2e (segment .. encodé)", "%2e%2e"],
    ["segment %2e%2e", "/voyages/%2e%2e/connexion"],
    ["..%2F (barre oblique encodée après ..)", "/voyages/..%2Fconnexion"],
    ["identifiant non ASCII (é)", "/voyages/é"],
    ["identifiant non ASCII (é décomposé)", "/voyages/e\u0301"],
    ["identifiant non ASCII (lettre cyrillique а)", "/voyages/\u0430"],
    ["requête", "/voyages/x?y=1"],
    ["fragment", "/voyages/x#y"],
    ["hors liste blanche", "/voyages/x/inconnu"],
    ["identifiant de 65 caractères", `/voyages/${"a".repeat(65)}`],
    ["201 caractères", `/voyages/${"a".repeat(192)}`],
    ["espace final", "/voyages "],
    ["espace insécable", "/voyages "],
    ["segment .", "/voyages/./x"],
  ];

  it.each(cas)("%s", (_label, valeur) => {
    expect(normaliserSuite(valeur)).toBe("/voyages");
  });

  it("la valeur de 201 caractères en fait bien 201", () => {
    expect(`/voyages/${"a".repeat(192)}`).toHaveLength(201);
  });

  it("la valeur décodée de %252F%252F garde un % (double encodage)", () => {
    expect(new URLSearchParams("suite=%252F%252Fexemple.org").get("suite")).toBe("%2F%2Fexemple.org");
  });
});

describe("normaliserSuite : valeur reconstruite", () => {
  /** Générateur pseudo-aléatoire déterministe (pas de Math.random : échantillon reproductible). */
  function* chaines(n: number, seed = 42) {
    const alphabet = ["/", "voyages", TRIP, "preparation", "presentation", "nouveau", "lancer", ".", "..", "%", "\\", ":", "?", "#", " ", "\t", "a", "x", "-", "_", "@", "javascript:"];
    let state = seed;
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    for (let i = 0; i < n; i++) {
      const length = next() % 8;
      let value = next() % 2 === 0 ? "/" : "";
      for (let j = 0; j < length; j++) value += alphabet[next() % alphabet.length];
      yield value;
    }
  }

  const BLANCHE = new RegExp(`^/voyages(?:/nouveau/lancer|/[A-Za-z0-9_-]{1,64}(?:/preparation|/presentation)?)?$`);

  it("le résultat correspond toujours à la liste blanche (échantillon de 5 000 chaînes)", () => {
    for (const valeur of chaines(5000)) {
      const resultat = normaliserSuite(valeur);
      expect(resultat, JSON.stringify(valeur)).toMatch(BLANCHE);
      if (resultat !== "/voyages") expect(resultat).toBe(valeur);
    }
  });
});

describe("normaliserSuite : sous-chemins du voyage (spécification B3, B3-PO-11, critère C8)", () => {
  it.each([
    `/voyages/${TRIP}/jour/1`,
    `/voyages/${TRIP}/jour/12`,
    `/voyages/${TRIP}/aujourdhui`,
    `/voyages/${TRIP}/debloquer`,
    `/voyages/${TRIP}/preparation`,
    `/voyages/${TRIP}/presentation`,
  ])("accepte et renvoie à l'identique %s", (valeur) => {
    expect(normaliserSuite(valeur)).toBe(valeur);
  });

  it.each([
    ["jour 0", `/voyages/${TRIP}/jour/0`],
    ["jour à zéro initial", `/voyages/${TRIP}/jour/01`],
    ["jour sans numéro", `/voyages/${TRIP}/jour`],
    ["jour non numérique", `/voyages/${TRIP}/jour/a`],
    ["jour négatif", `/voyages/${TRIP}/jour/-1`],
    ["jour de 4 chiffres", `/voyages/${TRIP}/jour/1000`],
    ["Remplacer une étape", `/voyages/${TRIP}/jour/1/remplacer/etape_1`],
    ["sous-chemin après le jour", `/voyages/${TRIP}/jour/1/x`],
    ["paiement simulé", `/voyages/${TRIP}/debloquer/paiement-simule/pay_1`],
    ["confirmation du paiement", `/voyages/${TRIP}/debloquer/confirmation`],
    ["sous-chemin après aujourdhui", `/voyages/${TRIP}/aujourdhui/x`],
    ["identifiant hors TRIP_ID_PATTERN avec jour", "/voyages/é/jour/1"],
    ["identifiant hors TRIP_ID_PATTERN avec debloquer", `/voyages/${"a".repeat(65)}/debloquer`],
    ["identifiant hors TRIP_ID_PATTERN avec aujourdhui", "/voyages/a.b/aujourdhui"],
  ])("%s : /voyages", (_label, valeur) => {
    expect(normaliserSuite(valeur)).toBe("/voyages");
  });
});
