import type { AnalyticsEvent } from "./events";
import type { EventRecorder, RecorderKind, Track } from "./track";

/** Envoi d'un événement dont la validation est chargée au premier appel. */
export type LazyTrack = (event: AnalyticsEvent) => Promise<void>;

/** Chargement du module `track` (paramètre des tests ; `import()` par défaut). */
export type TrackModuleLoader = () => Promise<Pick<typeof import("./track"), "createTracker" | "recorderFor">>;

const loadTrackModule: TrackModuleLoader = () => import("./track");

/**
 * Enregistreur chargé à la demande : `track` (validation par le schéma strict en `zod/mini`, décision 0013
 * § 3.3 et 0016 § 3.1 règle 3) n'est importé qu'au premier événement, puis réutilisé. Pour les écrans dont
 * la mesure suit une action rare de la personne (cocher une ligne du Séjour, F5c) : la validation n'entre pas
 * dans le JavaScript initial de la page (budget du handover § 14, décision 0022 § 4). Même validation, même
 * enregistreur, mêmes erreurs hors production que `createTracker`.
 *
 * Si le chargement échoue (réseau coupé, déploiement remplacé), la promesse de l'appel est rejetée et la
 * mémoire du chargement est vidée : l'appel suivant retente l'import au lieu d'échouer pour toujours.
 */
export function createLazyTrack(recorderKind: RecorderKind, recorder?: EventRecorder, load: TrackModuleLoader = loadTrackModule): LazyTrack {
  let loading: Promise<Track> | null = null;
  return async (event) => {
    loading ??= load().then(
      ({ createTracker, recorderFor }) => createTracker(recorder ?? recorderFor(recorderKind)),
      (error: unknown) => {
        loading = null;
        throw error;
      },
    );
    (await loading)(event);
  };
}
