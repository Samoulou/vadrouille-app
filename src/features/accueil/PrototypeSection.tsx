import Link from "next/link";

import type { TripSummary } from "@/contracts";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

export interface PrototypeSectionProps {
  /** Voyages du prototype, lus par l'adaptateur `prototype` (`listTrips`) ; la page ne rend pas la section sans voyage. */
  trips: TripSummary[];
}

/**
 * Section « Prototype » de la page d'accueil (spécification P0, P0-PO-11), sur le modèle de la section
 * « Démonstration » (D1), rendue seulement avec l'adaptateur `prototype` : titre, mention d'attribution, et pour
 * chaque voyage un lien vers sa présentation et un lien vers son Séjour. Composant serveur, ne lit aucune donnée.
 */
export function PrototypeSection({ trips }: PrototypeSectionProps) {
  const t = messages.accueil.prototype;
  return (
    <section aria-labelledby="prototype-titre" className="flex flex-col gap-2 border-t border-hairline pt-6">
      <h2 id="prototype-titre" className="text-section font-extrabold text-ink">
        {t.titre}
      </h2>
      <p className="text-corps-s text-ink-soft">{t.mention}</p>
      {trips.map((trip) => {
        const links = [
          { key: "presentation", href: presentationRoute(trip.id), label: t.liens.presentation.libelle, detail: t.liens.presentation.precision },
          { key: "sejour", href: tripRoutes("/voyages", trip.id).sejour(), label: t.liens.sejour.libelle, detail: t.liens.sejour.precision },
        ];
        const voyageId = `prototype-${trip.id}`;
        return (
          <div key={trip.id} className="flex flex-col gap-1">
            <p id={voyageId} className="text-corps text-ink">
              {format(t.voyage, { destination: trip.destination })}
            </p>
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.href} className="border-b border-hairline last:border-b-0">
                  {/* Nom accessible « libellé précision, Voyage : destination » : distinct d'un voyage à l'autre. */}
                  <Link
                    id={`${voyageId}-${link.key}`}
                    href={link.href}
                    aria-labelledby={`${voyageId}-${link.key} ${voyageId}`}
                    className="flex min-h-(--touch-target) flex-col justify-center gap-0.5 rounded-control py-3"
                  >
                    {/* Espace entre les deux lignes : nom accessible « libellé précision ». */}
                    <span className="text-corps font-semibold text-line">{link.label}</span> <span className="text-corps-s text-ink-soft">{link.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
