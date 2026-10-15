"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ligne/Button";
import type { ExecutionSuivie, ModeleLancementP0 } from "@/contracts/prototype-suivi";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";
import { lancerExecutionP0Action, type EtatLancementP0 } from "@/server/actions/p0-lancement";

const t = messages.prototype.lancement;

const ETAT_INITIAL: EtatLancementP0 = { statut: "attente" };

/** Bouton pendant le lancement : mêmes couleurs que `disabled:` de `Button`, sans retirer le bouton du focus. */
const BOUTON_EN_COURS = "aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft";
const OPTION_CLASS = "flex min-h-11 items-center gap-3 text-corps text-ink";
const LEGENDE_CLASS = "mb-2 text-corps font-bold text-ink";
const TITRE_SECTION_CLASS = "text-corps font-extrabold text-ink";

/** Durée lisible (minutes et secondes), à partir de millisecondes. */
function duree(ms: number): string {
  const secondes = Math.floor(ms / 1000);
  return `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, "0")} s`;
}

/** Coût en USD, à partir de micro-USD (deux décimales, virgule décimale). */
const usd = (micros: number) => `${(micros / 1_000_000).toFixed(2).replace(".", ",")} USD`;

function Execution({ execution }: { execution: ExecutionSuivie }) {
  const lignes: [string, string][] = [
    [t.formulaire.brief, execution.brief],
    [t.formulaire.variante, execution.variante],
    [t.formulaire.mode, t.rapport.modes[execution.mode]],
    [t.suivi.statut, t.suivi.statuts[execution.statut]],
    ...(execution.phase === null ? [] : [[t.suivi.phase, execution.phase] as [string, string]]),
    // Coût et durée : pendant l'exécution seulement (S4 ; question ouverte 8 de 0046).
    ...(execution.coutModelesMicros === null ? [] : [[t.suivi.cout, usd(execution.coutModelesMicros)] as [string, string]]),
    ...(execution.ecouleMs === null ? [] : [[t.suivi.duree, duree(execution.ecouleMs)] as [string, string]]),
    ...(execution.codeArret === null ? [] : [[t.suivi.codeArret, execution.codeArret] as [string, string]]),
    [t.suivi.jourQuota, execution.jourQuota],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t-(length:--ligne-trait-controle) border-line pt-3 text-corps-s">
      {lignes.map(([terme, valeur]) => (
        <div key={terme} className="contents">
          <dt className="text-ink-soft">{terme}</dt>
          <dd className="min-w-0 break-words text-ink">{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Page de lancement des exécutions réelles (décision 0055, section 8, ligne P0r3d ; spécification P0-suite-2,
 * « Page de lancement ») : choix du brief, de la variante et de la nature, lancement par l'action serveur, suivi,
 * décompte par brief et variante, date de la dernière purge, rapport de la dernière exécution finie avec « Copier le
 * rapport » (D24 : aucune donnée Google, critères en oui ou non).
 *
 * - Un seul envoi à la fois (chaque lancement réservé consomme le jour) : un second envoi est ignoré tant que le premier
 *   n'a pas répondu ; le bouton reste focalisable, `aria-disabled`, libellé « Lancement… ».
 * - Annonces (handover § 11) : la région `status` du résultat est présente dès l'affichage, vide ; celle de la copie
 *   aussi. Aucun choix par défaut : brief, variante et nature sont obligatoires (`required`).
 */
export function LancementP0({ modele }: { modele: ModeleLancementP0 }) {
  const [etat, envoyer, enCours] = useActionState(lancerExecutionP0Action, ETAT_INITIAL);
  const envoiEnVol = useRef(false);
  const [copie, setCopie] = useState<"copie" | "copieImpossible" | null>(null);

  useEffect(() => {
    envoiEnVol.current = false;
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
      setCopie("copie");
    } catch {
      setCopie("copieImpossible");
    }
  };

  const { suivi, rapport } = modele;
  const statut = etat.statut === "attente" ? null : t.statuts[etat.statut];

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
              {modele.briefs.map((brief) => (
                <label key={brief} className={OPTION_CLASS}>
                  <input type="radio" name="brief" value={brief} required className="size-5 shrink-0" />
                  {brief}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className={LEGENDE_CLASS}>{t.formulaire.variante}</legend>
              {(["B", "A"] as const).map((variante) => (
                <label key={variante} className={OPTION_CLASS}>
                  <input type="radio" name="variante" value={variante} required className="size-5 shrink-0" />
                  {t.formulaire.variantes[variante]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className={LEGENDE_CLASS}>{t.formulaire.mode}</legend>
              {(["essai", "reel"] as const).map((mode) => (
                <label key={mode} className={OPTION_CLASS}>
                  <input type="radio" name="mode" value={mode} required className="size-5 shrink-0" />
                  {t.formulaire.modes[mode]}
                </label>
              ))}
            </fieldset>
            <Button type="submit" className={`w-full ${BOUTON_EN_COURS}`} aria-disabled={enCours || undefined}>
              {enCours ? t.formulaire.lancement : t.formulaire.lancer}
            </Button>
          </form>
        )}
        <p role="status" className={statut ? "text-corps font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
          {statut}
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
              {t.suivi.dernierePurge} : {suivi.dernierePurge ?? t.suivi.aucunePurge}
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
            <a href="/prototype/executions" className="min-h-11 self-start py-2 text-corps font-bold text-ink underline">
              {t.suivi.actualiser}
            </a>
          </>
        )}
      </section>

      {suivi === null ? null : (
        <section aria-labelledby="decompte-titre" className="flex flex-col gap-4">
          <h2 id="decompte-titre" className={TITRE_SECTION_CLASS}>
            {t.decompte.titre}
          </h2>
          <p className="text-corps-s text-ink-soft">{t.decompte.intro}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-corps-s text-ink">
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
                    <td className="py-1 pr-4">
                      {ligne.comptees} / {ligne.compteesMax}
                    </td>
                    <td className="py-1">
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
          <pre className="overflow-x-auto rounded-control bg-muted p-4 text-corps-s whitespace-pre-wrap text-ink">{rapport.texte}</pre>
          <Button type="button" variant="secondary" className="w-full" onClick={() => void copier(rapport.texte)}>
            {t.rapport.copier}
          </Button>
          <p role="status" className={copie ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
            {copie ? t.rapport[copie] : null}
          </p>
        </section>
      )}
    </main>
  );
}
