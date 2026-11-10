import { expect, type APIResponse, type Page } from "@playwright/test";

import { sheet } from "./sejour-helpers";

/** Voyage débloqué du jeu simulé (J6 en préparation, un engagement, des événements et des idées). */
export const ED_OK = "mock_trip_edimbourg_debloque";
/** Même voyage, non débloqué. */
export const ED = "mock_trip_edimbourg";

/** Adresse du fichier `.ics` (même forme que `calendrierRoute`, décision 0157 § 1.6 point 1). */
export const calendrier = (id: string) => `/api/v1/voyages/${id}/calendrier`;

/** Lien « Ajouter au calendrier » du Séjour. */
export const lienCalendrier = (page: Page) => sheet(page).getByRole("link", { name: "Ajouter au calendrier", exact: true });

export type Evenement = Record<string, string[]>;

/** Relecture du fichier : dépliage (RFC 5545 § 3.1), puis propriétés de chaque `VEVENT` (valeurs brutes). */
export function evenementsIcs(ics: string): Evenement[] {
  const logiques: string[] = [];
  for (const ligne of ics.split("\r\n")) {
    if (ligne.startsWith(" ")) logiques[logiques.length - 1] += ligne.slice(1);
    else if (ligne !== "") logiques.push(ligne);
  }
  const evenements: Evenement[] = [];
  let courant: Evenement | null = null;
  for (const ligne of logiques) {
    if (ligne === "BEGIN:VEVENT") courant = {};
    else if (ligne === "END:VEVENT") {
      if (courant) evenements.push(courant);
      courant = null;
    } else if (courant) {
      const i = ligne.indexOf(":");
      const nom = ligne.slice(0, i).split(";")[0] ?? "";
      (courant[nom] ??= []).push(ligne.slice(i + 1));
    }
  }
  return evenements;
}

/** Déséchappement d'une valeur `TEXT` (RFC 5545 § 3.3.11). */
export const texteIcs = (valeur: string) => valeur.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

/** En-têtes du fichier (spécification M6 § 4 point 6 ; décision 0157 § 2.5, S5) et début `BEGIN:VCALENDAR`, `VERSION:2.0`. */
export async function expectFichierIcs(reponse: APIResponse): Promise<string> {
  expect(reponse.status()).toBe(200);
  const entetes = reponse.headers();
  expect(entetes["content-type"]).toBe("text/calendar; charset=utf-8");
  expect(entetes["content-disposition"]).toBe('attachment; filename="programme.ics"');
  expect(entetes["cache-control"]).toMatch(/\bprivate\b/);
  expect(entetes["cache-control"]).toMatch(/\bno-store\b/);
  expect(entetes["x-content-type-options"]).toBe("nosniff");
  const texte = await reponse.text();
  expect(texte.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  expect(texte.endsWith("END:VCALENDAR\r\n")).toBe(true);
  // Aucune donnée Google (§ 4 point 5) : ni lieu, ni position, ni hôte Google.
  expect(texte).not.toMatch(/^(LOCATION|GEO)[;:]/m);
  expect(texte.toLowerCase()).not.toContain("google.");
  return texte;
}
