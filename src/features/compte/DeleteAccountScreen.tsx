"use client";

import { useId, type RefObject } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { TITLE_CLASS } from "@/features/creation/CreationShell";
import { ARIA_DISABLED } from "@/features/sejour/aria-disabled";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

const t = messages.compte.suppression;

/**
 * Confirmation de « Supprimer mon compte » (M9c, ticket 1122 ; spécification M9 § 6.4 critères 4 à 8, § 7 ; M9-PO-6), en
 * deux étapes rendues par `AccountScreen` : l'explication, puis, après le code si la connexion n'est pas récente,
 * « Supprimer définitivement ». Rendu provisoire en composants Ligne existants (U1, U3 : à valider par l'UX/UI).
 */

interface StepProps {
  /** Titre de l'étape : l'écran y pose le focus à l'affichage. */
  titleRef: RefObject<HTMLHeadingElement | null>;
  online: boolean;
  /** « Garder mon compte » : retour à « Ton compte », toujours actif (critère 7). */
  onKeep: () => void;
}

function Hors({ id }: { id: string }) {
  return (
    <div id={id}>
      <StatusBanner kind="offline" message={messages.compte.horsLigne} />
    </div>
  );
}

/** Étape 1 : ce qui est supprimé, ce qui est gardé (option A de Q48), rien ne se rétablit ; « Continuer », « Garder mon compte ». */
export function DeleteExplanation({ titleRef, online, onKeep, onContinue }: StepProps & { onContinue: () => void }) {
  const offlineId = `${useId()}-hors-ligne`;
  return (
    <div data-part="suppression-explication" className="flex flex-col gap-6">
      <h1 ref={titleRef} tabIndex={-1} className={TITLE_CLASS}>
        {t.titre}
      </h1>
      <div className="flex flex-col gap-3 text-corps text-ink-2">
        <p>{t.supprime}</p>
        <p>{t.garde}</p>
        <p className="font-bold text-ink">{t.irreversible}</p>
      </div>
      {online ? null : <Hors id={offlineId} />}
      <div className="flex flex-col gap-3">
        <Button
          className={cn("w-full", ARIA_DISABLED)}
          aria-disabled={online ? undefined : true}
          aria-describedby={online ? undefined : offlineId}
          onClick={onContinue}
        >
          {t.continuer}
        </Button>
        <Button variant="secondary" className="w-full" onClick={onKeep}>
          {t.garder}
        </Button>
      </div>
    </div>
  );
}

/** Issue affichée à la dernière étape : paiement en attente (aucun bouton de suppression), limite atteinte, erreur. */
export type DeleteIssue = "paiement" | "limite" | "erreur";

/**
 * Étape finale : « Supprimer définitivement », nom accessible « Supprimer définitivement mon compte » (critère 8). Paiement
 * en attente : le texte du § 7, sans ce bouton (critère 6). Erreur : le texte du § 7 avec « Réessayer ».
 */
export function DeleteConfirmation({
  titleRef,
  online,
  onKeep,
  onDelete,
  issue,
}: StepProps & { onDelete: () => void; issue: DeleteIssue | null }) {
  const offlineId = `${useId()}-hors-ligne`;
  return (
    <div data-part="suppression-confirmation" className="flex flex-col gap-6">
      <h1 ref={titleRef} tabIndex={-1} className={TITLE_CLASS}>
        {t.titre}
      </h1>
      <p className="text-corps font-bold text-ink">{t.irreversible}</p>
      {online ? null : <Hors id={offlineId} />}
      {issue === "paiement" ? <StatusBanner kind="error" message={t.paiementEnAttente} /> : null}
      {issue === "limite" ? <StatusBanner kind="error" message={messages.connexion.erreurs.rate_limited} /> : null}
      {issue === "erreur" ? (
        <StatusBanner
          kind="error"
          message={t.erreur}
          action={
            <Button variant="text" size="sm" className="-ml-2" onClick={onDelete}>
              {t.reessayer}
            </Button>
          }
        />
      ) : null}
      <div className="flex flex-col gap-3">
        {issue === "paiement" ? null : (
          <Button
            className={cn("w-full", ARIA_DISABLED)}
            aria-label={t.confirmerNom}
            aria-disabled={online ? undefined : true}
            aria-describedby={online ? undefined : offlineId}
            onClick={onDelete}
          >
            {t.confirmer}
          </Button>
        )}
        <Button variant="secondary" className="w-full" onClick={onKeep}>
          {t.garder}
        </Button>
      </div>
    </div>
  );
}
