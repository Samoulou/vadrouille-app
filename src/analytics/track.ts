import { AnalyticsEventSchema, type AnalyticsEvent } from "./events";

/**
 * Enregistreur injectable (décision 0013, § 3.3). Aucun envoi réseau tant que Samuel n'a pas
 * répondu à F6-Q3 (compte PostHog en région UE, consentement) : l'enregistreur PostHog sera ajouté
 * par une tâche dédiée, sans changer `track`.
 */
export interface EventRecorder {
  record(event: AnalyticsEvent): void;
}

/** En mémoire, pour les tests. */
export interface MemoryRecorder extends EventRecorder {
  readonly events: AnalyticsEvent[];
}

export function createMemoryRecorder(): MemoryRecorder {
  const events: AnalyticsEvent[] = [];
  return {
    events,
    record(event) {
      events.push(event);
    },
  };
}

/** Préfixe des lignes de la console, lu par les tests Playwright. */
export const CONSOLE_PREFIX = "[mesure]";

/** Console, en développement et dans les tests sur le build de production (pages de développement actives). */
export const consoleRecorder: EventRecorder = {
  record(event) {
    console.info(CONSOLE_PREFIX, JSON.stringify(event));
  },
};

/** Sans effet : production, tant que F6-Q3 est ouverte. */
export const noopRecorder: EventRecorder = {
  record() {},
};

export type RecorderKind = "console" | "none";

export function recorderFor(kind: RecorderKind): EventRecorder {
  return kind === "console" ? consoleRecorder : noopRecorder;
}

export type Track = (event: AnalyticsEvent) => void;

/**
 * Valide l'événement par son schéma strict avant de le confier à l'enregistreur. Un événement
 * invalide lève une erreur hors production (les tests échouent) ; en production, il est ignoré et
 * jamais envoyé partiellement.
 */
export function createTracker(recorder: EventRecorder, strict = process.env.NODE_ENV !== "production"): Track {
  return (event) => {
    const parsed = AnalyticsEventSchema.safeParse(event);
    if (!parsed.success) {
      if (strict) {
        throw new Error(`événement de mesure invalide : ${parsed.error.message}`);
      }
      return;
    }
    recorder.record(parsed.data);
  };
}
