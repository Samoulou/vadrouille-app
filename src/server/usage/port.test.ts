// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { avecReservation, DELAI_PORT_MS, DELAI_REQUETE_MS, type DemandeReservation, type PortConsommation } from "@/server/usage/port";

import { creerHorlogeManuelle } from "../../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../../tests/support/port-consommation-memoire";

/** Port de consommation (P0r1 ; décision 0046, D13) : enveloppe commune des clients et implémentation en mémoire. */

const JOUR = { du: 1_000, au: 2_000 };
const MOIS = { du: 0, au: 10_000 };

const demande = (modifs: Partial<DemandeReservation> = {}): DemandeReservation => ({
  nature: "execution",
  fournisseur: "google",
  methode: "places_details",
  sku: "places_details_enterprise",
  unites: { requetes: 1, elements: 0 },
  coutEstimeMicros: 20_000,
  executionId: "exec-1",
  periodes: { jour: JOUR, mois: MOIS },
  plafonds: [],
  ...modifs,
});

function monter(depart = 1_500) {
  const horloge = creerHorlogeManuelle(depart);
  const port = creerPortMemoire(horloge);
  return { horloge, port, dependances: { port, horloge } };
}

describe("p0: port de consommation, états d'une réservation (D13)", () => {
  it("succès : confirmée au coût réel s'il est rendu", async () => {
    const { port, dependances } = monter();
    const issue = await avecReservation(dependances, demande(), 10_000, async (_signal, appele) => {
      appele();
      return { valeur: "v", coutReelMicros: 12_345 };
    });
    expect(issue).toEqual({ ok: true, valeur: "v" });
    expect(port.lignes.map((l) => [l.etat, l.coutReelMicros])).toEqual([["confirmee", 12_345]]);
    expect(await port.consumption(MOIS)).toEqual({ requetes: 1, elements: 0, coutMicros: 12_345 });
  });

  it("échec avant l'appel du transport : libérée, non comptée", async () => {
    const { port, dependances } = monter();
    const erreur = new Error("avant");
    const issue = await avecReservation(dependances, demande(), 10_000, async () => {
      throw erreur;
    });
    expect(issue).toEqual({ ok: false, erreur });
    expect(port.lignes.map((l) => l.etat)).toEqual(["liberee"]);
    expect(await port.consumption(null)).toEqual({ requetes: 0, elements: 0, coutMicros: 0 });
  });

  it("échec après l'appel du transport : abandonnée, comptée au coût estimé", async () => {
    const { port, dependances } = monter();
    await avecReservation(dependances, demande(), 10_000, async (_signal, appele) => {
      appele();
      throw new Error("réseau");
    });
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    expect(await port.consumption(null)).toEqual({ requetes: 1, elements: 0, coutMicros: 20_000 });
  });

  it("délai de requête dépassé : upstream_timeout, signal abandonné, abandonnée", async () => {
    const { port, horloge, dependances } = monter();
    let signalRecu: AbortSignal | undefined;
    const issue = avecReservation(dependances, demande(), DELAI_REQUETE_MS.places, (signal, appele) => {
      signalRecu = signal;
      appele();
      return new Promise<never>(() => undefined);
    });
    await horloge.avancer(DELAI_REQUETE_MS.places - 1);
    expect(signalRecu?.aborted).toBe(false);
    await horloge.avancer(1);
    expect(await issue).toEqual({ ok: false, code: "upstream_timeout" });
    expect(signalRecu?.aborted).toBe(true);
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    expect(horloge.enAttente()).toBe(0);
  });

  it("délais : 2 000 ms pour le port ; 120 s, 300 s (programme, 0116 § 2.3), 10 s et 10 s par requête", () => {
    expect(DELAI_PORT_MS).toBe(2_000);
    expect(DELAI_REQUETE_MS).toEqual({ openrouter: 120_000, openrouterProgramme: 300_000, places: 10_000, routes: 10_000 });
  });
});

