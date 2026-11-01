// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  PREFERENCE_DIRECTIONS,
  PREFERENCE_ORIGINS,
  PREFERENCE_SUBJECTS_MAX,
  PreferenceKeySchema,
  PreferenceSubjectSchema,
  RetainedPreferenceSchema,
  RetainedTasteSchema,
  isPreferenceKey,
  preferenceKey,
} from "@/contracts";

/*
 * Forme commune des préférences (décision 0021 § 1.3, reprise par 0160 § 1.2 point 2 ; spécification M8 § 6.1,
 * critères 1 et 2 ; PR de contrat M8-C, ticket 1041).
 */

const musee = { kind: "category", category: "museum", direction: "less" } as const;
const preference = { id: "category:museum:less", origin: "confirmed", subject: musee } as const;

describe("préférences: preferenceKey stable (critère M8 § 6.1-1)", () => {
  it("donne `category:<catégorie>:<sens>` et `distance`", () => {
    expect(preferenceKey(musee)).toBe("category:museum:less");
    expect(preferenceKey({ kind: "category", category: "tasting", direction: "more" })).toBe("category:tasting:more");
    expect(preferenceKey({ kind: "distance" })).toBe("distance");
  });

  it("une clé distincte par sujet possible, toutes reconnues par isPreferenceKey", () => {
    const cles = [
      ...CATEGORIES.flatMap((category) => PREFERENCE_DIRECTIONS.map((direction) => preferenceKey({ kind: "category", category, direction }))),
      preferenceKey({ kind: "distance" }),
    ];
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles).toHaveLength(PREFERENCE_SUBJECTS_MAX);
    expect(PREFERENCE_SUBJECTS_MAX).toBe(17);
    for (const cle of cles) expect(isPreferenceKey(cle)).toBe(true);
  });

  it.each(["", "museum", "category:museum", "category:museum:none", "category:Musées:less", "distance:less", "Category:museum:less", " distance"])(
    "refuse la clé %j",
    (cle) => {
      expect(isPreferenceKey(cle)).toBe(false);
      expect(PreferenceKeySchema.safeParse(cle).success).toBe(false);
    },
  );

  it("valeurs fermées de 0021 § 1.1", () => {
    expect(PREFERENCE_DIRECTIONS).toEqual(["more", "less"]);
    expect(PREFERENCE_ORIGINS).toEqual(["confirmed", "inferred"]);
  });
});

describe("préférences: PreferenceSubject strict (critère M8 § 6.1-2)", () => {
  it("accepte une catégorie dans un sens, et la distance", () => {
    expect(PreferenceSubjectSchema.safeParse(musee).success).toBe(true);
    expect(PreferenceSubjectSchema.safeParse({ kind: "distance" }).success).toBe(true);
  });

  it.each([
    ["catégorie hors liste", { ...musee, category: "Musées" }],
    ["sens hors liste", { ...musee, direction: "none" }],
    ["sens manquant", { kind: "category", category: "museum" }],
    ["distance avec une catégorie", { kind: "distance", category: "museum" }],
    ["placeId", { ...musee, placeId: "ChIJ-sentinelle" }],
    ["nom", { ...musee, name: "[Musée national]" }],
    ["texte libre", { ...musee, text: "j'aime pas les musées" }],
    ["sorte inconnue", { kind: "budget" }],
  ])("refuse : %s", (_cas, valeur) => {
    expect(PreferenceSubjectSchema.safeParse(valeur).success).toBe(false);
  });
});

describe("préférences: RetainedPreference (critères M8 § 6.1-1 et 2)", () => {
  it("accepte `{ id, origin, subject }` quand id === preferenceKey(subject)", () => {
    expect(RetainedPreferenceSchema.safeParse(preference).success).toBe(true);
    expect(RetainedPreferenceSchema.safeParse({ id: "distance", origin: "inferred", subject: { kind: "distance" } }).success).toBe(true);
  });

  it("raffinement : refuse un id qui n'est pas la clé du sujet", () => {
    const resultat = RetainedPreferenceSchema.safeParse({ ...preference, id: "category:museum:more" });
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.some((issue) => issue.path.join(".") === "id")).toBe(true);
    expect(RetainedPreferenceSchema.safeParse({ ...preference, id: "distance" }).success).toBe(false);
  });

  it.each([
    ["origine hors liste", { ...preference, origin: "cancelled" }],
    ["placeId", { ...preference, placeId: "ChIJ-sentinelle" }],
    ["nom", { ...preference, name: "[Musée national]" }],
    ["destination", { ...preference, destination: "Édimbourg" }],
    ["texte libre", { ...preference, label: "Tu préfères éviter les musées" }],
    ["instant", { ...preference, retainedAt: "2026-09-04T10:00:00Z" }],
    ["voyage d'origine (réservé à RetainedTaste)", { ...preference, fromTripId: "trip-1" }],
  ])("refuse : %s", (_cas, valeur) => {
    expect(RetainedPreferenceSchema.safeParse(valeur).success).toBe(false);
  });
});

describe("préférences: RetainedTaste (décision 0160 § 1.2 point 2)", () => {
  const gout = { ...preference, fromTripId: "trip-edimbourg" };

  it("accepte un voyage d'origine, ou null quand il n'existe plus", () => {
    expect(RetainedTasteSchema.safeParse(gout).success).toBe(true);
    expect(RetainedTasteSchema.safeParse({ ...gout, fromTripId: null }).success).toBe(true);
  });

  it("garde le raffinement id === preferenceKey(subject)", () => {
    expect(RetainedTasteSchema.safeParse({ ...gout, id: "distance" }).success).toBe(false);
  });

  it.each([
    ["voyage d'origine absent", { ...preference }],
    ["voyage d'origine hors motif", { ...gout, fromTripId: "voyage à Édimbourg" }],
    ["destination", { ...gout, destination: "Édimbourg" }],
    ["placeId", { ...gout, placeId: "ChIJ-sentinelle" }],
    ["nom", { ...gout, name: "[Musée national]" }],
    ["identifiant de ligne", { ...gout, rowId: "8f8c1d1e-0000-4000-8000-000000000000" }],
  ])("refuse : %s", (_cas, valeur) => {
    expect(RetainedTasteSchema.safeParse(valeur).success).toBe(false);
  });
});
