// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { COUTS_ESTIMES_MICROS } from "@/server/config/generation";
import { RECALCUL_FIN_APERCU } from "@/server/config/recalcul";
import { PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import { formatLogLine } from "@/server/log";
import { demandeDe, type ContexteAppel } from "@/server/usage/port";
import { forfaitDuProfil, PROFILS_FORFAIT } from "@/server/usage/reservation";

import { PLAFONDS_LARGES } from "../../../tests/support/banc-apercu";
import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { ArretEtape } from "./codes";
import { resoudre } from "./dependances";
import { EtatLotSchema } from "./etat";
import { reserveDuLot, villesDuLot } from "./etapes-lot";
import { forfaitDuLot } from "./forfait-etape";
import type { VoyageLu } from "./lecture";
import { ESPACE_NOMS_LOT, ouvrirLotApresCloture, requestIdClotureApercu, requestIdDuLot, signalerLotNonCree } from "./lot";
import { ESPACE_NOMS_VOYAGE_COMPLET, uuidV5 } from "./voyage-complet";

/**
 * Pièces pures du recalcul d'un tri (workflow 5, B10b ; décision 0119 § 1.1 point 4, § 1.4, § 4 ; verdict 0120 S5 et S7).
 * Doubles et valeurs sentinelles seulement, aucun appel.
 */

const RUN = "00000000-0000-4000-8000-0000000000b1";
const ORG = "00000000-0000-4000-8000-0000000000b2";
const TRIP = "00000000-0000-4000-8000-0000000000b3";
const CLOTURE = "00000000-0000-4000-8000-0000000000b4";

describe("recalcul: interrupteur et profil `lot` (0119 § 4)", () => {
  it("RECALCUL_FIN_APERCU vaut false sur main (question 4 de la spécification, à Samuel)", () => {
    expect(RECALCUL_FIN_APERCU).toBe(false);
  });

  it("profil `lot` : nouveau profil de forfait, valeurs de test égales entre les bancs et la variante simulée", () => {
    expect(PROFILS_FORFAIT).toContain("lot");
    const attendu = { coutModelesMicros: 20_000, placesTextSearch: 4, placesDetails: 40, routesRequetes: 4, routesElements: 200 };
    expect(PLAFONDS_VARIANTE_SIMULEE.generations.lot).toEqual(attendu);
    expect(PLAFONDS_USAGE_TEST.generations.lot).toEqual(attendu);
    expect(PLAFONDS_LARGES.generations.lot).toEqual(attendu);
  });

  it("forfait du lot (variante simulée, en mémoire) : entier à e ; une requête `raisons` à la réserve exacte passe, une seconde est refusée", async () => {
    const dep = resoudre({ plafonds: PLAFONDS_VARIANTE_SIMULEE });
    const forfait = await forfaitDuLot(dep, { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "simulee" }, 0);
    const profil = forfaitDuProfil(PLAFONDS_VARIANTE_SIMULEE, dep.reglesPour("simulee")?.table ?? (undefined as never), "lot");
    // Part Text Search bornée à la réserve de `e` (ici 0 : une ville `known`) ; le reste est le profil entier.
    expect(forfait.forfait).toEqual({ ...profil, textSearchRequetes: 0 });
    expect((await forfaitDuLot(dep, { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "simulee" }, 3)).forfait.textSearchRequetes).toBe(3);
    expect(forfait.forfait.coutModelesMicros).toBe(COUTS_ESTIMES_MICROS.requeteModele);
    const contexte: ContexteAppel = { nature: "execution", executionId: RUN, periodes: { jour: { du: 0, au: 1 }, mois: { du: 0, au: 1 } } };
    const demande = demandeDe(contexte, { fournisseur: "modeles", methode: "chat", sku: "m", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: COUTS_ESTIMES_MICROS.requeteModele }, forfait.plafonds);
    // Le registre ne refuse que si le cumul **dépasse** le forfait (`>`) : la réserve exacte d'une requête passe (0119 § 4.1 point 3).
    expect((await forfait.registre.reserve(demande)).ok).toBe(true);
    expect(await forfait.registre.reserve(demande)).toEqual({ ok: false, code: "cap_reached" });
  });

  it("réserve Text Search de e au-delà du profil : `cap_reached` avant toute réservation ; sans règles : `usage_unavailable`", async () => {
    const dep = resoudre({ plafonds: PLAFONDS_VARIANTE_SIMULEE });
    const cible = { organizationId: ORG, tripId: TRIP, generationRunId: RUN, barriere: "simulee" as const };
    await expect(forfaitDuLot(dep, cible, 4)).resolves.toBeDefined();
    await expect(forfaitDuLot(dep, cible, 5)).rejects.toEqual(new ArretEtape("cap_reached"));
    await expect(forfaitDuLot(dep, { ...cible, barriere: "production" }, 0)).rejects.toEqual(new ArretEtape("usage_unavailable"));
  });
});

describe("recalcul: identifiants dérivés (0119 § 1.1 point 4)", () => {
  it("request_id du lot : uuidV5 de la clôture dans l'espace de noms du lot, stable, distinct du voyage complet", () => {
    expect(ESPACE_NOMS_LOT).not.toBe(ESPACE_NOMS_VOYAGE_COMPLET);
    expect(requestIdDuLot(CLOTURE)).toBe(uuidV5(`batch:${CLOTURE}`, ESPACE_NOMS_LOT));
    expect(requestIdDuLot(CLOTURE)).toBe(requestIdDuLot(CLOTURE));
    expect(requestIdDuLot(CLOTURE)).not.toBe(uuidV5(`batch:${CLOTURE}`));
    expect(requestIdDuLot(CLOTURE)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(requestIdClotureApercu(RUN)).not.toBe(requestIdDuLot(RUN));
  });
});

describe("recalcul: villes et réserve Text Search du lot (0113 § 3 bis)", () => {
  const voyage = (logements: readonly ("known" | "area" | "none")[]): VoyageLu => {
    const dates = ["2026-11-23", "2026-11-25", "2026-11-27", "2026-11-29"];
    const sejours = logements.map((kind, i) => ({
      ville: `Ville ${i + 1}`,
      du: dates[i] as string,
      au: dates[i + 1] as string,
      logement: kind === "known" ? { kind, label: "Logement maison" } : kind === "area" ? { kind, label: "Quartier maison" } : { kind },
      placeId: kind === "known" ? "SENTINELLE_PLACE_LOGEMENT" : null,
    }));
    return {
      draft: { destination: "Destination maison", start: "2026-11-23", end: dates[logements.length] as string, lodging: sejours[0]?.logement as never, otherCities: [], commitments: [] },
      brief: { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: [], limits: [], mobility: ["walk"], inferredFields: [] },
      timeZone: "Europe/Paris",
      sejours: sejours as VoyageLu["sejours"],
    } as VoyageLu;
  };

  it("une ville par séjour, rang = indice du séjour ; une requête par ville `area` ou `none` des jours touchés", () => {
    const v = voyage(["known", "area", "none"]);
    expect(villesDuLot(v).map((ville) => [ville.rang, ville.nom])).toEqual([
      [0, "Ville 1"],
      [1, "Ville 2"],
      [2, "Ville 3"],
    ]);
    const lot = (jours: number[]) => reserveDuLot({ voyage: v, villes: villesDuLot(v), jours });
    // Critère : une ville `known`, deux jours touchés : aucune requête.
    expect(lot([1, 2])).toBe(0);
    expect(lot([3])).toBe(1);
    expect(lot([3, 4, 5])).toBe(2);
  });
});

describe("recalcul: état sérialisé et journal (0120 S5 point 1, S7)", () => {
  it("EtatLotSchema strict : identifiants, rang borné à 2, code fermé ; aucune autre clé", () => {
    expect(EtatLotSchema.parse({ generationRunId: RUN, organizationId: ORG, rang: 0 })).toEqual({ generationRunId: RUN, organizationId: ORG, rang: 0 });
    expect(EtatLotSchema.safeParse({ generationRunId: RUN, organizationId: ORG, rang: 3 }).success).toBe(false);
    expect(EtatLotSchema.safeParse({ generationRunId: RUN, organizationId: ORG, rang: 1, jours: [2] }).success).toBe(false);
    expect(EtatLotSchema.safeParse({ generationRunId: RUN, organizationId: ORG, rang: 1, arret: "texte libre" }).success).toBe(false);
  });

  it("événements recalcul.* : identifiants internes, nom d'erreur et nombre de jours seulement ; tout autre champ retiré", () => {
    const ligne = (evenement: string, champs: Record<string, unknown>) => JSON.parse(formatLogLine(evenement, champs)) as Record<string, unknown>;
    const pleine = ligne("recalcul.not_created", { organizationId: ORG, tripId: TRIP, days: 2 });
    expect(pleine).toMatchObject({ event: "recalcul.not_created", organizationId: ORG, tripId: TRIP, days: 2 });
    expect(pleine.dropped).toBeUndefined();
    expect(ligne("recalcul.start_failed", { organizationId: ORG, tripId: TRIP, generationRunId: RUN })).toMatchObject({ event: "recalcul.start_failed", generationRunId: RUN });
    expect(ligne("recalcul.unlock_failed", { organizationId: ORG, tripId: TRIP, errorName: "TypeError" })).toMatchObject({ event: "recalcul.unlock_failed", errorName: "TypeError" });
    // Un nom, un `placeId`, une catégorie ou un message ne sortent jamais.
    const fuite = ligne("recalcul.unlock_failed", { organizationId: ORG, placeId: "ChIJ_SENTINELLE", category: "museum", nom: "Lieu SENTINELLE", message: "SENTINELLE", errorName: "Nom SENTINELLE" });
    expect(JSON.stringify(fuite)).not.toMatch(/SENTINELLE|museum/);
    expect(fuite.dropped).toBeGreaterThanOrEqual(1);
  });
});

describe("recalcul: lecture illisible dans completeDeck (revue de la PR 667, mineur 2)", () => {
  const executeur = (snapshot: unknown) => ({
    async query(texte: string) {
      if (texte.includes("SELECT current_version FROM public.trips")) return { rows: [{ current_version: 1 }] };
      if (texte.includes("FROM public.trip_versions")) return { rows: [{ version: 1, snapshot }] };
      throw new Error("panne de base");
    },
  });
  const cible = { organizationId: ORG, tripId: TRIP, clotureId: CLOTURE, maintenant: 0 };

  it("version de base illisible : `illisible`, sans écriture ni erreur (la clôture de l'action est gardée), journal à code fermé", async () => {
    const x = executeur({ days: "SENTINELLE_INSTANTANE_ILLISIBLE" });
    const espion = vi.spyOn(x, "query");
    expect(await ouvrirLotApresCloture(x, cible)).toEqual({ statut: "illisible" });
    expect(espion.mock.calls.some(([texte]) => /INSERT|UPDATE/.test(String(texte)))).toBe(false);
    const avertissements = vi.spyOn(console, "log").mockImplementation(() => undefined);
    signalerLotNonCree(ORG, TRIP, { statut: "illisible" });
    const journal = avertissements.mock.calls.map((appel) => String(appel[0])).join("\n");
    avertissements.mockRestore();
    expect(journal).toContain("recalcul.not_created");
    expect(journal).toContain("LectureIllisible");
    expect(journal).not.toContain("SENTINELLE");
  });

  it("toute autre erreur remonte (l'action échoue sans rien écrire)", async () => {
    await expect(ouvrirLotApresCloture(executeur({ days: [] }), cible)).rejects.toThrow("panne de base");
  });
});
