"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { Chip } from "@/components/ligne/Chip";
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

const IDEAS_ID = "recit-idees";
const IDEAS_FULL_ID = `${IDEAS_ID}-plein`;
const IDEAS: readonly Idea[] = r.idees.liste;

/** Une idée du récit (`creation.ecran2.recit.idees.liste`) ; `groupe` : idées exclusives (« qui part »). */
export interface Idea {
  label: string;
  phrase: string;
  groupe?: string;
}

/** Le récit contient-il déjà la phrase de cette idée ? */
export function hasIdea(story: string, phrase: string): boolean {
  return story.includes(phrase);
}

/** Retire la première occurrence de la phrase et l'espace qui la sépare du reste ; le reste du récit est intact. */
export function removePhrase(story: string, phrase: string): string {
  const at = story.indexOf(phrase);
  if (at < 0) return story;
  let start = at;
  let end = at + phrase.length;
  if (story[start - 1] === " ") start -= 1;
  else if (story[end] === " ") end += 1;
  return story.slice(0, start) + story.slice(end);
}

/** Ajoute la phrase à la fin du récit, après une espace si le récit ne finit pas déjà par un blanc. */
function appendPhrase(story: string, phrase: string): string {
  if (story.trim() === "") return phrase;
  return /\s$/.test(story) ? `${story}${phrase}` : `${story} ${phrase}`;
}

/**
 * Touche d'une idée (décision 0134 § 3) : retire sa phrase si elle est dans le récit ; sinon l'ajoute à la fin, après
 * avoir retiré celles des autres idées du même groupe (on part à deux, en famille ou entre amis, pas les trois). Rien
 * ne change si le récit dépasserait le plafond de caractères.
 */
export function toggleIdea(story: string, idea: Idea, ideas: readonly Idea[] = []): string {
  if (hasIdea(story, idea.phrase)) return removePhrase(story, idea.phrase);
  const others = idea.groupe ? ideas.filter((other) => other !== idea && other.groupe === idea.groupe) : [];
  const joined = appendPhrase(
    others.reduce((current, other) => removePhrase(current, other.phrase), story),
    idea.phrase,
  );
  return joined.length > STORY_LENGTH.max ? story : joined;
}

/** Texte du compteur, « {n} sur 1 000 caractères », nombres au format suisse. */
export function counterText(length: number): string {
  return format(r.compteur, { n: formatNombre(length), max: formatNombre(STORY_LENGTH.max) });
}

export interface BriefStoryProps extends StageProps {
  /**
   * Site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, critère 1, et D2) : « Continuer avec mon récit »
   * mène à la vérification sans appel ni déduction, récit gardé, sans bandeau ; une phrase d'aide le dit.
   */
  essai?: boolean;
}

/**
 * État « Récit » de l'écran 2 (F8-PO-4, 0018 § 16) : zone de texte nommée par le titre, aide, erreur, compteur
 * (dans cet ordre dans `aria-describedby`). « Continuer avec mon récit » appelle `structureBrief` (simulé en phase 0) ;
 * « Remplir moi-même » passe à la vérification sans appel ni déduction. Le récit reste en mémoire de l'onglet.
 */
export function BriefStory({ focusTitle, onStageChange, essai = false }: BriefStoryProps) {
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
  const ideasFull = IDEAS.some((idea) => !hasIdea(state.story, idea.phrase) && toggleIdea(state.story, idea, IDEAS) === state.story);

  async function prepare() {
    if (pending) return;
    if (storyError(state.story)) {
      setError(true);
      areaRef.current?.focus();
      return;
    }
    setError(false);
    setFailed(false);
    if (essai) {
      // Site d'essai (D2) : aucune structuration ; le récit, déjà dans le brouillon, ira tel quel à l'IA (lot 3).
      fillMyself();
      return;
    }
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
        {/* Site d'essai : l'envoi et la conservation, puis la vérification dans un second paragraphe (une idée par paragraphe). */}
        <div id={helpId(STORY_ID)} className="flex flex-col gap-2 text-corps-s text-ink-soft">
          <p>
            {r.aide}
            {essai ? ` ${r.essai}` : null}
          </p>
          {essai ? <p>{r.essaiVerification}</p> : null}
        </div>
        <textarea
          ref={areaRef}
          id={STORY_ID}
          value={state.story}
          maxLength={STORY_LENGTH.max}
          rows={8}
          aria-labelledby={TITLE_ID}
          aria-describedby={describedBy(helpId(STORY_ID), error && errorId(STORY_ID), COUNTER_ID)}
          aria-invalid={error || undefined}
          placeholder={r.exemple}
          onChange={(event) => dispatch({ type: "story", story: event.target.value })}
          className={cn(INPUT_CLASS, "h-auto min-h-40 resize-none py-3 placeholder:text-ink-soft")}
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
      {/* Idées (décision 0134 § 3) : chaque chip ajoute sa phrase au récit, ou la retire ; état « choisi » = phrase présente.
          Une idée qui ne tiendrait plus dans le récit est indisponible et décrite par le message « plein ». */}
      <div role="group" aria-labelledby={IDEAS_ID} aria-describedby={helpId(IDEAS_ID)} className="flex flex-col gap-2">
        <h2 id={IDEAS_ID} className="text-section font-extrabold text-ink">
          {r.idees.titre}
        </h2>
        <p id={helpId(IDEAS_ID)} className="text-corps-s text-ink-soft">
          {r.idees.aide}
        </p>
        <div className="flex flex-wrap gap-2">
          {IDEAS.map((idea) => {
            const selected = hasIdea(state.story, idea.phrase);
            const next = toggleIdea(state.story, idea, IDEAS);
            const unavailable = !selected && next === state.story;
            return (
              <Chip
                key={idea.label}
                label={idea.label}
                selected={selected}
                aria-disabled={unavailable || undefined}
                aria-describedby={unavailable ? IDEAS_FULL_ID : undefined}
                onSelectedChange={() => dispatch({ type: "story", story: next })}
              />
            );
          })}
        </div>
        <p id={IDEAS_FULL_ID} className={ideasFull ? "text-corps-s text-ink-soft" : "hidden"}>
          {r.idees.plein}
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
          {essai ? r.verifier : r.preparer}
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
