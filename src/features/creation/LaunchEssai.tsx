"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { CreatedTrip, Result } from "@/contracts";
import { STORY_LENGTH } from "@/contracts/values";
import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
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
const e = t.essai;

/** État de la garde du site d'essai lu par la page (`etatPageAcces`, cookie `__Host-p0_acces`) : jamais le code. */
export type AccesEssai = "fermee" | "saisie" | "ouverte";

export interface LaunchEssaiProps {
  /** Valeur serveur, lue par la page à chaque requête. */
  acces: AccesEssai;
}

type Lancement = { kind: "idle" } | { kind: "pending" } | { kind: "failed" } | { kind: "story" } | { kind: "champ"; ecran: "voyage" | "brief" } | { kind: "cap" };

/** Récit transmis tel quel (D2) s'il tient dans les bornes du contrat ; sinon rien (le récit est facultatif). */
function recitDuBrouillon(story: string): string | undefined {
  const texte = story.trim();
  return texte.length >= STORY_LENGTH.min && texte.length <= STORY_LENGTH.max ? texte : undefined;
}

/**
 * `R-lancer` sur le site d'essai (adaptateur `prototype` ; spécification E2E-essai, lots 2 et 3, D3 ; décision 0125 § 2).
 * - **Garde** : sans brouillon complet, l'adresse est remplacée par `R1`, comme `LaunchStep`.
 * - **Code d'accès** (D3, il tient lieu de compte) : sans cookie d'accès valide, la saisie du code s'affiche sur la même
 *   adresse (`SaisieCodeAcces`, même action serveur que `/prototype/executions`), dans le cadre de la création ; une fois
 *   le code accepté, l'étape lance, brouillon gardé (il vit dans le layout du groupe `(creation)`).
 * - **Lancement** (lot 3) : accès ouvert, un appel à `createTrip` par ouverture de l'accès, avec le brouillon, la
 *   vérification, le récit et un `requestId` créé une seule fois par brouillon (idempotence : double appui,
 *   « Réessayer », retour du navigateur ; la base ne réserve qu'une exécution par `requestId`). À la réussite, l'adresse
 *   est **remplacée** par l'écran 5. Cookie expiré entre-temps (`unauthenticated`) : la saisie du code revient. Récit
 *   refusé (e-mail ou téléphone, champ `story`) : bandeau et « Revenir à mon récit » (écran 2, état « Récit », valeurs
 *   gardées) ; autre champ refusé : bandeau et « Corriger mon voyage » (écran du champ), sans « Réessayer » ; plafond
 *   atteint : bandeau sans « Réessayer » ; autre erreur : bandeau et « Réessayer ».
 * - Garde fermée (hors préversion de `p0-reel`) : le lancement n'est pas ouvert sur ce site, sans appel.
 */
