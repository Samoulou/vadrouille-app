"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";

import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { isMapConfigComplete, useCarteInjection } from "./config";
import type { GoogleMapRendererProps } from "./GoogleMapRenderer";
import { MAP_FALLBACK_TEXTS, MapFallback, type MapFallbackCause } from "./MapFallback";
import { buildCityOverview, buildDayRoute, buildOverview, type DayRoute, type Moitie, type RouteDay, type RouteMap, type VilleDuJour } from "./route";
import type { FitPadding, MapView } from "./types";

const t = messages.carte;

/** Props du rendu Google chargé à la demande, plus le rechargement de son bloc (« Réessayer » après un échec du bloc). */
type RenduGoogleProps = GoogleMapRendererProps & { onReload: () => void };

/**
 * Bloc du rendu Google qui n'a pas pu être téléchargé (réseau instable, déploiement qui change les blocs) : même état
 * « erreur de chargement » que l'échec de l'API Google (F4-PO-8), annoncé par la région live, sans texte nouveau ;
 * « Réessayer » retélécharge le bloc. L'erreur ne remonte jamais à `error.tsx` : la liste reste utilisable.
 */
function EchecDuBloc({ placesFromGoogle, onErrorChange, onReload }: RenduGoogleProps) {
  useEffect(() => {
    onErrorChange?.(true);
    return () => onErrorChange?.(false);
  }, [onErrorChange]);
  return <MapFallback cause="error" placesFromGoogle={placesFromGoogle} onRetry={onReload} />;
}

/**
 * Rendu Google chargé à la demande (décision 0152 § 4, ticket 991) : il n'est monté qu'en ligne, avec des positions et
 * une configuration complète. Hors ligne, sans position ou sans configuration, l'écran n'en télécharge rien. Repli
 * `null` pendant le chargement du bloc : la région live reste vide, comme pendant le chargement des scripts Google.
 * Un échec du téléchargement donne `EchecDuBloc` au lieu d'une exception ; `React.lazy` gardant ce résultat, « Réessayer »
 * remplace le composant paresseux par un nouveau, qui retente l'import.
 */
const chargerRenduGoogle = () =>
  lazy<ComponentType<RenduGoogleProps>>(() =>
    import("./GoogleMapRenderer").then(
      (loaded) => ({ default: loaded.GoogleMapRenderer }),
      () => ({ default: EchecDuBloc }),
    ),
  );
let RenduGoogle = chargerRenduGoogle();

export type DayMapProps =
  | {
      mode: "day";
      /** Fournit l'ordre et la numérotation (items) ; `Day` en est un sous-type. */
      day: RouteDay;
      /** Positions du jour (F4-TL-1) ; `null` ou vide : état de remplacement, aucun script chargé. */
      map: RouteMap | null;
      /** Étape dont la fiche est ouverte (F4-PO-5). */
      selectedStopId?: string;
      /** Marqueur touché : l'appelant fait défiler la liste jusqu'à l'étape (F4-PO-4). */
      onMarkerPress?: (stopId: string) => void;
      /**
       * Faux : marqueurs non interactifs, rendus comme des images nommées et non comme des boutons (vue partagée,
       * spécification F10, F10-TL-14). Vrai par défaut.
       */
      interactiveMarkers?: boolean;
      /** Id de la liste des étapes, cible du lien d'évitement ; l'appelant y pose `tabindex="-1"` (F4-PO-10). */
      listId: string;
      /** Marge de cadrage ; par défaut `--touch-target` de chaque côté. Appliquée au cadrage d'un jour ou d'un `fitScope`. */
      fitPadding?: FitPadding;
      /** Change quand la disposition change (grand écran, F12-TL-6) : la carte est alors recadrée une fois, sans animation. */
      fitScope?: string;
      /**
       * Partie de la carte couverte par d'autres éléments (le panneau, en bas), décision 0015 § 4 :
       * le recentrage sur `selectedStopId` place l'étape au milieu du reste. La changer ne recadre ni ne recentre.
       */
      visibleInsets?: FitPadding;
      /** Appelée quand le lien d'évitement est activé, avant que le focus aille sur la liste (F5 : relever le panneau). */
      onSkipToList?: () => void;
      /**
       * Journée d'un changement de ville (décision 0150 § 3) : villes quittée et d'arrivée (noms maison de `Trip.cities`).
       * Avec un `transfer` dans `day.items`, les deux terminus sont nommés et étiquetés, et la carte cadre `moitie`.
       */
      transferCities?: { de: string; vers: string };
      /** Moitié cadrée (« avant » ou « après » le `transfer`) ; absente : toute la journée. */
      moitie?: Moitie;
      /**
       * `buildDayRoute(day, map)` déjà calculée par l'appelant (`TripShell`, qui en lit les moitiés) : la carte ne la
       * recalcule pas. Absente : calculée ici.
       */
      route?: DayRoute;
      /** Contrôles posés sur la carte (« Retour »), après le lien d'évitement dans l'ordre de tabulation. */
      controls?: ReactNode;
      /** F4-PO-9 ; `false` avec l'adaptateur mock. */
      placesFromGoogle: boolean;
      className?: string;
    }
  | {
      mode: "overview";
      days: readonly RouteDay[];
      maps: readonly RouteMap[];
      /** Contrôles posés sur la carte (« Retour »), en tête de l'ordre de tabulation. */
      controls?: ReactNode;
      /** Marge de cadrage (panneau du Séjour en bas) ; par défaut `--touch-target` de chaque côté. */
      fitPadding?: FitPadding;
      /** Voir le mode « day » : son changement recadre la carte. */
      fitScope?: string;
      /**
       * Voyage à 2 villes ou plus (décision 0150 § 2) : noms de `Trip.cities` dans l'ordre, et ville de chaque jour de `days`
       * (`villesDeLaDate`). Absents pour une ville : carte inchangée.
       */
      cities?: readonly string[];
      citiesOfDays?: readonly VilleDuJour[];
      /** Ville choisie dans « Afficher sur la carte » (nom maison) ; absente : toutes les villes. */
      cityView?: string;
      /** Partie de la carte couverte par le panneau : cadrage d'une ville réduite à une position (0150 § 3 bis). */
      visibleInsets?: FitPadding;
      placesFromGoogle: boolean;
      className?: string;
    };

