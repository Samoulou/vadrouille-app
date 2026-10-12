"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AnalyticsProvider } from "@/analytics/context";
import { recorderFor, type EventRecorder, type RecorderKind } from "@/analytics/track";

import { BriefReview } from "./BriefReview";
import { BriefStory } from "./BriefStory";
import { CreationShell } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { creationRoutes } from "./routes";

export interface BriefScreenProps {
  /** Enregistreur des mesures (`brief_completed`) : console en développement et en test, aucun en production. */
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
}

/**
 * Écran 2 « Brief raconté puis vérifié » (`R2`, F8-PO-4 à F8-PO-7) : deux états sur la même adresse. Sans
 * brouillon validé à l'écran 1 (rechargement, accès direct), l'adresse est remplacée par `R1`, qui annonce
 * « Ton brouillon n'a pas été conservé. ». « Retour » mène à l'écran 1, saisies conservées.
 */
export function BriefScreen({ recorderKind = "none", recorder }: BriefScreenProps) {
  const chosen = useMemo(() => recorder ?? recorderFor(recorderKind), [recorder, recorderKind]);
  return (
    <AnalyticsProvider recorder={chosen}>
      <BriefContent />
    </AnalyticsProvider>
  );
}

function BriefContent() {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  // Le titre de l'état affiché reçoit le focus après un changement d'état, jamais au premier affichage.
  const [focusTitle, setFocusTitle] = useState(false);
  const stage = { focusTitle, onStageChange: () => setFocusTitle(true) };

  useEffect(() => {
    if (!state.tripReady) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau());
    }
  }, [state.tripReady, dispatch, router]);

  if (!state.tripReady) return null;

  return (
    <CreationShell backHref={creationRoutes.nouveau()}>
      {state.stage === "story" ? <BriefStory {...stage} /> : <BriefReview {...stage} />}
    </CreationShell>
  );
}
