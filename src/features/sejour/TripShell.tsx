"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
import { UndoToast, UndoToastRegion } from "@/components/ligne/UndoToast";
import type { Day, DayMap as DayMapData, Stop, Trip } from "@/contracts";
import { messages } from "@/i18n";

import { DAY_LIST_ID, PLACES_FROM_GOOGLE } from "./constants";
import { findFicheTarget, type FicheTarget } from "./fiche";
import {
  INITIAL_PROGRAMME,
  applyProgramme,
  createMemoryProgramme,
  programmeReducer,
  type ProgrammeActions,
} from "./programme";
import { tripRoutes, type TripRoutes, type TripRoutesBase } from "./routes";

const t = messages.sejour;

/** Hauteur du panneau relevée par un marqueur, une fiche ou le lien d'évitement quand il est au plus bas (F5-PO-7, F5-PO-8). */
const LOWEST: SnapPoint = 0.25;

/** Toast d'annulation en cours (une action à la fois, handover § 7). */
interface ToastState {
  id: number;
  message: string;
  /** Appelé après l'annulation (par exemple pour rendre le focus au bouton d'origine). */
  afterUndo?: () => void;
}

/** Fiche fermée dont le lien d'origine doit reprendre le focus (handover § 7). */
export interface ClosedFiche {
  dayIndex: number;
  stopId: Stop["id"];
}

export interface TripShellValue {
  routes: TripRoutes;
  /** Voyage affiché : données de l'adaptateur et écarts du programme (verrous). */
  trip: Trip;
  /** Jour affiché, ou `undefined` sur le Séjour. */
  day: Day | undefined;
  /** Fiche ouverte (paramètre `etape` valide pour le jour), ou `null`. */
  fiche: FicheTarget | null;
  /** Paramètre `etape` de l'adresse, valide ou non. */
  etape: string | null;
  /** Hauteur du panneau, conservée d'un onglet à l'autre du voyage, 55 % au chargement (F5-PO-2). */
  snap: SnapPoint;
  setSnap: (snap: SnapPoint) => void;
  /** Actions du programme (F5-TL-6), en mémoire en phase 0. */
  actions: ProgrammeActions;
  /** Affiche le toast d'annulation d'une modification du programme ; « Annuler » appelle `actions.undo()`. */
  notifyChange: (message: string, afterUndo?: () => void) => void;
  /** Marque la fiche de `href` comme ouverte depuis le panneau de ce jour : « Fermer » revient alors dans l'historique. */
  markOpenedFromPanel: (href: string) => void;
  /** Ferme la fiche ouverte (« Fermer », Échap), sans toucher au focus (rendu par la Journée). */
  closeFiche: () => void;
  /** Dernière fiche fermée autrement que par un marqueur : la Journée rend le focus à son lien, puis la vide. */
  closedFiche: ClosedFiche | null;
  /** La Journée a rendu le focus au lien de la fiche fermée. */
  consumeClosedFiche: () => void;
  /** Annonce « Cette étape n'est plus dans ce jour. » pour ce jour, ou `null`. */
  missingNoticeDay: number | null;
  /** Retire `etape` inconnu de l'adresse et annonce l'absence (F5-PO-8). */
  reportMissingEtape: () => void;
}

const TripShellContext = createContext<TripShellValue | null>(null);

/** Contexte du voyage (décision 0015 § 5.3) : adresses, hauteur du panneau, programme, fiche. */
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
  /** Actions du programme injectées (tests, B11) ; sinon l'implémentation en mémoire de la phase 0. */
  actions?: ProgrammeActions;
  children: ReactNode;
}

/**
 * Mise en page commune du Séjour et de la Journée (spécification F5, F5-PO-1 ; décision 0015 § 5.3) :
 * carte en fond sur toute la fenêtre, « Retour » posé sur la carte, panneau `Sheet` au-dessus avec les
 * onglets du voyage. Monté par le layout du voyage : la hauteur du panneau, l'état du programme et le
 * toast d'annulation sont conservés entre les pages du même voyage, et repartent de zéro au chargement,
 * sans aucun stockage (F5-PO-16).
 */