export function LaunchEssai({ acces: accesInitial }: LaunchEssaiProps) {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  const complete = draftComplete(state);
  const [acces, setAcces] = useState<AccesEssai>(accesInitial);
  // Accès ouvert : le lancement part dès l'affichage (« pending » d'emblée, l'effet ci-dessous n'écrit aucun état).
  const [lancement, setLancement] = useState<Lancement>({ kind: accesInitial === "ouverte" ? "pending" : "idle" });
  // Le titre reçoit le focus au retour de la saisie du code (WCAG 2.4.3), jamais au premier affichage ; la région
  // `status` ci-dessous, montée dès l'affichage, annonce alors l'accès ouvert (la saisie, démontée, ne le peut plus).
  const [retour, setRetour] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  // Numéro de l'essai en cours : une réponse arrivée après un autre essai ou le démontage est ignorée.
  const attempt = useRef(0);
  const requestId = useRef<string | null>(null);

  /** Un appel à `createTrip` ; l'appelant a déjà affiché l'attente (`pending`). */
  async function run() {
    const current = ++attempt.current;
    requestId.current ??= state.requestId ?? crypto.randomUUID();
    if (state.requestId === null) dispatch({ type: "requestId", requestId: requestId.current });
    const story = recitDuBrouillon(state.story);
    let result: Result<CreatedTrip> | null = null;
    const at = launchNow();
    try {
      result = await createTrip({
        requestId: requestId.current,
        draft: toTripDraft(state.trip, state.lodgingChoices),
        brief: toBrief(state.brief),
        ...(story === undefined ? {} : { story }),
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
    if (result?.error.code === "unauthenticated") {
      setLancement({ kind: "idle" });
      setRetour(false);
      setAcces("saisie");
      return;
    }
    if (result?.error.code === "validation_failed" && result.error.field === "story") {
      setLancement({ kind: "story" });
      return;
    }
    // Autre champ refusé (date d'arrivée passée, ville, durée…) : « Réessayer » ne pourrait pas réussir ; on renvoie à
    // l'écran qui porte le champ (écran 1 pour `draft.*`, écran 2 sinon), brouillon gardé.
    if (result?.error.code === "validation_failed") {
      setLancement({ kind: "champ", ecran: result.error.field?.startsWith("draft.") === false ? "brief" : "voyage" });
      return;
    }
    setLancement({ kind: result?.error.code === "cost_cap_reached" ? "cap" : "failed" });
  }

  useEffect(() => {
    if (!complete) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau({ essai: true }));
    }
    // Au montage seulement, comme `LaunchStep` : le brouillon ne change pas sur cette étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un lancement par ouverture de l'accès : au montage, ou au retour de la saisie du code. Le double effet du mode strict
  // est couvert par l'idempotence (même `requestId`).
  useEffect(() => {
    if (!complete || acces !== "ouverte") return;
    void run();
    return () => {
      attempt.current += 1;
    };
    // `run` lit le brouillon, qui ne change pas sur cette étape : seule l'ouverture de l'accès lance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acces]);

  useEffect(() => {
    if (retour) title.current?.focus();
  }, [retour]);

  const surAcces = useCallback(() => {
    setLancement({ kind: "pending" });
    setAcces("ouverte");
    setRetour(true);
  }, []);

  if (!complete) return null;

  function back() {
    // Niveau supérieur de la création : dernier écran 3 affiché, sinon écran 2 (« Vérification »), comme `LaunchStep`.
    router.push(state.lodgingCity !== null ? creationRoutes.logement() : creationRoutes.brief());
  }

  function retry() {
    // Le bandeau (et le bouton) disparaît pendant l'essai : le focus va au titre (WCAG 2.4.3).
    title.current?.focus();
    setLancement({ kind: "pending" });
    void run();
  }

  function modifierRecit() {
    dispatch({ type: "backToStory" });
    router.push(creationRoutes.brief());
  }

  function corriger(ecran: "voyage" | "brief") {
    router.push(ecran === "voyage" ? creationRoutes.nouveau({ essai: true }) : creationRoutes.brief());
  }

  const enEchec = lancement.kind === "failed" || lancement.kind === "story" || lancement.kind === "champ" || lancement.kind === "cap";
  const enAttente = lancement.kind === "pending";

  return (
    <CreationShell onBack={back} backDisabled={enAttente}>
      {acces === "saisie" ? (
        <SaisieCodeAcces ouverte={false} parcours={{ titre: e.acces.titre, aide: e.acces.aide, surAcces }} />
      ) : (
        <>
          <h1 ref={title} tabIndex={-1} className={TITLE_CLASS}>
            {acces === "ouverte" ? t.titre : e.titre}
          </h1>
          {/* `noOption` (bloc `muted`, rôle `status`) : rien à lancer sur ce site, jamais une erreur. */}
          {acces === "fermee" ? <StatusBanner kind="noOption" message={e.ferme} /> : null}
        </>
      )}
      <p role="status" className={retour || enAttente ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
        {enAttente ? t.attente : retour ? e.accesOuvert : null}
      </p>
      <div role="alert" className={enEchec ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {lancement.kind === "failed" ? (
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
        {lancement.kind === "story" ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={e.recit}
            action={
              <Button variant="secondary" size="sm" onClick={modifierRecit}>
                {messages.creation.ecran2.verification.revenirRecit}
              </Button>
            }
          />
        ) : null}
        {lancement.kind === "champ" ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={e.champ}
            action={
              <Button variant="secondary" size="sm" onClick={() => corriger(lancement.ecran)}>
                {e.corrigerVoyage}
              </Button>
            }
          />
        ) : null}
        {lancement.kind === "cap" ? <StatusBanner kind="error" announce={false} message={e.plafond} /> : null}
      </div>
    </CreationShell>
  );
}
