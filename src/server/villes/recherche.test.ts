import { describe, expect, it, vi } from "vitest";

import { CODE_CLE_ABSENTE } from "@/ai/erreurs";

import { choisirVille, suggererVilles, type HorsTable, type PortsRecherche } from "./recherche";

/**
 * Cœur commun de la recherche de ville (décision 0141 § 6.1 points 1 et 2, bloquant 3 ; T17b, PR 885) : ordre des ports,
 * arrêt au premier refus, table et repli propres à l'adaptateur. Ports doublés : aucun appel Google, aucune base.
 */

const SESSION = "jeton-session-1";
const P = "lieu_fictif_coeur_1";

type Fiche = { placeId: string; pays: string | null; position: { lat: number; lng: number } | null };

function ports<H extends HorsTable>(horsTable: H, fiche: Partial<Fiche> = {}, refus: { ouvrir?: string | null; reserver?: string | null } = {}) {
  const ordre: string[] = [];
  const client = {
    suggererVilles: vi.fn(async () => {
      ordre.push("google");
      return [{ placeId: P, principal: "Lisbonne", secondaire: "Portugal" }];
    }),
    ficheVille: vi.fn(async (): Promise<Fiche> => {
      ordre.push("google");
      return { placeId: P, pays: "PT", position: { lat: 38.72, lng: -9.14 }, ...fiche };
    }),
  };
  const journal = vi.fn();
  const p: PortsRecherche<"refus_ouvrir" | "refus_reserver", H> = {
    ouvrir: vi.fn(async () => {
      ordre.push("ouvrir");
      return (refus.ouvrir ?? null) as "refus_ouvrir" | null;
    }),
    fabrique: vi.fn(() => {
      ordre.push("fabrique");
      return client;
    }),
    reserver: vi.fn(async () => {
      ordre.push("reserver");
      return (refus.reserver ?? null) as "refus_reserver" | null;
    }),
    apres: vi.fn(async () => {
      ordre.push("apres");
    }),
    villeDeLaTable: (nom: string, code: string) => (nom.toLowerCase() === "lisbonne" && code === "PT" ? { nom: "Lisbonne", zone: "Europe/Lisbon" } : null),
    horsTable,
    journal,
  };
  return { p, client, ordre, journal };
}

const choix = { placeId: P, session: SESSION, saisie: "Lisbonne", principal: "Lisbonne" };