describe("p0: port de consommation, échec fermé (D13)", () => {
  it("réservation qui lève : usage_unavailable, requête jamais lancée", async () => {
    const { horloge, port } = monter();
    const requete = vi.fn();
    const usage: PortConsommation = {
      ...port,
      reserve: async () => {
        throw new Error("base");
      },
    };
    expect(await avecReservation({ port: usage, horloge }, demande(), 10_000, requete)).toEqual({ ok: false, code: "usage_unavailable" });
    expect(requete).not.toHaveBeenCalled();
  });

  it("réservation muette : usage_unavailable à 2 000 ms exactement", async () => {
    const { horloge, port } = monter();
    const requete = vi.fn();
    const usage: PortConsommation = { ...port, reserve: () => new Promise<never>(() => undefined) };
    let fini = false;
    const issue = avecReservation({ port: usage, horloge }, demande(), 10_000, requete).then((r) => {
      fini = true;
      return r;
    });
    await horloge.avancer(DELAI_PORT_MS - 1);
    expect(fini).toBe(false);
    await horloge.avancer(1);
    expect(await issue).toEqual({ ok: false, code: "usage_unavailable" });
    expect(requete).not.toHaveBeenCalled();
  });

  it("confirmation en erreur ou muette : la valeur est rendue, la ligne reste réservée (comptée)", async () => {
    const { horloge, port } = monter();
    const usage: PortConsommation = {
      ...port,
      confirm: async () => {
        throw new Error("base");
      },
    };
    const issue = await avecReservation({ port: usage, horloge }, demande(), 10_000, async (_s, appele) => {
      appele();
      return { valeur: 1, coutReelMicros: null };
    });
    expect(issue).toEqual({ ok: true, valeur: 1 });
    expect(port.lignes.map((l) => l.etat)).toEqual(["reservee"]);

    const muet: PortConsommation = { ...port, confirm: () => new Promise<never>(() => undefined) };
    const enCours = avecReservation({ port: muet, horloge }, demande(), 10_000, async (_s, appele) => {
      appele();
      return { valeur: 2, coutReelMicros: null };
    });
    await horloge.avancer(DELAI_PORT_MS);
    expect(await enCours).toEqual({ ok: true, valeur: 2 });
    expect(await port.consumption(null)).toMatchObject({ requetes: 2 });
  });

  it("refus du port : son code, requête jamais lancée", async () => {
    const { dependances } = monter();
    const requete = vi.fn();
    const plafonds = [{ portee: "jour" as const, fournisseur: "google" as const, maxRequetes: 0 }];
    expect(await avecReservation(dependances, demande({ plafonds }), 10_000, requete)).toEqual({ ok: false, code: "cap_reached" });
    expect(requete).not.toHaveBeenCalled();
  });
});

describe("p0: port de consommation en mémoire, plafonds et périodes", () => {
  it("jour, mois, exécution et enveloppe ; une ligne libérée n'est pas comptée", async () => {
    const { port, horloge } = monter(1_500);
    const reserver = (modifs: Partial<DemandeReservation>) => port.reserve(demande(modifs));
    const parJour = [{ portee: "jour" as const, fournisseur: "google" as const, methode: "places_details" as const, maxRequetes: 2 }];
    expect((await reserver({ plafonds: parJour })).ok).toBe(true);
    const deuxieme = await reserver({ plafonds: parJour });
    expect(deuxieme.ok).toBe(true);
    expect(await reserver({ plafonds: parJour })).toEqual({ ok: false, code: "cap_reached" });
    if (deuxieme.ok) await port.release(deuxieme.reservationId);
    expect((await reserver({ plafonds: parJour })).ok).toBe(true);

    // Le jour suivant (période de l'appelant), le compteur du jour repart ; celui du mois non.
    await horloge.avancer(1_000);
    const lendemain = { jour: { du: 2_000, au: 3_000 }, mois: MOIS };
    expect((await reserver({ periodes: lendemain, plafonds: parJour })).ok).toBe(true);
    // Trois lignes comptées (60 000 micro-USD) : une quatrième dépasserait 70 000.
    const parMois = [{ portee: "mois" as const, fournisseur: "google" as const, maxCoutMicros: 70_000 }];
    expect(await reserver({ periodes: lendemain, plafonds: parMois })).toEqual({ ok: false, code: "cap_reached" });

    const parExecution = [{ portee: "execution" as const, fournisseur: "google" as const, maxRequetes: 1 }];
    expect((await reserver({ executionId: "exec-2", periodes: lendemain, plafonds: parExecution })).ok).toBe(true);
    expect(await reserver({ executionId: "exec-2", periodes: lendemain, plafonds: parExecution })).toEqual({ ok: false, code: "cap_reached" });

    const enveloppe = [{ portee: "enveloppe" as const, fournisseur: "google" as const, maxCoutMicros: 90_000 }];
    expect(await reserver({ periodes: lendemain, plafonds: enveloppe })).toEqual({ ok: false, code: "envelope_reached" });
    // Un plafond d'un autre fournisseur ne s'applique pas.
    expect((await reserver({ fournisseur: "modeles", methode: "chat", periodes: lendemain, plafonds: enveloppe })).ok).toBe(true);
  });

  it("transition invalide refusée (une ligne ne change d'état qu'une fois)", async () => {
    const { port } = monter();
    const r = await port.reserve(demande());
    if (!r.ok) throw new Error("réservation refusée");
    await port.confirm(r.reservationId, { coutMicros: null });
    await expect(port.abandon(r.reservationId)).rejects.toThrow("reservation_unknown");
    await expect(port.release("inconnue")).rejects.toThrow("reservation_unknown");
  });

  it("aucun champ de la demande ne porte une donnée Google, un prompt ou un texte libre", async () => {
    const { port } = monter();
    await port.reserve(demande());
    expect(Object.keys(port.lignes[0]?.demande ?? {}).sort()).toEqual(
      ["coutEstimeMicros", "executionId", "fournisseur", "methode", "nature", "periodes", "plafonds", "sku", "unites"].sort(),
    );
  });
});
