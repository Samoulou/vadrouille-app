"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { IconButton } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import * as messages from "@/i18n/messages";

/**
 * Cadre commun des écrans de création (décision 0018 § 14) : fond `page`, une colonne bornée comme l'accueil,
 * marges `space-5`, « Retour » (`IconButton` carré) en haut à gauche, qui mène au niveau supérieur et seulement
 * là (F8-PO-2, F8-PO-18). Pas d'indicateur « étape {n} sur {total} ».
 */
export function CreationShell({
  backHref,
  onBack,
  backDisabled = false,
  children,
}: {
  backHref?: string;
  onBack?: () => void;
  /** « Retour » inactif (lancement en cours, F8c : la requête est déjà partie). */
  backDisabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  // `onBack` : niveau supérieur qui n'est pas une autre adresse (écran 3 de la ville précédente, même adresse).
  const back = () => (onBack ? onBack() : backHref ? router.push(backHref) : undefined);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-3 pb-10">
      <IconButton icon={<IconRetour />} label={messages.creation.retour} className="self-start" onClick={back} disabled={backDisabled} />
      {children}
    </main>
  );
}

/** Titre de niveau 1 des écrans de création : `titre-jour` 800 (0018 § 14). Focalisable par le code seulement. */
export const TITLE_CLASS = "text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink outline-offset-4";
