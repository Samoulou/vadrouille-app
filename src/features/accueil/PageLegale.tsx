import Link from "next/link";

import { Button } from "@/components/ligne/Button";
import { LienSource } from "@/components/ligne/LienSource";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";

import { pagesLegalesRoutes } from "./routes";

const t = messages.legal;

export type PageLegaleNom = keyof typeof pagesLegalesRoutes;

/**
 * Politiques de confidentialité des deux prestataires nommés par « Tes données et la précommande » (note d'intégration
 * de `docs/commercial/textes-legaux-prevente.md`). Liens sortants seulement : aucun appel.
 */
const LIENS: Record<string, { href: string; texte: string }> = {
  stripe: { href: "https://stripe.com/privacy", texte: t.liens.stripe },
  vercel: { href: "https://vercel.com/legal/privacy-policy", texte: t.liens.vercel },
};

/** Un bloc d'un texte de `legal.json` : paragraphe, liste, liste de ce qui est inclus (lue dans l'offre), ou lien. */
interface Bloc {
  p?: string;
  liste?: string[];
  inclus?: boolean;
  lien?: string;
}

interface Section {
  titre?: string;
  blocs: Bloc[];
}

export interface PageLegaleProps {
  page: PageLegaleNom;
  vendeur: { nom: string; statut: string; adresse: string; contact: string };
  /** Prix formaté, lu dans l'offre (`OFFER_CONFIG`) : le même que sur la page de prévente. */
  prix: string;
  /** Date de publication des textes, ISO « AAAA-MM-JJ ». */
  publication: string;
  conservation: string;
}

/** Titre d'une page légale, tel qu'il s'affiche (titre de la page, de l'onglet et des liens entre pages). */
export function titrePageLegale(page: PageLegaleNom): string {
  return format(t[page].titre, { produit: PRODUCT_NAME });
}

const LISTE = "flex list-disc flex-col gap-1 pl-5 text-corps text-ink";
const LIEN = "inline-flex min-h-(--touch-target) items-center self-start rounded-control text-corps font-bold text-ink underline underline-offset-2";

/**
 * Une des trois pages légales de la précommande (ticket 1125) : écran sans maquette, colonne étroite, composants et
 * tokens Ligne existants, comme `/precommande/merci` (décision 0168, point 7). Les textes viennent de `legal.json`,
 * repris de `docs/commercial/textes-legaux-prevente.md` ; le prix, la date d'ouverture et la liste de ce qui est
 * inclus sont ceux de la page de prévente (`prevente.json`, `OFFER_CONFIG`), jamais une recopie.
 */
export function PageLegale({ page, vendeur, prix, publication, conservation }: PageLegaleProps) {
  const valeurs = {
    produit: PRODUCT_NAME,
    vendeur: vendeur.nom,
    statut: vendeur.statut,
    adresse: vendeur.adresse,
    contact: vendeur.contact,
    prix,
    date: messages.prevente.ouverture,
    veille: t.veille,
    conservation,
    publication: formatDateLongue(publication),
  };
  const sections: Section[] = t[page].sections;
  const autres = (Object.keys(pagesLegalesRoutes) as PageLegaleNom[]).filter((nom) => nom !== page);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-10 pb-16">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{titrePageLegale(page)}</h1>
      {page === "mentions" ? null : <p className="text-corps-s text-ink-soft">{format(t.version, valeurs)}</p>}
      {sections.map((section, rang) => (
        <section key={section.titre ?? rang} className="flex flex-col gap-3">
          {section.titre ? <h2 className="mt-2 text-arret font-bold text-ink">{section.titre}</h2> : null}
          {section.blocs.map((bloc, index) => {
            if (bloc.p) {
              return (
                <p key={index} className="text-corps text-ink wrap-anywhere">
                  {format(bloc.p, valeurs)}
                </p>
              );
            }
            const liste = bloc.inclus ? messages.prevente.prix.inclus : bloc.liste;
            if (liste) {
              return (
                <ul key={index} className={LISTE}>
                  {liste.map((ligne) => (
                    <li key={ligne}>{ligne}</li>
                  ))}
                </ul>
              );
            }
            const lien = bloc.lien ? LIENS[bloc.lien] : undefined;
            return lien ? (
              <LienSource key={index} href={lien.href} nouvelOnglet={t.nouvelOnglet}>
                {lien.texte}
              </LienSource>
            ) : null;
          })}
        </section>
      ))}
      <nav aria-label={t.autresPages} className="mt-2 flex flex-col">
        {autres.map((nom) => (
          <Link key={nom} href={pagesLegalesRoutes[nom]} className={LIEN}>
            {titrePageLegale(nom)}
          </Link>
        ))}
      </nav>
      <Button asChild variant="secondary" className="w-full">
        <Link href="/">{t.retour}</Link>
      </Button>
    </main>
  );
}
