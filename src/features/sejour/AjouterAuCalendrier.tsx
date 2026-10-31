"use client";

import { useId, type MouseEvent } from "react";

import { StatusBanner } from "@/components/ligne/StatusBanner";
import { buttonClassName } from "@/components/ligne/button-variants";
import type { Day } from "@/contracts";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";

const t = messages.sejour.sejour.calendrier;

/** Lien en `aria-disabled` (hors ligne) : rendu de l'état désactivé, toujours atteignable au clavier (comme `ARIA_DISABLED`). */
const INACTIF = "aria-disabled:cursor-not-allowed aria-disabled:border-muted aria-disabled:bg-muted aria-disabled:text-ink-soft";

/**
 * Étapes qui deviennent des entrées du fichier : même règle que `entreesDuCalendrier` (`src/server/calendrier/ics.ts`,
 * que l'écran ne peut pas importer) : éléments `stop` des journées qui ne sont pas en préparation, hors engagements.
 */
export function etapesACalendrier(days: readonly Day[]): number {
  let n = 0;
  for (const day of days) {
    if (day.generating) continue;
    for (const item of day.items) if (item.type === "stop" && item.stop.commitment === undefined) n += 1;
  }
  return n;
}

/**
 * « Ajouter au calendrier » du Séjour (spécification M6 § 4 et § 7 ; décision 0157 § 1.6 point 1 ; ticket 1005, M6b) : un
 * lien (`<a href>`) vers la route du fichier `.ics`, rendu comme un bouton secondaire. Aucune étape à ajouter (toutes les
 * journées en préparation) : le seul texte « Aucune étape à ajouter pour l'instant. », sans lien. Hors ligne : lien en
 * `aria-disabled="true"`, décrit par le bandeau hors ligne, sans effet au clic. Place et style : provisoires, à valider par
 * l'UX/UI (U1) ; textes du § 7, à valider par l'UX/UI (U3).
 */
export function AjouterAuCalendrier({ href, days }: { href: string; days: readonly Day[] }) {
  const online = useOnline();
  const offlineId = `${useId()}-calendrier-hors-ligne`;
  const etapes = etapesACalendrier(days);
  const enPreparation = days.some((day) => day.generating);

  if (etapes === 0) {
    return (
      <p data-part="calendrier-vide" className="text-corps text-ink-soft">
        {t.aucuneEtape}
      </p>
    );
  }

  const bloquer = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!online) event.preventDefault();
  };

  return (
    <div data-part="calendrier" className="flex flex-col gap-2">
      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={t.horsLigne} />
        </div>
      )}
      <a
        href={href}
        data-part="ajouter-au-calendrier"
        aria-disabled={online ? undefined : true}
        aria-describedby={online ? undefined : offlineId}
        onClick={bloquer}
        className={buttonClassName({ variant: "secondary" }, `self-start ${INACTIF}`)}
      >
        {t.bouton}
      </a>
      <p className="text-corps-s text-ink-soft">{t.aide}</p>
      {enPreparation ? <p className="text-corps-s text-ink-soft">{t.enPreparation}</p> : null}
    </div>
  );
}
