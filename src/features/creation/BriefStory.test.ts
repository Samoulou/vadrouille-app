import { describe, expect, it } from "vitest";

import { STORY_LENGTH } from "@/contracts/values";

import { hasIdea, removePhrase, toggleIdea, type Idea } from "./BriefStory";

/** Idées du récit (décision 0134 § 3) : ajout en fin de récit, retrait sans toucher au reste, groupe exclusif, plafond. */
const DEUX: Idea = { label: "À deux", phrase: "On part à deux.", groupe: "qui" };
const FAMILLE: Idea = { label: "En famille", phrase: "On part en famille, avec des enfants.", groupe: "qui" };
const TABLES: Idea = { label: "Bonnes tables", phrase: "On aime bien manger, surtout la cuisine locale." };
const IDEES = [DEUX, FAMILLE, TABLES];

describe("toggleIdea", () => {
  it("ajoute la phrase seule dans un récit vide, après une espace sinon, sans espace en trop après un blanc final", () => {
    expect(toggleIdea("", DEUX)).toBe("On part à deux.");
    expect(toggleIdea("  ", DEUX)).toBe("On part à deux.");
    expect(toggleIdea("On aime marcher.", DEUX)).toBe("On aime marcher. On part à deux.");
    expect(toggleIdea("On aime marcher.\n", DEUX)).toBe("On aime marcher.\nOn part à deux.");
  });

  it("retire la phrase et l'espace qui la sépare, sans toucher au reste du récit", () => {
    expect(toggleIdea("On aime marcher. On part à deux. Pas de musées.", DEUX)).toBe("On aime marcher. Pas de musées.");
    expect(toggleIdea("On part à deux. Pas de musées.", DEUX)).toBe("Pas de musées.");
    // Récit sur plusieurs lignes, doubles espaces saisis : gardés tels quels.
    const recit = "Premier jour  calme.\nOn part à deux.\nPuis la mer.";
    expect(toggleIdea(recit, DEUX)).toBe("Premier jour  calme.\n\nPuis la mer.");
  });

  it("phrase présente deux fois : une touche en retire une, l'idée reste choisie", () => {
    const recit = "On part à deux. Oui, on part à deux.";
    const apres = toggleIdea(recit, DEUX);
    expect(apres).toBe("Oui, on part à deux.");
    expect(removePhrase("On part à deux. On part à deux.", DEUX.phrase)).toBe("On part à deux.");
    expect(hasIdea(removePhrase("On part à deux. On part à deux.", DEUX.phrase), DEUX.phrase)).toBe(true);
  });

  it("idées d'un même groupe exclusives : « En famille » remplace « À deux », les autres idées restent", () => {
    const recit = "On part à deux. On aime bien manger, surtout la cuisine locale.";
    expect(toggleIdea(recit, FAMILLE, IDEES)).toBe("On aime bien manger, surtout la cuisine locale. On part en famille, avec des enfants.");
    expect(toggleIdea(recit, TABLES, IDEES)).toBe("On part à deux.");
  });

  it("n'ajoute rien si le récit dépasserait le plafond", () => {
    const plein = "a".repeat(STORY_LENGTH.max - 5);
    expect(toggleIdea(plein, DEUX)).toBe(plein);
  });
});
