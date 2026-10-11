"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { Button } from "@/components/ligne";
import { PRODUCT_NAME } from "@/config/site";
import { format, messages } from "@/i18n";

import { EtatPage } from "./EtatPage";

const t = messages.etats;

export interface ErrorContentProps {
  /** `reset` de la frontière d'erreur de Next : efface l'état d'erreur et rend de nouveau le segment. */
  reset: () => void;
}

/**
 * Rendu commun de `error.tsx` et `global-error.tsx` (décision 0021 § 7) : un seul endroit pour les textes et
 * les boutons. Il ne reçoit pas l'erreur : ni son message, ni son `digest`, ni sa pile ne peuvent être rendus,
 * journalisés ou envoyés à la mesure, et aucun événement n'est émis.
 */
export function ErrorContent({ reset }: ErrorContentProps) {
  const router = useRouter();

  // `reset` seul ne relance pas un composant serveur : `router.refresh()` redemande le rendu au serveur.
  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <>
      <title>{format(t.erreur.titreDocument, { produit: PRODUCT_NAME })}</title>
      <EtatPage title={t.erreur.titre} text={t.erreur.texte}>
        <Button onClick={retry}>{t.erreur.reessayer}</Button>
        <Button asChild variant="text">
          <Link href="/" prefetch={false}>
            {t.accueil}
          </Link>
        </Button>
      </EtatPage>
    </>
  );
}
