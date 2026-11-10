import type { ReactNode } from "react";

import { DayLine } from "@/components/ligne/DayLine";
import { Tag, type TagKind } from "@/components/ligne/Tag";
import { IconPlus } from "@/components/ligne/icons";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { EXEMPLE } from "./Landing";

const t = messages.prevente;
const exemple = messages.accueil.exemple;

/** Plaques de la palette fermée des destinations (design system : DestinationPlate). */
const PLAQUES: Record<string, string> = {
  bruyere: "bg-dest-bruyere",
  azulejo: "bg-dest-azulejo",
  ocre: "bg-dest-ocre",
  granit: "bg-dest-granit",
};

/** Étiquettes d'exception citées dans les textes (« À confirmer », « Non confirmé ») : rendues par le vrai `Tag`. */
const ETIQUETTES = new Map<string, TagKind>(
  (["toConfirm", "unconfirmed"] as const).map((kind) => [
    messages.ligne.tag[kind],
    kind,
  ]),
);

/** Titrage : grotesque étroite, graisse maximale (décision 0170). Une seule voix pour tous les titres de la page. */
const TITRE =
  "font-(family-name:--font-titrage) font-extrabold font-stretch-85%";
const TITRE_SECTION = cn(
  TITRE,
  "relative text-[clamp(2.25rem,6vw,4rem)] leading-none",
);
const LARGEUR = "mx-auto w-full max-w-6xl px-5 sm:px-8";
/** Deux colonnes : le rail de la page, puis le contenu. Les repères ci-dessous en reprennent les mesures. */
const VOIE =
  "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 lg:grid-cols-[1.75rem_minmax(0,1fr)] lg:gap-x-8";
/** Place un repère sur le rail depuis un titre de la colonne de contenu, à mi-hauteur de sa première ligne. */
const SUR_LE_RAIL =
  "absolute top-[0.5em] -left-[1.375rem] -translate-x-1/2 -translate-y-1/2 lg:-left-[2.875rem]";

/** Sur fond `ink`, l'anneau de focus `line` ne se lit pas : il passe en `quai` (revue de la PR 1102). */
const FOCUS_SUR_INK = "focus-visible:outline-quai";

export interface LandingPreventeProps {
  /** Adresse du bouton « Précommander » (`/precommande`, avec la provenance). */
  href: string;
  /** Prix formaté, lu dans l'offre (`OFFER_CONFIG`). */
  prix: string;
  /** Section « Démonstration » (données simulées), quand elle existe. */
  demo?: ReactNode;
}

/**
 * Bouton « Précommander » : le seul aplat `quai` de la page avec l'étiquette d'ouverture (le jaune veut dire
 * « agis »). Lien `<a>` et non `Link` : la cible est une redirection vers le paiement, que le routeur ne doit pas
 * précharger.
 */
function Precommander({
  href,
  prix,
  className,
}: {
  href: string;
  prix: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-h-14 items-center justify-center rounded-control bg-quai px-6 py-2 text-center text-arret font-extrabold text-ink sm:px-8",
        className,
      )}
    >
      {format(t.precommander, { prix })}
    </a>
  );
}

/** Arrêt du rail de la page : le même anneau que sur la ligne du jour. */
function Arret({ sombre = false }: { sombre?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        SUR_LE_RAIL,
        "size-5 rounded-full border-4",
        sombre ? "border-on-line bg-ink" : "border-line bg-raised",
      )}
    />
  );
}

/** Un tronçon de la page : le rail à gauche sur toute la hauteur, le contenu à droite. */
function Troncon({
  titreId,
  className,
  children,
}: {
  titreId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titreId} className={className}>
      <div className={cn(LARGEUR, VOIE)}>
        <div aria-hidden="true" className="relative">
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-line" />
        </div>
        <div className="flex flex-col gap-10 py-16 lg:py-24">{children}</div>
      </div>
    </section>
  );
}

/** Remplace « À confirmer » et « Non confirmé » entre guillemets par l'étiquette telle qu'elle apparaît dans le programme. */
function avecEtiquettes(texte: string): ReactNode[] {
  return texte.split(/(« [^»]+ »)/).map((morceau, index) => {
    const kind = ETIQUETTES.get(morceau.slice(2, -2));
    return kind ? (
      <Tag key={index} kind={kind} className="mx-0.5 align-middle" />
    ) : (
      morceau
    );
  });
}

