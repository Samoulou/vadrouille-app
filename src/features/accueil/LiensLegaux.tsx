import Link from "next/link";

import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { titrePageLegale, type PageLegaleNom } from "./PageLegale";
import { pagesLegalesRoutes } from "./routes";

const PAGES = Object.keys(pagesLegalesRoutes) as PageLegaleNom[];

/**
 * Liens vers les trois pages légales de la précommande (décision 0168, « Conditions d'activation » ; ticket 1125).
 * À n'afficher que si `pagesLegalesDisponibles()` (`@/adapters`) est vrai : sinon les pages répondent 404.
 * `surInk` : version pour un fond `ink` (texte clair, contour de focus `quai`). `repere={false}` : simple groupe de
 * liens, sans repère de navigation, quand la page en porte déjà un du même nom (un seul repère par nom).
 */
export function LiensLegaux({
  surInk = false,
  repere = true,
  className,
}: {
  surInk?: boolean;
  repere?: boolean;
  className?: string;
}) {
  const Balise = repere ? "nav" : "div";
  return (
    <Balise
      aria-label={repere ? messages.legal.pages : undefined}
      className={cn(
        "flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6",
        className,
      )}
    >
      {PAGES.map((nom) => (
        <Link
          key={nom}
          href={pagesLegalesRoutes[nom]}
          className={cn(
            "inline-flex min-h-(--touch-target) items-center self-start rounded-control text-corps-s font-semibold underline underline-offset-2",
            surInk ? "text-on-line focus-visible:outline-quai" : "text-ink",
          )}
        >
          {titrePageLegale(nom)}
        </Link>
      ))}
    </Balise>
  );
}
