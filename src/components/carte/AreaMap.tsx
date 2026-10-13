"use client";

import { useMemo } from "react";

import { format, messages } from "@/i18n";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { isMapConfigComplete, useCarteInjection } from "./config";
import { GoogleMapRenderer } from "./GoogleMapRenderer";
import { MapFallback, type MapFallbackCause } from "./MapFallback";
import type { LatLng } from "./route";
import type { MapView } from "./types";

const t = messages.carte.zone;

/** Textes de la mini-carte d'un quartier : la carte n'est jamais la seule source, le quartier est décrit à côté. */
const AREA_FALLBACK_TEXTS: Record<MapFallbackCause, string> = {
  offline: t.horsLigne,
  unavailable: t.indisponible,
  error: t.erreur,
};

export interface AreaMapProps {
  /** Centre de la zone : donnée maison du quartier, jamais une géométrie Google (décision 0017 § 7). */
  center: LatLng;
  radiusM: number;
  /** Nom du quartier, pour le nom accessible de la région. */
  name: string;
  className?: string;
}

/**
 * Mini-carte de la zone d'un quartier (écran 3, F8-TL-7, décision 0017 § 7 ; mise en page 0018 § 17). Composant à
 * part, pas une variante de `DayMap` : il réutilise `CarteProvider`, la configuration, le chargeur et l'état de
 * remplacement de F4. La zone est un cercle, la caméra est ajustée à ses bornes ; aucun marqueur de logement en
 * phase 0. Précédence de F4 : hors ligne, configuration absente (rendu Google seulement, aucun script demandé),
 * puis le rendu ; l'erreur de chargement est gérée par le rendu Google. La carte simulée n'est utilisée que si elle
 * est injectée par `CarteProvider` (`R3-dev`, tests). La carte n'est jamais la seule source d'information.
 */
export function AreaMap({ center, radiusM, name, className }: AreaMapProps) {
  const online = useOnline();
  const { config, simulated: Simulated } = useCarteInjection();
  const configComplete = isMapConfigComplete(config);
  const view = useMemo<MapView>(
    () => ({ mode: "area", fitKey: `zone-${center.lat}-${center.lng}-${radiusM}`, center, radiusM }),
    [center, radiusM],
  );

  let content;
  let cause: MapFallbackCause | null = null;
  if (!online) {
    cause = "offline";
  } else if (!Simulated && !configComplete) {
    cause = "unavailable";
  } else if (Simulated) {
    content = <Simulated view={view} />;
  } else {
    content = (
      <GoogleMapRenderer view={view} config={{ apiKey: config.apiKey ?? "", mapId: config.mapId ?? "" }} placesFromGoogle={false} />
    );
  }
  if (cause) {
    content = <MapFallback cause={cause} placesFromGoogle={false} text={AREA_FALLBACK_TEXTS[cause]} />;
  }

  return (
    <div
      role="region"
      aria-label={format(t.region, { nom: name })}
      data-area-map=""
      className={cn("relative aspect-video w-full overflow-hidden rounded-block border border-outline", className)}
    >
      {/* Région live persistante (comme `DayMap`, F4-PO-8) : seul son texte change. */}
      <p role="status" className="sr-only">
        {cause ? AREA_FALLBACK_TEXTS[cause] : null}
      </p>
      {content}
    </div>
  );
}
