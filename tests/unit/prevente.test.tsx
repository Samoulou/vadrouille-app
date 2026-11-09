import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { adressePaiementPrevente, getPrevente, sourcePrevente } from "@/adapters";
import HomePage from "@/app/page";

const LIEN = "https://buy.stripe.com/test_abc123";
function ouvrir(lien?: string) {
  vi.stubEnv("PREVENTE", "1");
  vi.stubEnv("PREVENTE_LIEN_PAIEMENT", lien);
  return getPrevente();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("précommande : configuration", () => {
  it.each([undefined, "", "0", "true", " 1"])("PREVENTE=%j : fermée", (value) => {
    vi.stubEnv("PREVENTE", value);
    expect(getPrevente()).toBeNull();
  });

  it("PREVENTE=1 : prix de l'offre, lien absent", () => {
    expect(ouvrir()).toEqual({ amount: 2900, currency: "CHF", lienPaiement: null });
  });

  it.each(["http://buy.stripe.com/x", "https://evil.example/x", "https://buy.stripe.com.evil.example/x", "https://u@buy.stripe.com/x", "pas une adresse"])(
    "lien refusé : %s",
    (value) => {
      expect(ouvrir(value)).toEqual({ amount: 2900, currency: "CHF", lienPaiement: null });
    },
  );

  it("lien Stripe admis, sans paramètres ; la provenance devient client_reference_id", () => {
    const prevente = ouvrir(`${LIEN}?x=1`);
    expect(prevente?.lienPaiement).toBe(LIEN);
    expect(adressePaiementPrevente(prevente, null)).toBe(LIEN);
    expect(adressePaiementPrevente(prevente, "instagram")).toBe(`${LIEN}?client_reference_id=src-instagram`);
    expect(adressePaiementPrevente(null, "instagram")).toBeNull();
  });

  it("provenance : lettres minuscules, chiffres et tirets seulement", () => {
    expect(sourcePrevente("instagram-pub")).toBe("instagram-pub");
    for (const value of [undefined, "", "A", "a b", "a&b=c", ["a"], "x".repeat(31)]) expect(sourcePrevente(value)).toBeNull();
  });
});

describe("accueil : précommande", () => {
  it("fermée : « Créer un voyage », aucun bouton de précommande", async () => {
    render(await HomePage());
    expect(screen.getAllByRole("link", { name: "Créer un voyage" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Précommander/ })).not.toBeInTheDocument();
  });

  it("ouverte : trois boutons « Précommander pour 29 CHF » avec la provenance, prix, questions, démonstration ; plus de « Créer un voyage »", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({ src: "forum" }) }));
    const boutons = screen.getAllByRole("link", { name: "Précommander pour 29 CHF" });
    expect(boutons).toHaveLength(3);
    for (const bouton of boutons) expect(bouton).toHaveAttribute("href", "/precommande?src=forum");
    expect(screen.queryByRole("link", { name: "Créer un voyage" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "29 CHF pour un voyage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Questions fréquentes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la démonstration" })).toHaveAttribute("href", "#demonstration");
    expect(screen.queryByText("Aucun lieu inventé")).not.toBeInTheDocument();
  });

  it("ouverte, provenance invalide : bouton sans provenance", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({ src: "a b" }) }));
    expect(screen.getAllByRole("link", { name: /Précommander/ })[0]).toHaveAttribute("href", "/precommande");
  });
});
