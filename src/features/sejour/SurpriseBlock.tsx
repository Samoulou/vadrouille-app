"use client";

import { useId, useState } from "react";

import { Button, ReasonBlock } from "@/components/ligne";
import type { SurpriseIdea } from "@/contracts";
import { messages } from "@/i18n";

const t = messages.sejour.surprise;

/**
 * « Surprends-moi » (écran 12, cadrage § 3.4 ; F5-PO-5) : dévoile l'idée du jour sous le bouton, sans
 * l'ajouter au programme (« Ajouter à ma journée » viendra avec F7). Le focus reste sur le bouton ;
 * l'idée n'est gardée qu'en mémoire.
 */
export function SurpriseBlock({ idea }: { idea: SurpriseIdea }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div data-part="surprise" className="flex flex-col items-start gap-3">
      <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {t.bouton}
      </Button>
      <div id={panelId} className="flex w-full flex-col gap-2">
        {open ? (
          <>
            <h3 className="text-arret font-bold text-ink">{idea.name}</h3>
            <p className="text-corps-s text-ink-soft">{idea.meta}</p>
            <ReasonBlock
              text={idea.reason}
              sourceLabel={idea.source.label}
              sourceUrl={idea.source.url}
              verifiedAt={idea.verifiedAt}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
