"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { DayMap } from "@/components/carte/DayMap";
import type { FitPadding } from "@/components/carte/types";
import { DayTabs } from "@/components/ligne/DayTabs";
import { IconRetour } from "@/components/ligne/icons";
import { Sheet } from "@/components/ligne/Sheet";
import { DEFAULT_SNAP, type SnapPoint } from "@/components/ligne/sheet-model";
import type { DayMap as DayMapData, Trip } from "@/contracts";
import { messages } from "@/i18n";

import { DAY_LIST_ID, PLACES_FROM_GOOGLE } from "./constants";
import { tripRoutes, type TripRoutes, type TripRoutesBase } from "./routes";

const t = messages.sejour;

/** Hauteur du panneau relevée par un marqueur ou le lien d'évitement quand il est au plus bas (F5-PO-7). */
const LOWEST: SnapPoint = 0.25;

export interface TripShellValue {
  routes: TripRoutes;
  /** Hauteur du panneau, conservée d'un onglet à l'autre du voyage, 55 % au chargement (F5-PO-2). */
  snap: SnapPoint;
  setSnap: (snap: SnapPoint) => void;
}

const TripShellContext = createContext<TripShellValue | null>(null);

/** Contexte du voyage (décision 0015 § 5.3) : adresses et hauteur du panneau. */
export function useTripShell(): TripShellValue {
  const value = useContext(TripShellContext);
  if (!value) throw new Error("useTripShell hors de TripShell");
  return value;
}

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

/** `window.innerHeight`, relu au redimensionnement ; 0 au rendu serveur. */
function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 0,
  );
}

/** Marge du cadrage initial : `--touch-target` sur les côtés, panneau à 55 % en bas ; calculée une fois au montage. */
function initialFitPadding(): FitPadding | undefined {
  if (typeof window === "undefined") return undefined;
  const side = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch-target")) || 0;
  return { top: side, right: side, bottom: DEFAULT_SNAP * window.innerHeight, left: side };
}

/** Fait défiler le contenu du panneau pour amener le lien de l'étape au milieu de sa zone visible, à la hauteur `snap`. */
function scrollStopIntoPanel(body: HTMLElement, href: string, snap: SnapPoint) {
  const link = Array.from(body.querySelectorAll<HTMLAnchorElement>("a[data-part='arret']")).find(
    (candidate) => candidate.getAttribute("href") === href,
  );
  const sheet = body.closest<HTMLElement>("[data-sheet]");
  const available = sheet?.parentElement?.clientHeight ?? 0;
  if (!link || !sheet || available <= 0) return;
  // Hauteur visible du contenu une fois le panneau posé (la transition de hauteur peut être en cours).
  const visible = snap * available - body.offsetTop;
  const linkTop = link.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
  const linkHeight = link.getBoundingClientRect().height;
  body.scrollTo({ top: Math.max(0, linkTop - Math.max(0, (visible - linkHeight) / 2)), behavior: "auto" });
}

export interface TripShellProps {
  trip: Trip;
  /** Positions de tous les jours, chargées une fois par le layout. */
  maps: DayMapData[];
  base: TripRoutesBase;
  children: ReactNode;
}

/**
 * Mise en page commune du Séjour et de la Journée (spécification F5, F5-PO-1 ; décision 0015 § 5.3) :
 * carte en fond sur toute la fenêtre, « Retour » posé sur la carte, panneau `Sheet` au-dessus avec les
 * onglets du voyage. Monté par le layout du voyage : la hauteur du panneau est conservée entre les pages
 * du même voyage, et repart à 55 % au chargement, sans aucun stockage.
 */
export function TripShell({ trip, maps, base, children }: TripShellProps) {
  const routes = useMemo(() => tripRoutes(base, trip.id), [base, trip.id]);
  const params = useParams<{ n?: string | string[] }>();
  const nParam = Array.isArray(params.n) ? params.n[0] : params.n;
  const day = nParam === undefined ? undefined : trip.days.find((candidate) => String(candidate.index) === nParam);

  const [snap, setSnap] = useState<SnapPoint>(DEFAULT_SNAP);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fitPadding] = useState(initialFitPadding);
  const viewport = useViewportHeight();
  const visibleInsets = useMemo<FitPadding | undefined>(
    () => (viewport > 0 ? { top: 0, right: 0, bottom: snap * viewport, left: 0 } : undefined),
    [snap, viewport],
  );

  // Marqueur touché : panneau relevé à 55 % s'il était à 25 %, liste défilée jusqu'à l'étape, focus laissé
  // sur le marqueur, adresse inchangée (F5-PO-7, F4-PO-4). Le défilement est calculé pour la hauteur
  // finale du panneau : il ne dépend pas de la transition en cours.
  const dayIndex = day?.index;
  const onMarkerPress = useCallback(
    (stopId: string) => {
      if (dayIndex === undefined) return;
      const next = snap === LOWEST ? DEFAULT_SNAP : snap;
      setSnap(next);
      if (bodyRef.current) scrollStopIntoPanel(bodyRef.current, routes.etape(dayIndex, stopId), next);
    },
    [dayIndex, routes, snap],
  );

  // Lien d'évitement activé panneau à 25 % : le panneau passe à 55 % avant que le focus arrive sur la liste.
  const onSkipToList = useCallback(() => {
    if (snap === LOWEST) flushSync(() => setSnap(DEFAULT_SNAP));
  }, [snap]);

  const context = useMemo<TripShellValue>(() => ({ routes, snap, setSnap }), [routes, snap]);

  // `n` hors des jours du voyage : la page répond 404 ; rien du voyage n'est monté autour.
  if (nParam !== undefined && !day) {
    return <>{children}</>;
  }

  const retour = (
    <Link
      href={day ? routes.sejour() : routes.retour()}
      aria-label={t.retour}
      data-part="retour"
      className="absolute left-3 top-3 z-10 inline-flex size-(--touch-target) items-center justify-center rounded-control border border-outline bg-raised text-ink"
    >
      <IconRetour />
    </Link>
  );

  const tabs = (
    <DayTabs
      days={trip.days.map((candidate) => ({
        index: candidate.index,
        href: routes.jour(candidate.index),
        weekday: candidate.weekday,
      }))}
      current={day ? day.index : "sejour"}
      sejourHref={routes.sejour()}
      className="px-4"
    />
  );

  return (
    <TripShellContext.Provider value={context}>
      <main className="fixed inset-0 overflow-hidden bg-map-land">
        <div className="absolute inset-0">
          {day ? (
            <DayMap
              mode="day"
              day={day}
              map={maps.find((candidate) => candidate.dayIndex === day.index) ?? null}
              onMarkerPress={onMarkerPress}
              listId={DAY_LIST_ID}
              fitPadding={fitPadding}
              visibleInsets={visibleInsets}
              onSkipToList={onSkipToList}
              controls={retour}
              placesFromGoogle={PLACES_FROM_GOOGLE}
            />
          ) : (
            <DayMap
              mode="overview"
              days={trip.days}
              maps={maps}
              controls={retour}
              fitPadding={fitPadding}
              placesFromGoogle={PLACES_FROM_GOOGLE}
            />
          )}
        </div>
        <Sheet label={t.region} snap={snap} onSnapChange={setSnap} header={tabs} bodyRef={bodyRef}>
          {children}
        </Sheet>
      </main>
    </TripShellContext.Provider>
  );
}
