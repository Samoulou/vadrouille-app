// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * P0r4 (`specs/P0-suite-2.md`, « P0r4 », test imposé) et S6 de 0046 : les positions des programmes réels (lues dans
 * `place_coordinates`, données Google) ne sont **affichées que sur la carte Google**, et les écrans du prototype portent
 * la mention « Données de lieux : Google » hors de la carte. Contrôle statique de l'interface :
 * - seuls les modules de carte (`src/components/carte/`) et le relais du partage (`SharedShell.tsx`, adaptateur `mock`
 *   seulement) lisent une latitude ou une longitude ;
 * - la carte **simulée** (non Google) n'est montée que par les pages de développement, qui refusent l'adaptateur
 *   `prototype` (404) ou ne lisent que le voyage simulé ;
 * - le Séjour et la Journée passent `placesFromGoogle={isPrototypeAdapter()}` (mention hors carte) ; le partage, ouvert
 *   à l'adaptateur `mock` seulement, n'en a pas besoin.
 */

const RACINE = process.cwd();

function fichiers(dossier: string): string[] {
  const resultat: string[] = [];
  for (const nom of readdirSync(path.join(RACINE, dossier))) {
    const relatif = `${dossier}/${nom}`;
    if (statSync(path.join(RACINE, relatif)).isDirectory()) resultat.push(...fichiers(relatif));
    else if (/\.(ts|tsx)$/.test(nom) && !/\.(test|spec)\.(ts|tsx)$/.test(nom)) resultat.push(relatif);
  }
  return resultat;
}

const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), "utf8");

/** Interface : pages, écrans, composants (hors couches de données, du serveur et des modules de P0). */
const INTERFACE = [...fichiers("src/app"), ...fichiers("src/features"), ...fichiers("src/components")];

const LIT_COORDONNEES = /\.(lat|lng)\b|\b(lat|lng)\s*:/;

describe("affichage: positions Google seulement sur la carte Google ou avec la mention", () => {
  it("seuls les modules de carte (et le relais du partage) lisent une position", () => {
    const lecteurs = INTERFACE.filter((f) => LIT_COORDONNEES.test(lire(f)));
    expect(lecteurs.filter((f) => !f.startsWith("src/components/carte/") && f !== "src/features/partage/SharedShell.tsx")).toEqual([]);
    expect(lecteurs).toContain("src/components/carte/GoogleMapRenderer.tsx");
  });

  it("carte simulée (non Google) : montée par les seules pages de développement, jamais avec l'adaptateur prototype", () => {
    const montent = INTERFACE.filter((f) => /SimulatedMapRenderer|SimulatedCarte/.test(lire(f)) && !f.startsWith("src/components/carte/"));
    expect(montent.every((f) => f.startsWith("src/app/dev/"))).toBe(true);
    // Pages du voyage de développement : 404 avec l'adaptateur prototype.
    expect(lire("src/app/dev/voyages/[id]/layout.tsx")).toMatch(/if \(!devPagesEnabled\(\) \|\| isPrototypeAdapter\(\)\) notFound\(\);/);
    // Démonstration de la carte : voyage simulé seulement (introuvable avec l'adaptateur prototype : autre organisation).
    expect(lire("src/app/dev/carte/page.tsx")).toContain("MOCK_DEMO_TRIP");
  });

  it("Séjour et Journée des voyages : mention « Données de lieux : Google » avec l'adaptateur prototype", () => {
    expect(lire("src/features/sejour/screens.tsx")).toContain("placesFromGoogle={isPrototypeAdapter()}");
    expect(lire("src/components/carte/PlacesAttribution.tsx")).toContain("Données de lieux : Google");
  });
});
