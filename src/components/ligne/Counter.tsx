import { cn } from "@/lib/utils";

export interface CounterProps {
  /** Nombre d'actions requises. À 0, rien n'est affiché : pas de jaune sans action requise. */
  value: number;
  /** Nom accessible fourni par l'appelant (« 4 réservations à faire »), avec le nombre. */
  label: string;
  className?: string;
}

/** Compteur jaune des actions requises, à côté d'un titre. Design system : components/Tag, variante compteur. */
export function Counter({ value, label, className }: CounterProps) {
  if (value <= 0) {
    return null;
  }
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-tag bg-quai px-1.5 text-legende font-extrabold text-ink tabular-nums",
        className,
      )}
    >
      {value}
    </span>
  );
}
