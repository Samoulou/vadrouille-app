import type {
  ApplyResult,
  Day,
  ReplacementRequest,
  RevisionResult,
  Stop,
} from "@/contracts";

/**
 * Révision unitaire du programme (spécification F7, F7-TL-2 ; décision 0016 § 5) : interface injectable et
 * fonctions pures. L'implémentation en mémoire de la phase 0 est la même que celle du programme
 * (`createMemoryProgramme`, `programme.ts`) : une seule version locale, une seule modification annulable. En B11,
 * des Server Actions derrière `src/adapters` (`previewReplacement`, `applyPatch`) se branchent sans changer les
 * écrans. L'annulation reste `ProgrammeActions.undo()`.
 *
 * L'implémentation ne choisit ni ne planifie rien (« l'agent cherche, l'ancrage vérifie, le moteur planifie ») :
 * elle sert des brouillons précalculés et vérifie verrous et versions. Elle n'envoie aucun événement de mesure.
 */
export interface RevisionActions {
  /** Version locale courante : base de chaque demande d'aperçu (`baseVersion`). */
  version(): number;
  /**
   * Aperçu d'un remplacement. Une demande abandonnée (`signal`) ne résout jamais un aperçu : la promesse est
   * rejetée par la raison de l'abandon.
   */
  previewReplacement(request: ReplacementRequest, options: { signal: AbortSignal }): Promise<RevisionResult>;
  /** Applique un aperçu ; refuse sans rien écrire si la version a changé (`conflict`) ou si un verrou serait touché. */
  apply(previewId: string): Promise<ApplyResult>;
}

/** Délai au-delà duquel l'écran affiche « On cherche autour de … » et « Arrêter » (F7-PO-4, décision 0016 § 10). */
export const SLOW_PREVIEW_MS = 5000;

/** Durée du surlignage des étapes modifiées après « Appliquer » (handover § 7, décision 0016 § 9). */
export const HIGHLIGHT_MS = 2000;

interface LocatedStop {
  day: number;
  stop: Stop;
}

function stopsOf(days: readonly Day[]): LocatedStop[] {
  return days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [{ day: day.index, stop: item.stop }] : [])));
}

/**
 * Étapes verrouillées qu'un brouillon modifierait (décision 0016 § 4.2, F7-PO-12) : une étape verrouillée d'un
 * jour touché qui disparaît, change de nom, d'heure ou de jour, ou une étape verrouillée d'un autre jour qui
 * apparaît dans un jour touché. Rend leurs identifiants, sans doublon ; vide si le brouillon les respecte.
 * En B11, cette fonction passe dans `src/domain` et le serveur l'importe, sans seconde copie.
 */
export function lockedStopViolations(baseDays: readonly Day[], draftDays: readonly Day[]): string[] {
  const touched = new Set(draftDays.map((day) => day.index));
  const draft = new Map(stopsOf(draftDays).map((located) => [located.stop.id, located]));
  const violations = new Set<string>();
  for (const { day, stop } of stopsOf(baseDays)) {
    if (!stop.locked) continue;
    const after = draft.get(stop.id);
    if (touched.has(day)) {
      if (!after || after.day !== day || after.stop.name !== stop.name || after.stop.start !== stop.start || after.stop.end !== stop.end) {
        violations.add(stop.id);
      }
    } else if (after) {
      violations.add(stop.id);
    }
  }
  return [...violations];
}

/** Égalité profonde de deux valeurs JSON (jours du programme). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const kb = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Erreur d'abandon d'une demande, portée par `signal.reason` quand il en a une. */
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("demande abandonnée", "AbortError");
}
