import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionSuivie, ModeleLancementP0 } from "@/contracts/prototype-suivi";
import { LancementP0 } from "@/features/prototype/LancementP0";
import * as messages from "@/i18n/messages";
import { CODES_ARRET, PHASES } from "@/prototype/arret";

/**
 * Interface de la page de lancement (P0r3d ; revue du head `193603d`, bloquants 3 à 5 et mineurs 8 à 14 ; forme :
 * décision 0064) : annonces `status` et `alert`, choix incomplet relié aux choix et focus, « Actualiser » sans
 * rechargement, tableau et texte du rapport focalisables, message de copie lié au rapport copié.
 */

const t = messages.prototype.lancement;

const d = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));

vi.mock("@/server/actions/p0-lancement", () => ({ lancerExecutionP0Action: (...args: unknown[]) => d.action(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: d.refresh }) }));

const execution = (champs: Partial<ExecutionSuivie> = {}): ExecutionSuivie => ({
  id: "11111111-1111-4111-8111-111111111111",
  mode: "reel",
  brief: "edimbourg-1.json",
  variante: "B",
  statut: "arretee",
  phase: null,
  codeArret: "pipeline_failed",
  coutModelesMicros: null,
  ecouleMs: null,
  jourQuota: "2026-10-15",
  canaryOk: null,
  commitSha: "a".repeat(40),
  ...champs,
});

const modele = (texte = "Rapport A"): ModeleLancementP0 => ({
  briefs: ["edimbourg-1.json", "edimbourg-2.json"],
  suivi: { executions: [execution()], dernierePurge: null },
  decompte: [{ brief: "edimbourg-1.json", variante: "B", comptees: 1, compteesMax: 2, relances: 0, relancesMax: 1 }],
  rapport: { execution: execution(), criteres: { A1: "non", A2: "non", A3: "non", A4: "non", A5: "non", A6: "non", A7: "non_releve", A8: "non_releve", A9: "non_releve" }, texte },
});

const groupe = (nom: string) => screen.getByRole("radiogroup", { name: nom });

function choisir(choix: readonly string[] = ["edimbourg-1.json", t.formulaire.variantes.B, t.formulaire.modes.essai]) {
  for (const nom of choix) fireEvent.click(screen.getByRole("radio", { name: nom }));
}

