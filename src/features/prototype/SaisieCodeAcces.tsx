"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";

import { Button } from "@/components/ligne/Button";
import { describedBy, EMPTY_LIVE_REGION_CLASS, errorId, FieldLabel, INPUT_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";
import { saisirCodeAccesP0, type EtatSaisieCodeP0 } from "@/server/actions/p0-acces";

const t = messages.prototype.acces;

const CHAMP_ID = "champ-code-acces";
const ERREUR_ID = errorId(CHAMP_ID);
const ETAT_INITIAL: EtatSaisieCodeP0 = { statut: "attente" };

/** Bouton pendant la vérification : mêmes couleurs que `disabled:` de `Button`, sans retirer le bouton du focus. */
const BOUTON_EN_COURS = "aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft";

/**
 * Formulaire de saisie du code d'accès du mode réel (décision 0055, section 2 point 5 ; S-2 point 3) : `POST` par
 * l'action serveur, champ `type="password"` non contrôlé (la saisie n'entre dans aucun état React), `autocomplete="off"`.
 * L'état rendu par l'action n'est qu'un statut ; la saisie n'est jamais réaffichée.
 *
 * - Un seul envoi à la fois (0055, section 2 point 3 : chaque envoi consomme un des 5 essais de l'heure) : un second
 *   envoi (double clic, deux Entrée) est ignoré tant que le premier n'a pas répondu ; le bouton reste focalisable,
 *   `aria-disabled`, grisé et libellé « Vérification… ».
 * - Annonces (handover § 11 ; 0018 § 14) : la région `status` de la confirmation et la région `alert` de l'erreur sont
 *   présentes dès l'affichage, vides ; accepté, le focus passe au titre ; refusé, l'erreur est reliée au champ
 *   (`aria-invalid`, `aria-describedby`) et le focus revient au champ.
 */
export interface SaisieCodeAccesProps {
  ouverte: boolean;
  /**
   * Saisie dans le parcours de création (spécification E2E-essai, lot 2, D3) : titre et aide propres, rendue sans
   * `<main>` dans le cadre de l'écran appelant (`CreationShell`) ; `surAcces` est appelée une fois l'accès accepté.
   * Absente : page `/prototype/executions`, inchangée.
   */
  parcours?: { readonly titre: string; readonly aide: string; readonly surAcces: () => void };
}

export function SaisieCodeAcces({ ouverte, parcours }: SaisieCodeAccesProps) {
  const [etat, envoyer, enCours] = useActionState(saisirCodeAccesP0, ETAT_INITIAL);
  // Posé à l'envoi, avant que `enCours` ne soit rendu : bloque aussi un second envoi dans le même instant.
  const envoiEnVol = useRef(false);
  const titre = useRef<HTMLHeadingElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const acces = ouverte || etat.statut === "accepte";
  const erreur = etat.statut === "invalid_code" || etat.statut === "too_many_attempts" || etat.statut === "erreur" ? t.erreurs[etat.statut] : null;

  const surAcces = parcours?.surAcces;
  useEffect(() => {
    envoiEnVol.current = false;
    if (etat.statut === "accepte") {
      // Dans le parcours, l'écran appelant démonte la saisie et focalise son propre titre : un seul focus.
      if (surAcces) surAcces();
      else titre.current?.focus();
    } else if (etat.statut !== "attente") champ.current?.focus();
  }, [etat, surAcces]);

  const surEnvoi = (evenement: FormEvent<HTMLFormElement>) => {
    if (envoiEnVol.current || enCours) {
      evenement.preventDefault();
      return;
    }
    envoiEnVol.current = true;
  };

  const contenu = (
    <>
      <h1 ref={titre} tabIndex={-1} className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
        {parcours?.titre ?? t.titre}
      </h1>
      <p role="status" className={acces ? "text-corps text-ink" : EMPTY_LIVE_REGION_CLASS}>
        {acces ? t.ouverte : null}
      </p>
      {acces ? null : (
        <form action={envoyer} onSubmit={surEnvoi} className="flex flex-col gap-6">
          <p className="text-corps text-ink-soft">{parcours?.aide ?? t.aide}</p>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={CHAMP_ID}>{t.libelle}</FieldLabel>
            <input
              ref={champ}
              id={CHAMP_ID}
              name="code"
              type="password"
              autoComplete="off"
              required
              aria-invalid={erreur ? true : undefined}
              aria-describedby={describedBy(erreur && ERREUR_ID)}
              className={INPUT_CLASS}
            />
            <p id={ERREUR_ID} role="alert" className={erreur ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
              {erreur}
            </p>
          </div>
          <Button type="submit" className={`w-full ${BOUTON_EN_COURS}`} aria-disabled={enCours || undefined}>
            {enCours ? t.verification : t.valider}
          </Button>
        </form>
      )}
    </>
  );
  if (parcours) return contenu;
  return <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">{contenu}</main>;
}
