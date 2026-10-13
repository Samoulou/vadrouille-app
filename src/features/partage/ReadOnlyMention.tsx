import * as messages from "@/i18n/messages";

/** Mention de lecture seule, en tête du panneau de `RP` et de `RPJ` (spécification F10, F10c ; provisoire, UX/UI). */
export function ReadOnlyMention() {
  return (
    <p data-part="mention-partage" className="text-corps-s font-bold text-ink-soft">
      {messages.partage.vue.mention}
    </p>
  );
}
