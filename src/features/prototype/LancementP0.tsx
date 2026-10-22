"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";

import { Button } from "@/components/ligne/Button";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import type { ExecutionSuivie, ModeleLancementP0 } from "@/contracts/prototype-suivi";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { formatDuree } from "@/lib/duree";
import { lancerExecutionP0Action, type EtatLancementP0 } from "@/server/actions/p0-lancement";

const t = messages.prototype.lancement;


/** Bouton pendant le lancement : mêmes couleurs que `disabled:` de `Button`, sans retirer le bouton du focus. */
const BOUTON_EN_COURS = "aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft";
const LEGENDE_CLASS = "text-corps font-bold text-ink";
const TITRE_SECTION_CLASS = "text-section font-extrabold text-ink";
/** Région d'annonce vide, hors du flux (même règle que les formulaires de création), présente dès l'affichage. */
const REGION_VIDE_CLASS = "absolute";

const ALERTE_ID = "lancement-alerte";

/** Les trois choix du formulaire, dans l'ordre d'affichage (champ envoyé à l'action, nom du groupe). */
const CHOIX = ["brief", "variante", "mode"] as const;
type NomChoix = (typeof CHOIX)[number];
type Choix = { readonly [N in NomChoix]: string | null };
const AUCUN_CHOIX: Choix = { brief: null, variante: null, mode: null };

/** État du formulaire : statut rendu par l'action et choix envoyés avec lui (un refus se rapporte à eux). */
type EtatFormulaire = { readonly statut: EtatLancementP0["statut"]; readonly envoye: Choix };
const ETAT_INITIAL: EtatFormulaire = { statut: "attente", envoye: AUCUN_CHOIX };

/** Choix lus dans les champs cachés envoyés (champ vide : aucun choix). */
function choixEnvoyes(donnees: FormData): Choix {
  const lire = (nom: NomChoix) => {
    const valeur = donnees.get(nom);
    return typeof valeur === "string" && valeur !== "" ? valeur : null;
  };
  return { brief: lire("brief"), variante: lire("variante"), mode: lire("mode") };
}

/**
 * Lancement par l'action serveur ; l'état rendu garde les choix envoyés, lus avant l'appel. Le refus et ses groupes
 * se rapportent ainsi à l'envoi qui l'a reçu : pendant un nouvel envoi, rien ne change avant sa réponse (mineur 2 de la
 * revue du head `fbeacd6`).
 */
async function lancerAvecChoix(precedent: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  const envoye = choixEnvoyes(donnees);
  const { statut } = await lancerExecutionP0Action({ statut: precedent.statut }, donnees);
  return { statut, envoye };
}

/** `entree_invalide` avec les trois choix remplis : le serveur a refusé le brief (plus admis ou invalide). */
const briefRefuse = (etat: EtatFormulaire) => etat.statut === "entree_invalide" && CHOIX.every((nom) => etat.envoye[nom] !== null);

/**
 * Groupes signalés par un refus `entree_invalide` : ceux qui étaient vides à l'envoi ; tous remplis, le brief (refusé
 * par le serveur : plus admis ou invalide). Un groupe changé depuis l'envoi n'est plus signalé.
 */
function groupesInvalides(envoye: Choix, actuel: Choix): ReadonlySet<NomChoix> {
  const vides = CHOIX.filter((nom) => envoye[nom] === null);
  const signales = vides.length > 0 ? vides : (["brief"] as const);
  return new Set(signales.filter((nom) => actuel[nom] === envoye[nom]));
}

/** Durée écoulée au format de rédaction de Ligne (« 3 min », « 1 h 05 ») ; moins d'une minute en toutes lettres. */
function duree(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? t.suivi.moinsDUneMinute : formatDuree(minutes);
}

/** Coût en USD, à partir de micro-USD : deux décimales, virgule décimale. */
const usd = (micros: number) => format(t.suivi.montantUsd, { montant: (micros / 1_000_000).toFixed(2).replace(".", ",") });

