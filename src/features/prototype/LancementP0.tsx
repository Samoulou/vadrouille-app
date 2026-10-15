"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ligne/Button";
import type { ExecutionSuivie, ModeleLancementP0 } from "@/contracts/prototype-suivi";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { formatDuree } from "@/lib/duree";
import { lancerExecutionP0Action, type EtatLancementP0 } from "@/server/actions/p0-lancement";

const t = messages.prototype.lancement;

const ETAT_INITIAL: EtatLancementP0 = { statut: "attente" };

/** Bouton pendant le lancement : mêmes couleurs que `disabled:` de `Button`, sans retirer le bouton du focus. */
const BOUTON_EN_COURS = "aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft";
/**
 * Choix unique : contrôle natif, sélection à la couleur `line` (`accent-line`). Aucun composant Ligne de choix unique
 * n'existe ; décision de forme 0064, point 2.
 */
const RADIO_CLASS = "size-5 shrink-0 accent-line";
const OPTION_CLASS = "flex min-h-11 items-center gap-3 text-corps text-ink";
const LEGENDE_CLASS = "mb-2 text-corps font-bold text-ink";
const TITRE_SECTION_CLASS = "text-section font-extrabold text-ink";
/** Région d'annonce vide, hors du flux (même règle que les formulaires de création), présente dès l'affichage. */
const REGION_VIDE_CLASS = "absolute";

const ALERTE_ID = "lancement-alerte";

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
 * - Annonces (handover § 11) : les régions `status` (lancement accepté, copie) et la région `alert` (refus) sont
 *   présentes dès l'affichage, vides. Choix incomplet (`entree_invalide`) : le refus est relié aux choix
 *   (`aria-invalid`, `aria-describedby`) et le focus passe au premier choix. Autre issue : le focus reste sur le bouton.
 * - « Actualiser » relit la page côté serveur (`router.refresh()`) sans perdre l'état du formulaire ni le message.
 * - Aucun choix par défaut : brief, variante et nature sont obligatoires (`required`).
 */
export function LancementP0({ modele }: { modele: ModeleLancementP0 }) {
  const [etat, envoyer, enCours] = useActionState(lancerExecutionP0Action, ETAT_INITIAL);
  const router = useRouter();
  const envoiEnVol = useRef(false);
  const premierChoix = useRef<HTMLInputElement>(null);
  // Copie liée au texte copié : un autre rapport efface le message.
  const [copie, setCopie] = useState<{ readonly texte: string; readonly issue: "copie" | "copieImpossible" } | null>(null);

  useEffect(() => {
    envoiEnVol.current = false;
    if (etat.statut === "entree_invalide") premierChoix.current?.focus();
  }, [etat]);

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
  const refus = etat.statut === "attente" || etat.statut === "lancee" ? null : t.statuts[etat.statut];
  const choixInvalide = etat.statut === "entree_invalide";
  const attributsChoix = { required: true, "aria-invalid": choixInvalide || undefined, "aria-describedby": choixInvalide ? ALERTE_ID : undefined };
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
            <fieldset>
              <legend className={LEGENDE_CLASS}>{t.formulaire.brief}</legend>
              {modele.briefs.map((brief, rang) => (
                <label key={brief} className={OPTION_CLASS}>
                  <input ref={rang === 0 ? premierChoix : undefined} type="radio" name="brief" value={brief} className={RADIO_CLASS} {...attributsChoix} />
                  {brief}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className={LEGENDE_CLASS}>{t.formulaire.variante}</legend>
              {(["B", "A"] as const).map((variante) => (
                <label key={variante} className={OPTION_CLASS}>
                  <input type="radio" name="variante" value={variante} className={RADIO_CLASS} {...attributsChoix} />
                  {t.formulaire.variantes[variante]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className={LEGENDE_CLASS}>{t.formulaire.mode}</legend>
              {(["essai", "reel"] as const).map((mode) => (
                <label key={mode} className={OPTION_CLASS}>
                  <input type="radio" name="mode" value={mode} className={RADIO_CLASS} {...attributsChoix} />
                  {t.formulaire.modes[mode]}
                </label>
              ))}
            </fieldset>
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
