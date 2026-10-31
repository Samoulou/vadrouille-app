/*
 * Place des étiquettes de ville (décision 0150 § 4), séparée de `route.ts` : seul `CityLabel`, chargé à la demande à
 * plusieurs villes (décision 0152 § 4), la lit.
 */

/** Boîte en pixels du conteneur de la carte (origine en haut à gauche). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CoteEtiquette = "droite" | "gauche";

/** Mesures de la règle de côté : écart au terminus (`space-1`) et marge au bord de la carte (`space-2`). */
export interface EcartsEtiquette {
  ecart: number;
  marge: number;
}

/**
 * Côté de l'étiquette de ville (décision 0150 § 4) : à droite si elle tient, sinon à gauche si elle y tient, sinon du côté
 * qui a le plus de place, avec une largeur maximale réduite à cette place. `x` est le bord droit du terminus.
 */
export function coteEtiquette(
  x: number,
  largeurTerminus: number,
  largeurEtiquette: number,
  largeurCarte: number,
  { ecart, marge }: EcartsEtiquette,
): { cote: CoteEtiquette; largeurMax?: number } {
  const droite = largeurCarte - marge - (x + ecart);
  const gauche = x - largeurTerminus - ecart - marge;
  if (largeurEtiquette <= droite) return { cote: "droite" };
  if (largeurEtiquette <= gauche) return { cote: "gauche" };
  return droite >= gauche ? { cote: "droite", largeurMax: Math.max(0, droite) } : { cote: "gauche", largeurMax: Math.max(0, gauche) };
}

export interface EtiquetteAPlacer {
  key: string;
  /** Boîte du terminus de la ville. */
  terminus: Box;
  largeur: number;
  hauteur: number;
  /** Décalages verticaux permis de chaque côté : 3 sur Séjour, 1 le jour du changement de ville. */
  decalagesMax: number;
}

export interface PlaceEtiquette {
  key: string;
  cote: CoteEtiquette;
  /** Décalage vertical depuis le centre du terminus, en pixels (positif vers le bas). */
  dy: number;
  largeurMax?: number;
  box: Box;
}

const recoupe = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Place des étiquettes de ville (décision 0150 § 4), dans l'ordre des villes : première place libre parmi (1) le côté de
 * `coteEtiquette`, (2) le côté opposé s'il tient, (3) le côté (1) décalé vers le bas d'une hauteur d'étiquette plus
 * l'écart, (4) vers le haut, puis deux hauteurs, trois…, jusqu'à `decalagesMax`. Une place est libre si elle reste dans la
 * carte et ne recoupe ni une étiquette déjà placée ni un obstacle (terminus, marqueurs d'étape, « Retour », « Partager ») ;
 * sans place libre, la place (1) est gardée.
 */
export function placerEtiquettes(
  obstacles: readonly Box[],
  etiquettes: readonly EtiquetteAPlacer[],
  taille: { width: number; height: number },
  ecarts: EcartsEtiquette,
): PlaceEtiquette[] {
  const placees: PlaceEtiquette[] = [];
  for (const etiquette of etiquettes) {
    const { terminus, hauteur } = etiquette;
    const premier = coteEtiquette(terminus.x + terminus.width, terminus.width, etiquette.largeur, taille.width, ecarts);
    const place = (cote: CoteEtiquette, dy: number, largeurMax?: number): PlaceEtiquette => {
      const width = Math.min(etiquette.largeur, largeurMax ?? Number.POSITIVE_INFINITY);
      const x = cote === "droite" ? terminus.x + terminus.width + ecarts.ecart : terminus.x - ecarts.ecart - width;
      const y = terminus.y + terminus.height / 2 - hauteur / 2 + dy;
      return { key: etiquette.key, cote, dy, ...(largeurMax === undefined ? {} : { largeurMax }), box: { x, y, width, height: hauteur } };
    };
    const opposee: CoteEtiquette = premier.cote === "droite" ? "gauche" : "droite";
    const pas = hauteur + ecarts.ecart;
    const candidates = [place(premier.cote, 0, premier.largeurMax), place(opposee, 0)];
    for (let k = 1; k <= etiquette.decalagesMax; k += 1) {
      candidates.push(place(premier.cote, k * pas, premier.largeurMax), place(premier.cote, -k * pas, premier.largeurMax));
    }
    const dansLaCarte = (box: Box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= taille.width && box.y + box.height <= taille.height;
    const libre = candidates.find(
      (candidate) =>
        dansLaCarte(candidate.box) &&
        !obstacles.some((obstacle) => recoupe(obstacle, candidate.box)) &&
        !placees.some((autre) => recoupe(autre.box, candidate.box)),
    );
    placees.push(libre ?? candidates[0]!);
  }
  return placees;
}
