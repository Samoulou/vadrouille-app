import Link from "next/link";
import type { Ref } from "react";

import { Button } from "@/components/ligne";
import { messages } from "@/i18n";

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
}

const TITLES: Record<DeckEndVariant, string> = { apercu: t.apercu, suite: t.suite, vide: t.vide };

/**
 * Fin du paquet, état vide (F6-PO-13, textes provisoires UX/UI). Aperçu : « Débloquer » et « Voir le
 * programme », sans prix (Q2) ; suite du tri et paquet vide : « Voir le programme ». Sans paiement simulé
 * disponible, « Débloquer » n'est pas rendu et le reste est inchangé (F9-PO-19).
 */
export function DeckEnd({ variant, tripId, canUnlock = true, titleRef }: DeckEndProps) {
  const programme = `/voyages/${encodeURIComponent(tripId)}`;
  return (
    <section data-deck-end={variant} aria-labelledby="fin-titre" className="flex flex-1 flex-col justify-center gap-6">
      <h2 id="fin-titre" ref={titleRef} tabIndex={-1} className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
        {TITLES[variant]}
      </h2>
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
