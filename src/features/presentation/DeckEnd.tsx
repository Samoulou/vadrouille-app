import Link from "next/link";
import type { ReactNode, Ref } from "react";

import { Button } from "@/components/ligne/Button";
import * as messages from "@/i18n/messages";

import { unlockRoutes } from "./routes";

const t = messages.presentation.fin;

export type DeckEndVariant = "apercu" | "suite" | "vide";

export interface DeckEndProps {
  variant: DeckEndVariant;
  tripId: string;
  /** Lien « Débloquer » rendu (aperçu) ; faux quand le paiement simulé n'est pas disponible (F9-PO-19). */
  canUnlock?: boolean;
  /** Titre, pour y placer le focus en fin de paquet (F6-PO-5). */
  titleRef?: Ref<HTMLHeadingElement>;
  /**
   * Tri enregistré clos avant l'ouverture de l'écran (« Passer », fin du paquet, déblocage ; B10-PO-4 point 3). Suite du
   * tri : « Tu as fini ce tri. » au lieu de « Tu as tout trié », faux quand des cartes ont été gardées sans être triées ;
   * aperçu : son titre, inchangé (textes provisoires, spécification B10, question 8). Boutons de la variante inchangés.
   */
  closed?: boolean;
  /**
   * Des cartes de la session n'ont pas été triées une à une : au moins un jour gardé par « Tout garder pour le jour N »,
   * ou des cartes retirées par une réponse « Oui » à une question de catégorie. Suite du tri : « Tu as fini ce tri. »,
   * comme pour un tri clos (revues UX/UI tardives de la PR 621, spécification B10, question 8). Aperçu et paquet vide :
   * titre inchangé.
   */
  notAllSorted?: boolean;
  /**
   * Voyage d'essai (spécification E2E-essai, lot 1 ; D4) : une phrase sous le titre dit que les choix du tri ne changent
   * pas encore le programme. Faux par défaut.
   */
  choixSansEffet?: boolean;
  /**
   * Voyage d'essai qui se révise (spécification E2E-essai, lot 4 ; décision 0126) : état de la réécriture du programme
   * après les « Pas pour moi », rendu sous le titre à la place de la phrase « choix sans effet ».
   */
  revision?: ReactNode;
  /**
   * Bandeau rendu juste sous le titre (cases `noOption` de l'aperçu, B2-PO-9 ; décision 0133) : le focus est posé sur
   * le titre en fin de paquet, un lecteur d'écran le lit donc ensuite. Le bandeau n'a pas de rôle propre.
   */
  notice?: ReactNode;
}

const TITLES: Record<DeckEndVariant, string> = { apercu: t.apercu, suite: t.suite, vide: t.vide };

/**
 * Fin du paquet, état vide (F6-PO-13, textes provisoires UX/UI). Aperçu : « Débloquer » et « Voir le
 * programme », sans prix (Q2) ; suite du tri et paquet vide : « Voir le programme ». Sans paiement simulé
 * disponible, « Débloquer » n'est pas rendu et le reste est inchangé (F9-PO-19).
 */
export function DeckEnd({ variant, tripId, canUnlock = true, titleRef, closed = false, notAllSorted = false, choixSansEffet = false, revision, notice }: DeckEndProps) {
  const programme = `/voyages/${encodeURIComponent(tripId)}`;
  return (
    <section
      data-deck-end={variant}
      data-deck-closed={closed ? "" : undefined}
      aria-labelledby="fin-titre"
      className="flex flex-1 flex-col justify-center gap-6"
    >
      <h2 id="fin-titre" ref={titleRef} tabIndex={-1} className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
        {(closed || notAllSorted) && variant === "suite" ? t.clos : TITLES[variant]}
      </h2>
      {notice}
      {choixSansEffet ? (
        <p data-part="choix-sans-effet" className="text-corps text-ink-2">
          {t.choixSansEffet}
        </p>
      ) : null}
      {revision}
      <div className="flex flex-col gap-3">
        {variant === "apercu" && canUnlock ? (
          <Button asChild>
            <Link href={unlockRoutes(tripId).debloquer()} prefetch={false}>{t.debloquer}</Link>
          </Button>
        ) : null}
        <Button asChild variant={variant === "apercu" ? "secondary" : "primary"}>
          <Link href={programme} prefetch={false}>{t.programme}</Link>
        </Button>
      </div>
    </section>
  );
}
