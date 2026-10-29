import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Day, Result, Stop } from "@/contracts";
import * as messages from "@/i18n/messages";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { findFicheTarget } from "./fiche";
import { ReportSheet, type EnvoiSignalement } from "./ReportSheet";
import { tripRoutes } from "./routes";
import { StopSheet } from "./StopSheet";

vi.mock("@/server/actions/retouches", () => ({ reportStop: vi.fn(async () => ({ ok: true, value: null })) }));

/**
 * « Signaler une erreur » (tâche M5c ; spécification M5 § 5 et critères 12, 18 et 33 ; décision 0147 § 1) : bouton de la
 * fiche, feuille modale à cinq motifs fermés sans texte libre, refus sans motif, envoi, plafond, confirmation et lien
 * « Remplacer cette étape ».
 */

const t = messages.sejour.signaler;
const routes = tripRoutes("/voyages", edimbourg.id);
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;
const etape = (n: number, stopId: string): Stop => findFicheTarget(day(n), stopId)!.stop;
const REQUETE = "0d000000-0000-4000-8000-0000000000cc";

function renderSheet(report: EnvoiSignalement = vi.fn(async (): Promise<Result<null>> => ({ ok: true, value: null }))) {
  const onReported = vi.fn();
  const onReturnFocus = vi.fn();
  const onOpenChange = vi.fn();
  const result = render(
    <ReportSheet
      open
      onOpenChange={onOpenChange}
      tripId={edimbourg.id}
      stop={etape(2, "j2-dean-village")}
      onReported={onReported}
      onReturnFocus={onReturnFocus}
      report={report}
      newRequestId={() => REQUETE}
    />,
  );
  return { ...result, report, onReported, onReturnFocus, onOpenChange };
}

const dialog = () => screen.getByRole("dialog");
const motifs = () => within(dialog()).getByRole("radiogroup", { name: t.titre });

describe("signalement: feuille", () => {
  it("signalement: motifs fermés, aucun texte : titre de niveau 1 avec le focus, cinq motifs dans l'ordre, aucun champ de texte", async () => {
    renderSheet();
    const titre = within(dialog()).getByRole("heading", { level: 1, name: t.titre });
    await waitFor(() => expect(titre).toHaveFocus());
    expect(within(motifs()).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Fermé ou n'existe plus",
      "Horaires faux",
      "Mauvais lieu ou mauvaise adresse",
      "Prix faux",
      "Autre erreur",
    ]);
    expect(within(motifs()).getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    expect(within(dialog()).queryByRole("textbox")).toBeNull();
    expect(dialog().querySelector("textarea, input")).toBeNull();
    expect(within(dialog()).getByRole("button", { name: t.envoyer })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: t.annuler })).toBeInTheDocument();
    expect(await axeViolations(dialog())).toEqual([]);
  });

  it("sans motif : « Choisis ce qui ne va pas. » (role alert), groupe invalide, rien n'est envoyé", async () => {
    const { report } = renderSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: t.envoyer }));
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(t.sansMotif);
    expect(motifs()).toHaveAttribute("aria-invalid", "true");
    expect(report).not.toHaveBeenCalled();
  });

  it("envoi : motif choisi, demande sans texte, puis feuille fermée et confirmation demandée", async () => {
    const { report, onReported, onOpenChange } = renderSheet();
    fireEvent.click(within(motifs()).getByRole("radio", { name: "Horaires faux" }));
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: t.envoyer }));
    });
    expect(report).toHaveBeenCalledWith({ tripId: edimbourg.id, stopId: "j2-dean-village", reason: "hours", requestId: REQUETE });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onReported).toHaveBeenCalledWith("hours");
  });

  it("plafond du jour : texte du § 9 (role alert), feuille ouverte ; autre échec : texte d'erreur", async () => {
    const report = vi
      .fn<EnvoiSignalement>()
      .mockResolvedValueOnce({ ok: false, error: { code: "rate_limited" } })
      .mockRejectedValueOnce(new Error("réseau"));
    const { onReported } = renderSheet(report);
    fireEvent.click(within(motifs()).getByRole("radio", { name: "Prix faux" }));
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: t.envoyer }));
    });
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(t.plafond);
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: t.envoyer }));
    });
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(t.erreur);
    // Même motif, même identifiant de demande : un nouvel essai est idempotent côté serveur.
    expect(report.mock.calls.map((appel) => (appel[0] as { requestId: string }).requestId)).toEqual([REQUETE, REQUETE]);
    expect(onReported).not.toHaveBeenCalled();
  });
});

describe("signalement: fiche", () => {
  function renderFiche(n: number, stopId: string, options: { overrides?: Partial<Stop>; reported?: { replaceHref: string | null } | null; onReport?: boolean } = {}) {
    const target = findFicheTarget(day(n), stopId)!;
    const onReport = vi.fn();
    render(
      <StopSheet
        stop={{ ...target.stop, ...options.overrides }}
        inProgramme={target.inProgramme}
        day={day(n)}
        routes={routes}
        onClose={vi.fn()}
        onToggleLock={vi.fn()}
        {...(options.onReport === false ? {} : { onReport })}
        reported={options.reported ?? null}
      />,
    );
    return { onReport };
  }

  it("« Signaler une erreur » après les autres actions, ouvre la feuille ; région de confirmation vide présente", () => {
    const { onReport } = renderFiche(2, "j2-dean-village");
    const actions = screen.getByRole("region", { name: messages.sejour.fiche.actions });
    const boutons = within(actions).getAllByRole("button");
    expect(boutons.at(-1)).toHaveTextContent(messages.sejour.fiche.signaler);
    expect(boutons.at(-1)).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(boutons.at(-1)!);
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("aussi sur une étape verrouillée ; jamais sur un engagement, un lieu à soi, un événement, ni sans adaptateur qui signale", () => {
    renderFiche(2, "j2-dean-village", { overrides: { locked: true } });
    expect(screen.getByRole("button", { name: messages.sejour.fiche.signaler })).toBeInTheDocument();
  });

  it.each([
    ["engagement", 1, "j1-tattoo", {}],
    ["lieu à soi", 2, "j2-dean-village", { addedBy: "person" as const }],
    ["événement", 2, "j2-concert-orgue", {}],
  ])("pas de bouton pour un %s", (_nom, n, stopId, overrides) => {
    renderFiche(n, stopId, { overrides });
    expect(screen.queryByRole("button", { name: messages.sejour.fiche.signaler })).toBeNull();
  });

  it("sans fonction de signalement (site d'essai) : pas de bouton", () => {
    renderFiche(2, "j2-dean-village", { onReport: false });
    expect(screen.queryByRole("button", { name: messages.sejour.fiche.signaler })).toBeNull();
  });

  it("signalement: motif closed propose Remplacer : confirmation « Merci, c'est noté. » avec le lien seulement s'il est donné", () => {
    const href = routes.remplacer(2, "j2-dean-village");
    renderFiche(2, "j2-dean-village", { reported: { replaceHref: href } });
    expect(screen.getByRole("status")).toHaveTextContent(t.merci);
    expect(screen.getByRole("link", { name: t.remplacer })).toHaveAttribute("href", href);
  });

  it("confirmation sans lien (autre motif, étape verrouillée ou voyage non débloqué)", () => {
    renderFiche(2, "j2-dean-village", { reported: { replaceHref: null } });
    expect(screen.getByRole("status")).toHaveTextContent(t.merci);
    expect(screen.queryByRole("link", { name: t.remplacer })).toBeNull();
  });
});
