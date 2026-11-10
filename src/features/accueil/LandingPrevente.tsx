import type { ReactNode } from "react";

import { DayLine } from "@/components/ligne/DayLine";
import { IconCoche, IconPlus } from "@/components/ligne/icons";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { EXEMPLE } from "./Landing";

const t = messages.prevente;

/** Aplats de la palette fermée des destinations (design system : DestinationPlate). */
const APLATS: Record<string, string> = {
  bruyere: "bg-dest-bruyere",
  azulejo: "bg-dest-azulejo",
  ocre: "bg-dest-ocre",
  granit: "bg-dest-granit",
};

/** Inclinaison de chaque carte de destination : un éventail, sans mouvement. */
const INCLINAISONS = [
  "-rotate-2",
  "rotate-1",
  "-rotate-1",
  "rotate-2",
] as const;

const TITRE = "font-(family-name:--font-fraunces) font-black tracking-tight";
const LARGEUR = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export interface LandingPreventeProps {
  /** Adresse du bouton « Précommander » (`/precommande`, avec la provenance). */
  href: string;
  /** Prix formaté, lu dans l'offre (`OFFER_CONFIG`). */
  prix: string;
  /** Section « Démonstration » (données simulées), quand elle existe. */
  demo?: ReactNode;
}

/**
 * Bouton « Précommander » : aplat `quai` sur fond sombre ou `ink` sur fond clair. Lien `<a>` et non `Link` : la cible
 * est une redirection vers le paiement, que le routeur ne doit pas précharger.
 */
function Precommander({
  href,
  prix,
  ton = "quai",
  className,
}: {
  href: string;
  prix: string;
  ton?: "quai" | "ink";
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-h-14 items-center justify-center rounded-full px-8 text-arret font-extrabold whitespace-nowrap",
        ton === "quai" ? "bg-quai text-ink" : "bg-ink text-on-line",
        className,
      )}
    >
      {format(t.precommander, { prix })}
    </a>
  );
}

/**
 * Page de précommande (décision 0168 ; textes : `docs/commercial/page-prevente.md`). Composant serveur, aucun
 * JavaScript client. Le vocabulaire visuel est celui de Ligne poussé à l'échelle d'une affiche : fond `ink`, rail et
 * arrêts `quai`, aplats de destination, titres en sérif de titrage.
 */
