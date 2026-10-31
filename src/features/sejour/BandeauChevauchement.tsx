import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { DayLineItem, Stop } from "@/contracts";
import { chevauchementDuChangement } from "@/domain/changement-de-ville";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const t = messages.sejour.journee.chevauchement;

/**
 * Texte du bandeau de chevauchement (spécification M4-suite § 6), ou `null` sans engagement qui chevauche la ligne
 * « Vers {ville} ». Le calcul est celui du domaine (`chevauchementDuChangement`, § 3.5 point 4, T-M4S-1) : intervalle
 * affiché, sans les marges ; arrivée « à confirmer » : aucun bandeau. Un engagement : son heure de début et son libellé ;
 * plusieurs : leur nombre. Départ estimé : « d'après la durée estimée » en fin de phrase.
 */
export function messageDuChevauchement(items: readonly DayLineItem[], events: readonly Pick<Stop, "name" | "start" | "end">[]): string | null {
  const chevauchement = chevauchementDuChangement(items, events);
  if (chevauchement === undefined) return null;
  const estime = chevauchement.source === "estimated";
  const [seul] = chevauchement.engagements;
  if (chevauchement.engagements.length === 1 && seul !== undefined) {
    return format(estime ? t.unEstime : t.un, { heure: seul.start, libelle: seul.name, ville: chevauchement.vers });
  }
  return format(estime ? t.plusieursEstime : t.plusieurs, { n: chevauchement.engagements.length, ville: chevauchement.vers });
}

export interface BandeauChevauchementProps {
  items: readonly DayLineItem[];
  events: readonly Stop[];
  /** Amène le focus sur la région « Événements du jour » de la Journée (`tabIndex={-1}`). */
  onShowEvents: () => void;
}

/**
 * Bandeau de chevauchement de la Journée d'un changement de ville (spécification M4-suite § 5, décision UX-M4S-A) :
 * `StatusBanner` `overlap` (`role="status"`, filet `ink-soft`), action « Voir les événements du jour ». Chargé à la demande
 * par la Journée (`lazy`, décision 0152 § 4), seulement le jour d'un changement de ville qui a des événements : un voyage à
 * une ville n'en paie pas le JavaScript initial.
 */
export function BandeauChevauchement({ items, events, onShowEvents }: BandeauChevauchementProps) {
  const message = messageDuChevauchement(items, events);
  if (message === null) return null;
  return (
    <StatusBanner
      kind="overlap"
      message={message}
      action={
        <Button variant="text" size="sm" onClick={onShowEvents}>
          {t.action}
        </Button>
      }
    />
  );
}