export function TripShell({ trip: sourceTrip, maps, base, actions: injected, children }: TripShellProps) {
  const routes = useMemo(() => tripRoutes(base, sourceTrip.id), [base, sourceTrip.id]);
  const router = useRouter();
  const params = useParams<{ n?: string | string[] }>();
  const searchParams = useSearchParams();
  const etape = searchParams.get("etape");

  // Programme : écarts aux données de l'adaptateur, en mémoire (décision 0015 § 6).
  const [programme, dispatch] = useReducer(programmeReducer, INITIAL_PROGRAMME);
  const memory = useMemo(() => createMemoryProgramme(sourceTrip, dispatch), [sourceTrip]);
  const actions = injected ?? memory;
  const trip = useMemo(() => applyProgramme(sourceTrip, programme), [sourceTrip, programme]);

  const nParam = Array.isArray(params.n) ? params.n[0] : params.n;
  const day = nParam === undefined ? undefined : trip.days.find((candidate) => String(candidate.index) === nParam);
  const fiche = day ? findFicheTarget(day, etape) : null;

  const [snap, setSnap] = useState<SnapPoint>(DEFAULT_SNAP);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fitPadding] = useState(initialFitPadding);
  const viewport = useViewportHeight();
  const visibleInsets = useMemo<FitPadding | undefined>(
    () => (viewport > 0 ? { top: 0, right: 0, bottom: snap * viewport, left: 0 } : undefined),
    [snap, viewport],
  );

  // Fiche : ouverte depuis le panneau du jour (« Fermer » revient dans l'historique) ou directement.
  const openedFromPanel = useRef<string | null>(null);
  const [closedFiche, setClosedFiche] = useState<ClosedFiche | null>(null);
  const [closingByMarker, setClosingByMarker] = useState(false);
  const [missingNoticeDay, setMissingNoticeDay] = useState<number | null>(null);

  // Marqueur sélectionné après la fermeture d'une fiche par un marqueur (F5-PO-7) ; vidé à l'ouverture d'une fiche.
  const [markerSelection, setMarkerSelection] = useState<ClosedFiche | null>(null);
  // Étape à amener dans la zone visible du panneau une fois la fiche fermée par un marqueur.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const dayIndex = day?.index;

  // Ajustements pendant le rendu, à chaque changement de fiche ou de jour (sans effet) :
  // - une fiche qui s'ouvre efface la sélection laissée par un marqueur et l'annonce d'étape absente, et
  //   relève le panneau à 55 % s'il était à 25 % (F5-PO-8) ;
  // - une fiche qui se ferme dans le même jour est retenue pour que la Journée rende le focus à son lien,
  //   sauf si un marqueur l'a fermée (le focus reste alors sur le marqueur, F5-PO-7).
  const ficheKey = fiche && day ? `${day.index}/${fiche.stop.id}` : null;
  const [tracked, setTracked] = useState<{ ficheKey: string | null; fiche?: ClosedFiche; dayIndex?: number }>({
    ficheKey: null,
  });
  if (ficheKey !== tracked.ficheKey || dayIndex !== tracked.dayIndex) {
    setTracked({ ficheKey, fiche: fiche && day ? { dayIndex: day.index, stopId: fiche.stop.id } : undefined, dayIndex });
    if (ficheKey && ficheKey !== tracked.ficheKey) {
      setMarkerSelection(null);
      setMissingNoticeDay(null);
      setClosedFiche(null);
      if (snap === LOWEST) setSnap(DEFAULT_SNAP);
    } else if (!ficheKey && tracked.fiche) {
      setClosingByMarker(false);
      setClosedFiche(!closingByMarker && tracked.fiche.dayIndex === dayIndex ? tracked.fiche : null);
    } else {
      setClosedFiche(null);
    }
  }
  const selectedStopId =
    fiche?.inProgramme === true
      ? fiche.stop.id
      : !fiche && markerSelection && markerSelection.dayIndex === dayIndex
        ? markerSelection.stopId
        : undefined;

  // Marqueur touché : panneau relevé à 55 % s'il était à 25 %, liste défilée jusqu'à l'étape, focus laissé
  // sur le marqueur, adresse inchangée (F5-PO-7, F4-PO-4). Fiche ouverte : elle se ferme (adresse du jour
  // remplacée, sans nouvelle entrée d'historique), l'étape du marqueur devient l'étape sélectionnée, et le
  // focus reste sur le marqueur. Le défilement est calculé pour la hauteur finale du panneau.
  const onMarkerPress = useCallback(
    (stopId: string) => {
      if (dayIndex === undefined) return;
      const next = snap === LOWEST ? DEFAULT_SNAP : snap;
      setSnap(next);
      if (fiche) {
        openedFromPanel.current = null;
        setMarkerSelection({ dayIndex, stopId });
        setPendingScroll(stopId);
        // Fermeture par un marqueur : pas de retour du focus sur le lien de la fiche fermée.
        setClosingByMarker(true);
        router.replace(routes.jour(dayIndex), { scroll: false });
        return;
      }
      if (bodyRef.current) scrollStopIntoPanel(bodyRef.current, routes.etape(dayIndex, stopId), next);
    },
    [dayIndex, fiche, router, routes, snap],
  );

  // Après la fermeture par un marqueur, la ligne du jour est de nouveau rendue : défilement jusqu'à l'étape.
  useEffect(() => {
    if (!pendingScroll || fiche || dayIndex === undefined || !bodyRef.current) return;
    scrollStopIntoPanel(bodyRef.current, routes.etape(dayIndex, pendingScroll), snap);
    setPendingScroll(null);
  }, [pendingScroll, fiche, dayIndex, routes, snap]);

  // Lien d'évitement activé panneau à 25 % : le panneau passe à 55 % avant que le focus arrive sur la liste.
  const onSkipToList = useCallback(() => {
    if (snap === LOWEST) flushSync(() => setSnap(DEFAULT_SNAP));
  }, [snap]);

  const markOpenedFromPanel = useCallback((href: string) => {
    openedFromPanel.current = href;
  }, []);

  // « Fermer » et Échap : retour à l'entrée d'historique précédente après une ouverture depuis le panneau du
  // jour ; sinon (ouverture directe, ou depuis le Séjour), l'adresse du jour remplace celle de la fiche.
  const closeFiche = useCallback(() => {
    if (!fiche || dayIndex === undefined) return;
    const fromPanel = openedFromPanel.current === routes.etape(dayIndex, fiche.stop.id);
    openedFromPanel.current = null;
    if (fromPanel) router.back();
    else router.replace(routes.jour(dayIndex), { scroll: false });
  }, [dayIndex, fiche, router, routes]);

  const consumeClosedFiche = useCallback(() => setClosedFiche(null), []);

  const reportMissingEtape = useCallback(() => {
    if (dayIndex === undefined) return;
    setMissingNoticeDay(dayIndex);
    router.replace(routes.jour(dayIndex), { scroll: false });
  }, [dayIndex, router, routes]);

  // Toast d'annulation, partagé par les modifications du programme (décision 0016 § 9).
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const notifyChange = useCallback((message: string, afterUndo?: () => void) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, afterUndo });
  }, []);
  const onUndo = useCallback(async () => {
    const current = toast;
    setToast(null);
    await actions.undo();
    current?.afterUndo?.();
  }, [actions, toast]);

  const context = useMemo<TripShellValue>(
    () => ({
      routes,
      trip,
      day,
      fiche,
      etape,
      snap,
      setSnap,
      actions,
      notifyChange,
      markOpenedFromPanel,
      closeFiche,
      closedFiche,
      consumeClosedFiche,
      missingNoticeDay,
      reportMissingEtape,
    }),
    [
      routes,
      trip,
      day,
      fiche,
      etape,
      snap,
      actions,
      notifyChange,
      markOpenedFromPanel,
      closeFiche,
      closedFiche,
      consumeClosedFiche,
      missingNoticeDay,
      reportMissingEtape,
    ],
  );

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

  const toastRegion = (
    <UndoToastRegion className="pointer-events-none px-3 pb-2">
      {toast ? (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={onUndo}
          onExpire={() => setToast(null)}
          className="pointer-events-auto"
        />
      ) : null}
    </UndoToastRegion>
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
              selectedStopId={selectedStopId}
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
        <Sheet
          label={fiche ? t.regionFiche : t.region}
          snap={snap}
          onSnapChange={setSnap}
          header={tabs}
          bodyRef={bodyRef}
          above={toastRegion}
        >
          {children}
        </Sheet>
      </main>
    </TripShellContext.Provider>
  );
}
