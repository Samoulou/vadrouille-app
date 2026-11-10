import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPagesLegales, pagesLegalesDisponibles } from "@/adapters";
import ConditionsDeVentePage from "@/app/precommande/conditions-de-vente/page";
import DonneesPage from "@/app/precommande/donnees/page";
import MentionsLegalesPage from "@/app/precommande/mentions-legales/page";
import { pagesLegalesRoutes } from "@/features/accueil/routes";
import * as messages from "@/i18n/messages";

/** Valeurs fictives, évidentes : aucune n'est celle du vendeur réel (dépôt public). */
const VENDEUR = {
  VENDEUR_NOM: "Vendeur d'essai",
  VENDEUR_STATUT: "statut d'essai",
  VENDEUR_ADRESSE: "Rue de l'Essai 1, 0000 Ville d'essai",
  VENDEUR_CONTACT: "contact@vendeur-essai.example",
  VENDEUR_CONSERVATION: "durée d'essai",
  TEXTES_LEGAUX_DATE: "2026-11-10",
} as const;
type Nom = keyof typeof VENDEUR;

function ouvrir(remplace: Partial<Record<Nom, string | undefined>> = {}, prevente: { valeur: string | undefined } = { valeur: "1" }) {
  vi.stubEnv("PREVENTE", prevente.valeur);
  const valeurs: Record<Nom, string | undefined> = { ...VENDEUR, ...remplace };
  vi.stubEnv("VENDEUR_NOM", valeurs.VENDEUR_NOM);
  vi.stubEnv("VENDEUR_STATUT", valeurs.VENDEUR_STATUT);
  vi.stubEnv("VENDEUR_ADRESSE", valeurs.VENDEUR_ADRESSE);
  vi.stubEnv("VENDEUR_CONTACT", valeurs.VENDEUR_CONTACT);
  vi.stubEnv("VENDEUR_CONSERVATION", valeurs.VENDEUR_CONSERVATION);
  vi.stubEnv("TEXTES_LEGAUX_DATE", valeurs.TEXTES_LEGAUX_DATE);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const PAGES = [
  ["mentions", MentionsLegalesPage],
  ["conditions", ConditionsDeVentePage],
  ["donnees", DonneesPage],
] as const;

/** `notFound()` de Next.js lève une erreur dont `digest` porte le statut. */
function digest(page: () => unknown): string {
  try {
    page();
  } catch (error) {
    return String((error as { digest?: unknown }).digest);
  }
  return "aucune erreur";
}

describe("pages légales : configuration", () => {
  it("précommande ouverte et vendeur complet : valeurs rognées, pages disponibles", () => {
    ouvrir({ VENDEUR_NOM: "  Vendeur d'essai  " });
    expect(getPagesLegales()).toEqual({
      prevente: { amount: 2900, currency: "CHF", lienPaiement: null },
      vendeur: { nom: "Vendeur d'essai", statut: "statut d'essai", adresse: "Rue de l'Essai 1, 0000 Ville d'essai", contact: "contact@vendeur-essai.example" },
      conservation: "durée d'essai",
      publication: "2026-11-10",
    });
    expect(pagesLegalesDisponibles()).toBe(true);
  });

  it.each([undefined, "", "0", "true"])("PREVENTE=%j : indisponibles, même avec un vendeur complet", (value) => {
    ouvrir({}, { valeur: value });
    expect(getPagesLegales()).toBeNull();
    expect(pagesLegalesDisponibles()).toBe(false);
  });

  it.each(Object.keys(VENDEUR) as Nom[])("%s absente ou vide : indisponibles", (nom) => {
    for (const valeur of [undefined, "", "   "]) {
      ouvrir({ [nom]: valeur });
      expect(getPagesLegales(), JSON.stringify(valeur)).toBeNull();
    }
  });

  it.each<[Nom, string]>([
    ["VENDEUR_NOM", "V"],
    ["VENDEUR_NOM", "x".repeat(81)],
    ["VENDEUR_NOM", "[NOM DU VENDEUR]"],
    ["VENDEUR_NOM", "Vendeur\nd'essai"],
    ["VENDEUR_NOM", "Vendeur\u0007"],
    ["VENDEUR_NOM", "Vendeur\u007Fd'essai"],
    ["VENDEUR_NOM", "Vendeur\u0085d'essai"],
    ["VENDEUR_NOM", "Vendeur\u200Bd'essai"],
    ["VENDEUR_NOM", "Vendeur\u202Ed'essai"],
    ["VENDEUR_NOM", "Vendeur\u2028d'essai"],
    ["VENDEUR_NOM", "<b>Vendeur</b>"],
    ["VENDEUR_NOM", "{contact}"],
    ["VENDEUR_STATUT", "x".repeat(121)],
    ["VENDEUR_STATUT", "[STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR]"],
    ["VENDEUR_ADRESSE", "Rue"],
    ["VENDEUR_ADRESSE", "x".repeat(201)],
    ["VENDEUR_ADRESSE", "Rue de l'Essai 1\r\n0000 Ville d'essai"],
    ["VENDEUR_ADRESSE", "Rue de l'Essai 1\t0000 Ville d'essai"],
    ["VENDEUR_CONSERVATION", "x".repeat(61)],
    ["VENDEUR_CONSERVATION", "[DURÉE DE CONSERVATION]"],
    ["VENDEUR_CONTACT", "contact"],
    ["VENDEUR_CONTACT", "contact@"],
    ["VENDEUR_CONTACT", "@vendeur-essai.example"],
    ["VENDEUR_CONTACT", "contact@vendeur-essai"],
    ["VENDEUR_CONTACT", "contact @vendeur-essai.example"],
    ["VENDEUR_CONTACT", "a@b@vendeur-essai.example"],
    ["VENDEUR_CONTACT", "contact..essai@vendeur-essai.example"],
    ["VENDEUR_CONTACT", "contact@vendeur-essai..example"],
    ["VENDEUR_CONTACT", "contact@-vendeur.example"],
    ["VENDEUR_CONTACT", "Vendeur <contact@vendeur-essai.example>"],
    ["VENDEUR_CONTACT", "mailto:contact@vendeur-essai.example"],
    ["VENDEUR_CONTACT", "contact@vendeur-essai.example?subject=x"],
    ["VENDEUR_CONTACT", "contact@vendeur-essai.example\nBcc: x@y.example"],
    ["VENDEUR_CONTACT", `${"x".repeat(64)}@vendeur-essai.example`.padStart(260, "x")],
    ["TEXTES_LEGAUX_DATE", "10.11.2026"],
    ["TEXTES_LEGAUX_DATE", "2026-11-1"],
    ["TEXTES_LEGAUX_DATE", "2026-02-30"],
    ["TEXTES_LEGAUX_DATE", "2026-13-01"],
    ["TEXTES_LEGAUX_DATE", "2026-11-10T00:00:00Z"],
    ["TEXTES_LEGAUX_DATE", "[DATE DE PUBLICATION]"],
  ])("%s refusée : %j", (nom, valeur) => {
    ouvrir({ [nom]: valeur });
    expect(getPagesLegales()).toBeNull();
    expect(pagesLegalesDisponibles()).toBe(false);
  });

  it.each<[Nom, string]>([
    ["VENDEUR_NOM", "Élodie d'Essai-Fictive"],
    ["VENDEUR_ADRESSE", "c/o Domiciliation d'essai, Case postale 0, 0000 Ville d'essai"],
    ["VENDEUR_CONTACT", "Prenom.Nom+precommande@sous.vendeur-essai.example"],
    ["TEXTES_LEGAUX_DATE", "2028-02-29"],
  ])("%s admise : %j", (nom, valeur) => {
    ouvrir({ [nom]: valeur });
    expect(getPagesLegales()).not.toBeNull();
  });
});

describe("pages légales : 404", () => {
  it("précommande fermée : 404 sur les trois pages, même avec un vendeur complet", () => {
    ouvrir({}, { valeur: undefined });
    for (const [nom, Page] of PAGES) expect(digest(() => Page()), nom).toContain("404");
  });

  it.each(Object.keys(VENDEUR) as Nom[])("ouverte, %s absente : 404 sur les trois pages", (variable) => {
    ouvrir({ [variable]: undefined });
    for (const [nom, Page] of PAGES) expect(digest(() => Page()), nom).toContain("404");
  });

  it("ouverte, emplacement de la source recopié tel quel : 404 sur les trois pages", () => {
    ouvrir({ VENDEUR_NOM: "[NOM DU VENDEUR]" });
    for (const [nom, Page] of PAGES) expect(digest(() => Page()), nom).toContain("404");
  });
});

describe("pages légales : rendu", () => {
  it("adresses sous /precommande/ (en-têtes de la précommande)", () => {
    expect(pagesLegalesRoutes).toEqual({
      mentions: "/precommande/mentions-legales",
      conditions: "/precommande/conditions-de-vente",
      donnees: "/precommande/donnees",
    });
  });

  it("« Qui vend … » : titre, nom, statut, adresse et contact du vendeur, liens vers les deux autres pages et l'accueil", () => {
    ouvrir();
    render(MentionsLegalesPage());
    expect(screen.getByRole("heading", { level: 1, name: "Qui vend Vadrouille" })).toBeInTheDocument();
    expect(screen.getByText("Vadrouille est vendu par Vendeur d'essai, statut d'essai.")).toBeInTheDocument();
    expect(screen.getByText("Adresse : Rue de l'Essai 1, 0000 Ville d'essai")).toBeInTheDocument();
    expect(screen.getByText("Contact : contact@vendeur-essai.example")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conditions de vente de la précommande" })).toHaveAttribute("href", "/precommande/conditions-de-vente");
    expect(screen.getByRole("link", { name: "Tes données et la précommande" })).toHaveAttribute("href", "/precommande/donnees");
    expect(screen.getByRole("link", { name: "Revenir à l'accueil" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/^Version du/)).not.toBeInTheDocument();
  });

  it("« Conditions de vente » : onze articles, prix de l'offre, date d'ouverture et liste de la page de prévente, vendeur et contact", () => {
    ouvrir();
    render(ConditionsDeVentePage());
    expect(screen.getByRole("heading", { level: 1, name: "Conditions de vente de la précommande" })).toBeInTheDocument();
    expect(screen.getByText("Version du 10 novembre 2026.")).toBeInTheDocument();
    const articles = screen.getAllByRole("heading", { level: 2 }).map((titre) => titre.textContent);
    expect(articles).toHaveLength(11);
    articles.forEach((titre, rang) => expect(titre).toMatch(new RegExp(`^${rang + 1}\\. `)));
    expect(screen.getByText("Le vendeur est Vendeur d'essai, statut d'essai. Ses coordonnées sont dans « Qui vend Vadrouille ».")).toBeInTheDocument();
    expect(screen.getByText(/^Le prix est de 29\sCHF, en francs suisses/)).toBeInTheDocument();
    expect(screen.getByText(/utilisable dès le 1er février 2027\./)).toBeInTheDocument();
    expect(screen.getByText(/tu es remboursé intégralement : 29\sCHF\./)).toBeInTheDocument();
    expect(screen.getByText(/^Jusqu'au 31 janvier 2027 inclus.* Écris à contact@vendeur-essai\.example,/)).toBeInTheDocument();
    expect(screen.getByText(/domiciliées en Suisse/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((ligne) => ligne.textContent)).toEqual(messages.prevente.prix.inclus);
    expect(screen.getByRole("link", { name: "Qui vend Vadrouille" })).toHaveAttribute("href", "/precommande/mentions-legales");
  });

  it("« Tes données » : titres, responsable, durée de conservation, liens des deux politiques de confidentialité", () => {
    ouvrir();
    render(DonneesPage());
    expect(screen.getByRole("heading", { level: 1, name: "Tes données et la précommande" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((titre) => titre.textContent)).toEqual([
      "Qui est responsable",
      "Sur ce site",
      "L'hébergement",
      "Le paiement",
      "À quoi sert ton adresse e-mail",
      "Si tu écris au vendeur",
      "Combien de temps",
      "Tes droits",
    ]);
    expect(screen.getByText("Vendeur d'essai, Rue de l'Essai 1, 0000 Ville d'essai. Contact : contact@vendeur-essai.example.")).toBeInTheDocument();
    expect(screen.getByText(/pendant la durée exigée par la loi : durée d'essai\./)).toBeInTheDocument();
    for (const nom of ["Stripe", "Vercel"]) {
      const lien = screen.getByRole("link", { name: new RegExp(`^Politique de confidentialité de ${nom}\\s*\\(s'ouvre dans un nouvel onglet\\)$`) });
      expect(lien).toHaveAttribute("target", "_blank");
      expect(lien).toHaveAttribute("rel", "noopener noreferrer");
      expect(lien.getAttribute("href")).toMatch(/^https:\/\//);
    }
    // Paragraphe « Les visites » : seulement quand le compteur est en service (note d'intégration de la source).
    expect(document.body.textContent).not.toMatch(/nombre d'affichages/);
  });

  it("aucun emplacement à remplir ni variable non remplacée sur les trois pages", () => {
    ouvrir();
    for (const [nom, Page] of PAGES) {
      render(Page());
      expect(document.body.textContent, nom).not.toMatch(/[[\]{}]/);
      cleanup();
    }
  });

  it("la veille de l'ouverture écrite dans les conditions suit la date d'ouverture de la page de prévente", () => {
    // « Jusqu'au 31 janvier 2027 inclus » : si la date d'ouverture change (`prevente.json`), `legal.json` change avec elle.
    expect([messages.prevente.ouverture, messages.legal.veille]).toEqual(["1er février 2027", "31 janvier 2027"]);
  });
});
