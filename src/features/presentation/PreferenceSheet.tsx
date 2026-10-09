"use client";

import { useRef, useState } from "react";

import { Button, Chip } from "@/components/ligne";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import { PreferenceReasonSchema, type PreferenceAnswer, type PreferencePrompt, type PreferenceReason } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.presentation;

/** Raisons, dans l'ordre imposé (handover § 6 écran 14, § 10). */
const REASONS: readonly PreferenceReason[] = PreferenceReasonSchema.options;

export function promptTitle(prompt: PreferencePrompt): string {
  if (prompt.kind === "distance") {
    return t.question.distance;
  }
  const label = prompt.category === "restaurant" ? undefined : t.categories[prompt.category];
  return format(t.question.categorie, { categorie: label ?? prompt.category });
}

export interface PreferenceSheetProps {
  /** Question ouverte ; `null` ferme la feuille. */
  prompt: PreferencePrompt | null;
  onAnswer: (answer: PreferenceAnswer) => void;
  /** Fermeture sans réponse (Échap, « Fermer », toucher hors de la feuille) : rien n'est enregistré. */
  onDismiss: () => void;
  /** Rend le focus au paquet à la fermeture. */
  onReturnFocus: () => void;
}

/**
 * Écran 7 « Confirmer une préférence » : feuille modale, raison facultative (une seule `Chip` à la
 * fois), « Oui » et « Non ». Mise en page provisoire (F6-Q1).
 */
export function PreferenceSheet({ prompt, onAnswer, onDismiss, onReturnFocus }: PreferenceSheetProps) {
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => (open ? undefined : onDismiss())}>
      {prompt ? (
        <PromptContent
          key={prompt.kind === "category" ? prompt.category : prompt.kind}
          prompt={prompt}
          onAnswer={onAnswer}
          onReturnFocus={onReturnFocus}
        />
      ) : null}
    </Dialog>
  );
}

function PromptContent({
  prompt,
  onAnswer,
  onReturnFocus,
}: {
  prompt: PreferencePrompt;
  onAnswer: (answer: PreferenceAnswer) => void;
  onReturnFocus: () => void;
}) {
  const [reason, setReason] = useState<PreferenceReason | undefined>(undefined);
  const title = useRef<HTMLHeadingElement>(null);
  const answer = (value: PreferenceAnswer["answer"]) => onAnswer(reason ? { answer: value, reason } : { answer: value });

  return (
    <DialogSheet
      data-sheet="question"
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        title.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onReturnFocus();
      }}
    >
      <DialogTitle ref={title} tabIndex={-1} className="text-section font-extrabold text-ink">
        {promptTitle(prompt)}
      </DialogTitle>
      {prompt.kind === "category" ? (
        <div role="group" aria-labelledby="question-raison" className="flex flex-col gap-2">
          <p id="question-raison" className="text-corps-s text-ink-soft">
            {t.question.raison}
          </p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((code) => (
              <Chip
                key={code}
                label={t.raisons[code]}
                data-reason={code}
                selected={reason === code}
                onSelectedChange={(selected) => setReason(selected ? code : undefined)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex gap-3 pt-2">
        <Button className="flex-1" onClick={() => answer("yes")}>
          {t.question.oui}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => answer("no")}>
          {t.question.non}
        </Button>
      </div>
      <DialogClose asChild>
        <Button variant="text" size="sm" tone="soft" className="self-center">
          {t.question.fermer}
        </Button>
      </DialogClose>
    </DialogSheet>
  );
}
