"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { IconButton } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

import type { TripForm } from "./draft";

/**
 * Cadre commun des écrans de création (décision 0018 § 14) : fond `page`, une colonne bornée comme l'accueil,
 * marges `space-5`, « Retour » (`IconButton` carré) en haut à gauche, qui mène au niveau supérieur et seulement
 * là (F8-PO-2, F8-PO-18). Écrans 1 à 3 : « Étape {n} sur {total} » à droite de « Retour » (décision 0134), lu juste
 * avant le titre.
 */
export function CreationShell({
  backHref,
  onBack,
  backDisabled = false,
  step,
  children,
}: {
  backHref?: string;
  onBack?: () => void;
  /** « Retour » inactif (lancement en cours, F8c : la requête est déjà partie). */
  backDisabled?: boolean;
  /** Étape du formulaire (écrans 1 à 3) ; `total` vient de `stepTotal` (décision 0134). */
  step?: { current: number; total: number };
  children: ReactNode;
}) {
  const router = useRouter();
  // `onBack` : niveau supérieur qui n'est pas une autre adresse (écran 3 de la ville précédente, même adresse).
  const back = () => (onBack ? onBack() : backHref ? router.push(backHref) : undefined);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-3 pb-10">
      <div className="flex items-center justify-between gap-4">
        <IconButton icon={<IconRetour />} label={messages.creation.retour} onClick={back} disabled={backDisabled} />
        {step ? (
          <p data-part="etape" className="text-corps-s font-semibold text-ink-soft tabular-nums">
            {format(messages.creation.etape, { n: step.current, total: step.total })}
          </p>
        ) : null}
      </div>
      {children}
    </main>
  );
}

/** Titre de niveau 1 des écrans de création : `titre-jour` 800 (0018 § 14). Focalisable par le code seulement. */
export const TITLE_CLASS = "text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink outline-offset-4";

/**
 * Nombre d'étapes du formulaire (décision 0134) : 3 si une ville attend encore l'écran 3 « Où loger » (réponse « Pas
 * encore ») ou n'a pas encore de réponse, 2 sinon. L'écran 1 le recalcule à chaque réponse au logement.
 */
export function stepTotal(trip: TripForm): 2 | 3 {
  const lodgings = [trip.lodging, ...trip.otherCities.map((city) => city.lodging)];
  return lodgings.some((lodging) => lodging.answer === null || lodging.answer === "none") ? 3 : 2;
}
