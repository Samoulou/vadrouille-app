import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { adressePaiementPrevente, getPrevente, sourcePrevente } from "@/adapters";
import HomePage from "@/app/page";
import PrecommandePage from "@/app/precommande/page";
import PrecommandeMerciPage from "@/app/precommande/merci/page";

const LIEN = "https://buy.stripe.com/test_abc123";
function ouvrir(lien?: string) {
  vi.stubEnv("PREVENTE", "1");
  vi.stubEnv("PREVENTE_LIEN_PAIEMENT", lien);
  return getPrevente();
}

/** Les six valeurs qui rendent les pages légales disponibles (`src/adapters/pages-legales.ts`). */
function vendeur() {
  vi.stubEnv("VENDEUR_NOM", "Vendeur d'essai");
  vi.stubEnv("VENDEUR_STATUT", "statut d'essai");
  vi.stubEnv("VENDEUR_ADRESSE", "Rue de l'Essai 1, 0000 Ville d'essai");
  vi.stubEnv("VENDEUR_CONTACT", "contact@vendeur-essai.example");
  vi.stubEnv("VENDEUR_CONSERVATION", "durée d'essai");
  vi.stubEnv("TEXTES_LEGAUX_DATE", "2026-11-10");
}
/** Adresse de chaque page légale, et nombre de liens attendus vers elle sur la page d'accueil. */
const LIENS_LEGAUX = {
  "/precommande/mentions-legales": 2,
  "/precommande/conditions-de-vente": 2,
  "/precommande/donnees": 2,
} as const;

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

  it.each(["http://buy.stripe.com/x", "https://evil.example/x", "https://buy.stripe.com.evil.example/x", "https://u@buy.stripe.com/x", "https://buy.stripe.com", "https://buy.stripe.com/", "pas une adresse"])(
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
    expect(screen.getByRole("heading", { level: 1, name: /^Ton voyage,\s*de l'hôtel à la soirée$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^Le voyage complet\s*29\sCHF\s*pour un voyage$/ })).toBeInTheDocument();
    expect(screen.getByText(/1er février 2027, tu es remboursé intégralement/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Questions fréquentes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la démonstration" })).toHaveAttribute("href", "#demonstration");
    expect(screen.queryByText("Aucun lieu inventé")).not.toBeInTheDocument();
  });

  it("ouverte, pages légales non configurées : aucun lien vers elles", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("navigation", { name: "Informations légales" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mentions légales" })).not.toBeInTheDocument();
  });

  it("ouverte, pages légales configurées : liens près du bouton du prix et au pied de la page", async () => {
    vi.stubEnv("PREVENTE", "1");
    vendeur();
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("navigation", { name: "Informations légales" })).toHaveLength(1);
    for (const [href, attendus] of Object.entries(LIENS_LEGAUX)) {
      const liens = screen.getAllByRole("link").filter((lien) => lien.getAttribute("href") === href);
      expect(liens, href).toHaveLength(attendus);
    }
  });

  it("ouverte : un seul h1, un h2 par section, le prix nommé par son surtitre", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const id of ["destinations-titre", "etapes-titre", "vise-titre", "prix-titre", "faq-titre", "final-titre"]) {
      const section = document.querySelector(`main section[aria-labelledby="${id}"]`);
      expect(section, id).not.toBeNull();
      const titre = document.getElementById(id);
      expect(titre?.tagName, id).toBe("H2");
      expect(section!.contains(titre)).toBe(true);
    }
    expect(screen.getByRole("heading", { level: 2, name: /^Le voyage complet\s*29\sCHF\s*pour un voyage$/ })).toBeInTheDocument();
  });

  it("ouverte : tableau des départs à trois colonnes et quatre destinations, nommées en tête de ligne", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    const tableau = screen.getByRole("table", { name: /ce ne sont pas des programmes déjà prêts/ });
    const colonnes = within(tableau).getAllByRole("columnheader");
    expect(colonnes.map((colonne) => colonne.textContent)).toEqual(["Départ", "Destination", "Durée"]);
    for (const colonne of colonnes) expect(colonne).toHaveAttribute("scope", "col");
    const lignes = within(tableau).getAllByRole("rowheader");
    expect(lignes.map((ligne) => ligne.textContent)).toEqual(["Lisbonne", "Rome", "Zakynthos", "Édimbourg"]);
    for (const ligne of lignes) expect(ligne).toHaveAttribute("scope", "row");
    expect(within(tableau).getAllByRole("row")).toHaveLength(5);
  });

  it("ouverte : « À confirmer » et « Non confirmé » sont l'étiquette de l'application, sans guillemets autour", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    const garanties = document.querySelector('section[aria-labelledby="vise-titre"]');
    expect(garanties).not.toBeNull();
    const etiquettes = Array.from(garanties!.querySelectorAll("[data-kind]"));
    expect(etiquettes.map((etiquette) => etiquette.getAttribute("data-kind"))).toEqual(["toConfirm", "unconfirmed"]);
    expect(etiquettes.map((etiquette) => etiquette.textContent)).toEqual(["À confirmer", "Non confirmé"]);
    expect(garanties!.textContent).not.toMatch(/[«»]/);
    // Le texte autour de l'étiquette est gardé entier.
    expect(garanties!.textContent).toContain("Ce qui reste incertain marqué");
    expect(garanties!.textContent).toContain("Un événement sans source relue marqué");
  });

  it("ouverte : les trois fragments de l'application sont décoratifs, sans contrôle ni lien", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    const gestes = document.querySelector('section[aria-labelledby="etapes-titre"]');
    const etapes = Array.from(gestes!.querySelectorAll("ol > li"));
    expect(etapes).toHaveLength(3);
    for (const etape of etapes) {
      expect(within(etape as HTMLElement).getByRole("heading", { level: 3 })).toBeInTheDocument();
      const fragment = etape.querySelector(':scope > [aria-hidden="true"]');
      expect(fragment).not.toBeNull();
      expect(fragment!.querySelectorAll("a, button, input, textarea, select, [tabindex]")).toHaveLength(0);
    }
    // Rien d'autre que du décor n'est caché aux lecteurs d'écran : titres, textes et liens restent hors de `aria-hidden`.
    for (const cache of Array.from(document.querySelectorAll('main [aria-hidden="true"]'))) {
      expect(cache.querySelectorAll("a, button, h1, h2, h3")).toHaveLength(0);
    }
  });

  it("ouverte, provenance invalide : bouton sans provenance", async () => {
    vi.stubEnv("PREVENTE", "1");
    render(await HomePage({ searchParams: Promise.resolve({ src: "a b" }) }));
    expect(screen.getAllByRole("link", { name: /Précommander/ })[0]).toHaveAttribute("href", "/precommande");
  });
});

