import { CLES_PROGRAMME_ECRIT, placeIdsDuProgramme, type ProgrammeEcrit, type ProgrammeReduit, ProgrammeReduitSchema } from "@/prototype/programme-reduit";

/**
 * Découpage du programme réduit pour la base du prototype (décision 0046, D15 point 1 ; Q324, option a) : le contenu
 * est écrit **sans** `positions` dans `prototype.programmes` ; les positions vont dans le seul cache
 * `public.place_coordinates` (écriture : décision 0052). P0r4 recompose à la lecture ; une position absente ou
 * expirée fait rendre l'état d'erreur existant (D15 point 9) : un programme incomplet n'est jamais servi.
 *
 * Module pur : aucune base, aucune lecture d'environnement. Les positions ne sont rendues qu'à l'appelant, jamais
 * journalisées ni écrites dans un fichier (S6).
 */

export type ContenuProgramme = ProgrammeEcrit;
export type PositionLieu = { readonly lat: number; readonly lng: number };

/** Clés de premier niveau du contenu écrit en base, égales au `CHECK` de `prototype.programmes`. */
export const CLES_CONTENU = CLES_PROGRAMME_ECRIT;

/** Sépare le contenu (sans positions) des positions, par `placeId`. */
export function decouperProgramme(programme: ProgrammeReduit): { readonly contenu: ContenuProgramme; readonly positions: ReadonlyMap<string, PositionLieu> } {
  // Champs nommés un à un (pas de reste d'objet) : le contenu ne peut porter que les clés de `CLES_CONTENU`.
  const contenu: ContenuProgramme = { schema: programme.schema, trip: programme.trip, proposals: programme.proposals, terminus: programme.terminus };
  return { contenu, positions: new Map(Object.entries(programme.positions).map(([placeId, p]) => [placeId, { lat: p.lat, lng: p.lng }])) };
}

export type Recomposition = { readonly ok: true; readonly programme: ProgrammeReduit } | { readonly ok: false };

/**
 * Recompose un programme à partir de son contenu lu en base et des positions lues dans le cache. Refus (`ok: false`)
 * si le contenu porte déjà des positions ou une clé inconnue, si une position manque, ou si le programme recomposé ne
 * passe pas `ProgrammeReduitSchema`.
 */
export function recomposerProgramme(contenu: unknown, lirePosition: (placeId: string) => PositionLieu | undefined): Recomposition {
  if (typeof contenu !== "object" || contenu === null || Array.isArray(contenu)) return { ok: false };
  if (Object.keys(contenu).some((cle) => !(CLES_CONTENU as readonly string[]).includes(cle))) return { ok: false };
  let attendus: Set<string>;
  try {
    attendus = placeIdsDuProgramme(contenu as ContenuProgramme);
  } catch {
    return { ok: false };
  }
  const entrees: [string, PositionLieu][] = [];
  for (const placeId of attendus) {
    const position = lirePosition(placeId);
    if (position === undefined) return { ok: false };
    entrees.push([placeId, { lat: position.lat, lng: position.lng }]);
  }
  const resultat = ProgrammeReduitSchema.safeParse({ ...contenu, positions: Object.fromEntries(entrees) });
  return resultat.success ? { ok: true, programme: resultat.data } : { ok: false };
}
