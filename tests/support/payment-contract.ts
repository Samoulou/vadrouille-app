import { expect, it } from "vitest";

import type { AdapterContext, PaymentAdapter, PaymentSimulator } from "@/adapters/types";
import type { OfferConfig } from "@/contracts";
import { AppPathSchema, adressePrestataireAdmise, ORIGINE_PRESTATAIRE } from "@/contracts/billing";

/**
 * Suite de contrat commune de `PaymentAdapter` et `PaymentSimulator` (spécification B4, critère A18 ; décision 0097
 * B4-TL-9) : exécutée sur `mock` (`tests/unit/adapters/paiement-contrat.test.ts`, `pnpm test`) et sur `simulated`
 * (`tests/db/paiement-contrat.test.ts`, `pnpm test:db`, prestataire simulé livrant au webhook simulé par le transport de
 * test) ; en B4c, sur `stripe` avec un double du client (`tests/db/paiement-contrat.test.ts`, issues livrées au webhook Stripe
 * par des événements signés, décision 0140 § 9, C1). Les cas propres au simulé en mémoire (portée, délai de
 * confirmation) restent dans `src/adapters/mock-payment.test.ts`. Ce fichier ne finit pas par `.test.ts` : il n'est
 * exécuté que par ses appelants.
 *
 * Cas : offre, création, idempotence par `requestId`, `already_unlocked`, réussite, refus, annulation, expiration,
 * `duplicate`, isolation ; `redirectUrl` selon l'adaptateur (0140 § 9, C1 : chemin pour `mock` et `simulated`, adresse
 * admise par `adressePrestataireAdmise` pour `stripe`).
 */

/** Un voyage neuf, non débloqué, et son adaptateur, avec une horloge propre au banc. */
export type InstancePaiement = {
  readonly adapter: PaymentAdapter & PaymentSimulator;
  /** Personne `owner` de l'organisation du voyage. */
  readonly ctx: AdapterContext;
  readonly tripId: string;
  /** Personne `owner` d'une autre organisation, sans accès au voyage. */
  readonly autre: AdapterContext;
  /** Avance l'horloge de l'adaptateur. */
  avancer(ms: number): void;
};

export type BancPaiement = {
  readonly offre: OfferConfig;
  readonly dureeVieMs: number;
  nouveau(): Promise<InstancePaiement>;
  /** Forme de `redirectUrl` : chemin de l'application (`mock`, `simulated`) ou adresse du prestataire (`stripe`). */
  readonly redirection: "chemin" | "prestataire";
  /** `stripe` seulement : instance dont le double du prestataire rend cette adresse de session. */
  avecAdresseSession?(url: string): Promise<InstancePaiement>;
};

const ID_PUBLIC = /^[A-Za-z0-9_-]{22}$/;

async function commencer(instance: InstancePaiement, method: "twint" | "card" = "twint", requestId: string = crypto.randomUUID()) {
  const resultat = await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method, requestId });
  if (!resultat.ok) throw new Error(`createCheckout : ${resultat.error.code}`);
  expect(resultat.value.checkoutId).toMatch(ID_PUBLIC);
  return resultat.value.checkoutId;
}

async function statut(instance: InstancePaiement, checkoutId: string): Promise<string> {
  const resultat = await instance.adapter.getCheckoutStatus(instance.ctx, checkoutId);
  if (!resultat.ok) throw new Error(`getCheckoutStatus : ${resultat.error.code}`);
  return resultat.value.status;
}

async function issue(instance: InstancePaiement, checkoutId: string, outcome: "succeeded" | "declined" | "cancelled"): Promise<string> {
  const resultat = await instance.adapter.simulateOutcome(instance.ctx, checkoutId, outcome);
  if (!resultat.ok) throw new Error(`simulateOutcome : ${resultat.error.code}`);
  return resultat.value.status;
}

const debloque = async (instance: InstancePaiement) => (await instance.adapter.getEntitlement(instance.ctx, instance.tripId)).unlocked;

