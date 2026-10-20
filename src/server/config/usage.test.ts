import { describe, expect, it } from "vitest";

import { horlogeSysteme } from "@/server/usage/port";
import { reglesDeLecture } from "@/server/relecture/regles";

import { PLAFONDS_LARGES } from "../../../tests/support/banc-apercu";
import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { BORNES_DE_GARDE_MICROS, chargerPlafondsUsage, PLAFONDS_USAGE, PLAFONDS_VARIANTE_SIMULEE, type PlafondsUsage } from "./usage";

/**
 * Critère « Configuration des plafonds » de B9e (spécification B9) : valeur absente, négative, non finie ou au-dessus des
 * bornes de garde (50 USD par génération, 100 USD par organisation et par jour, 20 USD par jour pour les actions sans
 * compte : bornes de validation, pas des plafonds) refusée au chargement ; valeurs de test incapables d'autoriser un appel
 * réel (B9-PO-10). Les plafonds réels sont de Samuel (question 4 de B9) : `PLAFONDS_USAGE` reste `null`.
 */

type Modif = (p: PlafondsUsage) => unknown;
const avec = (modif: Modif): unknown => modif(structuredClone(PLAFONDS_USAGE_TEST));

describe("configuration des plafonds : bornes de garde (B9e)", () => {
  it("les bornes valent 50, 100 et 20 USD", () => {
    expect(BORNES_DE_GARDE_MICROS).toEqual({ parGeneration: 50_000_000, parOrganisationJour: 100_000_000, actionsSansCompteJour: 20_000_000 });
  });

  it("les valeurs de test et celles de la variante simulée passent", () => {
    expect(() => chargerPlafondsUsage(PLAFONDS_USAGE_TEST)).not.toThrow();
    expect(chargerPlafondsUsage(PLAFONDS_VARIANTE_SIMULEE)).toEqual(PLAFONDS_VARIANTE_SIMULEE);
  });

  // Revue de la PR #588, bloquant 4 : les valeurs de la variante simulée sont une copie des valeurs de test des bancs ; ce
  // test d'égalité les garde alignées (seules les limites globales et le plafond par organisation diffèrent, et la variante
  // simulée ne les lit pas : aucune réservation dans `usage_ledger`, décision 0110 § 3).
  it("les valeurs de la variante simulée sont celles des bancs (`PLAFONDS_LARGES`, `PLAFONDS_USAGE_TEST`)", () => {
    expect(PLAFONDS_VARIANTE_SIMULEE.generations).toEqual(PLAFONDS_LARGES.generations);
    expect(PLAFONDS_VARIANTE_SIMULEE.relecture).toEqual(PLAFONDS_USAGE_TEST.relecture);
    expect(PLAFONDS_VARIANTE_SIMULEE.actions).toEqual(PLAFONDS_USAGE_TEST.actions);
    expect(PLAFONDS_VARIANTE_SIMULEE.skus).toEqual(PLAFONDS_USAGE_TEST.skus);
    expect(PLAFONDS_VARIANTE_SIMULEE.actionsSansCompteJourMicros).toBe(PLAFONDS_USAGE_TEST.actionsSansCompteJourMicros);
    expect(PLAFONDS_VARIANTE_SIMULEE.parOrganisationJourMicros).toBe(PLAFONDS_LARGES.parOrganisationJourMicros);
  });

  it.each<[string, Modif]>([
    ["plafond par génération absent", (p) => ({ ...p, generations: { ...p.generations, apercu: { ...p.generations.apercu, coutModelesMicros: undefined } } })],
    ["plafond par organisation absent", (p) => ({ ...p, parOrganisationJourMicros: undefined })],
    ["plafond des actions sans compte absent", (p) => ({ ...p, actionsSansCompteJourMicros: undefined })],
    ["valeur négative", (p) => ({ ...p, parOrganisationJourMicros: -1 })],
    ["requêtes négatives", (p) => ({ ...p, generations: { ...p.generations, complet: { ...p.generations.complet, placesDetails: -3 } } })],
    ["valeur non finie (Infinity)", (p) => ({ ...p, parOrganisationJourMicros: Number.POSITIVE_INFINITY })],
    ["valeur non finie (NaN)", (p) => ({ ...p, actionsSansCompteJourMicros: Number.NaN })],
    ["valeur non entière", (p) => ({ ...p, parOrganisationJourMicros: 1.5 })],
    ["texte au lieu d'un nombre", (p) => ({ ...p, parOrganisationJourMicros: "100" })],
    ["génération au-dessus de 50 USD", (p) => ({ ...p, generations: { ...p.generations, apercu: { ...p.generations.apercu, coutModelesMicros: 50_000_001 } } })],
    ["voyage complet au-dessus de 50 USD", (p) => ({ ...p, generations: { ...p.generations, complet: { ...p.generations.complet, coutModelesMicros: 60_000_000 } } })],
    ["organisation et jour au-dessus de 100 USD", (p) => ({ ...p, parOrganisationJourMicros: 100_000_001 })],
    ["actions sans compte au-dessus de 20 USD par jour", (p) => ({ ...p, actionsSansCompteJourMicros: 20_000_001 })],
    ["forfait d'une action au-dessus de 20 USD", (p) => ({ ...p, actions: { ...p.actions, structureBrief: { coutModelesMicros: 25_000_000 } } })],
    ["clé inconnue", (p) => ({ ...p, plafondSecret: 1 })],
  ])("%s : refusé au chargement", (_cas, modif) => {
    expect(() => chargerPlafondsUsage(avec(modif))).toThrow();
  });

  it("aux bornes exactes : admis", () => {
    const bornes = avec((p) => ({
      ...p,
      generations: { ...p.generations, apercu: { ...p.generations.apercu, coutModelesMicros: 50_000_000 } },
      parOrganisationJourMicros: 100_000_000,
      actionsSansCompteJourMicros: 20_000_000,
    }));
    expect(() => chargerPlafondsUsage(bornes)).not.toThrow();
  });

  it("production : plafonds non fixés (question 4 de B9, Samuel), aucune règle donc aucun appel réel", () => {
    expect(PLAFONDS_USAGE).toBeNull();
    expect(reglesDeLecture(horlogeSysteme)).toBeNull();
  });
});
