import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DevEtatsErreurPage, {
  dynamic as erreurDynamic,
  metadata as erreurMetadata,
} from "@/app/dev/etats/erreur/page";
import DevEtatsPage, { dynamic as etatsDynamic, metadata as etatsMetadata } from "@/app/dev/etats/page";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound, { metadata as notFoundMetadata } from "@/app/not-found";
import { PRODUCT_NAME } from "@/config/site";
import { DEV_ERROR_MESSAGE, ETATS_ROUTES, EtatsShowcase } from "@/dev/EtatsShowcase";
import { messages } from "@/i18n";

import { axeViolations } from "./axe";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => router,
}));

// `next/font/google` n'existe qu'au build de Next : la police est remplacée par sa seule classe.
vi.mock("@/app/fonts", () => ({ hankenGrotesk: { variable: "police-hanken" } }));

/** Spécification F11, critères [c] (C29 à C32), décision 0021 § 7 et § 8. */

const t = messages.etats;
/** Erreur injectée : son message contient un identifiant factice, qui ne doit apparaître nulle part. */
const FAKE_ID = "mock_trip_secret_7f3a";
const injected = Object.assign(new Error(`Échec de lecture du voyage ${FAKE_ID}`), { digest: "digest-1234" });

beforeEach(() => {
  router.refresh.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("page introuvable (not-found.tsx)", () => {
  it("titre, texte et lien « Retour à l'accueil » vers /, rien d'autre", async () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Page introuvable$/);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText("Cette page n'existe pas ou n'est plus disponible.")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Retour à l'accueil");
    expect(links[0]).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("titre du document « Page introuvable · {nom du produit} », par metadata et par l'élément <title>", () => {
    expect(notFoundMetadata.title).toBe(`Page introuvable · ${PRODUCT_NAME}`);
    render(<NotFound />);
    expect(document.querySelector("title")).toHaveTextContent(`Page introuvable · ${PRODUCT_NAME}`);
  });
});

describe("page d'erreur (error.tsx)", () => {
  it("titre, texte, « Réessayer » et « Retour à l'accueil » ; aucun texte de l'erreur reçue", async () => {
    const { container } = render(<ErrorPage error={injected} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Cette page n'a pas pu s'afficher$/);
    expect(
      screen.getByText("Réessaie dans un instant. Si le problème continue, reviens à l'accueil."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
    expect(document.body.innerHTML).not.toContain(FAKE_ID);
    expect(document.body.innerHTML).not.toContain("digest-1234");
    expect(document.body.innerHTML).not.toContain(injected.message);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("titre du document par l'élément <title>", () => {
    render(<ErrorPage error={injected} reset={vi.fn()} />);
    expect(document.querySelector("title")).toHaveTextContent(`Cette page n'a pas pu s'afficher · ${PRODUCT_NAME}`);
  });

  it("« Réessayer » redemande le rendu au serveur puis efface l'erreur", () => {
    const reset = vi.fn();
    render(<ErrorPage error={injected} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("ne journalise rien de l'erreur reçue", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    render(<ErrorPage error={injected} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("page d'erreur globale (global-error.tsx)", () => {
  function markup() {
    return renderToStaticMarkup(<GlobalError error={injected} reset={vi.fn()} />);
  }

  it("son propre document en français, avec la police, sans avertissement d'imbrication", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = markup();
    expect(html).toMatch(/^<html lang="fr" class="police-hanken">/);
    expect(html).toContain("<body");
    expect(errors).not.toHaveBeenCalled();
  });

  it("les mêmes textes que error.tsx, sans rien de l'erreur reçue", () => {
    const html = markup();
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe(t.erreur.titre);
    expect(doc.body.textContent).toContain(t.erreur.texte);
    expect([...doc.querySelectorAll("button")].map((b) => b.textContent)).toEqual([t.erreur.reessayer]);
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(doc.querySelector("a")?.textContent).toBe(t.accueil);
    expect(doc.querySelector("title")?.textContent).toBe(`${t.erreur.titre} · ${PRODUCT_NAME}`);
    expect(html).not.toContain(FAKE_ID);
    expect(html).not.toContain("digest-1234");
  });
});

describe("/dev/etats (catalogue des états)", () => {
  it("répond 404 en production sans VADROUILLE_DEV_PAGES", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    expect(() => DevEtatsPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("s'affiche avec le drapeau, rendue à chaque requête, jamais indexée", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    render(DevEtatsPage());
    expect(screen.getByRole("heading", { level: 1, name: t.catalogue.titre })).toBeInTheDocument();
    expect(etatsDynamic).toBe("force-dynamic");
    expect(etatsMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("montre chaque état sous son titre, avec le texte de fr.json", async () => {
    const { container } = render(<EtatsShowcase />);
    const section = (name: string) => screen.getByRole("region", { name });
    const s = t.catalogue.sections;

    expect(within(section(s.toConfirm)).getByText("À confirmer")).toBeInTheDocument();
    expect(within(section(s.unconfirmed)).getByText("Non confirmé")).toBeInTheDocument();

    const banners: [string, string, string][] = [
      [s.offline, "offline", messages.dev.composants.exemples.bandeaux.offline],
      [s.conflict, "conflict", messages.dev.composants.exemples.bandeaux.conflict],
      [s.noOption, "noOption", messages.dev.composants.exemples.bandeaux.noOption],
      [s.error, "error", "Les temps de trajet n'ont pas pu être recalculés. Ton programme précédent est conservé."],
      [s.generating, "generating", "Jour 3 en préparation"],
      [s.travel, "travel", "2 h 40 de trajet ce jour, au-delà des 2 h 30 prévues pour ton rythme."],
    ];
    for (const [title, kind, text] of banners) {
      const banner = section(title).querySelector(`[data-kind='${kind}']`);
      expect(banner, kind).not.toBeNull();
      expect(banner).toHaveTextContent(text);
    }
    expect(screen.getAllByText(t.catalogue.exemple)).toHaveLength(3);
    for (const title of [s.offline, s.conflict, s.noOption]) {
      expect(within(section(title)).getByText(t.catalogue.exemple)).toBeInTheDocument();
    }

    expect(within(section(s.introuvable)).getByRole("link", { name: t.catalogue.liens.introuvable })).toHaveAttribute(
      "href",
      ETATS_ROUTES.introuvable,
    );
    expect(within(section(s.erreur)).getByRole("link", { name: t.catalogue.liens.erreur })).toHaveAttribute(
      "href",
      "/dev/etats/erreur",
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("le bandeau d'erreur de calcul a sa clé propre, etats.erreurCalcul (redaction.md)", () => {
    expect(t.erreurCalcul).toBe("Les temps de trajet n'ont pas pu être recalculés. Ton programme précédent est conservé.");
  });

  it("ne rend pas encore l'état vide de Mes voyages (F11a, décision 0021 § 8)", () => {
    render(<EtatsShowcase />);
    expect(screen.queryByRole("region", { name: "Aucun voyage" })).not.toBeInTheDocument();
  });
});

describe("/dev/etats/erreur (erreur volontaire)", () => {
  it("répond 404 en production sans VADROUILLE_DEV_PAGES, sans lever l'erreur", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    expect(() => DevEtatsErreurPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("lève son erreur avec le drapeau, rendue à chaque requête, jamais indexée", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    expect(() => DevEtatsErreurPage()).toThrow(DEV_ERROR_MESSAGE);
    expect(DEV_ERROR_MESSAGE).toContain(FAKE_ID);
    expect(erreurDynamic).toBe("force-dynamic");
    expect(erreurMetadata.robots).toEqual({ index: false, follow: false });
  });
});
