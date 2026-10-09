import { cn } from "@/lib/utils";

export interface DeckProgressProps {
  /** Rang de la carte en cours, à partir de 1. */
  current: number;
  total: number;
  /** Nom accessible et valeur textuelle, « Proposition 4 sur 8 » (fr.json, fourni par l'appelant). */
  label: string;
  className?: string;
}

/**
 * Progression de la présentation, dessinée comme une ligne (DeckCard/preview.html) : un arrêt par
 * carte, pleins jusqu'à la carte en cours. Les arrêts sont décoratifs ; l'information est portée par
 * `role="progressbar"` et son nom (F6-PO-16). Pas de texte visible (provisoire, F6-Q1).
 */
export function DeckProgress({ current, total, label, className }: DeckProgressProps) {
  const safeTotal = Math.max(total, 1);
  const now = Math.min(Math.max(current, 1), safeTotal);
  const done = safeTotal > 1 ? ((now - 1) / (safeTotal - 1)) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={now}
      aria-valuetext={label}
      data-current={now}
      data-total={safeTotal}
      className={cn("relative flex h-(--ligne-deck-arret) min-w-0 flex-1 items-center", className)}
    >
      <span aria-hidden="true" className="absolute inset-x-0 h-(--ligne-rail) bg-outline-strong" />
      <span
        aria-hidden="true"
        data-part="fait"
        className="absolute left-0 h-(--ligne-rail) bg-line"
        style={{ width: `calc(var(--ligne-deck-arret) / 2 + (100% - var(--ligne-deck-arret)) * ${done / 100})` }}
      />
      <span aria-hidden="true" className="relative flex w-full items-center justify-between">
        {Array.from({ length: safeTotal }, (_, i) => {
          const rank = i + 1;
          return (
            <span
              key={rank}
              data-part="arret"
              data-state={rank < now ? "fait" : rank === now ? "en-cours" : "a-venir"}
              className={cn(
                "size-(--ligne-deck-arret) shrink-0 rounded-(--ligne-rayon-rond) border-(length:--ligne-deck-anneau)",
                rank < now && "border-line bg-raised",
                rank === now && "border-line bg-line",
                rank > now && "border-outline-strong bg-raised",
              )}
            />
          );
        })}
      </span>
    </div>
  );
}
