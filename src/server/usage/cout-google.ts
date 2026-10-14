import "server-only";

import { z } from "zod";

import { METHODES, type Consommation, type Periode, type PortConsommation } from "@/server/usage/port";

/**
 * Table de prix Google par SKU et coût d'un mois (spécification `specs/P0-suite-executions-reelles.md`, « Table de
 * prix Google »). La table est commitée dans `prototype/config/prix-google.json`, relevée sur la page de tarifs de
 * Google avec sa date ; elle est lue par l'appelant et validée ici. Seul le premier palier (0 à `palierMax` unités par
 * mois) est relevé : au-delà, le calcul refuse (`tier_exceeded`) plutôt que de sous-estimer. L'application du plafond
 * mensuel de 20 USD (0027 § 2) arrive avec P0r3.
 */

const SkuSchema = z.strictObject({
  methode: z.enum(METHODES),
  unite: z.enum(["requete", "element"]),
  /** Tranche gratuite mensuelle ; `null` : illimitée. */
  gratuitParMois: z.number().int().nonnegative().nullable(),
  prixPour1000: z.number().nonnegative(),
});

export const TablePrixGoogleSchema = z.strictObject({
  schema: z.literal(1),
  releve: z.iso.date(),
  source: z.string().min(1).max(300),
  devise: z.literal("USD"),
  palierMax: z.number().int().positive(),
  skus: z.record(z.string().regex(/^[a-z0-9_]+$/), SkuSchema),
});
export type TablePrixGoogle = z.infer<typeof TablePrixGoogleSchema>;

export type UsageSku = { readonly sku: string; readonly quantite: number };

export class ErreurCoutGoogle extends Error {
  readonly code: "unknown_sku" | "tier_exceeded";
  constructor(code: "unknown_sku" | "tier_exceeded") {
    super(code);
    this.code = code;
    this.name = "ErreurCoutGoogle";
  }
}

/** Coût d'un SKU pour un mois, en micro-USD, tranche gratuite déduite. */
export function coutSku(table: TablePrixGoogle, usage: UsageSku): number {
  const ligne = table.skus[usage.sku];
  if (ligne === undefined) throw new ErreurCoutGoogle("unknown_sku");
  if (usage.quantite > table.palierMax) throw new ErreurCoutGoogle("tier_exceeded");
  const factures = ligne.gratuitParMois === null ? 0 : Math.max(0, usage.quantite - ligne.gratuitParMois);
  // prixPour1000 USD pour 1 000 unités = prixPour1000 × 1 000 micro-USD par unité.
  return Math.round(factures * ligne.prixPour1000 * 1_000);
}

/** Coût d'un mois, en micro-USD : somme des SKU (chaque SKU a sa propre tranche gratuite). */
export function coutGoogleDuMois(table: TablePrixGoogle, usages: readonly UsageSku[]): number {
  const parSku = new Map<string, number>();
  for (const usage of usages) parSku.set(usage.sku, (parSku.get(usage.sku) ?? 0) + usage.quantite);
  let total = 0;
  for (const [sku, quantite] of parSku) total += coutSku(table, { sku, quantite });
  return total;
}

/** Quantité facturée d'un SKU dans une consommation : requêtes ou éléments selon l'unité du SKU. */
export function quantiteFacturee(table: TablePrixGoogle, sku: string, consommation: Consommation): number {
  const ligne = table.skus[sku];
  if (ligne === undefined) throw new ErreurCoutGoogle("unknown_sku");
  return ligne.unite === "element" ? consommation.elements : consommation.requetes;
}

/** Coût Google d'un mois à partir des consommations du port (lignes comptées de chaque SKU de la table). */
export async function coutGoogleDuMoisDepuisPort(table: TablePrixGoogle, port: PortConsommation, mois: Periode): Promise<number> {
  const usages: UsageSku[] = [];
  for (const sku of Object.keys(table.skus)) {
    const consommation = await port.consumption(mois, { fournisseur: "google", sku });
    usages.push({ sku, quantite: quantiteFacturee(table, sku, consommation) });
  }
  return coutGoogleDuMois(table, usages);
}
