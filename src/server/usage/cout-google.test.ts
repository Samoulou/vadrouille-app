// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { coutGoogleDuMois, coutGoogleDuMoisDepuisPort, coutSku, ErreurCoutGoogle, TablePrixGoogleSchema, type TablePrixGoogle } from "@/server/usage/cout-google";
import { METHODES } from "@/server/usage/port";

import { creerHorlogeManuelle } from "../../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../../tests/support/port-consommation-memoire";

/** Table de prix Google et coût d'un mois (P0r1, « Table de prix Google »). */

const TABLE_REELLE = TablePrixGoogleSchema.parse(
  JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../prototype/config/prix-google.json"), "utf8")),
);

const TEST: TablePrixGoogle = {
  schema: 1,
  releve: "2026-01-01",
  source: "table de test",
  devise: "USD",
  palierMax: 100_000,
  skus: {
    illimite: { methode: "places_text_search", unite: "requete", gratuitParMois: null, prixPour1000: 0 },
    details: { methode: "places_details", unite: "requete", gratuitParMois: 1_000, prixPour1000: 20 },
    matrice: { methode: "routes_matrix", unite: "element", gratuitParMois: 10_000, prixPour1000: 5 },
  },
};

describe("p0: table de prix Google", () => {
  it("la table commitée est valide, datée, et couvre les SKU des clients réels", () => {
    // B8a (0085 § 2) : relevé du 2026-10-17, qui ajoute la ligne « IDs only » de Place Details.
    expect(TABLE_REELLE.releve).toBe("2026-10-17");
    for (const sku of [
      "places_text_search_essentials_ids_only",
      "places_details_enterprise",
      "places_details_essentials",
      "places_details_essentials_ids_only",
      "routes_matrix_essentials",
    ]) {
      expect(Object.keys(TABLE_REELLE.skus)).toContain(sku);
    }
    for (const ligne of Object.values(TABLE_REELLE.skus)) expect(METHODES).toContain(ligne.methode);
  });

  it("une table mal formée est refusée", () => {
    expect(TablePrixGoogleSchema.safeParse({ ...TEST, devise: "EUR" }).success).toBe(false);
    expect(TablePrixGoogleSchema.safeParse({ ...TEST, skus: { x: { ...TEST.skus.details, inconnu: 1 } } }).success).toBe(false);
    expect(TablePrixGoogleSchema.safeParse({ ...TEST, releve: "13/10/2026" }).success).toBe(false);
  });

  it("tranche gratuite déduite par SKU ; tranche illimitée : coût nul", () => {
    expect(coutSku(TEST, { sku: "details", quantite: 1_000 })).toBe(0);
    expect(coutSku(TEST, { sku: "details", quantite: 1_001 })).toBe(20_000);
    expect(coutSku(TEST, { sku: "matrice", quantite: 12_000 })).toBe(10_000_000);
    expect(coutSku(TEST, { sku: "illimite", quantite: 99_999 })).toBe(0);
    expect(coutGoogleDuMois(TEST, [{ sku: "details", quantite: 600 }, { sku: "details", quantite: 600 }])).toBe(4_000_000);
  });

  it("SKU inconnu ou au-delà du premier palier : refus (jamais une sous-estimation)", () => {
    expect(() => coutSku(TEST, { sku: "autre", quantite: 1 })).toThrow(ErreurCoutGoogle);
    expect(() => coutSku(TEST, { sku: "details", quantite: 100_001 })).toThrow("tier_exceeded");
  });

  it("coût d'un mois depuis les consommations du port : lignes libérées exclues, éléments pour la matrice", async () => {
    const horloge = creerHorlogeManuelle(500);
    const port = creerPortMemoire(horloge);
    const mois = { du: 0, au: 1_000 };
    const base = {
      nature: "execution" as const,
      fournisseur: "google" as const,
      executionId: null,
      periodes: { jour: mois, mois },
      plafonds: [],
      coutEstimeMicros: 0,
    };
    for (let i = 0; i < 1_002; i += 1) {
      const r = await port.reserve({ ...base, methode: "places_details", sku: "details", unites: { requetes: 1, elements: 0 } });
      if (r.ok && i === 0) await port.release(r.reservationId);
    }
    await port.reserve({ ...base, methode: "routes_matrix", sku: "matrice", unites: { requetes: 1, elements: 625 } });
    // 1 001 requêtes comptées (une libérée) : 1 facturée à 20 USD les 1 000 ; 625 éléments dans la tranche gratuite.
    expect(await coutGoogleDuMoisDepuisPort(TEST, port, mois)).toBe(20_000);
  });
});

describe("p0: calcul quotas × prix (100 requêtes par jour et par méthode, 31 jours)", () => {
  const requetes = 100 * 31;
  it("au prix des SKU retenus par les clients réels", () => {
    expect(coutSku(TABLE_REELLE, { sku: "places_text_search_essentials_ids_only", quantite: requetes })).toBe(0);
    // Place Details Enterprise : (3 100 − 1 000) × 20 USD / 1 000 = 42 USD.
    expect(coutSku(TABLE_REELLE, { sku: "places_details_enterprise", quantite: requetes })).toBe(42_000_000);
    // Matrice : 1 élément par requête, 3 100 éléments dans la tranche gratuite de 10 000.
    expect(coutSku(TABLE_REELLE, { sku: "routes_matrix_essentials", quantite: requetes })).toBe(0);
    // Pire cas de la matrice (625 éléments par requête) : au-delà du premier palier, calcul refusé.
    expect(() => coutSku(TABLE_REELLE, { sku: "routes_matrix_essentials", quantite: requetes * 625 })).toThrow("tier_exceeded");
  });
});
