import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/contracts";
import { exportAccount } from "@/server/actions/compte";

import { demanderExport, enregistrerFichier, NOM_DE_REPLI } from "./export-client";

vi.mock("@/server/actions/compte", () => ({ exportAccount: vi.fn() }));

/**
 * Côté navigateur de « Exporter mes données » (M9c, ticket 1122 ; spécification M9 § 6.4, critères 3 et 10) : action
 * `exportAccount` en double.
 */

const NOM = "vadrouille-mes-donnees-2026-11-09.json";

beforeEach(() => {
  vi.mocked(exportAccount).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("demanderExport", () => {
  it("fichier rendu par l'action, à son nom", async () => {
    vi.mocked(exportAccount).mockResolvedValueOnce(ok({ fileName: NOM, content: "{}\n" }));
    const issue = await demanderExport();
    expect(exportAccount).toHaveBeenCalledExactlyOnceWith();
    if (issue.kind !== "fichier") throw new Error("fichier attendu");
    expect(issue.nom).toBe(NOM);
    expect(await issue.contenu.text()).toBe("{}\n");
    expect(issue.contenu.type).toBe("application/json");
  });

  it.each(["autre.json", "../vadrouille-mes-donnees-2026-11-09.json", "vadrouille-mes-donnees-2026-11-09.json.exe", ""])("nom inattendu (%s) : nom de repli", async (fileName) => {
    vi.mocked(exportAccount).mockResolvedValueOnce(ok({ fileName, content: "{}\n" }));
    const issue = await demanderExport();
    if (issue.kind !== "fichier") throw new Error("fichier attendu");
    expect(issue.nom).toBe(NOM_DE_REPLI);
  });

  it.each([
    ["reauthentication_required", "reauthentification"],
    ["unauthenticated", "session"],
    ["rate_limited", "limite"],
    ["forbidden", "erreur"],
    ["internal", "erreur"],
    ["not_found", "erreur"],
  ] as const)("%s : %s", async (code, kind) => {
    vi.mocked(exportAccount).mockResolvedValueOnce(fail(code));
    expect(await demanderExport()).toEqual({ kind });
  });

  it("erreur de réseau de l'action : erreur, sans exception", async () => {
    vi.mocked(exportAccount).mockRejectedValueOnce(new Error("réseau"));
    expect(await demanderExport()).toEqual({ kind: "erreur" });
  });
});

describe("enregistrerFichier", () => {
  it("lien de téléchargement au nom du fichier, cliqué puis retiré ; l'adresse en mémoire est libérée ensuite", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:fichier");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clics: { href: string; download: string }[] = [];
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clics.push({ href: this.href, download: this.download });
    });
    const contenu = new Blob(["{}"]);
    enregistrerFichier(NOM, contenu);
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(contenu);
    expect(clics).toEqual([{ href: "blob:fichier", download: NOM }]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:fichier");
    clic.mockRestore();
  });
});