/** `notFound()` et `redirect()` de Next.js lèvent une erreur dont `digest` porte le statut ou l'adresse. */
async function digest(page: () => unknown): Promise<string> {
  try {
    await page();
  } catch (error) {
    return String((error as { digest?: unknown }).digest);
  }
  return "aucune erreur";
}

describe("précommande : pages", () => {
  const precommande = (src?: string) => PrecommandePage({ searchParams: Promise.resolve(src === undefined ? {} : { src }) });

  it("fermée : 404 sur les deux pages", async () => {
    expect(await digest(() => precommande("forum"))).toContain("404");
    expect(await digest(() => PrecommandeMerciPage())).toContain("404");
  });

  it("ouverte avec lien : redirection vers le paiement, provenance en client_reference_id", async () => {
    ouvrir(LIEN);
    expect(await digest(() => precommande("forum"))).toContain(`;${LIEN}?client_reference_id=src-forum;`);
    expect(await digest(() => precommande())).toContain(`;${LIEN};`);
    expect(await digest(() => precommande("a b"))).toContain(`;${LIEN};`);
  });

  it("ouverte sans lien : « ouvre très bientôt », aucun lien de paiement", async () => {
    ouvrir();
    render(await precommande("forum"));
    expect(screen.getByRole("heading", { level: 1, name: "La précommande ouvre très bientôt" })).toBeInTheDocument();
    for (const lien of screen.getAllByRole("link")) expect(lien).toHaveAttribute("href", "/");
  });

  it("merci : n'affirme pas le paiement, ne promet aucun e-mail d'accès", () => {
    ouvrir(LIEN);
    render(PrecommandeMerciPage());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Si ton paiement a abouti/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sans démarche|e-mail d'accès|réponds à l'e-mail/);
  });

  it("merci : liens vers les pages légales seulement quand elles sont configurées", () => {
    ouvrir(LIEN);
    const { unmount } = render(PrecommandeMerciPage());
    expect(screen.queryByRole("navigation", { name: "Informations légales" })).not.toBeInTheDocument();
    unmount();
    vendeur();
    render(PrecommandeMerciPage());
    for (const href of Object.keys(LIENS_LEGAUX)) {
      expect(screen.getAllByRole("link").filter((lien) => lien.getAttribute("href") === href)).toHaveLength(1);
    }
  });
});
