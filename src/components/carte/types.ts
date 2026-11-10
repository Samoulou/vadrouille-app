import type { CityOverview, DayRoute, LatLng, Moitie } from "./route";

/** Marge de cadrage en pixels CSS, de chaque côté de la carte. */
export interface FitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Positions du cadrage d'une vue (décision 0150) et règle de la position seule (§ 3 bis : vue d'une ville ou journée d'un
 * changement de ville) ; sans plusieurs villes ni changement de ville, positions et règle d'aujourd'hui.
 */
export function fitTargetOf(view: MapView): { positions: LatLng[]; single: boolean } | null {
  if (view.mode === "day") {
    const moities = view.transferCities ? view.route.moities : undefined;
    if (!moities) return null;
    const half = view.moitie ? moities[view.moitie] : [];
    return { positions: half.length > 0 ? half : view.route.positions, single: true };
  }
  if (view.mode === "overview" && view.cities) {
    const city = view.cityView === undefined ? undefined : view.cities.cities.find((entry) => entry.city === view.cityView);
    return city ? { positions: city.positions, single: true } : { positions: view.cities.all, single: false };
  }
  return null;
}

/** Ce qu'un rendu (Google ou simulé) doit afficher, déjà calculé par `route.ts`. */
export type MapView =
  | {
      mode: "day";
      /** Change avec le jour affiché : seul ce changement recadre la carte. */
      fitKey: string;
      route: DayRoute;
      selectedStopId?: string;
      onMarkerPress?: (stopId: string) => void;
      fitPadding?: FitPadding;
      /** Partie de la carte couverte (panneau en bas) : le recentrage sur la sélection la place au milieu du reste. */
      visibleInsets?: FitPadding;
      /** `false` : marqueurs non interactifs (vue partagée, F10-TL-14) ; interactifs par défaut. */
      interactive?: boolean;
      /**
       * Journée d'un changement de ville (décision 0150 § 3) : villes quittée et d'arrivée, qui nomment les deux terminus
       * et leurs étiquettes. Absent un jour ordinaire.
       */
      transferCities?: { de: string; vers: string };
      /** Moitié cadrée (décision 0150 § 3 point 4) ; absente : toute la journée. Elle entre dans `fitKey`. */
      moitie?: Moitie;
    }
  | {
      mode: "overview";
      fitKey: string;
      rings: LatLng[];
      fitPadding?: FitPadding;
      /**
       * Voyage à 2 villes ou plus (décision 0150 § 2) : repères, anneaux par ville et positions par ville ; `rings` est
       * alors vide. Absent pour une ville : rendu inchangé.
       */
      cities?: CityOverview;
      /** Ville choisie dans « Afficher sur la carte » ; absente : toutes les villes. Elle entre dans `fitKey`. */
      cityView?: string;
      /** Partie de la carte couverte par le panneau : cadrage d'une ville réduite à une position (0150 § 3 bis). */
      visibleInsets?: FitPadding;
    }
  | {
      /** Zone d'un quartier (écran 3, `AreaMap`, décision 0017 § 7) : un cercle, sans marqueur en phase 0. */
      mode: "area";
      fitKey: string;
      center: LatLng;
      radiusM: number;
      fitPadding?: FitPadding;
    };