/** Illustrations des trois gestes : fragments de l'application, décoratifs (aucun contrôle réel). */
const GESTES: readonly ReactNode[] = [
  <p
    key="recit"
    className="rounded-control border-(length:--ligne-trait-controle) border-border-control bg-raised p-4 text-arret font-normal text-ink"
  >
    {t.etapes.exemple.recit}
  </p>,
  <div
    key="tri"
    className="flex flex-col gap-4 rounded-plate border border-outline bg-raised p-4"
  >
    <div className="flex flex-col gap-1">
      <span className="text-arret font-bold text-ink">
        {exemple.etapes.diner.nom}
      </span>
      <span className="text-corps-s text-ink-soft">
        {exemple.etapes.diner.raison}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <span className="flex min-h-11 items-center justify-center rounded-control border-(length:--ligne-trait-controle) border-ink text-corps font-bold text-ink">
        {messages.presentation.actions.dislike}
      </span>
      <span className="flex min-h-11 items-center justify-center rounded-control bg-line text-corps font-bold text-on-line">
        {messages.presentation.actions.like}
      </span>
    </div>
  </div>,
  <div
    key="depart"
    className="flex items-center gap-3 rounded-plate border border-outline bg-raised p-4"
  >
    <span className="text-corps font-bold text-ink tabular-nums">
      {t.etapes.exemple.heure}
    </span>
    <span className="min-w-0 flex-1 text-arret font-bold text-ink">
      {exemple.etapes.diner.nom}
    </span>
    <Tag kind="toReserve" />
  </div>,
];

/**
 * Page de précommande (décisions 0168 et 0170 ; textes : `docs/commercial/page-prevente.md`). Composant serveur,
 * aucun JavaScript client. La page est elle-même une ligne : un rail part du terminus à côté du nom, passe par un
 * arrêt à chaque section et finit au terminus du dernier appel. Pas de halo, pas d'ombre, pas d'inclinaison : la
 * profondeur vient des aplats, comme dans Ligne.
 */
