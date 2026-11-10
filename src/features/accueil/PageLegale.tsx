import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ligne/Button";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";

import { pagesLegalesRoutes } from "./routes";

const t = messages.legal;

export type PageLegaleNom = keyof typeof pagesLegalesRoutes;

/**
 * Politiques de confidentialité des deux prestataires nommés par « Tes données et la précommande » (note d'intégration
 * de `docs/commercial/textes-legaux-prevente.md`). Liens sortants seulement : aucun appel. Adresses ouvertes et
 * vérifiées le 2026-11-10 (Stripe : version suisse en français).
 */
export const LIENS_LEGAUX: Record<keyof typeof t.liens, string> = {
  stripe: "https://stripe.com/fr-ch/privacy",
  vercel: "https://vercel.com/legal/privacy-policy",
};

function estLienLegal(nom: string): nom is keyof typeof t.liens {
  return Object.hasOwn(LIENS_LEGAUX, nom);
}

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

/**
 * Veille d'une date écrite comme la date d'ouverture de `prevente.json` (« 1er février 2027 » → « 31 janvier 2027 ») :
 * le dernier jour du remboursement sur demande se calcule depuis la date d'ouverture, seule source, jamais une
 * recopie. Une date illisible lève une erreur : la page ne s'affiche pas avec une date fausse.
 */
export function veilleDe(dateEnLettres: string): string {
  const dates = messages.ligne.dates;
  const morceaux = /^(\d{1,2})(?:er)? (\S+) (\d{4})$/.exec(dateEnLettres);
  const mois = morceaux ? dates.mois.indexOf(morceaux[2] ?? "") : -1;
  if (!morceaux || mois < 0) throw new Error("Date d'ouverture illisible : la veille ne peut pas être calculée.");
  const veille = new Date(Date.UTC(Number(morceaux[3]), mois, Number(morceaux[1]) - 1));
  const deux = (valeur: number) => String(valeur).padStart(2, "0");
  return formatDateLongue(`${veille.getUTCFullYear()}-${deux(veille.getUTCMonth() + 1)}-${deux(veille.getUTCDate())}`);
}

const TEXTE = "text-corps text-ink wrap-anywhere";
const LIEN = "rounded-control text-corps font-bold text-ink underline underline-offset-2 wrap-anywhere";
const LIEN_BLOC = `inline-flex min-h-(--touch-target) items-center self-start ${LIEN}`;
const CONTACT = "{contact}";

/**
 * Une des trois pages légales de la précommande (ticket 1125) : écran sans maquette, colonne étroite, composants et
 * tokens Ligne existants, comme `/precommande/merci` (décision 0168, point 7). Les textes viennent de `legal.json`,
 * repris de `docs/commercial/textes-legaux-prevente.md` ; le prix, la date d'ouverture, sa veille et la liste de ce
 * qui est inclus sont ceux de la page de prévente (`prevente.json`, `OFFER_CONFIG`), jamais une recopie.
 */
export function PageLegale({ page, vendeur, prix, publication, conservation }: PageLegaleProps) {
  const valeurs = {
    produit: PRODUCT_NAME,
    vendeur: vendeur.nom,
    statut: vendeur.statut,
    adresse: vendeur.adresse,
    prix,
    date: messages.prevente.ouverture,
    veille: veilleDe(messages.prevente.ouverture),
    conservation,
    publication: formatDateLongue(publication),
  };
  /** Paragraphe : `{contact}` devient un lien `mailto:` (adresse visible, sans objet ni corps), le reste du texte. */
  const paragraphe = (modele: string): ReactNode => {
    const seul = modele.endsWith(CONTACT);
    return modele.split(CONTACT).flatMap((morceau, rang) => [
      rang === 0 ? null : (
        <a key={rang} href={`mailto:${vendeur.contact}`} className={seul ? LIEN_BLOC : LIEN}>
          {vendeur.contact}
        </a>
      ),
      format(morceau, valeurs),
    ]);
  };
  const sections: Section[] = t[page].sections;
  const autres = (Object.keys(pagesLegalesRoutes) as PageLegaleNom[]).filter((nom) => nom !== page);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-10 pb-16">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{titrePageLegale(page)}</h1>
      {page === "mentions" ? null : <p className="text-corps-s text-ink-soft tabular-nums">{format(t.version, valeurs)}</p>}
      {sections.map((section, rang) => (
        <section key={section.titre ?? rang} className="flex flex-col gap-3">
          {section.titre ? <h2 className="mt-2 text-section font-extrabold text-ink">{section.titre}</h2> : null}
          {section.blocs.map((bloc, index) => {
            if (bloc.p) {
              return (
                <p key={index} className={TEXTE}>
                  {paragraphe(bloc.p)}
                </p>
              );
            }
            const liste = bloc.inclus ? messages.prevente.prix.inclus : bloc.liste;
            if (liste) {
              return (
                <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
                  {liste.map((ligne) => (
                    <li key={ligne} className={TEXTE}>
                      {ligne}
                    </li>
                  ))}
                </ul>
              );
            }
            if (!bloc.lien || !estLienLegal(bloc.lien)) throw new Error("Bloc de texte légal inconnu.");
            return (
              <a key={index} href={LIENS_LEGAUX[bloc.lien]} target="_blank" rel="noopener noreferrer" className={LIEN_BLOC}>
                {t.liens[bloc.lien]}
                <span className="sr-only">{t.nouvelOnglet}</span>
              </a>
            );
          })}
        </section>
      ))}
      <nav aria-label={t.autresPages} className="mt-2 flex flex-col">
        {autres.map((nom) => (
          <Link key={nom} href={pagesLegalesRoutes[nom]} className={LIEN_BLOC}>
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
