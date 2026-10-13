"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { STORY_LENGTH } from "@/contracts/values";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { structureBrief } from "@/server/actions/creation";

import { TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { formatNombre } from "@/lib/nombre";
import { describedBy, EMPTY_LIVE_REGION_CLASS, errorId, FieldMessage, helpId, INPUT_CLASS } from "./fields";
import type { StageProps } from "./stage";
import { storyError, toBriefRequest } from "./validation";

const r = messages.creation.ecran2.recit;

const STORY_ID = "champ-story";
const TITLE_ID = "recit-titre";
const COUNTER_ID = `${STORY_ID}-compteur`;

/** Seuils où le compteur est annoncé (0018, « Compteur de caractères ») : 90 % du plafond, puis le plafond. */
const ANNOUNCED_LENGTHS = new Set([STORY_LENGTH.max * 0.9, STORY_LENGTH.max]);

/** Texte du compteur, « {n} sur 1 000 caractères », nombres au format suisse. */
export function counterText(length: number): string {
  return format(r.compteur, { n: formatNombre(length), max: formatNombre(STORY_LENGTH.max) });
}

/**
 * État « Récit » de l'écran 2 (F8-PO-4, 0018 § 16) : zone de texte nommée par le titre, aide, erreur, compteur
 * (dans cet ordre dans `aria-describedby`). « Préparer mon brief » appelle `structureBrief` (simulé en phase 0) ;
 * « Remplir moi-même » passe à la vérification sans appel ni déduction. Le récit reste en mémoire de l'onglet.
 */
export function BriefStory({ focusTitle, onStageChange }: StageProps) {
  const { state, dispatch } = useDraft();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Numéro de la demande en cours : « Remplir moi-même », « Retour » (démontage) ou une nouvelle demande le changent,
  // et une réponse arrivée ensuite est ignorée (elle n'écrase pas le choix de la personne).
  const attempt = useRef(0);

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const length = state.story.length;

  async function prepare() {
    if (pending) return;
    if (storyError(state.story)) {
      setError(true);
      areaRef.current?.focus();
      return;
    }
    setError(false);
    setFailed(false);
    setPending(true);
    attempt.current += 1;
    const current = attempt.current;
    let succeeded = false;
    try {
      const result = await structureBrief(toBriefRequest(state.trip, state.story));
      if (attempt.current !== current) return;
      if (result.ok) {
        succeeded = true;
        onStageChange();
        dispatch({ type: "inferred", brief: result.value });
      }
    } catch {
      // Erreur réseau ou serveur : même bandeau qu'une erreur de structuration.
    }
    if (attempt.current !== current) return;
    if (!succeeded) {
      setPending(false);
      setFailed(true);
    }
  }

  function fillMyself() {
    attempt.current += 1;
    onStageChange();
    dispatch({ type: "fillMyself" });
  }

  return (
    <>
      <h1 ref={titleRef} id={TITLE_ID} tabIndex={-1} className={TITLE_CLASS}>
        {r.titre}
      </h1>
      <div className="flex flex-col gap-2">
        <p id={helpId(STORY_ID)} className="text-corps-s text-ink-soft">
          {r.aide}
        </p>
        <textarea
          ref={areaRef}
          id={STORY_ID}
          value={state.story}
          maxLength={STORY_LENGTH.max}
          rows={8}
          aria-labelledby={TITLE_ID}
          aria-describedby={describedBy(helpId(STORY_ID), error && errorId(STORY_ID), COUNTER_ID)}
          aria-invalid={error || undefined}
          onChange={(event) => dispatch({ type: "story", story: event.target.value })}
          className={cn(INPUT_CLASS, "h-auto min-h-40 resize-none py-3")}
        />
        <FieldMessage id={errorId(STORY_ID)} message={error ? r.erreur : null} />
        <p id={COUNTER_ID} className="self-end text-legende text-ink-soft tabular-nums">
          {counterText(length)}
        </p>
        {/* Le compteur visible n'est pas une région live : seuls 900 et 1 000 caractères sont annoncés. */}
        <p aria-live="polite" className="sr-only">
          {ANNOUNCED_LENGTHS.has(length) ? counterText(length) : null}
        </p>
      </div>
      <div role="alert" className={failed ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {failed ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={r.echec}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={prepare}>
                  {r.reessayer}
                </Button>
                <Button variant="text" size="sm" onClick={fillMyself}>
                  {r.remplirMoiMeme}
                </Button>
              </div>
            }
          />
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button
          className="w-full aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft"
          aria-disabled={pending || undefined}
          onClick={prepare}
        >
          {r.preparer}
        </Button>
        <p role="status" className={pending ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
          {pending ? r.attente : null}
        </p>
        <Button variant="text" onClick={fillMyself}>
          {r.remplirMoiMeme}
        </Button>
      </div>
    </>
  );
}
