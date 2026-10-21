import { useId } from "react";

import type { StopFacts } from "@/contracts";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

const t = messages.ligne.infosPratiques;

export interface PracticalNotesProps {
  /** Faits de l'étape : seuls `tip`, `priceNote` et `hoursNote` sont lus (décision 0116 § 6, lot 1 bis). */
  facts: Pick<StopFacts, "tip" | "priceNote" | "hoursNote">;
  /** Niveau du titre « Infos pratiques » : 2 sous un titre de niveau 1 (fiche), 3 dans une feuille titrée en 2. */
  headingLevel?: 2 | 3;
  className?: string;
}

/** Lignes affichées, dans l'ordre conseil, prix, horaires ; une valeur absente n'a pas de ligne. */
export function practicalNotesRows(facts: PracticalNotesProps["facts"]): { key: "tip" | "priceNote" | "hoursNote"; label: string; text: string }[] {
  const rows = [
    { key: "tip" as const, label: t.conseil, text: facts.tip },
    { key: "priceNote" as const, label: t.prix, text: facts.priceNote },
    { key: "hoursNote" as const, label: t.horaires, text: facts.hoursNote },
  ];
  return rows.filter((row): row is { key: typeof row.key; label: string; text: string } => typeof row.text === "string" && row.text.length > 0);
}

/**
 * Infos pratiques d'une étape (conseil, prix, horaires), sous le « pourquoi ». Textes maison, affichés **en texte
 * brut** (nœuds texte React : jamais de lien, de Markdown ni de HTML ; décisions 0094 § 7 et 0103). Mention fixe
 * sous la liste (PPI-PO-5, texte proposé par l'UX/UI en revue). Ces champs ne viennent que du programme rédigé par
 * notre outil : la recherche web du MVP ne peut pas les porter (`CandidatTrouve` les refuse, décision 0103), la mention
 * ne s'affiche donc jamais pour une info sourcée par `Stop.source`. Sans aucune valeur : rien n'est rendu.
 */
export function PracticalNotes({ facts, headingLevel = 2, className }: PracticalNotesProps) {
  const id = useId();
  const rows = practicalNotesRows(facts);
  if (rows.length === 0) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} data-part="infos-pratiques" className={cn("flex flex-col gap-2", className)}>
      <Heading id={id} className="text-corps-s font-bold text-ink-2">
        {t.titre}
      </Heading>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} data-part={`info-${row.key}`} className="flex flex-col">
            <dt className="text-corps-s font-semibold text-ink-soft">{row.label}</dt>
            <dd className="text-corps text-ink tabular-nums">{row.text}</dd>
          </div>
        ))}
      </dl>
      <p data-part="mention-infos" className="text-legende text-ink-soft">
        {t.mention}
      </p>
    </section>
  );
}