export function decrireContratPaiement(nom: string, banc: BancPaiement): void {
  it(`${nom} : offre du voyage, prix de la configuration`, async () => {
    const instance = await banc.nouveau();
    expect(await instance.adapter.getOffer(instance.ctx, instance.tripId)).toEqual({ ok: true, value: { tripId: instance.tripId, ...banc.offre } });
  });

  it(`${nom} : création, statut pending avec l'instantané du prix, adresse de redirection`, async () => {
    const instance = await banc.nouveau();
    const depart = await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method: "card", requestId: crypto.randomUUID() });
    expect(depart.ok).toBe(true);
    if (!depart.ok) return;
    if (banc.redirection === "chemin") expect(depart.value.redirectUrl).toContain(depart.value.checkoutId);
    expect(await instance.adapter.getCheckoutStatus(instance.ctx, depart.value.checkoutId)).toEqual({
      ok: true,
      value: {
        checkoutId: depart.value.checkoutId,
        tripId: instance.tripId,
        method: "card",
        status: "pending",
        priceVariant: banc.offre.priceVariant,
        amount: banc.offre.amount,
        currency: banc.offre.currency,
      },
    });
    expect(await debloque(instance)).toBe(false);
  });

  it(`${nom} : idempotence par requestId (même réponse ; autre voyage ou autre moyen : validation_failed)`, async () => {
    const instance = await banc.nouveau();
    const requestId = crypto.randomUUID();
    const premier = await commencer(instance, "twint", requestId);
    expect(await commencer(instance, "twint", requestId)).toBe(premier);
    expect(await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method: "card", requestId })).toEqual({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(await commencer(instance, "twint")).not.toBe(premier);
  });

  it(`${nom} : réussite, droit accordé, puis already_unlocked sans nouveau paiement ; rejouer la réussite ne change rien`, async () => {
    const instance = await banc.nouveau();
    const id = await commencer(instance);
    expect(await issue(instance, id, "succeeded")).toBe("succeeded");
    expect(await statut(instance, id)).toBe("succeeded");
    expect(await debloque(instance)).toBe(true);
    expect(await issue(instance, id, "succeeded")).toBe("succeeded");
    expect(await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method: "twint", requestId: crypto.randomUUID() })).toEqual({
      ok: false,
      error: { code: "already_unlocked" },
    });
  });

  it(`${nom} : refus, puis une autre issue ne change rien ; aucun droit`, async () => {
    const instance = await banc.nouveau();
    const id = await commencer(instance);
    expect(await issue(instance, id, "declined")).toBe("declined");
    expect(await issue(instance, id, "cancelled")).toBe("declined");
    expect(await statut(instance, id)).toBe("declined");
    expect(await debloque(instance)).toBe(false);
  });

  it(`${nom} : annulation ; un nouveau paiement reste possible`, async () => {
    const instance = await banc.nouveau();
    const id = await commencer(instance);
    expect(await issue(instance, id, "cancelled")).toBe("cancelled");
    expect(await debloque(instance)).toBe(false);
    const second = await commencer(instance);
    expect(await issue(instance, second, "succeeded")).toBe("succeeded");
    expect(await debloque(instance)).toBe(true);
  });

  it(`${nom} : expiration après la durée de vie ; une réussite demandée ensuite n'accorde rien`, async () => {
    const instance = await banc.nouveau();
    const id = await commencer(instance);
    instance.avancer(banc.dureeVieMs - 1000);
    expect(await statut(instance, id)).toBe("pending");
    instance.avancer(2000);
    expect(await statut(instance, id)).toBe("expired");
    expect(await issue(instance, id, "succeeded")).toBe("expired");
    expect(await debloque(instance)).toBe(false);
  });

  it(`${nom} : second paiement réussi d'un voyage déjà débloqué : duplicate, droit inchangé`, async () => {
    const instance = await banc.nouveau();
    const premier = await commencer(instance);
    const second = await commencer(instance, "card");
    expect(await issue(instance, premier, "succeeded")).toBe("succeeded");
    expect(await issue(instance, second, "succeeded")).toBe("duplicate");
    expect(await statut(instance, premier)).toBe("succeeded");
    expect(await debloque(instance)).toBe(true);
  });

  it(`${nom} : isolation entre organisations (offre, création, statut, issue, droit)`, async () => {
    const instance = await banc.nouveau();
    const id = await commencer(instance);
    const { adapter, autre, tripId } = instance;
    expect(await adapter.getOffer(autre, tripId)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.createCheckout(autre, { tripId, method: "twint", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getCheckoutStatus(autre, id)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.simulateOutcome(autre, id, "succeeded")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await statut(instance, id)).toBe("pending");
    expect(await issue(instance, id, "succeeded")).toBe("succeeded");
    expect((await adapter.getEntitlement(autre, tripId)).unlocked).toBe(false);
    expect(await adapter.getCheckoutStatus(instance.ctx, "AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it(`adaptateurs: redirectUrl selon l'adaptateur (${nom})`, async () => {
    const instance = await banc.nouveau();
    const requestId = crypto.randomUUID();
    const depart = await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method: "twint", requestId });
    const reprise = await instance.adapter.createCheckout(instance.ctx, { tripId: instance.tripId, method: "twint", requestId });
    expect(depart.ok && reprise.ok).toBe(true);
    if (!depart.ok || !reprise.ok) return;
    for (const url of [depart.value.redirectUrl, reprise.value.redirectUrl]) {
      expect(AppPathSchema.safeParse(url).success).toBe(banc.redirection === "chemin");
      expect(adressePrestataireAdmise(url)).toBe(banc.redirection === "prestataire");
    }
    if (banc.avecAdresseSession === undefined) return;
    // Hôte écrit en majuscules, construit depuis la constante (aucun hôte écrit dans les fichiers du régime).
    for (const horsListe of ["https://evil.example/x", `${ORIGINE_PRESTATAIRE.toUpperCase().replace("HTTPS://", "https://")}/x`]) {
      const autre = await banc.avecAdresseSession(horsListe);
      const refus = await autre.adapter.createCheckout(autre.ctx, { tripId: autre.tripId, method: "twint", requestId: crypto.randomUUID() });
      expect(refus).toEqual({ ok: false, error: { code: "provider_error", retryable: false } });
    }
  });
}