async function lancer(choix?: readonly string[]) {
  choisir(choix);
  const bouton = screen.getByRole("button", { name: t.formulaire.lancer });
  bouton.focus();
  await act(async () => {
    fireEvent.click(bouton);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("p0: interface de la page de lancement", () => {
  it("libellés des phases et des causes d'arrêt : un par valeur des listes fermées de S4, rien de plus", () => {
    expect(Object.keys(t.suivi.phases)).toEqual([...PHASES]);
    expect(Object.keys(t.suivi.codesArret)).toEqual([...CODES_ARRET]);
  });

  it("régions d'annonce présentes dès l'affichage, vides ; aucun choix invalide", () => {
    render(<LancementP0 modele={modele()} />);
    const statuts = screen.getAllByRole("status");
    expect(statuts).toHaveLength(2);
    for (const region of statuts) expect(region).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    // Trois SegmentedControl Ligne verticaux, nommés par leur titre, sans option choisie ni validation native.
    for (const nom of [t.formulaire.brief, t.formulaire.variante, t.formulaire.mode]) {
      expect(groupe(nom)).toHaveAttribute("aria-orientation", "vertical");
      expect(groupe(nom)).not.toHaveAttribute("aria-invalid");
    }
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(document.querySelectorAll("input[required], input[type=radio]")).toHaveLength(0);
  });

  it("choix transmis à l'action par les champs cachés brief, variante et mode", async () => {
    d.action.mockResolvedValue({ statut: "lancee" });
    render(<LancementP0 modele={modele()} />);
    await lancer(["edimbourg-2.json", t.formulaire.variantes.A, t.formulaire.modes.reel]);
    const donnees = d.action.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(donnees.entries())).toEqual({ brief: "edimbourg-2.json", variante: "A", mode: "reel" });
  });

  it("lancement accepté : annoncé par `status`, rien dans `alert`", async () => {
    d.action.mockResolvedValue({ statut: "lancee" });
    render(<LancementP0 modele={modele()} />);
    await lancer();
    expect(d.action).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(t.statuts.lancee);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("refus : annoncé par `alert`, jamais par `status` ; le focus reste sur le bouton", async () => {
    d.action.mockResolvedValue({ statut: "daily_quota_insufficient" });
    render(<LancementP0 modele={modele()} />);
    await lancer();
    expect(screen.getByRole("alert")).toHaveTextContent(t.statuts.daily_quota_insufficient);
    for (const region of screen.getAllByRole("status")) expect(region).toBeEmptyDOMElement();
    for (const nom of [t.formulaire.brief, t.formulaire.variante, t.formulaire.mode]) expect(groupe(nom)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: t.formulaire.lancer })).toHaveFocus();
    // Choix gardés après le refus (composants contrôlés ; React 19 réinitialise le formulaire après l'action).
    expect(screen.getByRole("radio", { name: "edimbourg-1.json" })).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector<HTMLInputElement>('input[name="brief"]')?.value).toBe("edimbourg-1.json");
  });

  it("choix incomplet : envoyé tel quel, refus `entree_invalide` relié aux seuls groupes vides ; focus sur le premier", async () => {
    d.action.mockResolvedValue({ statut: "entree_invalide" });
    render(<LancementP0 modele={modele()} />);
    await lancer([t.formulaire.variantes.B]);
    expect(d.action).toHaveBeenCalledTimes(1);
    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent(t.statuts.entree_invalide);
    for (const nom of [t.formulaire.brief, t.formulaire.mode]) {
      expect(groupe(nom)).toHaveAttribute("aria-invalid", "true");
      expect(groupe(nom)).toHaveAttribute("aria-describedby", alerte.id);
    }
    expect(groupe(t.formulaire.variante)).not.toHaveAttribute("aria-invalid");
    expect(groupe(t.formulaire.brief)).toHaveFocus();
    // Un groupe rempli depuis le refus n'est plus signalé.
    fireEvent.click(screen.getByRole("radio", { name: "edimbourg-1.json" }));
    expect(groupe(t.formulaire.brief)).not.toHaveAttribute("aria-invalid");
    expect(groupe(t.formulaire.mode)).toHaveAttribute("aria-invalid", "true");
  });

  it("choix complet refusé `entree_invalide` (brief plus admis) : le groupe du brief est signalé et reçoit le focus", async () => {
    d.action.mockResolvedValue({ statut: "entree_invalide" });
    render(<LancementP0 modele={modele()} />);
    await lancer();
    expect(groupe(t.formulaire.brief)).toHaveAttribute("aria-invalid", "true");
    expect(groupe(t.formulaire.variante)).not.toHaveAttribute("aria-invalid");
    expect(groupe(t.formulaire.brief)).toHaveFocus();
    // Texte distinct : tout est choisi, le brief est refusé (pas « choix incomplet »).
    expect(screen.getByRole("alert")).toHaveTextContent(t.formulaire.briefRefuse);
    expect(screen.getByRole("alert")).not.toHaveTextContent(t.statuts.entree_invalide);
  });

  it("pendant un nouvel envoi, aucun groupe n'est signalé avant la réponse (refus rattaché à l'envoi qui l'a reçu)", async () => {
    d.action.mockResolvedValueOnce({ statut: "entree_invalide" });
    render(<LancementP0 modele={modele()} />);
    await lancer([t.formulaire.variantes.B]);
    expect(screen.getByRole("alert")).toHaveTextContent(t.statuts.entree_invalide);
    let repondre: (etat: { statut: string }) => void = () => undefined;
    d.action.mockReturnValueOnce(new Promise((resolve) => (repondre = resolve)));
    await lancer(["edimbourg-1.json", t.formulaire.modes.essai]);
    expect(d.action).toHaveBeenCalledTimes(2);
    for (const nom of [t.formulaire.brief, t.formulaire.variante, t.formulaire.mode]) expect(groupe(nom)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent(t.statuts.entree_invalide);
    await act(async () => repondre({ statut: "lancee" }));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(t.statuts.lancee);
  });

  it("« Actualiser » : bouton qui relit la page côté serveur, sans lien ni rechargement", () => {
    render(<LancementP0 modele={modele()} />);
    expect(screen.queryByRole("link", { name: t.suivi.actualiser })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.suivi.actualiser }));
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it("titres de section, titre de chaque exécution, tableau légendé et régions défilantes focalisables", () => {
    render(<LancementP0 modele={modele()} />);
    for (const titre of [t.formulaire.titre, t.suivi.titre, t.decompte.titre, t.rapport.titreSection]) {
      expect(screen.getByRole("heading", { level: 2, name: titre })).toHaveClass("text-section", "font-extrabold");
    }
    expect(screen.getByRole("heading", { level: 3, name: "edimbourg-1.json, variante B, jour du 15 octobre 2026" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: t.decompte.caption })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: t.decompte.caption })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: t.rapport.texteAria })).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(t.suivi.codesArret.pipeline_failed)).toBeInTheDocument();
    expect(screen.queryByText("pipeline_failed")).not.toBeInTheDocument();
  });

  it("copie : annoncée, puis effacée quand le rapport change", async () => {
    const ecrire = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: ecrire }, configurable: true });
    const { rerender } = render(<LancementP0 modele={modele("Rapport A")} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.rapport.copier }));
    });
    expect(ecrire).toHaveBeenCalledWith("Rapport A");
    expect(screen.getAllByRole("status")[1]).toHaveTextContent(t.rapport.copie);
    rerender(<LancementP0 modele={modele("Rapport B")} />);
    expect(screen.getAllByRole("status")[1]).toBeEmptyDOMElement();
  });
});
