"use client";

import { useActionState } from "react";

import { Button } from "@/components/ligne/Button";
import { EMPTY_LIVE_REGION_CLASS, FieldLabel, INPUT_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";
import { saisirCodeAccesP0, type EtatSaisieCodeP0 } from "@/server/actions/p0-acces";

const t = messages.prototype.acces;

const CHAMP_ID = "champ-code-acces";
const ETAT_INITIAL: EtatSaisieCodeP0 = { statut: "attente" };

/**
 * Formulaire de saisie du code d'accès du mode réel (décision 0055, section 2 point 5 ; S-2 point 3) : `POST` par
 * l'action serveur, champ `type="password"` non contrôlé (la saisie n'entre dans aucun état React), `autocomplete="off"`.
 * L'état rendu par l'action n'est qu'un statut ; la saisie n'est jamais réaffichée.
 */
export function SaisieCodeAcces({ ouverte }: { ouverte: boolean }) {
  const [etat, envoyer, enCours] = useActionState(saisirCodeAccesP0, ETAT_INITIAL);
  const acces = ouverte || etat.statut === "accepte";
  const erreur = etat.statut === "invalid_code" || etat.statut === "too_many_attempts" || etat.statut === "erreur" ? t.erreurs[etat.statut] : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      {acces ? (
        <p role="status" className="text-corps text-ink">
          {t.ouverte}
        </p>
      ) : (
        <form action={envoyer} className="flex flex-col gap-6">
          <p className="text-corps text-ink-soft">{t.aide}</p>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={CHAMP_ID}>{t.libelle}</FieldLabel>
            <input id={CHAMP_ID} name="code" type="password" autoComplete="off" required className={INPUT_CLASS} />
          </div>
          <div role="alert" className={erreur ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
            {erreur}
          </div>
          <Button type="submit" className="w-full" aria-disabled={enCours || undefined}>
            {t.valider}
          </Button>
        </form>
      )}
    </main>
  );
}
