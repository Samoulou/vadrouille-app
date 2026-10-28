"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AnalyticsProvider } from "@/analytics/context";
import { recorderFor, type EventRecorder, type RecorderKind } from "@/analytics/track";

import { BriefReview } from "./BriefReview";
import { BriefStory } from "./BriefStory";
import { CreationShell, stepTotal } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { creationRoutes } from "./routes";
import { todayIso, validateTrip, type FieldError } from "./validation";

/** Règles propres au site d'essai (écran 1, D1). */
const ESSAI_CODES: ReadonlySet<FieldError> = new Set<FieldError>(["selectCity", "cityUnavailable", "cityCharacters", "singleCity", "tooLong"]);

export interface BriefScreenProps {
  /** Enregistreur des mesures (`brief_completed`) : console en développement et en test, aucun en production. */
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
  /** Site d'essai (adaptateur `prototype`, valeur serveur ; E2E-essai, lot 2) : récit sans structuration (D2). */
  essai?: boolean;
}

/**
 * Écran 2 « Brief raconté puis vérifié » (`R2`, F8-PO-4 à F8-PO-7) : deux états sur la même adresse. Sans
 * brouillon validé à l'écran 1 (rechargement, accès direct), l'adresse est remplacée par `R1`, qui annonce
 * « Ton brouillon n'a pas été conservé. ». « Retour » mène à l'écran 1, saisies conservées.
 */
export function BriefScreen({ recorderKind = "none", recorder, essai = false }: BriefScreenProps) {
  const chosen = useMemo(() => recorder ?? recorderFor(recorderKind), [recorder, recorderKind]);
  return (
    <AnalyticsProvider recorder={chosen}>
      <BriefContent essai={essai} />
    </AnalyticsProvider>
  );
}

function BriefContent({ essai }: { essai: boolean }) {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  // Le titre de l'état affiché reçoit le focus après un changement d'état, jamais au premier affichage.
  const [focusTitle, setFocusTitle] = useState(false);
  const stage = { focusTitle, onStageChange: () => setFocusTitle(true) };

  // Site d'essai : l'écran 1, prérendu, lit `site=essai` dans l'adresse ; arrivé sans (adresse saisie à la main), un
  // écran 1 hors des règles du site d'essai y est renvoyé, saisie gardée, avant tout récit.
  const horsEssai =
    essai && state.tripReady && validateTrip(state.trip, todayIso(), { essai: true }).some((error) => ESSAI_CODES.has(error.code));
  const valid = state.tripReady && !horsEssai;

  useEffect(() => {
    if (!state.tripReady) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau({ essai }));
    } else if (horsEssai) {
      router.replace(creationRoutes.nouveau({ essai: true }));
    }
  }, [state.tripReady, horsEssai, essai, dispatch, router]);

  if (!valid) return null;

  return (
    <CreationShell backHref={creationRoutes.nouveau({ essai })} step={{ current: 2, total: stepTotal(state.trip) }}>
      {state.stage === "story" ? <BriefStory {...stage} essai={essai} /> : <BriefReview {...stage} />}
    </CreationShell>
  );
}
