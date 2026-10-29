import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReceiptSchema, type Receipt } from "@/contracts";

import { axeViolations } from "../../../tests/unit/axe";

import { FUSEAU_RECU, formatInstantRecu, ReceiptScreen } from "./ReceiptScreen";

/** Reçu maison `R9-recu` du paiement simulé (B4d). */

const TRIP = "0b4d0000-0000-4000-8000-000000000001";
const RECU: Receipt = {
  kind: "simulated",
  checkoutId: "nVpPQ49PSzmdDjwLT1srEQ",
  tripId: TRIP,
  method: "twint",
  amount: 2900,
  currency: "CHF",
  paidAt: "2026-10-29T13:05:42.250Z",
};

function rendre(receipt: Receipt = RECU) {
  return render(<ReceiptScreen receipt={receipt} destination="Édimbourg" tripDates="sam. 29.08 – jeu. 03.09 · 2 adultes" programmeHref={`/voyages/${TRIP}`} />);
}

describe("ReceiptScreen", () => {
  it("PR 878 : reçu marqué « simulé » (titre et mention avant les détails) ; montant, date, voyage, moyen et identifiant du paiement", async () => {
    expect(ReceiptSchema.parse(RECU)).toEqual(RECU);
    const { container } = rendre();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reçu simulé");
    const mention = container.querySelector("[data-part='mention-simule']");
    expect(mention).toHaveTextContent("Reçu de démonstration : aucun paiement réel n'a eu lieu et ce document n'a aucune valeur comptable.");
    const details = screen.getByRole("region", { name: "Détails du paiement simulé" });
    // La mention précède les détails dans l'ordre de lecture.
    expect(mention?.compareDocumentPosition(details) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const valeurs = within(details)
      .getAllByRole("definition")
      .map((dd) => dd.textContent);
    expect(within(details).getAllByRole("term").map((dt) => dt.textContent)).toEqual(["Voyage", "Montant", "Moyen", "Date", "Identifiant du paiement"]);
    expect(valeurs).toEqual([
      "Édimbourg, sam. 29.08 – jeu. 03.09 · 2 adultes",
      "29 CHF",
      "TWINT",
      "29 octobre 2026 à 14:05",
      "nVpPQ49PSzmdDjwLT1srEQ",
    ]);
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toHaveAttribute("data-receipt", "simulated");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("PR 878 : moyen carte, montant avec centimes", () => {
    rendre({ ...RECU, method: "card", amount: 3950 });
    const valeurs = screen.getAllByRole("definition").map((dd) => dd.textContent);
    expect(valeurs[1]).toBe("39.50 CHF");
    expect(valeurs[2]).toBe("carte");
  });

  it("PR 878 : date lue à l'heure de Zurich, été comme hiver, premier du mois ; valeur illisible rendue telle quelle", () => {
    expect(FUSEAU_RECU).toBe("Europe/Zurich");
    expect(formatInstantRecu("2026-07-31T22:30:00Z")).toBe("1er août 2026 à 00:30");
    expect(formatInstantRecu("2026-12-31T23:59:00Z")).toBe("1er janvier 2027 à 00:59");
    expect(formatInstantRecu("2026-03-29T00:59:00Z")).toBe("29 mars 2026 à 01:59");
    expect(formatInstantRecu("2026-03-29T01:00:00Z")).toBe("29 mars 2026 à 03:00");
    expect(formatInstantRecu("pas une date")).toBe("pas une date");
  });
});
