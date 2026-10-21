import "server-only";

import { createHash } from "node:crypto";

import type { DaySnapshot, TripSnapshot } from "@/contracts";
import { estJourNonPlanifie, jourSansEtape } from "@/domain/jours-planifies";
import { JOURS_PLANIFIES_APERCU } from "@/server/config/generation";

import { CODES_REESSAYABLES } from "./reessayables";

/**
 * Règles pures du voyage complet (spécification B9, B9d ; décisions 0087 § 1.3 points 3 et 4, § 1.4 point 1, § 1.7, et
 * 0081 B9-TL-3 point 1 amendé). Aucune lecture, aucune horloge, aucun hasard : chaque valeur se recalcule à l'identique au
 * rejeu d'une étape ou d'une transaction.
 */

/** Ligne `full` lue (identifiants internes, phase, code fermé et compteurs ; aucune donnée de lieu). */
export type LigneVoyageComplet = {
  readonly id: string;
  readonly phase: string;
  readonly stopReason: string | null;
  /** Cardinalité de `person_retry_request_ids`. */
  readonly reprisesPersonne: number;
  readonly reprisesStudio: number;
};

/** Ligne `full` passée en `failed` par l'écriture de l'appelant : ce qu'il faut pour évaluer l'état bloqué (0087 § 1.4). */
export type EchecComplet = {
  readonly id: string;
  readonly tripId: string;
  readonly stopReason: string | null;
  readonly reprisesPersonne: number;
  readonly reprisesStudio: number;
};

export const echecCompletDeLigne = (ligne: Record<string, unknown>): EchecComplet => ({
  id: String(ligne.id),
  tripId: String(ligne.trip_id),
  stopReason: typeof ligne.stop_reason === "string" ? ligne.stop_reason : null,
  reprisesPersonne: Number(ligne.reprises_personne),
  reprisesStudio: Number(ligne.studio_retries),
});

/**
 * Ligne bloquée (0087 § 1.4 point 1) : `failed` **et** (cause non réessayable, **ou** compteur de la personne au maximum,
 * **ou** au moins une reprise du studio). Une ligne bloquée n'offre plus « Réessayer » ; le studio la reprend.
 */
export function estBloquee(ligne: Pick<LigneVoyageComplet, "phase" | "stopReason" | "reprisesPersonne" | "reprisesStudio">, maximum: number): boolean {
  if (ligne.phase !== "failed") return false;
  const reessayable = ligne.stopReason !== null && (CODES_REESSAYABLES as readonly string[]).includes(ligne.stopReason);
  return !reessayable || ligne.reprisesPersonne >= maximum || ligne.reprisesStudio > 0;
}

/** Passage d'une exécution (0087 § 1.7 point 2) : reprises acceptées sur la ligne (personne et studio), 0 pour la première. */
export function passageDe(ligne: Pick<LigneVoyageComplet, "reprisesPersonne" | "reprisesStudio">): number {
  return ligne.reprisesPersonne + ligne.reprisesStudio;
}

/**
 * Espace de noms constant des identifiants dérivés du voyage complet (0087 § 1.7 point 2) : fixé une fois par B9d, **jamais
 * changé** (un changement redonnerait d'autres valeurs aux versions déjà publiées et casserait l'idempotence du rejeu).
 */
