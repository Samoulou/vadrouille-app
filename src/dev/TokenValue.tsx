"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Affiche la valeur calculée d'une variable CSS, lue dans globals.css. */
export function TokenValue({ variable }: { variable: string }) {
  const value = useSyncExternalStore(
    subscribe,
    () => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    () => "",
  );

  return (
    <span className="text-legende text-ink-soft tabular-nums" data-token-value={variable}>
      {value}
    </span>
  );
}
