import Link from "next/link";
import type { ReactNode } from "react";

import { Button, StatusBanner, Tag, type StatusBannerKind, type TagKind } from "@/components/ligne";
import { format, messages } from "@/i18n";
import { formatDuree } from "@/lib/duree";

const t = messages.etats.catalogue;

/** Adresses des deux pages montrées par un lien (décision 0021 § 8) : une adresse inexistante, une page qui lève. */
export const ETATS_ROUTES = {
  introuvable: "/adresse-inexistante",
  erreur: "/dev/etats/erreur",
} as const;

/**
 * Message de l'erreur levée par `/dev/etats/erreur`, avec un identifiant factice : les tests vérifient qu'il
 * n'apparaît jamais dans la page d'erreur (critère C30).
 */
export const DEV_ERROR_MESSAGE = "Erreur volontaire du catalogue des états (voyage mock_trip_secret_7f3a)";

/** Les étiquettes d'exception de l'écran 18 : leur texte vient du composant `Tag` (`ligne.tag.*`). */
const TAGS = ["toConfirm", "unconfirmed"] as const satisfies readonly TagKind[];

interface BannerState {
  kind: StatusBannerKind;
  message: string;
  /** Clé d'exemple de `/dev/composants`, tant que l'écran propriétaire n'est pas livré (décision 0021 § 8). */
  example: boolean;
}

const examples = messages.dev.composants.exemples.bandeaux;

/**
 * Table état → clé de `fr.json` (décision 0021 § 8) : aucun texte n'est recopié. Point de revue : la PR qui
 * crée la clé propriétaire d'un texte d'exemple (F7, F8, F10) met cette table à jour.
 */
const BANNERS: BannerState[] = [
  // Propriétaire : F10 (hors ligne, handover § 13), pas encore livré.
  { kind: "offline", message: examples.offline, example: true },
  // Propriétaire : F7 (« Ton programme a changé depuis cet aperçu. Rien n'a été modifié. »), pas encore livré.
  { kind: "conflict", message: examples.conflict, example: true },
  // Propriétaires : F7 et F8, pas encore livrés.
  { kind: "noOption", message: examples.noOption, example: true },
  // Erreur de calcul de redaction.md : clé propre créée par F11c.
  { kind: "error", message: messages.etats.erreurCalcul, example: false },
  // Présentation (F6) et Journée (F5) : « Jour {n} en préparation ».
  { kind: "generating", message: format(messages.presentation.generation, { n: 3 }), example: false },
  // Journée (F5a, décision 0015 § 7) : trajet du jour au-delà du budget du rythme.
  {
    kind: "travel",
    message: format(messages.sejour.journee.bandeauTrajet, { trajet: formatDuree(160), budget: formatDuree(150) }),
    example: false,
  },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-etat={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-section font-extrabold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <div>
      <Button asChild variant="text" className="-mx-2">
        <Link href={href} prefetch={false}>
          {label}
        </Link>
      </Button>
    </div>
  );
}

/**
 * Catalogue des états transverses (écran 18, F11-PO-17) : chaque état sous son titre, rendu par le composant
 * réel avec le texte de l'écran qui le possède. Sert aux captures de validation (handover § 15, F11).
 * La section « Aucun voyage » (état vide de Mes voyages) est ajoutée par F11a (décision 0021 § 8).
 */
export function EtatsShowcase() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
        <p className="text-corps-s text-ink-soft">{t.intro}</p>
      </header>

      {TAGS.map((kind) => (
        <Section key={kind} id={`etat-${kind}`} title={t.sections[kind]}>
          <div>
            <Tag kind={kind} />
          </div>
        </Section>
      ))}

      {BANNERS.map(({ kind, message, example }) => (
        <Section key={kind} id={`etat-${kind}`} title={t.sections[kind]}>
          <StatusBanner kind={kind} message={message} />
          {example ? <p className="text-legende text-ink-soft">{t.exemple}</p> : null}
        </Section>
      ))}

      <Section id="etat-introuvable" title={t.sections.introuvable}>
        <PageLink href={ETATS_ROUTES.introuvable} label={t.liens.introuvable} />
      </Section>

      <Section id="etat-erreur" title={t.sections.erreur}>
        <PageLink href={ETATS_ROUTES.erreur} label={t.liens.erreur} />
      </Section>
    </main>
  );
}