export function LandingPrevente({ href, prix, demo }: LandingPreventeProps) {
  const date = t.ouverture;
  const produit = PRODUCT_NAME;
  return (
    <main className="flex min-h-dvh flex-col bg-page">
      {/* 1. Départ */}
      <section className="overflow-hidden bg-ink text-on-line">
        <div className={cn(LARGEUR, VOIE)}>
          <div aria-hidden="true" className="relative">
            <span className="absolute top-[2.875rem] bottom-0 left-1/2 w-1 -translate-x-1/2 bg-on-line" />
            <span className="absolute top-[2.875rem] left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-(--ligne-rayon-terminus) bg-on-line" />
          </div>
          <div className="flex flex-col gap-12 pt-6 lg:gap-16">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className={cn(TITRE, "text-titre-jour")}>{produit}</p>
              <p className="rounded-tag bg-quai px-2 text-etiquette font-bold text-ink">
                {t.bandeau}
              </p>
            </div>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
              <div className="flex flex-col gap-7 lg:pb-24">
                <h1
                  className={cn(
                    TITRE,
                    "text-[clamp(3.25rem,9.5vw,7rem)] leading-[0.92]",
                  )}
                >
                  <span className="block">{t.titre.avant} </span>
                  {t.titre.accent}
                </h1>
                <p className="max-w-xl text-arret font-normal">
                  {format(t.sousTitre, { produit })}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Precommander
                    href={href}
                    prix={prix}
                    className={FOCUS_SUR_INK}
                  />
                  {demo ? (
                    <a
                      href="#demonstration"
                      className={cn(
                        "inline-flex min-h-14 items-center justify-center rounded-control border-(length:--ligne-trait-controle) border-on-line px-6 py-2 text-center text-arret font-bold sm:px-8",
                        FOCUS_SUR_INK,
                      )}
                    >
                      {t.demo}
                    </a>
                  ) : null}
                </div>
                <ul
                  role="list"
                  className="flex flex-col gap-1 text-corps-s font-semibold sm:flex-row sm:gap-0"
                >
                  {t.atouts.map((atout) => (
                    <li
                      key={atout}
                      className="sm:border-l sm:border-on-line sm:px-3 sm:first:border-l-0 sm:first:pl-0"
                    >
                      {atout}
                    </li>
                  ))}
                </ul>
              </div>
              <figure className="flex w-full max-w-md flex-col gap-4 self-end rounded-t-sheet bg-page px-5 pt-3 pb-8 text-ink">
                <span
                  aria-hidden="true"
                  className="mx-auto h-1 w-10 rounded-full bg-outline-strong"
                />
                <figcaption className="text-legende text-ink-soft">
                  {t.telephone.etiquette}
                </figcaption>
                <div className="flex flex-col gap-1 rounded-plate bg-dest-azulejo p-4 text-on-line">
                  <span className="text-corps-s font-semibold">
                    {t.telephone.jour}
                  </span>
                  <span className="text-titre-jour font-extrabold tracking-tight">
                    {exemple.ville}
                  </span>
                </div>
                <DayLine items={EXEMPLE} />
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Destinations : un tableau des départs */}
      <Troncon titreId="destinations-titre">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 id="destinations-titre" className={cn(TITRE_SECTION, "text-ink")}>
            <Arret />
            {t.destinations.titre}
          </h2>
          <p className="text-arret font-normal text-ink-soft">
            {t.destinations.texte}
          </p>
        </div>
        <table className="w-full border-collapse text-left">
          <caption className="pb-3 text-left text-corps-s font-semibold text-ink-soft">
            {t.destinations.legende}
          </caption>
          <thead>
            <tr className="border-y-2 border-ink text-corps-s text-ink">
              <th scope="col" className="py-2 pr-3 font-bold">
                {t.destinations.colonnes.quand}
              </th>
              <th scope="col" className="py-2 pr-3 font-bold">
                {t.destinations.colonnes.ou}
              </th>
              <th scope="col" className="py-2 text-right font-bold">
                {t.destinations.colonnes.duree}
              </th>
            </tr>
          </thead>
          <tbody>
            {t.destinations.liste.map((destination) => (
              <tr key={destination.nom} className="border-b border-hairline">
                <td className="py-4 pr-3 text-corps font-semibold text-ink-soft sm:text-arret">
                  {destination.quand}
                </td>
                <th scope="row" className="py-4 pr-3 font-normal">
                  <span
                    className={cn(
                      TITRE,
                      "inline-block rounded-badge px-3 py-1 text-[clamp(1.5rem,5.5vw,3rem)] leading-none text-on-line",
                      PLAQUES[destination.couleur],
                    )}
                  >
                    {destination.nom}
                  </span>
                </th>
                <td className="py-4 text-right text-corps font-bold whitespace-nowrap text-ink tabular-nums sm:text-arret">
                  {destination.duree}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Troncon>

      {/* 3. Trois gestes : trois arrêts sur le rail */}
      <Troncon titreId="etapes-titre" className="bg-muted">
        <h2 id="etapes-titre" className={cn(TITRE_SECTION, "text-ink")}>
          <Arret />
          {t.etapes.titre}
        </h2>
        <ol role="list" className="flex flex-col gap-12 lg:gap-16">
          {t.etapes.liste.map((etape, index) => (
            <li
              key={etape.titre}
              className="grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-16"
            >
              <div className="flex flex-col gap-2">
                <h3 className={cn(TITRE, "relative text-titre-fiche text-ink")}>
                  <Arret />
                  <span className="text-ink-soft tabular-nums">
                    {index + 1}
                  </span>{" "}
                  {etape.titre}
                </h3>
                <p className="max-w-md text-arret font-normal text-ink-soft">
                  {etape.texte}
                </p>
              </div>
              <div aria-hidden="true" className="max-w-md">
                {GESTES[index]}
              </div>
            </li>
          ))}
        </ol>
      </Troncon>

      {/* 4. Ce que le produit cherche à garantir : une légende, pas des cartes */}
      <Troncon titreId="vise-titre">
        <h2 id="vise-titre" className={cn(TITRE_SECTION, "max-w-3xl text-ink")}>
          <Arret />
          {format(t.vise.titre, { produit })}
        </h2>
        <dl className="border-t-2 border-ink">
          {t.vise.liste.map((point) => (
            <div
              key={point.titre}
              className="grid gap-2 border-b border-hairline py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-8"
            >
              <dt className={cn(TITRE, "text-titre-fiche text-ink")}>
                {point.titre}
              </dt>
              <dd className="max-w-2xl text-arret leading-7 font-normal text-ink-soft">
                {avecEtiquettes(point.texte)}
              </dd>
            </div>
          ))}
        </dl>
      </Troncon>

      {/* 5. Le billet */}
      <Troncon titreId="prix-titre" className="bg-muted">
        <div className="grid overflow-hidden rounded-plate border-2 border-ink bg-raised lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col justify-between gap-10 bg-ink p-6 text-on-line lg:p-10">
            <div className="flex flex-col gap-3">
              <p className="text-corps font-bold">{t.prix.surtitre}</p>
              <h2 id="prix-titre" className="relative flex flex-col gap-1">
                <span
                  className={cn(
                    TITRE,
                    "text-[clamp(4.5rem,14vw,8rem)] leading-[0.85] tabular-nums",
                  )}
                >
                  {prix}
                </span>
                <span className="text-arret font-semibold">{t.prix.unite}</span>
              </h2>
            </div>
            <div className="flex flex-col gap-3 text-corps">
              <p className="font-bold">{t.prix.paiementUnique}</p>
              <p>{format(t.prix.utilisable, { date })}</p>
              <p>{format(t.prix.rembourse, { date })}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6 border-t-2 border-dashed border-ink p-6 lg:border-t-0 lg:border-l-2 lg:p-10">
            <h3 className="text-section font-extrabold text-ink">
              {t.prix.inclusTitre}
            </h3>
            <ul role="list" className="border-t border-hairline">
              {t.prix.inclus.map((ligne) => (
                <li
                  key={ligne}
                  className="border-b border-hairline py-3 text-arret font-normal text-ink"
                >
                  {ligne}
                </li>
              ))}
            </ul>
            <Precommander
              href={href}
              prix={prix}
              className="self-stretch sm:self-start"
            />
            <div className="flex flex-col gap-1">
              <p className="text-corps-s text-ink-soft">{t.prix.moyens}</p>
              <p className="text-corps-s text-ink-soft">{t.prix.sansAide}</p>
            </div>
          </div>
        </div>
      </Troncon>

      {/* 6. Questions */}
      <Troncon titreId="faq-titre">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <h2 id="faq-titre" className={cn(TITRE_SECTION, "text-ink")}>
            <Arret />
            {t.faq.titre}
          </h2>
          <div className="border-t-2 border-ink">
            {t.faq.liste.map((entree) => (
              <details
                key={entree.question}
                className="group border-b border-hairline"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-arret font-bold text-ink [&::-webkit-details-marker]:hidden">
                  {format(entree.question, { produit })}
                  <IconPlus
                    aria-hidden="true"
                    className="size-5 shrink-0 text-ink group-open:rotate-45"
                  />
                </summary>
                <p className="max-w-2xl pb-5 text-arret font-normal text-ink-soft">
                  {format(entree.reponse, { date, produit })}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Troncon>

      {/* 7. Terminus */}
      <section
        aria-labelledby="final-titre"
        className="overflow-hidden bg-ink text-on-line"
      >
        <div className={cn(LARGEUR, VOIE)}>
          <div aria-hidden="true" />
          <div className="flex flex-col items-start gap-6 py-20 lg:py-28">
            <h2
              id="final-titre"
              className={cn(
                TITRE,
                "relative max-w-4xl text-[clamp(2.75rem,8vw,6rem)] leading-[0.9]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  SUR_LE_RAIL,
                  "h-screen w-1 -translate-y-full bg-on-line",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  SUR_LE_RAIL,
                  "size-5 rounded-(--ligne-rayon-terminus) bg-on-line",
                )}
              />
              {t.final.titre}
            </h2>
            <p className="max-w-2xl text-arret font-normal">{t.final.texte}</p>
            <Precommander href={href} prix={prix} className={FOCUS_SUR_INK} />
          </div>
        </div>
      </section>

      {demo ? (
        <div id="demonstration" className={cn(LARGEUR, "max-w-2xl py-12")}>
          {demo}
        </div>
      ) : null}
    </main>
  );
}