export const ESPACE_NOMS_VOYAGE_COMPLET = "7f1b4e2a-9c3d-5e6f-8a0b-1c2d3e4f5a6b";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID de version 5 (RFC 9562 § 5.5) : SHA-1 de l'espace de noms puis du nom, bits de version et de variante posés. */
export function uuidV5(nom: string, espace: string = ESPACE_NOMS_VOYAGE_COMPLET): string {
  if (!UUID.test(espace)) throw new RangeError("uuid v5 : espace de noms illisible");
  const octets = Buffer.from(espace.replace(/-/g, ""), "hex");
  const empreinte = createHash("sha1").update(octets).update(nom, "utf8").digest().subarray(0, 16);
  empreinte[6] = ((empreinte[6] as number) & 0x0f) | 0x50;
  empreinte[8] = ((empreinte[8] as number) & 0x3f) | 0x80;
  const hex = empreinte.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * `request_id` de la version qui publie le jour `jour` (indice dans le voyage, 1 = J1, **jamais** le rang `i` des jours de
 * l'exécution) pendant le passage courant de la ligne (0087 § 1.7) : `full:<id>:<passage>:<jour>`.
 */
export function requestIdDeVersion(ligne: Pick<LigneVoyageComplet, "id" | "reprisesPersonne" | "reprisesStudio">, jour: number): string {
  if (!Number.isInteger(jour) || jour < 1) throw new RangeError("voyage complet : jour illisible");
  return uuidV5(`full:${ligne.id}:${passageDe(ligne)}:${jour}`);
}

/**
 * Identifiant du forfait d'un passage (`usage_ledger.generation_run_id`) : `forfait:<id>:<passage>`. Chaque passage réserve
 * son propre forfait (une reprise n'hérite pas de ce que le passage précédent a dépensé, et le cumul par organisation et
 * par jour compte chaque passage, 0087 « Questions ouvertes » point 4) ; un rejeu d'étape du même passage retrouve le même.
 */
export function identifiantForfait(ligne: Pick<LigneVoyageComplet, "id" | "reprisesPersonne" | "reprisesStudio">): string {
  return uuidV5(`forfait:${ligne.id}:${passageDe(ligne)}`);
}

/** Jours de l'aperçu (B9-PO-7) : jamais replanifiés par le voyage complet. */
const JOURS_APERCU: ReadonlySet<number> = new Set(JOURS_PLANIFIES_APERCU);

/**
 * Jours que l'exécution planifie, dans l'ordre (0087 § 1.3 points 3 et 4) : jours hors de l'aperçu que la version courante
 * laisse sans élément `stop` (prédicat de 0086 § 1.7), **plus** ceux que le passage courant a déjà publiés (`publies`),
 * pour que le rang `i` d'un jour reste le même d'une étape à l'autre de l'exécution. Le jour de rang `i` a ses étapes b, c,
 * d, e aux rangs `2 + 4 × i + k` (`rangsDuJour`).
 */
export function joursDuPassage(instantane: TripSnapshot, publies: ReadonlySet<number>): number[] {
  return instantane.days
    .filter((jour) => !JOURS_APERCU.has(jour.index) && (publies.has(jour.index) || sansEtape(jour)))
    .map((jour) => jour.index)
    .sort((a, b) => a - b);
}

/** Prédicat de 0086 § 1.7 (le même que la lecture de B6a, `@/domain/jours-planifies`). */
export const sansEtape = (jour: Pick<DaySnapshot, "items">): boolean => jourSansEtape(jour);

/** Jour encore dans la forme de B9-PO-6 (termini seuls, ni événement ni idée) : `estJourNonPlanifie` du domaine. */
export function jourNonPlanifie(jour: Pick<DaySnapshot, "items" | "events" | "surprise">): boolean {
  return estJourNonPlanifie(jour);
}

/** Étapes d'un jour du voyage complet. */
export const ETAPES_JOUR = ["b", "c", "d", "e"] as const;
export type EtapeJour = (typeof ETAPES_JOUR)[number];

/** Rangs fixes du voyage complet : `a` = 1, `l` = 2 (0087 § 1.3 point 4). */
export const RANG_COMPLET = { a: 1, l: 2 } as const;

/** Rang `step_seq` de l'étape `etape` du jour de rang `i` parmi les jours de l'exécution : `2 + 4 × i + k`. */
export function rangDuJour(i: number, etape: EtapeJour): number {
  if (!Number.isInteger(i) || i < 0) throw new RangeError("voyage complet : rang de jour illisible");
  return 2 + 4 * i + ETAPES_JOUR.indexOf(etape) + 1;
}

/** Étape et rang du jour depuis un rang `step_seq` (≥ 3), ou `null` pour `a`, `l` et 0. */
export function etapeDuRang(rang: number): { readonly i: number; readonly etape: EtapeJour } | null {
  if (!Number.isInteger(rang) || rang < 3) return null;
  const decale = rang - 3;
  return { i: Math.floor(decale / 4), etape: ETAPES_JOUR[decale % 4] as EtapeJour };
}
