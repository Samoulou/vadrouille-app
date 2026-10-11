import type { DayRoute, LatLng } from "./route";

/** Marge de cadrage en pixels CSS, de chaque côté de la carte. */
export interface FitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
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
    }
  | {
      mode: "overview";
      fitKey: string;
      rings: LatLng[];
      fitPadding?: FitPadding;
    };
