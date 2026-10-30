"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { buttonClassName } from "@/components/ligne/button-variants";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

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
        {/* Ni `Button` ni `next/link` (décision 0152) : `error.tsx` et `global-error.tsx` sont chargés par toutes les
            pages, chacun dans son bloc, qui embarquait sa copie de `Slot` et du routeur de liens. Mêmes éléments et
            mêmes classes que `Button` et `Button asChild` ; le retour à l'accueil recharge la page, ce qui repart
            aussi d'un état propre après une erreur. */}
        <button type="button" className={buttonClassName()} onClick={retry}>
          {t.erreur.reessayer}
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- lien ordinaire voulu, voir ci-dessus (décision 0152) */}
        <a href="/" className={buttonClassName({ variant: "text" })}>
          {t.accueil}
        </a>
      </EtatPage>
    </>
  );
}
