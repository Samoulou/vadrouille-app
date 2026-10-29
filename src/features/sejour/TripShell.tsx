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
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { DayMap } from "@/components/carte/DayMap";
import { DayTabs } from "@/components/ligne/DayTabs";
import { IconRetour } from "@/components/ligne/icons";
import { Sheet } from "@/components/ligne/Sheet";
import { DEFAULT_SNAP, SNAP_POINTS, type SnapPoint } from "@/components/ligne/sheet-model";
import { UndoToast, UndoToastRegion } from "@/components/ligne/UndoToast";
import type { Day, DayMap as DayMapData, RevisionFixtures, Stop, Trip } from "@/contracts";
import { weekdayOf } from "@/contracts/values";
import * as messages from "@/i18n/messages";
import { ShareButton } from "@/features/partage/ShareButton";
import { useOptionalTripSession } from "@/features/voyage/TripSessionProvider";
import { cn } from "@/lib/utils";

import { DAY_LIST_ID, PLACES_FROM_GOOGLE } from "./constants";
import { findFicheTarget, type FicheTarget } from "./fiche";
import {
  INITIAL_PROGRAMME,
  applyProgramme,
  createMemoryProgramme,
  createMemoryProgrammeStore,
  programmeReducer,
  sendToMemoryStore,
  type ProgrammeActions,
  type ProgrammeEvent,
} from "./programme";
import { layoutFitPadding, layoutVisibleInsets, useMapLayout } from "./map-layout";
import { HIGHLIGHT_MS, type RevisionActions } from "./revision";
import { createServerRevision, createServerRevisionStore, syncServerRevisionVersion } from "./revision-serveur";
import { tripRoutes, type TripRoutes, type TripRoutesBase } from "./routes";

const t = messages.sejour;

/** Hauteur du panneau relevée par un marqueur, une fiche ou le lien d'évitement quand il est au plus bas (F5-PO-7, F5-PO-8). */
const LOWEST: SnapPoint = 0.25;
/** Hauteur la plus haute du panneau : son bord est alors à hauteur de « Retour », posé sur la carte. */
const HIGHEST: SnapPoint = Math.max(...SNAP_POINTS) as SnapPoint;

/** Toast d'annulation en cours (une action à la fois, handover § 7). */
interface ToastState {
  id: number;
  message: string;
  /** Appelé après l'annulation (par exemple pour rendre le focus au bouton d'origine). */
  afterUndo?: () => void;
  /** Toast revenu après une annulation qui n'a pas abouti : « Annuler » reprend le focus. */
  refocus?: boolean;
}

/** Fiche fermée dont le lien d'origine doit reprendre le focus (handover § 7). */
export interface ClosedFiche {
  dayIndex: number;
  stopId: Stop["id"];
}

/**
 * Focus demandé à la Journée du jour `dayIndex` (F7-PO-1) : le lien de l'étape `stopId` s'il est dans la ligne du
 * jour, sinon le titre du jour.
 */
export interface FocusRequest {
  dayIndex: number;
  stopId?: Stop["id"];
}

/** Étapes surlignées 2 s après « Appliquer » (décision 0016 § 9). */
export interface Highlight {
  dayIndex: number;
  stopIds: readonly Stop["id"][];
}

