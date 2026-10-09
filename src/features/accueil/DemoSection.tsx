import Link from "next/link";

import { format, messages } from "@/i18n";

export interface DemoLink {
  href: string;
  label: string;
  detail: string;
}

export interface DemoSectionProps {
  /** Destination du voyage d'exemple, lue par l'adaptateur (`getTrip`) ; absente si le voyage manque. */
  destination?: string;
  /** Les liens, dans l'ordre du parcours (D1-PO-2), puis « Débloquer » si le paiement simulé est disponible (F9-PO-17). */
  links: DemoLink[];
}

/**
 * Section « Démonstration » de la page d'accueil (spécification D1), rendue seulement avec l'adaptateur
 * `mock` (D1-PO-1). Composant serveur : reçoit la destination et les adresses, ne lit aucune donnée.
 */
export function DemoSection({ destination, links }: DemoSectionProps) {
  const t = messages.accueil.demo;
  return (
    <section aria-labelledby="demo-titre" className="flex flex-col gap-2 border-t border-hairline pt-6">
      <h2 id="demo-titre" className="text-section font-extrabold text-ink">
        {t.titre}
      </h2>
      <p className="text-corps-s text-ink-soft">{t.mention}</p>
      {destination ? <p className="text-corps text-ink">{format(t.voyage, { destination })}</p> : null}
      <ul className="flex flex-col">
        {links.map((link) => (
          <li key={link.href} className="border-b border-hairline last:border-b-0">
            <Link
              href={link.href}
              className="flex min-h-(--touch-target) flex-col justify-center gap-0.5 rounded-control py-3"
            >
              {/* Espace entre les deux lignes : nom accessible « libellé précision ». */}
              <span className="text-corps font-semibold text-line">{link.label}</span> <span className="text-corps-s text-ink-soft">{link.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
