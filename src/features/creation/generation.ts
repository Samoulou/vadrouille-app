"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GenerationStatus, Result } from "@/contracts";
import { isFinalGenerationPhase } from "@/contracts/values";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const t = messages.creation.ecran5;

/** Intervalle d'interrogation de `getGenerationStatus` en phase 0 (décision 0017 § 9). */
export const GENERATION_POLL_MS = 1000;

export type FetchStatus = (tripId: string) => Promise<Result<GenerationStatus>>;

export interface GenerationTracking {
  status: GenerationStatus;
  /** La dernière interrogation a échoué (réseau, serveur) : l'interrogation est arrêtée, « Réessayer » la relance. */
  interrupted: boolean;
  /** Relance l'interrogation (« Réessayer ») : un appel tout de suite, puis toutes les `GENERATION_POLL_MS`. */
  retry: () => void;
}

/**
 * Suivi de la génération de l'écran 5 (décision 0017 § 9) : état initial rendu par le serveur, puis interrogation
 * de l'action toutes les `GENERATION_POLL_MS` par une chaîne de `setTimeout` relancée à la réponse (jamais
 * `setInterval` : deux appels ne se chevauchent jamais). Arrêt dans un état final (`ready`, `incomplete`,
 * `failed`), à une erreur et au démontage. Le flux `/api/v1/trips/[id]/generation` du handover le remplacera par un
 * crochet de même forme, sans changer l'écran.
 */
export function useGenerationStatus(tripId: string, initial: GenerationStatus, fetchStatus: FetchStatus): GenerationTracking {
  const [status, setStatus] = useState(initial);
  const [interrupted, setInterrupted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Numéro de la chaîne en cours : une réponse d'une chaîne arrêtée (démontage, « Réessayer ») est ignorée.
  const chain = useRef(0);
  const fetchRef = useRef(fetchStatus);

  const stop = useCallback(() => {
    chain.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Chaîne d'interrogation : une attente de `delay`, un appel, puis l'appel suivant une seconde après la réponse.
  const schedule = useCallback(
    (delay: number) => {
      stop();
      const current = chain.current;
      const step = (wait: number) => {
        timer.current = setTimeout(() => {
          void (async () => {
            let result: Result<GenerationStatus> | null = null;
            try {
              result = await fetchRef.current(tripId);
            } catch {
              // Erreur réseau ou serveur : l'interrogation s'arrête, « Réessayer » la relance.
            }
            if (chain.current !== current) return;
            if (!result || !result.ok) {
              setInterrupted(true);
              return;
            }
            setInterrupted(false);
            setStatus(result.value);
            if (!isFinalGenerationPhase(result.value.phase)) step(GENERATION_POLL_MS);
          })();
        }, wait);
      };
      step(delay);
    },
    [stop, tripId],
  );

  useEffect(() => {
    if (!isFinalGenerationPhase(initial.phase)) schedule(GENERATION_POLL_MS);
    return stop;
    // Au montage seulement : l'état initial est celui du rendu serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(() => {
    setInterrupted(false);
    schedule(0);
  }, [schedule]);

  return { status, interrupted, retry };
}

/** « 0 proposition prête sur 8 », « 1 proposition prête sur 8 », « 2 propositions prêtes sur 8 » (0018 § 19). */
export function readyCounter(ready: number, expected: number): string {
  return format(ready > 1 ? t.compteur.pluriel : t.compteur.singulier, {
    ready,
    expected,
  });
}

/** « 1 proposition n'a pas trouvé de lieu compatible. », « {n} propositions n'ont pas trouvé… » (0018 § 19). */
export function missingMessage(missing: number): string {
  return missing > 1 ? format(t.incomplet.pluriel, { n: missing }) : t.incomplet.singulier;
}

/** Jours passés de « En préparation » à « Jour {n} prêt » entre deux états (annoncés une fois chacun). */
export function newlyReadyDays(previous: GenerationStatus, next: GenerationStatus): number[] {
  return next.days
    .filter((day) => day.state === "ready" && previous.days.find((before) => before.index === day.index)?.state !== "ready")
    .map((day) => day.index);
}

/** État « prêt » ou « aperçu incomplet » : les deux sorties sont proposées (F8-PO-12). */
export function isPreviewReady(status: GenerationStatus): boolean {
  return status.phase === "ready" || status.phase === "incomplete";
}