describe("cœur de la recherche: ports", () => {
  it("ouvrir avant la fabrique, la fabrique avant reserver, apres en dernier ; un refus arrête la suite ; horsTable fuseau ou refus", async () => {
    // Ordre complet, suggestions et choix.
    const a = ports("refus");
    expect((await suggererVilles({ saisie: " Lisb ", session: SESSION }, a.p)).statut).toBe("ok");
    expect(a.ordre).toEqual(["ouvrir", "fabrique", "reserver", "google", "apres"]);
    expect(a.client.suggererVilles).toHaveBeenCalledWith("Lisb", SESSION);
    const b = ports("refus");
    expect(await choisirVille(choix, b.p)).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "PT", timeZone: "Europe/Lisbon", nomPays: "Portugal", nomMaison: "Lisbonne" },
    });
    expect(b.ordre).toEqual(["ouvrir", "fabrique", "reserver", "google", "apres"]);

    // Entrée invalide : aucun port, sauf le journal.
    const c = ports("refus");
    expect(await suggererVilles({ saisie: "L", session: SESSION }, c.p)).toEqual({ statut: "entree_invalide" });
    expect(await choisirVille({ ...choix, placeId: "a/b" }, c.p)).toEqual({ statut: "entree_invalide" });
    expect(c.ordre).toEqual([]);
    expect(c.journal.mock.calls).toEqual([
      ["suggestions", "entree_invalide"],
      ["choix", "entree_invalide"],
    ]);

    // Refus de `ouvrir` : ni fabrique, ni réservation, ni appel, ni `apres`.
    const d = ports("refus", {}, { ouvrir: "refus_ouvrir" });
    expect(await suggererVilles({ saisie: "Lisb", session: SESSION }, d.p)).toEqual({ statut: "refus_ouvrir" });
    expect(await choisirVille(choix, d.p)).toEqual({ statut: "refus_ouvrir" });
    expect(d.ordre).toEqual(["ouvrir", "ouvrir"]);

    // Fabrique en erreur : `client` journalisé, ni réservation, ni appel, ni `apres`.
    const e = ports("refus");
    e.p = { ...e.p, fabrique: () => {
      throw Object.assign(new Error("SENTINELLE"), { name: "ErreurClientGoogle", code: CODE_CLE_ABSENTE });
    } };
    expect(await suggererVilles({ saisie: "Lisb", session: SESSION }, e.p)).toEqual({ statut: "indisponible" });
    expect(e.ordre).toEqual(["ouvrir"]);
    expect(e.journal).toHaveBeenCalledWith("suggestions", "client", { googleCode: CODE_CLE_ABSENTE, errorName: "ErreurClientGoogle" });

    // Refus de `reserver` : aucun appel, ni `apres`.
    const f = ports("refus", {}, { reserver: "refus_reserver" });
    expect(await choisirVille(choix, f.p)).toEqual({ statut: "refus_reserver" });
    expect(f.ordre).toEqual(["ouvrir", "fabrique", "reserver"]);

    // Appel Google en erreur : `apres` court quand même ; `apres` qui lève ne change pas le résultat.
    const g = ports("refus");
    g.client.ficheVille.mockRejectedValueOnce(Object.assign(new Error("SENTINELLE"), { code: "upstream_error", status: 503 }));
    expect(await choisirVille(choix, g.p)).toEqual({ statut: "indisponible" });
    expect(g.ordre).toEqual(["ouvrir", "fabrique", "reserver", "apres"]);
    expect(g.journal).toHaveBeenCalledWith("choix", "google_erreur", { googleCode: "upstream_error", httpStatus: 503, errorName: "Error" });
    const h = ports("refus");
    h.p = { ...h.p, apres: async () => Promise.reject(new Error("SENTINELLE")) };
    expect((await suggererVilles({ saisie: "Lisb", session: SESSION }, h.p)).statut).toBe("ok");

    // `horsTable` : `refus` (api) rend `hors_table` ; `fuseau` (site d'essai) rend le fuseau du pays ou du repère.
    const i = ports("refus", { pays: "ES", position: { lat: 39.47, lng: -0.38 } });
    expect(await choisirVille({ ...choix, saisie: "Valence", principal: "Valence" }, i.p)).toEqual({ statut: "hors_table" });
    expect(i.journal).toHaveBeenCalledWith("choix", "hors_table");
    const j = ports("fuseau", { pays: "ES", position: { lat: 39.47, lng: -0.38 } });
    expect(await choisirVille({ ...choix, saisie: "Valence", principal: "Valence" }, j.p)).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "ES", timeZone: "Europe/Madrid", nomPays: "Espagne", nomMaison: null },
    });
    // Sans position (fiche de api) et sans ville de la table : aucun fuseau, `pays_inconnu`.
    const k = ports("fuseau", { pays: "US", position: null });
    expect(await choisirVille({ ...choix, saisie: "Asheville", principal: "Asheville" }, k.p)).toEqual({ statut: "pays_inconnu" });
    // Pays hors de la table maison : `pays_inconnu` avant la table de l'adaptateur.
    const l = ports("refus", { pays: "XX" });
    expect(await choisirVille(choix, l.p)).toEqual({ statut: "pays_inconnu" });
    expect(l.journal).toHaveBeenCalledWith("choix", "pays_inconnu");
    // Aucun texte tapé, `placeId` ni texte Google n'atteint le journal.
    for (const appel of [...a.journal.mock.calls, ...g.journal.mock.calls, ...i.journal.mock.calls]) expect(JSON.stringify(appel)).not.toMatch(/SENTINELLE|Lisb|Valence|lieu_fictif/);
  });
});