/** Instant ISO 8601 en UTC (`AAAA-MM-JJTHH:MM:SSZ`) : « 14 octobre 2026 à 03:00 (UTC) ». */
function instantUtc(iso: string): string {
  const [date, temps] = iso.split("T");
  if (!date || !temps) return iso;
  return format(t.suivi.instantUtc, { date: formatDateLongue(date), heure: temps.slice(0, 5) });
}

/** Libellé d'une liste fermée, ou la valeur telle quelle si elle n'y est pas. */
const libelle = (liste: Readonly<Record<string, string>>, cle: string) => (Object.hasOwn(liste, cle) ? liste[cle]! : cle);

function Execution({ execution }: { execution: ExecutionSuivie }) {
  const lignes: [string, string][] = [
    [t.formulaire.mode, t.rapport.modes[execution.mode]],
    [t.suivi.statut, t.suivi.statuts[execution.statut]],
    ...(execution.phase === null ? [] : [[t.suivi.phase, libelle(t.suivi.phases, execution.phase)] as [string, string]]),
    // Coût et durée : pendant l'exécution seulement (S4 ; question ouverte 8 de 0046).
    ...(execution.coutModelesMicros === null ? [] : [[t.suivi.cout, usd(execution.coutModelesMicros)] as [string, string]]),
    ...(execution.ecouleMs === null ? [] : [[t.suivi.duree, duree(execution.ecouleMs)] as [string, string]]),
    ...(execution.codeArret === null ? [] : [[t.suivi.codeArret, libelle(t.suivi.codesArret, execution.codeArret)] as [string, string]]),
  ];
  return (
    <div className="flex flex-col gap-2 border-t-(length:--ligne-trait-controle) border-line pt-3">
      <h3 className="text-corps font-bold break-words text-ink">
        {format(t.suivi.titreExecution, { brief: execution.brief, variante: execution.variante, jour: formatDateLongue(execution.jourQuota) })}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corps-s">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="text-ink-soft">{terme}</dt>
            <dd className="min-w-0 break-words text-ink tabular-nums">{valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Page de lancement des exécutions réelles (décision 0055, section 8, ligne P0r3d ; spécification P0-suite-2,
 * « Page de lancement » ; forme : décision 0064) : choix du brief, de la variante et de la nature, lancement par
 * l'action serveur, suivi, décompte par brief et variante, date de la dernière purge, rapport de la dernière exécution
 * finie avec « Copier le rapport » (D24 : aucune donnée Google, critères en oui ou non).
 *
 * - Un seul envoi à la fois (chaque lancement réservé consomme le jour) : un second envoi est ignoré tant que le premier
 *   n'a pas répondu ; le bouton reste focalisable, `aria-disabled`, libellé « Lancement… ».
 * - Choix : trois `SegmentedControl` Ligne verticaux (décision 0064, point 2), contrôlés, sans choix par défaut
 *   (`value` nul) ; l'action reçoit des champs cachés `brief`, `variante` et `mode`. Les choix sont gardés après un
 *   envoi, même refusé (l'état est dans React, pas dans les champs que React 19 réinitialise après l'action).
 * - Annonces (handover § 11) : les régions `status` (lancement accepté, copie) et la région `alert` (refus) sont
 *   présentes dès l'affichage, vides. Choix incomplet ou refusé (`entree_invalide`, rendu par l'action : aucune
 *   validation native) : les groupes en cause portent `aria-invalid` et sont décrits par le refus, et le focus passe au
 *   premier d'entre eux (`groupRef`). Autre issue : le focus reste sur le bouton.
 * - « Actualiser » relit la page côté serveur (`router.refresh()`) sans perdre l'état du formulaire ni le message.
 */
export function LancementP0({ modele }: { modele: ModeleLancementP0 }) {
  const [etat, envoyer, enCours] = useActionState(lancerAvecChoix, ETAT_INITIAL);
  const router = useRouter();
  const envoiEnVol = useRef(false);
  const [choix, setChoix] = useState<Choix>(AUCUN_CHOIX);
  const groupeBrief = useRef<HTMLDivElement>(null);
  const groupeVariante = useRef<HTMLDivElement>(null);
  const groupeMode = useRef<HTMLDivElement>(null);
  const groupes = useMemo<Record<NomChoix, RefObject<HTMLDivElement | null>>>(
    () => ({ brief: groupeBrief, variante: groupeVariante, mode: groupeMode }),
    [],
  );
  const etatTraite = useRef(etat);
  // Copie liée au texte copié : un autre rapport efface le message.
  const [copie, setCopie] = useState<{ readonly texte: string; readonly issue: "copie" | "copieImpossible" } | null>(null);

  const invalides = etat.statut === "entree_invalide" ? groupesInvalides(etat.envoye, choix) : new Set<NomChoix>();
  const premierInvalide = CHOIX.find((nom) => invalides.has(nom)) ?? null;

  // À chaque réponse de l'action (et seulement alors) : envoi suivant permis, focus au premier groupe en cause.
  useEffect(() => {
    if (etatTraite.current === etat) return;
    etatTraite.current = etat;
    envoiEnVol.current = false;
    if (premierInvalide !== null) groupes[premierInvalide].current?.focus();
  }, [etat, premierInvalide, groupes]);

  const surEnvoi = (evenement: FormEvent<HTMLFormElement>) => {
    if (envoiEnVol.current || enCours) {
      evenement.preventDefault();
      return;
    }
    envoiEnVol.current = true;
  };

  const copier = async (texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie({ texte, issue: "copie" });
    } catch {
      setCopie({ texte, issue: "copieImpossible" });
    }
  };

  const { suivi, rapport } = modele;
  const accepte = etat.statut === "lancee" ? t.statuts.lancee : null;
  // Brief refusé, choix complet : texte distinct de « choix incomplet » (bloquant 1 du head `fbeacd6`, 0064 point 3).
  const refus = etat.statut === "attente" || etat.statut === "lancee" ? null : briefRefuse(etat) ? t.formulaire.briefRefuse : t.statuts[etat.statut];
  const options: Record<NomChoix, { value: string; label: string }[]> = {
    brief: modele.briefs.map((brief) => ({ value: brief, label: brief })),
    variante: (["B", "A"] as const).map((variante) => ({ value: variante, label: t.formulaire.variantes[variante] })),
    mode: (["essai", "reel"] as const).map((mode) => ({ value: mode, label: t.formulaire.modes[mode] })),
  };
  const legendes: Record<NomChoix, string> = { brief: t.formulaire.brief, variante: t.formulaire.variante, mode: t.formulaire.mode };
  const copieAffichee = copie !== null && rapport !== null && copie.texte === rapport.texte ? t.rapport[copie.issue] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
        <p className="text-corps text-ink-soft">{t.intro}</p>
      </header>

      <section aria-labelledby="lancement-titre" className="flex flex-col gap-4">
        <h2 id="lancement-titre" className={TITRE_SECTION_CLASS}>
          {t.formulaire.titre}
        </h2>
        {modele.briefs.length === 0 ? (
          <p className="text-corps text-ink">{t.formulaire.aucunBrief}</p>
        ) : (
          <form action={envoyer} onSubmit={surEnvoi} className="flex flex-col gap-6">
            {CHOIX.map((nom) => (
              <div key={nom} className="flex flex-col gap-2">
                <p id={`choix-${nom}-titre`} className={LEGENDE_CLASS}>
                  {legendes[nom]}
                </p>
                <SegmentedControl
                  id={`choix-${nom}`}
                  groupRef={groupes[nom]}
                  orientation="vertical"
                  label={legendes[nom]}
                  labelledBy={`choix-${nom}-titre`}
                  options={options[nom]}
                  value={choix[nom]}
                  onChange={(valeur) => setChoix((avant) => ({ ...avant, [nom]: valeur }))}
                  invalid={invalides.has(nom)}
                  describedBy={invalides.has(nom) ? ALERTE_ID : undefined}
                />
                <input type="hidden" name={nom} value={choix[nom] ?? ""} />
              </div>
            ))}
            <Button type="submit" className={`w-full ${BOUTON_EN_COURS}`} aria-disabled={enCours || undefined}>
              {enCours ? t.formulaire.lancement : t.formulaire.lancer}
            </Button>
          </form>
        )}
        <p role="status" className={accepte ? "text-corps font-semibold text-ink" : REGION_VIDE_CLASS}>
          {accepte}
        </p>
        <p id={ALERTE_ID} role="alert" className={refus ? "text-corps font-semibold text-ink" : REGION_VIDE_CLASS}>
          {refus}
        </p>
      </section>

      <section aria-labelledby="suivi-titre" className="flex flex-col gap-4">
        <h2 id="suivi-titre" className={TITRE_SECTION_CLASS}>
          {t.suivi.titre}
        </h2>
        {suivi === null ? (
          <p className="text-corps text-ink">{t.suivi.indisponible}</p>
        ) : (
          <>
            <p className="text-corps-s text-ink-soft">
              {t.suivi.dernierePurge} : {suivi.dernierePurge === null ? t.suivi.aucunePurge : instantUtc(suivi.dernierePurge)}
            </p>
            {suivi.executions.length === 0 ? (
              <p className="text-corps text-ink">{t.suivi.aucune}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {suivi.executions.map((execution) => (
                  <li key={execution.id}>
                    <Execution execution={execution} />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <Button type="button" variant="text" size="sm" className="self-start" onClick={() => router.refresh()}>
          {t.suivi.actualiser}
        </Button>
      </section>

      {suivi === null ? null : (
        <section aria-labelledby="decompte-titre" className="flex flex-col gap-4">
          <h2 id="decompte-titre" className={TITRE_SECTION_CLASS}>
            {t.decompte.titre}
          </h2>
          <p className="text-corps-s text-ink-soft">{t.decompte.intro}</p>
          {/* Défilement horizontal possible : région focalisable et nommée (clavier). */}
          <div role="region" aria-label={t.decompte.caption} tabIndex={0} className="overflow-x-auto">
            <table className="w-full text-left text-corps-s text-ink">
              <caption className="sr-only">{t.decompte.caption}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-4">
                    {t.decompte.brief}
                  </th>
                  <th scope="col" className="py-1 pr-4">
                    {t.decompte.variante}
                  </th>
                  <th scope="col" className="py-1 pr-4">
                    {t.decompte.comptees}
                  </th>
                  <th scope="col" className="py-1">
                    {t.decompte.relances}
                  </th>
                </tr>
              </thead>
              <tbody>
                {modele.decompte.map((ligne) => (
                  <tr key={`${ligne.brief}-${ligne.variante}`}>
                    <td className="py-1 pr-4 break-all">{ligne.brief}</td>
                    <td className="py-1 pr-4">{ligne.variante}</td>
                    <td className="py-1 pr-4 tabular-nums">
                      {ligne.comptees} / {ligne.compteesMax}
                    </td>
                    <td className="py-1 tabular-nums">
                      {ligne.relances} / {ligne.relancesMax}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rapport === null ? null : (
        <section aria-labelledby="rapport-titre" className="flex flex-col gap-4">
          <h2 id="rapport-titre" className={TITRE_SECTION_CLASS}>
            {t.rapport.titreSection}
          </h2>
          <div role="region" aria-label={t.rapport.texteAria} tabIndex={0} className="overflow-x-auto rounded-control bg-muted p-4">
            <pre className="text-corps-s whitespace-pre-wrap text-ink tabular-nums">{rapport.texte}</pre>
          </div>
          {/* Étapes avec et sans lieu vérifié : sur la page seulement, jamais dans le texte copié (0117 § 4). */}
          <p className="text-corps-s text-ink tabular-nums">
            {rapport.etapes === null
              ? t.rapport.etapesNonRelevees
              : format(t.rapport.etapes, { avec: rapport.etapes.avecPlaceId, sans: rapport.etapes.sansPlaceId })}
          </p>
          <Button type="button" variant="secondary" className="w-full" onClick={() => void copier(rapport.texte)}>
            {t.rapport.copier}
          </Button>
        </section>
      )}
      {/* Annonce de la copie : présente dès l'affichage, vide, hors de la section du rapport (qui peut disparaître). */}
      <p role="status" className={copieAffichee ? "text-corps-s font-semibold text-ink" : REGION_VIDE_CLASS}>
        {copieAffichee}
      </p>
    </main>
  );
}
