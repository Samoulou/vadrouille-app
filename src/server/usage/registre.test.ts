// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Forfait } from "@/server/usage/forfait";
import { avecReservation, DELAI_REQUETE_MS, type DemandeReservation } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";

import { creerHorlogeManuelle } from "../../../tests/support/horloge-manuelle";

/** Registre en mémoire borné par le forfait (décision 0046, D13 points 3, 4 et 6). */

const FORFAIT: Forfait = {
  nature: "execution",
  textSearchRequetes: 5,
  placeDetailsRequetes: 3,
  routesRequetes: 2,
  routesElements: 100,
  coutGoogleMicros: 560_000,
  coutModelesMicros: 3_000_000,
};
const PERIODES = { jour: { du: 0, au: 1 }, mois: { du: 0, au: 1 } };

const demande = (modifs: Partial<DemandeReservation> = {}): DemandeReservation => ({
  nature: "execution",
  fournisseur: "google",
  methode: "places_details",
  sku: "places_details_enterprise",
  unites: { requetes: 1, elements: 0 },
  coutEstimeMicros: 20_000,
  executionId: "exec-1",
  periodes: PERIODES,
  plafonds: [],
  ...modifs,
});

function monter(forfait: Forfait = FORFAIT, executionId: string | null = "exec-1") {
  const horloge = creerHorlogeManuelle(1_000);
  const registre = creerRegistreForfait(forfait, executionId, horloge);
  return { horloge, registre, dependances: { port: registre, horloge } };
}

describe("p0: appels réels jamais au-delà du forfait", () => {
  it("clients simulés, tous les candidats résolus et ancrés : le registre refuse au-delà du plafond de chaque méthode", async () => {
    const { registre, dependances } = monter();
    let transport = 0;
    const appeler = (d: DemandeReservation) =>
      avecReservation(dependances, d, DELAI_REQUETE_MS.places, async (_signal, appele) => {
        appele();
        transport += 1;
        return { valeur: "ok", coutReelMicros: null };
      });
    // Douze candidats résolus : Text Search et Place Details pour chacun.
    const issuesTexte = [];
    const issuesDetails = [];
    for (let i = 0; i < 12; i++) {
      issuesTexte.push(await appeler(demande({ methode: "places_text_search", sku: "places_text_search_essentials_ids_only", coutEstimeMicros: 0 })));
      issuesDetails.push(await appeler(demande()));
    }
    expect(issuesTexte.filter((i) => i.ok)).toHaveLength(5);
    expect(issuesDetails.filter((i) => i.ok)).toHaveLength(3);
    expect(issuesDetails.filter((i) => !i.ok)).toEqual(Array(9).fill({ ok: false, code: "cap_reached" }));
    // Routes : requêtes et éléments bornés.
    const routes = (elements: number) => appeler(demande({ methode: "routes_matrix", sku: "routes_matrix_essentials", unites: { requetes: 1, elements } }));
    expect((await routes(60)).ok).toBe(true);
    expect(await routes(41)).toEqual({ ok: false, code: "cap_reached" });
    expect((await routes(40)).ok).toBe(true);
    expect(await routes(0)).toEqual({ ok: false, code: "cap_reached" });
    // Modèles : plafond de coût du mode.
    const chat = (cout: number) => appeler(demande({ fournisseur: "modeles", methode: "chat", sku: "modele", unites: { requetes: 1, elements: 0 }, coutEstimeMicros: cout }));
    expect((await chat(2_000_000)).ok).toBe(true);
    expect(await chat(1_000_001)).toEqual({ ok: false, code: "cap_reached" });
    expect((await chat(1_000_000)).ok).toBe(true);
    expect(transport).toBe(5 + 3 + 2 + 2);
    expect(registre.comptees()).toBe(transport);
  });

  it("demande d'une autre exécution, d'une autre nature ou d'un fournisseur incohérent : usage_unavailable (échec fermé)", async () => {
    const { registre } = monter();
    expect(await registre.reserve(demande({ executionId: "exec-2" }))).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await registre.reserve(demande({ nature: "relecture", executionId: null }))).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await registre.reserve(demande({ fournisseur: "modeles" }))).toEqual({ ok: false, code: "usage_unavailable" });
    expect(() => creerRegistreForfait(FORFAIT, null, { maintenant: () => 0 })).toThrow();
  });

  it("relecture : Routes seulement, aucun appel de modèle", async () => {
    const relecture: Forfait = { ...FORFAIT, nature: "relecture", textSearchRequetes: 0, placeDetailsRequetes: 0, coutModelesMicros: null };
    const { registre } = monter(relecture, null);
    const base = { nature: "relecture" as const, executionId: null };
    expect((await registre.reserve(demande({ ...base, methode: "routes_matrix", sku: "routes_matrix_essentials", unites: { requetes: 1, elements: 10 } }))).ok).toBe(true);
    expect(await registre.reserve(demande(base))).toEqual({ ok: false, code: "cap_reached" });
    expect(await registre.reserve(demande({ ...base, fournisseur: "modeles", methode: "chat", sku: "m", coutEstimeMicros: 1 }))).toEqual({ ok: false, code: "cap_reached" });
  });

  it("recherche de ville (`places_autocomplete`) : toujours refusée par le registre d'une exécution, même forfait vierge (0129 § 1.3)", async () => {
    // Revue du head de4ab92, mineur 5 : le garde-fou présenté en 0129 § 1.3 est asserté ici.
    for (const forfait of [FORFAIT, { ...FORFAIT, nature: "relecture" as const, coutModelesMicros: null }]) {
      const executionId = forfait.nature === "execution" ? "exec-1" : null;
      const { registre } = monter(forfait, executionId);
      for (const sku of ["places_autocomplete_requests", "places_autocomplete_session_usage"]) {
        const recherche = demande({ nature: forfait.nature, executionId, methode: "places_autocomplete", sku, coutEstimeMicros: 2_830 });
        expect(await registre.reserve(recherche), `${forfait.nature} ${sku}`).toEqual({ ok: false, code: "cap_reached" });
      }
      expect(registre.comptees()).toBe(0);
    }
  });

  it("aucune écriture en base : le registre n'importe ni pg ni db/, ni le port Neon", () => {
    const source = readFileSync(path.join(import.meta.dirname, "registre.ts"), "utf8");
    expect(source).not.toMatch(/from "(pg|.*db\/.*|.*neon.*)"/);
  });
});

