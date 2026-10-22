"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { StatusBanner } from "@/components/ligne/StatusBanner";
import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
import * as messages from "@/i18n/messages";

import { CreationShell, TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { draftComplete } from "./draft";
import { EMPTY_LIVE_REGION_CLASS } from "./fields";
import { creationRoutes } from "./routes";

const t = messages.creation.lancement.essai;

/** État de la garde du site d'essai lu par la page (`etatPageAcces`, cookie `__Host-p0_acces`) : jamais le code. */
export type AccesEssai = "fermee" | "saisie" | "ouverte";

export interface LaunchEssaiProps {
  /** Valeur serveur, lue par la page à chaque requête. */
  acces: AccesEssai;
}

/**
 * `R-lancer` sur le site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, critères 4 et 5, et D3).
 * - **Garde** : sans brouillon complet, l'adresse est remplacée par `R1`, comme `LaunchStep`.
 * - **Code d'accès** (D3, il tient lieu de compte) : sans cookie d'accès valide, la saisie du code s'affiche sur la même
 *   adresse (`SaisieCodeAcces`, même action serveur que `/prototype/executions`), dans le cadre de la création ; une fois
 *   le code accepté, l'étape revient au lancement, brouillon gardé (il vit dans le layout du groupe `(creation)`).
 * - **Lancement** : tant que le lot 3 n'est pas livré, aucun appel ; « Le lancement depuis l'app arrive bientôt »,
 *   jamais une erreur. Garde fermée (hors préversion de `p0-reel`) : le lancement n'est pas ouvert sur ce site.
 * Aucun appel de modèle ni de Google, aucune création de voyage.
 */
export function LaunchEssai({ acces: accesInitial }: LaunchEssaiProps) {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  const complete = draftComplete(state);
  const [acces, setAcces] = useState<AccesEssai>(accesInitial);
  // Le titre reçoit le focus au retour de la saisie du code (WCAG 2.4.3), jamais au premier affichage ; la région
  // `status` ci-dessous, montée dès l'affichage, annonce alors l'accès ouvert (la saisie, démontée, ne le peut plus).
  const [retour, setRetour] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!complete) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau({ essai: true }));
    }
    // Au montage seulement, comme `LaunchStep` : le brouillon ne change pas sur cette étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (retour) title.current?.focus();
  }, [retour]);

  const surAcces = useCallback(() => {
    setAcces("ouverte");
    setRetour(true);
  }, []);

  if (!complete) return null;

  function back() {
    // Niveau supérieur de la création : dernier écran 3 affiché, sinon écran 2 (« Vérification »), comme `LaunchStep`.
    router.push(state.lodgingCity !== null ? creationRoutes.logement() : creationRoutes.brief());
  }

  return (
    <CreationShell onBack={back}>
      {acces === "saisie" ? (
        <SaisieCodeAcces ouverte={false} parcours={{ titre: t.acces.titre, aide: t.acces.aide, surAcces }} />
      ) : (
        <>
          <h1 ref={title} tabIndex={-1} className={TITLE_CLASS}>
            {t.titre}
          </h1>
          {/* `noOption` (bloc `muted`, rôle `status`) : rien à proposer ici pour l'instant, jamais une erreur ; le lot 3
              remplacera ce bandeau par le lancement. */}
          <StatusBanner kind="noOption" message={acces === "ouverte" ? t.bientot : t.ferme} />
        </>
      )}
      <p role="status" className={retour ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
        {retour ? t.accesOuvert : null}
      </p>
    </CreationShell>
  );
}
