"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { CreatedTrip, Result } from "@/contracts";
import { connexionRoute } from "@/features/compte/suite";
import * as messages from "@/i18n/messages";
import { createTrip } from "@/server/actions/creation";

import { CreationShell, TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { draftComplete } from "./draft";
import { EMPTY_LIVE_REGION_CLASS } from "./fields";
import { launchNow, markLaunch } from "./launch-timing";
import { creationRoutes } from "./routes";
import { toBrief, toTripDraft } from "./validation";

const t = messages.creation.lancement;

type LaunchState = { kind: "idle" } | { kind: "pending" } | { kind: "conflict"; tripId: string } | { kind: "failed" };

export interface LaunchStepProps {
  /** Une session existe dans la portée de la requête (valeur serveur, lue par la page) : garde du lancement. */
  signedIn: boolean;
}

/**
 * `R-lancer`, étape sans écran (spécification F8, « Lancement » et « Garde du lancement » ; décision 0017 § 5).
 * - **Garde** (confort d'interface ; `createTrip` vérifie lui-même la session) : sans brouillon complet (écrans 1 et
 *   2 validés, écran 3 pour chaque ville « Pas encore » ; jamais le cas après un rechargement), l'adresse est
 *   remplacée par `R1`, qui annonce le brouillon perdu ; sans session, par `R4(R-lancer)`. Aucun appel à `createTrip`.
 * - **Lancement** : un appel à `createTrip` par montage, avec le brouillon et un `requestId` créé une seule fois par
 *   brouillon (idempotence : double appui, « Réessayer », retour du navigateur) ; l'instant de l'appel est retenu
 *   pour `preview_ready` (`launch-timing.ts`) ; à la réussite, l'adresse est **remplacée** par l'écran 5 (aucune
 *   entrée d'historique : le retour du navigateur ne rencontre jamais `R-lancer`).
 * - `active_preview_exists` (voyage en préparation dans `error.activeTripId`) : `StatusBanner` `conflict` et « Voir
 *   ces propositions » (0018 § 18) ; autre erreur : `StatusBanner` `error` et « Réessayer » (focus sur le titre),
 *   brouillon conservé. « Retour » est inactif pendant l'appel, déjà parti. Régions `role="status"` et `role="alert"` présentes dès
 *   l'affichage.
 */
export function LaunchStep({ signedIn }: LaunchStepProps) {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  const complete = draftComplete(state);
  const allowed = complete && signedIn;
  const [launch, setLaunch] = useState<LaunchState>({ kind: "idle" });
  // Numéro de l'essai en cours : une réponse arrivée après un autre essai ou le démontage est ignorée.
  const attempt = useRef(0);
  const started = useRef(false);
  const requestId = useRef<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);

  async function run() {
    const current = ++attempt.current;
    setLaunch({ kind: "pending" });
    requestId.current ??= state.requestId ?? crypto.randomUUID();
    if (state.requestId === null) dispatch({ type: "requestId", requestId: requestId.current });
    let result: Result<CreatedTrip> | null = null;
    const at = launchNow();
    try {
      result = await createTrip({
        requestId: requestId.current,
        draft: toTripDraft(state.trip, state.lodgingChoices),
        brief: toBrief(state.brief),
      });
    } catch {
      // Erreur réseau ou serveur : bandeau d'erreur, brouillon conservé.
    }
    if (attempt.current !== current) return;
    if (result?.ok) {
      markLaunch(result.value.tripId, at);
      router.replace(creationRoutes.preparation(result.value.tripId));
      return;
    }
    if (result?.error.code === "active_preview_exists" && result.error.activeTripId) {
      setLaunch({ kind: "conflict", tripId: result.error.activeTripId });
      return;
    }
    if (result?.error.code === "unauthenticated") {
      router.replace(connexionRoute(creationRoutes.lancer()));
      return;
    }
    setLaunch({ kind: "failed" });
  }

  useEffect(() => {
    if (!complete) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau());
      return;
    }
    if (!signedIn) {
      router.replace(connexionRoute(creationRoutes.lancer()));
      return;
    }
    // Un seul lancement par montage (le double effet du mode strict est aussi couvert par l'idempotence).
    if (started.current) return;
    started.current = true;
    void run();
    return () => {
      attempt.current += 1;
      started.current = false;
    };
    // Au montage seulement : le brouillon ne change pas pendant le lancement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) return null;

  function retry() {
    // Le bandeau (et le bouton) disparaît pendant l'essai : le focus va au titre (WCAG 2.4.3).
    title.current?.focus();
    void run();
  }

  function back() {
    // Niveau supérieur de la création : dernier écran 3 affiché, sinon écran 2 (« Vérification »), comme l'écran 4.
    router.push(state.lodgingCity !== null ? creationRoutes.logement() : creationRoutes.brief());
  }

  return (
    <CreationShell onBack={back} backDisabled={launch.kind === "pending"}>
      <h1 ref={title} tabIndex={-1} className={TITLE_CLASS}>
        {t.titre}
      </h1>
      <p role="status" className={launch.kind === "pending" ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
        {launch.kind === "pending" ? t.attente : null}
      </p>
      <div role="alert" className={launch.kind === "conflict" || launch.kind === "failed" ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {launch.kind === "conflict" ? (
          <StatusBanner
            kind="conflict"
            announce={false}
            message={t.conflit}
            action={
              <Button variant="text" size="sm" asChild className="px-0">
                <Link href={creationRoutes.preparation(launch.tripId)}>{t.voirConflit}</Link>
              </Button>
            }
          />
        ) : null}
        {launch.kind === "failed" ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={t.echec}
            action={
              <Button variant="secondary" size="sm" onClick={retry}>
                {t.reessayer}
              </Button>
            }
          />
        ) : null}
      </div>
    </CreationShell>
  );
}