/** Modification du programme appliquée (F7) : toast, surlignage, focus, puis effets de son annulation. */
export interface AppliedChange {
  /** « Modifié. », « Lieu ajouté. » ou « Étape déplacée. ». */
  message: string;
  /** Jour affiché après « Appliquer » : celui de l'étape nouvelle ou déplacée. */
  dayIndex: number;
  /** Étapes surlignées pendant `HIGHLIGHT_MS` (`changedStopIds`). */
  highlighted: readonly Stop["id"][];
  /** Étape nouvelle ou déplacée : son lien reçoit le focus. */
  targetStopId: Stop["id"];
  /** Étape d'origine : son lien reçoit le focus après « Annuler » s'il est dans le jour affiché. */
  originStopId?: Stop["id"];
  /** Appelé une fois l'annulation résolue (mesure `replace_undone`). */
  onUndone?: () => void;
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
  /** Actions de révision (F7, décision 0016 § 5), en mémoire en phase 0 : même objet que `actions` par défaut. */
  revision: RevisionActions;
  /**
   * Révision appliquée (décision 0016 § 9) : toast partagé avec le verrou, surlignage de 2 s, focus sur l'étape
   * visée ; « Annuler » rétablit l'état d'avant et annonce « Modification annulée. ».
   */
  notifyApplied: (change: AppliedChange) => void;
  /** Étapes surlignées, ou `null`. */
  highlight: Highlight | null;
  /** Focus à poser par la Journée, ou `null` ; la Journée le consomme. */
  focusRequest: FocusRequest | null;
  consumeFocusRequest: () => void;
  /** Adresse de l'écran 14 ouvert depuis la fiche (« Remplacer ») : « Retour à la fiche » revient alors dans l'historique. */
  replaceOrigin: string | null;
  markReplaceOrigin: (href: string | null) => void;
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
  /** Données de lieux Google affichées (adaptateur `prototype`) : mention « Données de lieux : Google » hors carte. */
  placesFromGoogle: boolean;
  /** Adresse de l'écran 9 « Débloquer » pour un voyage non débloqué, paiement simulé disponible ; sinon `null`. */
  unlockHref: string | null;
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

/** Identifiant décodé d'un segment d'adresse ; tel quel s'il est mal encodé. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Calculs de mise en page communs avec la vue partagée (décision 0039, F10-TL-14) ; réexportés pour les tests.
export { layoutFitPadding, layoutVisibleInsets };

/**
 * Fait défiler le contenu du panneau pour amener le lien de l'étape au milieu de sa zone visible : à la hauteur
 * `snap` en mobile, toute la hauteur du contenu en grand écran.
 */
function scrollStopIntoPanel(body: HTMLElement, href: string, snap: SnapPoint, largeScreen: boolean) {
  const link = Array.from(body.querySelectorAll<HTMLAnchorElement>("a[data-part='arret']")).find(
    (candidate) => candidate.getAttribute("href") === href,
  );
  const sheet = body.closest<HTMLElement>("[data-sheet]");
  const available = sheet?.parentElement?.clientHeight ?? 0;
  if (!link || !sheet || available <= 0) return;
  // Hauteur visible du contenu une fois le panneau posé (la transition de hauteur peut être en cours).
  const visible = largeScreen ? body.clientHeight : snap * available - body.offsetTop;
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
  /** Actions de révision injectées (tests, B11) ; sinon l'implémentation en mémoire, la même que `actions`. */
  revision?: RevisionActions;
  /** Jeu simulé de révision lu par la mise en page (adaptateur `mock`) ; sans lui, aucune option compatible. */
  revisionFixtures?: RevisionFixtures | null;
  /**
   * Version courante du voyage pour la révision enregistrée (adaptateur `api`, M1g), lue par la mise en page : non nulle,
   * le remplacement d'une étape et son annulation passent par les actions serveur (`revision-serveur.ts`) ; nulle ou
   * absente, l'implémentation en mémoire.
   */
  revisionVersion?: number | null;
  /** Données de lieux Google (adaptateur `prototype`, spécification P0) ; `PLACES_FROM_GOOGLE` par défaut. */
  placesFromGoogle?: boolean;
  /**
   * Bouton « Partager » sur la carte (spécification F10, F10c) : décidé côté serveur par la mise en page (voyage
   * débloqué, partage disponible et pas terminé, base `/voyages`) ; absent par défaut.
   */
  shareable?: boolean;
  /**
   * Adresse de l'écran 9 « Débloquer » (spécification E2E-essai, lot 1) : décidée côté serveur par la mise en page
   * (voyage non débloqué, paiement simulé disponible, base `/voyages`) ; absente par défaut.
   */
  unlockHref?: string | null;
  children: ReactNode;
}

/**
 * Mise en page commune du Séjour et de la Journée (spécification F5, F5-PO-1 ; décision 0015 § 5.3) :
 * carte en fond sur toute la fenêtre, « Retour » posé sur la carte, panneau `Sheet` au-dessus avec les
 * onglets du voyage. À partir de 1024 px (F12-PO-7, décision 0022 § 6), carte à gauche et panneau latéral à
 * droite, même arbre de composants : la bascule ne démonte rien (F12-PO-10). Monté par le layout du voyage :
 * la hauteur du panneau, l'état du programme et le toast d'annulation sont conservés entre les pages du même
 * voyage, et repartent de zéro au chargement, sans aucun stockage (F5-PO-16).
 */
export function TripShell({
  trip: sourceTrip,
  maps,
  base,
  actions: injected,
  revision: injectedRevision,
  revisionFixtures = null,
  revisionVersion = null,
  placesFromGoogle = PLACES_FROM_GOOGLE,
  shareable = false,
  unlockHref = null,
  children,
}: TripShellProps) {
  const routes = useMemo(() => tripRoutes(base, sourceTrip.id), [base, sourceTrip.id]);
  const router = useRouter();
  const params = useParams<{ n?: string | string[]; stopId?: string | string[] }>();
  const searchParams = useSearchParams();
  const etape = searchParams.get("etape");

  // Programme : écarts aux données de l'adaptateur, en mémoire (décision 0015 § 6).
  const [programme, dispatch] = useReducer(programmeReducer, INITIAL_PROGRAMME);
  // Copie de l'état des actions en mémoire, gardée pour la vie du shell comme l'état du réducteur : recréer les
  // actions (nouvelles données de l'adaptateur) ne remet ni la version ni les jours remplacés à zéro.
  const [memoryStore] = useState(createMemoryProgrammeStore);
  const memory = useMemo(
    () => createMemoryProgramme(sourceTrip, dispatch, revisionFixtures, memoryStore),
    [sourceTrip, revisionFixtures, memoryStore],
  );
  // Révision enregistrée (adaptateur `api`, M1g) : état gardé pour la vie du shell, comme celui de la mémoire.
  const [serverStore] = useState(() => (revisionVersion === null ? null : createServerRevisionStore(revisionVersion)));
  const send = useCallback((event: ProgrammeEvent) => sendToMemoryStore(memoryStore, dispatch, event), [memoryStore]);
  // Relecture du voyage demandée après une écriture : tout de suite, ou une fois l'écran 14 quitté (son étape n'existe plus).
  const [writes, setWrites] = useState(0);
  const refreshedWrites = useRef(0);
  const afterWrite = useCallback(() => setWrites((count) => count + 1), []);
  const server = useMemo(
    () =>
      serverStore === null
        ? null
        : createServerRevision({
            tripId: sourceTrip.id,
            store: serverStore,
            memory,
            currentDays: () => applyProgramme(sourceTrip, memoryStore.state).days,
            showDays: (days) => send({ type: "applyRevision", days }),
            afterWrite,
          }),
    [serverStore, sourceTrip, memory, memoryStore, send, afterWrite],
  );
  const actions = injected ?? server ?? memory;
  const revision = injectedRevision ?? server ?? memory;
  const trip = useMemo(() => applyProgramme(sourceTrip, programme), [sourceTrip, programme]);
  // Voyage relu (révision enregistrée) : les jours affichés en attendant la relecture sont retirés.
  useEffect(() => {
    if (serverStore !== null) send({ type: "rebase" });
  }, [sourceTrip, serverStore, send]);
  useEffect(() => {
    if (serverStore !== null && revisionVersion !== null) syncServerRevisionVersion(serverStore, revisionVersion);
  }, [serverStore, revisionVersion]);

  const nParam = Array.isArray(params.n) ? params.n[0] : params.n;
  const day = nParam === undefined ? undefined : trip.days.find((candidate) => String(candidate.index) === nParam);
  const fiche = day ? findFicheTarget(day, etape) : null;
  // Écran 14 (`…/remplacer/[stopId]`) : l'étape remplacée est sélectionnée sur la carte (F7-PO-2).
  const stopParam = Array.isArray(params.stopId) ? params.stopId[0] : params.stopId;
  const replaceStopId = stopParam === undefined ? undefined : safeDecode(stopParam);
  useEffect(() => {
    if (writes === refreshedWrites.current || replaceStopId !== undefined) return;
    refreshedWrites.current = writes;
    router.refresh();
  }, [writes, replaceStopId, router]);
  const replaceTarget =
    day && replaceStopId !== undefined
      ? day.items.some((item) => item.type === "stop" && item.stop.id === replaceStopId)
        ? replaceStopId
        : undefined
      : undefined;

  // Hauteur du panneau, mesures de `main`, marge du cadrage et partie couverte de la carte (module commun).
  const [snap, setSnap] = useState<SnapPoint>(DEFAULT_SNAP);
  const { mainRef, largeScreen, visibleInsets, fitPadding, fitScope } = useMapLayout(snap);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Fiche : ouverte depuis le panneau du jour (« Fermer » revient dans l'historique) ou directement.
  // Adresse de la fiche marquée par un lien du panneau ; vidée dès que cette fiche se ferme ou change de jour.
  const [openedFromPanel, setOpenedFromPanel] = useState<string | null>(null);
  const [closedFiche, setClosedFiche] = useState<ClosedFiche | null>(null);
  const [closingByMarker, setClosingByMarker] = useState(false);
  const [missingNoticeDay, setMissingNoticeDay] = useState<number | null>(null);

  // Marqueur sélectionné après la fermeture d'une fiche par un marqueur (F5-PO-7) ; vidé à l'ouverture d'une fiche.
  const [markerSelection, setMarkerSelection] = useState<ClosedFiche | null>(null);
  // Étape à amener dans la zone visible du panneau une fois la fiche fermée par un marqueur.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const dayIndex = day?.index;

  // Dernier onglet consulté (F11-PO-5, décision 0021 § 4) : la Journée `n` dès qu'un jour est affiché (fiche et
  // sous-pages comprises), sinon le Séjour. Hors du fournisseur (pages de développement), rien n'est enregistré.
  const tabMemory = useOptionalTripSession();
  // Un `n` hors du voyage (page 404) n'enregistre rien.
  const tripId = sourceTrip.id;
  const unknownDay = nParam !== undefined && dayIndex === undefined;
  useEffect(() => {
    if (unknownDay) return;
    tabMemory?.recordLastTab(tripId, dayIndex === undefined ? { kind: "sejour" } : { kind: "jour", n: dayIndex });
  }, [tabMemory, tripId, dayIndex, unknownDay]);

  // Ajustements pendant le rendu, à chaque changement de fiche ou de jour (sans effet) :
  // - une fiche qui s'ouvre efface la sélection laissée par un marqueur et l'annonce d'étape absente, et
  //   relève le panneau à 55 % s'il était à 25 % (F5-PO-8) ;
  // - une fiche qui se ferme dans le même jour est retenue pour que la Journée rende le focus à son lien,
  //   sauf si un marqueur l'a fermée (le focus reste alors sur le marqueur, F5-PO-7).
  const ficheKey = fiche && day ? `${day.index}/${fiche.stop.id}` : null;
  const [tracked, setTracked] = useState<{ ficheKey: string | null; fiche?: ClosedFiche; dayIndex?: number }>({
    ficheKey: null,
  });
  // Écran 14 ouvert : le panneau passe à 55 % s'il était à 25 % (F7-PO-2), comme pour une fiche.
  const [trackedReplace, setTrackedReplace] = useState<string | undefined>(undefined);
  if (replaceTarget !== trackedReplace) {
    setTrackedReplace(replaceTarget);
    if (replaceTarget !== undefined && snap === LOWEST && !largeScreen) setSnap(DEFAULT_SNAP);
  }
  if (ficheKey !== tracked.ficheKey || dayIndex !== tracked.dayIndex) {
    setTracked({ ficheKey, fiche: fiche && day ? { dayIndex: day.index, stopId: fiche.stop.id } : undefined, dayIndex });
    // L'annonce d'étape absente ne vaut que pour le jour où elle a été faite : un changement de jour l'efface.
    if (dayIndex !== tracked.dayIndex) setMissingNoticeDay(null);
    // L'ouverture depuis le panneau ne vaut que pour la fiche qu'elle a ouverte : quand cette fiche se ferme
    // (« Fermer », Échap, retour du navigateur, marqueur) ou qu'on change de jour, la marque est oubliée. Une
    // réouverture qui ne passe pas par le panneau (Séjour, historique) remplace alors l'adresse à la fermeture.
    if (tracked.ficheKey !== null || dayIndex !== tracked.dayIndex) setOpenedFromPanel(null);
    if (ficheKey && ficheKey !== tracked.ficheKey) {
      setMarkerSelection(null);
      setMissingNoticeDay(null);
      setClosedFiche(null);
      // En grand écran, la hauteur du panneau mobile n'est pas touchée (0022 § 6).
      if (snap === LOWEST && !largeScreen) setSnap(DEFAULT_SNAP);
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
      : replaceTarget !== undefined
        ? replaceTarget
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
      const next = snap === LOWEST && !largeScreen ? DEFAULT_SNAP : snap;
      setSnap(next);
      if (fiche) {
        setOpenedFromPanel(null);
        setMarkerSelection({ dayIndex, stopId });
        setPendingScroll(stopId);
        // Fermeture par un marqueur : pas de retour du focus sur le lien de la fiche fermée.
        setClosingByMarker(true);
        router.replace(routes.jour(dayIndex), { scroll: false });
        return;
      }
      if (bodyRef.current) scrollStopIntoPanel(bodyRef.current, routes.etape(dayIndex, stopId), next, largeScreen);
    },
    [dayIndex, fiche, router, routes, snap, largeScreen],
  );

  // Après la fermeture par un marqueur, la ligne du jour est de nouveau rendue : défilement jusqu'à l'étape.
  useEffect(() => {
    if (!pendingScroll || fiche || dayIndex === undefined || !bodyRef.current) return;
    scrollStopIntoPanel(bodyRef.current, routes.etape(dayIndex, pendingScroll), snap, largeScreen);
    setPendingScroll(null);
  }, [pendingScroll, fiche, dayIndex, routes, snap, largeScreen]);

  // Lien d'évitement activé panneau à 25 % : le panneau passe à 55 % avant que le focus arrive sur la liste.
  // En grand écran, la liste est toujours visible : rien à relever.
  const onSkipToList = useCallback(() => {
    if (snap === LOWEST && !largeScreen) flushSync(() => setSnap(DEFAULT_SNAP));
  }, [snap, largeScreen]);

  const markOpenedFromPanel = useCallback((href: string) => setOpenedFromPanel(href), []);

  // « Fermer » et Échap : retour à l'entrée d'historique précédente après une ouverture depuis le panneau du
  // jour ; sinon (ouverture directe, ou depuis le Séjour), l'adresse du jour remplace celle de la fiche.
  const closeFiche = useCallback(() => {
    if (!fiche || dayIndex === undefined) return;
    const fromPanel = openedFromPanel === routes.etape(dayIndex, fiche.stop.id);
    setOpenedFromPanel(null);
    if (fromPanel) router.back();
    else router.replace(routes.jour(dayIndex), { scroll: false });
  }, [dayIndex, fiche, openedFromPanel, router, routes]);

  const consumeClosedFiche = useCallback(() => setClosedFiche(null), []);

  const reportMissingEtape = useCallback(() => {
    if (dayIndex === undefined) return;
    setMissingNoticeDay(dayIndex);
    router.replace(routes.jour(dayIndex), { scroll: false });
  }, [dayIndex, router, routes]);

  // Toast d'annulation, partagé par le verrou de F5 et les révisions de F7 (décision 0016 § 9) : une nouvelle
  // modification ferme le toast précédent et rend la précédente définitive.
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  // Surlignage de 2 s après « Appliquer » ; minuteur annulé par « Annuler », une nouvelle modification ou le démontage.
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHighlight = useCallback(() => {
    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
    highlightTimer.current = null;
    setHighlight(null);
  }, []);
  useEffect(() => () => {
    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
  }, []);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const consumeFocusRequest = useCallback(() => setFocusRequest(null), []);
  // « Modification annulée. » : annonce de la région du toast après l'annulation d'une révision (F7-PO-1).
  const [undone, setUndone] = useState<{ id: number } | null>(null);

  const notifyChange = useCallback(
    (message: string, afterUndo?: () => void) => {
      toastId.current += 1;
      clearHighlight();
      setUndone(null);
      setToast({ id: toastId.current, message, afterUndo });
    },
    [clearHighlight],
  );
  const notifyApplied = useCallback(
    (change: AppliedChange) => {
      toastId.current += 1;
      const id = toastId.current;
      clearHighlight();
      setUndone(null);
      setHighlight({ dayIndex: change.dayIndex, stopIds: change.highlighted });
      highlightTimer.current = setTimeout(() => {
        highlightTimer.current = null;
        setHighlight(null);
      }, HIGHLIGHT_MS);
      setFocusRequest({ dayIndex: change.dayIndex, stopId: change.targetStopId });
      setToast({
        id,
        message: change.message,
        afterUndo: () => {
          setUndone({ id });
          // Étape d'origine si elle est dans le jour affiché, sinon titre du jour (F7-PO-1).
          setFocusRequest({ dayIndex: change.dayIndex, stopId: change.originStopId });
          change.onUndone?.();
        },
      });
    },
    [clearHighlight],
  );
  // « Annuler » de la révision enregistrée (PR 869) : le toast reste affiché pendant l'appel (pas de clignotement), le
  // surlignage n'est retiré qu'après un succès, et un second appui pendant l'attente est ignoré.
  const undoing = useRef(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  const onUndo = useCallback(async () => {
    const current = toast;
    if (current === null || undoing.current) return;
    undoing.current = true;
    try {
      await actions.undo();
    } catch {
      // Annulation refusée ou réseau perdu : la modification reste, et reste annulable. Le toast revient (délai relancé)
      // avec l'annonce de l'échec (`role="status"` de sa région) et le focus sur « Annuler ».
      toastId.current += 1;
      setToast({ id: toastId.current, message: messages.revision.annulationEchouee, afterUndo: current.afterUndo, refocus: true });
      return;
    } finally {
      undoing.current = false;
    }
    setToast((shown) => (shown?.id === current.id ? null : shown));
    clearHighlight();
    current.afterUndo?.();
  }, [actions, toast, clearHighlight]);
  // Focus rendu à « Annuler » du toast revenu après un échec (le toast est remonté, son bouton est neuf).
  useEffect(() => {
    if (toast?.refocus) undoButton.current?.focus();
  }, [toast]);

  const [replaceOrigin, setReplaceOrigin] = useState<string | null>(null);
  const markReplaceOrigin = useCallback((href: string | null) => setReplaceOrigin(href), []);

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
      revision,
      notifyApplied,
      highlight,
      focusRequest,
      consumeFocusRequest,
      replaceOrigin,
      markReplaceOrigin,
      markOpenedFromPanel,
      closeFiche,
      closedFiche,
      consumeClosedFiche,
      missingNoticeDay,
      reportMissingEtape,
      placesFromGoogle,
      unlockHref,
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
      revision,
      notifyApplied,
      highlight,
      focusRequest,
      consumeFocusRequest,
      replaceOrigin,
      markReplaceOrigin,
      markOpenedFromPanel,
      closeFiche,
      closedFiche,
      consumeClosedFiche,
      missingNoticeDay,
      reportMissingEtape,
      placesFromGoogle,
      unlockHref,
    ],
  );

  // `n` hors des jours du voyage : la page répond 404 ; rien du voyage n'est monté autour.
  if (nParam !== undefined && !day) {
    return <>{children}</>;
  }

  const retour = (
    <Link
      href={day ? routes.sejour() : routes.mesVoyages()}
      aria-label={t.retour}
      data-part="retour"
      className="absolute left-3 top-3 z-10 inline-flex size-(--touch-target) items-center justify-center rounded-control border border-outline bg-raised text-ink"
    >
      <IconRetour />
    </Link>
  );

  // Contrôles posés sur la carte : « Retour » en haut à gauche, « Partager » en haut à droite (F10c).
  const controls = (
    <>
      {retour}
      {shareable ? <ShareButton tripId={sourceTrip.id} timeZone={sourceTrip.timeZone} /> : null}
    </>
  );

  const tabs = (
    <DayTabs
      days={trip.days.map((candidate) => ({
        index: candidate.index,
        href: routes.jour(candidate.index),
        weekday: weekdayOf(candidate.date) ?? undefined,
      }))}
      current={day ? day.index : "sejour"}
      sejourHref={routes.sejour()}
      className="px-4"
    />
  );

  // Panneau au plus haut : le toast, posé au-dessus du panneau, est décalé à droite de « Retour »
  // (`left-3`, une cible tactile, puis `space-2`) pour ne jamais le recouvrir pendant ses 5 s. En grand écran,
  // il est posé sous le contenu du panneau latéral (il ne masque aucun élément focalisable, WCAG 2.4.11) ; sans
  // toast, la région n'y prend aucune hauteur (rendu provisoire, UX/UI, Q173). Le retrait de « Retour » ne vaut
  // qu'en mobile (`lg:pl-3`).
  const toastRegion = (
    <UndoToastRegion
      className={cn(
        "pointer-events-none pb-2",
        snap === HIGHEST ? "pr-3 pl-(--ligne-toast-retrait-retour) lg:pl-3" : "px-3",
        toast ? "lg:py-2" : "lg:min-h-0 lg:pb-0",
      )}
    >
      {toast ? (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={onUndo}
          undoRef={undoButton}
          onExpire={() => setToast(null)}
          className="pointer-events-auto"
        />
      ) : undone ? (
        <p key={`annulee-${undone.id}`} data-part="annonce-annulation" className="sr-only">
          {messages.revision.annulee}
        </p>
      ) : null}
    </UndoToastRegion>
  );

  return (
    <TripShellContext.Provider value={context}>
      <main ref={mainRef} className="fixed inset-0 overflow-hidden bg-map-land lg:flex">
        <div data-part="zone-carte" className="absolute inset-0 lg:relative lg:inset-auto lg:min-w-0 lg:flex-1">
          {day ? (
            <DayMap
              mode="day"
              day={day}
              map={maps.find((candidate) => candidate.dayIndex === day.index) ?? null}
              selectedStopId={selectedStopId}
              onMarkerPress={onMarkerPress}
              listId={DAY_LIST_ID}
              fitPadding={fitPadding}
              fitScope={fitScope}
              visibleInsets={visibleInsets}
              onSkipToList={onSkipToList}
              controls={controls}
              placesFromGoogle={placesFromGoogle}
            />
          ) : (
            <DayMap
              mode="overview"
              days={trip.days}
              maps={maps}
              controls={controls}
              fitPadding={fitPadding}
              fitScope={fitScope}
              placesFromGoogle={placesFromGoogle}
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
          sideOnLargeScreen
        >
          {children}
        </Sheet>
      </main>
    </TripShellContext.Provider>
  );
}
