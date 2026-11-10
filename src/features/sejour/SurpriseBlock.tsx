"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { ReasonBlock } from "@/components/ligne/ReasonBlock";
import type { SurpriseIdea } from "@/contracts";
import * as messages from "@/i18n/messages";
import { formatFaits } from "@/lib/faits";

const t = messages.sejour.surprise;

/**
 * « Surprends-moi » (écran 12, cadrage § 3.4 ; F5-PO-5) : dévoile l'idée du jour sous le bouton, précédée de
 * la mention « Une idée pour ta journée, pas encore dans ton programme. » (décision 0018 § 4), sans
 * l'ajouter au programme. Le focus reste sur le bouton ; l'idée n'est gardée qu'en mémoire. Sur un voyage débloqué
 * (`mock`, `api`), l'idée dévoilée a « Ajouter à ma journée » vers « Ajouter un lieu » avec `?idee=` (F7-PO-8, M5d-2).
 */
export function SurpriseBlock({ idea, addHref = null }: { idea: SurpriseIdea; addHref?: string | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const faits = formatFaits(idea.facts);

  return (
    <div data-part="surprise" className="flex flex-col items-start gap-3">
      <Button variant="secondary" size="sm" data-part="surprise-bouton" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {t.bouton}
      </Button>
      <div id={panelId} className="flex w-full flex-col gap-2">
        {open ? (
          <>
            <p data-part="surprise-mention" className="text-corps-s text-ink-soft">
              {t.mention}
            </p>
            <h3 className="text-arret font-bold text-ink">{idea.name}</h3>
            {faits ? <p className="text-corps-s text-ink-soft">{faits}</p> : null}
            <ReasonBlock
              text={idea.reason}
              sourceLabel={idea.source.label}
              sourceUrl={idea.source.url}
              verifiedAt={idea.verifiedAt}
            />
            {addHref === null ? null : (
              <Button asChild variant="secondary" size="sm">
                <Link href={addHref} data-part="ajouter-a-ma-journee">
                  {t.ajouterAMaJournee}
                </Link>
              </Button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
