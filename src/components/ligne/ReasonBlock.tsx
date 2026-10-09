import { format, messages } from "@/i18n";
import { formatDateLongue } from "@/lib/dates";
import { cn } from "@/lib/utils";

const t = messages.ligne.raison;

export interface ReasonBlockProps {
  /** Justification : commence par ce que la personne a choisi, deux phrases au plus. */
  text: string;
  sourceLabel: string;
  /** Lien de la source, obligatoire (README : « toujours une source »). */
  sourceUrl: string;
  /** Date ISO de consultation de la source, affichée sous le bloc. */
  verifiedAt?: string;
  className?: string;
}

/**
 * Bloc « Pourquoi pour toi » : justification et source. Design system : components/ReasonBlock.
 * La date de consultation est sous le bloc, en `legende` `ink-soft` ; jamais le mot « Vérifié » (F5-PO-9).
 */
export function ReasonBlock({ text, sourceLabel, sourceUrl, verifiedAt, className }: ReasonBlockProps) {
  return (
    <div data-part="raison" className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-1.5 rounded-block bg-muted px-(--ligne-bloc-marge-h) py-(--ligne-bloc-marge-v)">
        <p className="text-(length:--ligne-texte-bloc) leading-(--ligne-texte-bloc-interligne) font-extrabold text-ink">
          {t.titre}
        </p>
        <p className="text-corps text-ink-2">{text}</p>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-part="source"
          className="flex min-h-(--touch-target) items-center self-start text-corps-s font-semibold text-ink underline underline-offset-2"
        >
          {format(t.source, { label: sourceLabel })}
        </a>
      </div>
      {verifiedAt ? (
        <p data-part="consultee" className="text-legende text-ink-soft tabular-nums">
          {format(t.consultee, { date: formatDateLongue(verifiedAt) })}
        </p>
      ) : null}
    </div>
  );
}