export function LandingPrevente({ href, prix, demo }: LandingPreventeProps) {
  const date = t.ouverture;
  const produit = PRODUCT_NAME;
  return (
    <main className="flex min-h-dvh flex-col bg-page">
      {/* 1. Affiche */}
      <section className="relative overflow-hidden bg-ink text-on-line">
        <div
          aria-hidden="true"
          className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-line opacity-30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-52 -left-32 size-[30rem] rounded-full bg-dest-bruyere opacity-40 blur-3xl"
        />
        <div
          className={cn(
            LARGEUR,
            "relative flex flex-col gap-12 pt-6 pb-16 lg:pb-24",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <p className={cn(TITRE, "text-titre-jour")}>{produit}</p>
            <p className="rounded-full border border-quai px-4 py-1.5 text-legende font-bold text-quai">
              {t.bandeau}
            </p>
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="flex flex-col gap-7">
              <h1
                className={cn(
                  TITRE,
                  "text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.95]",
                )}
              >
                {t.titre.avant}{" "}
                <span className="text-quai italic">{t.titre.accent}</span>
              </h1>
              <p className="max-w-xl text-arret font-normal text-on-line opacity-85">
                {format(t.sousTitre, { produit })}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Precommander href={href} prix={prix} />
                {demo ? (
                  <a
                    href="#demonstration"
                    className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-on-line px-8 text-arret font-bold"
                  >
                    {t.demo}
                  </a>
                ) : null}
              </div>
              <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
                {t.atouts.map((atout) => (
                  <li
                    key={atout}
                    className="flex items-center gap-2 text-corps-s font-semibold"
                  >
                    <IconCoche
                      aria-hidden="true"
                      className="size-4 text-quai"
                    />
                    {atout}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="mx-auto w-full max-w-sm">
              <div className="relative lg:rotate-2">
                <div className="rounded-[2.5rem] border-8 border-ink-2 bg-page p-4 text-ink shadow-2xl">
                  <div className="flex flex-col gap-1 rounded-plate bg-dest-azulejo p-4 text-on-line">
                    <span className="text-legende font-bold uppercase">
                      {t.telephone.jour}
                    </span>
                    <span className={cn(TITRE, "text-titre-jour")}>
                      {messages.accueil.exemple.ville}
                    </span>
                  </div>
                  <div className="px-1 pt-4 pb-2">
                    <DayLine items={EXEMPLE} />
                  </div>
                </div>
                <p className="absolute -bottom-4 -left-3 -rotate-3 rounded-full bg-quai px-4 py-2 text-corps-s font-extrabold text-ink shadow-xl">
                  {t.telephone.badge}
                </p>
              </div>
              <figcaption className="mt-10 text-center text-legende opacity-70">
                {t.telephone.etiquette}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 2. Destinations */}
      <section
        aria-labelledby="destinations-titre"
        className={cn(LARGEUR, "flex flex-col gap-8 py-16 lg:py-24")}
      >
        <div className="flex max-w-2xl flex-col gap-3">
          <h2
            id="destinations-titre"
            className={cn(
              TITRE,
              "text-[clamp(2rem,5vw,3.5rem)] leading-none text-ink",
            )}
          >
            {t.destinations.titre}
          </h2>
          <p className="text-arret font-normal text-ink-soft">
            {t.destinations.texte}
          </p>
        </div>
        <ul
          role="list"
          className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6"
        >
          {t.destinations.liste.map((destination, index) => (
            <li
              key={destination.nom}
              className={cn(
                "flex aspect-[4/5] flex-col justify-end gap-1 rounded-sheet p-5 text-on-line shadow-xl",
                APLATS[destination.couleur],
                INCLINAISONS[index % INCLINAISONS.length],
              )}
            >
              <span
                className={cn(
                  TITRE,
                  "text-[clamp(1.5rem,3.5vw,2.25rem)] leading-none",
                )}
              >
                {destination.nom}
              </span>
              <span className="text-corps-s font-semibold opacity-90">
                {destination.infos}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Trois gestes, reliés par la ligne */}
      <section aria-labelledby="etapes-titre" className="bg-muted">
        <div className={cn(LARGEUR, "flex flex-col gap-10 py-16 lg:py-24")}>
          <h2
            id="etapes-titre"
            className={cn(
              TITRE,
              "text-[clamp(2rem,5vw,3.5rem)] leading-none text-ink",
            )}
          >
            {t.etapes.titre}
          </h2>
          <ol
            role="list"
            className="relative grid gap-8 lg:grid-cols-3 lg:gap-6"
          >
            <span
              aria-hidden="true"
              className="absolute top-7 right-0 left-0 hidden h-1 bg-line lg:block"
            />
            {t.etapes.liste.map((etape, index) => (
              <li key={etape.titre} className="relative flex flex-col gap-4">
                <span
                  aria-hidden="true"
                  className={cn(
                    TITRE,
                    "flex size-14 items-center justify-center rounded-full border-4 border-line bg-raised text-montant text-line",
                  )}
                >
                  {index + 1}
                </span>
                <h3 className="text-montant font-extrabold text-ink">
                  {etape.titre}
                </h3>
                <p className="text-arret font-normal text-ink-soft">
                  {etape.texte}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. Ce que le produit cherche à garantir */}
      <section
        aria-labelledby="vise-titre"
        className={cn(LARGEUR, "flex flex-col gap-10 py-16 lg:py-24")}
      >
        <h2
          id="vise-titre"
          className={cn(
            TITRE,
            "max-w-3xl text-[clamp(2rem,5vw,3.5rem)] leading-none text-ink",
          )}
        >
          {format(t.vise.titre, { produit })}
        </h2>
        <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:gap-6">
          {t.vise.liste.map((point, index) => (
            <li
              key={point.titre}
              className="flex flex-col gap-3 rounded-sheet border border-outline bg-raised p-6 lg:p-8"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-14 rounded-full",
                  Object.values(APLATS)[index % 4],
                )}
              />
              <h3 className={cn(TITRE, "text-titre-fiche text-ink")}>
                {point.titre}
              </h3>
              <p className="text-arret font-normal text-ink-soft">
                {point.texte}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Le billet */}
      <section
        aria-labelledby="prix-titre"
        className={cn(LARGEUR, "pb-16 lg:pb-24")}
      >
        <div className="grid overflow-hidden rounded-sheet shadow-2xl lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col justify-between gap-8 bg-line p-8 text-on-line lg:p-12">
            <div className="flex flex-col gap-2">
              <p className="text-corps font-bold uppercase">
                {t.prix.surtitre}
              </p>
              <h2 id="prix-titre" className="flex flex-col">
                <span
                  className={cn(
                    TITRE,
                    "text-[clamp(4rem,10vw,6.5rem)] leading-none",
                  )}
                >
                  {prix}
                </span>
                <span className="text-arret font-semibold">{t.prix.unite}</span>
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-corps font-semibold">
                {t.prix.paiementUnique}
              </p>
              <p className="text-corps">
                {format(t.prix.utilisable, { date })}
              </p>
              <p className="text-corps">{format(t.prix.rembourse, { date })}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6 border-outline bg-raised p-8 lg:border-l-2 lg:border-dashed lg:p-12">
            <h3 className="text-section font-extrabold text-ink">
              {t.prix.inclusTitre}
            </h3>
            <ul role="list" className="flex flex-col gap-3">
              {t.prix.inclus.map((ligne) => (
                <li key={ligne} className="flex items-start gap-3">
                  <IconCoche
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-line"
                  />
                  <span className="text-arret font-normal text-ink">
                    {ligne}
                  </span>
                </li>
              ))}
            </ul>
            <Precommander
              href={href}
              prix={prix}
              ton="ink"
              className="self-stretch sm:self-start"
            />
            <div className="flex flex-col gap-1">
              <p className="text-corps-s text-ink-soft">{t.prix.moyens}</p>
              <p className="text-corps-s text-ink-soft">{t.prix.sansAide}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Questions */}
      <section aria-labelledby="faq-titre" className="bg-muted">
        <div
          className={cn(
            LARGEUR,
            "grid gap-8 py-16 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:py-24",
          )}
        >
          <h2
            id="faq-titre"
            className={cn(
              TITRE,
              "text-[clamp(2rem,5vw,3.5rem)] leading-none text-ink",
            )}
          >
            {t.faq.titre}
          </h2>
          <div className="flex flex-col gap-3">
            {t.faq.liste.map((entree) => (
              <details
                key={entree.question}
                className="group rounded-block bg-raised px-5"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-arret font-bold text-ink [&::-webkit-details-marker]:hidden">
                  {format(entree.question, { produit })}
                  <IconPlus
                    aria-hidden="true"
                    className="size-5 shrink-0 text-line group-open:rotate-45"
                  />
                </summary>
                <p className="pb-5 text-arret font-normal text-ink-soft">
                  {format(entree.reponse, { date, produit })}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Appel final */}
      <section
        aria-labelledby="final-titre"
        className="relative overflow-hidden bg-ink text-on-line"
      >
        <div
          aria-hidden="true"
          className="absolute -top-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-line opacity-30 blur-3xl"
        />
        <div
          className={cn(
            LARGEUR,
            "relative flex flex-col items-center gap-6 py-20 text-center lg:py-28",
          )}
        >
          <h2
            id="final-titre"
            className={cn(
              TITRE,
              "max-w-3xl text-[clamp(2.25rem,6vw,4.5rem)] leading-none",
            )}
          >
            {t.final.titre}
          </h2>
          <p className="max-w-2xl text-arret font-normal opacity-85">
            {t.final.texte}
          </p>
          <Precommander href={href} prix={prix} />
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
