export { CarteProvider, isMapConfigComplete, readMapConfig, type CarteInjection, type MapConfig, type SimulatedRenderer } from "./config";
export { AreaMap, type AreaMapProps } from "./AreaMap";
// `CityLabel` et `CityMark` ne sont pas exportés ici : ils se chargent à la demande (`React.lazy(() => import("./CityLabel"))`,
// décision 0152 § 4), et un import statique par l'index les remettrait dans le JavaScript initial. Types seulement.
export type { CityLabelProps, CityMarkProps } from "./CityLabel";
export { nomRepere, nomTerminus, texteEtiquette } from "./city-names";
export { DayMap, type DayMapProps } from "./DayMap";
export { GoogleMapRenderer, LOAD_TIMEOUT_MS, MAPS_LIBRARIES, type GoogleMapRendererProps } from "./GoogleMapRenderer";
export { MapFallback, type MapFallbackCause, type MapFallbackProps } from "./MapFallback";
export { MarkerButton, type MarkerButtonProps } from "./MarkerButton";
export { PlacesAttribution, type PlacesAttributionProps } from "./PlacesAttribution";
export {
  areaCorners,
  areaRadiusDegrees,
  boundsOf,
  buildCityOverview,
  buildDayRoute,
  buildOverview,
  moitieInitiale,
  ZOOM_ANNEAUX_PAR_VILLE,
  ZOOM_POSITION_SEULE,
  type Bounds,
  type CityMarkerSpec,
  type CityOverview,
  type CityRing,
  type Moitie,
  type DayRoute,
  type LatLng,
  type RouteLeg,
  type StopMarkerSpec,
  type TerminusMarkerSpec,
} from "./route";
export type { FitPadding, MapView } from "./types";
