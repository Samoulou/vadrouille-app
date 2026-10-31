"use client";

import { DayLine } from "@/components/ligne/DayLine";
import { DAY_LIST_ID } from "@/features/sejour/constants";
import { useTripShell } from "@/features/sejour/TripShell";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

/** Ligne du jour : toucher une étape ouvre sa fiche (paramètre `etape`), qui la sélectionne sur la carte. */
export function JourCarteVilles() {
  const { day, routes } = useTripShell();
  if (!day) return null;
  return (
    <div id={DAY_LIST_ID} tabIndex={-1} className="px-4 pt-4">
      <h1 className="sr-only">{messages.dev.carte.titre}</h1>
      <h2 className="sr-only">{format(messages.dev.carte.liste, { n: day.index })}</h2>
      <DayLine items={day.items} getStopHref={(stop) => routes.etape(day.index, stop.id)} />
    </div>
  );
}
