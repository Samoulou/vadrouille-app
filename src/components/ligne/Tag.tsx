import type { Exception } from "@/contracts";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

export type TagKind = Exception;

export interface TagProps {
  /** Exception signalée : seules ces trois existent (pas de « Vérifié », handover § 0, règle 5). */
  kind: TagKind;
  className?: string;
}

const KIND_CLASSES: Record<TagKind, string> = {
  // Seul « À réserver » demande une action : seul à utiliser le jaune quai.
  toReserve: "bg-quai",
  toConfirm: "border-(length:--ligne-trait-controle) border-dashed border-ink bg-transparent",
  unconfirmed: "border-(length:--ligne-trait-controle) border-dashed border-ink bg-transparent",
};

/** Étiquette d'exception sur un arrêt, un repas ou un événement. Design system : components/Tag. */
export function Tag({ kind, className }: TagProps) {
  return (
    <span
      data-kind={kind}
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-tag px-2 text-etiquette font-bold text-ink",
        KIND_CLASSES[kind],
        className,
      )}
    >
      {messages.ligne.tag[kind]}
    </span>
  );
}