/**
 * Carte d'une journée ou vue d'ensemble du séjour (spécification F4).
 *
 * L'enveloppe choisit ce qui s'affiche, dans cet ordre de précédence (F4-PO-8) :
 * hors ligne (quel que soit le rendu), jour sans position, configuration absente (rendu Google
 * seulement, aucun script demandé), puis le rendu ; l'erreur de chargement est gérée par le rendu Google.
 * La carte simulée n'est utilisée que si elle est injectée par `CarteProvider` (/dev/carte, tests).
 */
export function DayMap(props: DayMapProps) {
  const online = useOnline();
  const [loadError, setLoadError] = useState(false);
  // Nouveau composant paresseux après un échec du bloc (« Réessayer ») : le compteur force le rendu qui le lit.
  const [, setTentativeDuBloc] = useState(0);
  const rechargerLeBloc = useCallback(() => {
    RenduGoogle = chargerRenduGoogle();
    setTentativeDuBloc((value) => value + 1);
  }, []);
  const { config, simulated: Simulated } = useCarteInjection();
  const configComplete = isMapConfigComplete(config);

  const day = props.mode === "day" ? props.day : null;
  const dayMap = props.mode === "day" ? props.map : null;
  const maps = props.mode === "overview" ? props.maps : null;
  const routeFournie = props.mode === "day" ? props.route : undefined;
  const route = useMemo(() => routeFournie ?? (day ? buildDayRoute(day, dayMap) : null), [routeFournie, day, dayMap]);
  const cityNames = props.mode === "overview" ? props.cities : undefined;
  const citiesOfDays = props.mode === "overview" ? props.citiesOfDays : undefined;
  const overviewDays = props.mode === "overview" ? props.days : null;
  const multiCity = cityNames !== undefined && cityNames.length >= 2 && citiesOfDays !== undefined;
  const rings = useMemo(() => (maps && !multiCity ? buildOverview(maps) : null), [maps, multiCity]);
  const cityOverview = useMemo(
    () => (maps && overviewDays && multiCity ? buildCityOverview(overviewDays, maps, citiesOfDays, cityNames) : null),
    [maps, overviewDays, multiCity, citiesOfDays, cityNames],
  );

  const selectedStopId = props.mode === "day" ? props.selectedStopId : undefined;
  const onMarkerPress = props.mode === "day" ? props.onMarkerPress : undefined;
  const fitPadding = props.fitPadding;
  const scope = props.fitScope ? `:${props.fitScope}` : "";
  const visibleInsets = props.visibleInsets;
  const interactive = props.mode === "day" ? (props.interactiveMarkers ?? true) : true;
  const transferDe = props.mode === "day" ? props.transferCities?.de : undefined;
  const transferVers = props.mode === "day" ? props.transferCities?.vers : undefined;
  // Journée d'un changement de ville : seulement avec un `transfer` dans la ligne et les deux villes connues.
  const transfer = route?.moities && transferDe !== undefined && transferVers !== undefined ? { de: transferDe, vers: transferVers } : undefined;
  const moitie = transfer && props.mode === "day" ? props.moitie : undefined;
  const cityView = props.mode === "overview" && cityOverview ? props.cityView : undefined;
  const view = useMemo<MapView | null>(() => {
    if (route && day) {
      return {
        mode: "day",
        fitKey: transfer ? `jour-${day.index}:${moitie ?? "journee"}${scope}` : `jour-${day.index}${scope}`,
        route,
        selectedStopId,
        onMarkerPress,
        fitPadding,
        visibleInsets,
        ...(interactive ? {} : { interactive: false }),
        ...(transfer ? { transferCities: transfer, ...(moitie ? { moitie } : {}) } : {}),
      };
    }
    if (cityOverview) {
      return {
        mode: "overview",
        fitKey: `sejour:${cityView === undefined ? "toutes" : `ville:${cityView}`}${scope}`,
        rings: [],
        cities: cityOverview,
        ...(cityView === undefined ? {} : { cityView }),
        fitPadding,
        visibleInsets,
      };
    }
    if (rings) {
      return { mode: "overview", fitKey: `sejour${scope}`, rings, fitPadding };
    }
    return null;
    // `transfer` est recréé à chaque rendu : ses deux noms suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, day, rings, cityOverview, cityView, selectedStopId, onMarkerPress, fitPadding, visibleInsets, scope, interactive, transferDe, transferVers, moitie]);

  const hasPositions = view
    ? view.mode === "day"
      ? view.route.positions.length > 0
      : view.mode === "overview" && (view.rings.length > 0 || (view.cities?.all.length ?? 0) > 0)
    : false;
  const needsConfig = !Simulated;

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && needsConfig && !configComplete) {
      console.warn(
        "carte : NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ou NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID manquant, état de remplacement affiché.",
      );
    }
  }, [needsConfig, configComplete]);

  let content;
  let cause: MapFallbackCause | null = null;
  if (!online) {
    cause = "offline";
    content = <MapFallback cause="offline" placesFromGoogle={props.placesFromGoogle} />;
  } else if (!view || !hasPositions || (needsConfig && !configComplete)) {
    cause = "unavailable";
    content = <MapFallback cause="unavailable" placesFromGoogle={props.placesFromGoogle} />;
  } else if (Simulated) {
    content = <Simulated view={view} />;
  } else {
    content = (
      <Suspense fallback={null}>
        <RenduGoogle
          view={view}
          config={{ apiKey: config.apiKey ?? "", mapId: config.mapId ?? "" }}
          placesFromGoogle={props.placesFromGoogle}
          onErrorChange={setLoadError}
          onReload={rechargerLeBloc}
        />
      </Suspense>
    );
    cause = loadError ? "error" : null;
  }

  const regionLabel = props.mode === "day" ? format(t.regionJour, { n: props.day.index }) : t.regionSejour;

  const skipToList = (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.mode !== "day") {
      return;
    }
    const target = document.getElementById(props.listId);
    if (target) {
      // Le focus va sur la liste sans changer l'adresse de la page.
      event.preventDefault();
      props.onSkipToList?.();
      target.focus();
      target.scrollIntoView?.({ block: "start" });
    }
  };

  return (
    <div data-day-map={props.mode} className={cn("relative h-full", props.className)}>
      {props.mode === "day" ? (
        // Au focus, sous « Retour » (en haut à gauche) pour ne pas le recouvrir, avec un contour ; `not-sr-only` remet
        // le padding à 0 : il est reposé au focus, avec la hauteur de cible de 44 px.
        <a
          href={`#${props.listId}`}
          onClick={skipToList}
          data-part="evitement"
          className="sr-only z-20 rounded-control bg-raised px-4 py-3 text-corps font-bold text-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-16 focus:min-h-(--touch-target) focus:px-4 focus:py-3 focus:outline-2 focus:outline-offset-2 focus:outline-line"
        >
          {t.evitement}
        </a>
      ) : null}
      {props.controls}
      <div role="region" aria-label={regionLabel} className="h-full">
        {/* Région live persistante (F4-PO-8) : toujours montée, seul son texte change, pour que chaque
            entrée dans un état de remplacement soit annoncée ; vide quand la carte s'affiche. */}
        <p role="status" data-part="annonce" className="sr-only">
          {cause ? MAP_FALLBACK_TEXTS[cause] : null}
        </p>
        {content}
      </div>
    </div>
  );
}