describe("p0: délai par requête et réservation libérée", () => {
  it("transport non appelé : libérée, non comptée ; transport appelé puis délai : abandonnée et comptée", async () => {
    const { registre, horloge, dependances } = monter();
    const libere = await avecReservation(dependances, demande(), DELAI_REQUETE_MS.places, async () => {
      throw new Error("refus avant le transport");
    });
    expect(libere.ok).toBe(false);
    expect(registre.comptees()).toBe(0);
    const issue = avecReservation(dependances, demande(), DELAI_REQUETE_MS.places, (_signal, appele) => {
      appele();
      return new Promise<never>(() => undefined);
    });
    await horloge.avancer(DELAI_REQUETE_MS.places);
    expect(await issue).toEqual({ ok: false, code: "upstream_timeout" });
    expect(registre.comptees()).toBe(1);
    expect(await registre.consumption(null, { methode: "places_details" })).toEqual({ requetes: 1, elements: 0, coutMicros: 20_000 });
    // Une ligne abandonnée occupe le forfait : trois Place Details au plus, abandon compris.
    expect((await registre.reserve(demande())).ok).toBe(true);
    expect((await registre.reserve(demande())).ok).toBe(true);
    expect(await registre.reserve(demande())).toEqual({ ok: false, code: "cap_reached" });
  });

  // Décision 0116 § 2.3 : la requête de modèle `programme` a son propre délai (300 s), les autres délais sont inchangés.
  it("requête programme : délai de 300 s, abandonnée et comptée au-delà ; autres délais inchangés", async () => {
    expect(DELAI_REQUETE_MS).toEqual({ openrouter: 120_000, openrouterProgramme: 300_000, places: 10_000, routes: 10_000 });
    const { registre, horloge, dependances } = monter();
    const chat = demande({ fournisseur: "modeles", methode: "chat", sku: "modele", coutEstimeMicros: 1_000 });
    const issue = avecReservation(dependances, chat, DELAI_REQUETE_MS.openrouterProgramme, (_signal, appele) => {
      appele();
      return new Promise<never>(() => undefined);
    });
    await horloge.avancer(DELAI_REQUETE_MS.openrouter);
    expect(registre.comptees()).toBe(1);
    await horloge.avancer(DELAI_REQUETE_MS.openrouterProgramme - DELAI_REQUETE_MS.openrouter);
    expect(await issue).toEqual({ ok: false, code: "upstream_timeout" });
    expect(await registre.consumption(null, { methode: "chat" })).toEqual({ requetes: 1, elements: 0, coutMicros: 1_000 });
  });
});
